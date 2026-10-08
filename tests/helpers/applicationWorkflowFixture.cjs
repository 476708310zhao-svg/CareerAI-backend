'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const temporaryRoot = path.resolve(process.env.APPLICATION_WORKFLOW_FIXTURE_ROOT || '');
Object.assign(process.env, {
  WEB_TEST_ISOLATED: '1',
  DB_PATH: path.join(temporaryRoot, 'database', 'workflow.db'),
  DATA_DIR: path.join(temporaryRoot, 'data'),
  UPLOAD_DIR: path.join(temporaryRoot, 'uploads'),
  JWT_SECRET: 'application_workflow_fixture_secret_not_for_production',
  V4_AI_LIVE_ENABLED: 'false',
  ANALYTICS_DATA_CLASS: 'test'
});

function isInside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

function validateIsolation() {
  assert.ok(process.env.APPLICATION_WORKFLOW_FIXTURE_ROOT, 'parent process must provide the fixture root');
  assert.equal(process.env.WEB_TEST_ISOLATED, '1', 'WEB_TEST_ISOLATED must be explicitly enabled');
  for (const key of ['DB_PATH', 'DATA_DIR', 'UPLOAD_DIR']) {
    assert.ok(process.env[key], `${key} must be explicitly configured`);
    assert.ok(path.isAbsolute(process.env[key]), `${key} must be absolute`);
    assert.ok(isInside(temporaryRoot, process.env[key]), `${key} must stay inside the fixture root`);
  }
  assert.equal(path.dirname(path.resolve(temporaryRoot)), path.resolve(os.tmpdir()), 'fixture root must be in the system temporary directory');
  assert.match(path.basename(temporaryRoot), /^jobapp-application-workflow-/);
}

validateIsolation();

let cleaned = false;
function cleanupRoot() {
  if (cleaned) return;
  validateIsolation();
  // The parent owns deletion so it can clean up even when this child times out or is killed.
  cleaned = true;
}
process.once('exit', cleanupRoot);

const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../../db/database');
const { STATUS_TEXT, V4_TO_PROGRESS, broadStatus } = require('../../utils/applicationStatus');

// Match the existing startup schema before applying the versioned migration API.
require('../../routes/payment');
require('../../routes/aggregate');
require('../../routes/oa');
require('../../db/v4Schema').ensureV4Schema();
require('../../db/migrate').applyPendingMigrations(db);

const ownerId = Number(db.prepare("INSERT INTO users(openid,nickname) VALUES ('cp2_owner','CP2 owner')").run().lastInsertRowid);
const otherId = Number(db.prepare("INSERT INTO users(openid,nickname) VALUES ('cp2_other','CP2 other')").run().lastInsertRowid);
const missingProfileUserId = 999999;
const tokens = new Map([ownerId, otherId, missingProfileUserId]
  .map(userId => [userId, jwt.sign({ userId }, process.env.JWT_SECRET)]));

function seedResume(userId, name) {
  const resumeId = Number(db.prepare('INSERT INTO resumes(user_id,name,data) VALUES (?,?,?)').run(userId, name, '{}').lastInsertRowid);
  const versionId = Number(db.prepare(`INSERT INTO resume_versions_v4
    (resume_id,user_id,version_no,name,content) VALUES (?,?,1,?,?)`).run(resumeId, userId, `${name} V1`, '{}').lastInsertRowid);
  db.prepare('UPDATE resumes SET current_version_id=? WHERE id=?').run(versionId, resumeId);
  return { resumeId, versionId };
}

const ownerResume = seedResume(ownerId, 'Owner resume');
const otherResume = seedResume(otherId, 'Other resume');
const seedApplicationId = Number(db.prepare(`INSERT INTO applications
  (user_id,job_id,source_job_id,source_type,job_snapshot,status,status_text,v4_status,progress_status,company,job_title,archived_at)
  VALUES (?,'cp2-seed-job','cp2-seed-job','job','{}','pending','准备申请','preparing','online_apply','Seed company','Seed role',datetime('now'))`)
  .run(ownerId).lastInsertRowid);

// These are the four material types supported by the HEAD schema. Do not rely on later dirty-schema additions.
for (const materialType of ['tailored_resume', 'cover_letter', 'recruiter_message', 'follow_up_email']) {
  db.prepare(`INSERT INTO ai_application_material_drafts
    (user_id,application_id,resume_id,resume_version_id,material_type,status,content,ai_model,prompt_version)
    VALUES (?,?,?,?,?,'pending',?,'fixture','head-schema')`)
    .run(ownerId, seedApplicationId, ownerResume.resumeId, ownerResume.versionId, materialType, `${materialType} fixture`);
}

const application = express();
application.use(express.json());
application.use('/api/v4/applications', require('../../routes/v4/applications'));
application.use((error, request, response, next) => {
  void next;
  response.status(error.status || 500).json({ code: -1, message: error.message });
});

let server;
let baseUrl;
let sequence = 0;

