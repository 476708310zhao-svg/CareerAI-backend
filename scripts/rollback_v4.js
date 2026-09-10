#!/usr/bin/env node
require('dotenv').config();
const db = require('../db/database');
const { ensureV4Schema } = require('../db/v4Schema');
ensureV4Schema();

function plan() {
  return {
    applicationHistory: db.prepare("SELECT COUNT(*) AS count FROM application_history WHERE actor_type='migration' AND note='V3 数据迁移初始化'").get().count,
    sponsorProfiles: db.prepare("SELECT COUNT(*) AS count FROM job_sponsor_profiles WHERE source='legacy_inference'").get().count,
    untouchedProfiles: db.prepare("SELECT COUNT(*) AS count FROM user_profiles WHERE profile_version=1 AND field_sources='{}'").get().count
  };
}

function apply() {
  if (!process.argv.includes('--confirm=ROLLBACK_V4')) throw new Error('正式回滚必须同时提供 --apply --confirm=ROLLBACK_V4');
  const before = plan();
  db.transaction(() => {
    db.prepare("DELETE FROM application_history WHERE actor_type='migration' AND note='V3 数据迁移初始化'").run();
    db.prepare("DELETE FROM job_sponsor_profiles WHERE source='legacy_inference'").run();
    db.prepare("DELETE FROM user_profiles WHERE profile_version=1 AND field_sources='{}'").run();
  })();
  return { before, after: plan() };
}

const result = process.argv.includes('--apply') ? apply() : { dryRun: true, plan: plan(), safety: '仅删除带迁移标记且未被用户编辑的数据' };
console.log(JSON.stringify(result, null, 2));
