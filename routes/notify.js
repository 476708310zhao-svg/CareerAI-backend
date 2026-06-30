/**
 * routes/notify.js - 微信订阅消息推送 + 站内消息写入
 *
 * 使用方式（后端内部调用）：
 *   const notify = require('./notify');
 *   await notify.sendToUser(userId, { type, title, content, templateId, data });
 *
 * 前端订阅流程：
 *   1. 用户点击"投递/开始面试"时，前端调用 wx.requestSubscribeMessage({ tmplIds:[...] })
 *   2. 用户同意后，后端可调用微信接口下发订阅消息
 */
const express = require('express');
const axios   = require('axios');
const router  = express.Router();
const db      = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { internalTaskAuth } = require('../middleware/internalAuth');
const { scheduleReminderData } = require('../utils/wechatTemplates');

const WX_APP_ID     = process.env.WX_APP_ID     || '';
const WX_APP_SECRET = process.env.WX_APP_SECRET  || '';

// 订阅消息模板 ID（在微信公众平台 → 订阅消息 → 我的模板 中获取）
const TEMPLATES = {
  application_update: process.env.WX_TPL_APPLICATION || '',  // 投递状态更新
  interview_done:     process.env.WX_TPL_INTERVIEW   || '',  // 面试完成提醒
  system_notice:      process.env.WX_TPL_SYSTEM      || '',  // 系统通知
  payment_success:    process.env.WX_TPL_PAYMENT_SUCCESS || '',  // 订单支付成功通知
  payment_reminder:   process.env.WX_TPL_PAYMENT_REMINDER || '', // 订单支付提醒
};

// 启动时检查模板配置
const missingTpls = Object.entries(TEMPLATES).filter(([, v]) => !v).map(([k]) => k);
if (missingTpls.length > 0) {
  console.warn('[notify] ⚠️  以下订阅消息模板 ID 未配置，微信推送将跳过（站内消息仍正常）:', missingTpls.join(', '));
  console.warn('[notify]    请到微信公众平台 → 订阅消息 → 我的模板 获取模板 ID 后填入 .env');
}

// ─── 获取微信 AccessToken（内部缓存，2 小时有效）────────────────────────────
let _accessToken = null;
let _tokenExpire = 0;

async function getAccessToken() {
  if (_accessToken && Date.now() < _tokenExpire) return _accessToken;
  if (!WX_APP_ID || !WX_APP_SECRET) return null;
  try {
    const res = await axios.get('https://api.weixin.qq.com/cgi-bin/token', {
      params: { grant_type: 'client_credential', appid: WX_APP_ID, secret: WX_APP_SECRET },
      timeout: 8000
    });
    if (res.data.access_token) {
      _accessToken = res.data.access_token;
      _tokenExpire = Date.now() + (res.data.expires_in - 60) * 1000;
      return _accessToken;
    }
  } catch (e) {
    console.error('[notify] getAccessToken 失败:', e.message);
  }
  return null;
}

// ─── 核心：写站内消息 + 调用微信订阅消息接口 ─────────────────────────────────
async function sendToUser(userId, { type = 'system', title, content, templateId, wxData }) {
  // 1. 写入站内消息（SQLite）
  try {
    db.prepare('INSERT INTO messages (user_id, type, title, content) VALUES (?, ?, ?, ?)')
      .run(userId, type, title, content);
  } catch (e) {
    console.error('[notify] 写站内消息失败:', e.message);
  }

  // 2. 微信订阅消息（需要 templateId 且已有 openid）
  if (!templateId || !WX_APP_ID) return;
  const user = db.prepare('SELECT openid FROM users WHERE id = ?').get(userId);
  if (!user || !user.openid || user.openid.startsWith('dev_')) return;

  const token = await getAccessToken();
  if (!token) return;

  try {
    await axios.post(
      `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${token}`,
      {
        touser:           user.openid,
        template_id:      templateId,
        miniprogram_state: process.env.NODE_ENV === 'production' ? 'formal' : 'trial',
        lang:             'zh_CN',
        data:             wxData || {}
      },
      { timeout: 8000 }
    );
    console.log(`[notify] 微信订阅消息已发送 → userId=${userId}`);
  } catch (e) {
    console.error('[notify] 微信推送失败:', e.message);
  }
}

