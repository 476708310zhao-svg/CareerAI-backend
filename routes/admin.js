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
    jobs:          adminJobsStore.countJobs(),
    todayNewUsers: db.prepare("SELECT COUNT(*) as c FROM users WHERE date(created_at) = ?").get(today).c,
    todayComments: db.prepare("SELECT COUNT(*) as c FROM comments WHERE date(created_at) = ?").get(today).c,
    pendingReviews: db.prepare('SELECT COUNT(*) as c FROM agency_reviews').get().c,
  };
  res.json({ code: 0, data: stats });
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
router.get('/api/announcements', adminAuth, (req, res) => {
  const { pageSize, offset } = parsePagination(req.query, { pageSize: 15 });
  const total = db.prepare('SELECT COUNT(*) as c FROM announcements').get().c;
  const list  = db.prepare('SELECT * FROM announcements ORDER BY is_pinned DESC, created_at DESC LIMIT ? OFFSET ?')
                  .all(Number(pageSize), offset);
  res.json({ code: 0, data: { list, total } });
});

router.post('/api/announcements', adminAuth, (req, res) => {
  const { title, content, category = '公告', cover_url = '', is_pinned = 0, is_published = 1 } = req.body;
  if (!title || !content) return res.status(400).json({ code: -1, message: '标题和内容不能为空' });
  const r = db.prepare(`
    INSERT INTO announcements (title, content, category, cover_url, is_pinned, is_published)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(title, content, category, cover_url, is_pinned ? 1 : 0, is_published ? 1 : 0);
  const row = db.prepare('SELECT * FROM announcements WHERE id = ?').get(r.lastInsertRowid);
  res.json({ code: 0, message: '发布成功', data: row });
});

router.put('/api/announcements/:id', adminAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });
  const { title, content, category, cover_url, is_pinned, is_published } = req.body;
  const r = db.prepare(`
    UPDATE announcements SET title=?, content=?, category=?, cover_url=?,
      is_pinned=?, is_published=?, updated_at=datetime('now') WHERE id=?
  `).run(title, content, category, cover_url, is_pinned ? 1 : 0, is_published ? 1 : 0, id);
  if (r.changes === 0) return res.status(404).json({ code: -1, message: '公告不存在' });
  res.json({ code: 0, message: '更新成功' });
});

router.delete('/api/announcements/:id', adminAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });
  const r = db.prepare('DELETE FROM announcements WHERE id = ?').run(id);
  if (r.changes === 0) return res.status(404).json({ code: -1, message: '公告不存在' });
  res.json({ code: 0, message: '删除成功' });
});

// ═══════════════════════════════════════════════════════════════
// 用户管理
// ═══════════════════════════════════════════════════════════════
router.get('/api/users', adminAuth, (req, res) => {
  const { keyword = '' } = req.query;
  const { pageSize, offset } = parsePagination(req.query, { pageSize: 20 });
  const k = `%${keyword}%`;
  const where = keyword ? 'WHERE nickname LIKE ? OR email LIKE ? OR phone LIKE ?' : '';
  const params = keyword ? [k, k, k] : [];
  const total = db.prepare(`SELECT COUNT(*) as c FROM users ${where}`).get(...params).c;
  const list  = db.prepare(`SELECT id, nickname, avatar, email, phone, vip_level, vip_expires_at, education, job_preference, created_at FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
                  .all(...params, Number(pageSize), offset);
  res.json({ code: 0, data: { list, total } });
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
  const resumes = db.prepare('SELECT id, name, language, created_at, updated_at FROM resumes WHERE user_id = ?').all(id);
  const appCount = db.prepare('SELECT COUNT(*) as c FROM applications WHERE user_id = ?').get(id).c;
  const expCount = db.prepare('SELECT COUNT(*) as c FROM experiences WHERE user_id = ?').get(id).c;
  res.json({ code: 0, data: { ...user, resumes, appCount, expCount } });
});

router.put('/api/users/:id', adminAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });
  const { vip_level, vip_expires_at, nickname, email, phone } = req.body;
  const existing = db.prepare('SELECT vip_expires_at FROM users WHERE id=?').get(id);
  if (!existing) return res.status(404).json({ code: -1, message: '用户不存在' });
  const vipLevel = Math.max(0, parseInt(vip_level ?? 0, 10) || 0);
  const hasVipExpiresAt = Object.prototype.hasOwnProperty.call(req.body, 'vip_expires_at');
  const nextVipExpiresAt = vipLevel > 0
    ? (hasVipExpiresAt ? (vip_expires_at || null) : existing.vip_expires_at)
    : null;
  const r = db.prepare('UPDATE users SET vip_level=?, vip_expires_at=?, nickname=?, email=?, phone=? WHERE id=?')
              .run(vipLevel, nextVipExpiresAt, nickname || '', email || '', phone || '', id);
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
