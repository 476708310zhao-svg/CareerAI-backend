const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const db = require('../db/database');

const PORT = String(4100 + Math.floor(Math.random() * 1000));
const BASE_URL = `http://127.0.0.1:${PORT}`;
const testAccount = {
  nickname: 'Smoke Test User',
  email: `smoke_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.com`,
  phone: `188${Math.floor(10000000 + Math.random() * 90000000)}`,
  password: 'smoke_password_123'
};

let server;
let serverOutput = '';
let authToken;
let adminToken;
let createdOrderNo;
const uploadedFiles = [];

function startServer() {
  server = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT,
      JWT_SECRET: 'test_secret_please_do_not_use_in_production_1234567890',
      ADMIN_USERNAME: 'admin',
      ADMIN_PASSWORD: 'admin_password',
      ALLOWED_ORIGIN: `http://127.0.0.1:${PORT}`,
      WEBHOOK_SECRET: 'test_webhook_secret',
      WXPAY_MCH_ID: '',
      WXPAY_API_KEY: '',
      WXPAY_APP_ID: '',
      WXPAY_NOTIFY_URL: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  server.stdout.on('data', chunk => { serverOutput += chunk.toString(); });
  server.stderr.on('data', chunk => { serverOutput += chunk.toString(); });
}

async function waitForServer() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) return;
    } catch (e) {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('server did not become ready\n' + serverOutput);
}

async function readJson(res) {
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function authHeaders() {
  return { Authorization: `Bearer ${authToken}` };
}

function adminHeaders() {
  return { Authorization: `Bearer ${adminToken}` };
}

function pngBlob() {
  const bytes = Uint8Array.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    0x00, 0x00, 0x00, 0x0D
  ]);
  return new Blob([bytes], { type: 'image/png' });
}

function trackUploadedUrl(url) {
  if (!url || !url.startsWith('/uploads/')) return;
  uploadedFiles.push(path.join(process.cwd(), url.replace(/^\//, '')));
}

test.before(async () => {
  startServer();
  await waitForServer();
});

test.after(() => {
  if (server) server.kill();
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(testAccount.email);
  if (user) {
    db.prepare('DELETE FROM orders WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  }
  uploadedFiles.forEach(file => {
    try { fs.unlinkSync(file); } catch (e) {}
  });
});

test('health endpoint is available', async () => {
  const res = await fetch(`${BASE_URL}/api/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
});

test('public jobs endpoint returns a list payload', async () => {
  const res = await fetch(`${BASE_URL}/api/jobs?page=1&pageSize=1`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.code, 0);
  assert.ok(Array.isArray(body.data.list));
});

test('public banners endpoint returns a list payload', async () => {
  const res = await fetch(`${BASE_URL}/api/banners`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.code, 0);
  assert.ok(Array.isArray(body.data));
});

test('public companies endpoint returns a data payload', async () => {
  const res = await fetch(`${BASE_URL}/api/companies?page=1&pageSize=1`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.code, 0);
  assert.ok(body.data);
});

test('protected endpoint rejects anonymous requests', async () => {
  const res = await fetch(`${BASE_URL}/api/applications`);
  assert.equal(res.status, 401);
});

test('payment orders endpoint rejects anonymous requests', async () => {
  const res = await fetch(`${BASE_URL}/api/payment/orders`);
  assert.equal(res.status, 401);
});

test('web-register creates a user with a hashed password', async () => {
  const res = await fetch(`${BASE_URL}/api/users/web-register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testAccount)
  });
  assert.equal(res.status, 200);
  const body = await readJson(res);
  assert.equal(body.code, 0);
  assert.ok(body.data.token);

  const user = db.prepare('SELECT password FROM users WHERE email = ?').get(testAccount.email);
  assert.ok(user);
  assert.match(user.password, /^scrypt\$[a-f0-9]+\$[a-f0-9]+$/);
  assert.notEqual(user.password, testAccount.password);
});

test('web-login returns a token for valid credentials', async () => {
  const res = await fetch(`${BASE_URL}/api/users/web-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: testAccount.email, password: testAccount.password })
  });
  assert.equal(res.status, 200);
  const body = await readJson(res);
  assert.equal(body.code, 0);
  assert.ok(body.data.token);
  authToken = body.data.token;
});

test('legacy users resumes endpoint is marked deprecated', async () => {
  assert.ok(authToken);
  const res = await fetch(`${BASE_URL}/api/users/resumes`, {
    headers: authHeaders()
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('deprecation'), 'true');
  assert.match(res.headers.get('link') || '', /\/api\/resumes/);
});

test('ai workflow requires vip', async () => {
  assert.ok(authToken);
  const res = await fetch(`${BASE_URL}/api/ai/workflow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ message: '帮我优化简历' })
  });
  assert.equal(res.status, 403);
  const body = await readJson(res);
  assert.equal(body.code, -1);
  assert.equal(body.data.vipRequired, true);
});

