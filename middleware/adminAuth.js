const jwt = require('jsonwebtoken');

/**
 * 管理员鉴权中间件
 * 验证 Authorization: Bearer <token>，token 中需含 role: 'admin'
 */
function adminAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ code: -1, message: '请先登录管理后台' });
  }
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    if (payload.role !== 'admin') throw new Error('not admin');
    req.admin = payload;
    next();
  } catch (e) {
    res.status(401).json({ code: -1, message: 'Token 无效或已过期，请重新登录' });
  }
}

module.exports = adminAuth;
