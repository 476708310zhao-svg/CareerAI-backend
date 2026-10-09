'use strict';

const isolatedRuntime = require('./helpers/isolatedTestRuntime.cjs');
isolatedRuntime.install();
isolatedRuntime.prepare();

const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs');
const jwt = require('jsonwebtoken');
const path = require('node:path');
const test = require('node:test');
isolatedRuntime.registerCleanup(test);

const db = require('../db/database');
const favoriteRoute = require('../routes/favorites');
const userRoute = require('../routes/users');
const featureFlags = require('../utils/featureFlags');
let server;
let baseUrl;

test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/users', userRoute);
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
});

test('favorite GET projection is read-only and keeps legacy rows visible to their owner', () => {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const userA = Number(db.prepare('INSERT INTO users (openid,nickname) VALUES (?,?)')
    .run(`cp7_a_${stamp}`, 'CP7 A').lastInsertRowid);
  const userB = Number(db.prepare('INSERT INTO users (openid,nickname) VALUES (?,?)')
    .run(`cp7_b_${stamp}`, 'CP7 B').lastInsertRowid);
  const targetId = `legacy_${stamp}`;
  try {
    db.prepare('INSERT INTO favorites (user_id,type,target_id,title) VALUES (?,?,?,?)')
      .run(userA, 'company', targetId, 'A 私有公司');
    const before = db.prepare('SELECT COUNT(*) AS count FROM favorite_sync_v4').get().count;
    const rowsA = favoriteRoute.readFavoriteRows(userA, '', true);
    const rowsB = favoriteRoute.readFavoriteRows(userB, '', true);
    const after = db.prepare('SELECT COUNT(*) AS count FROM favorite_sync_v4').get().count;
    assert.equal(after, before, 'GET projection must not backfill or mutate sync tables');
    assert.equal(rowsA.some(row => row.targetId === targetId && row.title === 'A 私有公司'), true);
    assert.equal(rowsB.some(row => row.targetId === targetId), false);
  } finally {
    db.prepare('DELETE FROM favorites WHERE user_id IN (?,?)').run(userA, userB);
    db.prepare('DELETE FROM users WHERE id IN (?,?)').run(userA, userB);
  }
});

test('favorite mutations reject unsupported types before writing', () => {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const userId = Number(db.prepare('INSERT INTO users (openid,nickname) VALUES (?,?)')
    .run(`cp7_type_${stamp}`, 'CP7 Type').lastInsertRowid);
  try {
    assert.throws(() => favoriteRoute.applyFavoriteOperation(userId, {
      type: 'private_payload', targetId: '1', updatedAt: new Date().toISOString()
    }, 'upsert'), /收藏类型无效/);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM favorites WHERE user_id=?').get(userId).count, 0);
  } finally {
    db.prepare('DELETE FROM users WHERE id=?').run(userId);
  }
});

test('job favorite writes honor the authoritative server recruitment feature flag', () => {
  const original = featureFlags.isFeatureEnabled('recruitment');
  try {
    featureFlags.updateFeatureFlag('recruitment', false);
    assert.throws(() => favoriteRoute.applyFavoriteOperation(1, {
      type: 'job', targetId: 'hidden-job', updatedAt: new Date().toISOString()
    }, 'upsert'), /职位功能当前未开放/);
  } finally {
    featureFlags.updateFeatureFlag('recruitment', original);
  }
});