test('ai chat validation uses standard error shape', async () => {
  const res = await fetch(`${BASE_URL}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [] })
  });
  assert.equal(res.status, 400);
  const body = await readJson(res);
  assert.equal(body.code, -1);
  assert.match(body.message, /messages/);
});

test('ai project builder validation uses standard error shape', async () => {
  const res = await fetch(`${BASE_URL}/api/ai/project-builder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.equal(res.status, 400);
  const body = await readJson(res);
  assert.equal(body.code, -1);
  assert.match(body.message, /项目方向/);
});

test('admin banner upload rejects content that does not match image MIME', async () => {
  const loginRes = await fetch(`${BASE_URL}/admin/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin_password' })
  });
  assert.equal(loginRes.status, 200);
  const loginBody = await readJson(loginRes);
  adminToken = loginBody.data.token;

  const form = new FormData();
  form.append('file', new Blob(['not a real png'], { type: 'image/png' }), 'fake.png');

  const res = await fetch(`${BASE_URL}/admin/api/upload/banner`, {
    method: 'POST',
    headers: adminHeaders(),
    body: form
  });
  assert.equal(res.status, 400);
  const body = await readJson(res);
  assert.equal(body.code, -1);
  assert.match(body.message, /文件内容与格式不符/);
});

test('admin banner upload rejects non-image MIME before magic byte check', async () => {
  assert.ok(adminToken);
  const form = new FormData();
  form.append('file', new Blob(['plain text'], { type: 'text/plain' }), 'fake.txt');

  const res = await fetch(`${BASE_URL}/admin/api/upload/banner`, {
    method: 'POST',
    headers: adminHeaders(),
    body: form
  });
  assert.equal(res.status, 400);
  const body = await readJson(res);
  assert.equal(body.code, -1);
  assert.match(body.message, /只允许/);
});

test('admin jobs list reads jobs json through admin API', async () => {
  assert.ok(adminToken);
  const res = await fetch(`${BASE_URL}/admin/api/jobs?page=1&pageSize=1`, {
    headers: adminHeaders()
  });
  assert.equal(res.status, 200);
  const body = await readJson(res);
  assert.equal(body.code, 0);
  assert.ok(Array.isArray(body.data.list));
  assert.equal(body.data.list.length, 1);
  assert.ok(body.data.total >= 1);
});

test('payment mock create-order, confirm and verify flow works', async () => {
  assert.ok(authToken);

  const createRes = await fetch(`${BASE_URL}/api/payment/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ planId: 0, clientIp: '127.0.0.1' })
  });
  assert.equal(createRes.status, 200);
  const created = await readJson(createRes);
  assert.equal(created.mock, true);
  assert.ok(created.orderNo);
  createdOrderNo = created.orderNo;

  const confirmRes = await fetch(`${BASE_URL}/api/payment/mock-confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ orderNo: createdOrderNo })
  });
  assert.equal(confirmRes.status, 200);
  const confirmed = await readJson(confirmRes);
  assert.equal(confirmed.success, true);

  const verifyRes = await fetch(`${BASE_URL}/api/payment/verify/${encodeURIComponent(createdOrderNo)}`, {
    headers: authHeaders()
  });
  assert.equal(verifyRes.status, 200);
  const verified = await readJson(verifyRes);
  assert.equal(verified.status, 'paid');

  const ordersRes = await fetch(`${BASE_URL}/api/payment/orders`, {
    headers: authHeaders()
  });
  assert.equal(ordersRes.status, 200);
  const orders = await readJson(ordersRes);
  assert.ok(Array.isArray(orders.orders));
  assert.ok(orders.orders.some(order => order.order_no === createdOrderNo));
});

test('avatar upload rejects content that does not match image MIME', async () => {
  assert.ok(authToken);
  const form = new FormData();
  form.append('file', new Blob(['not a real png'], { type: 'image/png' }), 'fake.png');

  const res = await fetch(`${BASE_URL}/api/upload/avatar`, {
    method: 'POST',
    headers: authHeaders(),
    body: form
  });
  assert.equal(res.status, 400);
  const body = await readJson(res);
  assert.equal(body.code, -1);
  assert.match(body.message, /文件内容与格式不符/);
});

test('avatar upload accepts a valid png image', async () => {
  assert.ok(authToken);
  const form = new FormData();
  form.append('file', pngBlob(), 'avatar.png');

  const res = await fetch(`${BASE_URL}/api/upload/avatar`, {
    method: 'POST',
    headers: authHeaders(),
    body: form
  });
  assert.equal(res.status, 200);
  const body = await readJson(res);
  assert.equal(body.code, 0);
  assert.match(body.data.url, /^\/uploads\/\d{4}-\d{2}-\d{2}\//);
  trackUploadedUrl(body.data.url);
});

test('webhook rejects missing GitHub signature', async () => {
  const res = await fetch(`${BASE_URL}/webhook/deploy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'refs/heads/main' })
  });
  assert.equal(res.status, 401);
});
