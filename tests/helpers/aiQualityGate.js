const { createRuntime, redactSensitive } = require('../../services/v4AiRuntime');

const REQUIRED_AGENT_TYPES = Object.freeze([
  'job_advisor',
  'application_assistant',
  'interview_coach',
  'career_planner'
]);
const REQUIRED_MATERIAL_TYPES = Object.freeze([
  'cover_letter',
  'why_company',
  'why_role',
  'recruiter_message',
  'follow_up_email'
]);

function serialized(value) {
  try { return JSON.stringify(value); } catch (error) { return String(value || ''); }
}

function containsSensitiveInformation(value) {
  const text = serialized(value);
  return redactSensitive(text) !== text;
}

function validateFixtureCorpus(corpus) {
  const errors = [];
  const samples = corpus && Array.isArray(corpus.samples) ? corpus.samples : [];
  if (!corpus || Number(corpus.version) !== 1) errors.push('fixture_version_invalid');
  if (!samples.length) errors.push('fixture_samples_empty');
  const ids = new Set();
  samples.forEach((sample, index) => {
    if (!sample || !sample.id) errors.push(`sample_${index}_missing_id`);
    else if (ids.has(sample.id)) errors.push(`sample_${index}_duplicate_id`);
    else ids.add(sample.id);
    if (sample && sample.provenance !== 'synthetic_anonymized') errors.push(`${sample.id || index}_provenance_invalid`);
    if (containsSensitiveInformation(sample)) errors.push(`${sample && sample.id || index}_contains_sensitive_information`);
  });
  const agentTypes = new Set(samples.filter(item => item.capability === 'agent').map(item => item.subtype));
  const materialTypes = new Set(samples.filter(item => item.capability === 'application_material').map(item => item.subtype));
  REQUIRED_AGENT_TYPES.forEach(type => { if (!agentTypes.has(type)) errors.push(`missing_agent_${type}`); });
  REQUIRED_MATERIAL_TYPES.forEach(type => { if (!materialTypes.has(type)) errors.push(`missing_material_${type}`); });
  if (!samples.some(item => item.capability === 'resume_optimization')) errors.push('missing_resume_optimization');
  if (!samples.some(item => item.capability === 'interview_scoring')) errors.push('missing_interview_scoring');
  return {
    passed: errors.length === 0,
    errors,
    sampleCount: samples.length,
    coverage: {
      agents: agentTypes.size,
      applicationMaterials: materialTypes.size,
      resumeOptimization: samples.filter(item => item.capability === 'resume_optimization').length,
      interviewScoring: samples.filter(item => item.capability === 'interview_scoring').length
    }
  };
}

function providerConfig(overrides = {}) {
  return {
    provider: 'quality-gate',
    apiKey: 'injected-test-key',
    apiUrl: 'https://invalid.local/never-called',
    model: 'injected-quality-model',
    ...overrides
  };
}

