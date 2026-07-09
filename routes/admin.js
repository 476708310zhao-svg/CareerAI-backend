/**
 * routes/admin.js — 管理后台 API（全部挂载在 /admin/api/ 下）
 */
const express  = require('express');
const router   = express.Router();
const jwt      = require('jsonwebtoken');
const path     = require('path');
const fs       = require('fs');
const multer   = require('multer');
const db       = require('../db/database');
const adminAuth = require('../middleware/adminAuth');
const { parseId } = require('../db/utils');
const { adminLoginLimiter } = require('../middleware/rateLimit');
const companyService = require('../services/companyService');
const { imageExtForMime, isAllowedImageMime, rejectInvalidImage } = require('../utils/uploadSecurity');
const adminJobsStore = require('../utils/adminJobsStore');
const { parsePagination, paginateArray } = require('../utils/pagination');
const adminAccounts = require('../utils/adminAccounts');
const { ALL_ADMIN_PERMISSIONS, PERMISSION_LABELS } = require('../utils/adminPermissions');
const { UPLOAD_DIR, ensureDir } = require('../utils/paths');
const shareConfig = require('../utils/shareConfig');
const featureFlags = require('../utils/featureFlags');
const { USER_PROFILE_SCHEMA, buildUserProfile, normalizeProfilePayload } = require('../utils/userProfileStandard');

function safeJsonParse(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

function normalizeTagList(value) {
  const source = Array.isArray(value)
    ? value
    : String(value || '').split(/[,，、\n]/);
  return [...new Set(source.map(item => String(item || '').trim()).filter(Boolean))];
}

function jsonString(value, fallback) {
  return JSON.stringify(value === undefined ? fallback : value);
}

function booleanFlag(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function makeContentId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function questionRow(row) {
  return Object.assign({}, row, {
    tags: safeJsonParse(row.tags, []),
    isFeatured: !!row.is_featured,
    isPublished: !!row.is_published
  });
}

function starTemplateRow(row) {
  return Object.assign({}, row, {
    id: row.template_id || String(row.id),
    serverId: row.id,
    tags: safeJsonParse(row.tags, []),
    isPublished: !!row.is_published
  });
}

// ─── 管理后台图片上传（Banner 等） ─────────────────────────────────────────────
const adminStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = ensureDir(path.join(UPLOAD_DIR, 'banners'));
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = imageExtForMime(file.mimetype);
    cb(null, `banner_${Date.now()}_${Math.random().toString(36).slice(2, 7)}${ext}`);
  }
});
const adminUpload = multer({
  storage: adminStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!isAllowedImageMime(file.mimetype)) return cb(new Error('只允许 JPG/PNG/WebP/GIF'));
    cb(null, true);
  }
});

router.post('/api/upload/banner', adminAuth, adminUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ code: -1, message: '未收到文件' });
  if (rejectInvalidImage(req.file)) {
    return res.status(400).json({ code: -1, message: '文件内容与格式不符，请上传真实图片' });
  }
  res.json({ code: 0, data: { url: `/uploads/banners/${req.file.filename}` } });
});
router.post('/api/upload/share', adminAuth, adminUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ code: -1, message: '未收到文件' });
  if (rejectInvalidImage(req.file)) {
    return res.status(400).json({ code: -1, message: '文件内容与格式不符，请上传真实图片' });
  }
  res.json({ code: 0, data: { url: `/uploads/banners/${req.file.filename}` } });
});
router.use('/api/upload', (err, req, res, next) => {
  res.status(400).json({ code: -1, message: err.message });
});

// ═══════════════════════════════════════════════════════════════
// 登录
// ═══════════════════════════════════════════════════════════════
router.post('/api/login', adminLoginLimiter, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ code: -1, message: '账号和密码不能为空' });
  }
  const account = adminAccounts.login(username, password);
  if (!account) {
    return res.status(401).json({ code: -1, message: '账号或密码错误' });
  }
  const token = jwt.sign(
    {
      role: 'admin',
      sub: account.username,
      id: account.id,
      adminRole: account.role,
      permissions: account.permissions
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.json({ code: 0, data: { token, username: account.username, account } });
});

router.get('/api/admin-permissions', adminAuth, (req, res) => {
  res.json({
    code: 0,
    data: {
      permissions: ALL_ADMIN_PERMISSIONS.map(id => ({ id, label: PERMISSION_LABELS[id] || id }))
    }
  });
});

router.get('/api/admin-accounts', adminAuth, (req, res) => {
  const { keyword = '' } = req.query;
  res.json({ code: 0, data: adminAccounts.listAccounts(keyword) });
});

router.post('/api/admin-accounts', adminAuth, (req, res) => {
  try {
    const account = adminAccounts.createAccount(req.body || {});
    res.json({ code: 0, message: '后台账号已创建', data: account });
  } catch (err) {
    res.status(400).json({ code: -1, message: err.message || '创建失败' });
  }
});

router.put('/api/admin-accounts/:id', adminAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });
  try {
    const account = adminAccounts.updateAccount(id, req.body || {}, req.admin || {});
    if (!account) return res.status(404).json({ code: -1, message: '后台账号不存在' });
    res.json({ code: 0, message: '后台账号已更新', data: account });
  } catch (err) {
    res.status(400).json({ code: -1, message: err.message || '更新失败' });
  }
});

router.delete('/api/admin-accounts/:id', adminAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });
  try {
    if (!adminAccounts.deleteAccount(id, req.admin || {})) {
      return res.status(404).json({ code: -1, message: '后台账号不存在' });
    }
    res.json({ code: 0, message: '后台账号已删除' });
  } catch (err) {
    res.status(400).json({ code: -1, message: err.message || '删除失败' });
  }
});

