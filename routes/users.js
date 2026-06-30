const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const router = express.Router();
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { sendEmailCode } = require('../services/email');

const JWT_SECRET    = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';
const WX_APP_ID     = process.env.WX_APP_ID     || '';
const WX_APP_SECRET = process.env.WX_APP_SECRET  || '';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const WX_PLACEHOLDER_PATTERNS = [/^$/, /^your[_-]/i, /^test[_-]/i, /请填写/, /你的小程序/, /你的/];
const WX_CONFIGURED = !WX_PLACEHOLDER_PATTERNS.some(pattern => pattern.test(WX_APP_ID.trim()))
  && !WX_PLACEHOLDER_PATTERNS.some(pattern => pattern.test(WX_APP_SECRET.trim()));

const { parseId, ja } = require('../db/utils');
const { formatUser } = require('../db/formatters');
const { loginLimiter } = require('../middleware/rateLimit');
const { USER_PROFILE_SCHEMA, normalizeProfilePayload } = require('../utils/userProfileStandard');

// ── OTP 内存存储（phone → { code, expiry, attempts }）──────────────────────
const _otpStore = new Map();
const OTP_TTL        = 5 * 60 * 1000; // 5 分钟有效
const OTP_MAX_TRIES  = 5;             // 最多尝试次数
const OTP_SEND_COOLDOWN = 60 * 1000; // 发送冷却 60 秒

// 定期清理过期 OTP
const otpCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _otpStore) {
    if (now > v.expiry) _otpStore.delete(k);
  }
}, 2 * 60 * 1000);
if (otpCleanupTimer.unref) otpCleanupTimer.unref();

function genOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function normalizeEmail(raw) {
  return (raw || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function signToken(userId, openid) {
  return jwt.sign({ userId, openid }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

const PASSWORD_PREFIX = 'scrypt';
const PASSWORD_KEY_LEN = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, PASSWORD_KEY_LEN).toString('hex');
  return `${PASSWORD_PREFIX}$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;

  const parts = String(stored).split('$');
  if (parts.length === 3 && parts[0] === PASSWORD_PREFIX) {
    const [, salt, expected] = parts;
    const actual = crypto.scryptSync(password, salt, Buffer.from(expected, 'hex').length).toString('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
    } catch (e) {
      return false;
    }
  }

  return stored === password;
}

function isPasswordHash(stored) {
  return typeof stored === 'string' && stored.startsWith(`${PASSWORD_PREFIX}$`);
}

function markDeprecatedResumesApi(res) {
  res.set('Deprecation', 'true');
  res.set('Sunset', 'Mon, 09 Nov 2026 00:00:00 GMT');
  res.set('Link', '</api/resumes>; rel="successor-version"');
}

function hasProfilePayload(body = {}) {
  return [
    'education', 'jobPreference', 'job_preference', 'school', 'major', 'degree',
    'gradYear', 'status', 'targetRoles', 'targetLocation', 'targetIndustries',
    'jobTypes', 'workAuthorization', 'expectedSalaryRange', 'skills'
  ].some(key => Object.prototype.hasOwnProperty.call(body, key));
}

router.get('/profile-schema', (_req, res) => {
  res.json({ code: 0, message: 'success', data: USER_PROFILE_SCHEMA });
});

// ─── 发送邮箱验证码（官网邮箱登录）──────────────────────────────────────────
router.post('/send-email-code', loginLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!isValidEmail(email)) {
      return res.status(400).json({ code: -1, message: '请输入有效的邮箱地址' });
    }

    const existing = _otpStore.get(email);
    if (existing && Date.now() < existing.sentAt + OTP_SEND_COOLDOWN) {
      const wait = Math.ceil((existing.sentAt + OTP_SEND_COOLDOWN - Date.now()) / 1000);
      return res.status(429).json({ code: -1, message: `请 ${wait} 秒后再试` });
    }

    const code = genOtp();
    _otpStore.set(email, { code, expiry: Date.now() + OTP_TTL, sentAt: Date.now(), attempts: 0 });

    await sendEmailCode(email, code);
    res.json({ code: 0, message: '验证码已发送至邮箱' });
  } catch (err) {
    console.error('[send-email-code error]', err.message);
    res.status(500).json({ code: -1, message: '发送失败，请稍后重试' });
  }
});

// ─── 邮箱验证码登录（官网）───────────────────────────────────────────────────
router.post('/email-login', loginLimiter, async (req, res) => {
  try {
    const email     = normalizeEmail(req.body.email);
    const inputCode = String(req.body.code || '').trim();

    if (!isValidEmail(email)) {
      return res.status(400).json({ code: -1, message: '邮箱格式错误' });
    }
    if (!/^\d{6}$/.test(inputCode)) {
      return res.status(400).json({ code: -1, message: '验证码格式错误' });
    }

    const entry = _otpStore.get(email);
    if (!entry || Date.now() > entry.expiry) {
      return res.status(400).json({ code: -1, message: '验证码已过期，请重新发送' });
    }

    entry.attempts += 1;
    if (entry.attempts > OTP_MAX_TRIES) {
      _otpStore.delete(email);
      return res.status(400).json({ code: -1, message: '验证码错误次数过多，请重新发送' });
    }

    if (entry.code !== inputCode) {
      return res.status(400).json({ code: -1, message: '验证码错误' });
    }

    _otpStore.delete(email);

    // 找或建用户
    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      const result = db.prepare('INSERT INTO users (email) VALUES (?)').run(email);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    }

    const token = signToken(user.id, user.openid || null);
    res.json({ code: 0, message: '登录成功', data: { token, user: formatUser(user) } });
  } catch (err) {
    console.error('[email-login error]', err.message);
    res.status(500).json({ code: -1, message: '登录失败，请稍后重试' });
  }
});

// ─── 微信登录 ─────────────────────────────────────────────────────────────────
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ code: -1, message: '缺少 code 参数' });

    let openid;
    let sessionKey = '';
    if (WX_CONFIGURED) {
      const wxRes = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
        params: { appid: WX_APP_ID, secret: WX_APP_SECRET, js_code: code, grant_type: 'authorization_code' },
        timeout: 8000
      });
      if (wxRes.data.errcode) return res.status(400).json({ code: -1, message: '微信登录失败: ' + wxRes.data.errmsg });
      openid = wxRes.data.openid;
      sessionKey = wxRes.data.session_key || '';
    } else {
      if (IS_PRODUCTION) {
        return res.status(503).json({ code: -1, message: '微信登录未完成生产配置' });
      }
      openid = 'dev_' + code;
    }

    let user = db.prepare('SELECT * FROM users WHERE openid = ?').get(openid);
    if (!user) {
      const result = db.prepare(
        'INSERT INTO users (openid) VALUES (?)'
      ).run(openid);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    }
    if (sessionKey) {
      db.prepare('UPDATE users SET wechat_session_key = ? WHERE id = ?').run(sessionKey, user.id);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    }

    const token = signToken(user.id, user.openid);
    res.json({ code: 0, message: '登录成功', data: { token, user: formatUser(user) } });
  } catch (error) {
    console.error('[login error]', error.message);
    res.status(500).json({ code: -1, message: '登录失败，请稍后重试' });
  }
});

// ─── 手机号登录 ───────────────────────────────────────────────────────────────
// phoneCode: from getPhoneNumber button event (wx mini-program 2.21.2+)
// loginCode: from wx.login(), used to obtain openid
router.post('/phone-login', loginLimiter, async (req, res) => {
  try {
    const { phoneCode, loginCode } = req.body;
    if (!phoneCode || !loginCode) return res.status(400).json({ code: -1, message: '缺少参数' });

    let openid, phone, sessionKey = '';

    if (WX_CONFIGURED) {
      // Exchange loginCode → openid
      const sessionRes = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
        params: { appid: WX_APP_ID, secret: WX_APP_SECRET, js_code: loginCode, grant_type: 'authorization_code' },
        timeout: 8000
      });
      if (sessionRes.data.errcode) return res.status(400).json({ code: -1, message: '微信登录失败: ' + sessionRes.data.errmsg });
      openid = sessionRes.data.openid;
      sessionKey = sessionRes.data.session_key || '';

      // Get access token then exchange phoneCode → phone number
      const tokenRes = await axios.get('https://api.weixin.qq.com/cgi-bin/token', {
        params: { grant_type: 'client_credential', appid: WX_APP_ID, secret: WX_APP_SECRET },
        timeout: 8000
      });
      if (tokenRes.data.errcode || !tokenRes.data.access_token) {
        console.warn('[phone-login token error]', tokenRes.data.errcode, tokenRes.data.errmsg);
        return res.status(400).json({ code: -1, message: '手机号验证服务暂不可用，请稍后重试' });
      }
      const accessToken = tokenRes.data.access_token;
      const phoneRes = await axios.post(
        `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${accessToken}`,
        { code: phoneCode },
        { timeout: 8000 }
      );
      if (phoneRes.data.errcode || !phoneRes.data.phone_info) {
        console.warn('[phone-login phone error]', phoneRes.data.errcode, phoneRes.data.errmsg);
        return res.status(400).json({ code: -1, message: '手机号验证失败，请重新授权' });
      }
      phone = phoneRes.data.phone_info.phoneNumber;
    } else {
      if (IS_PRODUCTION) {
        return res.status(503).json({ code: -1, message: '微信手机号登录未完成生产配置' });
      }
      openid = 'dev_' + loginCode;
      phone  = 'dev_phone_' + phoneCode.slice(0, 8);
    }

    if (!openid) return res.status(400).json({ code: -1, message: '获取用户身份失败' });
    if (!phone) return res.status(400).json({ code: -1, message: '获取手机号失败，请重新授权' });

    // Find or create user (prefer openid match, fall back to phone match)
    let user = db.prepare('SELECT * FROM users WHERE openid = ?').get(openid);
    if (!user && phone) {
      user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
      if (user) db.prepare('UPDATE users SET openid = ? WHERE id = ?').run(openid, user.id);
    }
    if (!user) {
      const result = db.prepare('INSERT INTO users (openid, phone) VALUES (?, ?)').run(openid, phone || null);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    } else if (phone && !user.phone) {
      db.prepare('UPDATE users SET phone = ? WHERE id = ?').run(phone, user.id);
    }
    if (sessionKey) {
      db.prepare('UPDATE users SET wechat_session_key = ? WHERE id = ?').run(sessionKey, user.id);
    }
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);

    const token = signToken(user.id, user.openid);
    res.json({ code: 0, message: '登录成功', data: { token, user: formatUser(user) } });
  } catch (error) {
    console.error('[phone-login error]', error.message);
    res.status(500).json({ code: -1, message: '登录失败，请稍后重试' });
  }
});

// ─── 更新昵称/头像 ─────────────────────────────────────────────────────────────
router.post('/update-profile', authMiddleware, (req, res) => {
  try {
    const current = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.userId);
    if (!current) return res.status(404).json({ code: -1, message: '用户不存在' });

    const normalized = normalizeProfilePayload(req.body || {}, current);
    const updates = [];
    const vals = [];

    if (normalized.user.nickname !== undefined) { updates.push('nickname = ?'); vals.push(normalized.user.nickname); }
    if (normalized.user.avatar !== undefined)   { updates.push('avatar = ?');   vals.push(normalized.user.avatar); }
    if (hasProfilePayload(req.body)) {
      updates.push('education = ?');
      vals.push(JSON.stringify(normalized.education));
      updates.push('job_preference = ?');
      vals.push(JSON.stringify(normalized.jobPreference));
    }
    if (updates.length) {
      vals.push(req.user.userId);
      db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...vals);
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.userId);
    res.json({ code: 0, message: '更新成功', data: formatUser(user) });
  } catch (error) {
    console.error(error); res.status(500).json({ code: -1, message: '服务器内部错误' });
  }
});

// ─── 获取用户信息 ─────────────────────────────────────────────────────────────
router.get('/profile', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.userId);
  if (!user) return res.status(404).json({ code: -1, message: '用户不存在' });
  res.json({ code: 0, message: 'success', data: formatUser(user) });
});

// ─── 更新用户详细信息 ─────────────────────────────────────────────────────────
router.put('/profile', authMiddleware, (req, res) => {
  try {
    const current = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.userId);
    if (!current) return res.status(404).json({ code: -1, message: '用户不存在' });

    const normalized = normalizeProfilePayload(req.body || {}, current);
    const updates = [];
    const vals = [];
    if (normalized.user.nickname !== undefined) { updates.push('nickname = ?'); vals.push(normalized.user.nickname); }
    if (normalized.user.avatar !== undefined)   { updates.push('avatar = ?');   vals.push(normalized.user.avatar); }
    if (normalized.user.email !== undefined)    { updates.push('email = ?');    vals.push(normalized.user.email); }
    if (normalized.user.phone !== undefined)    { updates.push('phone = ?');    vals.push(normalized.user.phone); }
    updates.push('education = ?');
    vals.push(JSON.stringify(normalized.education));
    updates.push('job_preference = ?');
    vals.push(JSON.stringify(normalized.jobPreference));
    if (updates.length) {
      vals.push(req.user.userId);
      db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...vals);
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.userId);
    res.json({ code: 0, message: '更新成功', data: formatUser(user) });
  } catch (error) {
    console.error(error); res.status(500).json({ code: -1, message: '服务器内部错误' });
  }
});

// ─── 旧版简历兼容接口：已废弃，请使用 /api/resumes ───────────────────────────
router.get('/resumes', authMiddleware, (req, res) => {
  markDeprecatedResumesApi(res);
  const resumes = db.prepare('SELECT * FROM resumes WHERE user_id = ? ORDER BY updated_at DESC').all(req.user.userId);
  res.json({ code: 0, message: 'success', data: resumes.map(r => ({
    ...r, userId: r.user_id,
    education: ja(r.education), experience: ja(r.experience), skills: ja(r.skills)
  }))});
});

// ─── 旧版简历详情兼容接口：已废弃，请使用 /api/resumes/:id ───────────────────
router.get('/resumes/:id', authMiddleware, (req, res) => {
  markDeprecatedResumesApi(res);
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });
  const r = db.prepare('SELECT * FROM resumes WHERE id = ? AND user_id = ?').get(id, req.user.userId);
  if (!r) return res.status(404).json({ code: -1, message: '简历不存在' });
  res.json({ code: 0, message: 'success', data: {
    ...r, userId: r.user_id,
    education: ja(r.education), experience: ja(r.experience), skills: ja(r.skills)
  }});
});

// ─── 旧版创建简历兼容接口：已废弃，请使用 POST /api/resumes ──────────────────
router.post('/resumes', authMiddleware, (req, res) => {
  markDeprecatedResumesApi(res);
  try {
    const { name, language = 'zh', education, experience, skills } = req.body;
    const result = db.prepare(`
      INSERT INTO resumes (user_id, name, language, education, experience, skills)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.user.userId, name || '我的简历', language,
      JSON.stringify(education || []), JSON.stringify(experience || []), JSON.stringify(skills || []));
    const r = db.prepare('SELECT * FROM resumes WHERE id = ?').get(result.lastInsertRowid);
    res.json({ code: 0, message: '简历创建成功', data: {
      ...r, userId: r.user_id,
      education: ja(r.education), experience: ja(r.experience), skills: ja(r.skills)
    }});
  } catch (error) {
    console.error(error); res.status(500).json({ code: -1, message: '服务器内部错误' });
  }
});