before(async () => {
  server = await new Promise(resolve => {
    const listening = application.listen(0, '127.0.0.1', () => resolve(listening));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  try {
    if (server) await new Promise(resolve => server.close(resolve));
  } finally {
    if (db.open) db.close();
    cleanupRoot();
  }
});

async function call(route, method = 'GET', body, userId = ownerId) {
  const response = await fetch(`${baseUrl}/api/v4/applications${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(userId ? { Authorization: `Bearer ${tokens.get(userId)}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json(), headers: response.headers };
}

async function create(status = 'preparing', userId = ownerId, overrides = {}) {
  sequence += 1;
  const jobId = String(overrides.jobId || `cp2-job-${sequence}`);
  const payload = {
    jobId,
    status: ['interested', 'preparing'].includes(status) ? status : 'preparing',
    jobSnapshot: { company: 'Example company', title: `Role ${sequence}`, description: 'Data analysis and communication' },
    ...overrides
  };
  const response = await call('', 'POST', payload, userId);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const row = response.body.data;
  if (status !== row.status) {
    db.prepare(`UPDATE applications SET status=?,status_text=?,v4_status=?,progress_status=? WHERE id=? AND user_id=?`)
      .run(broadStatus(status), STATUS_TEXT[status], status, V4_TO_PROGRESS[status], row.id, userId);
  }
  return (await call(`/${row.id}/detail`, 'GET', undefined, userId)).body.data.application;
}

const snapshot = row => ({ id: row.id, status: row.status, historyId: row.historyId });
const current = async id => (await call(`/${id}/detail`)).body.data.application;
const historyCount = id => db.prepare('SELECT COUNT(*) AS count FROM application_history WHERE application_id=?').get(id).count;
const coreCounts = () => ({
  applications: db.prepare('SELECT COUNT(*) AS count FROM applications').get().count,
  history: db.prepare('SELECT COUNT(*) AS count FROM application_history').get().count,
  spaces: db.prepare('SELECT COUNT(*) AS count FROM interview_spaces_v4').get().count
});

test('fixture isolates every writable path under one system temporary root', () => {
  validateIsolation();
  assert.equal(db.name, path.resolve(process.env.DB_PATH));
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM ai_application_material_drafts WHERE application_id=?").get(seedApplicationId).count, 4);
});

test('create rolls back when the application insert fails', async () => {
  const before = coreCounts();
  db.exec(`CREATE TEMP TRIGGER cp2_reject_application BEFORE INSERT ON applications
    WHEN NEW.job_id='cp2-create-application-failure'
    BEGIN SELECT RAISE(ABORT,'cp2 application insert failure'); END`);
  try {
    const response = await call('', 'POST', {
      jobId: 'cp2-create-application-failure',
      jobSnapshot: { company: 'Failure company', title: 'Failure role' }
    });
    assert.equal(response.status, 500);
    assert.deepEqual(coreCounts(), before);
  } finally {
    db.exec('DROP TRIGGER cp2_reject_application');
  }
});

test('create rolls back the application when its initial history insert fails', async () => {
  const before = coreCounts();
  db.exec(`CREATE TEMP TRIGGER cp2_reject_create_history BEFORE INSERT ON application_history
    WHEN NEW.note='加入申请看板'
      AND (SELECT job_id FROM applications WHERE id=NEW.application_id)='cp2-create-history-failure'
    BEGIN SELECT RAISE(ABORT,'cp2 create history failure'); END`);
  try {
    const response = await call('', 'POST', {
      jobId: 'cp2-create-history-failure',
      jobSnapshot: { company: 'Failure company', title: 'Failure role' }
    });
    assert.equal(response.status, 500);
    assert.deepEqual(coreCounts(), before);
  } finally {
    db.exec('DROP TRIGGER cp2_reject_create_history');
  }
});

test('create rolls back application and history when the v4 status write fails', async () => {
  const before = coreCounts();
  db.exec(`CREATE TEMP TRIGGER cp2_reject_create_v4 BEFORE UPDATE OF v4_status ON applications
    WHEN NEW.job_id='cp2-create-v4-failure'
    BEGIN SELECT RAISE(ABORT,'cp2 create v4 failure'); END`);
  try {
    const response = await call('', 'POST', {
      jobId: 'cp2-create-v4-failure',
      jobSnapshot: { company: 'Failure company', title: 'Failure role' }
    });
    assert.equal(response.status, 500);
    assert.deepEqual(coreCounts(), before);
  } finally {
    db.exec('DROP TRIGGER cp2_reject_create_v4');
  }
});

test('analytics remains best-effort after a successful core create transaction', async () => {
  const beforeAnalytics = db.prepare("SELECT COUNT(*) AS count FROM analytics_events WHERE event_name='application_added'").get().count;
  db.exec(`CREATE TEMP TRIGGER cp2_reject_create_analytics BEFORE INSERT ON analytics_events
    WHEN NEW.event_name='application_added'
    BEGIN SELECT RAISE(ABORT,'cp2 analytics failure'); END`);
  try {
    const response = await call('', 'POST', {
      jobId: 'cp2-create-analytics-failure',
      jobSnapshot: { company: 'Analytics company', title: 'Analytics role' }
    });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(historyCount(response.body.data.id), 1);
    assert.equal((await current(response.body.data.id)).status, 'interested');
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM analytics_events WHERE event_name='application_added'").get().count, beforeAnalytics);
  } finally {
    db.exec('DROP TRIGGER cp2_reject_create_analytics');
  }
});

test('applications require authentication, isolate ownership and keep archived workspaces read-only', async () => {
  const row = await create();
  assert.equal((await call(`/${row.id}/workspace`, 'GET', undefined, 0)).status, 401);
  assert.equal((await call(`/${row.id}/workspace`, 'GET', undefined, otherId)).status, 404);
  assert.equal((await call('/bulk-status', 'POST', { items: [snapshot(row)], status: 'applied' }, otherId)).status, 404);

  const archivedTaskId = Number(db.prepare(`INSERT INTO application_tasks
    (application_id,user_id,title,due_at,priority) VALUES (?,?,?,'2026-10-20','medium')`)
    .run(seedApplicationId, ownerId, 'Archived task').lastInsertRowid);
  const archivedBefore = db.prepare(`SELECT status,status_text,v4_status,progress_status,deadline,notes,updated_at
    FROM applications WHERE id=?`).get(seedApplicationId);
  const archivedCounts = {
    history: historyCount(seedApplicationId),
    contacts: db.prepare('SELECT COUNT(*) AS count FROM application_contacts WHERE application_id=?').get(seedApplicationId).count,
    tasks: db.prepare('SELECT COUNT(*) AS count FROM application_tasks WHERE application_id=?').get(seedApplicationId).count,
    matches: db.prepare("SELECT COUNT(*) AS count FROM job_matches WHERE user_id=? AND job_id='cp2-seed-job'").get(ownerId).count
  };
  for (const route of [`/${seedApplicationId}/detail`, `/${seedApplicationId}/workspace`, `/${seedApplicationId}/history`]) {
    const response = await call(route);
    assert.equal(response.status, 200, `${route} must remain readable after archive`);
  }
  const archivedWrites = [
    [`/${seedApplicationId}/official-apply`, 'POST', {}],
    [`/${seedApplicationId}`, 'PATCH', { notes: 'must not change' }],
    [`/${seedApplicationId}/match`, 'POST', {}],
    [`/${seedApplicationId}/contacts`, 'POST', { name: 'must not exist' }],
    [`/${seedApplicationId}/tasks`, 'POST', { title: 'must not exist' }],
    [`/${seedApplicationId}/tasks/${archivedTaskId}`, 'PATCH', { completed: true }],
    [`/${seedApplicationId}/status`, 'PATCH', { status: 'applied' }]
  ];
  for (const [route, method, body] of archivedWrites) {
    assert.equal((await call(route, method, body)).status, 404, `${method} ${route} must reject archived writes`);
  }
  assert.deepEqual(db.prepare(`SELECT status,status_text,v4_status,progress_status,deadline,notes,updated_at
    FROM applications WHERE id=?`).get(seedApplicationId), archivedBefore);
  assert.equal(historyCount(seedApplicationId), archivedCounts.history);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM application_contacts WHERE application_id=?').get(seedApplicationId).count, archivedCounts.contacts);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM application_tasks WHERE application_id=?').get(seedApplicationId).count, archivedCounts.tasks);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM job_matches WHERE user_id=? AND job_id='cp2-seed-job'").get(ownerId).count, archivedCounts.matches);
  assert.equal(db.prepare('SELECT completed FROM application_tasks WHERE id=?').get(archivedTaskId).completed, 0);
});

