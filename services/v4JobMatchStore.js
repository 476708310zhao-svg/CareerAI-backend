const db = require('../db/database');
const { buildJobMatch } = require('./v4JobMatch');

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch (error) { return fallback; }
}

function formatMatch(row) {
  if (!row) return null;
  return {
    jobId: row.job_id, score: row.score,
    qualificationStatus: row.qualification_status,
    qualificationReasons: parseJson(row.qualification_reasons, []),
    recommendation: row.recommendation,
    dimensions: parseJson(row.dimensions, {}), strengths: parseJson(row.strengths, []),
    gaps: parseJson(row.gaps, []), actions: parseJson(row.actions, []),
    profileVersion: row.profile_version, jobFingerprint: row.job_fingerprint,
    updatedAt: row.updated_at
  };
}

function persistJobMatch(userId, job, profile, sponsor) {
  const result = buildJobMatch(job, profile, sponsor);
  db.prepare(`
    INSERT INTO job_matches
      (user_id, job_id, profile_version, job_fingerprint, qualification_status,
       qualification_reasons, score, dimensions, strengths, gaps, actions, recommendation, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, job_id, profile_version, job_fingerprint) DO UPDATE SET
      qualification_status=excluded.qualification_status,
      qualification_reasons=excluded.qualification_reasons, score=excluded.score,
      dimensions=excluded.dimensions, strengths=excluded.strengths, gaps=excluded.gaps,
      actions=excluded.actions, recommendation=excluded.recommendation, updated_at=datetime('now')
  `).run(
    userId, String(job.id), profile.profileVersion, result.jobFingerprint,
    result.qualificationStatus, JSON.stringify(result.qualificationReasons), result.score,
    JSON.stringify(result.dimensions), JSON.stringify(result.strengths),
    JSON.stringify(result.gaps), JSON.stringify(result.actions), result.recommendation
  );
  const row = db.prepare(`
    SELECT * FROM job_matches
    WHERE user_id=? AND job_id=? AND profile_version=? AND job_fingerprint=?
  `).get(userId, String(job.id), profile.profileVersion, result.jobFingerprint);
  return { ...formatMatch(row), matchedSkills: result.matchedSkills, missingSkills: result.missingSkills };
}

module.exports = { persistJobMatch, formatMatch };
