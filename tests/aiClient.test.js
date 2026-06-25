const test = require('node:test');
const assert = require('node:assert/strict');

const { createChatCompletion, getAiConfig } = require('../utils/aiClient');

const AI_ENV_KEYS = [
  'AI_PROVIDER',
  'AI_API_KEY',
  'AI_API_URL',
  'AI_MODEL',
  'ARK_API_KEY',
  'ARK_API_URL',
  'ARK_MODEL',
  'VOLCENGINE_API_KEY',
  'VOLCENGINE_API_URL',
  'VOLCENGINE_MODEL',
  'DOUBAO_API_KEY',
  'DOUBAO_API_URL',
  'DOUBAO_MODEL',
  'DEEPSEEK_API_KEY',
  'DEEPSEEK_API_URL',
  'DEEPSEEK_MODEL',
];

function withAiEnv(values, fn) {
  const previous = {};
  for (const key of AI_ENV_KEYS) {
    previous[key] = process.env[key];
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      process.env[key] = values[key];
    } else {
      delete process.env[key];
    }
  }
  try {
    fn();
  } finally {
    for (const key of AI_ENV_KEYS) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test('ai client selects Volcengine Ark when an Ark key is configured', () => {
  withAiEnv({ ARK_API_KEY: 'ark-test-key' }, () => {
    const config = getAiConfig();
    assert.equal(config.provider, 'ark');
    assert.equal(config.apiUrl, 'https://ark.cn-beijing.volces.com/api/v3/chat/completions');
    assert.equal(config.model, 'doubao-seed-2-1-pro-260628');
    assert.equal(config.apiKey, 'ark-test-key');
  });
});

test('ai client allows generic AI_* overrides for Ark', () => {
  withAiEnv({
    AI_PROVIDER: 'ark',
    AI_API_KEY: 'generic-key',
    AI_API_URL: 'https://example.test/chat/completions',
    AI_MODEL: 'custom-doubao',
    ARK_API_KEY: 'ark-test-key',
  }, () => {
    const config = getAiConfig();
    assert.equal(config.provider, 'ark');
    assert.equal(config.apiUrl, 'https://example.test/chat/completions');
    assert.equal(config.model, 'custom-doubao');
    assert.equal(config.apiKey, 'generic-key');
  });
});

test('ai client keeps DeepSeek compatibility when requested', () => {
  withAiEnv({
    AI_PROVIDER: 'deepseek',
    DEEPSEEK_API_KEY: 'deepseek-test-key',
    DEEPSEEK_MODEL: 'deepseek-reasoner',
  }, () => {
    const config = getAiConfig();
    assert.equal(config.provider, 'deepseek');
    assert.equal(config.apiUrl, 'https://api.deepseek.com/chat/completions');
    assert.equal(config.model, 'deepseek-reasoner');
    assert.equal(config.apiKey, 'deepseek-test-key');
  });
});

test('ai client fails fast when the selected provider is missing a key', () => {
  withAiEnv({ AI_PROVIDER: 'ark' }, () => {
    assert.throws(
      () => createChatCompletion({ messages: [] }),
      /ARK_API_KEY or AI_API_KEY/
    );
  });
});
