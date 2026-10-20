'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.join(__dirname, '..', 'miniprogram');
function evaluate(relative, dependencies, globals = {}) {
  const context = Object.assign({ module: { exports: {} }, require: name => {
    if (Object.prototype.hasOwnProperty.call(dependencies, name)) return dependencies[name];
    throw new Error('Unexpected dependency: ' + name);
  }, Date, Promise, Set, Map, console }, globals);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, relative), 'utf8'), context);
  return context.module.exports;
}
function configFor(envVersion = 'develop', platform = 'devtools', optIn = false) {
  const wx = { getAccountInfoSync: () => ({ miniProgram: { envVersion } }),
    getDeviceInfo: () => ({ platform }), getStorageSync: key => optIn && key === 'assessmentPreviewMode' ? 'readonly-examples' : '' };
  return evaluate('utils/app-config.js', {}, { wx });
}
function adapter(config, respond) {
  const calls = []; const events = [];
  const preview = evaluate('utils/assessment-preview.js', { './app-config.js': config });
  const api = evaluate('utils/api-assessment-resources.js', {
    './api-client.js': {
      request: async options => { calls.push(options); return respond(options); },
      post: async options => { calls.push(options); return { code: 0, data: {} }; }
    }, './app-config.js': config, './assessment-preview.js': preview,
    './auth-session.js': { capture: () => ({ token: 'signed-in' }), isCurrent: () => true },
    './analytics.js': { track: (...args) => events.push(args) },
    './date-time.js': require('../miniprogram/utils/date-time.js')
  }, { wx: {} });
  return { api, preview, calls, events };
}
function page(relative, api) {
  let result;
  const inert = {};
  const dependencies = {
    '../../../utils/api-assessment-resources.js': api,
    '../../../utils/api-payment.js': new Proxy({}, { get() { throw new Error('Payment must not run'); } }),
    '../../../utils/navigation.js': inert, '../../../behaviors/login-gate.js': inert,
    '../../utils/demo-data.js': { enabled: () => false },
    '../../utils/api-assessment-resources.js': api
  };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, relative), 'utf8'), {
    Page: value => { result = value; }, require: name => dependencies[name] || inert,
    Date, Promise, Set, Math, wx: new Proxy({}, { get() { throw new Error('No wx side effects in preview'); } })
  });
  result.data = JSON.parse(JSON.stringify(result.data));
  result.setData = patch => Object.assign(result.data, patch);
  return result;
}
const unavailable = () => ({ _source: 'error', _status: 404 });

test('assessment preview is off by default, opt-in requires develop and devtools, failing closed for missing runtime', () => {
  assert.equal(configFor().ASSESSMENT_PREVIEW_ENABLED, false);
  for (const [env, platform, expected] of [
    ['develop', 'devtools', true], ['trial', 'devtools', false], ['release', 'devtools', false],
    ['develop', 'ios', false], ['develop', 'android', false], ['develop', '', false], ['', 'devtools', false]
  ]) {
    assert.equal(configFor(env, platform).ASSESSMENT_PREVIEW_ENABLED, false, 'default ' + env + '/' + platform);
    assert.equal(configFor(env, platform, true).ASSESSMENT_PREVIEW_ENABLED, expected, 'opt-in ' + env + '/' + platform);
  }
  assert.equal(evaluate('utils/app-config.js', {}).ASSESSMENT_PREVIEW_ENABLED, false);
  const throwing = evaluate('utils/app-config.js', {}, { wx: { getAccountInfoSync() { throw new Error(); } } });
  assert.equal(throwing.ASSESSMENT_PREVIEW_ENABLED, false);
});

test('404, 503, network failures and empty configuration yield disclosed simulator catalogue', async () => {
  for (const response of [unavailable, () => ({ _source: 'error', _status: 503 }),
    () => ({ _source: 'networkError' }), () => { throw Object.assign(new Error('offline'), { code: 'NETWORK_ERROR' }); },
    () => ({ code: 0, data: { enabled: false, items: [] } })]) {
    const { api } = adapter(configFor('develop', 'devtools', true), response);
    for (const data of [await api.home(), await api.list()]) {
      assert.equal(data.preview, true); assert.equal(data.items.length, 3);
      assert.match(data.previewLabel, /开发预览.*暂不可购买/);
      assert.deepEqual(Array.from(data.items, item => item.companyName), ['示例公司A', '示例公司B', '示例公司C']);
      assert.ok(data.items.every(item => item.preview && item.productId.startsWith('preview-') && !item.link));
      assert.match(api.productView(data.items[0]).priceLabel, /^示例价/);
    }
  }
});

