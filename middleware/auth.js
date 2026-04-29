const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('[auth] JWT_SECRET 未配置，请在 .env 中设置');
}
if (JWT_SECRET === 'jobapp_super_secret_key_change_in_production') {
  throw new Error('[auth] 检测到默认 JWT_SECRET，请修改 .env 中的值为强随机密钥（可用 openssl rand -hex 32 生成）');
}
if (JWT_SECRET.length < 32) {
  console.warn('[auth] ⚠️  JWT_SECRET 长度不足 32 位，建议使用更长的随机密钥');
}

/**
 * JWT 鉴权中间件
 * 从 Authorization: Bearer <token> 头部解析并验证 token
 * 验证通过后将 { userId, openid } 挂载到 req.user
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ code: -1, message: '未登录，请先登录' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { userId: payload.userId, openid: payload.openid };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ code: -1, message: 'Token 已过期，请重新登录' });
    }
    return res.status(401).json({ code: -1, message: 'Token 无效' });
  }
}

/**
 * 可选鉴权中间件
 * token 有效则挂载 req.user；无 token 或无效则继续（不拦截）
 * 用于"登录后有额外数据，未登录也能访问"的场景
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(authHeader.slice(7), JWT_SECRET);
      req.user = { userId: payload.userId, openid: payload.openid };
    } catch (e) {
      // token 无效时忽略，不阻断请求
    }
  }
  next();
}

module.exports = { authMiddleware, optionalAuth };
