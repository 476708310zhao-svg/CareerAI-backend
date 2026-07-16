#!/usr/bin/env node
require('dotenv').config();
const db = require('../db/database');
const { ensureV4Schema } = require('../db/v4Schema');
ensureV4Schema();
const slow = db.prepare(`SELECT route,method,duration_ms AS durationMs,status_code AS statusCode,created_at AS createdAt
  FROM api_performance_v4 WHERE slow=1 AND created_at>=datetime('now','-24 hour') ORDER BY duration_ms DESC LIMIT 20`).all();
const errors = db.prepare("SELECT severity,code,message,route,created_at AS createdAt FROM error_events_v4 WHERE created_at>=datetime('now','-24 hour') ORDER BY id DESC LIMIT 20").all();
const rollout = db.prepare("SELECT feature,percentage,status,updated_at AS updatedAt FROM rollout_config_v4 WHERE feature='v4'").get();
console.log(JSON.stringify({ slowThresholdMs: 800, slow, errors, rollout }, null, 2));
if (errors.filter(item => item.severity === 'critical').length) process.exitCode = 1;
