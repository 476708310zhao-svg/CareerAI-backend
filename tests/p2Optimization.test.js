'use strict';
const runtime = require('./helpers/isolatedTestRuntime.cjs');
runtime.install();
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');
const db = runtime.prepare();
const metrics = require('../utils/apiPerformance');
const { app } = require('../server');
runtime.registerCleanup(test);

let server, base, ownerId, otherId;
const token = id => jwt.sign({ userId: id }, process.env.JWT_SECRET);
async function call(route, userId = ownerId, options = {}) {
  const response = await fetch(`${base}${route}`, { ...options, headers: {
    Authorization: `Bearer ${token(userId)}`,
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {})
  } });
  return { status: response.status, body: await response.json() };
}

test.before(async () => {
  const stamp = Date.now().toString(36);
  ownerId = Number(db.prepare('INSERT INTO users(openid,nickname) VALUES (?,?)')
    .run(`p2-owner-${stamp}`, 'P2 Owner').lastInsertRowid);
  otherId = Number(db.prepare('INSERT INTO users(openid,nickname) VALUES (?,?)')
    .run(`p2-other-${stamp}`, 'P2 Other').lastInsertRowid);
  server = runtime.trackServer(app.listen(0, '127.0.0.1'));
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test('application board keeps legacy response and pages filtered rows in stable order', async () => {
  const insert = db.prepare(`INSERT INTO applications(user_id,job_id,job_snapshot,company,job_title,city,
    status,v4_status,deadline,updated_at) VALUES (?,?,'{}',?,?,'上海','pending',?,?,?)`);
  const ids = [
    insert.run(ownerId, 'p2-job-1', 'Acme', 'Engineer A', 'preparing', '2026-12-01', '2026-11-01 12:00:00').lastInsertRowid,
    insert.run(ownerId, 'p2-job-2', 'Acme', 'Engineer B', 'applied', '2026-12-01', '2026-11-01 12:00:00').lastInsertRowid,
    insert.run(ownerId, 'p2-job-3', 'Acme', 'Engineer C', 'preparing', '2026-12-05', '2026-11-01 12:00:00').lastInsertRowid,
    insert.run(ownerId, 'p2-job-4', 'Other', 'Designer', 'offer', '2026-12-06', '2026-11-01 12:00:00').lastInsertRowid
  ];
  const old = await call('/api/v4/applications/board?keyword=Acme');
  assert.equal(old.status, 200);
  assert.equal(old.body.data.total, 3);
  assert.equal(old.body.data.nextCursor, undefined);
  const first = await call('/api/v4/applications/board?keyword=Acme&pageSize=2');
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.data.total, 3);
  assert.deepEqual(first.body.data.statistics, { preparing: 2, applied: 1, interview: 0, offer: 0, closed: 0 });
  assert.equal(first.body.data.hasMore, true);
  const firstIds = Object.values(first.body.data.groups).flat().map(item => item.id);
  assert.deepEqual(firstIds.sort((a, b) => b - a), [ids[1], ids[0]]);
  const second = await call(`/api/v4/applications/board?keyword=Acme&pageSize=2&cursor=${encodeURIComponent(first.body.data.nextCursor)}`);
  assert.equal(second.status, 200);
  assert.deepEqual(Object.values(second.body.data.groups).flat().map(item => item.id), [ids[2]]);
  assert.equal(second.body.data.hasMore, false);
  const filtered = await call('/api/v4/applications/board?status=preparing&pageSize=2');
  assert.equal(filtered.body.data.total, 2);
  assert.equal((await call('/api/v4/applications/board?pageSize=0')).status, 400);
  assert.equal((await call('/api/v4/applications/board?pageSize=2&cursor=bad')).status, 400);
  assert.equal((await call('/api/v4/applications/board?pageSize=2', otherId)).body.data.total, 0);
});

test('resume version pages omit content and detail remains owner-scoped', async () => {
  const resumeId = Number(db.prepare("INSERT INTO resumes(user_id,name,data) VALUES (?,?,'{}')")
    .run(ownerId, 'P2 resume').lastInsertRowid);
  const insert = db.prepare(`INSERT INTO resume_versions_v4(resume_id,user_id,version_no,name,content)
    VALUES (?,?,?,?,?)`);
  const versionIds = [1, 2, 3].map(no => Number(insert.run(resumeId, ownerId, no,
    `Version ${no}`, JSON.stringify({ summary: `private-${no}` })).lastInsertRowid));
  const path = `/api/v4/resumes/${resumeId}/versions`;
  const old = await call(path);
  assert.equal(old.status, 200);
  assert.equal(old.body.data.length, 3);
  assert.equal(old.body.data[0].content.summary, 'private-3');
  const first = await call(`${path}?pageSize=2`);
  assert.equal(first.status, 200);
  assert.deepEqual(first.body.data.list.map(item => item.versionNo), [3, 2]);
  assert.equal(first.body.data.list[0].content, undefined);
  assert.equal(first.body.data.nextCursor, 2);
  const second = await call(`${path}?pageSize=2&cursor=2`);
  assert.deepEqual(second.body.data.list.map(item => item.versionNo), [1]);
  assert.equal(second.body.data.hasMore, false);
  assert.equal((await call(`${path}/${versionIds[0]}`)).body.data.content.summary, 'private-1');
  assert.equal((await call(`${path}/${versionIds[0]}`, otherId)).status, 404);
  assert.equal((await call(`${path}?pageSize=101`)).status, 400);
});

test('legacy resume API rejects malformed input as 400 and accepts normal objects', async () => {
  const route = '/api/resumes';
  const post = body => call(route, otherId, { method: 'POST', body: JSON.stringify(body) });
  assert.equal((await post({ name: 42 })).status, 400);
  assert.equal((await post({ data: [] })).status, 400);
  assert.equal((await post({ name: 'x'.repeat(81) })).status, 400);
  const valid = await post({ name: '正常简历', language: 'zh', data: { skills: [] } });
  assert.equal(valid.status, 200, JSON.stringify(valid.body));
  const id = valid.body.data.id;
  assert.equal((await call(`${route}/${id}`, otherId, { method: 'PUT', body: JSON.stringify({ name: {} }) })).status, 400);
  assert.equal((await call(`${route}/${id}`, otherId, { method: 'PUT', body: JSON.stringify({ name: '更新后' }) })).status, 200);
  assert.equal((await call(`${route}/${id}/optimization-history`, otherId,
    { method: 'POST', body: JSON.stringify({ after: { unsafe: true } }) })).status, 400);
});

test('performance sampling preserves all slow and 5xx records and prunes only expired rows', () => {
  const route = `p2-metric-${Date.now()}`;
  assert.equal(metrics.record(db, { route, method: 'GET', durationMs: 20, statusCode: 200 }, () => 0.9), false);
  assert.equal(metrics.record(db, { route, method: 'GET', durationMs: 20, statusCode: 200 }, () => 0.01), true);
  assert.equal(metrics.record(db, { route, method: 'GET', durationMs: 801, statusCode: 200 }, () => 0.9), true);
  assert.equal(metrics.record(db, { route, method: 'GET', durationMs: 20, statusCode: 500 }, () => 0.9), true);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM api_performance_v4 WHERE route=?').get(route).n, 3);
  db.prepare("UPDATE api_performance_v4 SET created_at=datetime('now','-31 days') WHERE route=? AND status_code=200")
    .run(route);
  assert.equal(metrics.prune(db, 1), 2);
  assert.deepEqual(db.prepare('SELECT status_code FROM api_performance_v4 WHERE route=?').all(route)
    .map(row => row.status_code), [500]);
});

test('runtime preflight reports pending schema migrations without applying them', async () => {
  const clonePath = path.join(runtime.paths().root, 'p2-preflight.sqlite');
  await db.backup(clonePath);
  const script = path.join(__dirname, '..', 'scripts', 'runtime-preflight.js');
  const run = () => spawnSync(process.execPath, [script], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 30000,
    env: { ...process.env, DB_PATH: clonePath, NODE_ENV: 'test' }
  });
  const complete = run();
  assert.equal(complete.status, 0, complete.stderr);
  assert.match(complete.stdout, /\[PASS\] schema_migrations/);
  const clone = new Database(clonePath);
  try {
    const { needsLegacyBootstrap } = require('../db/legacyBootstrap');
    assert.equal(needsLegacyBootstrap(clone), false);
    clone.exec('DROP INDEX IF EXISTS idx_users_openid');
    const boot = spawnSync(process.execPath, ['-e', `const db=require('./db/database');
      process.stdout.write(String(!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_users_openid'").get()));`], {
      cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 30000,
      env: { ...process.env, DB_PATH: clonePath, NODE_ENV: 'test' }
    });
    assert.equal(boot.status, 0, boot.stderr);
    assert.equal(boot.stdout, 'false', 'migrated startup must not recreate a dropped index');
    clone.prepare("DELETE FROM schema_migrations WHERE version='0033'").run();
    assert.equal(needsLegacyBootstrap(clone), true);
  }
  finally { clone.close(); }
  const pending = run();
  assert.match(pending.stdout, /\[WARN\] schema_migrations - pending: 0033/);
  const strict = spawnSync(process.execPath, [script, '--strict'], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 30000,
    env: { ...process.env, DB_PATH: clonePath, NODE_ENV: 'test' }
  });
  assert.equal(strict.status, 1);
  assert.match(strict.stdout, /\[FAIL\] schema_migrations - pending: 0033/);
  const check = new Database(clonePath, { readonly: true });
  try { assert.equal(check.prepare("SELECT COUNT(*) AS n FROM schema_migrations WHERE version='0033'").get().n, 0); }
  finally { check.close(); }
});