test('board exposes revisions while single writes preserve legacy compatibility and reject stale ABA snapshots', async () => {
  const row = await create('preparing');
  const board = await call('/board');
  assert.equal(board.status, 200);
  assert.ok(board.body.data.statuses.some(item => item.value === 'offer'));
  const boardRow = board.body.data.groups.preparing.find(item => item.id === row.id);
  assert.equal(boardRow.historyId, row.historyId);

  for (const body of [undefined, {}, { status: 'applied', expectedState: {} },
    { status: 'applied', expectedState: { status: 'preparing' } },
    { status: 'applied', expectedState: { historyId: row.historyId } }]) {
    assert.equal((await call(`/${row.id}/status`, 'PATCH', body)).status, 400);
  }

  const toInterested = await call(`/${row.id}/status`, 'PATCH', { status: 'interested' });
  assert.equal(toInterested.status, 200);
  assert.equal(toInterested.body.data.previousStatus, 'preparing');
  assert.ok(toInterested.body.data.historyId > row.historyId);
  const interested = await current(row.id);
  assert.equal(interested.historyId, toInterested.body.data.historyId);
  assert.equal(interested.status, 'interested');
  assert.equal((await call(`/${row.id}/status`, 'PATCH', {
    status: 'preparing', expectedState: snapshot(interested)
  })).status, 200);
  const returned = await current(row.id);
  assert.equal(returned.status, 'preparing');
  assert.ok(returned.historyId > interested.historyId);
  assert.equal((await call(`/${row.id}/status`, 'PATCH', {
    status: 'applied', expectedState: snapshot(row)
  })).status, 409, 'same status with an older revision must still conflict');
});

