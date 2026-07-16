const db = require('../db/database');
const { buildUserProfile } = require('../utils/userProfileStandard');

function parseJson(value, fallback) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch (error) { return fallback; }
}

function cleanText(value, max = 120) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanList(value, limit = 20, max = 80) {
  const source = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,，、;；\n]+/) : [];
  const seen = new Set();
  return source.map(item => cleanText(item, max)).filter(item => {
    const key = item.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

function legacyProfile(userId) {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(userId);
  if (!user) return null;
  const legacy = buildUserProfile(user);
  return {
    userId,
    school: legacy.school || '',
    major: legacy.major || '',
    degree: legacy.degree || '',
    graduationYear: legacy.gradYear || '',
    country: '', city: '', visaStatus: legacy.workAuthorization || '',
    workAuthorization: legacy.workAuthorization || '', sponsorNeeded: false,
    targetRoles: legacy.targetRoles || [],
    targetIndustries: legacy.targetIndustries || [],
    targetCities: legacy.targetLocation || [],
    employmentTypes: legacy.jobTypes || [],
    skills: legacy.skills || [], projects: [], fieldSources: {},
    completion: 0, profileVersion: 1, updatedAt: ''
  };
}

function completionOf(profile) {
  const checks = [
    profile.school, profile.major, profile.degree, profile.graduationYear,
    profile.targetRoles && profile.targetRoles.length,
    profile.targetCities && profile.targetCities.length,
    profile.visaStatus || profile.workAuthorization,
    profile.skills && profile.skills.length
  ];
  return Math.round(checks.filter(Boolean).length / checks.length * 100);
}

function rowToProfile(row) {
  if (!row) return null;
  return {
    userId: row.user_id,
    school: row.school || '', major: row.major || '', degree: row.degree || '',
    graduationYear: row.graduation_year || '', country: row.country || '', city: row.city || '',
    visaStatus: row.visa_status || '', workAuthorization: row.work_authorization || '',
    sponsorNeeded: Boolean(row.sponsor_needed),
    targetRoles: parseJson(row.target_roles, []), targetIndustries: parseJson(row.target_industries, []),
    targetCities: parseJson(row.target_cities, []), employmentTypes: parseJson(row.employment_types, []),
    skills: parseJson(row.skills, []), projects: parseJson(row.projects, []),
    fieldSources: parseJson(row.field_sources, {}), completion: row.completion || 0,
    profileVersion: row.profile_version || 1, updatedAt: row.updated_at || ''
  };
}

function getProfile(userId, createFromLegacy = true) {
  let row = db.prepare('SELECT * FROM user_profiles WHERE user_id=?').get(userId);
  if (!row && createFromLegacy) {
    const initial = legacyProfile(userId);
    if (!initial) return null;
    saveProfile(userId, initial, { preserveVersion: true });
    row = db.prepare('SELECT * FROM user_profiles WHERE user_id=?').get(userId);
  }
  return rowToProfile(row);
}

function normalizeProfile(payload, current) {
  const source = payload || {};
  const profile = { ...(current || {}) };
  const textFields = ['school', 'major', 'degree', 'graduationYear', 'country', 'city', 'visaStatus', 'workAuthorization'];
  const listFields = ['targetRoles', 'targetIndustries', 'targetCities', 'employmentTypes', 'skills', 'projects'];
  textFields.forEach(key => {
    if (Object.prototype.hasOwnProperty.call(source, key)) profile[key] = cleanText(source[key], 120);
  });
  listFields.forEach(key => {
    if (Object.prototype.hasOwnProperty.call(source, key)) profile[key] = cleanList(source[key], key === 'projects' ? 12 : 20, 160);
  });
  if (Object.prototype.hasOwnProperty.call(source, 'sponsorNeeded')) profile.sponsorNeeded = Boolean(source.sponsorNeeded);
  if (source.fieldSources && typeof source.fieldSources === 'object') {
    profile.fieldSources = { ...(profile.fieldSources || {}), ...source.fieldSources };
  }
  profile.completion = completionOf(profile);
  return profile;
}

function saveProfile(userId, payload, options = {}) {
  const current = getProfile(userId, false) || legacyProfile(userId);
  if (!current) return null;
  const profile = normalizeProfile(payload, current);
  const nextVersion = options.preserveVersion ? current.profileVersion || 1 : (current.profileVersion || 0) + 1;
  db.prepare(`
    INSERT INTO user_profiles
      (user_id, school, major, degree, graduation_year, country, city, visa_status,
       work_authorization, sponsor_needed, target_roles, target_industries, target_cities,
       employment_types, skills, projects, field_sources, completion, profile_version, updated_at)
    VALUES
      (@userId, @school, @major, @degree, @graduationYear, @country, @city, @visaStatus,
       @workAuthorization, @sponsorNeeded, @targetRoles, @targetIndustries, @targetCities,
       @employmentTypes, @skills, @projects, @fieldSources, @completion, @profileVersion, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      school=excluded.school, major=excluded.major, degree=excluded.degree,
      graduation_year=excluded.graduation_year, country=excluded.country, city=excluded.city,
      visa_status=excluded.visa_status, work_authorization=excluded.work_authorization,
      sponsor_needed=excluded.sponsor_needed, target_roles=excluded.target_roles,
      target_industries=excluded.target_industries, target_cities=excluded.target_cities,
      employment_types=excluded.employment_types, skills=excluded.skills, projects=excluded.projects,
      field_sources=excluded.field_sources, completion=excluded.completion,
      profile_version=excluded.profile_version, updated_at=datetime('now')
  `).run({
    userId, school: profile.school, major: profile.major, degree: profile.degree,
    graduationYear: profile.graduationYear, country: profile.country, city: profile.city,
    visaStatus: profile.visaStatus, workAuthorization: profile.workAuthorization,
    sponsorNeeded: profile.sponsorNeeded ? 1 : 0,
    targetRoles: JSON.stringify(profile.targetRoles), targetIndustries: JSON.stringify(profile.targetIndustries),
    targetCities: JSON.stringify(profile.targetCities), employmentTypes: JSON.stringify(profile.employmentTypes),
    skills: JSON.stringify(profile.skills), projects: JSON.stringify(profile.projects),
    fieldSources: JSON.stringify(profile.fieldSources || {}), completion: profile.completion,
    profileVersion: nextVersion
  });
  return getProfile(userId, false);
}

module.exports = { getProfile, saveProfile, completionOf };
