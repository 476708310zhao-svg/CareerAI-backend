const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { sendToUser } = require('./notify');

const { parseId } = require('../db/utils');
const { formatApp } = require('../db/formatters');

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

    const jobMap = {};
    if (localIds.length > 0) {
      const placeholders = localIds.map(() => '?').join(',');
      db.prepare(`SELECT id, title, company, company_logo, location, salary FROM jobs WHERE id IN (${placeholders})`)
        .all(...localIds)
        .forEach(j => { jobMap[j.id] = j; });
    }

    const list = filtered.map(a => {
      const app = formatApp(a);
      if (!app.jobSnapshot || !app.jobSnapshot.title) {
        const j = jobMap[parseInt(a.job_id)];
        if (j) app.job = { id: j.id, title: j.title, company: j.company, companyLogo: j.company_logo, location: j.location, salary: j.salary };
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
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(parseInt(a.job_id));
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

module.exports = router;