test('bulk status validates every item and rejects conflicts without partial writes', async () => {
  const valid = await create('preparing');
  const illegal = await create('interested');
  const beforeHistory = historyCount(valid.id) + historyCount(illegal.id);
  const conflict = await call('/bulk-status', 'POST', { items: [snapshot(valid), snapshot(illegal)], status: 'applied' });
  assert.equal(conflict.status, 409);
  assert.equal((await current(valid.id)).status, 'preparing');
  assert.equal((await current(illegal.id)).status, 'interested');
  assert.equal(historyCount(valid.id) + historyCount(illegal.id), beforeHistory);

  for (const body of [
    undefined,
    {},
    { items: [], status: 'applied' },
    { items: [snapshot(valid), snapshot(valid)], status: 'applied' },
    { items: [{ ...snapshot(valid), historyId: '1' }], status: 'applied' },
    { items: [snapshot(valid)], status: 'toString' },
    { items: Array(51).fill(snapshot(valid)), status: 'applied' }
  ]) assert.equal((await call('/bulk-status', 'POST', body)).status, 400);
  assert.equal((await current(valid.id)).status, 'preparing');
  assert.equal((await current(illegal.id)).status, 'interested');
  assert.equal(historyCount(valid.id) + historyCount(illegal.id), beforeHistory);

  const originalSnapshot = snapshot(valid);
  assert.equal((await call(`/${valid.id}/status`, 'PATCH', {
    status: 'interested', expectedState: originalSnapshot
  })).status, 200);
  const interested = await current(valid.id);
  assert.equal((await call(`/${valid.id}/status`, 'PATCH', {
    status: 'preparing', expectedState: snapshot(interested)
  })).status, 200);
  assert.equal((await call('/bulk-status', 'POST', {
    items: [originalSnapshot], status: 'applied'
  })).status, 409, 'bulk writes must reject a stale ABA revision');
  assert.equal((await current(valid.id)).status, 'preparing');
});

test('bulk database failures roll back application and audit writes', async () => {
  const first = await create();
  const second = await create();
  const beforeHistory = historyCount(first.id) + historyCount(second.id);
  db.exec(`CREATE TEMP TRIGGER cp2_reject_bulk BEFORE INSERT ON application_history
    WHEN NEW.application_id=${second.id} AND NEW.actor_type='web_bulk'
    BEGIN SELECT RAISE(ABORT,'cp2 injected bulk failure'); END`);
  try {
    const response = await call('/bulk-status', 'POST', { items: [snapshot(first), snapshot(second)], status: 'applied' });
    assert.equal(response.status, 500);
    assert.equal((await current(first.id)).status, 'preparing');
    assert.equal((await current(second.id)).status, 'preparing');
    assert.equal(historyCount(first.id) + historyCount(second.id), beforeHistory);
  } finally {
    db.exec('DROP TRIGGER cp2_reject_bulk');
  }
});

test('bulk status batches only changed members and returns no undo for an unchanged batch', async () => {
  const unchanged = await create('applied');
  const changed = await create('preparing');
  const mixed = await call('/bulk-status', 'POST', {
    items: [snapshot(unchanged), snapshot(changed)], status: 'applied'
  });
  assert.equal(mixed.status, 200);
  assert.equal(mixed.body.data.changed, 1);
  assert.equal(mixed.body.data.unchanged, 1);
  assert.match(mixed.body.data.batchId, /^[0-9a-f-]{36}$/i);
  assert.equal(mixed.body.data.undo.batchId, mixed.body.data.batchId);
  assert.equal(mixed.body.data.undo.historyIds.length, 1);
  assert.equal(mixed.body.data.results[0].changed, false);
  assert.equal(mixed.body.data.results[1].changed, true);
  const history = db.prepare(`SELECT application_id AS applicationId,batch_id AS batchId,batch_size AS batchSize
    FROM application_history WHERE id=?`).get(mixed.body.data.undo.historyIds[0]);
  assert.deepEqual(history, { applicationId: changed.id, batchId: mixed.body.data.batchId, batchSize: 1 });

  const restored = await call('/bulk-status/undo', 'POST', { historyIds: mixed.body.data.undo.historyIds });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.data.restored, 1);
  assert.equal((await current(unchanged.id)).status, 'applied');
  assert.equal((await current(changed.id)).status, 'preparing');

  const first = await create('applied');
  const second = await create('applied');
  const beforeHistory = historyCount(first.id) + historyCount(second.id);
  const allUnchanged = await call('/bulk-status', 'POST', {
    items: [snapshot(first), snapshot(second)], status: 'applied'
  });
  assert.equal(allUnchanged.status, 200);
  assert.equal(allUnchanged.body.data.changed, 0);
  assert.equal(allUnchanged.body.data.unchanged, 2);
  assert.equal(allUnchanged.body.message, '申请状态未变化');
  assert.equal(allUnchanged.body.data.batchId, null);
  assert.equal(allUnchanged.body.data.undo, null);
  assert.equal(historyCount(first.id) + historyCount(second.id), beforeHistory);
});

