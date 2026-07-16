const express = require('express');
const db = require('../../db/database');
const { authMiddleware } = require('../../middleware/auth');
const { ok, fail } = require('../../utils/response');
const { findJobById } = require('../../utils/jobData');
const { ensureSpace } = require('../../services/v4Interview');
const analytics = require('../../services/v4Analytics');

const router = express.Router();

const STATUS_TEXT = {
  interested: '感兴趣', preparing: '准备申请', applied: '已申请', oa: '在线测评',
  phone_screen: '电话面试', interview_1: '一轮面试', interview_2: '二轮面试',
  final: '终面', offer: 'Offer', rejected: '已拒绝', withdrawn: '已撤回'
};

const TRANSITIONS = {
  interested: ['preparing', 'withdrawn'],
  preparing: ['interested', 'applied', 'withdrawn'],
  applied: ['oa', 'phone_screen', 'interview_1', 'rejected', 'withdrawn'],
  oa: ['phone_screen', 'interview_1', 'rejected', 'withdrawn'],
  phone_screen: ['interview_1', 'rejected', 'withdrawn'],
  interview_1: ['interview_2', 'final', 'offer', 'rejected', 'withdrawn'],
  interview_2: ['final', 'offer', 'rejected', 'withdrawn'],
  final: ['offer', 'rejected', 'withdrawn'],
  offer: ['withdrawn'], rejected: [], withdrawn: []
};

const LEGACY_TO_V4 = {
  pending: 'interested', collected: 'interested', online_apply: 'preparing',
  applied: 'applied', viewed: 'applied', oa: 'oa',
  first_interview: 'interview_1', interview: 'interview_1',
  second_interview: 'interview_2', hr_interview: 'final',
  offer: 'offer', rejected: 'rejected', closed: 'withdrawn'
};

const V4_TO_PROGRESS = {
  interested: 'collected', preparing: 'online_apply', applied: 'applied', oa: 'oa',
  phone_screen: 'first_interview', interview_1: 'first_interview',
  interview_2: 'second_interview', final: 'hr_interview', offer: 'offer',
  rejected: 'rejected', withdrawn: 'closed'
};

function toV4Status(row) {
  return row.v4_status || LEGACY_TO_V4[row.progress_status] || LEGACY_TO_V4[row.status] || 'interested';
}

function broadStatus(status) {
  if (status === 'offer') return 'offer';
  if (['rejected', 'withdrawn'].includes(status)) return 'rejected';
  if (['phone_screen', 'interview_1', 'interview_2', 'final'].includes(status)) return 'interview';
  if (['applied', 'oa'].includes(status)) return 'applied';
  return 'pending';
}

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch (error) { return fallback; }
}

