const express = require('express');
const db = require('../../db/database');
const { authMiddleware } = require('../../middleware/auth');
const { consumeDailyLimit, getQuotaStatus } = require('../../utils/aiQuota');
const center = require('../../services/v4ResumeCenter');
const analytics = require('../../services/v4Analytics');

const router = express.Router();
router.use(authMiddleware);

function fail(res, error) {
  return res.status(error.status || 500).json({
    code: error.code || -1,
    message: error.message || '服务器错误',
    data: error.details ? { details: error.details } : undefined
  });
}

function experienceView(row) {
  return {
    id: row.id, type: row.type, title: row.title, organization: row.organization || '',
    startDate: row.start_date || '', endDate: row.end_date || '',
    content: center.parseJson(row.content, {}), verified: row.verified !== 0,
    archived: !!row.archived_at, createdAt: row.created_at, updatedAt: row.updated_at
  };
}

function resumeView(row) {
  return {
    id: row.id, name: row.name, language: row.language, resumeType: center.normalizeResumeType(row.resume_type),
    isDefault: !!row.is_default, archived: !!row.archived_at, targetRole: row.target_role || '',
    targetJobId: row.target_job_id || '', currentVersionId: row.current_version_id || null,
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}

function ownedApplication(userId, id) {
  if (!id) return null;
  return db.prepare('SELECT * FROM applications WHERE id=? AND user_id=?').get(Number(id), userId);
}

router.get('/templates', (_req, res) => {
  res.json({ code: 0, data: [
    { code: 'sde', name: 'SDE Resume' },
    { code: 'ai_engineer', name: 'AI Engineer Resume' },
    { code: 'data', name: 'Data Resume' },
    { code: 'quant', name: 'Quant Resume' },
    { code: 'general', name: 'General Resume' }
  ] });
});

router.get('/experiences', (req, res) => {
  const type = center.cleanText(req.query.type, 30);
  const params = [req.user.userId];
  let where = "user_id=? AND archived_at=''";
  if (type) { where += ' AND type=?'; params.push(type); }
  const rows = db.prepare(`SELECT * FROM career_experience_library WHERE ${where} ORDER BY updated_at DESC, id DESC`).all(...params);
  res.json({ code: 0, data: rows.map(experienceView) });
});

router.post('/experiences', (req, res) => {
  const body = req.body || {};
  const type = center.cleanText(body.type, 30);
  const title = center.cleanText(body.title, 160);
  if (!center.EXPERIENCE_TYPES.includes(type) || !title) return res.status(400).json({ code: -1, message: '经历类型或标题无效' });
  const result = db.prepare(`
    INSERT INTO career_experience_library (user_id, type, title, organization, start_date, end_date, content, verified)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.userId, type, title, center.cleanText(body.organization, 160), center.cleanText(body.startDate, 30),
    center.cleanText(body.endDate, 30), JSON.stringify(body.content || {}), body.verified === false ? 0 : 1);
  res.status(201).json({ code: 0, data: experienceView(db.prepare('SELECT * FROM career_experience_library WHERE id=?').get(result.lastInsertRowid)) });
});

router.patch('/experiences/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM career_experience_library WHERE id=? AND user_id=?').get(Number(req.params.id), req.user.userId);
  if (!row) return res.status(404).json({ code: -1, message: '经历不存在' });
  const body = req.body || {};
  const type = body.type === undefined ? row.type : center.cleanText(body.type, 30);
  const title = body.title === undefined ? row.title : center.cleanText(body.title, 160);
  if (!center.EXPERIENCE_TYPES.includes(type) || !title) return res.status(400).json({ code: -1, message: '经历类型或标题无效' });
  db.prepare(`UPDATE career_experience_library SET type=?, title=?, organization=?, start_date=?, end_date=?, content=?, verified=?, updated_at=datetime('now') WHERE id=? AND user_id=?`)
    .run(type, title, body.organization === undefined ? row.organization : center.cleanText(body.organization, 160),
      body.startDate === undefined ? row.start_date : center.cleanText(body.startDate, 30),
      body.endDate === undefined ? row.end_date : center.cleanText(body.endDate, 30),
      body.content === undefined ? row.content : JSON.stringify(body.content || {}),
      body.verified === undefined ? row.verified : (body.verified ? 1 : 0), row.id, req.user.userId);
  res.json({ code: 0, data: experienceView(db.prepare('SELECT * FROM career_experience_library WHERE id=?').get(row.id)) });
});

router.post('/experiences/:id/archive', (req, res) => {
  const result = db.prepare("UPDATE career_experience_library SET archived_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND user_id=?")
    .run(Number(req.params.id), req.user.userId);
  if (!result.changes) return res.status(404).json({ code: -1, message: '经历不存在' });
  res.json({ code: 0, message: '经历已归档' });
});

router.get('/', (req, res) => {
  const includeArchived = req.query.includeArchived === 'true';
  const rows = db.prepare(`SELECT * FROM resumes WHERE user_id=? ${includeArchived ? '' : "AND COALESCE(archived_at, '')=''"} ORDER BY is_default DESC, updated_at DESC`)
    .all(req.user.userId);
  rows.forEach(row => center.ensureCurrentVersion(req.user.userId, row.id));
  const refreshed = db.prepare(`SELECT * FROM resumes WHERE user_id=? ${includeArchived ? '' : "AND COALESCE(archived_at, '')=''"} ORDER BY is_default DESC, updated_at DESC`)
    .all(req.user.userId);
  res.json({ code: 0, data: refreshed.map(resumeView) });
});

router.post('/', (req, res) => {
  const body = req.body || {};
  const name = center.cleanText(body.name, 80) || '新简历';
  const resumeType = center.normalizeResumeType(body.resumeType);
  const isDefault = body.isDefault === true || !db.prepare("SELECT id FROM resumes WHERE user_id=? AND COALESCE(archived_at, '')='' LIMIT 1").get(req.user.userId);
  const tx = db.transaction(() => {
    if (isDefault) db.prepare('UPDATE resumes SET is_default=0 WHERE user_id=?').run(req.user.userId);
    const result = db.prepare(`INSERT INTO resumes (user_id, name, language, data, is_default, target_role, target_job_id, resume_type, archived_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', datetime('now'))`)
      .run(req.user.userId, name, center.cleanText(body.language || 'en', 10), JSON.stringify(body.content || {}), isDefault ? 1 : 0,
        center.cleanText(body.targetRole, 120), center.cleanText(body.targetJobId, 120), resumeType);
    center.ensureCurrentVersion(req.user.userId, result.lastInsertRowid);
    return result.lastInsertRowid;
  });
  const id = tx();
  res.status(201).json({ code: 0, data: resumeView(db.prepare('SELECT * FROM resumes WHERE id=?').get(id)) });
});

router.get('/:id/versions', (req, res) => {
  const owned = center.ensureCurrentVersion(req.user.userId, Number(req.params.id));
  if (!owned) return res.status(404).json({ code: -1, message: '简历不存在' });
  const rows = db.prepare('SELECT * FROM resume_versions_v4 WHERE resume_id=? AND user_id=? ORDER BY version_no DESC').all(owned.resume.id, req.user.userId);
  res.json({ code: 0, data: rows.map(center.versionView) });
});

router.get('/:id/versions/compare', (req, res) => {
  const resumeId = Number(req.params.id);
  const left = db.prepare('SELECT * FROM resume_versions_v4 WHERE id=? AND resume_id=? AND user_id=?').get(Number(req.query.from), resumeId, req.user.userId);
  const right = db.prepare('SELECT * FROM resume_versions_v4 WHERE id=? AND resume_id=? AND user_id=?').get(Number(req.query.to), resumeId, req.user.userId);
  if (!left || !right) return res.status(404).json({ code: -1, message: '对比版本不存在' });
  res.json({ code: 0, data: { from: center.versionView(left), to: center.versionView(right), changes: center.compareContent(center.parseJson(left.content, {}), center.parseJson(right.content, {})) } });
});

router.post('/:id/versions/:versionId/restore', (req, res) => {
  const source = db.prepare('SELECT * FROM resume_versions_v4 WHERE id=? AND resume_id=? AND user_id=?').get(Number(req.params.versionId), Number(req.params.id), req.user.userId);
  if (!source) return res.status(404).json({ code: -1, message: '恢复版本不存在' });
  try {
    const version = center.createVersion({ userId: req.user.userId, resumeId: source.resume_id, content: center.parseJson(source.content, {}), sourceVersionId: source.id, summary: `恢复自 V${source.version_no}`, createdBy: 'restore' });
    res.status(201).json({ code: 0, data: version, message: '已创建恢复版本，历史版本保持不变' });
  } catch (error) { fail(res, error); }
});

router.post('/:id/copy', (req, res) => {
  const owned = center.ensureCurrentVersion(req.user.userId, Number(req.params.id));
  if (!owned) return res.status(404).json({ code: -1, message: '简历不存在' });
  const name = center.cleanText(req.body && req.body.name, 80) || `${owned.resume.name} - 副本`;
  const result = db.prepare(`INSERT INTO resumes (user_id, name, language, data, is_default, target_role, target_job_id, resume_type, archived_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?, '', datetime('now'))`)
    .run(req.user.userId, name, owned.resume.language, owned.version.content, owned.resume.target_role, owned.resume.target_job_id, owned.resume.resume_type || 'general');
  center.ensureCurrentVersion(req.user.userId, result.lastInsertRowid);
  res.status(201).json({ code: 0, data: resumeView(db.prepare('SELECT * FROM resumes WHERE id=?').get(result.lastInsertRowid)) });
});

router.patch('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM resumes WHERE id=? AND user_id=?').get(Number(req.params.id), req.user.userId);
  if (!row) return res.status(404).json({ code: -1, message: '简历不存在' });
  const name = req.body.name === undefined ? row.name : center.cleanText(req.body.name, 80);
  if (!name) return res.status(400).json({ code: -1, message: '简历名称不能为空' });
  db.prepare('UPDATE resumes SET name=?, resume_type=?, target_role=?, target_job_id=?, updated_at=datetime(\'now\') WHERE id=? AND user_id=?')
    .run(name, req.body.resumeType === undefined ? row.resume_type : center.normalizeResumeType(req.body.resumeType),
      req.body.targetRole === undefined ? row.target_role : center.cleanText(req.body.targetRole, 120),
      req.body.targetJobId === undefined ? row.target_job_id : center.cleanText(req.body.targetJobId, 120), row.id, req.user.userId);
  res.json({ code: 0, data: resumeView(db.prepare('SELECT * FROM resumes WHERE id=?').get(row.id)) });
});

