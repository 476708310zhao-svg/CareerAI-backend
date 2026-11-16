const db = require('../db/database');
const { getProfile, saveProfile } = require('./v4Profile');

function parsed(value, fallback) {
  try { return typeof value === 'string' ? JSON.parse(value || '') : (value || fallback); }
  catch (error) { return fallback; }
}

function clean(value, limit = 120) { return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit); }
function degreeOf(value) {
  const text = clean(value).toLowerCase();
  if (/博士|ph\.?d|doctor/.test(text)) return 'phd';
  if (/硕士|研究生|master|\bm\.?s\.?\b|\bm\.?a\.?\b/.test(text)) return 'master';
  if (/本科|学士|bachelor|\bb\.?s\.?\b|\bb\.?a\.?\b/.test(text)) return 'bachelor';
  if (/专科|associate/.test(text)) return 'associate';
  return '';
}
function yearOf(value) {
  const years = clean(value).match(/(?:19|20)\d{2}/g) || [];
  return years.length ? years[years.length - 1] : '';
}
function list(value, limit = 20) {
  return Array.isArray(value) ? [...new Set(value.map(item => clean(item, 80)).filter(Boolean))].slice(0, limit) : [];
}

function syncResumeProfile(userId, resumeId) {
  return db.transaction(() => {
    const resume = db.prepare("SELECT * FROM resumes WHERE id=? AND user_id=? AND COALESCE(archived_at, '')=''").get(resumeId, userId);
    if (!resume) throw Object.assign(new Error('简历不存在'), { status: 404 });
    const version = db.prepare('SELECT content FROM resume_versions_v4 WHERE id=? AND resume_id=? AND user_id=?')
      .get(resume.current_version_id, resumeId, userId);
    if (!version) throw Object.assign(new Error('在线简历版本不存在'), { status: 409 });
    const content = parsed(version.content, {});
    const firstVersion = db.prepare('SELECT content FROM resume_versions_v4 WHERE resume_id=? AND user_id=? ORDER BY version_no ASC LIMIT 1')
      .get(resumeId, userId);
    const originalSource = content.sourceAttachment || parsed(firstVersion && firstVersion.content, {}).sourceAttachment;
    const sourceId = Number(originalSource && originalSource.id);
    if (!Number.isSafeInteger(sourceId) || sourceId <= 0 || !db.prepare('SELECT id FROM resume_pdfs WHERE id=? AND user_id=?').get(sourceId, userId)) {
      throw Object.assign(new Error('此在线简历没有本人上传的 PDF 来源'), { status: 400 });
    }
    const user = db.prepare('SELECT education, job_preference FROM users WHERE id=?').get(userId);
    const legacyEducation = parsed(user.education, {});
    const legacyPreference = parsed(user.job_preference, {});
    const profile = getProfile(userId);
    const education = Array.isArray(content.education) ? content.education[0] || {} : {};
    const candidates = {
      school: clean(education.school, 80), major: clean(education.major, 80),
      degree: degreeOf(education.degree), graduationYear: yearOf(education.time),
      skills: list(content.skills),
      projects: list((Array.isArray(content.projects) ? content.projects : []).map(item => typeof item === 'string' ? item : [item && item.name, item && item.desc].filter(Boolean).join('：')), 12),
      targetRoles: list(content.jobPreference && content.jobPreference.targetRoles, 5),
      targetCities: list(content.jobPreference && content.jobPreference.targetCities, 6)
    };
    const patch = {};
    const sources = {};
    const importedFields = [];
    const legacyExisting = {
      school: legacyEducation.school, major: legacyEducation.major, degree: legacyEducation.degree,
      graduationYear: legacyEducation.gradYear, skills: legacyPreference.skills,
      targetRoles: legacyPreference.targetRoles, targetCities: legacyPreference.targetLocation
    };
    for (const [key, value] of Object.entries(candidates)) {
      if (!value || (Array.isArray(value) && !value.length)) continue;
      const existing = profile[key];
      if (existing && (!Array.isArray(existing) || existing.length)) continue;
      const older = legacyExisting[key];
      if (older && (!Array.isArray(older) || older.length)) {
        patch[key] = older;
        continue;
      }
      patch[key] = value;
      sources[key] = `resume_pdf:${sourceId}`;
      importedFields.push(key);
    }
    if (Object.keys(patch).length) saveProfile(userId, { ...patch, fieldSources: sources });
    const nextEducation = { ...legacyEducation };
    for (const [legacyKey, key] of [['school', 'school'], ['major', 'major'], ['degree', 'degree'], ['gradYear', 'graduationYear']]) {
      if (!nextEducation[legacyKey] && patch[key]) nextEducation[legacyKey] = patch[key];
    }
    const nextPreference = { ...legacyPreference };
    for (const [legacyKey, key] of [['skills', 'skills'], ['targetRoles', 'targetRoles'], ['targetLocation', 'targetCities']]) {
      if ((!nextPreference[legacyKey] || !nextPreference[legacyKey].length) && patch[key]) nextPreference[legacyKey] = patch[key];
    }
    db.prepare('UPDATE users SET education=?, job_preference=? WHERE id=?')
      .run(JSON.stringify(nextEducation), JSON.stringify(nextPreference), userId);
    return { profile: getProfile(userId), importedFields, sourceAttachmentId: sourceId };
  }).immediate();
}

module.exports = { syncResumeProfile };