test('bulk undo requires one complete identified batch and remains owner-scoped, atomic and one-time', async () => {
  const first = await create();
  const second = await create();
  const changed = await call('/bulk-status', 'POST', { items: [snapshot(first), snapshot(second)], status: 'applied' });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.data.changed, 2);
  assert.match(changed.body.data.batchId, /^[0-9a-f-]{36}$/i);
  assert.equal(changed.body.data.undo.batchId, changed.body.data.batchId);
  const undo = { historyIds: changed.body.data.undo.historyIds };
  const batchRows = db.prepare(`SELECT id,batch_id AS batchId,batch_size AS batchSize
    FROM application_history WHERE id IN (?,?) ORDER BY id`).all(...undo.historyIds);
  assert.equal(batchRows.length, 2);
  assert.ok(batchRows.every(item => item.batchId === changed.body.data.batchId && item.batchSize === 2));
  assert.equal((await call('/bulk-status/undo', 'POST')).status, 400);
  assert.equal((await call('/bulk-status/undo', 'POST', {})).status, 400);
  assert.equal((await call('/bulk-status/undo', 'POST', undo, otherId)).status, 404);
  assert.equal((await call('/bulk-status/undo', 'POST', { historyIds: [undo.historyIds[0], undo.historyIds[0]] })).status, 400);
  assert.equal((await call('/bulk-status/undo', 'POST', { historyIds: [undo.historyIds[0]] })).status, 409);
  assert.equal((await current(first.id)).status, 'applied');
  assert.equal((await current(second.id)).status, 'applied');

  const third = await create();
  const fourth = await create();
  const otherBatch = (await call('/bulk-status', 'POST', {
    items: [snapshot(third), snapshot(fourth)], status: 'applied'
  })).body.data;
  assert.notEqual(otherBatch.batchId, changed.body.data.batchId);
  assert.equal((await call('/bulk-status/undo', 'POST', {
    historyIds: [undo.historyIds[0], otherBatch.undo.historyIds[1]]
  })).status, 409);
  for (const applicationId of [first.id, second.id, third.id, fourth.id]) {
    assert.equal((await current(applicationId)).status, 'applied', 'rejected undo must not partially restore a mixed batch');
  }

  const restored = await call('/bulk-status/undo', 'POST', undo);
  assert.equal(restored.status, 200);
  assert.equal(restored.body.data.restored, 2);
  assert.equal((await current(first.id)).status, 'preparing');
  assert.equal((await current(second.id)).status, 'preparing');
  assert.equal((await call('/bulk-status/undo', 'POST', undo)).status, 409);
  const analyticsRows = db.prepare(`SELECT event_name,route FROM analytics_events
    WHERE user_id=? AND event_name='application_status_restored' ORDER BY id DESC`).all(ownerId);
  assert.ok(analyticsRows.some(item => item.route === '/api/v4/applications/bulk-status/undo'));
});

test('bulk undo cannot overwrite later updates, restore expired batches or accept legacy unbatched history', async () => {
  const first = await create();
  const second = await create();
  const batch = (await call('/bulk-status', 'POST', { items: [snapshot(first), snapshot(second)], status: 'applied' })).body.data;
  const secondCurrent = await current(second.id);
  assert.equal((await call(`/${second.id}/status`, 'PATCH', { status: 'oa', expectedState: snapshot(secondCurrent) })).status, 200);
  assert.equal((await call('/bulk-status/undo', 'POST', { historyIds: batch.undo.historyIds })).status, 409);
  assert.equal((await current(first.id)).status, 'applied', 'failed undo must not partially restore earlier rows');

  const expiring = await create();
  const expiredBatch = (await call('/bulk-status', 'POST', { items: [snapshot(expiring)], status: 'applied' })).body.data;
  db.prepare("UPDATE application_history SET created_at=datetime('now','-11 minutes') WHERE id=?").run(expiredBatch.undo.historyIds[0]);
  assert.equal((await call('/bulk-status/undo', 'POST', { historyIds: expiredBatch.undo.historyIds })).status, 409);
  assert.equal((await current(expiring.id)).status, 'applied');

  const legacy = await create();
  const legacyBatch = (await call('/bulk-status', 'POST', { items: [snapshot(legacy)], status: 'applied' })).body.data;
  db.prepare('UPDATE application_history SET batch_id=NULL,batch_size=NULL WHERE id=?').run(legacyBatch.undo.historyIds[0]);
  assert.equal((await call('/bulk-status/undo', 'POST', { historyIds: legacyBatch.undo.historyIds })).status, 409);
  assert.equal((await current(legacy.id)).status, 'applied');
});

test('single and bulk interview transitions create equivalent spaces and distinct audit actors', async () => {
  const single = await create('applied');
  const bulk = await create('applied');
  const singleResult = await call(`/${single.id}/status`, 'PATCH', { status: 'interview_1', expectedState: snapshot(single) });
  const bulkResult = await call('/bulk-status', 'POST', { items: [snapshot(bulk)], status: 'interview_1' });
  assert.equal(singleResult.status, 200);
  assert.equal(bulkResult.status, 200);
  assert.ok(singleResult.body.data.interviewSpaceId);
  assert.ok(bulkResult.body.data.results[0].interviewSpaceId);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM interview_spaces_v4 WHERE application_id IN (?,?)').get(single.id, bulk.id).count, 2);
  assert.equal(db.prepare('SELECT actor_type FROM application_history WHERE application_id=? ORDER BY id DESC').get(single.id).actor_type, 'user');
  assert.equal(db.prepare('SELECT actor_type FROM application_history WHERE application_id=? ORDER BY id DESC').get(bulk.id).actor_type, 'web_bulk');
  const singleWorkspace = (await call(`/${single.id}/workspace`)).body.data;
  const bulkWorkspace = (await call(`/${bulk.id}/workspace`)).body.data;
  assert.equal(singleWorkspace.interviews.spaces.length, 1);
  assert.equal(bulkWorkspace.interviews.spaces.length, 1);
  assert.equal(singleWorkspace.interviews.spaces[0].round, bulkWorkspace.interviews.spaces[0].round);
});