router.post('/:id/default', (req, res) => {
  const row = db.prepare('SELECT id FROM resumes WHERE id=? AND user_id=? AND COALESCE(archived_at, \'\')=\'\'').get(Number(req.params.id), req.user.userId);
  if (!row) return res.status(404).json({ code: -1, message: '简历不存在或已归档' });
  db.transaction(() => {
    db.prepare('UPDATE resumes SET is_default=0 WHERE user_id=?').run(req.user.userId);
    db.prepare('UPDATE resumes SET is_default=1, updated_at=datetime(\'now\') WHERE id=?').run(row.id);
  })();
  res.json({ code: 0, message: '已设为默认简历' });
});

router.post('/:id/archive', (req, res) => {
  const result = db.prepare("UPDATE resumes SET archived_at=datetime('now'), is_default=0, updated_at=datetime('now') WHERE id=? AND user_id=?")
    .run(Number(req.params.id), req.user.userId);
  if (!result.changes) return res.status(404).json({ code: -1, message: '简历不存在' });
  res.json({ code: 0, message: '简历已归档' });
});

router.post('/:id/links', (req, res) => {
  const resume = db.prepare('SELECT id FROM resumes WHERE id=? AND user_id=?').get(Number(req.params.id), req.user.userId);
  if (!resume) return res.status(404).json({ code: -1, message: '简历不存在' });
  const applicationId = Number(req.body && req.body.applicationId) || null;
  const application = ownedApplication(req.user.userId, applicationId);
  if (applicationId && !application) return res.status(404).json({ code: -1, message: '申请记录不存在' });
  const jobId = center.cleanText((req.body && req.body.jobId) || (application && application.job_id), 120);
  if (!jobId && !applicationId) return res.status(400).json({ code: -1, message: '目标岗位或申请记录至少填写一项' });
  db.prepare('INSERT OR IGNORE INTO resume_job_links (resume_id, user_id, job_id, application_id) VALUES (?, ?, ?, ?)')
    .run(resume.id, req.user.userId, jobId, applicationId);
  if (applicationId) db.prepare('UPDATE applications SET resume_id=?, resume_version_id=? WHERE id=? AND user_id=?')
    .run(resume.id, center.ensureCurrentVersion(req.user.userId, resume.id).version.id, applicationId, req.user.userId);
  const links = db.prepare('SELECT id, job_id AS jobId, application_id AS applicationId, created_at AS createdAt FROM resume_job_links WHERE resume_id=? AND user_id=?').all(resume.id, req.user.userId);
  res.json({ code: 0, data: links });
});