function cleanText(value, max = 1000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function applicationView(row) {
  const snapshot = parseJson(row.job_snapshot, {});
  const status = toV4Status(row);
  return {
    id: row.id, jobId: row.source_job_id || row.job_id,
    company: row.company || snapshot.company || '',
    jobTitle: row.job_title || snapshot.title || '',
    city: row.city || snapshot.location || '', salary: row.salary || snapshot.salary || '',
    status, statusText: STATUS_TEXT[status],
    deadline: row.deadline || '', interviewTime: row.interview_time || '',
    nextAction: row.next_action || '', notes: row.notes || '',
    resumeId: row.resume_id || null, resumeVersionId: row.resume_version_id || '',
    coverLetter: row.cover_letter || '', officialApplyUrl: row.job_link || snapshot.applyUrl || '',
    appliedAt: row.applied_at || '', updatedAt: row.updated_at || row.applied_at || '',
    jobSnapshot: snapshot
  };
}

function boardGroup(status) {
  if (['interested', 'preparing'].includes(status)) return 'preparing';
  if (['applied', 'oa'].includes(status)) return 'applied';
  if (['phone_screen', 'interview_1', 'interview_2', 'final'].includes(status)) return 'interview';
  if (status === 'offer') return 'offer';
  return 'closed';
}

function allowedStatusViews(status) {
  return (TRANSITIONS[status] || []).map(value => ({ value, label: STATUS_TEXT[value] }));
}

function ownedApplication(id, userId) {
  return db.prepare('SELECT * FROM applications WHERE id=? AND user_id=?').get(Number(id), userId);
}

router.get('/board', authMiddleware, (req, res) => {
  const keyword = cleanText(req.query.keyword, 120).toLowerCase();
  const rows = db.prepare(`
    SELECT * FROM applications WHERE user_id=? AND COALESCE(archived_at, '')=''
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
    total: list.length
  });
});

router.post('/', authMiddleware, (req, res) => {
  const jobId = cleanText(req.body && req.body.jobId, 200);
  if (!jobId) return fail(res, '缺少 jobId', 400);
  const existing = db.prepare(`
    SELECT id FROM applications
    WHERE user_id=? AND (job_id=? OR source_job_id=?) AND COALESCE(archived_at, '')=''
    ORDER BY id DESC LIMIT 1
  `).get(req.user.userId, jobId, jobId);
  if (existing) return res.status(409).json({ code: -1, message: '该职位已在申请看板中', data: { applicationId: existing.id } });
  const job = findJobById(jobId);
  const snapshot = req.body.jobSnapshot && typeof req.body.jobSnapshot === 'object' ? req.body.jobSnapshot : (job || {});
  const status = ['interested', 'preparing'].includes(req.body.status) ? req.body.status : 'interested';
  const result = db.prepare(`
    INSERT INTO applications
      (user_id, job_id, source_job_id, source_type, job_snapshot, resume_id, status,
       status_text, applied_at, company, job_title, city, salary, job_link, deadline,
       notes, resume_version_id, progress_status, next_action, cover_letter, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    req.user.userId, jobId, jobId, cleanText(req.body.sourceType || 'job', 40), JSON.stringify(snapshot),
    Number(req.body.resumeId) || null, broadStatus(status), STATUS_TEXT[status], new Date().toISOString().slice(0, 10),
    cleanText(snapshot.company, 120), cleanText(snapshot.title, 160), cleanText(snapshot.location, 120),
    cleanText(snapshot.salary, 120), cleanText(snapshot.applyUrl || snapshot.sourceUrl, 1000),
    cleanText(req.body.deadline || snapshot.deadline, 40), cleanText(req.body.notes, 2000),
    cleanText(req.body.resumeVersionId, 120), V4_TO_PROGRESS[status],
    cleanText(req.body.nextAction || '完善申请材料并确认官方截止时间', 300), cleanText(req.body.coverLetter, 10000)
  );
  db.prepare(`
    INSERT INTO application_history (application_id, user_id, from_status, to_status, note, actor_type)
    VALUES (?, ?, '', ?, '加入申请看板', 'user')
  `).run(result.lastInsertRowid, req.user.userId, status);
  db.prepare('UPDATE applications SET v4_status=? WHERE id=?').run(status, result.lastInsertRowid);
  analytics.track(req.user.userId, 'application_added', { applicationId: result.lastInsertRowid, jobId }, '/api/v4/applications');
  return ok(res, applicationView(ownedApplication(result.lastInsertRowid, req.user.userId)), '已加入申请看板');
});

router.post('/:id/official-apply', authMiddleware, (req, res) => {
  const row = ownedApplication(req.params.id, req.user.userId);
  if (!row) return fail(res, '申请记录不存在', 404);
  const snapshot = parseJson(row.job_snapshot, {});
  const url = row.job_link || snapshot.applyUrl || snapshot.sourceUrl || '';
  analytics.track(req.user.userId, 'official_apply_clicked', { applicationId: row.id, jobId: row.source_job_id || row.job_id }, '/api/v4/applications/:id/official-apply');
  return ok(res, { url });
});

router.get('/:id/detail', authMiddleware, (req, res) => {
  const row = ownedApplication(req.params.id, req.user.userId);
  if (!row) return fail(res, '申请记录不存在', 404);
  const history = db.prepare(`
    SELECT id, from_status AS fromStatus, to_status AS toStatus, note,
           actor_type AS actorType, created_at AS createdAt
    FROM application_history WHERE application_id=? AND user_id=? ORDER BY id DESC
  `).all(row.id, req.user.userId);
  const contacts = db.prepare(`
    SELECT id, name, role, email, linkedin, notes, created_at AS createdAt, updated_at AS updatedAt
    FROM application_contacts WHERE application_id=? AND user_id=? ORDER BY id DESC
  `).all(row.id, req.user.userId);
  const tasks = db.prepare(`
    SELECT id, title, due_at AS dueAt, priority, completed,
           created_at AS createdAt, updated_at AS updatedAt
    FROM application_tasks WHERE application_id=? AND user_id=? ORDER BY completed ASC, due_at ASC, id DESC
  `).all(row.id, req.user.userId).map(item => ({ ...item, completed: Boolean(item.completed) }));
  const materials = db.prepare(`
    SELECT id, question_type AS type, question_label AS label, content,
           resume_name AS resumeName, resume_version_id AS resumeVersionId, updated_at AS updatedAt
    FROM application_materials
    WHERE user_id=? AND (job_id=? OR client_id=?) ORDER BY updated_at DESC
  `).all(req.user.userId, String(row.source_job_id || row.job_id), String(row.client_id || ''));
  const match = db.prepare(`
    SELECT score, qualification_status AS qualificationStatus, recommendation,
           strengths, gaps, actions, updated_at AS updatedAt
    FROM job_matches WHERE user_id=? AND job_id=? ORDER BY id DESC LIMIT 1
  `).get(req.user.userId, String(row.source_job_id || row.job_id));
  return ok(res, {
    application: applicationView(row), history, contacts, tasks, materials,
    allowedTransitions: allowedStatusViews(toV4Status(row)),
    match: match ? { ...match, strengths: parseJson(match.strengths, []), gaps: parseJson(match.gaps, []), actions: parseJson(match.actions, []) } : null
  });
});

router.patch('/:id', authMiddleware, (req, res) => {
  const row = ownedApplication(req.params.id, req.user.userId);
  if (!row) return fail(res, '申请记录不存在', 404);
  const value = (key, current, max) => Object.prototype.hasOwnProperty.call(req.body || {}, key) ? cleanText(req.body[key], max) : current || '';
  db.prepare(`
    UPDATE applications SET deadline=?, interview_time=?, notes=?, resume_version_id=?,
      next_action=?, cover_letter=?, updated_at=datetime('now') WHERE id=? AND user_id=?
  `).run(
    value('deadline', row.deadline, 40), value('interviewTime', row.interview_time, 80),
    value('notes', row.notes, 2000), value('resumeVersionId', row.resume_version_id, 120),
    value('nextAction', row.next_action, 300), value('coverLetter', row.cover_letter, 10000),
    row.id, req.user.userId
  );
  return ok(res, applicationView(ownedApplication(row.id, req.user.userId)), '申请详情已更新');
});

router.post('/:id/contacts', authMiddleware, (req, res) => {
  const row = ownedApplication(req.params.id, req.user.userId);
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
  const row = ownedApplication(req.params.id, req.user.userId);
  if (!row) return fail(res, '申请记录不存在', 404);
  const title = cleanText(req.body && req.body.title, 200);
  if (!title) return fail(res, '任务标题不能为空', 400);
  const priority = ['low', 'medium', 'high'].includes(req.body.priority) ? req.body.priority : 'medium';
  const result = db.prepare(`
    INSERT INTO application_tasks (application_id, user_id, title, due_at, priority)
    VALUES (?, ?, ?, ?, ?)
  `).run(row.id, req.user.userId, title, cleanText(req.body.dueAt, 40), priority);
  return ok(res, { id: result.lastInsertRowid, title, priority }, '下一步任务已添加');
});

router.patch('/:id/tasks/:taskId', authMiddleware, (req, res) => {
  const row = ownedApplication(req.params.id, req.user.userId);
  if (!row) return fail(res, '申请记录不存在', 404);
  const task = db.prepare('SELECT * FROM application_tasks WHERE id=? AND application_id=? AND user_id=?').get(Number(req.params.taskId), row.id, req.user.userId);
  if (!task) return fail(res, '任务不存在', 404);
  const completed = Object.prototype.hasOwnProperty.call(req.body || {}, 'completed') ? (req.body.completed ? 1 : 0) : task.completed;
  db.prepare('UPDATE application_tasks SET completed=?, updated_at=datetime(\'now\') WHERE id=?').run(completed, task.id);
  return ok(res, { id: task.id, completed: Boolean(completed) }, '任务已更新');
});

router.patch('/:id/status', authMiddleware, (req, res) => {
  const nextStatus = String(req.body && req.body.status || '').trim();
  if (!STATUS_TEXT[nextStatus]) return fail(res, '无效的申请状态', 400);
  const row = db.prepare('SELECT * FROM applications WHERE id=? AND user_id=?').get(Number(req.params.id), req.user.userId);
  if (!row) return fail(res, '申请记录不存在', 404);
  const currentStatus = toV4Status(row);
  if (currentStatus === nextStatus) return ok(res, { id: row.id, status: nextStatus, statusText: STATUS_TEXT[nextStatus] }, '状态未变化');
  if (!(TRANSITIONS[currentStatus] || []).includes(nextStatus)) {
    return res.status(409).json({
      code: -1,
      message: `不能从“${STATUS_TEXT[currentStatus]}”直接变更为“${STATUS_TEXT[nextStatus]}”`,
      data: { currentStatus, allowedStatuses: TRANSITIONS[currentStatus] || [] }
    });
  }

  const note = String(req.body.note || '').trim().slice(0, 500);
  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE applications SET status=?, status_text=?, progress_status=?, v4_status=?, updated_at=datetime('now')
      WHERE id=? AND user_id=?
    `).run(broadStatus(nextStatus), STATUS_TEXT[nextStatus], V4_TO_PROGRESS[nextStatus], nextStatus, row.id, req.user.userId);
    db.prepare(`
      INSERT INTO application_history
        (application_id, user_id, from_status, to_status, note, actor_type)
      VALUES (?, ?, ?, ?, ?, 'user')
    `).run(row.id, req.user.userId, currentStatus, nextStatus, note);
  });
  transaction();
  const interviewSpace = ['phone_screen', 'interview_1', 'interview_2', 'final'].includes(nextStatus)
    ? ensureSpace(req.user.userId, row.id) : null;
  db.prepare(`INSERT INTO analytics_events (user_id,event_name,route,source,payload) VALUES (?,?,?,?,?)`)
    .run(req.user.userId, 'application_status_changed', '/api/v4/applications/:id/status', 'server', JSON.stringify({ applicationId: row.id, from: currentStatus, to: nextStatus }));
  return ok(res, { id: row.id, status: nextStatus, statusText: STATUS_TEXT[nextStatus], previousStatus: currentStatus,
    interviewSpaceId: interviewSpace && interviewSpace.id || null }, '申请状态已更新');
});

router.get('/:id/history', authMiddleware, (req, res) => {
  const application = db.prepare('SELECT id FROM applications WHERE id=? AND user_id=?').get(Number(req.params.id), req.user.userId);
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