async function runFaultMatrix() {
  const definitions = [
    { name: 'timeout', code: 'ECONNABORTED', expectedCode: 'AI_TIMEOUT', expectedReason: 'ai_timeout' },
    { name: 'rate_limit_429', status: 429, expectedCode: 'AI_RATE_LIMITED', expectedReason: 'ai_rate_limited' },
    { name: 'upstream_503', status: 503, expectedCode: 'AI_UPSTREAM_ERROR', expectedReason: 'ai_upstream_error' },
    { name: 'network_unreachable', code: 'ENOTFOUND', expectedCode: 'AI_NETWORK_ERROR', expectedReason: 'ai_network_error' }
  ];
  const scenarios = [];
  for (const definition of definitions) {
    let calls = 0;
    const runtime = createRuntime({
      env: { V4_AI_LIVE_ENABLED: 'true' },
      getAiConfig: () => providerConfig(),
      sleep: async () => {},
      createChatCompletion: async () => {
        calls += 1;
        const error = new Error(definition.name);
        if (definition.code) error.code = definition.code;
        if (definition.status) error.response = { status: definition.status };
        throw error;
      }
    });
    const result = await runtime.generate({ fallback: () => ({ message: '安全降级结果' }), retries: 1, retryDelayMs: 0 });
    scenarios.push({
      name: definition.name,
      passed: calls === 2 && result.source === 'fallback' && result.degraded === true
        && result.error && result.error.code === definition.expectedCode
        && result.fallbackReason === definition.expectedReason && result.attempts === 2,
      calls,
      source: result.source,
      attempts: result.attempts,
      errorCode: result.error && result.error.code || '',
      fallbackReason: result.fallbackReason
    });
  }

  let invalidCalls = 0;
  const invalidRuntime = createRuntime({
    env: { V4_AI_LIVE_ENABLED: 'true' },
    getAiConfig: () => providerConfig(),
    sleep: async () => {},
    createChatCompletion: async () => {
      invalidCalls += 1;
      return { data: { choices: [{ message: { content: 'not-json' } }] } };
    }
  });
  const invalid = await invalidRuntime.generate({ fallback: () => ({ message: '安全降级结果' }), retries: 1, retryDelayMs: 0 });
  scenarios.push({
    name: 'invalid_json',
    passed: invalidCalls === 2 && invalid.error && invalid.error.code === 'AI_SCHEMA_INVALID'
      && invalid.fallbackReason === 'ai_schema_invalid',
    calls: invalidCalls,
    source: invalid.source,
    attempts: invalid.attempts,
    errorCode: invalid.error && invalid.error.code || '',
    fallbackReason: invalid.fallbackReason
  });

  let missingConfigCalls = 0;
  const missingConfig = await createRuntime({
    env: { V4_AI_LIVE_ENABLED: 'true' },
    getAiConfig: () => providerConfig({ apiKey: '' }),
    createChatCompletion: async () => { missingConfigCalls += 1; }
  }).generate({ fallback: () => ({ message: '安全降级结果' }) });
  scenarios.push({
    name: 'provider_not_configured',
    passed: missingConfigCalls === 0 && missingConfig.error && missingConfig.error.code === 'AI_CONFIG_MISSING'
      && missingConfig.fallbackReason === 'provider_not_configured' && missingConfig.attempts === 0,
    calls: missingConfigCalls,
    source: missingConfig.source,
    attempts: missingConfig.attempts,
    errorCode: missingConfig.error && missingConfig.error.code || '',
    fallbackReason: missingConfig.fallbackReason
  });

  let disabledCalls = 0;
  const disabled = await createRuntime({
    env: { V4_AI_LIVE_ENABLED: 'false' },
    getAiConfig: () => providerConfig(),
    createChatCompletion: async () => { disabledCalls += 1; }
  }).generate({ fallback: () => ({ message: '安全降级结果' }) });
  scenarios.push({
    name: 'kill_switch',
    passed: disabledCalls === 0 && disabled.source === 'fallback'
      && disabled.fallbackReason === 'feature_disabled' && disabled.attempts === 0,
    calls: disabledCalls,
    source: disabled.source,
    attempts: disabled.attempts,
    errorCode: disabled.error && disabled.error.code || '',
    fallbackReason: disabled.fallbackReason
  });
  return scenarios;
}

async function runSuccessProbe() {
  let clock = 1000;
  const runtime = createRuntime({
    env: {
      V4_AI_LIVE_ENABLED: 'true',
      AI_INPUT_COST_PER_1M_USD: '1',
      AI_OUTPUT_COST_PER_1M_USD: '2'
    },
    now: () => { const value = clock; clock += 25; return value; },
    getAiConfig: () => providerConfig(),
    createChatCompletion: async () => ({
      data: {
        choices: [{ message: { content: '{"message":"联系 13800138000 或 qa@example.com"}' } }],
        usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 }
      }
    })
  });
  const result = await runtime.generate({ fallback: () => ({ message: '安全降级结果' }), retries: 0 });
  const metadata = {
    source: result.source,
    elapsedMs: result.elapsedMs,
    usage: result.usage,
    estimatedCostUsd: result.estimatedCostUsd
  };
  return {
    passed: result.source === 'live' && !containsSensitiveInformation(result.value)
      && result.value.message.includes('[手机号已脱敏]') && result.value.message.includes('[邮箱已脱敏]')
      && result.elapsedMs === 25 && result.usage.totalTokens === 150
      && result.estimatedCostUsd === 0.00018,
    metadata,
    output: result.value
  };
}

async function runQualityGate(corpus) {
  const fixtures = validateFixtureCorpus(corpus);
  const faultMatrix = await runFaultMatrix();
  const successProbe = await runSuccessProbe();
  const passed = fixtures.passed && faultMatrix.every(item => item.passed) && successProbe.passed;
  return {
    gateVersion: 1,
    passed,
    fixtures,
    faultMatrix,
    successProbe,
    summary: {
      sampleCount: fixtures.sampleCount,
      faultScenarios: faultMatrix.length,
      faultScenariosPassed: faultMatrix.filter(item => item.passed).length,
      externalRequests: 0
    }
  };
}

module.exports = {
  REQUIRED_AGENT_TYPES,
  REQUIRED_MATERIAL_TYPES,
  containsSensitiveInformation,
  validateFixtureCorpus,
  runFaultMatrix,
  runSuccessProbe,
  runQualityGate
};
