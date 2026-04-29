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

const WX_APP_ID     = process.env.WX_APP_ID     || '';
const WX_APP_SECRET = process.env.WX_APP_SECRET  || '';

// 订阅消息模板 ID（在微信公众平台 → 订阅消息 → 我的模板 中获取）
const TEMPLATES = {
  application_update: process.env.WX_TPL_APPLICATION || '',  // 投递状态更新
  interview_done:     process.env.WX_TPL_INTERVIEW   || '',  // 面试完成提醒
  system_notice:      process.env.WX_TPL_SYSTEM      || '',  // 系统通知
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

// ─── 前端登记订阅（记录用户已授权的模板）────────────────────────────────────
// POST /api/notify/subscribe
// body: { templateIds: ['tplId1', 'tplId2'] }
router.post('/subscribe', authMiddleware, (req, res) => {
  // 这里只做记录（实际推送时后端直接查 openid），可扩展为存储订阅记录
  const { templateIds = [] } = req.body;
  console.log(`[notify] userId=${req.user.userId} 订阅了模板:`, templateIds);
  res.json({ code: 0, message: '订阅记录成功' });
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
    if (tplId) {
      const deadlineStr = deadlineDate && deadlineDate !== '尽快投递' ? deadlineDate : '尽快';
      await sendToUser(userId, {
        type:       'campus_reminder',
        title:      `已订阅 ${company} 截止提醒`,
        content:    `截止日期：${deadlineStr}，我们将在截止前7天和当天提醒你。`,
        templateId: tplId,
        wxData: {
          thing1: { value: `${company} 校招截止提醒` },
          time2:  { value: deadlineStr },
          thing3: { value: '截止前7天及当天将推送提醒' }
        }
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
