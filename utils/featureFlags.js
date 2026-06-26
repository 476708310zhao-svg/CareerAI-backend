const db = require('../db/database');

const FEATURE_DEFINITIONS = Object.freeze({
  recruitment: {
    label: '职位功能',
    description: '控制职位列表、职位详情、职位搜索、一键申请、首页职位推荐和职位聚合接口。',
    env: 'RECRUITMENT_FEATURE_ENABLED',
    defaultValue: false
  },
  membership: {
    label: '会员权益',
    description: '控制会员页入口和会员权益相关展示。',
    env: 'MEMBERSHIP_FEATURE_ENABLED',
    defaultValue: false
  }
});

let featureFlagsSeeded = false;

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
  return fallback;
}

function envDefault(feature) {
  const def = FEATURE_DEFINITIONS[feature];
  if (!def) return false;
  return parseBoolean(process.env[def.env], def.defaultValue);
}

function seedFeatureFlags() {
  if (featureFlagsSeeded) return;
  const insert = db.prepare(`
    INSERT OR IGNORE INTO feature_flags (feature, label, description, enabled)
    VALUES (@feature, @label, @description, @enabled)
  `);
  const updateMeta = db.prepare(`
    UPDATE feature_flags
    SET label=@label, description=@description
    WHERE feature=@feature
  `);
  const tx = db.transaction(() => {
    Object.keys(FEATURE_DEFINITIONS).forEach(feature => {
      const def = FEATURE_DEFINITIONS[feature];
      const row = {
        feature,
        label: def.label,
        description: def.description,
        enabled: envDefault(feature) ? 1 : 0
      };
      insert.run(row);
      updateMeta.run(row);
    });
  });
  tx();
  featureFlagsSeeded = true;
}

function rowToFeature(row) {
  return {
    feature: row.feature,
    label: row.label || row.feature,
    description: row.description || '',
    enabled: !!row.enabled,
    updatedAt: row.updated_at || ''
  };
}

function isFeatureEnabled(feature) {
  if (!FEATURE_DEFINITIONS[feature]) return false;
  seedFeatureFlags();
  const row = db.prepare('SELECT enabled FROM feature_flags WHERE feature=?').get(feature);
  if (!row) return envDefault(feature);
  return !!row.enabled;
}

function getPublicFeatureFlags() {
  const flags = {};
  Object.keys(FEATURE_DEFINITIONS).forEach(feature => {
    flags[feature] = isFeatureEnabled(feature);
  });
  return flags;
}

function listFeatureFlags() {
  seedFeatureFlags();
  return db.prepare('SELECT * FROM feature_flags ORDER BY feature ASC').all().map(rowToFeature);
}

function updateFeatureFlag(feature, enabled) {
  if (!FEATURE_DEFINITIONS[feature]) {
    const err = new Error('未知功能开关');
    err.code = 'UNKNOWN_FEATURE';
    throw err;
  }
  seedFeatureFlags();
  db.prepare(`
    UPDATE feature_flags
    SET enabled=?, updated_at=datetime('now')
    WHERE feature=?
  `).run(enabled ? 1 : 0, feature);
  return rowToFeature(db.prepare('SELECT * FROM feature_flags WHERE feature=?').get(feature));
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
  FEATURE_DEFINITIONS,
  getPublicFeatureFlags,
  isFeatureEnabled,
  listFeatureFlags,
  parseBoolean,
  requireFeature,
  seedFeatureFlags,
  updateFeatureFlag
};
