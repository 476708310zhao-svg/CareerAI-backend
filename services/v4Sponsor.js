const db = require('../db/database');

function cleanText(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function boolOrNull(value) {
  return value === null || value === undefined ? null : Boolean(value);
}

function deriveSponsorProfile(job) {
  const text = cleanText([
    job.title, job.description, ...(job.requirements || []),
    job.visaInfo, job.sponsorInfo
  ].join(' '));
  const citizenRequired = Boolean(job.citizenRequired) || /citizen(ship)? required|us citizens only|美国公民/.test(text);
  const negative = /no sponsor|without sponsorship|cannot sponsor|不支持.{0,8}(签证|sponsor)/.test(text);
  const positive = job.visaSponsored === true || /h-?1b|visa sponsor|sponsorship available|支持.{0,8}(签证|sponsor)/.test(text);
  const optMention = /\bopt\b|stem opt|cpt/.test(text);
  const evidence = [];
  if (job.visaSponsored === true) evidence.push('V3 岗位字段标注 visaSponsored=true');
  if (job.visaSponsored === false) evidence.push('V3 岗位字段标注 visaSponsored=false');
  if (citizenRequired) evidence.push('JD 包含公民身份要求');
  if (positive && !job.visaSponsored) evidence.push('JD 包含 Sponsor 或签证支持信息');
  if (negative) evidence.push('JD 明确不提供 Sponsor');
  if (optMention) evidence.push('JD 提及 OPT/CPT');

  return {
    jobId: String(job.id),
    optFriendly: citizenRequired || negative ? false : (optMention || positive ? true : null),
    stemFriendly: citizenRequired || negative ? false : (positive ? true : null),
    h1bSponsor: citizenRequired || negative ? false : (positive ? true : null),
    internationalStudentFriendly: citizenRequired || negative ? false : (positive ? true : null),
    citizenRequired,
    source: 'legacy_inference',
    sourceUrl: job.applyUrl || job.sourceUrl || '',
    confidence: citizenRequired || negative ? 0.9 : positive ? 0.7 : 0.35,
    evidence,
    verifiedAt: ''
  };
}

function rowToProfile(row) {
  if (!row) return null;
  return {
    jobId: row.job_id,
    optFriendly: boolOrNull(row.opt_friendly),
    stemFriendly: boolOrNull(row.stem_friendly),
    h1bSponsor: boolOrNull(row.h1b_sponsor),
    internationalStudentFriendly: boolOrNull(row.international_student_friendly),
    citizenRequired: Boolean(row.citizen_required),
    source: row.source || '', sourceUrl: row.source_url || '',
    confidence: Number(row.confidence || 0),
    evidence: (() => { try { return JSON.parse(row.evidence || '[]'); } catch (error) { return []; } })(),
    verifiedAt: row.verified_at || '', updatedAt: row.updated_at || ''
  };
}

function saveSponsorProfile(profile) {
  db.prepare(`
    INSERT INTO job_sponsor_profiles
      (job_id, opt_friendly, stem_friendly, h1b_sponsor, international_student_friendly,
       citizen_required, source, source_url, confidence, evidence, verified_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(job_id) DO UPDATE SET
      opt_friendly=excluded.opt_friendly, stem_friendly=excluded.stem_friendly,
      h1b_sponsor=excluded.h1b_sponsor,
      international_student_friendly=excluded.international_student_friendly,
      citizen_required=excluded.citizen_required, source=excluded.source,
      source_url=excluded.source_url, confidence=excluded.confidence,
      evidence=excluded.evidence, verified_at=excluded.verified_at, updated_at=datetime('now')
  `).run(
    String(profile.jobId), profile.optFriendly === null ? null : profile.optFriendly ? 1 : 0,
    profile.stemFriendly === null ? null : profile.stemFriendly ? 1 : 0,
    profile.h1bSponsor === null ? null : profile.h1bSponsor ? 1 : 0,
    profile.internationalStudentFriendly === null ? null : profile.internationalStudentFriendly ? 1 : 0,
    profile.citizenRequired ? 1 : 0, profile.source || 'manual', profile.sourceUrl || '',
    Number(profile.confidence || 0), JSON.stringify(profile.evidence || []), profile.verifiedAt || ''
  );
  return rowToProfile(db.prepare('SELECT * FROM job_sponsor_profiles WHERE job_id=?').get(String(profile.jobId)));
}

function getSponsorProfile(job, persistInference = true) {
  const row = db.prepare('SELECT * FROM job_sponsor_profiles WHERE job_id=?').get(String(job.id));
  if (row) return rowToProfile(row);
  const inferred = deriveSponsorProfile(job);
  return persistInference ? saveSponsorProfile(inferred) : inferred;
}

module.exports = { deriveSponsorProfile, getSponsorProfile, saveSponsorProfile };