// ═══════════════════════════════════════════════════════════════
// 概览统计
// ═══════════════════════════════════════════════════════════════
router.get('/api/stats', adminAuth, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const stats = {
    users:         db.prepare('SELECT COUNT(*) as c FROM users').get().c,
    experiences:   db.prepare('SELECT COUNT(*) as c FROM experiences').get().c,
    comments:      db.prepare('SELECT COUNT(*) as c FROM comments').get().c,
    agencies:      db.prepare('SELECT COUNT(*) as c FROM agencies').get().c,
    companies:     db.prepare('SELECT COUNT(*) as c FROM companies').get().c,
    campus:        db.prepare('SELECT COUNT(*) as c FROM campus_schedules').get().c,
    announcements: db.prepare('SELECT COUNT(*) as c FROM announcements').get().c,
    questions:     db.prepare('SELECT COUNT(*) as c FROM interview_questions').get().c,
    starTemplates: db.prepare('SELECT COUNT(*) as c FROM star_templates').get().c,
    feedbacks:     db.prepare('SELECT COUNT(*) as c FROM feedbacks').get().c,
    jobs:          adminJobsStore.countJobs(),
    todayNewUsers: db.prepare("SELECT COUNT(*) as c FROM users WHERE date(created_at) = ?").get(today).c,
    todayComments: db.prepare("SELECT COUNT(*) as c FROM comments WHERE date(created_at) = ?").get(today).c,
    pendingReviews: db.prepare('SELECT COUNT(*) as c FROM agency_reviews').get().c,
  };
  res.json({ code: 0, data: stats });
});

// ═══════════════════════════════════════════════════════════════
// 功能开关
// ═══════════════════════════════════════════════════════════════
router.get('/api/feature-flags', adminAuth, (_req, res) => {
  res.json({ code: 0, data: featureFlags.listFeatureFlags() });
});

router.put('/api/feature-flags/:feature', adminAuth, (req, res) => {
  try {
    const row = featureFlags.updateFeatureFlag(req.params.feature, !!req.body.enabled);
    res.json({ code: 0, message: '功能开关已更新', data: row });
  } catch (err) {
    const status = err.code === 'UNKNOWN_FEATURE' ? 404 : 400;
    res.status(status).json({ code: -1, message: err.message || '更新失败' });
  }
});

// ═══════════════════════════════════════════════════════════════
// 岗位管理（jobs.json）
// ═══════════════════════════════════════════════════════════════
router.get('/api/jobs', adminAuth, (req, res) => {
  const { keyword = '' } = req.query;
  const result = paginateArray(adminJobsStore.listJobs(keyword), req.query, { pageSize: 15 });
  res.json({ code: 0, data: { list: result.list, total: result.total } });
});

router.post('/api/jobs', adminAuth, (req, res) => {
  const job = adminJobsStore.createJob(req.body);
  res.json({ code: 0, message: '添加成功', data: job });
});

router.put('/api/jobs/:id', adminAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const job = adminJobsStore.updateJob(id, req.body);
  if (!job) return res.status(404).json({ code: -1, message: '职位不存在' });
  res.json({ code: 0, message: '更新成功', data: job });
});

router.delete('/api/jobs/:id', adminAuth, (req, res) => {
  const id = parseInt(req.params.id);
  if (!adminJobsStore.deleteJob(id)) return res.status(404).json({ code: -1, message: '职位不存在' });
  res.json({ code: 0, message: '删除成功' });
});

// 公司管理
router.get('/api/companies', adminAuth, (req, res) => {
  try {
    res.json({ code: 0, data: companyService.listCompanies(req.query) });
  } catch (err) {
    console.error('[admin companies:list]', err);
    res.status(500).json({ code: -1, message: '获取公司列表失败' });
  }
});

router.get('/api/companies/:id', adminAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });
  const company = companyService.getCompanyById(id);
  if (!company) return res.status(404).json({ code: -1, message: '公司不存在' });
  res.json({ code: 0, data: company });
});

router.post('/api/companies/import-seed', adminAuth, (req, res) => {
  try {
    const result = companyService.importSeedCompanies();
    res.json({ code: 0, message: '种子企业已同步', data: result });
  } catch (err) {
    console.error('[admin companies:seed]', err);
    res.status(500).json({ code: -1, message: '同步种子企业失败' });
  }
});

router.post('/api/companies', adminAuth, (req, res) => {
  if (!req.body.display_name && !req.body.name && !req.body.name_en && !req.body.name_zh) {
    return res.status(400).json({ code: -1, message: '公司名称不能为空' });
  }
  try {
    const company = companyService.createCompany(req.body);
    res.json({ code: 0, message: '添加成功', data: company });
  } catch (err) {
    console.error('[admin companies:create]', err);
    res.status(500).json({ code: -1, message: '添加公司失败' });
  }
});

router.put('/api/companies/:id', adminAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });
  try {
    const company = companyService.updateCompany(id, req.body);
    if (!company) return res.status(404).json({ code: -1, message: '公司不存在' });
    res.json({ code: 0, message: '更新成功', data: company });
  } catch (err) {
    console.error('[admin companies:update]', err);
    res.status(500).json({ code: -1, message: '更新公司失败' });
  }
});

router.delete('/api/companies/:id', adminAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });
  const changes = companyService.deleteCompany(id);
  if (!changes) return res.status(404).json({ code: -1, message: '公司不存在' });
  res.json({ code: 0, message: '删除成功' });
});

