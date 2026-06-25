const FEATURE_DEFAULTS = Object.freeze({
  recruitment: false,
  membership: false
});

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
  return fallback;
}

function isFeatureEnabled(feature) {
  if (feature === 'recruitment') {
    return parseBoolean(process.env.RECRUITMENT_FEATURE_ENABLED, FEATURE_DEFAULTS.recruitment);
  }
  if (feature === 'membership') {
    return parseBoolean(process.env.MEMBERSHIP_FEATURE_ENABLED, FEATURE_DEFAULTS.membership);
  }
  return false;
}

function getPublicFeatureFlags() {
  return {
    recruitment: isFeatureEnabled('recruitment'),
    membership: isFeatureEnabled('membership')
  };
}

function requireFeature(feature) {
  return (_req, res, next) => {
    if (isFeatureEnabled(feature)) return next();
    return res.status(503).json({
      code: -1,
      message: '该功能当前未开放',
      data: { feature, enabled: false }
    });
  };
}

module.exports = {
  getPublicFeatureFlags,
  isFeatureEnabled,
  parseBoolean,
  requireFeature
};
