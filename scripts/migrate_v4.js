#!/usr/bin/env node

require('dotenv').config();
const db = require('../db/database');
const { ensureV4Schema } = require('../db/v4Schema');
const { getProfile } = require('../services/v4Profile');
const { listJobs } = require('../utils/jobData');
const { getSponsorProfile } = require('../services/v4Sponsor');

const LEGACY_TO_V4 = {
  pending: 'interested', collected: 'interested', online_apply: 'preparing',
  applied: 'applied', viewed: 'applied', oa: 'oa', first_interview: 'interview_1',
  interview: 'interview_1', second_interview: 'interview_2', hr_interview: 'final',
  offer: 'offer', rejected: 'rejected', closed: 'withdrawn'
};

function tableExists(name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}

function countRows(table) {
  return tableExists(table) ? db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count : 0;
}

function buildMigrationPlan() {
  const users = countRows('users');
  const applications = countRows('applications');
  const jobs = listJobs().length;
  const existingProfiles = countRows('user_profiles');
  const existingSponsorProfiles = countRows('job_sponsor_profiles');
  const applicationsWithHistory = tableExists('application_history')
    ? db.prepare('SELECT COUNT(DISTINCT application_id) AS count FROM application_history').get().count
    : 0;
  return {
    users: { total: users, pending: Math.max(0, users - existingProfiles) },
    jobs: { total: jobs, pending: Math.max(0, jobs - existingSponsorProfiles) },
    applications: { total: applications, pending: Math.max(0, applications - applicationsWithHistory) }
  };
}

function applyMigration() {
  ensureV4Schema();
  const before = buildMigrationPlan();
  const transaction = db.transaction(() => {
    db.prepare('SELECT id FROM users ORDER BY id').all().forEach(user => getProfile(user.id));
    listJobs().forEach(job => getSponsorProfile(job));
    db.prepare(`
      SELECT a.* FROM applications a
      WHERE NOT EXISTS (SELECT 1 FROM application_history h WHERE h.application_id=a.id)
      ORDER BY a.id
    `).all().forEach(application => {
      const legacy = application.progress_status || application.status || 'pending';
      const status = LEGACY_TO_V4[legacy] || 'interested';
      db.prepare(`
        INSERT INTO application_history
          (application_id, user_id, from_status, to_status, note, actor_type, created_at)
        VALUES (?, ?, '', ?, 'V3 数据迁移初始化', 'migration', COALESCE(?, datetime('now')))
      `).run(application.id, application.user_id, status, application.applied_at || application.created_at || null);
    });
  });
  transaction();
  return { before, after: buildMigrationPlan() };
}

function main() {
  const apply = process.argv.includes('--apply');
  const result = apply ? applyMigration() : { dryRun: true, plan: buildMigrationPlan() };
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) main();

module.exports = { buildMigrationPlan, applyMigration };
