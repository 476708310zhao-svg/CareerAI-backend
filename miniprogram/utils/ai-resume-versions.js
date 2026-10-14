const api = require('./api-resumes.js');

const LOCAL_ID = 'local_online_resume';

function safeGetStorage(key, fallback) {
  try {
    const value = wx.getStorageSync(key);
    return value || fallback;
  } catch (e) {
    return fallback;
  }
}

function hasToken() {
  try {
    return !!wx.getStorageSync('token');
  } catch (e) {
    return false;
  }
}

function clone(value) {
  try {
    return JSON.parse(JSON.stringify(value || {}));
  } catch (e) {
    return {};
  }
}

function textOfResume(resume) {
  const r = resume || {};
  const b = r.basicInfo || {};
  const parts = [
    b.name,
    b.title,
    b.location,
    r.summary,
    (r.skills || []).join(' ')
  ];
  (r.workExp || []).forEach(item => parts.push(item.company, item.role || item.title, item.duration, item.desc));
  (r.projects || []).forEach(item => parts.push(item.name, item.role, item.desc));
  (r.education || []).forEach(item => parts.push(item.school, item.degree, item.major));
  return parts.filter(Boolean).join(' ');
}

function hasResumeContent(resume) {
  return textOfResume(resume).length > 20;
}

function getResumeDisplayName(resume, fallback) {
  const r = resume || {};
  const basic = r.basicInfo || {};
  return r.name || basic.name || basic.title || fallback || '当前在线简历';
}

function normalizeVersion(item, index) {
  const version = item || {};
  const id = String(version.id || version.resumeId || version.clientId || index || LOCAL_ID);
  const name = version.name || version.title || '我的简历';
  const targetRole = version.targetRole || version.target_role || '';
  const isDefault = !!(version.isDefault || version.is_default);
  const labelParts = [name];
  if (targetRole) labelParts.push(targetRole);
  if (isDefault) labelParts.push('默认');
  return Object.assign({}, version, {
    id,
    name,
    targetRole,
    isDefault,
    _label: labelParts.join(' · ')
  });
}

function localSelection() {
  const resume = clone(safeGetStorage('onlineResume', {}));
  const name = getResumeDisplayName(resume, '本地在线简历');
  const targetRole = resume && resume.basicInfo && resume.basicInfo.title ? resume.basicInfo.title : '';
  const version = {
    id: LOCAL_ID,
    name,
    targetRole,
    isDefault: true,
    source: 'local',
    _label: targetRole ? `${name} · ${targetRole}` : name
  };
  return {
    source: 'local',
    hasResume: hasResumeContent(resume),
    list: [version],
    labels: [version._label],
    currentId: LOCAL_ID,
    currentIndex: 0,
    currentName: name,
    currentTargetRole: targetRole,
    currentResume: resume
  };
}

function buildSelection(list, selected, resume, detail) {
  const versions = (list || []).map(normalizeVersion);
  const selectedId = String(selected && selected.id || LOCAL_ID);
  const currentIndex = Math.max(0, versions.findIndex(item => String(item.id) === selectedId));
  const currentVersion = versions[currentIndex] || normalizeVersion(selected || {}, 0);
  const detailData = detail && detail.data ? detail.data : {};
  const currentResume = clone(resume || detailData.data || {});
  const currentName = detailData.name || currentVersion.name || getResumeDisplayName(currentResume, '当前在线简历');
  const currentTargetRole = detailData.targetRole || currentVersion.targetRole || '';
  const nextVersions = versions.length ? versions : [Object.assign({}, currentVersion, { name: currentName, targetRole: currentTargetRole })];
  const labels = nextVersions.map(item => item._label || item.name);
  return {
    source: 'server',
    hasResume: hasResumeContent(currentResume),
    list: nextVersions,
    labels,
    currentId: currentVersion.id,
    currentIndex,
    currentName,
    currentTargetRole,
    currentResume
  };
}

function fetchResumeVersions() {
  if (!hasToken()) return Promise.resolve(localSelection());
  return api.getResumes().then(res => {
    if (!res || res.code !== 0 || !Array.isArray(res.data) || !res.data.length) {
      return localSelection();
    }
    const list = res.data.map(normalizeVersion);
    const selected = list.find(item => item.isDefault) || list[0];
    return api.getResume(selected.id).then(detail => {
      if (detail && detail.code === 0 && detail.data) {
        return buildSelection(list, selected, detail.data.data || {}, detail);
      }
      return buildSelection(list, selected, safeGetStorage('onlineResume', {}), null);
    }).catch(() => buildSelection(list, selected, safeGetStorage('onlineResume', {}), null));
  }).catch(() => localSelection());
}

function loadResumeVersion(id, knownList) {
  const targetId = String(id || '');
  if (!targetId || targetId === LOCAL_ID || !hasToken()) return Promise.resolve(localSelection());
  const list = Array.isArray(knownList) ? knownList.map(normalizeVersion) : [];
  const selected = list.find(item => String(item.id) === targetId) || normalizeVersion({ id: targetId }, 0);
  return api.getResume(targetId).then(detail => {
    if (detail && detail.code === 0 && detail.data) {
      return buildSelection(list.length ? list : [selected], selected, detail.data.data || {}, detail);
    }
    return buildSelection(list.length ? list : [selected], selected, safeGetStorage('onlineResume', {}), null);
  }).catch(() => buildSelection(list.length ? list : [selected], selected, safeGetStorage('onlineResume', {}), null));
}

module.exports = {
  LOCAL_ID,
  fetchResumeVersions,
  loadResumeVersion,
  textOfResume,
  hasResumeContent,
  getResumeDisplayName,
  localSelection
};