// ═══════════════════════════════════════════════════════════════
// 面经管理
// ═══════════════════════════════════════════════════════════════
router.get('/api/experiences', adminAuth, (req, res) => {
  const { keyword = '' } = req.query;
  const { pageSize, offset } = parsePagination(req.query, { pageSize: 15 });
  const k = `%${keyword}%`;
  const where = keyword ? 'WHERE title LIKE ? OR company LIKE ? OR user_name LIKE ?' : '';
  const params = keyword ? [k, k, k] : [];
  const total = db.prepare(`SELECT COUNT(*) as c FROM experiences ${where}`).get(...params).c;
  const list  = db.prepare(`SELECT id, user_name, company, position, type, title, likes_count, comments_count, created_at FROM experiences ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
                  .all(...params, Number(pageSize), offset);
  res.json({ code: 0, data: { list, total } });
});

router.delete('/api/experiences/:id', adminAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });
  const r = db.prepare('DELETE FROM experiences WHERE id = ?').run(id);
  if (r.changes === 0) return res.status(404).json({ code: -1, message: '面经不存在' });
  res.json({ code: 0, message: '删除成功' });
});

// ═══════════════════════════════════════════════════════════════
// 评论管理
// ═══════════════════════════════════════════════════════════════
router.get('/api/comments', adminAuth, (req, res) => {
  const { keyword = '' } = req.query;
  const { pageSize, offset } = parsePagination(req.query, { pageSize: 20 });
  const k = `%${keyword}%`;
  const where = keyword ? 'WHERE c.content LIKE ? OR c.user_name LIKE ?' : '';
  const params = keyword ? [k, k] : [];
  const total = db.prepare(`SELECT COUNT(*) as n FROM comments c ${where}`).get(...params).n;
  const list  = db.prepare(`
    SELECT c.id, c.user_name, c.content, c.likes_count, c.created_at,
           e.title as exp_title, e.id as exp_id
    FROM comments c
    LEFT JOIN experiences e ON e.id = c.experience_id
    ${where} ORDER BY c.created_at DESC LIMIT ? OFFSET ?
  `).all(...params, Number(pageSize), offset);
  res.json({ code: 0, data: { list, total } });
});

router.delete('/api/comments/:id', adminAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });
  const c = db.prepare('SELECT experience_id FROM comments WHERE id = ?').get(id);
  if (!c) return res.status(404).json({ code: -1, message: '评论不存在' });
  db.prepare('DELETE FROM comments WHERE id = ?').run(id);
  db.prepare('UPDATE experiences SET comments_count = MAX(0, comments_count - 1) WHERE id = ?').run(c.experience_id);
  res.json({ code: 0, message: '删除成功' });
});

// ═══════════════════════════════════════════════════════════════
// 题库管理
// ═══════════════════════════════════════════════════════════════
router.get('/api/interview-questions', adminAuth, (req, res) => {
  const { keyword = '', category = '', status = '' } = req.query;
  const { pageSize, offset } = parsePagination(req.query, { pageSize: 20 });
  const where = [];
  const params = [];
  if (keyword) {
    const k = `%${keyword}%`;
    where.push('(title LIKE ? OR answer LIKE ? OR tags LIKE ?)');
    params.push(k, k, k);
  }
  if (category) {
    where.push('category = ?');
    params.push(String(category));
  }
  if (status === 'published') where.push('is_published = 1');
  if (status === 'draft') where.push('is_published = 0');
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) as c FROM interview_questions ${whereSql}`).get(...params).c;
  const list = db.prepare(`
    SELECT * FROM interview_questions
    ${whereSql}
    ORDER BY sort_order ASC, updated_at DESC, id DESC
    LIMIT ? OFFSET ?
  `).all(...params, Number(pageSize), offset).map(questionRow);
  res.json({ code: 0, data: { list, total } });
});

router.post('/api/interview-questions', adminAuth, (req, res) => {
  const body = req.body || {};
  const title = String(body.title || body.question || '').trim();
  if (!title) return res.status(400).json({ code: -1, message: '题目不能为空' });
  const questionId = String(body.question_id || body.questionId || body.id || makeContentId('q')).trim();
  const tags = normalizeTagList(body.tags);
  const r = db.prepare(`
    INSERT INTO interview_questions
      (question_id, title, answer, category, difficulty, tags, views, source, is_featured, is_published, sort_order, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    questionId,
    title,
    String(body.answer || ''),
    String(body.category || 'behavior'),
    String(body.difficulty || '中等'),
    jsonString(tags, []),
    Number(body.views) || 0,
    String(body.source || 'admin'),
    body.isFeatured || body.is_featured ? 1 : 0,
    body.isPublished === false || body.is_published === false ? 0 : 1,
    Number(body.sortOrder || body.sort_order) || 0
  );
  const row = db.prepare('SELECT * FROM interview_questions WHERE id = ?').get(r.lastInsertRowid);
  res.json({ code: 0, message: '题目已创建', data: questionRow(row) });
});

router.put('/api/interview-questions/:id', adminAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });
  const body = req.body || {};
  const title = String(body.title || body.question || '').trim();
  if (!title) return res.status(400).json({ code: -1, message: '题目不能为空' });
  const tags = normalizeTagList(body.tags);
  const r = db.prepare(`
    UPDATE interview_questions SET
      title=?, answer=?, category=?, difficulty=?, tags=?, views=?, source=?,
      is_featured=?, is_published=?, sort_order=?, updated_at=datetime('now')
    WHERE id=?
  `).run(
    title,
    String(body.answer || ''),
    String(body.category || 'behavior'),
    String(body.difficulty || '中等'),
    jsonString(tags, []),
    Number(body.views) || 0,
    String(body.source || 'admin'),
    body.isFeatured || body.is_featured ? 1 : 0,
    body.isPublished === false || body.is_published === false ? 0 : 1,
    Number(body.sortOrder || body.sort_order) || 0,
    id
  );
  if (!r.changes) return res.status(404).json({ code: -1, message: '题目不存在' });
  const row = db.prepare('SELECT * FROM interview_questions WHERE id = ?').get(id);
  res.json({ code: 0, message: '题目已更新', data: questionRow(row) });
});

router.delete('/api/interview-questions/:id', adminAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });
  const r = db.prepare('DELETE FROM interview_questions WHERE id = ?').run(id);
  if (!r.changes) return res.status(404).json({ code: -1, message: '题目不存在' });
  res.json({ code: 0, message: '题目已删除' });
});

// ═══════════════════════════════════════════════════════════════
// STAR 模板管理
// ═══════════════════════════════════════════════════════════════
router.get('/api/star-templates', adminAuth, (req, res) => {
  const { keyword = '', role = '', status = '' } = req.query;
  const { pageSize, offset } = parsePagination(req.query, { pageSize: 20 });
  const where = [];
  const params = [];
  if (keyword) {
    const k = `%${keyword}%`;
    where.push('(title LIKE ? OR tags LIKE ? OR situation LIKE ? OR task LIKE ? OR action LIKE ? OR result LIKE ?)');
    params.push(k, k, k, k, k, k);
  }
  if (role) {
    where.push('role = ?');
    params.push(String(role));
  }
  if (status === 'published') where.push('is_published = 1');
  if (status === 'draft') where.push('is_published = 0');
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) as c FROM star_templates ${whereSql}`).get(...params).c;
  const list = db.prepare(`
    SELECT * FROM star_templates
    ${whereSql}
    ORDER BY sort_order ASC, updated_at DESC, id DESC
    LIMIT ? OFFSET ?
  `).all(...params, Number(pageSize), offset).map(starTemplateRow);
  res.json({ code: 0, data: { list, total } });
});