test('DELETE /me/data removes legacy, synchronized and idempotency favorite rows without resurrection', async () => {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const userId = Number(db.prepare('INSERT INTO users (openid,nickname) VALUES (?,?)')
    .run(`cp7_delete_${stamp}`, 'CP7 Delete').lastInsertRowid);
  const targetId = `delete_${stamp}`;
  try {
    db.prepare('INSERT INTO favorites (user_id,type,target_id,title) VALUES (?,?,?,?)')
      .run(userId, 'company', targetId, '待删除公司');
    db.prepare(`INSERT INTO favorite_sync_v4
      (user_id,type,target_id,status,title,client_updated_at) VALUES (?,?,?,?,?,?)`)
      .run(userId, 'company', targetId, 'active', '待删除公司', new Date().toISOString());
    db.prepare(`INSERT INTO favorite_operations_v4
      (user_id,operation_id,type,target_id,action) VALUES (?,?,?,?,?)`)
      .run(userId, `op_${stamp}`, 'company', targetId, 'upsert');
    const token = jwt.sign({ userId, openid: `cp7_delete_${stamp}` }, process.env.JWT_SECRET);
    const response = await fetch(`${baseUrl}/api/users/me/data`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    const summary = payload.data;
    assert.equal(summary.favoriteOperationsV4, 1);
    assert.equal(summary.favoriteSyncV4, 1);
    assert.equal(summary.favorites, 1);
    assert.equal(favoriteRoute.readFavoriteRows(userId, '', true).length, 0);
  } finally {
    db.prepare('DELETE FROM favorite_operations_v4 WHERE user_id=?').run(userId);
    db.prepare('DELETE FROM favorite_sync_v4 WHERE user_id=?').run(userId);
    db.prepare('DELETE FROM favorites WHERE user_id=?').run(userId);
    db.prepare('DELETE FROM users WHERE id=?').run(userId);
  }
});

test('favorite timestamps clamp extreme future client clocks and unknown remote types are ignored', () => {
  const now = Date.parse('2026-10-09T00:00:00.000Z');
  assert.equal(favoriteRoute.normalizeTimestamp('2099-01-01T00:00:00.000Z', now), new Date(now).toISOString());
  const source = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/utils/favorites.js'), 'utf8');
  assert.match(source, /if \(!row \|\| !TYPES\.includes\(row\.type\)\) return/);
  assert.doesNotMatch(source, /TYPES\.includes\(row\.type\) \? row\.type : 'job'/);
});

test('Checkpoint 7 keeps one AI entry and clears owner-scoped local assets on privacy deletion', () => {
  const root = path.join(__dirname, '..', 'miniprogram');
  const resourceWxml = fs.readFileSync(path.join(root, 'pages/resources/resources.wxml'), 'utf8');
  const profileWxml = fs.readFileSync(path.join(root, 'pages/profile/profile.wxml'), 'utf8');
  const settingsJs = fs.readFileSync(path.join(root, 'package-user/pages/settings/settings.js'), 'utf8');
  const resourceJs = fs.readFileSync(path.join(root, 'pages/resources/resources.js'), 'utf8');
  const assistantWxml = fs.readFileSync(path.join(root, 'package-ai/pages/ai-assistant/ai-assistant.wxml'), 'utf8');
  const applicationsJs = fs.readFileSync(path.join(root, 'pages/applications/applications.js'), 'utf8');
  const legacyAiCareer = fs.readFileSync(path.join(root, 'pages/ai-career/ai-career.js'), 'utf8');
  assert.match(resourceJs, /测评资料/);
  assert.match(resourceJs, /笔试题库/);
  assert.match(resourceJs, /面试经验/);
  assert.match(resourceJs, /我的已购/);
  assert.match(resourceJs, /不会展示虚构的已购数量/);
  assert.match(resourceJs, /company: this\.data\.company/);
  assert.match(resourceJs, /role: this\.data\.role/);
  assert.match(resourceJs, /type: this\.data\.questionType/);
  assert.doesNotMatch(resourceWxml, /pages\/ai-career\/ai-career/);
  assert.doesNotMatch(assistantWxml, /四 Agent/);
  assert.match(applicationsJs, /package-ai\/pages\/ai-assistant\/ai-assistant\?source=applications/);
  assert.match(legacyAiCareer, /wx\.redirectTo\(\{ url: '\/package-ai\/pages\/ai-assistant\/ai-assistant'/);
  assert.match(profileWxml, /我的简历/);
  assert.match(profileWxml, /我的已购/);
  assert.match(profileWxml, /我的收藏/);
  assert.match(profileWxml, /账号与设置/);
  assert.match(settingsJs, /campusFollowFavoriteLinkedV1:/);
  assert.match(settingsJs, /campusReminder:/);
  assert.match(settingsJs, /clearLocalFavoriteData\(\)/);
});

test('Checkpoint 7 guards delayed reminder writes and scopes AI/message caches by owner', () => {
  const root = path.join(__dirname, '..', 'miniprogram');
  const campus = fs.readFileSync(path.join(root, 'package-content/pages/campus-detail/campus-detail.js'), 'utf8');
  const reminders = fs.readFileSync(path.join(root, 'utils/reminders.js'), 'utf8');
  const assistant = fs.readFileSync(path.join(root, 'package-ai/pages/ai-assistant/ai-assistant.js'), 'utf8');
  const unread = fs.readFileSync(path.join(root, 'utils/unread-messages.js'), 'utf8');
  assert.match(campus, /_isActionCurrent\(operation\)/);
  assert.match(campus, /登录后才能保存校招收藏和截止提醒/);
  assert.match(campus, /\^\\d\+\$/);
  assert.match(reminders, /operation\.generation === operationGeneration/);
  assert.match(reminders, /ownerStorage\.keyFor\(owner, 'campusReminder'/);
  assert.match(assistant, /ownerStorage\.key\(CACHE_KEY\)/);
  assert.match(assistant, /ownerStorage\.key\(SAVED_KEY\)/);
  assert.match(unread, /ownerStorage\.get\(KEY/);
});
