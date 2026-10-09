'use strict';

const isolatedRuntime = require('./helpers/isolatedTestRuntime.cjs');
isolatedRuntime.install();
isolatedRuntime.prepare();

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
isolatedRuntime.registerCleanup(test);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'sprint8_test_secret_1234567890abcdef';
process.env.CRON_SECRET = process.env.CRON_SECRET || 'sprint8_cron_secret_1234567890abcdef';
process.env.JWT_SECRET = 'test_secret_please_do_not_use_in_production_1234567890';
process.env.NOTIFY_EXTERNAL_DISABLED = '1';
const db = require('../db/database');
const { ensureV4Schema } = require('../db/v4Schema');
const todayTasks = require('../services/v4TodayTasks');
const { shanghaiDayKey, addCalendarDays } = require('../utils/shanghaiDate');
const agents = require('../services/v4Agents');
const interview = require('../services/v4Interview');

ensureV4Schema();
const notifyTest = require('../routes/notify')._test;
const favoriteRoute = require('../routes/favorites');
const { timestamp } = require('../miniprogram/utils/date-time');

test('Sprint 8 migration is additive and defines delivery and sync ledgers', () => {
  const migration = fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', '0006_sprint8_reliability.sql'), 'utf8');
  assert.doesNotMatch(migration, /^\s*(?:DROP|DELETE|TRUNCATE|ALTER)\b/im);
  assert.match(migration, /UNIQUE\(reminder_id, delivery_key\)/);
  assert.match(migration, /favorite_sync_v4/);
  assert.match(migration, /favorite_operations_v4/);
});

test('reminder delivery lease prevents duplicates and retries without another in-app message', () => {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const userId = Number(db.prepare('INSERT INTO users (openid,nickname) VALUES (?,?)')
    .run(`s8_notify_${stamp}`, 'Sprint 8 Notify').lastInsertRowid);
  const reminderId = Number(db.prepare(`INSERT INTO job_reminders
    (user_id,source_type,target_id,reminder_type,title,reminder_date,lead_days,enabled)
    VALUES (?,'favorite_job',?,'deadline','Reliability role','2030-01-10','[3]',1)`)
    .run(userId, `job_${stamp}`).lastInsertRowid);
  const row = db.prepare('SELECT * FROM job_reminders WHERE id=?').get(reminderId);
  const key = `deadline:favorite_job:job_${stamp}:2030-01-10:3`;
  try {
    const first = notifyTest.claimReminderDelivery(row, key);
    const concurrent = notifyTest.claimReminderDelivery(row, key);
    assert.equal(first.claimed, true);
    assert.equal(concurrent.claimed, false);
    assert.equal(concurrent.reason, 'in_progress');

    const message = { type: 'job_deadline', title: 'Test reminder', content: 'Test content' };
    const firstMessageId = notifyTest.ensureDeliveryInAppMessage(first.delivery.id, userId, message);
    const sameMessageId = notifyTest.ensureDeliveryInAppMessage(first.delivery.id, userId, message);
    assert.equal(firstMessageId, sameMessageId);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM messages WHERE user_id=?').get(userId).count, 1);

    assert.equal(notifyTest.finishReminderDelivery(first.delivery.id, row, key,
      { wechat: { status: 'failed', reason: 'mock_failure' } }, ''), false);
    const retry = notifyTest.claimReminderDelivery(row, key);
    assert.equal(retry.claimed, true);
    assert.equal(notifyTest.ensureDeliveryInAppMessage(retry.delivery.id, userId, message), firstMessageId);
    assert.equal(notifyTest.finishReminderDelivery(retry.delivery.id, row, key,
      { wechat: { status: 'skipped', reason: 'external_disabled' } }, ''), true);
    assert.equal(notifyTest.claimReminderDelivery(row, key).reason, 'already_sent');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM messages WHERE user_id=?').get(userId).count, 1);

    db.prepare("UPDATE job_reminders SET reminder_date='2030-01-12' WHERE id=?").run(reminderId);
    const changed = db.prepare('SELECT * FROM job_reminders WHERE id=?').get(reminderId);
    const changedKey = `deadline:favorite_job:job_${stamp}:2030-01-12:3`;
    assert.equal(notifyTest.claimReminderDelivery(changed, changedKey).claimed, true,
      'a changed deadline must create a new delivery key');
  } finally {
    db.prepare('DELETE FROM reminder_deliveries_v4 WHERE user_id=?').run(userId);
    db.prepare('DELETE FROM messages WHERE user_id=?').run(userId);
    db.prepare('DELETE FROM job_reminders WHERE user_id=?').run(userId);
    db.prepare('DELETE FROM users WHERE id=?').run(userId);
  }
});

