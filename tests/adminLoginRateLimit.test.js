const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { adminLoginKey, normalizeLoginIdentity } = require('../middleware/rateLimit');

const ROOT = path.join(__dirname, '..');

test('admin login limiter isolates attempts by client IP and normalized username', () => {
  assert.equal(normalizeLoginIdentity(' Admin '), 'admin');
  assert.equal(adminLoginKey({ ip: '203.0.113.8', body: { username: ' Admin ' } }), '203.0.113.8:admin');
  assert.notEqual(
    adminLoginKey({ ip: '203.0.113.8', body: { username: 'admin' } }),
    adminLoginKey({ ip: '203.0.113.9', body: { username: 'admin' } })
  );
});

test('admin login limiter counts failures only and server trusts the loopback proxy', () => {
  const limiterSource = fs.readFileSync(path.join(ROOT, 'middleware/rateLimit.js'), 'utf8');
  const serverSource = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');

  assert.match(limiterSource, /skipSuccessfulRequests:\s*true/);
  assert.match(limiterSource, /keyGenerator:\s*adminLoginKey/);
  assert.match(serverSource, /app\.set\(['"]trust proxy['"],\s*['"]loopback['"]\)/);
});
