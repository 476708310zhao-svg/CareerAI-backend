const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const router = express.Router();
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

const JWT_SECRET    = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';
const WX_APP_ID     = process.env.WX_APP_ID     || '';
const WX_APP_SECRET = process.env.WX_APP_SECRET  || '';

const { parseId } = require('../db/utils');
const { formatUser } = require('../db/formatters');
const { loginLimiter } = require('../middleware/rateLimit');

function signToken(userId, openid) {
  return jwt.sign({ userId, openid }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// ─── 微信登录 ─────────────────────────────────────────────────────────────────
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ code: -1, message: '缺少 code 参数' });

    let openid;
    if (WX_APP_ID && WX_APP_SECRET && WX_APP_ID !== '你的小程序AppID') {
      const wxRes = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
        params: { appid: WX_APP_ID, secret: WX_APP_SECRET, js_code: code, grant_type: 'authorization_code' },
        timeout: 8000
      });
      if (wxRes.data.errcode) return res.status(400).json({ code: -1, message: '微信登录失败: ' + wxRes.data.errmsg });
      openid = wxRes.data.openid;
    } else {
      openid = 'dev_' + code;
    }

    let user = db.prepare('SELECT * FROM users WHERE openid = ?').get(openid);
    if (!user) {
      const result = db.prepare(
        'INSERT INTO users (openid) VALUES (?)'
      ).run(openid);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    }

    const token = signToken(user.id, user.openid);
    res.json({ code: 0, message: '登录成功', data: { token, user: formatUser(user) } });
  } catch (error) {
    console.error('[login error]', error.message);
    res.status(500).json({ code: -1, message: '登录失败，请稍后重试' });
  }
});

// ─── 更新昵称/头像 ─────────────────────────────────────────────────────────────
router.post('/update-profile', authMiddleware, (req, res) => {
  try {
    const { nickname, avatar } = req.body;
    if (nickname) db.prepare('UPDATE users SET nickname = ? WHERE id = ?').run(nickname, req.user.userId);
    if (avatar)   db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatar, req.user.userId);
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
    const { nickname, email, phone, education, jobPreference } = req.body;
    const updates = [];
    const vals = [];
    if (nickname !== undefined)     { updates.push('nickname = ?');       vals.push(nickname); }
    if (email !== undefined)        { updates.push('email = ?');          vals.push(email); }
    if (phone !== undefined)        { updates.push('phone = ?');          vals.push(phone); }
    if (education !== undefined)    { updates.push('education = ?');      vals.push(JSON.stringify(education)); }
    if (jobPreference !== undefined){ updates.push('job_preference = ?'); vals.push(JSON.stringify(jobPreference)); }
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

// ─── 简历列表 ─────────────────────────────────────────────────────────────────
router.get('/resumes', authMiddleware, (req, res) => {
  const resumes = db.prepare('SELECT * FROM resumes WHERE user_id = ? ORDER BY updated_at DESC').all(req.user.userId);
  res.json({ code: 0, message: 'success', data: resumes.map(r => ({
    ...r, userId: r.user_id,
    education: ja(r.education), experience: ja(r.experience), skills: ja(r.skills)
  }))});
});

// ─── 简历详情 ─────────────────────────────────────────────────────────────────
router.get('/resumes/:id', authMiddleware, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });
  const r = db.prepare('SELECT * FROM resumes WHERE id = ? AND user_id = ?').get(id, req.user.userId);
  if (!r) return res.status(404).json({ code: -1, message: '简历不存在' });
  res.json({ code: 0, message: 'success', data: {
    ...r, userId: r.user_id,
    education: ja(r.education), experience: ja(r.experience), skills: ja(r.skills)
  }});
});

// ─── 创建简历 ─────────────────────────────────────────────────────────────────
router.post('/resumes', authMiddleware, (req, res) => {
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

// ─── 更新简历 ─────────────────────────────────────────────────────────────────
router.put('/resumes/:id', authMiddleware, (req, res) => {
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
      `SELECT * FROM users WHERE (email = ? OR phone = ?) AND password = ?`
    ).get(account, account, password);
    if (!user) {
      return res.status(401).json({ code: -1, message: '账号或密码错误' });
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
    ).run(nickname || '新用户', email || '', phone || '', password);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    const token = signToken(user.id, user.openid);
    res.json({ code: 0, message: 'success', data: { token, user: formatUser(user) } });
  } catch (err) {
    console.error(err); res.status(500).json({ code: -1, message: '服务器内部错误' });
  }
});

module.exports = router;
