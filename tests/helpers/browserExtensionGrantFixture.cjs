'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(process.env.BROWSER_EXTENSION_GRANT_FIXTURE_ROOT || '');
assert.ok(process.env.BROWSER_EXTENSION_GRANT_FIXTURE_ROOT);
assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
assert.match(path.basename(root), /^jobapp-extension-grant-[A-Za-z0-9_-]+$/);
Object.assign(process.env, { DB_PATH: path.join(root, 'db', 'fixture.db'), DATA_DIR: path.join(root, 'data'),
  UPLOAD_DIR: path.join(root, 'uploads'), JWT_SECRET: 'browser-extension-fixture-secret', ANALYTICS_DATA_CLASS: 'test' });

const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../../db/database');
const { applyPendingMigrations } = require('../../db/migrate');
require('../../routes/payment');
require('../../routes/aggregate');
require('../../routes/oa');
require('../../db/v4Schema').ensureV4Schema();
applyPendingMigrations(db);
const ownerId = Number(db.prepare("INSERT INTO users(openid,email,phone) VALUES ('ext_owner','owner@example.test','5550101')").run().lastInsertRowid);
const otherId = Number(db.prepare("INSERT INTO users(openid,email,phone) VALUES ('ext_other','other@example.test','5550102')").run().lastInsertRowid);
const applicationId = Number(db.prepare(`INSERT INTO applications(user_id,job_id,job_snapshot,status,status_text,v4_status,progress_status,company,job_title)
  VALUES (?,'ext-job','{}','pending','准备中','preparing','online_apply','Example','Engineer')`).run(ownerId).lastInsertRowid);
const profile = require('../../services/v4Profile');
profile.saveProfile(ownerId, { school: 'Example University', major: 'Computer Science', degree: 'Bachelor', graduationYear: '2025', city: 'Shanghai', skills: ['JavaScript'] });
const app = express(); app.use(express.json()); app.use('/api/v4', require('../../routes/v4/browser-extension'));
const tokenFor = userId => jwt.sign({ userId }, process.env.JWT_SECRET);
let server; let base;
before(async () => { server = await new Promise(resolve => { const value = app.listen(0, '127.0.0.1', () => resolve(value)); }); base = `http://127.0.0.1:${server.address().port}`; });
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); if (db.open) db.close(); });
async function call(route, method='POST', body, token=tokenFor(ownerId), extra={}) {
  const headers = { 'content-type': 'application/json', ...extra };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(base + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
const grantPath = `/api/v4/applications/${applicationId}/extension-grants`;

test('grant issuance stores only a hash, binds owner/application/host/selected fields, then consumes once', async () => {
  assert.equal((await call(grantPath, 'POST', { boardHost: 'jobs.lever.co', fields: ['email'] }, tokenFor(otherId))).status, 404);
  const response = await call(grantPath, 'POST', { boardHost: 'jobs.lever.co', fields: ['email', 'school', 'skills'] });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const issued = response.body.data;
  assert.equal(issued.expiresInSeconds, 300);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM browser_extension_grants WHERE token_hash=?').get(issued.token).count, 0);
  assert.equal(db.prepare('SELECT token_hash FROM browser_extension_grants WHERE id=?').get(issued.grantId).token_hash === issued.token, false);
  const mismatch = await call('/api/v4/browser-extension/consume', 'POST', { boardHost: 'boards.greenhouse.io' }, null,
    { authorization: `Bearer ${issued.token}` });
  assert.equal(mismatch.status, 401);
  const consumed = await call('/api/v4/browser-extension/consume', 'POST', { boardHost: 'jobs.lever.co' }, null,
    { authorization: `Bearer ${issued.token}` });
  assert.equal(consumed.status, 200, JSON.stringify(consumed.body));
  assert.deepEqual(consumed.body.data.fields, [
    { key: 'email', value: 'owner@example.test' }, { key: 'school', value: 'Example University' }, { key: 'skills', value: 'JavaScript' }
  ]);
  assert.equal(JSON.stringify(consumed.body).includes('phone'), false);
  assert.equal(JSON.stringify(consumed.body).includes('major'), false);
  assert.equal((await call('/api/v4/browser-extension/consume', 'POST', { boardHost: 'jobs.lever.co' }, null,
    { authorization: `Bearer ${issued.token}` })).status, 401);
});

test('unsupported fields, hosts, revoked and expired grants fail closed', async () => {
  assert.equal((await call(grantPath, 'POST', { boardHost: 'evil.example', fields: ['email'] })).status, 400);
  assert.equal((await call(grantPath, 'POST', { boardHost: 'jobs.lever.co', fields: ['password'] })).status, 400);
  const revoked = (await call(grantPath, 'POST', { boardHost: 'jobs.lever.co', fields: ['email'] })).body.data;
  assert.equal((await call(`${grantPath}/${revoked.grantId}`, 'DELETE')).status, 200);
  assert.equal((await call('/api/v4/browser-extension/consume', 'POST', { boardHost: 'jobs.lever.co' }, null,
    { authorization: `Bearer ${revoked.token}` })).status, 401);
  const expired = (await call(grantPath, 'POST', { boardHost: 'jobs.lever.co', fields: ['email'] })).body.data;
  db.prepare("UPDATE browser_extension_grants SET expires_at=datetime('now','-1 minute') WHERE id=?").run(expired.grantId);
  assert.equal((await call('/api/v4/browser-extension/consume', 'POST', { boardHost: 'jobs.lever.co' }, null,
    { authorization: `Bearer ${expired.token}` })).status, 401);
});