router.post('/api/star-templates', adminAuth, (req, res) => {
  const body = req.body || {};
  const title = String(body.title || '').trim();
  if (!title) return res.status(400).json({ code: -1, message: '模板标题不能为空' });
  const templateId = String(body.template_id || body.templateId || body.id || makeContentId('star')).trim();
  const tags = normalizeTagList(body.tags);
  const r = db.prepare(`
    INSERT INTO star_templates
      (template_id, role, role_label, role_color, title, tags, situation, task, action, result,
       is_published, sort_order, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    templateId,
    String(body.role || 'general'),
    String(body.roleLabel || body.role_label || '通用'),
    String(body.roleColor || body.role_color || '#6B7280'),
    title,
    jsonString(tags, []),
    String(body.situation || ''),
    String(body.task || ''),
    String(body.action || ''),
    String(body.result || ''),
    body.isPublished === false || body.is_published === false ? 0 : 1,
    Number(body.sortOrder || body.sort_order) || 0
  );
  const row = db.prepare('SELECT * FROM star_templates WHERE id = ?').get(r.lastInsertRowid);
  res.json({ code: 0, message: '模板已创建', data: starTemplateRow(row) });
});

router.put('/api/star-templates/:id', adminAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });
  const body = req.body || {};
  const title = String(body.title || '').trim();
  if (!title) return res.status(400).json({ code: -1, message: '模板标题不能为空' });
  const tags = normalizeTagList(body.tags);
  const r = db.prepare(`
    UPDATE star_templates SET
      role=?, role_label=?, role_color=?, title=?, tags=?, situation=?, task=?, action=?, result=?,
      is_published=?, sort_order=?, updated_at=datetime('now')
    WHERE id=?
  `).run(
    String(body.role || 'general'),
    String(body.roleLabel || body.role_label || '通用'),
    String(body.roleColor || body.role_color || '#6B7280'),
    title,
    jsonString(tags, []),
    String(body.situation || ''),
    String(body.task || ''),
    String(body.action || ''),
    String(body.result || ''),
    body.isPublished === false || body.is_published === false ? 0 : 1,
    Number(body.sortOrder || body.sort_order) || 0,
    id
  );
  if (!r.changes) return res.status(404).json({ code: -1, message: '模板不存在' });
  const row = db.prepare('SELECT * FROM star_templates WHERE id = ?').get(id);
  res.json({ code: 0, message: '模板已更新', data: starTemplateRow(row) });
});

router.delete('/api/star-templates/:id', adminAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });
  const r = db.prepare('DELETE FROM star_templates WHERE id = ?').run(id);
  if (!r.changes) return res.status(404).json({ code: -1, message: '模板不存在' });
  res.json({ code: 0, message: '模板已删除' });
});

// ═══════════════════════════════════════════════════════════════
// 校招日历管理
// ═══════════════════════════════════════════════════════════════
router.get('/api/campus', adminAuth, (req, res) => {
  const { keyword = '' } = req.query;
  const { pageSize, offset } = parsePagination(req.query, { pageSize: 15 });
  const k = `%${keyword}%`;
  const where = keyword ? 'WHERE company LIKE ? OR position_name LIKE ? OR industry LIKE ?' : '';
  const params = keyword ? [k, k, k] : [];
  const total = db.prepare(`SELECT COUNT(*) as c FROM campus_schedules ${where}`).get(...params).c;
  const list  = db.prepare(`SELECT * FROM campus_schedules ${where} ORDER BY is_hot DESC, created_at DESC LIMIT ? OFFSET ?`)
                  .all(...params, Number(pageSize), offset);
  res.json({ code: 0, data: { list, total } });
});

router.post('/api/campus', adminAuth, (req, res) => {
  const { company, region = '北美', position_type = '技术', recruit_year = 2026,
          position_name = '', industry = '', start_date = '', deadline_date = '',
          offer_month = '', notes = '', apply_url = '', is_hot = 0 } = req.body;
  if (!company) return res.status(400).json({ code: -1, message: '公司名不能为空' });
  const r = db.prepare(`
    INSERT INTO campus_schedules (company, region, position_type, recruit_year, position_name,
      industry, start_date, deadline_date, offer_month, notes, apply_url, is_hot, is_verified)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(company, region, position_type, recruit_year, position_name,
         industry, start_date, deadline_date, offer_month, notes, apply_url, is_hot ? 1 : 0);
  const row = db.prepare('SELECT * FROM campus_schedules WHERE id = ?').get(r.lastInsertRowid);
  res.json({ code: 0, message: '添加成功', data: row });
});

router.put('/api/campus/:id', adminAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });
  const { company, region, position_type, recruit_year, position_name,
          industry, start_date, deadline_date, offer_month, notes, apply_url, is_hot } = req.body;
  const r = db.prepare(`
    UPDATE campus_schedules SET company=?, region=?, position_type=?, recruit_year=?,
      position_name=?, industry=?, start_date=?, deadline_date=?, offer_month=?,
      notes=?, apply_url=?, is_hot=?
    WHERE id = ?
  `).run(company, region, position_type, recruit_year, position_name,
         industry, start_date, deadline_date, offer_month, notes, apply_url,
         is_hot ? 1 : 0, id);
  if (r.changes === 0) return res.status(404).json({ code: -1, message: '记录不存在' });
  res.json({ code: 0, message: '更新成功' });
});

