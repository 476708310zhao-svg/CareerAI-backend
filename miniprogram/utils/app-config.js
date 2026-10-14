// utils/app-config.js
// The mini program keeps no API secrets. Development builds use the local
// backend so DevTools never depends on an incomplete production deployment.
// Trial and release builds always stay on the HTTPS production API.

const PROD_API_BASE_URL = 'https://api.zhiyincareer.com';
const DEV_API_BASE_URL = 'http://127.0.0.1:4400';
const FEISHU_CONTENT_API_BASE_URL = 'https://feishu-bitable-action-api.onrender.com';

function getMiniProgramEnvVersion() {
  try {
    if (typeof wx !== 'undefined' && typeof wx.getAccountInfoSync === 'function') {
      const account = wx.getAccountInfoSync();
      return account && account.miniProgram && account.miniProgram.envVersion || '';
    }
  } catch (error) {}
  return '';
}

const MINI_PROGRAM_ENV_VERSION = getMiniProgramEnvVersion();
// Development builds use a local API for real feature testing, but analytics
// stays off by default. This prevents every page show from producing a noisy
// connection error when the local backend is not running and keeps developer
// navigation out of production metrics.
const ANALYTICS_ENABLED = MINI_PROGRAM_ENV_VERSION !== 'develop';
const baseUrls = {
  API_BASE_URL: PROD_API_BASE_URL,
  ASSET_BASE_URL: PROD_API_BASE_URL,
  CONTENT_API_BASE_URL: PROD_API_BASE_URL
};
if (MINI_PROGRAM_ENV_VERSION === 'develop') {
  baseUrls.API_BASE_URL = DEV_API_BASE_URL;
}

module.exports = {
  ...baseUrls,
  FEISHU_CONTENT_API_BASE_URL,
  MINI_PROGRAM_ENV_VERSION,
  ANALYTICS_ENABLED,

  // Public LeetCode endpoint.
  LEETCODE_API_URL: 'https://leetcode.cn/graphql',

  // Public WeChat subscription template IDs. Runtime code first tries the
  // server-side /api/notify/templates config, then falls back to these values.
  WX_TPL_APPLICATION: 'OOwg7dLeyp0t8DhGlEGtxF8cXyWQNaI-y-pM8oi4cdI',
  WX_TPL_INTERVIEW: 'mVZpMFlo_SVeAHG9pTS9iVKJ4Ue5S_CbRnpIwcii-Do',
  WX_TPL_SYSTEM: '7565JoeBy5bcfgXjF8Bx0E_9bS5FL3ZqoyMi8KtHnjI',
  WX_TPL_PAYMENT_SUCCESS: 'B2yF8p95728ity74KHZ8hD8l9eIFy_WHWEw0WeRY6zw',
  WX_TPL_PAYMENT_REMINDER: '1TuS2_yn-RY4CEQgaLNgpvorskvNtnsqRxE8A1lPmVY',
  WX_TPL_INTERVIEW_REPORT: '4m7xh9u3V6cq_sa6ne-oKk2VU_HCF1cOEAoBISTSB-g',

  // WeChat web-view can only open configured business domains. Keep external
  // recruiting links out of web-view in V1.1 to avoid review/runtime failures.
  ALLOW_EXTERNAL_WEBVIEW: false,
  WEBVIEW_ALLOWED_DOMAINS: [
    'zhiyincareer.com',
    'www.zhiyincareer.com',
    'api.zhiyincareer.com'
  ],

  // Keep production surfaces free of demo/mock-looking content. Developers can
  // temporarily enable this in a local build when they need offline fixtures.
  ENABLE_DEMO_FALLBACK: false,

  // V4 backend is deployed behind the production API and has passed readiness
  // and authenticated-route smoke checks.
  V4_AGENT_API_ENABLED: true,

  // Used only while the public feature state is unknown. Keep the fixed Jobs
  // tab usable on cold start; membership must not appear available until a
  // cached or server-provided flag explicitly enables it.
  DEFAULT_FEATURE_FLAGS: {
    recruitment: true,
    home_recommendations: false,
    membership: false
  }
};
