'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const isolatedRuntime = require('./helpers/isolatedTestRuntime.cjs');

isolatedRuntime.install();
const db = isolatedRuntime.prepare();
isolatedRuntime.registerCleanup(test);

const conversations = require('../services/aiConversations');
const aiRuntime = require('../services/v4AiRuntime');
const conversationRoutes = require('../routes/ai-conversations');

const OWNER_ID = 980001;
const OTHER_ID = 980002;
const LIMIT_ID = 980003;
let ownerApplicationId;
let otherApplicationId;
let server;
let baseUrl;

const tokenFor = userId => jwt.sign({ userId, openid: `ai-test-${userId}` }, process.env.JWT_SECRET);

async function request(path, { method = 'GET', userId, body } = {}) {
  const response = await fetch(`${baseUrl}/api/ai/conversations${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(userId ? { Authorization: `Bearer ${tokenFor(userId)}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  return { response, payload };
}

test.before(async () => {
  for (const [id, openid] of [
    [OWNER_ID, 'ai-conversation-owner'],
    [OTHER_ID, 'ai-conversation-other'],
    [LIMIT_ID, 'ai-conversation-limit'],
  ]) {
    db.prepare('INSERT OR IGNORE INTO users(id,openid,nickname) VALUES (?,?,?)').run(id, openid, 'AI test');
  }
  ownerApplicationId = Number(db.prepare(`
    INSERT INTO applications(user_id,job_id,job_snapshot,status,status_text)
    VALUES (?,?,?,?,?)
  `).run(
    OWNER_ID,
    'ai-owner-job',
    JSON.stringify({ company: '示例科技', title: '产品经理', description: '负责增长与实验设计' }),
    'interested',
    '感兴趣'
  ).lastInsertRowid);
  otherApplicationId = Number(db.prepare(`
    INSERT INTO applications(user_id,job_id,job_snapshot,status,status_text)
    VALUES (?,?,?,?,?)
  `).run(
    OTHER_ID,
    'ai-other-job',
    JSON.stringify({ company: '其他公司', title: '保密岗位' }),
    'interested',
    '感兴趣'
  ).lastInsertRowid);

  const app = express();
  app.use(express.json());
  app.use('/api/ai/conversations', conversationRoutes);
  server = isolatedRuntime.trackServer(await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  }));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test('AI conversation schema and ownership boundaries fail closed', () => {
  assert.equal(conversations.assertSchema(), true);
  assert.throws(
    () => conversations.create(OWNER_ID, { applicationId: otherApplicationId }),
    error => error.status === 404
  );
  assert.throws(
    () => conversations.list(OWNER_ID, undefined, otherApplicationId),
    error => error.status === 404
  );
  assert.throws(
    () => conversations.create(OWNER_ID, { scope: 'general', applicationId: ownerApplicationId }),
    error => error.status === 400
  );
  assert.throws(
    () => conversations.list(OWNER_ID, undefined, undefined, 'application'),
    error => error.status === 400
  );
  assert.throws(
    () => conversations.list(OWNER_ID, undefined, ownerApplicationId, 'general'),
    error => error.status === 400
  );
  const own = conversations.create(OWNER_ID, { applicationId: ownerApplicationId });
  assert.throws(
    () => conversations.begin(OWNER_ID, own.id, {
      requestId: 'invalidsource_01', content: '测试来源', source: 'mobile',
    }, () => true),
    error => error.status === 400
  );
  assert.throws(() => conversations.detail(OTHER_ID, own.id), error => error.status === 404);
  assert.throws(() => conversations.detail(OWNER_ID, '1 OR 1=1'), error => error.status === 400);
  assert.throws(() => conversations.list(OWNER_ID, '0'), error => error.status === 400);
});

test('conversation create, resume, pagination and cap are deterministic', () => {
  const first = conversations.create(OWNER_ID, { resume: true });
  const resumed = conversations.create(OWNER_ID, { resume: true });
  assert.equal(resumed.id, first.id);
  assert.equal(resumed.resumed, true);
  const applicationConversation = conversations.create(OWNER_ID, { scope: 'application', applicationId: ownerApplicationId });
  const unfilteredIds = conversations.list(OWNER_ID).list.map(item => item.id);
  assert.ok(unfilteredIds.includes(first.id));
  assert.ok(unfilteredIds.includes(applicationConversation.id));
  assert.ok(conversations.list(OWNER_ID, undefined, undefined, 'general').list.every(item => item.applicationId === null));
  const applicationList = conversations.list(OWNER_ID, undefined, ownerApplicationId, 'application').list;
  assert.ok(applicationList.some(item => item.id === applicationConversation.id));
  assert.ok(applicationList.every(item => item.applicationId === ownerApplicationId));
  const legacyApplicationList = conversations.list(OWNER_ID, undefined, ownerApplicationId).list;
  assert.deepEqual(legacyApplicationList.map(item => item.id), applicationList.map(item => item.id));

  for (let index = 0; index < 52; index += 1) {
    db.prepare('INSERT INTO ai_conversations(user_id,title) VALUES (?,?)')
      .run(OWNER_ID, `分页会话 ${index}`);
  }
  const page = conversations.list(OWNER_ID);
  assert.equal(page.list.length, 50);
  assert.ok(page.nextBefore);
  const next = conversations.list(OWNER_ID, page.nextBefore);
  assert.ok(next.list.length >= 2);
  assert.ok(next.list.every(item => item.id < page.nextBefore));

  const insert = db.prepare('INSERT INTO ai_conversations(user_id,title) VALUES (?,?)');
  db.transaction(() => {
    for (let index = 0; index < conversations.MAX_CONVERSATIONS_PER_USER; index += 1) {
      insert.run(LIMIT_ID, `上限会话 ${index}`);
    }
  })();
  assert.throws(
    () => conversations.create(LIMIT_ID),
    error => error.status === 429 && error.code === 'AI_CONVERSATION_LIMIT'
  );
});

test('turn lifecycle is idempotent and protects pending, cancelled and late results', () => {
  const conversation = conversations.create(OWNER_ID);
  let quotaCalls = 0;
  const consume = () => { quotaCalls += 1; return true; };
  const first = conversations.begin(OWNER_ID, conversation.id, {
    requestId: 'lifecycle_001',
    content: '请帮我梳理面试准备',
    source: 'miniprogram',
  }, consume);
  assert.equal(quotaCalls, 1);
  assert.throws(
    () => conversations.begin(OWNER_ID, conversation.id, {
      requestId: 'lifecycle_002', content: '另一个问题', source: 'web',
    }, consume),
    error => error.status === 409
  );
  assert.equal(quotaCalls, 1);

  db.prepare("UPDATE ai_conversations SET updated_at='2000-01-01 00:00:00' WHERE id=?").run(conversation.id);
  const cancelled = conversations.cancel(OWNER_ID, conversation.id, first.turnId);
  assert.equal(cancelled.status, 'cancelled');
  const cancelledAgain = conversations.cancel(OWNER_ID, conversation.id, first.turnId);
  assert.equal(cancelledAgain.transitioned, false);

  db.prepare("UPDATE ai_conversations SET updated_at='2001-01-01 00:00:00' WHERE id=?").run(conversation.id);
  const late = conversations.finish(first.turnId, 'completed', '这是迟到的答案');
  assert.equal(late.status, 'cancelled');
  assert.equal(late.transitioned, false);
  assert.equal(
    db.prepare('SELECT updated_at FROM ai_conversations WHERE id=?').pluck().get(conversation.id),
    '2001-01-01 00:00:00'
  );

  const replay = conversations.begin(OWNER_ID, conversation.id, {
    requestId: 'lifecycle_001', content: '请帮我梳理面试准备', source: 'miniprogram',
  }, consume);
  assert.equal(replay.replay.status, 'cancelled');
  assert.equal(replay.replay.retryWithNewRequestId, true);
  assert.equal(quotaCalls, 1);
});

test('raw request fingerprints distinguish PII that redacts to the same text', () => {
  const conversation = conversations.create(OWNER_ID);
  let quotaCalls = 0;
  const first = conversations.begin(OWNER_ID, conversation.id, {
    requestId: 'fingerprint_001', content: '联系 alpha@example.com', source: 'web',
  }, () => { quotaCalls += 1; return true; });
  conversations.finish(first.turnId, 'failed', '', 'AI_UNAVAILABLE');
  assert.throws(
    () => conversations.begin(OWNER_ID, conversation.id, {
      requestId: 'fingerprint_001', content: '联系 beta@example.com', source: 'web',
    }, () => { quotaCalls += 1; return true; }),
    error => error.status === 409
  );
  assert.equal(quotaCalls, 1);
  const stored = db.prepare('SELECT question,request_fingerprint FROM ai_conversation_turns WHERE id=?').get(first.turnId);
  assert.equal(stored.question, '联系 [邮箱已脱敏]');
  assert.match(stored.request_fingerprint, /^[a-f0-9]{64}$/);
});

test('context snapshots include only bounded, confirmed application evidence', () => {
  db.prepare(`
    INSERT INTO application_materials(
      user_id,client_id,question_type,content,application_id,status
    ) VALUES (?,?,?,?,?,?)
  `).run(OWNER_ID, 'ai-saved-material', 'why_company', '已确认材料 owner@example.com', ownerApplicationId, 'saved');
  db.prepare(`
    INSERT INTO application_materials(
      user_id,client_id,question_type,content,application_id,status
    ) VALUES (?,?,?,?,?,?)
  `).run(OWNER_ID, 'ai-pending-material', 'why_role', '未确认草稿绝不能进入上下文', ownerApplicationId, 'pending');
  db.prepare(`
    INSERT INTO application_materials(
      user_id,client_id,question_type,content,application_id,status
    ) VALUES (?,?,?,?,?,?)
  `).run(OTHER_ID, 'ai-other-material', 'why_company', '其他用户私有材料', otherApplicationId, 'saved');

  const conversation = conversations.create(OWNER_ID, { applicationId: ownerApplicationId });
  const started = conversations.begin(OWNER_ID, conversation.id, {
    requestId: 'context_0001', content: '结合申请材料给我建议', source: 'web',
  }, () => true);
  const snapshot = db.prepare('SELECT context_snapshot FROM ai_conversation_turns WHERE id=?')
    .pluck().get(started.turnId);
  assert.ok(snapshot.length <= conversations.MAX_CONTEXT_CHARS);
  assert.match(snapshot, /已确认材料/);
  assert.match(snapshot, /\[邮箱已脱敏\]/);
  assert.doesNotMatch(snapshot, /未确认草稿/);
  assert.doesNotMatch(snapshot, /其他用户私有材料/);
  assert.doesNotMatch(snapshot, /contacts|phone|email/);
  assert.doesNotThrow(() => JSON.parse(snapshot));
  conversations.finish(started.turnId, 'completed', '请先确认岗位要求，再按证据组织案例。');
});

test('prompt assembly stays within the total character budget and prefers recent history', () => {
  const history = Array.from({ length: 20 }, (_, index) => ({
    question: `历史问题-${index}-${'问'.repeat(1800)}`,
    answer: `历史回答-${index}-${'答'.repeat(3500)}`,
  }));
  const messages = conversations.buildMessages(
    JSON.stringify({ summary: { label: '预算测试' }, evidence: { jd: '岗'.repeat(10000) } }),
    history,
    '当前问题'.repeat(500)
  );
  assert.ok(messages.reduce((total, message) => total + message.content.length, 0) <= conversations.MAX_PROMPT_CHARS);
  assert.match(messages.at(-1).content, /^当前问题/);
  assert.ok(messages.some(message => message.content.startsWith('历史问题-19-')));
  assert.ok(!messages.some(message => message.content.startsWith('历史问题-0-')));
});

test('HTTP API authenticates, disables caching, replays safely and does not leak 5xx details', async () => {
  const anonymous = await request('/');
  assert.equal(anonymous.response.status, 401);
  assert.equal(anonymous.response.headers.get('cache-control'), 'no-store');

  const created = await request('/', { method: 'POST', userId: OWNER_ID, body: {} });
  assert.equal(created.response.status, 201);
  assert.equal(created.response.headers.get('cache-control'), 'no-store');
  const conversationId = created.payload.data.id;
  const scoped = await request('/?scope=general', { userId: OWNER_ID });
  assert.equal(scoped.response.status, 200);
  assert.ok(scoped.payload.data.list.every(item => item.applicationId === null));
  const conflict = await request(`/?scope=general&applicationId=${ownerApplicationId}`, { userId: OWNER_ID });
  assert.equal(conflict.response.status, 400);

  const originalGenerate = aiRuntime.generate;
  aiRuntime.generate = async () => ({
    source: 'live', degraded: false, error: null, value: '先准备两个可量化案例，再进行模拟追问。',
  });
  try {
    const body = { requestId: 'httpturn_001', content: '如何准备面试？', source: 'web' };
    const completed = await request(`/${conversationId}/turns`, { method: 'POST', userId: OWNER_ID, body });
    assert.equal(completed.response.status, 201);
    assert.equal(completed.payload.data.status, 'completed');
    const replay = await request(`/${conversationId}/turns`, { method: 'POST', userId: OWNER_ID, body });
    assert.equal(replay.response.status, 200);
    assert.equal(replay.payload.replay, true);
    assert.equal(replay.payload.data.id, completed.payload.data.id);
  } finally {
    aiRuntime.generate = originalGenerate;
  }

  const usage = db.prepare("SELECT count FROM ai_usage WHERE user_id=? AND feature='assistant'")
    .pluck().get(OWNER_ID);
  assert.equal(usage, 1);

  const originalList = conversations.list;
  const originalConsoleError = console.error;
  conversations.list = () => { throw new Error('secret database path C:\\private\\ai.sqlite'); };
  console.error = () => {};
  try {
    const failed = await request('/', { userId: OWNER_ID });
    assert.equal(failed.response.status, 500);
    assert.equal(failed.payload.message, 'AI 会话暂时不可用');
    assert.doesNotMatch(JSON.stringify(failed.payload), /private|sqlite|secret/i);
  } finally {
    conversations.list = originalList;
    console.error = originalConsoleError;
  }
});

test('expired pending turns fail once and detail paginates newest history', () => {
  const conversation = conversations.create(OTHER_ID);
  const oldTurnId = Number(db.prepare(`
    INSERT INTO ai_conversation_turns(
      conversation_id,request_id,request_fingerprint,question,status,context_snapshot,created_at
    ) VALUES (?,?,?,?,?,?,datetime('now','-3 minutes'))
  `).run(conversation.id, 'expired_0001', 'fingerprint', '旧问题', 'pending', '{}').lastInsertRowid);
  for (let index = 0; index < 22; index += 1) {
    db.prepare(`
      INSERT INTO ai_conversation_turns(
        conversation_id,request_id,request_fingerprint,question,answer,status,context_snapshot,finished_at
      ) VALUES (?,?,?,?,?,'completed','{}',datetime('now'))
    `).run(conversation.id, `history_${String(index).padStart(4, '0')}`, `fp-${index}`, `问题 ${index}`, `回答 ${index}`);
  }
  const detail = conversations.detail(OTHER_ID, conversation.id);
  assert.equal(detail.turns.length, 20);
  assert.ok(detail.nextBefore);
  assert.equal(db.prepare('SELECT status FROM ai_conversation_turns WHERE id=?').pluck().get(oldTurnId), 'failed');
  const next = conversations.detail(OTHER_ID, conversation.id, detail.nextBefore);
  assert.ok(next.turns.length >= 2);
  assert.ok(next.turns.every(turn => turn.id < detail.nextBefore));
});
