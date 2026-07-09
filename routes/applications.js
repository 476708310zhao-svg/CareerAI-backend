const express = require('express');
const router  = express.Router();
const axios   = require('axios');
const db      = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { internalTaskAuth } = require('../middleware/internalAuth');
const { sendToUser } = require('./notify');

const { parseId } = require('../db/utils');
const { formatApp } = require('../db/formatters');
const { ja } = require('../db/utils');
const { findJobById, findJobsByIds, toApplicationJob } = require('../utils/jobData');
const { applicationFeedbackData } = require('../utils/wechatTemplates');

const PROGRESS_STATUSES = new Set([
  'collected', 'applied', 'online_apply', 'oa', 'first_interview',
  'second_interview', 'hr_interview', 'offer', 'rejected', 'closed'
]);

const PROGRESS_STATUS_TEXT = {
  collected: '已收藏',
  applied: '已投递',
  online_apply: '网申中',
  oa: 'OA 阶段',
  first_interview: '一面',
  second_interview: '二面',
  hr_interview: 'HR 面',
  offer: 'Offer',
  rejected: '拒信',
  closed: '已结束'
};

function safeJson(value, fallback) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch (e) { return fallback; }
}

function cleanText(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function normalizeProgressStatus(value) {
  const status = cleanText(value || 'collected', 40);
  return PROGRESS_STATUSES.has(status) ? status : 'collected';
}

function progressToLegacyStatus(status) {
  if (status === 'offer') return 'offer';
  if (status === 'rejected' || status === 'closed') return 'rejected';
  if (['first_interview', 'second_interview', 'hr_interview'].includes(status)) return 'interview';
  if (status === 'applied') return 'applied';
  return 'pending';
}

function firstDate(value) {
  const text = cleanText(value, 40);
  return text ? text.slice(0, 10) : '';
}

function pickField(source, keys, fallback) {
  const body = source || {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(body, key)) return body[key];
  }
  return fallback;
}

function progressRow(row) {
  const snapshot = safeJson(row.job_snapshot, {});
  const progressStatus = normalizeProgressStatus(row.progress_status || row.status);
  const sourceJobId = row.source_job_id || row.job_id || '';
  return {
    id: String(row.id),
    clientId: row.client_id || '',
    sourceJobId,
    jobId: row.job_id || '',
    company: row.company || snapshot.company || snapshot.employer_name || '',
    jobTitle: row.job_title || snapshot.title || snapshot.job_title || '',
    title: row.job_title || snapshot.title || snapshot.job_title || '',
    city: row.city || snapshot.city || snapshot.location || '',
    salary: row.salary || snapshot.salary || '',
    jobLink: row.job_link || snapshot.applyLink || snapshot.apply_url || '',
    appliedAt: row.applied_at || '',
    deadline: row.deadline || '',
    interviewTime: row.interview_time || '',
    status: progressStatus,
    progressStatus,
    statusText: PROGRESS_STATUS_TEXT[progressStatus] || '已收藏',
    notes: row.notes || '',
    resumeVersionId: row.resume_version_id || '',
    reminderEnabled: !!row.reminder_enabled,
    reminderLeadDays: safeJson(row.reminder_lead_days, [3, 1]),
    jobSnapshot: snapshot,
    createdAt: row.applied_at || row.created_at || '',
    updatedAt: row.updated_at || ''
  };
}

function findProgressRecord(userId, body = {}) {
  const id = Number(body.id);
  if (id) {
    const row = db.prepare('SELECT * FROM applications WHERE id=? AND user_id=?').get(id, userId);
    if (row) return row;
  }
  const clientId = cleanText(body.clientId || body.client_id || '', 120);
  if (clientId) {
    const row = db.prepare('SELECT * FROM applications WHERE user_id=? AND client_id=?').get(userId, clientId);
    if (row) return row;
  }
  const sourceJobId = cleanText(body.sourceJobId || body.source_job_id || body.jobId || body.job_id || '', 200);
  if (sourceJobId) {
    const row = db.prepare('SELECT * FROM applications WHERE user_id=? AND (source_job_id=? OR job_id=?) ORDER BY id DESC')
      .get(userId, sourceJobId, sourceJobId);
    if (row) return row;
  }
  return null;
}