test('workspace is read-only and isolates resume options, materials and version-bound ATS reports', async () => {
  const row = await create('preparing', ownerId, { jobId: 'workspace-job' });
  assert.equal((await call(`/${row.id}`, 'PATCH', { resumeVersionId: String(otherResume.versionId) })).status, 404);
  assert.equal((await call(`/${row.id}`, 'PATCH', { resumeVersionId: String(ownerResume.versionId) })).status, 200);
  const another = await create('preparing', ownerId, { jobId: 'other-workspace-job' });
  const insertMaterial = (userId, clientId, applicationId, jobId, content) => db.prepare(`INSERT INTO application_materials
    (user_id,client_id,application_id,job_id,content,status) VALUES (?,?,?,?,?,'saved')`).run(userId, clientId, applicationId, jobId, content);
  insertMaterial(ownerId, 'cp2-explicit', row.id, '', 'explicit material');
  insertMaterial(ownerId, 'cp2-legacy', null, row.jobId, 'legacy material');
  insertMaterial(ownerId, 'cp2-wrong-explicit', another.id, row.jobId, 'wrong application');
  insertMaterial(otherId, 'cp2-other-owner', null, row.jobId, 'other owner');
  db.prepare(`INSERT INTO jd_match_reports(user_id,client_id,job_id,resume_version_id,ats_risk)
    VALUES (?,'cp2-wrong-report',?,'999999','wrong version')`).run(ownerId, row.jobId);
  db.prepare(`INSERT INTO jd_match_reports(user_id,client_id,job_id,resume_version_id,ats_risk)
    VALUES (?,'cp2-correct-report',?,?, 'correct version')`).run(ownerId, row.jobId, String(ownerResume.versionId));

  const changes = db.prepare('SELECT total_changes() AS count').get().count;
  const response = await call(`/${row.id}/workspace`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(db.prepare('SELECT total_changes() AS count').get().count, changes);
  const workspace = response.body.data;
  assert.deepEqual(workspace.materials.map(item => item.content).sort(), ['explicit material', 'legacy material']);
  assert.equal(workspace.resume.version.id, ownerResume.versionId);
  assert.equal(workspace.jdReport.atsRisk, 'correct version');
  assert.ok(workspace.resumeOptions.some(item => item.versionId === ownerResume.versionId));
  assert.ok(!workspace.resumeOptions.some(item => item.versionId === otherResume.versionId));
});

test('manual applications reject unsafe or incomplete snapshots and preserve duplicate identity', async () => {
  const base = {
    jobId: 'cp2-manual-stable', sourceType: ' manual ',
    jobSnapshot: { company: 'Manual company', title: 'Manual role', applyUrl: 'https://example.com/jobs/1' }
  };
  assert.equal((await call('', 'POST', { ...base, jobSnapshot: { title: 'Missing company' } })).status, 400);
  assert.equal((await call('', 'POST', { ...base, jobSnapshot: { ...base.jobSnapshot, applyUrl: 'javascript:alert(1)' } })).status, 400);
  assert.equal((await call('', 'POST', {
    ...base,
    jobId: 'cp2-manual-unsafe-source',
    jobSnapshot: { company: 'Manual company', title: 'Manual role', sourceUrl: 'javascript:alert(1)' }
  })).status, 400);
  assert.equal((await call('', 'POST', {
    ...base,
    jobId: 'cp2-manual-http-source',
    jobSnapshot: { company: 'Manual company', title: 'Manual role', sourceUrl: 'http://example.com/jobs/2' }
  })).status, 200);
  const created = await call('', 'POST', base);
  const duplicate = await call('', 'POST', base);
  assert.equal(created.status, 200);
  assert.equal(db.prepare('SELECT source_type AS sourceType FROM applications WHERE id=?').get(created.body.data.id).sourceType, 'manual');
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.data.applicationId, created.body.data.id);

  const aliasBase = {
    jobId: 'cp2-manual-application-alias', sourceType: ' MANUAL_APPLICATION ',
    jobSnapshot: { company: '  Alias   company  ', title: ' Alias   role ', applyUrl: 'https://example.com/jobs/alias' }
  };
  assert.equal((await call('', 'POST', {
    ...aliasBase, jobId: 'cp2-manual-application-missing-company', jobSnapshot: { title: 'Missing company' }
  })).status, 400);
  assert.equal((await call('', 'POST', {
    ...aliasBase, jobId: 'cp2-manual-application-unsafe-url',
    jobSnapshot: { company: 'Alias company', title: 'Alias role', applyUrl: 'file:///etc/passwd' }
  })).status, 400);
  const alias = await call('', 'POST', aliasBase);
  assert.equal(alias.status, 200);
  assert.deepEqual(db.prepare(`SELECT source_type AS sourceType,company,job_title AS jobTitle,job_link AS jobLink
    FROM applications WHERE id=?`).get(alias.body.data.id), {
    sourceType: 'manual', company: 'Alias company', jobTitle: 'Alias role', jobLink: 'https://example.com/jobs/alias'
  });
});

