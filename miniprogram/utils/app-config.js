// utils/app-config.js
// The mini program keeps no API secrets. All business requests use the HTTPS production API.

const PROD_API_BASE_URL = 'https://api.zhiyincareer.com';
const FEISHU_CONTENT_API_BASE_URL = 'https://feishu-bitable-action-api.onrender.com';

module.exports = {
  API_BASE_URL: PROD_API_BASE_URL,
  ASSET_BASE_URL: PROD_API_BASE_URL,
  CONTENT_API_BASE_URL: PROD_API_BASE_URL,
  FEISHU_CONTENT_API_BASE_URL,

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

  // Production does not expose /api/v4/agents yet. Keep AI Career on the
  // authenticated legacy AI channel until the V4 backend is formally deployed.
  V4_AGENT_API_ENABLED: false,

  // Used only until the public feature endpoint responds for the first time.
  DEFAULT_FEATURE_FLAGS: {
    recruitment: false,
    membership: true
  }
};