router.delete('/api/campus/:id', adminAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });
  const r = db.prepare('DELETE FROM campus_schedules WHERE id = ?').run(id);
  if (r.changes === 0) return res.status(404).json({ code: -1, message: '记录不存在' });
  res.json({ code: 0, message: '删除成功' });
});

// ═══════════════════════════════════════════════════════════════
// 机构管理
// ═══════════════════════════════════════════════════════════════
router.get('/api/agencies', adminAuth, (req, res) => {
  const { keyword = '' } = req.query;
  const { pageSize, offset } = parsePagination(req.query, { pageSize: 15 });
  const k = `%${keyword}%`;
  const where = keyword ? 'WHERE name LIKE ? OR city LIKE ? OR type LIKE ?' : '';
  const params = keyword ? [k, k, k] : [];
  const total = db.prepare(`SELECT COUNT(*) as c FROM agencies ${where}`).get(...params).c;
  const list  = db.prepare(`SELECT id, name, type, city, rating_avg, review_count, is_verified, created_at FROM agencies ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
                  .all(...params, Number(pageSize), offset);
  res.json({ code: 0, data: { list, total } });
});

router.put('/api/agencies/:id', adminAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });
  const { name, type, city, description, website, phone, is_verified } = req.body;
  const r = db.prepare(`
    UPDATE agencies SET name=?, type=?, city=?, description=?, website=?, phone=?, is_verified=?
    WHERE id = ?
  `).run(name, type, city, description, website, phone, is_verified ? 1 : 0, id);
  if (r.changes === 0) return res.status(404).json({ code: -1, message: '机构不存在' });
  res.json({ code: 0, message: '更新成功' });
});

router.delete('/api/agencies/:id', adminAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });
  const r = db.prepare('DELETE FROM agencies WHERE id = ?').run(id);
  if (r.changes === 0) return res.status(404).json({ code: -1, message: '机构不存在' });
  res.json({ code: 0, message: '删除成功' });
});

// ─── 机构评价管理 ──────────────────────────────────────────────────────────────
router.get('/api/agency-reviews', adminAuth, (req, res) => {
  const { pageSize, offset } = parsePagination(req.query, { pageSize: 20 });
  const total = db.prepare('SELECT COUNT(*) as c FROM agency_reviews').get().c;
  const list  = db.prepare(`
    SELECT r.id, r.rating_overall, r.title, r.content, r.created_at,
           r.is_anonymous, a.name as agency_name
    FROM agency_reviews r LEFT JOIN agencies a ON a.id = r.agency_id
    ORDER BY r.created_at DESC LIMIT ? OFFSET ?
  `).all(Number(pageSize), offset);
  res.json({ code: 0, data: { list, total } });
});

router.delete('/api/agency-reviews/:id', adminAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });
  const r = db.prepare('DELETE FROM agency_reviews WHERE id = ?').run(id);
  if (r.changes === 0) return res.status(404).json({ code: -1, message: '评价不存在' });
  res.json({ code: 0, message: '删除成功' });
});

// ═══════════════════════════════════════════════════════════════
// 资讯公告管理
// ═══════════════════════════════════════════════════════════════
function normalizeAnnouncementList(value) {
  const parsed = safeJsonParse(value, null);
  return normalizeTagList(Array.isArray(parsed) ? parsed : value);
}

function normalizeAnnouncementPayload(body = {}, defaults = {}) {
  const publishedValue = body.is_published ?? body.isPublished;
  const pinnedValue = body.is_pinned ?? body.isPinned;
  return {
    title: String(body.title ?? defaults.title ?? '').trim(),
    content: String(body.content ?? defaults.content ?? '').trim(),
    category: String(body.category ?? defaults.category ?? '公告').trim() || '公告',
    cover_url: String(body.cover_url ?? body.coverUrl ?? defaults.cover_url ?? '').trim(),
    summary: String(body.summary ?? body.desc ?? defaults.summary ?? '').trim(),
    tags: jsonString(normalizeAnnouncementList(body.tags ?? defaults.tags), []),
    target_roles: jsonString(normalizeAnnouncementList(body.target_roles ?? body.targetRoles ?? defaults.target_roles), []),
    target_regions: jsonString(normalizeAnnouncementList(body.target_regions ?? body.targetRegions ?? defaults.target_regions), []),
    action_type: String(body.action_type ?? body.actionType ?? defaults.action_type ?? '').trim(),
    action_label: String(body.action_label ?? body.actionLabel ?? defaults.action_label ?? '').trim(),
    action_url: String(body.action_url ?? body.actionUrl ?? defaults.action_url ?? '').trim(),
    source_url: String(body.source_url ?? body.sourceUrl ?? defaults.source_url ?? '').trim(),
    sort_order: Number(body.sort_order ?? body.sortOrder ?? defaults.sort_order ?? 0) || 0,
    is_pinned: booleanFlag(pinnedValue ?? defaults.is_pinned) ? 1 : 0,
    is_published: publishedValue === undefined && defaults.is_published === undefined
      ? 1
      : (booleanFlag(publishedValue ?? defaults.is_published) ? 1 : 0)
  };
}

router.get('/api/announcements', adminAuth, (req, res) => {
  const { keyword = '', category = '' } = req.query;
  const { pageSize, offset } = parsePagination(req.query, { pageSize: 15 });
  const where = [];
  const params = [];
  if (keyword) {
    const k = `%${keyword}%`;
    where.push('(title LIKE ? OR content LIKE ? OR summary LIKE ? OR tags LIKE ? OR target_roles LIKE ? OR target_regions LIKE ?)');
    params.push(k, k, k, k, k, k);
  }
  if (category) {
    where.push('category = ?');
    params.push(String(category));
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) as c FROM announcements ${whereSql}`).get(...params).c;
  const list  = db.prepare(`SELECT * FROM announcements ${whereSql} ORDER BY is_pinned DESC, sort_order DESC, created_at DESC LIMIT ? OFFSET ?`)
                  .all(...params, Number(pageSize), offset);
  res.json({ code: 0, data: { list, total } });
});