test('create rejects foreign resumes, foreign versions and version-resume mismatches', async () => {
  const secondOwnerResume = seedResume(ownerId, 'Owner resume two');
  const payload = suffix => ({
    jobId: `cp2-resume-boundary-${suffix}`,
    jobSnapshot: { company: 'Resume company', title: 'Resume role' }
  });
  assert.equal((await call('', 'POST', { ...payload('foreign-resume'), resumeId: otherResume.resumeId })).status, 404);
  assert.equal((await call('', 'POST', { ...payload('foreign-version'), resumeVersionId: otherResume.versionId })).status, 404);
  assert.equal((await call('', 'POST', {
    ...payload('mismatch'), resumeId: ownerResume.resumeId, resumeVersionId: secondOwnerResume.versionId
  })).status, 400);
  const valid = await call('', 'POST', {
    ...payload('valid'), resumeId: ownerResume.resumeId, resumeVersionId: ownerResume.versionId
  });
  assert.equal(valid.status, 200);
  assert.equal(valid.body.data.resumeId, ownerResume.resumeId);
  assert.equal(Number(valid.body.data.resumeVersionId), ownerResume.versionId);
});

test('generic patch is strict and idempotent while tasks support owned edits and interview time clearing', async () => {
  const row = await create();
  for (const body of [undefined, {}, { unknown: 'value' }, { status: 'applied', jobId: 'unsupported' }]) {
    assert.equal((await call(`/${row.id}`, 'PATCH', body)).status, 400);
  }
  db.prepare("UPDATE applications SET notes='Original note',updated_at='1999-01-01 00:00:00' WHERE id=?").run(row.id);
  for (const body of [
    { notes: 'Must not be written', status: 'applied' },
    { deadline: '2026-12-31', unsupported: true }
  ]) {
    assert.equal((await call(`/${row.id}`, 'PATCH', body)).status, 400);
    assert.deepEqual(db.prepare('SELECT notes,deadline,updated_at AS updatedAt FROM applications WHERE id=?').get(row.id), {
      notes: 'Original note', deadline: '', updatedAt: '1999-01-01 00:00:00'
    });
  }
  db.prepare("UPDATE applications SET notes='Stable note',updated_at='2000-01-01 00:00:00' WHERE id=?").run(row.id);
  const noChange = await call(`/${row.id}`, 'PATCH', { notes: '  Stable   note  ' });
  assert.equal(noChange.status, 200);
  assert.equal(db.prepare('SELECT updated_at AS updatedAt FROM applications WHERE id=?').get(row.id).updatedAt, '2000-01-01 00:00:00');

  assert.equal((await call(`/${row.id}/tasks`, 'POST')).status, 400);
  assert.equal((await call(`/${row.id}/tasks`, 'POST', {})).status, 400);
  const task = await call(`/${row.id}/tasks`, 'POST', { title: 'Initial task', dueAt: '2026-10-10' });
  assert.equal(task.status, 200);
  assert.equal((await call(`/${row.id}/tasks/${task.body.data.id}`, 'PATCH')).status, 400);
  assert.equal((await call(`/${row.id}/tasks/${task.body.data.id}`, 'PATCH', {})).status, 400);
  assert.equal((await call(`/${row.id}/tasks/${task.body.data.id}`, 'PATCH', { title: 'Foreign edit' }, otherId)).status, 404);
  const edited = await call(`/${row.id}/tasks/${task.body.data.id}`, 'PATCH', { title: 'Edited task', dueAt: '2026-10-11', completed: true });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.data.completed, true);
  await call(`/${row.id}`, 'PATCH', { interviewTime: '2026-10-12T09:30' });
  assert.equal((await call(`/${row.id}/workspace`)).body.data.application.interviewTime, '2026-10-12T09:30');
  await call(`/${row.id}`, 'PATCH', { interviewTime: '' });
  const workspace = (await call(`/${row.id}/workspace`)).body.data;
  assert.equal(workspace.application.interviewTime, '');
  assert.equal(workspace.tasks[0].title, 'Edited task');
  assert.equal(workspace.tasks[0].completed, true);
});