function progressPayload(body = {}, existing = null) {
  const snapshot = body.jobSnapshot && typeof body.jobSnapshot === 'object' ? body.jobSnapshot : safeJson(existing && existing.job_snapshot, {});
  const sourceJobId = cleanText(body.sourceJobId || body.source_job_id || body.jobId || body.job_id || existing && (existing.source_job_id || existing.job_id) || '', 200);
  const clientId = cleanText(body.clientId || body.client_id || body.id || existing && existing.client_id || '', 120);
  const company = cleanText(pickField(body, ['company'], snapshot.company || existing && existing.company || ''), 120);
  const jobTitle = cleanText(pickField(body, ['jobTitle', 'job_title', 'title'], snapshot.title || existing && existing.job_title || ''), 160);
  const progressStatus = normalizeProgressStatus(body.progressStatus || body.currentStatus || body.status || existing && (existing.progress_status || existing.status));
  const appliedAt = firstDate(pickField(body, ['appliedAt', 'applied_at'], existing && existing.applied_at)) || new Date().toISOString().slice(0, 10);
  const jobId = sourceJobId || clientId || `manual_${Date.now()}`;
  let reminderEnabled = existing ? existing.reminder_enabled : 0;
  if (Object.prototype.hasOwnProperty.call(body, 'reminderEnabled')) reminderEnabled = body.reminderEnabled ? 1 : 0;
  if (Object.prototype.hasOwnProperty.call(body, 'reminder_enabled')) reminderEnabled = body.reminder_enabled ? 1 : 0;
  const leadDaysValue = pickField(body, ['reminderLeadDays', 'reminder_lead_days'], null);
  return {
    clientId,
    jobId,
    sourceJobId,
    sourceType: cleanText(body.sourceType || body.source_type || existing && existing.source_type || 'manual', 40),
    jobSnapshot: JSON.stringify(Object.assign({}, snapshot, {
      title: snapshot.title || jobTitle,
      company: snapshot.company || company,
      location: snapshot.location || body.city || ''
    })),
    resumeId: Number(body.resumeId || body.resume_id || existing && existing.resume_id) || null,
    status: progressToLegacyStatus(progressStatus),
    statusText: PROGRESS_STATUS_TEXT[progressStatus] || '已收藏',
    appliedAt,
    company,
    jobTitle,
    city: cleanText(pickField(body, ['city', 'location'], existing && existing.city || ''), 120),
    salary: cleanText(pickField(body, ['salary'], existing && existing.salary || ''), 120),
    jobLink: cleanText(pickField(body, ['jobLink', 'applyLink', 'apply_url'], existing && existing.job_link || ''), 1000),
    deadline: firstDate(pickField(body, ['deadline', 'deadlineDate'], existing && existing.deadline || '')),
    interviewTime: cleanText(pickField(body, ['interviewTime', 'interview_time'], existing && existing.interview_time || ''), 80),
    notes: cleanText(pickField(body, ['notes', 'remark'], existing && existing.notes || ''), 2000),
    resumeVersionId: cleanText(pickField(body, ['resumeVersionId', 'resume_version_id'], existing && existing.resume_version_id || ''), 120),
    progressStatus,
    reminderEnabled,
    reminderLeadDays: JSON.stringify(Array.isArray(leadDaysValue)
      ? leadDaysValue
      : safeJson(existing && existing.reminder_lead_days, [3, 1]))
  };
}

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
          pending: count('pending'), applied: count('applied'), viewed: count('viewed'),
          interview: count('interview'), offer: count('offer'), rejected: count('rejected')
        }
      }
    });
  } catch (error) {
    console.error(error); res.status(500).json({ code: -1, message: '服务器内部错误' });
  }
});