test('reminder workers respect the configured concurrency limit', async () => {
  let active = 0;
  let maximum = 0;
  const results = await notifyTest.runWithConcurrency(Array.from({ length: 12 }, (_, index) => index), 3, async value => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 4));
    active -= 1;
    return value * 2;
  });
  assert.equal(maximum, 3);
  assert.deepEqual(results, Array.from({ length: 12 }, (_, index) => index * 2));
  assert.equal(notifyTest.boundedInt(99, 3, 5), 5);
});

test('Today sync incrementally merges devices and a stale device cannot overwrite newer state', () => {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const userId = Number(db.prepare('INSERT INTO users (openid,nickname) VALUES (?,?)')
    .run(`s8_today_${stamp}`, 'Sprint 8 Today').lastInsertRowid);
  try {
    todayTasks.syncLocal(userId, [{
      id: `device_a_${stamp}`, title: 'Device A task', done: false, doneKnown: true, updatedAt: '2030-01-01T00:00:00.000Z'
    }]);
    const afterB = todayTasks.syncLocal(userId, [{
      id: `device_b_${stamp}`, title: 'Device B task', done: false, doneKnown: true, updatedAt: '2030-01-01T00:00:01.000Z'
    }]);
    assert.ok(afterB.some(item => item.localKey === `device_a_${stamp}`));
    assert.ok(afterB.some(item => item.localKey === `device_b_${stamp}`));

    const taskA = afterB.find(item => item.localKey === `device_a_${stamp}`);
    todayTasks.updateStatus(userId, taskA.id, true, '2030-01-02T00:00:00.000Z');
    todayTasks.syncLocal(userId, [{
      id: `device_a_${stamp}`, title: 'Device A stale', done: false, doneKnown: true, updatedAt: '2030-01-01T12:00:00.000Z'
    }]);
    const finalTask = todayTasks.list(userId).find(item => item.id === taskA.id);
    assert.equal(finalTask.completed, true);
    assert.equal(finalTask.title, 'Device A task');
  } finally {
    db.prepare('DELETE FROM today_tasks_v4 WHERE user_id=?').run(userId);
    db.prepare('DELETE FROM users WHERE id=?').run(userId);
  }
});

test('favorite operations are idempotent and a newer tombstone wins across devices', () => {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const userId = Number(db.prepare('INSERT INTO users (openid,nickname) VALUES (?,?)')
    .run(`s8_fav_${stamp}`, 'Sprint 8 Favorite').lastInsertRowid);
  const targetId = `favorite_${stamp}`;
  try {
    const now = Date.now();
    const add = { type: 'job', targetId, title: 'Role', operationId: `add_${stamp}`, updatedAt: new Date(now - 2000).toISOString() };
    favoriteRoute.applyFavoriteOperation(userId, add, 'upsert');
    const duplicate = favoriteRoute.applyFavoriteOperation(userId, add, 'upsert');
    assert.equal(duplicate.duplicate, true);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM favorites WHERE user_id=? AND target_id=?').get(userId, targetId).count, 1);

    favoriteRoute.applyFavoriteOperation(userId, {
      type: 'job', targetId, operationId: `delete_${stamp}`, updatedAt: new Date(now - 1000).toISOString()
    }, 'delete');
    const stale = favoriteRoute.applyFavoriteOperation(userId, {
      type: 'job', targetId, title: 'Stale role', operationId: `stale_${stamp}`, updatedAt: new Date(now - 1500).toISOString()
    }, 'upsert');
    assert.equal(stale.stale, true);
    assert.equal(stale.row.status, 'deleted');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM favorites WHERE user_id=? AND target_id=?').get(userId, targetId).count, 0);
  } finally {
    db.prepare('DELETE FROM favorite_operations_v4 WHERE user_id=?').run(userId);
    db.prepare('DELETE FROM favorite_sync_v4 WHERE user_id=?').run(userId);
    db.prepare('DELETE FROM favorites WHERE user_id=?').run(userId);
    db.prepare('DELETE FROM users WHERE id=?').run(userId);
  }
});

