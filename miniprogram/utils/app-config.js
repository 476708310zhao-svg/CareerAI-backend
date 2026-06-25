// utils/app-config.js
// The mini program keeps no API secrets. All business requests use the HTTPS production API.

const PROD_API_BASE_URL = 'https://api.zhiyincareer.com';

module.exports = {
  API_BASE_URL: PROD_API_BASE_URL,
  ASSET_BASE_URL: PROD_API_BASE_URL,
  CONTENT_API_BASE_URL: PROD_API_BASE_URL,

  // Public LeetCode endpoint.
  LEETCODE_API_URL: 'https://leetcode.cn/graphql',

  // Empty template IDs skip subscription requests without blocking core flows.
  WX_TPL_APPLICATION: 'OOwg7dLeyp0t8DhGIEGtxF8cXyWQNal-y-pM8oi4cdI',
  WX_TPL_INTERVIEW: '',
  WX_TPL_SYSTEM: '7565JoeBy5bcfgXjF8Bx0F_9bS5FL3ZqoyMi8KtHnjl',

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

  // Used only until the public feature endpoint responds for the first time.
  DEFAULT_FEATURE_FLAGS: {
    recruitment: false,
    membership: true
  }
};