// ─── 2.0 求职进度：云端列表 ─────────────────────────────────────────────────
router.get('/progress', authMiddleware, (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM applications
    WHERE user_id=?
    ORDER BY
      CASE WHEN interview_time != '' THEN interview_time ELSE deadline END DESC,
      updated_at DESC,
      applied_at DESC,
      id DESC
  `).all(req.user.userId);
  res.json({ code: 0, data: rows.map(progressRow), message: 'success' });
});

// ─── 2.0 求职进度：创建/幂等保存 ─────────────────────────────────────────────
router.post('/progress', authMiddleware, (req, res) => {
  try {
    const existing = findProgressRecord(req.user.userId, req.body || {});
    const payload = progressPayload(req.body || {}, existing);
    if (!payload.company || !payload.jobTitle) {
      return res.status(400).json({ code: -1, message: '请填写公司和岗位' });
    }

    if (existing) {
      db.prepare(`
        UPDATE applications SET
          client_id=@clientId,
          job_id=@jobId,
          job_snapshot=@jobSnapshot,
          resume_id=@resumeId,
          status=@status,
          status_text=@statusText,
          applied_at=@appliedAt,
          source_type=@sourceType,
          source_job_id=@sourceJobId,
          company=@company,
          job_title=@jobTitle,
          city=@city,
          salary=@salary,
          job_link=@jobLink,
          deadline=@deadline,
          interview_time=@interviewTime,
          notes=@notes,
          resume_version_id=@resumeVersionId,
          progress_status=@progressStatus,
          reminder_enabled=@reminderEnabled,
          reminder_lead_days=@reminderLeadDays,
          updated_at=datetime('now')
        WHERE id=@id AND user_id=@userId
      `).run(Object.assign({ id: existing.id, userId: req.user.userId }, payload));
      const row = db.prepare('SELECT * FROM applications WHERE id=?').get(existing.id);
      return res.json({ code: 0, data: progressRow(row), message: '已更新' });
    }

    const result = db.prepare(`
      INSERT INTO applications
        (user_id, client_id, job_id, job_snapshot, resume_id, status, status_text,
         applied_at, source_type, source_job_id, company, job_title, city, salary,
         job_link, deadline, interview_time, notes, resume_version_id,
         progress_status, reminder_enabled, reminder_lead_days, updated_at)
      VALUES
        (@userId, @clientId, @jobId, @jobSnapshot, @resumeId, @status, @statusText,
         @appliedAt, @sourceType, @sourceJobId, @company, @jobTitle, @city, @salary,
         @jobLink, @deadline, @interviewTime, @notes, @resumeVersionId,
         @progressStatus, @reminderEnabled, @reminderLeadDays, datetime('now'))
    `).run(Object.assign({ userId: req.user.userId }, payload));
    const row = db.prepare('SELECT * FROM applications WHERE id=?').get(result.lastInsertRowid);
    res.json({ code: 0, data: progressRow(row), message: '已保存' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: -1, message: '服务器内部错误' });
  }
});

// ─── 2.0 求职进度：更新 ──────────────────────────────────────────────────────
router.put('/progress/:id', authMiddleware, (req, res) => {
  try {
    const existing = findProgressRecord(req.user.userId, Object.assign({}, req.body || {}, { id: req.params.id }));
    if (!existing) return res.status(404).json({ code: -1, message: '进度记录不存在' });
    const payload = progressPayload(Object.assign({}, req.body || {}, { id: req.params.id }), existing);
    db.prepare(`
      UPDATE applications SET
        client_id=@clientId,
        job_id=@jobId,
        job_snapshot=@jobSnapshot,
        resume_id=@resumeId,
        status=@status,
        status_text=@statusText,
        applied_at=@appliedAt,
        source_type=@sourceType,
        source_job_id=@sourceJobId,
        company=@company,
        job_title=@jobTitle,
        city=@city,
        salary=@salary,
        job_link=@jobLink,
        deadline=@deadline,
        interview_time=@interviewTime,
        notes=@notes,
        resume_version_id=@resumeVersionId,
        progress_status=@progressStatus,
        reminder_enabled=@reminderEnabled,
        reminder_lead_days=@reminderLeadDays,
        updated_at=datetime('now')
      WHERE id=@id AND user_id=@userId
    `).run(Object.assign({ id: existing.id, userId: req.user.userId }, payload));
    const row = db.prepare('SELECT * FROM applications WHERE id=?').get(existing.id);
    res.json({ code: 0, data: progressRow(row), message: '已更新' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: -1, message: '服务器内部错误' });
  }
});

// ─── 2.0 求职进度：删除 ──────────────────────────────────────────────────────
router.delete('/progress/:id', authMiddleware, (req, res) => {
  const existing = findProgressRecord(req.user.userId, { id: req.params.id, clientId: req.params.id });
  if (!existing) return res.status(404).json({ code: -1, message: '进度记录不存在' });
  db.prepare('DELETE FROM applications WHERE id=? AND user_id=?').run(existing.id, req.user.userId);
  res.json({ code: 0, message: '已删除' });
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
      VALUES (?, ?, ?, ?, 'pending', '待投递')
    `).run(req.user.userId, String(jobId), JSON.stringify(jobSnapshot || {}), resumeId || null);

    const newApp = db.prepare('SELECT * FROM applications WHERE id = ?').get(result.lastInsertRowid);

    // 保存到看板不等于已完成官方投递，避免给用户造成误解。
    const snap = jobSnapshot || {};
    sendToUser(req.user.userId, {
      type:    'application',
      title:   '投递记录已保存',
      content: `已将「${snap.company || ''}${snap.company && snap.title ? ' · ' : ''}${snap.title || '职位'}」保存到投递看板，请通过官方招聘链接完成投递`,
    }).catch(() => {});

    res.json({ code: 0, message: '投递记录已保存', data: formatApp(newApp) });
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
    if (!['pending', 'applied'].includes(a.status)) return res.status(400).json({ code: -1, message: '该申请已进入后续阶段，无法撤回' });
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
router.post('/poll-status', internalTaskAuth, async (req, res) => {
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
          wxData: applicationFeedbackData({
            title: jobTitle || '职位追踪',
            company: companyName,
            result: '职位下线',
            remark: '建议关注投递进展',
          }),
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