test('application matching enforces ownership, job existence and the profile completion boundary', async () => {
  const missing = await create('preparing', ownerId, { jobId: 'cp2-no-such-job' });
  assert.equal((await call(`/${missing.id}/match`, 'POST', {}, otherId)).status, 404);
  assert.equal((await call(`/${missing.id}/match`, 'POST', {})).status, 422);

  const matchableId = Number(db.prepare(`INSERT INTO applications
    (user_id,job_id,source_job_id,source_type,job_snapshot,status,status_text,v4_status,progress_status,company,job_title)
    VALUES (?,'cp2-local-job-id','1','job','{}','pending','准备申请','preparing','online_apply','Google','Software Engineer')`)
    .run(ownerId).lastInsertRowid);
  db.prepare(`INSERT INTO application_history(application_id,user_id,from_status,to_status,note,actor_type)
    VALUES (?,?,'','preparing','canonical match fixture','user')`).run(matchableId, ownerId);
  db.prepare(`INSERT INTO user_profiles(user_id,completion,profile_version,target_roles,target_cities,skills)
    VALUES (?,39,1,'["Software Engineer"]','["Mountain View"]','["JavaScript"]')
    ON CONFLICT(user_id) DO UPDATE SET completion=39`).run(ownerId);
  const incomplete = await call(`/${matchableId}/match`, 'POST', {});
  assert.equal(incomplete.status, 422);
  assert.equal(incomplete.body.data.completion, 39);
  db.prepare('UPDATE user_profiles SET completion=40 WHERE user_id=?').run(ownerId);
  const matched = await call(`/${matchableId}/match`, 'POST', {});
  assert.equal(matched.status, 200);
  assert.equal(matched.body.data.jobId, '1');

  const missingProfileApplicationId = Number(db.prepare(`INSERT INTO applications
    (user_id,job_id,source_job_id,source_type,job_snapshot,status,status_text,v4_status,progress_status,company,job_title)
    VALUES (?,'cp2-profile-local','1','job','{}','pending','准备申请','preparing','online_apply','Google','Software Engineer')`)
    .run(missingProfileUserId).lastInsertRowid);
  assert.equal((await call(`/${missingProfileApplicationId}/match`, 'POST', {}, missingProfileUserId)).status, 404);
});

test('interview space with an empty company never imports unrelated experiences', async () => {
  db.prepare(`INSERT INTO experiences
    (user_id,company,position,title,content,moderation_status)
    VALUES (?,?,?,?,?,'approved')`).run(otherId, 'Unrelated company', 'Role', 'Public approved story', 'Public evidence');
  const row = await create('applied', ownerId, {
    jobId: 'cp2-empty-company',
    jobSnapshot: { title: 'Company-less role', description: 'Interview fixture' }
  });
  const response = await call(`/${row.id}/status`, 'PATCH', {
    status: 'interview_1', expectedState: snapshot(row)
  });
  assert.equal(response.status, 200);
  const stored = db.prepare('SELECT company,company_experiences AS experiences FROM interview_spaces_v4 WHERE id=?')
    .get(response.body.data.interviewSpaceId);
  assert.equal(stored.company, '');
  assert.deepEqual(JSON.parse(stored.experiences), []);
});

test('interview experience lookup treats LIKE metacharacters literally and only reuses approved public content', async () => {
  const insert = db.prepare(`INSERT INTO experiences
    (user_id,company,position,title,content,moderation_status)
    VALUES (?,?,?,?,?,?)`);
  insert.run(otherId, '100%_Labs', 'Role', 'Approved from another user', 'Approved public evidence', 'approved');
  insert.run(ownerId, '100%_Labs', 'Role', 'Pending private story', 'Pending evidence', 'pending');
  insert.run(ownerId, '100%_Labs', 'Role', 'Rejected private story', 'Rejected evidence', 'rejected');
  insert.run(otherId, '100X_Labs', 'Role', 'Percent wildcard distractor', 'Wrong evidence', 'approved');
  insert.run(otherId, '100%XLabs', 'Role', 'Underscore wildcard distractor', 'Wrong evidence', 'approved');
  const row = await create('applied', ownerId, {
    jobId: 'cp2-literal-company', sourceType: 'manual',
    jobSnapshot: { company: '100%_Labs', title: 'Literal matching role' }
  });
  const response = await call(`/${row.id}/status`, 'PATCH', {
    status: 'interview_1', expectedState: snapshot(row)
  });
  assert.equal(response.status, 200);
  const histories = JSON.parse(db.prepare('SELECT company_experiences AS experiences FROM interview_spaces_v4 WHERE id=?')
    .get(response.body.data.interviewSpaceId).experiences);
  assert.deepEqual(histories.map(item => item.title), ['Approved from another user']);
});

test('legacy single-status writes roll back status and revision together on unknown workflow errors', async () => {
  const row = await create();
  const beforeHistory = historyCount(row.id);
  db.exec(`CREATE TEMP TRIGGER cp2_reject_single BEFORE INSERT ON application_history
    WHEN NEW.application_id=${row.id} AND NEW.actor_type='user'
    BEGIN SELECT RAISE(ABORT,'cp2 unknown workflow failure'); END`);
  try {
    const response = await call(`/${row.id}/status`, 'PATCH', { status: 'applied' });
    assert.equal(response.status, 500);
    assert.match(response.body.message, /cp2 unknown workflow failure/);
    assert.equal((await current(row.id)).status, 'preparing');
    assert.equal(historyCount(row.id), beforeHistory);
  } finally {
    db.exec('DROP TRIGGER cp2_reject_single');
  }
});
