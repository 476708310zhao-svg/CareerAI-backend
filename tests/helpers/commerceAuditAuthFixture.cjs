'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(process.env.COMMERCE_AUDIT_FIXTURE_ROOT || '');
assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
assert.match(path.basename(root), /^jobapp-commerce-audit-[A-Za-z0-9_-]+$/);
Object.assign(process.env, { WEB_TEST_ISOLATED: '1', DB_PATH: path.join(root, 'db', 'test.db'),
  DATA_DIR: path.join(root, 'data'), UPLOAD_DIR: path.join(root, 'uploads'), JWT_SECRET: 'commerce-audit-fixture' });
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../../db/database');
require('../../routes/payment');
require('../../routes/aggregate');
require('../../routes/oa');
require('../../db/v4Schema').ensureV4Schema();
const { applyPendingMigrations } = require('../../db/migrate');
applyPendingMigrations(db);
const app = express(); app.use(express.json()); app.use('/admin/api/v4', require('../../routes/v4-admin'));
let server, base;
before(async () => { server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); }); base = `http://127.0.0.1:${server.address().port}`; });
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); if (db.open) db.close(); });
const adminId = Number(db.prepare("INSERT INTO admin_accounts(username,password_hash,permissions,is_active) VALUES ('auditor','fixture','[\"memberships\"]',1)").run().lastInsertRowid);
const restrictedId = Number(db.prepare("INSERT INTO admin_accounts(username,password_hash,permissions,is_active) VALUES ('auditor-dashboard','fixture','[\"dashboard\"]',1)").run().lastInsertRowid);
const userId = Number(db.prepare("INSERT INTO users(openid,nickname) VALUES ('commerce_audit_owner','Test')").run().lastInsertRowid);
db.prepare("INSERT INTO orders(order_no,user_id,plan_id,plan_name,amount,status,provider) VALUES ('MOCKA001',?,0,'Plan',100,'paid','mock')").run(userId);
db.prepare("INSERT INTO orders(order_no,user_id,plan_id,plan_name,amount,status,provider) VALUES ('MOCKA002',?,0,'Plan',150,'pending','mock')").run(userId);
db.prepare("INSERT INTO orders(order_no,user_id,plan_id,plan_name,amount,status,provider) VALUES ('WXA001',?,0,'Plan',200,'paid','wxpay')").run(userId);
db.prepare("INSERT INTO payment_refunds_v4(order_no,user_id,refund_no,amount,status) VALUES ('MOCKA001',?,'REF-A',100,'requested')").run(userId);
const token = permissions => jwt.sign({ role: 'admin', sub: permissions.includes('dashboard') ? 'auditor-dashboard' : 'auditor',
  id: permissions.includes('dashboard') ? restrictedId : adminId, permissions }, process.env.JWT_SECRET);
async function call(route, method = 'GET', bearer = token(['memberships'])) {
  const response = await fetch(`${base}/admin/api/v4${route}`, { method, headers: bearer ? { Authorization: `Bearer ${bearer}` } : {} });
  return { status: response.status, body: await response.json() };
}
test('anonymous and low-privilege accounts cannot read commerce or decide refunds', async () => {
  assert.equal((await call('/commerce/audit', 'GET', '')).status, 401);
  assert.equal((await call('/commerce/audit', 'GET', token(['dashboard']))).status, 403);
  assert.equal((await call('/commerce/overview', 'GET', token(['dashboard']))).status, 403);
  assert.equal((await call('/commerce/refunds/REF-A', 'PATCH', token(['dashboard']))).status, 403);
});
test('audit is paged, provider-classified and omits identifiers', async () => {
  const testData = await call('/commerce/audit?dataClass=test&limit=1');
  assert.equal(testData.status, 200, JSON.stringify(testData.body));
  assert.equal(testData.body.data.items.length, 1);
  assert.equal(testData.body.data.items[0].orderNo, 'MOCKA002');
  assert.equal(testData.body.data.items[0].userId, undefined);
  assert.equal(testData.body.data.items[0].transactionId, undefined);
  assert.ok(Number.isSafeInteger(testData.body.data.nextCursor));
  const second = await call(`/commerce/audit?dataClass=test&limit=1&beforeId=${testData.body.data.nextCursor}`);
  assert.equal(second.body.data.items[0].orderNo, 'MOCKA001');
  assert.equal(second.body.data.nextCursor, null);
  const candidate = await call('/commerce/audit?dataClass=productionCandidate');
  assert.equal(candidate.body.data.items[0].orderNo, 'WXA001');
  const refunds = await call('/commerce/audit?kind=refunds&dataClass=test');
  assert.equal(refunds.body.data.items[0].refundNo, 'REF-A');
  assert.equal((await call('/commerce/audit?limit=1000')).status, 400);
  assert.equal((await call('/commerce/audit?dataClass=all')).status, 400);
});
test('disabled or revoked live account cannot use an old valid JWT', async () => {
  const old = token(['memberships']);
  db.prepare("UPDATE admin_accounts SET permissions='[\"dashboard\"]' WHERE id=?").run(adminId);
  assert.equal((await call('/commerce/audit', 'GET', old)).status, 403);
  assert.equal((await call('/commerce/refunds/REF-A', 'PATCH', old)).status, 403);
  db.prepare("UPDATE admin_accounts SET permissions='[\"memberships\"]',is_active=0 WHERE id=?").run(adminId);
  assert.equal((await call('/commerce/overview', 'GET', old)).status, 403);
});