module.exports.sendToUser = sendToUser;
module.exports.TEMPLATES = TEMPLATES;

function safeJson(value, fallback) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch (e) { return fallback; }
}

function dateOnlyInShanghai(date = new Date()) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date).reduce((acc, item) => {
    acc[item.type] = item.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDays(dateText, days) {
  const date = new Date(String(dateText).slice(0, 10) + 'T00:00:00+08:00');
  if (Number.isNaN(date.getTime())) return '';
  date.setUTCDate(date.getUTCDate() + days);
  return dateOnlyInShanghai(date);
}

function normalizeLeadDays(value, type) {
  const source = Array.isArray(value) ? value : safeJson(value, type === 'daily_brief' ? [0] : [3, 1, 0]);
  const seen = new Set();
  return source
    .map(item => Number(item))
    .filter(item => Number.isInteger(item) && item >= 0 && item <= 30)
    .filter(item => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .sort((a, b) => b - a);
}

function reminderRow(row) {
  return {
    id: row.id,
    sourceType: row.source_type || 'job',
    targetId: row.target_id || '',
    reminderType: row.reminder_type || 'deadline',
    title: row.title || '',
    company: row.company || '',
    jobTitle: row.job_title || '',
    reminderDate: row.reminder_date || '',
    reminderTime: row.reminder_time || '',
    leadDays: safeJson(row.lead_days, []),
    enabled: !!row.enabled,
    sentKeys: safeJson(row.sent_keys, []),
    payload: safeJson(row.payload, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function buildReminderMessageLegacy(row, leadDay) {
  const company = row.company || '目标公司';
  const role = row.job_title || row.title || '目标岗位';
  const subject = `${company} · ${role}`;
  if (row.reminder_type === 'interview') {
    return {
      type: 'interview_reminder',
      title: `面试提醒：${subject}`,
      content: `${subject} 的面试安排在 ${row.reminder_time || row.reminder_date}，请提前准备 STAR 案例和岗位关键词。`,
      templateId: TEMPLATES.interview_done || TEMPLATES.system_notice,
      wxData: scheduleReminderData({
        topic: `${company} 面试提醒`,
        description: role,
        time: row.reminder_time || row.reminder_date,
        status: '待准备'
      })
    };
  }
  if (row.reminder_type === 'daily_brief') {
    return {
      type: 'daily_brief',
      title: '每日求职简报提醒',
      content: '今天的求职简报已准备好，可以查看即将截止岗位、面试任务和今日必练题。',
      templateId: TEMPLATES.system_notice,
      wxData: scheduleReminderData({
        topic: '每日求职简报',
        description: '查看今日待办和推荐岗位',
        time: row.reminder_time || row.reminder_date,
        status: '可查看'
      })
    };
  }
  return {
    type: 'job_deadline',
    title: `截止提醒：${subject}`,
    content: `${subject} 将在 ${row.reminder_date} 截止，${leadDay === 0 ? '今天就是截止日' : `距离截止还有 ${leadDay} 天`}，建议尽快确认简历和网申材料。`,
    templateId: TEMPLATES.system_notice || TEMPLATES.application_update,
    wxData: scheduleReminderData({
      topic: `${company} 截止提醒`,
      description: role,
      time: row.reminder_date,
      status: leadDay === 0 ? '今日截止' : `${leadDay}天后`
    })
  };
}

// ─── 前端登记订阅（记录用户已授权的模板）────────────────────────────────────
function buildReminderMessage(row, leadDay) {
  const company = row.company || 'Target company';
  const role = row.job_title || row.title || 'Target role';
  const subject = `${company} - ${role}`;
  if (row.reminder_type === 'interview') {
    return {
      type: 'interview_reminder',
      title: `Interview reminder: ${subject}`,
      content: `${subject} is scheduled at ${row.reminder_time || row.reminder_date}. Please review your STAR stories and role keywords in advance.`,
      templateId: TEMPLATES.interview_done || TEMPLATES.system_notice,
      wxData: scheduleReminderData({
        topic: `${company} interview reminder`,
        description: role,
        time: row.reminder_time || row.reminder_date,
        status: 'Pending'
      })
    };
  }
  if (row.reminder_type === 'daily_brief') {
    return {
      type: 'daily_brief',
      title: 'Daily job search brief',
      content: 'Your daily brief is ready. Review upcoming deadlines, interviews, tasks and practice questions.',
      templateId: TEMPLATES.system_notice,
      wxData: scheduleReminderData({
        topic: 'Daily job search brief',
        description: 'Today tasks and recommendations',
        time: row.reminder_time || row.reminder_date,
        status: 'Ready'
      })
    };
  }
  const relative = leadDay === 0 ? 'today is the deadline' : `${leadDay} day(s) left before the deadline`;
  return {
    type: 'job_deadline',
    title: `Deadline reminder: ${subject}`,
    content: `${subject} closes on ${row.reminder_date}; ${relative}. Please confirm your resume and application materials soon.`,
    templateId: TEMPLATES.system_notice || TEMPLATES.application_update,
    wxData: scheduleReminderData({
      topic: `${company} deadline reminder`,
      description: role,
      time: row.reminder_date,
      status: leadDay === 0 ? 'Today' : `${leadDay}d`
    })
  };
}

// POST /api/notify/subscribe
// body: { templateIds: ['tplId1', 'tplId2'] }
router.post('/subscribe', authMiddleware, (req, res) => {
  // 这里只做记录（实际推送时后端直接查 openid），可扩展为存储订阅记录
  const { templateIds = [] } = req.body;
  console.log(`[notify] userId=${req.user.userId} 订阅了模板:`, templateIds);
  res.json({ code: 0, message: '订阅记录成功' });
});

// ─── 通用求职提醒订阅 ───────────────────────────────────────────────────────
// GET /api/notify/reminders
router.get('/reminders', authMiddleware, (req, res) => {
  const { sourceType, reminderType } = req.query;
  const where = ['user_id=?'];
  const params = [req.user.userId];
  if (sourceType) { where.push('source_type=?'); params.push(String(sourceType)); }
  if (reminderType) { where.push('reminder_type=?'); params.push(String(reminderType)); }
  const rows = db.prepare(`
    SELECT * FROM job_reminders
    WHERE ${where.join(' AND ')}
    ORDER BY enabled DESC, reminder_date ASC, updated_at DESC
  `).all(...params);
  res.json({ code: 0, data: rows.map(reminderRow) });
});

// PUT /api/notify/reminders
router.put('/reminders', authMiddleware, (req, res) => {
  const body = req.body || {};
  const sourceType = String(body.sourceType || 'job');
  const targetId = String(body.targetId || '').trim();
  const reminderType = String(body.reminderType || 'deadline');
  const reminderDate = String(body.reminderDate || body.deadline || '').slice(0, 10);
  const reminderTime = String(body.reminderTime || body.interviewTime || '');
  if (!targetId) return res.status(400).json({ code: -1, message: '缺少 targetId' });
  if (!['deadline', 'interview', 'daily_brief'].includes(reminderType)) {
    return res.status(400).json({ code: -1, message: '提醒类型无效' });
  }
  if (reminderType !== 'daily_brief' && !reminderDate) {
    return res.status(400).json({ code: -1, message: '请设置提醒日期' });
  }
  const leadDays = normalizeLeadDays(body.leadDays || body.reminderLeadDays, reminderType);
  db.prepare(`
    INSERT INTO job_reminders
      (user_id, source_type, target_id, reminder_type, title, company, job_title,
       reminder_date, reminder_time, lead_days, enabled, payload, updated_at)
    VALUES
      (@userId, @sourceType, @targetId, @reminderType, @title, @company, @jobTitle,
       @reminderDate, @reminderTime, @leadDays, @enabled, @payload, datetime('now'))
    ON CONFLICT(user_id, source_type, target_id, reminder_type) DO UPDATE SET
      title=excluded.title,
      company=excluded.company,
      job_title=excluded.job_title,
      reminder_date=excluded.reminder_date,
      reminder_time=excluded.reminder_time,
      lead_days=excluded.lead_days,
      enabled=excluded.enabled,
      payload=excluded.payload,
      updated_at=datetime('now')
  `).run({
    userId: req.user.userId,
    sourceType,
    targetId,
    reminderType,
    title: String(body.title || ''),
    company: String(body.company || ''),
    jobTitle: String(body.jobTitle || body.positionName || ''),
    reminderDate: reminderType === 'daily_brief' ? (reminderDate || dateOnlyInShanghai()) : reminderDate,
    reminderTime,
    leadDays: JSON.stringify(leadDays),
    enabled: body.enabled === false ? 0 : 1,
    payload: JSON.stringify(body.payload || {})
  });
  const row = db.prepare(`
    SELECT * FROM job_reminders
    WHERE user_id=? AND source_type=? AND target_id=? AND reminder_type=?
  `).get(req.user.userId, sourceType, targetId, reminderType);
  res.json({ code: 0, data: reminderRow(row), message: row.enabled ? '提醒已开启' : '提醒已关闭' });
});

// DELETE /api/notify/reminders/:sourceType/:targetId/:reminderType
router.delete('/reminders/:sourceType/:targetId/:reminderType', authMiddleware, (req, res) => {
  const result = db.prepare(`
    UPDATE job_reminders
    SET enabled=0, updated_at=datetime('now')
    WHERE user_id=? AND source_type=? AND target_id=? AND reminder_type=?
  `).run(req.user.userId, req.params.sourceType, req.params.targetId, req.params.reminderType);
  res.json({ code: 0, message: result.changes ? '提醒已关闭' : '提醒不存在' });
});

// POST /api/notify/reminders/dispatch
// Header: X-Cron-Secret
router.post('/reminders/dispatch', internalTaskAuth, async (req, res) => {
  try {
  const today = String((req.body && req.body.date) || req.query.date || dateOnlyInShanghai()).slice(0, 10);
  const rows = db.prepare(`
    SELECT * FROM job_reminders
    WHERE enabled=1 AND reminder_date!=''
    ORDER BY reminder_date ASC, id ASC
    LIMIT 500
  `).all();
  const sent = [];
  const skipped = [];

  for (const row of rows) {
    const leadDays = normalizeLeadDays(row.lead_days, row.reminder_type);
    const sentKeys = safeJson(row.sent_keys, []);
    const dueLeads = leadDays.filter(day => addDays(row.reminder_date, -day) === today);
    if (!dueLeads.length) {
      skipped.push({ id: row.id, reason: 'not_due' });
      continue;
    }
    for (const leadDay of dueLeads) {
      const key = `${row.reminder_type}:${row.source_type}:${row.target_id}:${row.reminder_date}:${leadDay}`;
      if (sentKeys.includes(key)) {
        skipped.push({ id: row.id, reason: 'already_sent', key });
        continue;
      }
      const message = buildReminderMessage(row, leadDay);
      await sendToUser(row.user_id, message);
      sentKeys.push(key);
      db.prepare("UPDATE job_reminders SET sent_keys=?, updated_at=datetime('now') WHERE id=?")
        .run(JSON.stringify(sentKeys), row.id);
      sent.push({ id: row.id, userId: row.user_id, key, type: message.type });
    }
  }

  res.json({ code: 0, data: { date: today, checked: rows.length, sent, skipped } });
  } catch (e) {
    console.error('[notify] reminders dispatch failed:', e.message);
    res.status(500).json({ code: -1, message: 'reminder dispatch failed' });
  }
});

// ─── 校招截止提醒订阅 ─────────────────────────────────────────────────────────
// POST /api/notify/campus-subscribe
// body: { campusId, company, deadlineDate, positionName }
router.post('/campus-subscribe', authMiddleware, async (req, res) => {
  try {
    const { campusId, company, deadlineDate, positionName } = req.body;
    if (!campusId || !company) return res.status(400).json({ code: -1, message: '缺少必要参数' });

    const userId = req.user.userId;

    // 检查是否已订阅
    const exists = db.prepare(
      `SELECT id FROM messages WHERE user_id=? AND type='campus_reminder' AND content LIKE ?`
    ).get(userId, `%campusId:${campusId}%`);

    if (exists) {
      return res.json({ code: 0, message: '已订阅' });
    }

    // 写入站内消息（作为提醒记录）
    const title = `截止提醒：${company}${positionName ? ' · ' + positionName : ''}`;
    const content = `deadline:${deadlineDate || '待确认'},campusId:${campusId}`;
    db.prepare('INSERT INTO messages (user_id, type, title, content) VALUES (?, ?, ?, ?)')
      .run(userId, 'campus_reminder', title, content);

    // 如有微信模板，发送一条确认通知
    const tplId = TEMPLATES.system_notice;
    if (tplId && deadlineDate && deadlineDate !== '尽快投递') {
      const deadlineStr = deadlineDate && deadlineDate !== '尽快投递' ? deadlineDate : '尽快';
      await sendToUser(userId, {
        type:       'campus_reminder',
        title:      `已订阅 ${company} 截止提醒`,
        content:    `截止日期：${deadlineStr}，我们将在截止前7天和当天提醒你。`,
        templateId: tplId,
        wxData: scheduleReminderData({
          topic: `${company} 校招截止提醒`,
          description: positionName ? `${positionName} 截止提醒` : '截止前7天及当天提醒',
          time: deadlineStr,
          status: '已订阅',
        })
      });
    }

    res.json({ code: 0, message: '订阅成功' });
  } catch (e) {
    console.error('[notify] campus-subscribe 失败:', e.message);
    res.status(500).json({ code: -1, message: '订阅失败，请重试' });
  }
});

// ─── 获取已配置的模板 ID（供前端 requestSubscribeMessage 使用）──────────────
// GET /api/notify/templates
router.get('/templates', (req, res) => {
  const configured = {};
  if (TEMPLATES.system_notice)      configured.system_notice      = TEMPLATES.system_notice;
  if (TEMPLATES.application_update) configured.application_update = TEMPLATES.application_update;
  if (TEMPLATES.interview_done)     configured.interview_done     = TEMPLATES.interview_done;
  if (TEMPLATES.payment_success)    configured.payment_success    = TEMPLATES.payment_success;
  if (TEMPLATES.payment_reminder)   configured.payment_reminder   = TEMPLATES.payment_reminder;
  res.json({ code: 0, data: configured });
});

// ─── 测试推送（开发用）────────────────────────────────────────────────────────
// POST /api/notify/test
// body: { userId, title, content, type }
router.post('/test', authMiddleware, async (req, res) => {
  try {
    const { title, content, type = 'system' } = req.body;
    if (!title || !content) return res.status(400).json({ code: -1, message: '缺少 title/content' });
    await sendToUser(req.user.userId, { type, title, content });
    res.json({ code: 0, message: '消息已写入' });
  } catch (e) {
    res.status(500).json({ code: -1, message: e.message });
  }
});

module.exports.router = router;
