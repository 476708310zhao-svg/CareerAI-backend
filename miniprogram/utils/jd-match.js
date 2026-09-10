const STORAGE_KEY = 'jdMatchReports';
const apiClient = require('./api-client.js');

const DEFAULT_KEYWORDS = [
  'Python', 'JavaScript', 'TypeScript', 'React', 'Node.js', 'SQL', 'A/B Testing',
  'Dashboard', 'User Research', 'Data Analysis', 'Machine Learning', 'AWS',
  'GCP', 'Docker', 'Kubernetes', 'Communication', 'Leadership'
];

function readList() {
  try {
    const list = wx.getStorageSync(STORAGE_KEY);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function hasToken() {
  try {
    return !!wx.getStorageSync('token');
  } catch (e) {
    return false;
  }
}

function normalizeRemoteReport(item) {
  const suggestions = item.suggestions || [];
  const recommendText = item.recommendText || suggestions[0] || '';
  return {
    id: item.clientId || item.id || ('match_' + Date.now()),
    serverId: item.id || '',
    jobId: item.jobId || '',
    jobTitle: item.jobTitle || '',
    company: item.company || '',
    jobLink: item.jobLink || '',
    resumeName: item.resumeName || '当前在线简历',
    resumeVersionId: item.resumeVersionId || '',
    score: item.score || 0,
    matchedKeywords: item.matchedKeywords || [],
    missingKeywords: item.missingKeywords || [],
    projectSuggestion: item.projectSuggestion || '',
    atsRisk: item.atsRisk || '',
    suggestions,
    recommendText,
    interviewPrep: item.interviewPrep || [],
    jdText: item.jdText || '',
    resumeText: item.resumeText || '',
    useOnlineResume: item.useOnlineResume !== false,
    createdAt: item.createdAt || ''
  };
}

function saveList(list) {
  try {
    wx.setStorageSync(STORAGE_KEY, list || []);
  } catch (e) {}
}

function normalizeLocalReport(report) {
  const item = report || {};
  const suggestions = item.suggestions || [];
  return Object.assign({}, item, {
    id: item.id || item.clientId || ('match_' + Date.now()),
    serverId: item.serverId || '',
    jobId: item.jobId || '',
    jobTitle: item.jobTitle || '',
    company: item.company || '',
    jobLink: item.jobLink || '',
    resumeName: item.resumeName || '当前在线简历',
    resumeVersionId: item.resumeVersionId || '',
    score: Number(item.score || 0),
    matchedKeywords: Array.isArray(item.matchedKeywords) ? item.matchedKeywords : [],
    missingKeywords: Array.isArray(item.missingKeywords) ? item.missingKeywords : [],
    projectSuggestion: item.projectSuggestion || '',
    atsRisk: item.atsRisk || '',
    suggestions,
    recommendText: item.recommendText || suggestions[0] || '',
    interviewPrep: Array.isArray(item.interviewPrep) ? item.interviewPrep : [],
    jdText: item.jdText || '',
    resumeText: item.resumeText || '',
    useOnlineResume: item.useOnlineResume !== false,
    createdAt: item.createdAt || new Date().toISOString()
  });
}

function reportKey(report) {
  const item = report || {};
  return String(item.id || item.clientId || item.serverId || '');
}

function mergeReports(local, remote) {
  const merged = [];
  const seen = {};
  (remote || []).concat(local || []).forEach(item => {
    const normalized = normalizeLocalReport(item);
    const key = reportKey(normalized);
    if (!key || seen[key]) return;
    seen[key] = true;
    merged.push(normalized);
  });
  return merged
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, 50);
}

function textOfResume(resume) {
  const r = resume || {};
  const b = r.basicInfo || {};
  const parts = [
    b.name, b.title, b.location, r.summary,
    (r.skills || []).join(' ')
  ];
  (r.workExp || []).forEach(item => parts.push(item.company, item.role || item.title, item.desc));
  (r.projects || []).forEach(item => parts.push(item.name, item.role, item.desc));
  (r.education || []).forEach(item => parts.push(item.school, item.degree, item.major));
  return parts.filter(Boolean).join(' ');
}

function normalizeText(text) {
  return String(text || '').toLowerCase();
}

function extractKeywords(text) {
  const lower = normalizeText(text);
  const found = DEFAULT_KEYWORDS.filter(keyword => lower.includes(keyword.toLowerCase()));
  const extra = String(text || '')
    .split(/[^A-Za-z+#.]+/)
    .map(item => item.trim())
    .filter(item => item.length >= 3 && item.length <= 24)
    .slice(0, 80);
  const seen = new Set();
  return found.concat(extra)
    .filter(item => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 18);
}

function buildReport(resume, job) {
  const resumeText = textOfResume(resume);
  const jobText = [
    job && job.title,
    job && job.company,
    job && job.description,
    job && (job.skillTags || []).map(item => item.label).join(' ')
  ].filter(Boolean).join(' ');

  const jobKeywords = extractKeywords(jobText);
  const resumeLower = normalizeText(resumeText);
  const matched = jobKeywords.filter(keyword => resumeLower.includes(keyword.toLowerCase()));
  const missing = jobKeywords.filter(keyword => !resumeLower.includes(keyword.toLowerCase())).slice(0, 8);
  const skillScore = jobKeywords.length ? Math.round(matched.length / jobKeywords.length * 42) : 18;
  const projectScore = (resume && resume.projects && resume.projects.length ? 20 : 8);
  const experienceScore = (resume && resume.workExp && resume.workExp.length ? 18 : 8);
  const educationScore = (resume && resume.education && resume.education.length ? 10 : 5);
  const atsPenalty = missing.length >= 6 ? 8 : (missing.length >= 3 ? 4 : 0);
  const score = Math.max(35, Math.min(96, skillScore + projectScore + experienceScore + educationScore - atsPenalty + 8));
  const targetProject = (resume && resume.projects && resume.projects[0] && resume.projects[0].name) || '与目标岗位最相关的项目经历';

  return {
    id: 'match_' + Date.now(),
    jobId: job && job.id ? String(job.id) : '',
    jobTitle: job && job.title || '',
    company: job && job.company || '',
    resumeName: (resume && resume.basicInfo && resume.basicInfo.name) || '当前在线简历',
    score,
    matchedKeywords: matched.slice(0, 8),
    missingKeywords: missing,
    projectSuggestion: targetProject,
    atsRisk: missing.length >= 6 ? '高' : (missing.length >= 3 ? '中' : '低'),
    suggestions: [
      missing.length ? '在技能或项目描述中补充：' + missing.slice(0, 4).join('、') : '关键词覆盖较好，可继续强化成果量化。',
      '把项目经历改成“动作 + 技术/方法 + 量化结果”的表达。',
      '投递前针对 JD 调整摘要和技能排序，提升 ATS 命中率。'
    ],
    createdAt: new Date().toISOString()
  };
}

function saveReport(report) {
  const normalized = normalizeLocalReport(report);
  const list = readList().filter(item => reportKey(item) !== reportKey(normalized));
  const next = [normalized].concat(list).slice(0, 50);
  saveList(next);
  syncReport(normalized).then(remote => {
    const remoteId = reportKey(remote);
    if (!remoteId) return;
    const current = readList().map(item => {
      if (reportKey(item) !== reportKey(normalized)) return item;
      return Object.assign({}, item, remote, {
        id: normalized.id || remote.id,
        serverId: remote.serverId || item.serverId || ''
      });
    });
    saveList(current);
  }).catch(() => {});
  return normalized;
}

function getReports() {
  return readList();
}

function getReportById(id) {
  const key = String(id || '');
  if (!key) return null;
  return readList().find(item => String(item.id) === key || String(item.serverId) === key) || null;
}

function fetchRemoteReports() {
  if (!hasToken()) return Promise.resolve(readList());
  const local = readList();
  return apiClient.request({
    path: '/api/career-assets/jd-match-reports',
    noCache: true,
    timeout: 12000
  }).then(res => {
    if (!res || res.code !== 0 || !Array.isArray(res.data)) return local;
    const remote = res.data.map(normalizeRemoteReport);
    const merged = mergeReports(local, remote);
    saveList(merged);
    return merged;
  }).catch(() => readList());
}

function syncReport(report) {
  if (!hasToken() || !report) return Promise.resolve(report);
  return apiClient.post({
    path: '/api/career-assets/jd-match-reports',
    body: report,
    timeout: 15000
  }).then(res => {
    if (res && res.code === 0 && res.data) return normalizeRemoteReport(res.data);
    return report;
  });
}

module.exports = {
  buildReport,
  saveReport,
  getReports,
  getReportById,
  fetchRemoteReports,
  syncReport
};