test('trial, release and physical devices never replace errors or disabled empty data with examples', async () => {
  for (const config of [configFor(), configFor('trial', 'devtools', true), configFor('release', 'devtools', true), configFor('develop', 'ios', true), configFor('', '', true)]) {
    const { api } = adapter(config, unavailable);
    await assert.rejects(api.home()); await assert.rejects(api.list());
    const disabled = adapter(config, () => ({ code: 0, data: { enabled: false, items: [] } }));
    assert.equal((await disabled.api.home()).enabled, false);
    assert.equal((await disabled.api.home()).preview, undefined);
  }
});

test('real nonempty catalogue wins; authorization, rate limits and ordinary server errors never trigger examples', async () => {
  const real = { enabled: true, items: [{ productId: '42', status: 'active', title: '真实资料' }] };
  const { api } = adapter(configFor('develop', 'devtools', true), () => ({ code: 0, data: real }));
  assert.equal(await api.home(), real); assert.equal(await api.list(), real);
  for (const status of [400, 401, 403, 429, 500]) {
    const result = adapter(configFor('develop', 'devtools', true), () => ({ _source: 'error', _status: status }));
    await assert.rejects(result.api.home());
  }
});

test('preview catalogue respects keyword, pagination and company scope without contaminating real companies', async () => {
  const { api } = adapter(configFor('develop', 'devtools', true), unavailable);
  const filtered = await api.list({ keyword: '示例公司B' });
  assert.equal(filtered.total, 1); assert.equal(filtered.items[0].companyName, '示例公司B');
  assert.equal((await api.list({ keyword: '无匹配' })).items.length, 0);
  assert.equal((await api.list({ companyId: '123' })).items.length, 0);
  assert.equal((await api.list({ companyId: 'preview-company-c' })).items.length, 1);
  assert.equal((await api.list({ page: 2, pageSize: 2 })).items.length, 1);
});

test('preview details use only local data while private purchase, order and delivery APIs still fail', async () => {
  const { api, calls, events } = adapter(configFor('develop', 'devtools', true), unavailable);
  const { product } = await api.detail('preview-assessment-a');
  assert.equal(product.preview, true); assert.equal(calls.length, 0);
  await assert.rejects(api.detail('preview-unknown'));
  await assert.rejects(api.createOrder({ productId: product.productId }), /暂不可购买/);
  assert.equal(calls.length, 0);
  api.track('assessment_product_view', { productId: product.productId });
  api.track('home_assessment_view_all', {}); assert.equal(events.length, 0);
  await assert.rejects(api.purchases()); await assert.rejects(api.order('real-order'));
  await assert.rejects(api.delivery('real-order'));
  assert.equal(calls.length, 3); assert.ok(calls.every(call => !call.skipAuth));
  const release = adapter(configFor('release'), unavailable);
  await assert.rejects(release.api.detail(product.productId));
  assert.equal(release.calls.length, 1);
  await assert.rejects(release.api.createOrder({ productId: product.productId }));
  assert.equal(release.calls.length, 1);
});

test('preview detail skips ownership, authentication, order, payment and product analytics', async () => {
  const { api, calls, events } = adapter(configFor('develop', 'devtools', true), unavailable);
  const detail = page('package-content/pages/assessment-detail/assessment-detail.js', api);
  detail._active = true; detail._productId = 'preview-assessment-a';
  detail.ensureAuthenticated = () => { throw new Error('Authentication must not run'); };
  await detail.load(); assert.equal(detail.data.canBuy, false);
  detail.purchase(); await detail.confirmPurchase(); await detail.checkPurchase(); await detail.pay({});
  await assert.rejects(detail.requestPayment({ mock: true }, {}), /暂不可购买/);
  assert.equal(calls.length, 0); assert.equal(events.length, 0);
  assert.equal(detail.data.purchaseChecking, false); assert.equal(detail.data.paying, false);
  const template = fs.readFileSync(path.join(ROOT, 'package-content/pages/assessment-detail/assessment-detail.wxml'), 'utf8');
  assert.match(template, /disabled="\{\{product\.preview \|\|/);
  assert.match(template, /开发预览·暂不可购买/);
});

test('preview home and signed-in list render examples without purchase queries or exposure analytics', async () => {
  const { api, calls, events } = adapter(configFor('develop', 'devtools', true), unavailable);
  const home = page('pages/index/index.js', api); home._visible = true;
  await home.fetchAssessmentProducts();
  assert.equal(home.data.assessmentPreview, true); assert.equal(home.data.assessmentProducts.length, 3);
  const list = page('package-content/pages/assessment-list/assessment-list.js', api); list._active = true;
  await list.load(); assert.equal(list.data.preview, true); assert.equal(list.data.items.length, 3);
  assert.equal(list.data.hasMore, false);
  assert.ok(calls.every(call => call.skipAuth)); assert.equal(events.length, 0);
});
