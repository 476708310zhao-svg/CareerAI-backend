'use strict';

const db = require('../db/database');
const { applicationRefs, mergeCoreRefs } = require('../utils/coreEntityRefs');
const { STATUS_TEXT, toV4Status, allowedStatusViews } = require('../utils/applicationStatus');
const { revision } = require('./v4ApplicationWorkflow');
const { versionView } = require('./v4ResumeCenter');

function json(value, fallback) { try { return JSON.parse(value) ?? fallback; } catch { return fallback; } }
function applicationView(row) {
  const snapshot = json(row.job_snapshot, {});
  const status = toV4Status(row);
  const refs = applicationRefs(row);
  return {
    id: refs.applicationId, jobId: refs.jobId, company: row.company || snapshot.company || '',
    jobTitle: row.job_title || snapshot.title || '', city: row.city || snapshot.location || '', salary: row.salary || snapshot.salary || '',
    status, statusText: STATUS_TEXT[status], deadline: row.deadline || '', interviewTime: row.interview_time || '',
    nextAction: row.next_action || '', notes: row.notes || '', resumeId: refs.resumeId, resumeVersionId: refs.resumeVersionId,
    coverLetter: row.cover_letter || '', officialApplyUrl: row.job_link || snapshot.applyUrl || '',
    appliedAt: row.applied_at || '', updatedAt: row.updated_at || row.applied_at || '', jobSnapshot: snapshot, refs,
    historyId: row.history_id ?? revision(row.user_id, row.id), allowedTransitions: allowedStatusViews(status)
  };
}

function buildDetail(userId, row) {
  const app = applicationView(row);
  const history = db.prepare(`SELECT id,from_status AS fromStatus,to_status AS toStatus,note,actor_type AS actorType,created_at AS createdAt
    FROM application_history WHERE application_id=? AND user_id=? ORDER BY id DESC`).all(row.id, userId);
  const contacts = db.prepare(`SELECT id,name,role,email,linkedin,notes,created_at AS createdAt,updated_at AS updatedAt
    FROM application_contacts WHERE application_id=? AND user_id=? ORDER BY id DESC`).all(row.id, userId);
  const tasks = db.prepare(`SELECT id,title,due_at AS dueAt,priority,completed,created_at AS createdAt,updated_at AS updatedAt
    FROM application_tasks WHERE application_id=? AND user_id=? ORDER BY completed ASC,due_at ASC,id DESC`).all(row.id, userId)
    .map(item => ({ ...item, completed: Boolean(item.completed) }));
  // Explicit application links take priority. Legacy records need a non-empty exact job/client link.
  const materials = db.prepare(`SELECT id,question_type AS type,question_label AS label,content,resume_name AS resumeName,
    resume_version_id AS resumeVersionId,updated_at AS updatedAt,status,application_id AS applicationId
    FROM application_materials WHERE user_id=? AND COALESCE(status,'saved')!='archived' AND (application_id=? OR
      (COALESCE(application_id,0)=0 AND ((?!='' AND job_id=?) OR (?!='' AND client_id=?))))
    ORDER BY updated_at DESC,id DESC`).all(userId, row.id, app.jobId || '', app.jobId || '', row.client_id || '', row.client_id || '')
    .map(item => ({ ...item, association: item.applicationId ? 'application' : 'legacy', refs: mergeCoreRefs({ resumeVersionId: item.resumeVersionId }, app.refs) }));
  const match = app.jobId ? db.prepare(`SELECT score,qualification_status AS qualificationStatus,recommendation,strengths,gaps,actions,updated_at AS updatedAt
    FROM job_matches WHERE user_id=? AND job_id=? ORDER BY id DESC LIMIT 1`).get(userId, app.jobId) : null;
  return { application: app, history, contacts, tasks, materials, allowedTransitions: app.allowedTransitions,
    match: match ? { ...match, strengths: json(match.strengths, []), gaps: json(match.gaps, []), actions: json(match.actions, []) } : null };
}

