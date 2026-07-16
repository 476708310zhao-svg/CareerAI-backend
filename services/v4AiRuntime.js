const { createChatCompletion, getAiConfig } = require('../utils/aiClient');

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const RETRYABLE_CODES = new Set(['AI_TIMEOUT', 'AI_NETWORK_ERROR', 'AI_UPSTREAM_ERROR', 'AI_SCHEMA_INVALID']);

function boolValue(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return TRUE_VALUES.has(String(value).trim().toLowerCase());
}

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function redactSensitive(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/\b1[3-9]\d{9}\b/g, '[手机号已脱敏]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig, '[邮箱已脱敏]')
    .replace(/\b\d{15,18}[0-9X]\b/ig, '[证件号已脱敏]')
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, '[银行卡已脱敏]');
}

function extractMessage(response) {
  const content = response && response.data && response.data.choices
    && response.data.choices[0] && response.data.choices[0].message
    && response.data.choices[0].message.content;
  if (typeof content !== 'string' || !content.trim()) {
    const error = new Error('AI 返回内容为空');
    error.code = 'AI_SCHEMA_INVALID';
    throw error;
  }
  return content.trim();
}

function parseJsonContent(raw) {
  let text = String(raw || '').trim();
  text = text.replace(/^\x60\x60\x60(?:json)?\s*/i, '').replace(/\s*\x60\x60\x60$/i, '').trim();
  try {
    return JSON.parse(text);
  } catch (_error) {
    const objectStart = text.indexOf('{');
    const arrayStart = text.indexOf('[');
    const starts = [objectStart, arrayStart].filter(index => index >= 0);
    const start = starts.length ? Math.min(...starts) : -1;
    const objectEnd = text.lastIndexOf('}');
    const arrayEnd = text.lastIndexOf(']');
    const end = Math.max(objectEnd, arrayEnd);
    if (start >= 0 && end > start) {
      try { return JSON.parse(text.slice(start, end + 1)); } catch (_nestedError) { /* handled below */ }
    }
  }
  const error = new Error('AI 返回不是有效 JSON');
  error.code = 'AI_SCHEMA_INVALID';
  throw error;
}

function normalizeError(error) {
  const rawCode = String(error && error.code || '').toUpperCase();
  const message = String(error && error.message || '');
  const status = Number(error && error.response && error.response.status || 0);
  let code = 'AI_UPSTREAM_ERROR';
  if (rawCode === 'AI_CONFIG_MISSING') code = rawCode;
  else if (rawCode === 'AI_SCHEMA_INVALID') code = rawCode;
  else if (rawCode === 'ECONNABORTED' || rawCode === 'ETIMEDOUT' || /timeout|超时/i.test(message)) code = 'AI_TIMEOUT';
  else if (['ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'].includes(rawCode)) code = 'AI_NETWORK_ERROR';
  else if (status && status < 500 && status !== 429) code = 'AI_REQUEST_REJECTED';
  return {
    code,
    message: code === 'AI_TIMEOUT' ? 'AI 请求超时' : 'AI 服务暂时不可用',
    retryable: RETRYABLE_CODES.has(code) || status === 429 || status >= 500
  };
}

function safeMetadata(result) {
  return {
    source: result.source,
    degraded: result.degraded,
    provider: result.provider,
    model: result.model,
    attempts: result.attempts,
    fallbackReason: result.fallbackReason || '',
    errorCode: result.error && result.error.code || ''
  };
}

function createRuntime(dependencies = {}) {
  const chatCompletion = dependencies.createChatCompletion || createChatCompletion;
  const configReader = dependencies.getAiConfig || getAiConfig;
  const environment = dependencies.env || process.env;
  const sleep = dependencies.sleep || (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));

  function getStatus() {
    const config = configReader();
    const requested = boolValue(environment.V4_AI_LIVE_ENABLED, false);
    const configured = !!config.apiKey;
    return {
      requested,
      configured,
      enabled: requested && configured,
      provider: config.provider,
      model: requested && configured ? config.model : 'fallback-rules'
    };
  }

  async function fallbackResult(options, status, reason, attempts, error) {
    const fallback = typeof options.fallback === 'function' ? options.fallback : () => options.fallback;
    const value = await Promise.resolve(fallback());
    return {
      value,
      source: 'fallback',
      degraded: true,
      provider: status.provider,
      model: 'fallback-rules',
      attempts,
      fallbackReason: reason,
      error: error || null
    };
  }

  async function generate(options = {}) {
    const status = getStatus();
    if (!status.requested) return fallbackResult(options, status, 'feature_disabled', 0, null);
    if (!status.configured) {
      return fallbackResult(options, status, 'provider_not_configured', 0, {
        code: 'AI_CONFIG_MISSING',
        message: 'AI 服务尚未配置',
        retryable: false
      });
    }

    const timeoutMs = clampNumber(options.timeoutMs || environment.V4_AI_TIMEOUT_MS, 20000, 1000, 120000);
    const retries = clampNumber(options.retries === undefined ? environment.V4_AI_MAX_RETRIES : options.retries, 1, 0, 3);
    const retryDelayMs = clampNumber(options.retryDelayMs === undefined ? environment.V4_AI_RETRY_DELAY_MS : options.retryDelayMs, 200, 0, 5000);
    let lastError = null;

    for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
      try {
        const response = await chatCompletion({
          messages: [
            { role: 'system', content: redactSensitive(options.systemPrompt || '你是职引 Career Platform 的求职助手。') },
            { role: 'user', content: redactSensitive(options.userPrompt || '') }
          ],
          temperature: options.temperature === undefined ? 0.3 : Number(options.temperature),
          max_tokens: clampNumber(options.maxTokens, 1600, 100, 8000),
          stream: false
        }, {
          timeout: timeoutMs,
          model: status.model
        });
        const raw = extractMessage(response);
        const value = options.format === 'text' ? raw : parseJsonContent(raw);
        if (typeof options.validate === 'function' && !options.validate(value)) {
          const validationError = new Error('AI 返回未通过业务校验');
          validationError.code = 'AI_SCHEMA_INVALID';
          throw validationError;
        }
        return {
          value,
          source: 'live',
          degraded: false,
          provider: status.provider,
          model: status.model,
          attempts: attempt,
          fallbackReason: '',
          error: null
        };
      } catch (error) {
        lastError = normalizeError(error);
        if (attempt <= retries && lastError.retryable) {
          if (retryDelayMs) await sleep(retryDelayMs * attempt);
          continue;
        }
        return fallbackResult(options, status, lastError.code.toLowerCase(), attempt, lastError);
      }
    }
    return fallbackResult(options, status, 'ai_upstream_error', retries + 1, lastError);
  }

  return { generate, getStatus };
}

const runtime = createRuntime();

module.exports = {
  ...runtime,
  createRuntime,
  redactSensitive,
  parseJsonContent,
  normalizeError,
  safeMetadata
};
