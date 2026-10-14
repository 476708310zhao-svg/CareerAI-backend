const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', 'miniprogram');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

const GATED_PAGES = [
  'pages/applications/applications',
  'pages/jobs/jobs',
  'package-agency/pages/agency-detail/agency-detail',
  'package-content/pages/experience-detail/experience-detail',
  'package-career/pages/salary/salary',
  'package-career/pages/oa-bank/oa-bank',
  'package-user/pages/settings/settings',
  'package-user/pages/vip/vip',
  'package-ai/pages/interview-dialog/interview-dialog'
];

test('login-required actions use the shared in-page login gate', () => {
  const behavior = read('behaviors/login-gate.js');
  assert.match(behavior, /ensureAuthenticated\(subtitle, onSuccess\)/);
  assert.match(behavior, /_pendingAuthenticatedAction/);
  assert.match(behavior, /authPromptVisible:\s*true/);

  GATED_PAGES.forEach(page => {
    const js = read(page + '.js');
    const wxml = read(page + '.wxml');
    assert.match(js, /login-gate\.js/, page + ' must load the shared login gate');
    assert.match(js, /ensureAuthenticated\(/, page + ' must gate its protected actions');
    assert.match(wxml, /<c-login-popup/, page + ' must render the login popup');
    assert.match(wxml, /show="\{\{authPromptVisible\}\}"/, page + ' must bind popup visibility');
    assert.match(wxml, /bindsuccess="onAuthPromptSuccess"/, page + ' must resume after login');
  });
});

test('progress login card no longer redirects to Profile', () => {
  const progressJs = read('pages/applications/applications.js');
  const progressWxml = read('pages/applications/applications.wxml');

  assert.doesNotMatch(progressJs, /safeSwitchTab\(['"]\/pages\/profile\/profile/);
  assert.match(progressWxml, /bindtap="promptLogin"[^>]*>立即登录/);
});

test('AI Career Tab is login-gated while the legacy subpackage route stays a safe redirect', () => {
  const assistantJs = read('package-ai/pages/ai-assistant/ai-assistant.js');
  const assistantWxml = read('package-ai/pages/ai-assistant/ai-assistant.wxml');
  const tabJs = read('pages/ai-career/ai-career.js');
  const tabWxml = read('pages/ai-career/ai-career.wxml');

  ['package-ai/pages/ai-career/ai-career'].forEach(page => {
    const js = read(page + '.js');
    const wxml = read(page + '.wxml');
    assert.match(js, /ALLOWED_QUERY_KEYS\s*=\s*new Set\(\['action', 'applicationId', 'prompt'\]\)/);
    assert.match(js, /\.filter\(key => ALLOWED_QUERY_KEYS\.has\(key\)\)/);
    assert.match(js, /wx\.redirectTo\(\{ url: '\/package-ai\/pages\/ai-assistant\/ai-assistant'/);
    assert.match(js, /fail:\s*\(\) => wx\.showToast/);
    assert.doesNotMatch(js, /aiCareerCompatTasks|createAgentTask|loadTasks\(|getStorageSync\(/);
    assert.match(wxml, /正在打开 AI 助手/);
  });

  assert.match(tabJs, /pending_ai_tab_context/);
  assert.match(tabJs, /sendMessage\(\)[\s\S]*?if \(!this\._getToken\(\)\) \{[\s\S]*?this\._showLoginRequired\(/);
  assert.match(tabWxml, /<c-login-popup/);
  assert.match(tabWxml, /show="\{\{showLoginPopup\}\}"/);

  assert.match(assistantJs, /_getToken\(\)/);
  assert.match(assistantJs, /sendMessage\(\)[\s\S]*?if \(!this\._getToken\(\)\) \{[\s\S]*?this\._showLoginRequired\(/);
  assert.match(assistantJs, /_handleAuthExpired\(\)[\s\S]*?this\._showLoginRequired\(/);
  assert.match(assistantWxml, /<c-login-popup/);
  assert.match(assistantWxml, /show="\{\{showLoginPopup\}\}"/);
  assert.match(assistantWxml, /bind:success="onLoginSuccess"/);
});

test('login popup uses the optimized Zhiyin brand logo', () => {
  const app = JSON.parse(read('app.json'));
  const popup = read('components/c-login-popup/c-login-popup.wxml');
  const logoPath = path.join(ROOT, 'images', 'zhiyin-logo.png');
  const logo = fs.readFileSync(logoPath);

  assert.equal(app.usingComponents['c-login-popup'], '/components/c-login-popup/c-login-popup');
  assert.match(popup, /src="\/images\/zhiyin-logo\.png"/);
  assert.ok(logo.length > 0 && logo.length < 100 * 1024, 'brand logo should be optimized below 100 KB');
  assert.equal(logo.readUInt32BE(16), 256);
  assert.equal(logo.readUInt32BE(20), 256);
});

test('login popup always provides visible cancel paths and exits after phone denial', () => {
  const popupJs = read('components/c-login-popup/c-login-popup.js');
  const popupWxml = read('components/c-login-popup/c-login-popup.wxml');

  assert.match(popupWxml, /bindtap="onCloseTap"/);
  assert.match(popupWxml, /bindtap="onSkipLogin">暂不登录，先逛逛/);
  assert.match(popupJs, /onBackdropTap\(\)\s*\{\s*this\._dismissLogin\('backdrop'\)/);
  assert.match(popupJs, /if \(!e\.detail\.code\) \{[\s\S]*?_dismissLogin\('phone-denied'\)/);
  assert.match(popupJs, /triggerEvent\('close', \{ reason \}\)/);
});

test('login converts a misrouted production 404 into an actionable service message', () => {
  const apiClient = read('utils/api-client.js');
  const apiUser = read('utils/api-user.js');
  const { _createHttpError } = require('../miniprogram/utils/api-client.js');
  const routeError = _createHttpError({ statusCode: 404, data: '<!DOCTYPE html><html><body>Not Found</body></html>' });
  const resourceError = _createHttpError({ statusCode: 404, data: { message: '申请记录不存在' } });

  assert.match(apiClient, /isHtmlNotFound[\s\S]*?SERVICE_ROUTE_UNAVAILABLE/);
  assert.match(apiClient, /服务接口暂不可用，请稍后重试/);
  assert.match(apiUser, /function normalizeLoginError\(error\)/);
  assert.match(apiUser, /登录服务暂不可用，请稍后重试/);
  assert.match(apiUser, /LOGIN_SERVICE_UNAVAILABLE/);
  assert.equal(routeError.code, 'SERVICE_ROUTE_UNAVAILABLE');
  assert.equal(routeError.message, '服务接口暂不可用，请稍后重试');
  assert.equal(resourceError.message, '申请记录不存在');
});

test('develop builds use the isolated local API while trial and release stay on production HTTPS', () => {
  const source = read('utils/app-config.js');
  const loadConfig = envVersion => {
    const context = {
      module: { exports: {} },
      exports: {},
      wx: { getAccountInfoSync: () => ({ miniProgram: { envVersion } }) }
    };
    vm.runInNewContext(source, context, { filename: 'app-config.js' });
    return context.module.exports;
  };

  const develop = loadConfig('develop');
  const trial = loadConfig('trial');
  const release = loadConfig('release');
  assert.equal(develop.API_BASE_URL, 'http://127.0.0.1:4400');
  assert.equal(develop.ANALYTICS_ENABLED, false);
  assert.equal(trial.API_BASE_URL, 'https://api.zhiyincareer.com');
  assert.equal(trial.ANALYTICS_ENABLED, true);
  assert.equal(release.API_BASE_URL, 'https://api.zhiyincareer.com');
  assert.equal(release.ANALYTICS_ENABLED, true);
});

test('develop analytics is a no-op and never opens the local events endpoint', async () => {
  const source = read('utils/analytics.js');
  const posts = [];
  const storage = {};
  const context = {
    module: { exports: {} },
    exports: {},
    Promise,
    Date,
    getCurrentPages: () => [],
    Page() {},
    wx: {
      getStorageSync: key => storage[key],
      setStorageSync: (key, value) => { storage[key] = value; }
    },
    require(name) {
      if (name === './api-client.js') return { post: options => { posts.push(options); return Promise.resolve({ code: 0 }); } };
      if (name === './app-config.js') return { ANALYTICS_ENABLED: false, ENABLE_DEMO_FALLBACK: false };
      throw new Error('Unexpected dependency: ' + name);
    }
  };
  vm.runInNewContext(source, context, { filename: 'analytics.js' });
  assert.equal(await context.module.exports.track('page_view', {}), true);
  context.module.exports.flush();
  assert.equal(posts.length, 0);
});

test('production nginx gives API routes explicit priority over a co-hosted website', () => {
  const nginx = fs.readFileSync(path.join(ROOT, '..', 'nginx.conf'), 'utf8');
  assert.match(nginx, /location \^~ \/api\/\s*\{/);
  assert.match(nginx, /location \^~ \/api\/[\s\S]*?proxy_pass\s+http:\/\/127\.0\.0\.1:4400;/);
});