// ─── 旧版更新简历兼容接口：已废弃，请使用 PUT /api/resumes/:id ────────────────
router.put('/resumes/:id', authMiddleware, (req, res) => {
  markDeprecatedResumesApi(res);
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ code: -1, message: '参数无效' });

    const existing = db.prepare('SELECT * FROM resumes WHERE id = ? AND user_id = ?').get(id, req.user.userId);
    if (!existing) return res.status(404).json({ code: -1, message: '简历不存在' });

    const { name, language, education, experience, skills } = req.body;
    const updates = [];
    const vals = [];
    if (name !== undefined)       { updates.push('name = ?');       vals.push(name); }
    if (language !== undefined)   { updates.push('language = ?');   vals.push(language); }
    if (education !== undefined)  { updates.push('education = ?');  vals.push(JSON.stringify(education)); }
    if (experience !== undefined) { updates.push('experience = ?'); vals.push(JSON.stringify(experience)); }
    if (skills !== undefined)     { updates.push('skills = ?');     vals.push(JSON.stringify(skills)); }

    if (updates.length) {
      updates.push('updated_at = ?');
      vals.push(new Date().toISOString().replace('T', ' ').slice(0, 19));
      vals.push(id);
      db.prepare(`UPDATE resumes SET ${updates.join(', ')} WHERE id = ?`).run(...vals);
    }

    const r = db.prepare('SELECT * FROM resumes WHERE id = ?').get(id);
    res.json({ code: 0, message: '更新成功', data: {
      ...r, userId: r.user_id,
      education: ja(r.education), experience: ja(r.experience), skills: ja(r.skills)
    }});
  } catch (error) {
    console.error(error); res.status(500).json({ code: -1, message: '服务器内部错误' });
  }
});

