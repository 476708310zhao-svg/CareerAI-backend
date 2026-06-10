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
  WX_TPL_APPLICATION: '',
  WX_TPL_INTERVIEW: '',
  WX_TPL_SYSTEM: '',

  // Keep production surfaces free of demo/mock-looking content. Developers can
  // temporarily enable this in a local build when they need offline fixtures.
  ENABLE_DEMO_FALLBACK: false
};
