const express = require('express');
const router  = express.Router();
const axios   = require('axios');
const db      = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { sendToUser } = require('./notify');

const { parseId } = require('../db/utils');
const { formatApp } = require('../db/formatters');
const { ja } = require('../db/utils');
const { findJobById, findJobsByIds, toApplicationJob } = require('../utils/jobData');

// ─── 获取申请列表 ─────────────────────────────────────────────────────────────
router.get('/', authMiddleware, (req, res) => {
  try {
    const { status } = req.query;

    // 一次查出所有申请（用于统计），再按条件过滤展示列表，避免重复查询
    const all = db.prepare('SELECT * FROM applications WHERE user_id = ? ORDER BY applied_at DESC').all(req.user.userId);

    const filtered = status ? all.filter(a => a.status === status) : all;

    // 收集所有需要补全 job 信息的本地 job_id（有 snapshot 的跳过），一次 IN 查询替代 N+1
    const localIds = filtered
      .filter(a => { try { return !JSON.parse(a.job_snapshot || '{}').title; } catch(e) { return true; } })
      .map(a => parseInt(a.job_id))
      .filter(id => !isNaN(id));

    const jobMap = findJobsByIds(localIds);

    const list = filtered.map(a => {
      const app = formatApp(a);
      if (!app.jobSnapshot || !app.jobSnapshot.title) {
        const j = toApplicationJob(jobMap[String(parseInt(a.job_id))]);
        if (j) app.job = j;
      }
      return app;
    });

    const count = (s) => all.filter(a => a.status === s).length;

    res.json({
      code: 0, message: 'success',
      data: {
        list, total: list.length,
        statistics: {
          total: all.length,
          applied: count('applied'), viewed: count('viewed'),
          interview: count('interview'), offer: count('offer'), rejected: count('rejected')
        }
      }
    });
  } catch (error) {
    console.error(error); res.status(500).json({ code: -1, message: '服务器内部错误' });
  }
});

// ─── 申请详情 ─────────────────────────────────────────────────────────────────
router.get('/:id', authMiddleware, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });
  const a = db.prepare('SELECT * FROM applications WHERE id = ? AND user_id = ?').get(id, req.user.userId);
  if (!a) return res.status(404).json({ code: -1, message: '申请记录不存在' });
  const app = formatApp(a);
  const job = toApplicationJob(findJobById(a.job_id));
  const resume = db.prepare('SELECT * FROM resumes WHERE id = ?').get(a.resume_id);
  res.json({ code: 0, message: 'success', data: { ...app, job: job || null,
    resume: resume ? { ...resume, education: ja(resume.education), skills: ja(resume.skills) } : null } });
});

// ─── 创建申请 ─────────────────────────────────────────────────────────────────
router.post('/', authMiddleware, (req, res) => {
  try {
    const { jobId, resumeId, jobSnapshot } = req.body;
    if (!jobId) return res.status(400).json({ code: -1, message: '缺少 jobId' });

    const exists = db.prepare('SELECT id FROM applications WHERE user_id = ? AND job_id = ?').get(req.user.userId, String(jobId));
    if (exists) return res.status(400).json({ code: -1, message: '您已经投递过该职位' });

    const result = db.prepare(`
      INSERT INTO applications (user_id, job_id, job_snapshot, resume_id, status, status_text)
      VALUES (?, ?, ?, ?, 'applied', '已投递')
    `).run(req.user.userId, String(jobId), JSON.stringify(jobSnapshot || {}), resumeId || null);

    const newApp = db.prepare('SELECT * FROM applications WHERE id = ?').get(result.lastInsertRowid);

    // 写站内消息通知
    const snap = jobSnapshot || {};
    sendToUser(req.user.userId, {
      type:    'application',
      title:   '投递成功',
      content: `你已成功投递「${snap.company || ''}${snap.company && snap.title ? ' · ' : ''}${snap.title || '职位'}」，请等待HR审核`,
      templateId: process.env.WX_TPL_APPLICATION,
      wxData: {
        thing1: { value: (snap.title  || '职位').slice(0, 20) },
        thing2: { value: (snap.company || '').slice(0, 20) },
        phrase3: { value: '已投递' }
      }
    }).catch(() => {});

    res.json({ code: 0, message: '投递成功', data: formatApp(newApp) });
  } catch (error) {
    console.error(error); res.status(500).json({ code: -1, message: '服务器内部错误' });
  }
});