// ─── 刷新 Token ────────────────────────────────────────────────────────────────
router.post('/refresh-token', authMiddleware, (req, res) => {
  const token = signToken(req.user.userId, req.user.openid);
  res.json({ code: 0, message: 'success', data: { token } });
});

// ─── 网页端账号密码登录 ────────────────────────────────────────────────────────
// 用 email 或 phone 作为账号，password 字段（用户注册时设置）
router.post('/web-login', loginLimiter, (req, res) => {
  try {
    const { account, password } = req.body;
    if (!account || !password) {
      return res.status(400).json({ code: -1, message: '账号和密码不能为空' });
    }
    const user = db.prepare(
      `SELECT * FROM users WHERE email = ? OR phone = ?`
    ).get(account, account);
    if (!user || !verifyPassword(password, user.password)) {
      return res.status(401).json({ code: -1, message: '账号或密码错误' });
    }
    if (!isPasswordHash(user.password)) {
      db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashPassword(password), user.id);
    }
    const token = signToken(user.id, user.openid || '');
    res.json({ code: 0, message: 'success', data: { token, user: formatUser(user) } });
  } catch (err) {
    console.error(err); res.status(500).json({ code: -1, message: '服务器内部错误' });
  }
});

// ─── 网页端注册 ───────────────────────────────────────────────────────────────
router.post('/web-register', loginLimiter, (req, res) => {
  try {
    const { nickname, email, phone, password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ code: -1, message: '密码至少6位' });
    }
    if (!email && !phone) {
      return res.status(400).json({ code: -1, message: '邮箱或手机号至少填一项' });
    }
    // 查重
    const exists = db.prepare(`SELECT id FROM users WHERE email = ? OR phone = ?`)
      .get(email || '', phone || '');
    if (exists) return res.status(409).json({ code: -1, message: '该账号已注册' });

    const result = db.prepare(
      `INSERT INTO users (nickname, email, phone, password, avatar, openid, created_at)
       VALUES (?, ?, ?, ?, '', 'web_' || hex(randomblob(8)), datetime('now'))`
    ).run(nickname || '新用户', email || '', phone || '', hashPassword(password));

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    const token = signToken(user.id, user.openid);
    res.json({ code: 0, message: 'success', data: { token, user: formatUser(user) } });
  } catch (err) {
    console.error(err); res.status(500).json({ code: -1, message: '服务器内部错误' });
  }
});

module.exports = router;
