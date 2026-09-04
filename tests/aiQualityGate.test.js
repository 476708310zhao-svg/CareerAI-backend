const test = require('node:test');
const assert = require('node:assert/strict');

const corpus = require('./fixtures/ai-quality-samples.json');
const {
  containsSensitiveInformation,
  validateFixtureCorpus,
  runQualityGate
} = require('./helpers/aiQualityGate');
const { redactSensitiveDeep, normalizeError } = require('../services/v4AiRuntime');
const { containsFabricatedExecutionClaim } = require('../utils/aiSafety');

test('AI quality corpus is synthetic, anonymous and covers every V4 capability', () => {
  const result = validateFixtureCorpus(corpus);
  assert.equal(result.passed, true, result.errors.join(', '));
  assert.equal(result.sampleCount, 11);
  assert.deepEqual(result.coverage, {
    agents: 4,
    applicationMaterials: 5,
    resumeOptimization: 1,
    interviewScoring: 1
  });
});

test('AI safety utilities redact nested PII and detect fabricated execution claims', () => {
  const safe = redactSensitiveDeep({
    query: '请联系 13800138000',
    nested: { email: 'quality@example.com', identity: '11010519491231002X', internationalPhone: '+1 415-555-1234' }
  });
  assert.equal(containsSensitiveInformation(safe), false);
  assert.match(safe.query, /\[手机号已脱敏\]/);
  assert.match(safe.nested.email, /\[邮箱已脱敏\]/);
  assert.match(safe.nested.identity, /\[证件号已脱敏\]/);
  assert.match(safe.nested.internationalPhone, /\[电话已脱敏\]/);
  assert.equal(containsFabricatedExecutionClaim('我已经替你投递了该岗位'), true);
  assert.equal(containsFabricatedExecutionClaim('可以先生成草稿，确认后再保存'), false);
});

test('AI error taxonomy distinguishes rate limits, upstream faults and rejected requests', () => {
  assert.equal(normalizeError({ response: { status: 429 } }).code, 'AI_RATE_LIMITED');
  assert.equal(normalizeError({ response: { status: 503 } }).code, 'AI_UPSTREAM_ERROR');
  assert.equal(normalizeError({ response: { status: 400 } }).code, 'AI_REQUEST_REJECTED');
  assert.equal(normalizeError({ code: 'ENOTFOUND' }).code, 'AI_NETWORK_ERROR');
});

test('AI quality gate passes all injected faults without external requests', async () => {
  const report = await runQualityGate(corpus);
  assert.equal(report.passed, true);
  assert.equal(report.summary.externalRequests, 0);
  assert.equal(report.summary.faultScenariosPassed, 7);
  assert.equal(report.successProbe.metadata.usage.totalTokens, 150);
  assert.equal(report.successProbe.metadata.estimatedCostUsd, 0.00018);
});