// ─── 撤回申请 ─────────────────────────────────────────────────────────────────
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ code: -1, message: '参数无效' });
    const a = db.prepare('SELECT * FROM applications WHERE id = ? AND user_id = ?').get(id, req.user.userId);
    if (!a) return res.status(404).json({ code: -1, message: '申请记录不存在' });
    if (a.status !== 'applied') return res.status(400).json({ code: -1, message: '该申请已被查看，无法撤回' });
    db.prepare('DELETE FROM applications WHERE id = ?').run(a.id);
    res.json({ code: 0, message: '撤回成功' });
  } catch (error) {
    console.error(error); res.status(500).json({ code: -1, message: '服务器内部错误' });
  }
});

// ─── 开启/关闭追踪 ────────────────────────────────────────────────────────────
// PUT /api/applications/:id/track
// Body: { tracking: 1|0 }
router.put('/:id/track', authMiddleware, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });
  const a = db.prepare('SELECT id FROM applications WHERE id=? AND user_id=?').get(id, req.user.userId);
  if (!a) return res.status(404).json({ code: -1, message: '申请不存在' });
  const tracking = req.body.tracking ? 1 : 0;
  db.prepare('UPDATE applications SET tracking=? WHERE id=?').run(tracking, id);
  res.json({ code: 0, message: tracking ? '已开启追踪' : '已关闭追踪' });
});

// ─── N8N 轮询接口（CRON_SECRET 鉴权） ─────────────────────────────────────────
// POST /api/applications/poll-status
// Header: X-Cron-Secret: <secret>
// 检查所有开启追踪的 Greenhouse/Lever 申请，职位关闭时推送微信通知
router.post('/poll-status', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = req.headers['x-cron-secret'];
    if (!provided || provided !== secret) {
      return res.status(401).json({ code: -1, message: 'unauthorized' });
    }
  }

  const tracked = db.prepare(`
    SELECT a.id, a.user_id, a.source_type, a.source_job_id, a.source_slug,
           a.job_active, a.status, a.job_snapshot
    FROM applications a
    WHERE a.tracking = 1
      AND a.source_type IN ('greenhouse', 'lever')
      AND a.source_job_id != ''
      AND a.status NOT IN ('offer', 'rejected')
  `).all();

  const results = [];
  const errors  = [];

  for (const app of tracked) {
    try {
      const isActive = await _checkJobActive(app.source_type, app.source_slug, app.source_job_id);
      const now = new Date().toISOString();
      db.prepare('UPDATE applications SET last_checked_at=? WHERE id=?').run(now, app.id);

      if (isActive !== null && !isActive && app.job_active !== 0) {
        // 职位刚刚关闭
        db.prepare('UPDATE applications SET job_active=0 WHERE id=?').run(app.id);

        let companyName = '';
        let jobTitle = '';
        try {
          const snap = JSON.parse(app.job_snapshot || '{}');
          companyName = snap.company || '';
          jobTitle    = snap.title   || '';
        } catch (e) {}

        await sendToUser(app.user_id, {
          type:     'application_update',
          title:    '职位状态变化',
          content:  `${companyName}${jobTitle ? ' · ' + jobTitle : ''} 的职位已从招聘页下线，建议关注投递进展`,
          templateId: process.env.WX_TPL_APPLICATION || '',
          wxData: {
            thing1:  { value: (companyName + (jobTitle ? ' - ' + jobTitle : '')).slice(0, 20) || '职位追踪' },
            phrase2: { value: '职位下线' },
            time3:   { value: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }).slice(0, 17) },
          },
        }).catch(e => console.warn('[poll] notify failed:', e.message));

        results.push({ appId: app.id, userId: app.user_id, changed: true, active: false });
      } else {
        results.push({ appId: app.id, changed: false, active: isActive });
      }
    } catch (err) {
      errors.push({ appId: app.id, error: err.message });
    }
  }

  res.json({
    ok: true,
    checked: tracked.length,
    changed: results.filter(r => r.changed).length,
    errors,
    results,
  });
});

async function _checkJobActive(source, slug, jobId) {
  try {
    if (source === 'greenhouse') {
      const url = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${jobId}`;
      const r = await axios.get(url, { timeout: 10000, validateStatus: s => s < 500 });
      return r.status === 200;
    }
    if (source === 'lever') {
      const url = `https://api.lever.co/v0/postings/${slug}/${jobId}`;
      const r = await axios.get(url, { timeout: 10000, validateStatus: s => s < 500 });
      return r.status === 200;
    }
  } catch (e) {
    return null; // 网络错误，不更新状态
  }
  return null;
}

module.exports = router;
