#!/usr/bin/env node
require('dotenv').config();
const db = require('../db/database');
const { ensureV4Schema } = require('../db/v4Schema');
ensureV4Schema();
const target = Number(process.argv[2]);
if (![0, 5, 20, 50, 100].includes(target)) throw new Error('用法: node scripts/rollout_v4.js 0|5|20|50|100 [--apply]');
const health = {
  recentErrors: db.prepare("SELECT COUNT(*) AS count FROM error_events_v4 WHERE severity='error' AND created_at>=datetime('now','-1 hour')").get().count,
  slowRequests: db.prepare("SELECT COUNT(*) AS count FROM api_performance_v4 WHERE slow=1 AND created_at>=datetime('now','-1 hour')").get().count
};
if (process.argv.includes('--apply')) {
  if (target > 5 && health.recentErrors > 10) throw new Error('近 1 小时错误过多，停止扩大灰度');
  const status = target === 0 ? 'paused' : target === 100 ? 'full' : 'rolling';
  db.prepare(`INSERT INTO rollout_config_v4(feature,percentage,status,updated_by,updated_at) VALUES('v4',?,?, 'script',datetime('now'))
    ON CONFLICT(feature) DO UPDATE SET percentage=excluded.percentage,status=excluded.status,updated_by='script',updated_at=datetime('now')`).run(target, status);
}
console.log(JSON.stringify({ apply: process.argv.includes('--apply'), target, health }, null, 2));
