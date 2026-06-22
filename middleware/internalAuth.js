const jwt = require('jsonwebtoken');

function getCronSecret() {
  return String(process.env.CRON_SECRET || '').trim();
}

function hasValidCronSecret(req) {
  const expected = getCronSecret();
  if (!expected) return process.env.NODE_ENV !== 'production';
  const provided = String(req.headers['x-cron-secret'] || req.query.secret || '').trim();
  return provided && provided === expected;
}

function hasAdminToken(req) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) return false;
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    return payload && payload.role === 'admin';
  } catch (e) {
    return false;
  }
}

function internalTaskAuth(req, res, next) {
  if (process.env.NODE_ENV === 'production' && !getCronSecret()) {
    return res.status(503).json({ code: -1, message: '内部任务密钥未配置' });
  }
  if (hasValidCronSecret(req) || hasAdminToken(req)) return next();
  return res.status(401).json({ code: -1, message: 'unauthorized' });
}

module.exports = { internalTaskAuth };