router.post('/api/announcements', adminAuth, (req, res) => {
  const payload = normalizeAnnouncementPayload(req.body);
  if (!payload.title || !payload.content) return res.status(400).json({ code: -1, message: '标题和内容不能为空' });
  const r = db.prepare(`
    INSERT INTO announcements (
      title, content, category, cover_url, summary, tags, target_roles, target_regions,
      action_type, action_label, action_url, source_url, sort_order, is_pinned, is_published
    )
    VALUES (
      @title, @content, @category, @cover_url, @summary, @tags, @target_roles, @target_regions,
      @action_type, @action_label, @action_url, @source_url, @sort_order, @is_pinned, @is_published
    )
  `).run(payload);
  const row = db.prepare('SELECT * FROM announcements WHERE id = ?').get(r.lastInsertRowid);
  res.json({ code: 0, message: '发布成功', data: row });
});

router.put('/api/announcements/:id', adminAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });
  const existing = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ code: -1, message: '公告不存在' });
  const payload = Object.assign({ id }, normalizeAnnouncementPayload(req.body, existing));
  if (!payload.title || !payload.content) return res.status(400).json({ code: -1, message: '标题和内容不能为空' });
  const r = db.prepare(`
    UPDATE announcements SET
      title=@title,
      content=@content,
      category=@category,
      cover_url=@cover_url,
      summary=@summary,
      tags=@tags,
      target_roles=@target_roles,
      target_regions=@target_regions,
      action_type=@action_type,
      action_label=@action_label,
      action_url=@action_url,
      source_url=@source_url,
      sort_order=@sort_order,
      is_pinned=@is_pinned,
      is_published=@is_published,
      updated_at=datetime('now')
    WHERE id=@id
  `).run(payload);
  if (r.changes === 0) return res.status(404).json({ code: -1, message: '公告不存在' });
  const row = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
  res.json({ code: 0, message: '更新成功', data: row });
});

router.delete('/api/announcements/:id', adminAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });
  const r = db.prepare('DELETE FROM announcements WHERE id = ?').run(id);
  if (r.changes === 0) return res.status(404).json({ code: -1, message: '公告不存在' });
  res.json({ code: 0, message: '删除成功' });
});

