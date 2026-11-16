'use strict';

const { getMigrationStatus } = require('./migrate');

// Historical DDL remains available for brand-new and pre-baseline databases.
// A fully migrated database must use versioned migrations as its only schema
// authority; loading routes must not silently repair or change its structure.
function needsLegacyBootstrap(db) {
  const status = getMigrationStatus(db);
  if (status.pending.length > 0) return true;
  const required = ['users', 'resumes', 'applications', 'orders', 'aggregated_jobs',
    'cron_logs', 'oa_questions', 'resume_versions_v4'];
  const missing = required.filter(name => !db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
  if (missing.length) throw new Error(`Migrated database is missing baseline tables: ${missing.join(', ')}`);
  return false;
}

module.exports = { needsLegacyBootstrap };
