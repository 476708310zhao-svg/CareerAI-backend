const express = require('express');
const db = require('../../db/database');
const { authMiddleware } = require('../../middleware/auth');
const { ok, fail } = require('../../utils/response');
const { findJobById } = require('../../utils/jobData');
const { getProfile } = require('../../services/v4Profile');
const { getSponsorProfile } = require('../../services/v4Sponsor');
const { persistJobMatch } = require('../../services/v4JobMatchStore');
const workflow = require('../../services/v4ApplicationWorkflow');
const { applicationView, buildDetail, workspace } = require('../../services/v4ApplicationWorkspace');
const analytics = require('../../services/v4Analytics');
const { applicationRefs, withCoreRefs } = require('../../utils/coreEntityRefs');
const {
  STATUS_TEXT, V4_TO_PROGRESS, broadStatus, boardGroup
} = require('../../utils/applicationStatus');

const router = express.Router();

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch (error) { return fallback; }
}

function cleanText(value, max = 1000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function bodyOf(req) {
  const body = req.body || {};
  return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
}

function validWebUrl(value) {
  if (!value) return true;
  try { return ['http:', 'https:'].includes(new URL(value).protocol); }
  catch (error) { return false; }
}

function positiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function selectedResume(userId, body) {
  const rawResumeId = body.resumeId;
  const rawVersionId = body.resumeVersionId;
  const hasResumeId = rawResumeId !== undefined && rawResumeId !== null && String(rawResumeId).trim() !== '';
  const hasVersionId = rawVersionId !== undefined && rawVersionId !== null && String(rawVersionId).trim() !== '';
  if (!hasResumeId && !hasVersionId) return { resumeId: null, resumeVersionId: '' };

  const resumeId = hasResumeId ? positiveId(rawResumeId) : null;
  const versionId = hasVersionId ? positiveId(rawVersionId) : null;
  if ((hasResumeId && !resumeId) || (hasVersionId && !versionId)) {
    return { error: '简历或简历版本标识无效', status: 400 };
  }
  const resume = resumeId ? db.prepare(`SELECT id FROM resumes
    WHERE id=? AND user_id=? AND COALESCE(archived_at,'')=''`).get(resumeId, userId) : null;
  if (resumeId && !resume) return { error: '简历不存在或无权使用', status: 404 };

  const version = versionId ? db.prepare(`SELECT v.id,v.resume_id FROM resume_versions_v4 v
    JOIN resumes r ON r.id=v.resume_id AND r.user_id=v.user_id
    WHERE v.id=? AND v.user_id=? AND COALESCE(r.archived_at,'')=''`).get(versionId, userId) : null;
  if (versionId && !version) return { error: '简历版本不存在或无权使用', status: 404 };
  if (resumeId && version && version.resume_id !== resumeId) {
    return { error: '简历版本与所选简历不匹配', status: 400 };
  }
  return { resumeId: resumeId || version.resume_id, resumeVersionId: version ? String(version.id) : '' };
}

function readableOwnedApplication(id, userId) {
  return db.prepare('SELECT * FROM applications WHERE id=? AND user_id=?').get(Number(id), userId);
}

function activeOwnedApplication(id, userId) {
  return db.prepare("SELECT * FROM applications WHERE id=? AND user_id=? AND COALESCE(archived_at,'')='' ")
    .get(Number(id), userId);
}

router.get('/board', authMiddleware, (req, res) => {
  const keyword = cleanText(req.query.keyword, 120).toLowerCase();
  const rows = db.prepare(`
    SELECT applications.*, (SELECT COALESCE(MAX(h.id),0) FROM application_history h WHERE h.application_id=applications.id AND h.user_id=applications.user_id) AS history_id FROM applications WHERE user_id=? AND COALESCE(archived_at, '')=''
    ORDER BY CASE WHEN deadline!='' THEN deadline ELSE '9999-12-31' END ASC,
             updated_at DESC, id DESC
  `).all(req.user.userId);
  const list = rows.map(applicationView).filter(item => {
    const text = `${item.company} ${item.jobTitle} ${item.city}`.toLowerCase();
    return (!keyword || text.includes(keyword)) && (!req.query.status || item.status === req.query.status);
  });
  const groups = { preparing: [], applied: [], interview: [], offer: [], closed: [] };
  list.forEach(item => groups[boardGroup(item.status)].push(item));
  return ok(res, {
    groups,
    statistics: Object.fromEntries(Object.entries(groups).map(([key, items]) => [key, items.length])),
    total: list.length,
    statuses: Object.entries(STATUS_TEXT).map(([value, label]) => ({ value, label }))
  });
});

router.post('/', authMiddleware, (req, res) => {
  const body = bodyOf(req);
  const suppliedSourceType = cleanText(body.sourceType || 'job', 40).toLowerCase();
  const sourceType = ['manual', 'manual_application'].includes(suppliedSourceType) ? 'manual' : suppliedSourceType;
  const suppliedSnapshot = body.jobSnapshot && typeof body.jobSnapshot === 'object' && !Array.isArray(body.jobSnapshot)
    ? body.jobSnapshot : null;
  if (sourceType === 'manual') {
    const snapshot = suppliedSnapshot || {};
    if (!cleanText(snapshot.company,120) || !cleanText(snapshot.title,160)) return fail(res,'请填写公司和岗位',400);
  }
  const jobId = cleanText(body.jobId, 200);
  if (!jobId) return fail(res, '缺少 jobId', 400);
  const job = findJobById(jobId);
  const snapshot = suppliedSnapshot || job || {};
  const jobLink = cleanText(snapshot.applyUrl || snapshot.sourceUrl, 1000);
  if (!validWebUrl(jobLink)) return fail(res,'官网链接需以 http:// 或 https:// 开头',400);
  const resume = selectedResume(req.user.userId, body);
  if (resume.error) return fail(res, resume.error, resume.status);
  const status = ['interested', 'preparing'].includes(body.status) ? body.status : 'interested';
  const created = db.transaction(() => {
    const existing = db.prepare(`
      SELECT id FROM applications
      WHERE user_id=? AND (job_id=? OR source_job_id=?) AND COALESCE(archived_at, '')=''
      ORDER BY id DESC LIMIT 1
    `).get(req.user.userId, jobId, jobId);
    if (existing) return { duplicateId: existing.id };
    const result = db.prepare(`
      INSERT INTO applications
        (user_id, job_id, source_job_id, source_type, job_snapshot, resume_id, status,
         status_text, applied_at, company, job_title, city, salary, job_link, deadline,
         notes, resume_version_id, progress_status, next_action, cover_letter, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      req.user.userId, jobId, jobId, sourceType, JSON.stringify(snapshot),
      resume.resumeId, broadStatus(status), STATUS_TEXT[status], new Date().toISOString().slice(0, 10),
      cleanText(snapshot.company, 120), cleanText(snapshot.title, 160), cleanText(snapshot.location, 120),
      cleanText(snapshot.salary, 120), jobLink,
      cleanText(body.deadline || snapshot.deadline, 40), cleanText(body.notes, 2000),
      resume.resumeVersionId, V4_TO_PROGRESS[status],
      cleanText(body.nextAction || '完善申请材料并确认官方截止时间', 300), cleanText(body.coverLetter, 10000)
    );
    const applicationId = Number(result.lastInsertRowid);
    db.prepare(`
      INSERT INTO application_history (application_id, user_id, from_status, to_status, note, actor_type)
      VALUES (?, ?, '', ?, '加入申请看板', 'user')
    `).run(applicationId, req.user.userId, status);
    db.prepare('UPDATE applications SET v4_status=? WHERE id=? AND user_id=?').run(status, applicationId, req.user.userId);
    return { applicationId };
  }).immediate();
  if (created.duplicateId) return res.status(409).json({ code: -1, message: '该职位已在申请看板中', data: { applicationId: created.duplicateId } });
  const row = activeOwnedApplication(created.applicationId, req.user.userId);
  analytics.trackFunnel(req.user.userId, 'application_added', withCoreRefs(
    { applicationId: created.applicationId, jobId },
    applicationRefs(row)
  ), '/api/v4/applications');
  return ok(res, applicationView(row), '已加入申请看板');
});

router.post('/:id/official-apply', authMiddleware, (req, res) => {
  const row = activeOwnedApplication(req.params.id, req.user.userId);
  if (!row) return fail(res, '申请记录不存在', 404);
  const snapshot = parseJson(row.job_snapshot, {});
  const url = row.job_link || snapshot.applyUrl || snapshot.sourceUrl || '';
  analytics.track(req.user.userId, 'official_apply_clicked', withCoreRefs(
    { applicationId: row.id, jobId: row.source_job_id || row.job_id },
    applicationRefs(row)
  ), '/api/v4/applications/:id/official-apply');
  return ok(res, { url });
});

router.get('/:id/detail', authMiddleware, (req, res) => {
  const row = readableOwnedApplication(req.params.id, req.user.userId);
  if (!row) return fail(res, '申请记录不存在', 404);
  return ok(res, buildDetail(req.user.userId, row));
});

router.get('/:id/workspace', authMiddleware, (req, res) => {
  const row = readableOwnedApplication(req.params.id, req.user.userId);
  if (!row) return fail(res, '申请记录不存在', 404);
  res.set('Cache-Control', 'no-store');
  return ok(res, workspace(req.user.userId, row));
});

function workflowError(res, err) {
  if (err && err.isApplicationWorkflowError === true
    && Number.isInteger(err.status) && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ code: -1, message: err.message, data: err.details });
  }
  throw new Error(err && err.message ? err.message : '申请工作流执行失败', { cause: err });
}

router.post('/bulk-status', authMiddleware, (req, res) => {
  const body = bodyOf(req);
  try {
    const result = workflow.bulkStatus(req.user.userId, body.items, body.status);
    return ok(res, result, result.changed ? '批量状态已更新' : '申请状态未变化');
  } catch (err) { return workflowError(res, err); }
});

router.post('/bulk-status/undo', authMiddleware, (req, res) => {
  const body = bodyOf(req);
  try {
    return ok(res, workflow.undoBulk(req.user.userId, body.historyIds), '批量状态已撤销');
  } catch (err) { return workflowError(res, err); }
});

router.patch('/:id', authMiddleware, (req, res) => {
  const row = activeOwnedApplication(req.params.id, req.user.userId);
  if (!row) return fail(res, '申请记录不存在', 404);
  const body = bodyOf(req);
  const supportedFields = ['deadline', 'interviewTime', 'notes', 'resumeVersionId', 'nextAction', 'coverLetter'];
  const requestedFields = Object.keys(body);
  if (!requestedFields.length || requestedFields.some(key => !supportedFields.includes(key))) {
    return fail(res, '请提供要更新的申请内容', 400);
  }
  const value = (key, current, max) => Object.prototype.hasOwnProperty.call(body, key) ? cleanText(body[key], max) : current || '';
  let resumeId = row.resume_id || null;
  let resumeVersionId = row.resume_version_id || '';
  if (Object.prototype.hasOwnProperty.call(body, 'resumeVersionId')) {
    const requested = String(body.resumeVersionId || '').trim();
    if (requested) {
      const selected = db.prepare(`SELECT v.id,v.resume_id FROM resume_versions_v4 v
        JOIN resumes r ON r.id=v.resume_id AND r.user_id=v.user_id
        WHERE v.id=? AND v.user_id=? AND COALESCE(r.archived_at,'')=''`).get(Number(requested), req.user.userId);
      if (!selected) return fail(res, '简历版本不存在或无权使用', 404);
      resumeId = selected.resume_id;
      resumeVersionId = String(selected.id);
    } else {
      resumeId = null;
      resumeVersionId = '';
    }
  }
  const nextValues = {
    deadline: value('deadline', row.deadline, 40),
    interviewTime: value('interviewTime', row.interview_time, 80),
    notes: value('notes', row.notes, 2000),
    resumeVersionId,
    resumeId,
    nextAction: value('nextAction', row.next_action, 300),
    coverLetter: value('coverLetter', row.cover_letter, 10000)
  };
  const unchanged = nextValues.deadline === (row.deadline || '')
    && nextValues.interviewTime === (row.interview_time || '')
    && nextValues.notes === (row.notes || '')
    && String(nextValues.resumeVersionId || '') === String(row.resume_version_id || '')
    && Number(nextValues.resumeId || 0) === Number(row.resume_id || 0)
    && nextValues.nextAction === (row.next_action || '')
    && nextValues.coverLetter === (row.cover_letter || '');
  if (unchanged) return ok(res, applicationView(row), '申请详情未变化');
  db.prepare(`
    UPDATE applications SET deadline=?, interview_time=?, notes=?, resume_version_id=?,
      resume_id=?, next_action=?, cover_letter=?, updated_at=datetime('now') WHERE id=? AND user_id=?
  `).run(
    nextValues.deadline, nextValues.interviewTime, nextValues.notes, nextValues.resumeVersionId,
    nextValues.resumeId, nextValues.nextAction, nextValues.coverLetter,
    row.id, req.user.userId
  );
  return ok(res, applicationView(activeOwnedApplication(row.id, req.user.userId)), '申请详情已更新');
});

router.post('/:id/match', authMiddleware, (req, res) => {
  const row = activeOwnedApplication(req.params.id, req.user.userId);
  if (!row) return fail(res, '申请记录不存在', 404);
  const jobId = applicationRefs(row).jobId;
  const job = jobId ? findJobById(jobId) : null;
  if (!job) return fail(res, '当前申请没有可匹配的岗位数据', 422);
  const profile = getProfile(req.user.userId);
  if (!profile) return fail(res, '用户不存在', 404);
  if (profile.completion < 40) return res.status(422).json({ code: -1, message: '请先完善求职画像', data: { completion: profile.completion } });
  try {
    const result = persistJobMatch(req.user.userId, job, profile, getSponsorProfile(job));
    return ok(res, result, '岗位匹配已重新计算');
  } catch (error) { return workflowError(res, error); }
});

router.post('/:id/contacts', authMiddleware, (req, res) => {
  const row = activeOwnedApplication(req.params.id, req.user.userId);
  if (!row) return fail(res, '申请记录不存在', 404);
  const name = cleanText(req.body && req.body.name, 120);
  if (!name) return fail(res, '联系人姓名不能为空', 400);
  const result = db.prepare(`
    INSERT INTO application_contacts (application_id, user_id, name, role, email, linkedin, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(row.id, req.user.userId, name, cleanText(req.body.role, 120), cleanText(req.body.email, 160), cleanText(req.body.linkedin, 500), cleanText(req.body.notes, 1000));
  return ok(res, { id: result.lastInsertRowid, name }, '联系人已添加');
});

router.post('/:id/tasks', authMiddleware, (req, res) => {
  const row = activeOwnedApplication(req.params.id, req.user.userId);
  if (!row) return fail(res, '申请记录不存在', 404);
  const body = bodyOf(req);
  const title = cleanText(body.title, 200);
  if (!title) return fail(res, '任务标题不能为空', 400);
  const priority = ['low', 'medium', 'high'].includes(body.priority) ? body.priority : 'medium';
  const result = db.prepare(`
    INSERT INTO application_tasks (application_id, user_id, title, due_at, priority)
    VALUES (?, ?, ?, ?, ?)
  `).run(row.id, req.user.userId, title, cleanText(body.dueAt, 40), priority);
  return ok(res, { id: result.lastInsertRowid, title, priority }, '下一步任务已添加');
});

router.patch('/:id/tasks/:taskId', authMiddleware, (req, res) => {
  const row = activeOwnedApplication(req.params.id, req.user.userId);
  if (!row) return fail(res, '申请记录不存在', 404);
  const task = db.prepare('SELECT * FROM application_tasks WHERE id=? AND application_id=? AND user_id=?').get(Number(req.params.taskId), row.id, req.user.userId);
  if (!task) return fail(res, '任务不存在', 404);
  const body = bodyOf(req);
  if (!Object.keys(body).length) return fail(res, '请提供要更新的任务内容', 400);
  const completed = Object.prototype.hasOwnProperty.call(body, 'completed') ? (body.completed ? 1 : 0) : task.completed;
  const title = body.title === undefined ? task.title : cleanText(body.title,200);
  if (!title) return fail(res,'任务标题不能为空',400);
  const dueAt = body.dueAt === undefined ? task.due_at : cleanText(body.dueAt,40);
  db.prepare('UPDATE application_tasks SET title=?,due_at=?,completed=?, updated_at=datetime(\'now\') WHERE id=?').run(title,dueAt,completed, task.id);
  return ok(res, { id: task.id, title, dueAt, completed: Boolean(completed) }, '任务已更新');
});

router.patch('/:id/status', authMiddleware, (req, res) => {
  const body = bodyOf(req);
  try {
    return ok(res, workflow.changeStatus(req.user.userId, Number(req.params.id),
      String(body.status || '').trim(), body.note, body.expectedState), '申请状态已更新');
  } catch (err) { return workflowError(res, err); }
});

router.get('/:id/history', authMiddleware, (req, res) => {
  const application = readableOwnedApplication(req.params.id, req.user.userId);
  if (!application) return fail(res, '申请记录不存在', 404);
  const list = db.prepare(`
    SELECT id, from_status AS fromStatus, to_status AS toStatus, note,
           actor_type AS actorType, created_at AS createdAt
    FROM application_history WHERE application_id=? AND user_id=?
    ORDER BY id DESC
  `).all(application.id, req.user.userId);
  return ok(res, { list, total: list.length });
});

module.exports = router;
