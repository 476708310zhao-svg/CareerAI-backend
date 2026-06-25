const axios = require('axios');

const DEFAULT_ARK_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
const DEFAULT_ARK_MODEL = 'doubao-seed-2-1-pro-260628';
const DEFAULT_DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat';

function env(name) {
  return String(process.env[name] || '').trim();
}

function firstEnv(names) {
  for (const name of names) {
    const value = env(name);
    if (value) return value;
  }
  return '';
}

function detectProvider() {
  const explicit = env('AI_PROVIDER').toLowerCase();
  if (['ark', 'volcengine', 'volces', 'doubao'].includes(explicit)) return 'ark';
  if (explicit === 'deepseek') return 'deepseek';

  if (firstEnv(['ARK_API_KEY', 'VOLCENGINE_API_KEY', 'DOUBAO_API_KEY'])) return 'ark';
  if (/ark|volces|doubao/i.test(env('AI_API_URL'))) return 'ark';
  return 'deepseek';
}

function getAiConfig() {
  const provider = detectProvider();
  const usingArk = provider === 'ark';

  const apiKey = usingArk
    ? firstEnv(['AI_API_KEY', 'ARK_API_KEY', 'VOLCENGINE_API_KEY', 'DOUBAO_API_KEY'])
    : firstEnv(['AI_API_KEY', 'DEEPSEEK_API_KEY']);

  const apiUrl = usingArk
    ? firstEnv(['AI_API_URL', 'ARK_API_URL', 'VOLCENGINE_API_URL', 'DOUBAO_API_URL']) || DEFAULT_ARK_API_URL
    : firstEnv(['AI_API_URL', 'DEEPSEEK_API_URL']) || DEFAULT_DEEPSEEK_API_URL;

  const model = usingArk
    ? firstEnv(['AI_MODEL', 'ARK_MODEL', 'VOLCENGINE_MODEL', 'DOUBAO_MODEL']) || DEFAULT_ARK_MODEL
    : firstEnv(['AI_MODEL', 'DEEPSEEK_MODEL']) || DEFAULT_DEEPSEEK_MODEL;

  return { provider, apiKey, apiUrl, model };
}

function ensureAiConfigured(config) {
  if (config.apiKey) return;
  const names = config.provider === 'ark'
    ? 'ARK_API_KEY or AI_API_KEY'
    : 'DEEPSEEK_API_KEY or AI_API_KEY';
  const err = new Error(`AI provider ${config.provider} is missing API key. Set ${names}.`);
  err.code = 'AI_CONFIG_MISSING';
  throw err;
}

function createChatCompletion(payload, requestConfig = {}) {
  const config = getAiConfig();
  ensureAiConfigured(config);

  const { headers = {}, model, ...axiosConfig } = requestConfig;
  return axios.post(
    config.apiUrl,
    { ...payload, model: model || config.model },
    {
      ...axiosConfig,
      headers: {
        ...headers,
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
    }
  );
}

function streamChatCompletion(payload, requestConfig = {}) {
  return createChatCompletion(payload, {
    ...requestConfig,
    responseType: 'stream',
  });
}

module.exports = {
  createChatCompletion,
  streamChatCompletion,
  getAiConfig,
};