test('favorites use the shared request client and no longer call wx.request directly', () => {
  const utility = fs.readFileSync(path.join(__dirname, '..', 'miniprogram', 'utils', 'favorites.js'), 'utf8');
  const api = fs.readFileSync(path.join(__dirname, '..', 'miniprogram', 'utils', 'api-favorites.js'), 'utf8');
  const page = fs.readFileSync(path.join(__dirname, '..', 'miniprogram', 'package-user', 'pages', 'favorites', 'favorites.js'), 'utf8');
  assert.doesNotMatch(utility, /wx\.request\s*\(/);
  assert.doesNotMatch(page, /wx\.request\s*\(/);
  assert.match(utility, /require\('\.\/api-favorites\.js'\)/);
  assert.match(api, /require\('\.\/api-client\.js'\)/);
});

test('favorite timestamps parse SQLite UTC safely on iOS-compatible paths', () => {
  assert.equal(timestamp('2026-08-03 08:50:12'), Date.UTC(2026, 7, 3, 8, 50, 12));
  assert.equal(timestamp('2026-08-03 08:50:12.25'), Date.UTC(2026, 7, 3, 8, 50, 12, 250));
  assert.equal(timestamp('2026-08-03T08:50:12.000Z'), Date.UTC(2026, 7, 3, 8, 50, 12));
  assert.equal(timestamp('2026-08-03'), Date.UTC(2026, 7, 3));
  assert.equal(timestamp('not-a-date'), 0);
});

test('Today recurring local tasks can repeat across days without rewriting history', () => {
  const userId = Number(db.prepare('INSERT INTO users (openid,nickname) VALUES (?,?)')
    .run('today_regression_' + Date.now(), 'API regression').lastInsertRowid);
  const task = { id: 'resume_polish', title: '完善简历', desc: '今日任务' };
  const legacySourceId = todayTasks.normalizeLocalTask(task).sourceId;
  const now = new Date();
  const today = shanghaiDayKey(now);
  const yesterday = addCalendarDays(today, -1);
  try {
    const oldId = Number(db.prepare(`INSERT INTO today_tasks_v4
      (user_id,source_type,source_id,local_key,title,status,task_date)
      VALUES (?,'home_local',?,? ,?,'completed',?)`)
      .run(userId,legacySourceId,task.id,task.title,yesterday).lastInsertRowid);
    const first = todayTasks.syncLocal(userId,[task],now).filter(row => row.localKey === task.id);
    assert.equal(first.length,1);
    assert.equal(first[0].taskDate,today);
    assert.equal(first[0].completed,false);
    assert.notEqual(first[0].id,oldId);
    const repeat = todayTasks.syncLocal(userId,[task],now).filter(row => row.localKey === task.id);
    assert.equal(repeat[0].id,first[0].id);
    assert.equal(db.prepare('SELECT status FROM today_tasks_v4 WHERE id=?').get(oldId).status,'completed');
    const deferred = todayTasks.deferTask(userId,first[0].id,1,now);
    assert.ok(deferred.task);
    assert.equal(deferred.task.taskDate,addCalendarDays(today,1));
    const recreated = todayTasks.syncLocal(userId,[task],now).find(row => row.localKey===task.id);
    assert.notEqual(recreated.id,first[0].id);
    assert.equal(db.prepare('SELECT count(*) AS n FROM today_tasks_v4 WHERE user_id=?').get(userId).n,3);
  } finally { db.prepare('DELETE FROM users WHERE id=?').run(userId); }
});

test('Today duplicate keys in a single request merge and preserve the newest completion', () => {
  const userId = Number(db.prepare('INSERT INTO users (openid,nickname) VALUES (?,?)')
    .run('today_duplicate_' + Date.now(), 'API regression').lastInsertRowid);
  const task = { id:'daily_duplicate', title:'重复任务', doneKnown:true };
  const newer = new Date(Date.now()+1000).toISOString();
  const older = new Date(Date.now()-1000).toISOString();
  try {
    const rows = todayTasks.syncLocal(userId,[{...task,done:true,updatedAt:newer},{...task,done:false,updatedAt:older}]);
    assert.equal(rows.length,1);
    assert.equal(rows[0].completed,true);
    assert.equal(rows[0].updatedAt,newer);
  } finally { db.prepare('DELETE FROM users WHERE id=?').run(userId); }
});

test('Today updating a legacy task title does not collide with yesterday', () => {
  const userId = Number(db.prepare('INSERT INTO users (openid,nickname) VALUES (?,?)')
    .run('today_legacy_update_' + Date.now(), 'API regression').lastInsertRowid);
  const task = { id:'legacy_rename', title:'重复标题' };
  const sourceId = todayTasks.normalizeLocalTask(task).sourceId;
  const now = new Date();
  const today = shanghaiDayKey(now);
  const yesterday = addCalendarDays(today,-1);
  const insert = db.prepare(`INSERT INTO today_tasks_v4 (user_id,source_type,source_id,local_key,title,task_date)
    VALUES (?,'home_local',?,?,?,?)`);
  try {
    insert.run(userId,sourceId,task.id,task.title,yesterday);
    insert.run(userId,sourceId,task.id,'旧标题',today);
    const rows = todayTasks.syncLocal(userId,[task],now);
    assert.equal(rows.length,1);
    assert.equal(rows[0].title,task.title);
  } finally { db.prepare('DELETE FROM users WHERE id=?').run(userId); }
});

test('Agent and interview task writes bind the injected Shanghai business date', () => {
  const userId = Number(db.prepare('INSERT INTO users (openid,nickname) VALUES (?,?)')
    .run(`shanghai_writers_${Date.now()}`, 'Shanghai task writers').lastInsertRowid);
  const applicationId = Number(db.prepare("INSERT INTO applications (user_id,job_id,status) VALUES (?,?,'interview_1')")
    .run(userId, `shanghai_writer_job_${Date.now()}`).lastInsertRowid);
  const now = new Date('2026-10-11T16:05:00.000Z');
  try {
    const agentTaskId = Number(db.prepare(`INSERT INTO ai_agent_tasks_v4
      (user_id,agent_type,status,input,output,write_action,confirmation_token)
      VALUES (?,'career_planner','awaiting_confirmation',?,?,'create_today_task','confirm-shanghai')`)
      .run(userId, JSON.stringify({ taskTitle: '上海凌晨 Agent 任务', writeValue: '执行建议' }), JSON.stringify({ message: '建议' })).lastInsertRowid);
    agents.confirmWrite(userId, agentTaskId, 'confirm-shanghai', now);
    assert.equal(db.prepare("SELECT task_date FROM today_tasks_v4 WHERE user_id=? AND source_type='ai_agent' AND source_id=?")
      .get(userId, agentTaskId).task_date, '2026-10-12');

    const spaceId = Number(db.prepare(`INSERT INTO interview_spaces_v4
      (user_id,application_id,company,job_title) VALUES (?,?,'Boundary Co','Engineer')`)
      .run(userId, applicationId).lastInsertRowid);
    const sessionId = Number(db.prepare(`INSERT INTO interview_sessions_v4
      (user_id,space_id,session_type,status) VALUES (?,?,'mock','active')`)
      .run(userId, spaceId).lastInsertRowid);
    db.prepare(`INSERT INTO interview_answers_v4
      (session_id,user_id,question,answer,feedback,content_score,structure_score,expression_score,job_match_score)
      VALUES (?,?,'Question','Answer','Feedback',50,40,30,20)`).run(sessionId, userId);
    interview.completeSession(userId, sessionId, now);
    const interviewDates = db.prepare("SELECT task_date FROM today_tasks_v4 WHERE user_id=? AND source_type='interview_report'")
      .all(userId).map(row => row.task_date);
    assert.equal(interviewDates.length, 2);
    assert.ok(interviewDates.every(day => day === '2026-10-12'));
  } finally {
    db.prepare('DELETE FROM users WHERE id=?').run(userId);
  }
});
