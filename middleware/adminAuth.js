const jwt = require('jsonwebtoken');
const { hasPermission, permissionForAdminPath } = require('../utils/adminPermissions');
const { getAccount } = require('../utils/adminAccounts');

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
    const id = Number(payload.id);
    const account = Number.isSafeInteger(id) && id > 0 ? getAccount(id) : null;
    if (!account || !account.is_active || account.username !== payload.sub) {
      return res.status(403).json({ code: 'ADMIN_INACTIVE', message: '管理账号已停用或不存在' });
    }
    req.admin = { ...payload, adminRole: account.role, permissions: account.permissions };
    const permission = permissionForAdminPath(req.originalUrl || req.path);
    if (permission && !hasPermission(req.admin, permission)) {
      return res.status(403).json({ code: -1, message: '没有该模块的管理权限' });
    }
    next();
  } catch (e) {
    res.status(401).json({ code: -1, message: 'Token 无效或已过期，请重新登录' });
  }
}

module.exports = adminAuth;