// ═══════════════════════════════════════════════════════════════
// 用户反馈管理
// ═══════════════════════════════════════════════════════════════
router.get('/api/feedbacks', adminAuth, (req, res) => {
  const { keyword = '', status = '', type = '' } = req.query;
  const { pageSize, offset } = parsePagination(req.query, { pageSize: 20 });
  const where = [];
  const params = [];
  if (keyword) {
    const k = `%${keyword}%`;
    where.push('(f.content LIKE ? OR f.contact LIKE ? OR u.nickname LIKE ?)');
    params.push(k, k, k);
  }
  if (status) {
    where.push('COALESCE(NULLIF(f.status, \'\'), \'open\') = ?');
    params.push(String(status));
  }
  if (type) {
    where.push('f.type = ?');
    params.push(String(type));
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`
    SELECT COUNT(*) as c
    FROM feedbacks f LEFT JOIN users u ON u.id=f.user_id
    ${whereSql}
  `).get(...params).c;
  const list = db.prepare(`
    SELECT f.*, u.nickname, u.avatar
    FROM feedbacks f LEFT JOIN users u ON u.id=f.user_id
    ${whereSql}
    ORDER BY f.created_at DESC, f.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, Number(pageSize), offset);
  res.json({ code: 0, data: { list, total } });
});

router.put('/api/feedbacks/:id', adminAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });
  const status = String(req.body.status || 'open');
  if (!['open', 'processing', 'resolved', 'ignored'].includes(status)) {
    return res.status(400).json({ code: -1, message: '状态无效' });
  }
  const r = db.prepare(`
    UPDATE feedbacks
    SET status=?, admin_note=?, updated_at=datetime('now')
    WHERE id=?
  `).run(status, String(req.body.adminNote || req.body.admin_note || ''), id);
  if (!r.changes) return res.status(404).json({ code: -1, message: '反馈不存在' });
  const row = db.prepare('SELECT * FROM feedbacks WHERE id=?').get(id);
  res.json({ code: 0, message: '反馈已更新', data: row });
});

router.delete('/api/feedbacks/:id', adminAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });
  const r = db.prepare('DELETE FROM feedbacks WHERE id=?').run(id);
  if (!r.changes) return res.status(404).json({ code: -1, message: '反馈不存在' });
  res.json({ code: 0, message: '反馈已删除' });
});

// ═══════════════════════════════════════════════════════════════
// 用户管理
// ═══════════════════════════════════════════════════════════════
router.get('/api/user-profile-schema', adminAuth, (_req, res) => {
  res.json({ code: 0, data: USER_PROFILE_SCHEMA });
});

router.get('/api/users', adminAuth, (req, res) => {
  const { keyword = '' } = req.query;
  const { pageSize, offset } = parsePagination(req.query, { pageSize: 20 });
  const k = `%${keyword}%`;
  const where = keyword ? 'WHERE nickname LIKE ? OR email LIKE ? OR phone LIKE ?' : '';
  const params = keyword ? [k, k, k] : [];
  const total = db.prepare(`SELECT COUNT(*) as c FROM users ${where}`).get(...params).c;
  const list  = db.prepare(`SELECT id, nickname, avatar, email, phone, vip_level, vip_expires_at, education, job_preference, created_at FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
                  .all(...params, Number(pageSize), offset);
  res.json({
    code: 0,
    data: {
      list: list.map(user => {
        const profile = buildUserProfile(user);
        return {
          ...user,
          school: profile.school,
          major: profile.major,
          degree: profile.degree,
          targetRoles: profile.targetRoles,
          targetLocation: profile.targetLocation,
          profileCompleteness: profile.completeness
        };
      }),
      total
    }
  });
});

router.get('/api/memberships', adminAuth, (req, res) => {
  const { keyword = '', status = 'all' } = req.query;
  const { pageSize, offset } = parsePagination(req.query, { pageSize: 20 });
  const today = new Date().toISOString().slice(0, 10);
  const where = [];
  const params = [];

  if (keyword) {
    const k = `%${keyword}%`;
    where.push('(nickname LIKE ? OR email LIKE ? OR phone LIKE ?)');
    params.push(k, k, k);
  }
  if (status === 'active') {
    where.push('vip_level > 0 AND (vip_expires_at IS NULL OR vip_expires_at = "" OR date(vip_expires_at) >= date(?))');
    params.push(today);
  } else if (status === 'expired') {
    where.push('vip_level > 0 AND vip_expires_at IS NOT NULL AND vip_expires_at != "" AND date(vip_expires_at) < date(?)');
    params.push(today);
  } else if (status === 'normal') {
    where.push('COALESCE(vip_level, 0) = 0');
  } else if (status === 'vip') {
    where.push('vip_level > 0');
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) as c FROM users ${whereSql}`).get(...params).c;
  const list = db.prepare(`
    SELECT id, nickname, avatar, email, phone, vip_level, vip_expires_at, created_at
    FROM users
    ${whereSql}
    ORDER BY
      CASE WHEN vip_level > 0 THEN 0 ELSE 1 END,
      date(COALESCE(vip_expires_at, '9999-12-31')) DESC,
      created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, Number(pageSize), offset);

  const stats = db.prepare(`
    SELECT
      COUNT(*) as totalUsers,
      SUM(CASE WHEN vip_level > 0 AND (vip_expires_at IS NULL OR vip_expires_at = '' OR date(vip_expires_at) >= date(?)) THEN 1 ELSE 0 END) as activeVip,
      SUM(CASE WHEN vip_level > 0 AND vip_expires_at IS NOT NULL AND vip_expires_at != '' AND date(vip_expires_at) < date(?) THEN 1 ELSE 0 END) as expiredVip,
      SUM(CASE WHEN COALESCE(vip_level, 0) = 0 THEN 1 ELSE 0 END) as normalUsers
    FROM users
  `).get(today, today);

  res.json({ code: 0, data: { list, total, stats } });
});

router.put('/api/users/:id/vip', adminAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });
  const vipLevel = Math.max(0, parseInt(req.body.vip_level ?? req.body.vipLevel ?? 0, 10) || 0);
  const vipExpiresAt = vipLevel > 0 ? (req.body.vip_expires_at || req.body.vipExpiresAt || null) : null;
  const r = db.prepare('UPDATE users SET vip_level=?, vip_expires_at=? WHERE id=?')
    .run(vipLevel, vipExpiresAt, id);
  if (r.changes === 0) return res.status(404).json({ code: -1, message: '用户不存在' });
  const user = db.prepare('SELECT id, nickname, email, phone, vip_level, vip_expires_at FROM users WHERE id=?').get(id);
  res.json({ code: 0, message: vipLevel > 0 ? '会员权益已开通/更新' : '会员权益已关闭', data: user });
});

router.get('/api/users/:id', adminAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ code: -1, message: '用户不存在' });
  delete user.openid;
  delete user.password;
  const profile = buildUserProfile(user);
  const resumes = db.prepare('SELECT id, name, language, created_at, updated_at FROM resumes WHERE user_id = ?').all(id);
  const appCount = db.prepare('SELECT COUNT(*) as c FROM applications WHERE user_id = ?').get(id).c;
  const expCount = db.prepare('SELECT COUNT(*) as c FROM experiences WHERE user_id = ?').get(id).c;
  res.json({
    code: 0,
    data: {
      ...user,
      education: JSON.stringify(profile.education),
      job_preference: JSON.stringify(profile.jobPreference),
      profile,
      profileCompleteness: profile.completeness,
      resumes,
      appCount,
      expCount
    }
  });
});

router.put('/api/users/:id', adminAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });
  const { vip_level, vip_expires_at, nickname, email, phone } = req.body;
  const existing = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  if (!existing) return res.status(404).json({ code: -1, message: '用户不存在' });
  const normalized = normalizeProfilePayload(req.body || {}, existing);
  const vipLevel = Math.max(0, parseInt(vip_level ?? 0, 10) || 0);
  const hasVipExpiresAt = Object.prototype.hasOwnProperty.call(req.body, 'vip_expires_at');
  const nextVipExpiresAt = vipLevel > 0
    ? (hasVipExpiresAt ? (vip_expires_at || null) : existing.vip_expires_at)
    : null;
  const r = db.prepare(`
    UPDATE users
    SET vip_level=?, vip_expires_at=?, nickname=?, email=?, phone=?, education=?, job_preference=?
    WHERE id=?
  `).run(
    vipLevel,
    nextVipExpiresAt,
    normalized.user.nickname !== undefined ? normalized.user.nickname : (nickname || ''),
    normalized.user.email !== undefined ? normalized.user.email : (email || ''),
    normalized.user.phone !== undefined ? normalized.user.phone : (phone || ''),
    JSON.stringify(normalized.education),
    JSON.stringify(normalized.jobPreference),
    id
  );
  if (r.changes === 0) return res.status(404).json({ code: -1, message: '用户不存在' });
  res.json({ code: 0, message: '更新成功' });
});

