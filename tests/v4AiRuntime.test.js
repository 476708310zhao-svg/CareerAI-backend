const test = require('node:test');
const assert = require('node:assert/strict');

const { createRuntime, redactSensitive } = require('../services/v4AiRuntime');

function config(overrides = {}) {
  return {
    provider: 'ark',
    apiKey: 'test-key',
    apiUrl: 'https://example.test/chat/completions',
    model: 'test-model',
    ...overrides
  };
}

test('v4 AI runtime uses deterministic fallback when live AI is disabled', async () => {
  let calls = 0;
  const runtime = createRuntime({
    env: { V4_AI_LIVE_ENABLED: 'false' },
    getAiConfig: () => config(),
    createChatCompletion: async () => { calls += 1; }
  });
  const result = await runtime.generate({ fallback: () => ({ message: 'fallback' }) });
  assert.equal(calls, 0);
  assert.equal(result.source, 'fallback');
  assert.equal(result.fallbackReason, 'feature_disabled');
  assert.deepEqual(result.value, { message: 'fallback' });
});

test('v4 AI runtime parses a live JSON response', async () => {
  const runtime = createRuntime({
    env: { V4_AI_LIVE_ENABLED: 'true' },
    getAiConfig: () => config(),
    createChatCompletion: async () => ({
      data: { choices: [{ message: { content: 'JSON result: {"message":"ok","score":88}' } }] }
    })
  });
  const result = await runtime.generate({
    fallback: () => ({ message: 'fallback' }),
    validate: value => value && value.score >= 0
  });
  assert.equal(result.source, 'live');
  assert.equal(result.model, 'test-model');
  assert.equal(result.value.score, 88);
});

test('v4 AI runtime retries a timeout and then returns a safe fallback', async () => {
  let calls = 0;
  const runtime = createRuntime({
    env: { V4_AI_LIVE_ENABLED: 'true' },
    getAiConfig: () => config(),
    sleep: async () => {},
    createChatCompletion: async () => {
      calls += 1;
      const error = new Error('request timeout');
      error.code = 'ECONNABORTED';
      throw error;
    }
  });
  const result = await runtime.generate({
    fallback: () => ({ message: 'safe fallback' }),
    retries: 1,
    retryDelayMs: 0
  });
  assert.equal(calls, 2);
  assert.equal(result.source, 'fallback');
  assert.equal(result.attempts, 2);
  assert.equal(result.error.code, 'AI_TIMEOUT');
  assert.equal(result.value.message, 'safe fallback');
});

test('v4 AI runtime rejects invalid model JSON without exposing sensitive data', async () => {
  const runtime = createRuntime({
    env: { V4_AI_LIVE_ENABLED: 'true' },
    getAiConfig: () => config(),
    createChatCompletion: async () => ({
      data: { choices: [{ message: { content: 'not-json' } }] }
    })
  });
  const result = await runtime.generate({ fallback: () => [], retries: 0 });
  assert.equal(result.source, 'fallback');
  assert.equal(result.error.code, 'AI_SCHEMA_INVALID');
  assert.equal(redactSensitive('联系 13800138000 或 Test@example.com'), '联系 [手机号已脱敏] 或 [邮箱已脱敏]');
});
