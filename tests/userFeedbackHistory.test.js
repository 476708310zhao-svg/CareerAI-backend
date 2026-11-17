const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const runtime = require('./helpers/isolatedTestRuntime.cjs');

runtime.install();
runtime.registerCleanup(test);

test('my feedback history is owner-only, paged, and excludes private handling details', async () => {
  runtime.prepare();
  const db = require('../db/database');
  const server = runtime.trackServer(require('../server').startServer(0));
  const base = `http://127.0.0.1:${server.address().port}`;
  const owner = 910001;
  const other = 910002;
  const ownerToken = jwt.sign({ userId: owner }, process.env.JWT_SECRET);
  const otherToken = jwt.sign({ userId: other }, process.env.JWT_SECRET);
  const adminToken = jwt.sign({ id: 1, role: 'admin' }, process.env.JWT_SECRET);
  const read = async (token, query = '') => {
    const response = await fetch(`${base}/api/feedback/mine${query}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return { status: response.status, body: await response.json() };
  };

  assert.equal((await read(null)).status, 401);
  assert.equal((await read(adminToken)).status, 401);
  const insert = db.prepare(`INSERT INTO feedbacks
    (user_id,type,content,contact,status,admin_note,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?)`);
  for (let i = 0; i < 24; i += 1) {
    insert.run(owner, '其他', `我的反馈 ${i}`, `private-contact-${i}`, 'open',
      `private-note-${i}`, '2026-10-01 10:00:00', '');
  }
  const correction = '岗位问题：链接失效；岗位ID：rok_test1；来源：remoteok；说明：官网已关闭';
  const correctionId = Number(insert.run(owner, '岗位信息纠错', correction,
    'private-contact-correction', 'resolved', 'private-note-correction',
    '2026-10-01 10:00:00', '2026-10-02 11:00:00').lastInsertRowid);
  const malformedId = Number(insert.run(owner, '岗位信息纠错',
    '岗位问题：链接失效；岗位ID：<script>；来源：evil', 'private-contact-malformed',
    'legacy_state', 'private-note-malformed', '2026-10-03 10:00:00', '').lastInsertRowid);
  const otherId = Number(insert.run(other, '其他', '另一账号的反馈', 'other-private-contact',
    'processing', 'other-private-note', '2026-10-01 10:00:00', '').lastInsertRowid);

  assert.equal((await read(ownerToken, '?limit=0')).status, 400);
  assert.equal((await read(ownerToken, '?cursor=abc')).status, 400);
  assert.equal((await read(ownerToken, '?limit[]=1')).status, 400);
  const first = await read(ownerToken, `?limit=10&userId=${other}`);
  assert.equal(first.status, 200);
  assert.equal(first.body.code, 0);
  assert.equal(first.body.data.items.length, 10);
  assert.equal(first.body.data.items[0].id, malformedId);
  assert.equal(first.body.data.items[0].status, 'unknown');
  assert.equal(first.body.data.items[0].jobFeedback, null);
  assert.deepEqual(first.body.data.items[1], {
    id: correctionId,
    type: '岗位信息纠错',
    content: correction,
    status: 'resolved',
    createdAt: '2026-10-01T10:00:00Z',
    updatedAt: '2026-10-02T11:00:00Z',
    jobFeedback: { reason: '链接失效', jobId: 'rok_test1', source: 'remoteok' }
  });
  const firstSerialized = JSON.stringify(first.body);
  assert.equal(firstSerialized.includes('private-contact'), false);
  assert.equal(firstSerialized.includes('private-note'), false);
  assert.equal(firstSerialized.includes('user_id'), false);
  assert.equal(firstSerialized.includes('review_version'), false);
  assert.equal(firstSerialized.includes('audit'), false);

  const lateId = Number(insert.run(owner, '其他', '翻页后新增的反馈', '',
    'open', '', '2026-10-30 10:00:00', '').lastInsertRowid);
  assert.ok(lateId > malformedId);
  const second = await read(ownerToken, `?limit=10&cursor=${first.body.data.nextCursor}`);
  const third = await read(ownerToken, `?limit=10&cursor=${second.body.data.nextCursor}`);
  const allIds = [...first.body.data.items, ...second.body.data.items, ...third.body.data.items].map(item => item.id);
  assert.equal(new Set(allIds).size, 26);
  assert.equal(allIds.includes(otherId), false);
  assert.equal(allIds.includes(lateId), false);
  assert.equal(third.body.data.nextCursor, null);
  const otherResult = await read(otherToken);
  assert.deepEqual(otherResult.body.data.items.map(item => item.id), [otherId]);
  assert.equal(otherResult.body.data.nextCursor, null);
  assert.equal((await read(ownerToken, '?limit=999')).body.data.items.length, 27);
  for (let i = 0; i < 30; i += 1) {
    insert.run(owner, '其他', `更多反馈 ${i}`, '', 'open', '', '2026-10-30 10:00:00', '');
  }
  const capped = await read(ownerToken, '?limit=999');
  assert.equal(capped.body.data.items.length, 50);
  assert.ok(capped.body.data.nextCursor > 0);
});
