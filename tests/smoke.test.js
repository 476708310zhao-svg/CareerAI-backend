const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

const PORT = String(4100 + Math.floor(Math.random() * 1000));
const BASE_URL = `http://127.0.0.1:${PORT}`;

let server;
let serverOutput = '';

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
      WEBHOOK_SECRET: 'test_webhook_secret'
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

test.before(async () => {
  startServer();
  await waitForServer();
});

test.after(() => {
  if (server) server.kill();
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

test('protected endpoint rejects anonymous requests', async () => {
  const res = await fetch(`${BASE_URL}/api/applications`);
  assert.equal(res.status, 401);
});

test('webhook rejects missing GitHub signature', async () => {
  const res = await fetch(`${BASE_URL}/webhook/deploy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'refs/heads/main' })
  });
  assert.equal(res.status, 401);
});
