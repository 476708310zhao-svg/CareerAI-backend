const test = require('node:test');
const assert = require('node:assert/strict');

const compat = require('../miniprogram/utils/agent-compat');
const { _isSuccessStatus } = require('../miniprogram/utils/api-client');
const config = require('../miniprogram/utils/app-config');

test('mini program write client accepts the full HTTP 2xx success range', () => {
  assert.equal(_isSuccessStatus(200), true);
  assert.equal(_isSuccessStatus(201), true);
  assert.equal(_isSuccessStatus(204), true);
  assert.equal(_isSuccessStatus(199), false);
  assert.equal(_isSuccessStatus(300), false);
});

test('agent compatibility mode only activates for missing V4 endpoints', () => {
  const missing = new Error('Not found');
  missing.statusCode = 404;
  const unauthorized = new Error('unauthorized');
  unauthorized.statusCode = 401;
  assert.equal(compat.isV4EndpointMissing(missing), true);
  assert.equal(compat.isV4EndpointMissing(unauthorized), false);
});

test('production keeps V4 Agent probing disabled until backend deployment', () => {
  assert.equal(config.V4_AGENT_API_ENABLED, false);
});

test('agent compatibility prompt redacts sensitive data and forbids writes', () => {
  const messages = compat.buildLegacyMessages({
    agentType: 'career_planner',
    input: { query: '联系 13800138000 或 Test@example.com，帮我制定计划', requestWrite: true }
  }, { agent: { name: 'AI 职业规划师' } });
  const text = messages.map(item => item.content).join('\n');
  assert.match(text, /\[手机号已脱敏\]/);
  assert.match(text, /\[邮箱已脱敏\]/);
  assert.match(text, /不得声称已经保存、写入/);
  assert.doesNotMatch(text, /13800138000|Test@example\.com/);
});

test('agent compatibility task is local, completed and never requests a write', () => {
  const task = compat.createLocalTask({
    agentType: 'job_advisor',
    input: { query: '分析岗位', requestWrite: true }
  }, '建议先核对资格要求。', { agent: { name: 'AI 岗位顾问' } });
  assert.equal(task.status, 'completed');
  assert.equal(task.compatibilityMode, true);
  assert.equal(task.input.requestWrite, false);
  assert.equal(task.output.message, '建议先核对资格要求。');
});