function workspace(userId, row) {
  // A read transaction keeps all sections on one SQLite snapshot; it creates no versions or AI records.
  return db.transaction(() => {
    const detail = buildDetail(userId, row);
    const app = detail.application;
    const resumeRow = app.resumeId ? db.prepare('SELECT id,name,language,current_version_id FROM resumes WHERE id=? AND user_id=?').get(app.resumeId, userId) : null;
    const version = app.resumeVersionId ? db.prepare(`SELECT v.* FROM resume_versions_v4 v JOIN resumes r ON r.id=v.resume_id
      WHERE v.id=? AND v.user_id=? AND r.user_id=? AND (? IS NULL OR v.resume_id=?)`)
      .get(app.resumeVersionId, userId, userId, app.resumeId, app.resumeId) : null;
    const resume = resumeRow || (version ? db.prepare('SELECT id,name,language,current_version_id FROM resumes WHERE id=? AND user_id=?').get(version.resume_id, userId) : null);
    const resumeOptions = db.prepare(`SELECT r.id AS resumeId,r.name AS resumeName,r.language,r.current_version_id AS currentVersionId,
      v.id AS versionId,v.version_no AS versionNo,v.name AS versionName,v.created_at AS createdAt
      FROM resumes r JOIN resume_versions_v4 v ON v.resume_id=r.id AND v.user_id=r.user_id
      WHERE r.user_id=? AND COALESCE(r.archived_at,'')='' ORDER BY r.is_default DESC,r.updated_at DESC,v.version_no DESC`).all(userId)
      .map(item => ({ resumeId:item.resumeId, resumeName:item.resumeName, language:item.language || '', currentVersionId:item.currentVersionId || null,
        versionId:item.versionId, versionNo:item.versionNo, versionName:item.versionName, createdAt:item.createdAt }));
    const drafts = db.prepare(`SELECT id,material_type AS type,status,content,resume_id AS resumeId,resume_version_id AS resumeVersionId,
      saved_material_id AS savedMaterialId,created_at AS createdAt,confirmed_at AS confirmedAt
      FROM ai_application_material_drafts WHERE application_id=? AND user_id=? ORDER BY id DESC LIMIT 50`).all(row.id, userId);
    // A score for another resume version must never appear as the current version's ATS result.
    const report = app.jobId && version ? db.prepare(`SELECT id,score,ats_risk AS atsRisk,resume_version_id AS resumeVersionId,
      missing_keywords AS missingKeywords,created_at AS createdAt FROM jd_match_reports
      WHERE user_id=? AND job_id=? AND resume_version_id=? ORDER BY id DESC LIMIT 1`).get(userId, app.jobId, String(version.id)) : null;
    const spaces = db.prepare(`SELECT id,round,interview_time AS interviewTime,preparation_completion AS preparationCompletion
      FROM interview_spaces_v4 WHERE user_id=? AND application_id=?`).all(userId, row.id);
    const reports = db.prepare(`SELECT r.id,r.session_id AS sessionId,r.space_id AS spaceId,r.overall_score AS overallScore,r.summary,r.created_at AS createdAt
      FROM interview_reports_v4 r JOIN interview_spaces_v4 s ON s.id=r.space_id
      WHERE r.user_id=? AND s.user_id=? AND s.application_id=? ORDER BY r.id DESC LIMIT 20`).all(userId, userId, row.id);
    return { ...detail, resume: resume ? { id: resume.id, name: resume.name, language: resume.language, version: versionView(version) } : null,
      resumeOptions,
      drafts, jdReport: report ? { ...report, missingKeywords: json(report.missingKeywords, []) } : null,
      interviews: { spaces, reports }, offer: null,
      availability: { resumeVersion: version ? 'available' : 'missing', ats: report ? 'available' : 'no_report_for_selected_version', offer: 'not_integrated' },
      refs: app.refs };
  })();
}

module.exports = { applicationView, buildDetail, workspace };