// ═══════════════════════════════════════════════════════════════
// 简历管理
// ═══════════════════════════════════════════════════════════════
router.get('/api/resumes', adminAuth, (req, res) => {
  const { keyword = '' } = req.query;
  const { pageSize, offset } = parsePagination(req.query, { pageSize: 20 });
  const k = `%${keyword}%`;
  const where = keyword ? 'WHERE r.name LIKE ? OR u.nickname LIKE ?' : '';
  const params = keyword ? [k, k] : [];
  const total = db.prepare(`SELECT COUNT(*) as c FROM resumes r LEFT JOIN users u ON u.id=r.user_id ${where}`).get(...params).c;
  const list  = db.prepare(`
    SELECT r.id, r.name, r.language, r.created_at, r.updated_at,
           u.id as user_id, u.nickname, u.avatar
    FROM resumes r LEFT JOIN users u ON u.id = r.user_id
    ${where} ORDER BY r.updated_at DESC LIMIT ? OFFSET ?
  `).all(...params, Number(pageSize), offset);
  res.json({ code: 0, data: { list, total } });
});

router.get('/api/resumes/:id', adminAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });
  const resume = db.prepare(`
    SELECT r.*, u.nickname, u.avatar
    FROM resumes r LEFT JOIN users u ON u.id = r.user_id
    WHERE r.id = ?
  `).get(id);
  if (!resume) return res.status(404).json({ code: -1, message: '简历不存在' });
  res.json({ code: 0, data: resume });
});

router.delete('/api/resumes/:id', adminAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });
  const r = db.prepare('DELETE FROM resumes WHERE id = ?').run(id);
  if (r.changes === 0) return res.status(404).json({ code: -1, message: '简历不存在' });
  res.json({ code: 0, message: '删除成功' });
});

// ═══════════════════════════════════════════════════════════════
// Banner 管理
// ═══════════════════════════════════════════════════════════════
router.get('/api/banners', adminAuth, (req, res) => {
  const list = db.prepare('SELECT * FROM banners ORDER BY sort_order ASC, id DESC').all();
  res.json({ code: 0, data: list });
});

router.post('/api/banners', adminAuth, (req, res) => {
  const { title, subtitle = '', icon = '🎯', gradient, image_url = '', url = '', sort_order = 0, is_active = 1 } = req.body;
  if (!title) return res.status(400).json({ code: -1, message: '标题不能为空' });
  const defaultGradient = 'linear-gradient(135deg,#1C3578 0%,#2B5CE6 100%)';
  const r = db.prepare(`
    INSERT INTO banners (title, subtitle, icon, gradient, image_url, url, sort_order, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, subtitle, icon, gradient || defaultGradient, image_url, url, sort_order, is_active ? 1 : 0);
  const row = db.prepare('SELECT * FROM banners WHERE id = ?').get(r.lastInsertRowid);
  res.json({ code: 0, message: '添加成功', data: row });
});

router.put('/api/banners/:id', adminAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });
  const { title, subtitle, icon, gradient, image_url, url, sort_order, is_active } = req.body;
  const r = db.prepare(`
    UPDATE banners SET title=?, subtitle=?, icon=?, gradient=?, image_url=?, url=?, sort_order=?, is_active=?, updated_at=datetime('now')
    WHERE id=?
  `).run(title, subtitle, icon, gradient, image_url || '', url, sort_order ?? 0, is_active ? 1 : 0, id);
  if (r.changes === 0) return res.status(404).json({ code: -1, message: 'Banner 不存在' });
  res.json({ code: 0, message: '更新成功' });
});

router.delete('/api/banners/:id', adminAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });
  const r = db.prepare('DELETE FROM banners WHERE id = ?').run(id);
  if (r.changes === 0) return res.status(404).json({ code: -1, message: 'Banner 不存在' });
  res.json({ code: 0, message: '删除成功' });
});

// ═══════════════════════════════════════════════════════════════
// 分享配置
// ═══════════════════════════════════════════════════════════════
router.get('/api/share-configs', adminAuth, (_req, res) => {
  res.json({ code: 0, data: shareConfig.listShareConfigs() });
});

router.post('/api/share-configs', adminAuth, (req, res) => {
  try {
    const row = shareConfig.createShareConfig(req.body || {});
    res.json({ code: 0, message: '添加成功', data: row });
  } catch (err) {
    res.status(400).json({ code: -1, message: err.message || '添加失败' });
  }
});

router.put('/api/share-configs/:id', adminAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });
  try {
    const row = shareConfig.updateShareConfig(id, req.body || {});
    if (!row) return res.status(404).json({ code: -1, message: '分享配置不存在' });
    res.json({ code: 0, message: '更新成功', data: row });
  } catch (err) {
    res.status(400).json({ code: -1, message: err.message || '更新失败' });
  }
});

router.delete('/api/share-configs/:id', adminAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });
  try {
    if (!shareConfig.deleteShareConfig(id)) {
      return res.status(404).json({ code: -1, message: '分享配置不存在' });
    }
    res.json({ code: 0, message: '删除成功' });
  } catch (err) {
    res.status(400).json({ code: -1, message: err.message || '删除失败' });
  }
});

module.exports = router;
