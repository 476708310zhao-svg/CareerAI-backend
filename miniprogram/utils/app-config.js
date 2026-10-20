// utils/app-config.js
// The mini program keeps no API secrets. All previews use the HTTPS API by
// default. DevTools can explicitly opt into a running local backend.

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

function isDevToolsSimulator() {
  try {
    if (typeof wx === 'undefined') return false;
    const info = typeof wx.getDeviceInfo === 'function'
      ? wx.getDeviceInfo()
      : (typeof wx.getSystemInfoSync === 'function' ? wx.getSystemInfoSync() : null);
    return !!(info && info.platform === 'devtools');
  } catch (error) {}
  return false;
}

const MINI_PROGRAM_ENV_VERSION = getMiniProgramEnvVersion();
// Formal builds and the local simulator use the real catalogue by default.
// A developer may explicitly opt into read-only examples in local simulator storage.
let ASSESSMENT_PREVIEW_ENABLED = false;
try {
  ASSESSMENT_PREVIEW_ENABLED = MINI_PROGRAM_ENV_VERSION === 'develop' && isDevToolsSimulator()
    && wx.getStorageSync('assessmentPreviewMode') === 'readonly-examples';
} catch (error) {}
// Developer analytics stays off even when a physical device uses the production
// API, so test navigation does not enter production metrics.
const ANALYTICS_ENABLED = MINI_PROGRAM_ENV_VERSION !== 'develop';
const baseUrls = {
  API_BASE_URL: PROD_API_BASE_URL,
  ASSET_BASE_URL: PROD_API_BASE_URL,
  CONTENT_API_BASE_URL: PROD_API_BASE_URL
};
let useLocalApi = false;
try {
  useLocalApi = MINI_PROGRAM_ENV_VERSION === 'develop' && isDevToolsSimulator()
    && wx.getStorageSync('devApiMode') === 'local';
} catch (error) {}
if (useLocalApi) {
  baseUrls.API_BASE_URL = DEV_API_BASE_URL;
}

module.exports = {
  ...baseUrls,
  FEISHU_CONTENT_API_BASE_URL,
  MINI_PROGRAM_ENV_VERSION,
  ASSESSMENT_PREVIEW_ENABLED,
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