router.post('/:id/ai-change-sets', (req, res) => {
  if (!consumeDailyLimit(req, res, 'resume_optimize')) return;
  const applicationId = Number(req.body && req.body.applicationId) || null;
  if (applicationId && !ownedApplication(req.user.userId, applicationId)) return res.status(404).json({ code: -1, message: '申请记录不存在' });
  try {
    const data = center.createChangeSet({ userId: req.user.userId, resumeId: Number(req.params.id), jobId: req.body.jobId,
      applicationId, suggestions: req.body.suggestions, jdText: req.body.jdText });
    analytics.track(req.user.userId, 'resume_optimize_started', { resumeId: Number(req.params.id), changeSetId: data.id }, '/api/v4/resumes/:id/ai-change-sets');
    res.status(201).json({ code: 0, data: Object.assign(data, { quota: getQuotaStatus(req.user.userId) }), message: 'AI 建议已生成，确认前不会修改简历' });
  } catch (error) { fail(res, error); }
});

router.get('/ai-change-sets/:changeSetId', (req, res) => {
  const data = center.getChangeSet(req.user.userId, Number(req.params.changeSetId));
  if (!data) return res.status(404).json({ code: -1, message: '修改方案不存在' });
  res.json({ code: 0, data });
});

router.post('/ai-change-sets/:changeSetId/confirm', (req, res) => {
  try {
    const data = center.confirmChangeSet({ userId: req.user.userId, changeSetId: Number(req.params.changeSetId),
      decisions: req.body && req.body.decisions || {}, manualContent: req.body && req.body.manualContent });
    analytics.track(req.user.userId, 'resume_suggestions_accepted', { changeSetId: Number(req.params.changeSetId), decisions: req.body && req.body.decisions || {} }, '/api/v4/resumes/ai-change-sets/:id/confirm');
    res.status(201).json({ code: 0, data, message: '已保存为新版本，原版本未被覆盖' });
  } catch (error) { fail(res, error); }
});

router.post('/ai-change-sets/:changeSetId/reject', (req, res) => {
  const result = db.prepare("UPDATE resume_ai_change_sets SET status='rejected', decisions=?, confirmed_at=datetime('now') WHERE id=? AND user_id=? AND status='pending'")
    .run(JSON.stringify(req.body && req.body.decisions || {}), Number(req.params.changeSetId), req.user.userId);
  if (!result.changes) return res.status(409).json({ code: -1, message: '修改方案不存在或已处理' });
  res.json({ code: 0, message: '已拒绝，简历未发生变化' });
});

module.exports = router;
