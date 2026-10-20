'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.join(__dirname, '..', 'miniprogram');
const resourceViews = require('../miniprogram/utils/api-assessment-resources.js');
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function page(relative, api, globals = {}, dependencies = {}) {
  for (const key of ['ownsProduct', 'purchaseState', 'purchaseLabel', 'validPurchase']) {
    if (!api[key]) api[key] = resourceViews[key];
  }
  let definition;
  const mocks = {
    '../../../utils/api-assessment-resources.js': api,
    '../../utils/api-assessment-resources.js': api,
    '../../../behaviors/login-gate.js': {},
    '../../utils/demo-data.js': { enabled: () => false },
    '../../../utils/navigation.js': { safeNavigateTo() {} }
  };
  Object.assign(mocks, dependencies);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, relative), 'utf8'), Object.assign({
    Page(value) { definition = value; }, require(name) { return mocks[name] || {}; },
    wx: { showToast() {}, getStorageSync() { return ''; } }, Date, Promise, Set, Math,
    setTimeout, clearTimeout, console: { warn() {} }
  }, globals));
  definition.data = JSON.parse(JSON.stringify(definition.data));
  definition.setData = function(patch) { Object.assign(this.data, patch); };
  return definition;
}
const detailPath = 'package-content/pages/assessment-detail/assessment-detail.js';
const orderPath = 'package-content/pages/assessment-order/assessment-order.js';

test('assessment list and detail use separate sharp cover compositions for small source images', () => {
  const product = resourceViews.productView({ title: '小米校招测评资料', companies: [{ name: '小米集团' }], priceCents: 900 });
  assert.equal(product.coverTone, 'xiaomi');
  assert.equal(product.coverCompany, '小米');
  const listWxml = fs.readFileSync(path.join(ROOT, 'package-content/pages/assessment-list/assessment-list.wxml'), 'utf8');
  const detailWxml = fs.readFileSync(path.join(ROOT, 'package-content/pages/assessment-detail/assessment-detail.wxml'), 'utf8');
  const listCss = fs.readFileSync(path.join(ROOT, 'package-content/pages/assessment-list/assessment-list.wxss'), 'utf8');
  const detailCss = fs.readFileSync(path.join(ROOT, 'package-content/pages/assessment-detail/assessment-detail.wxss'), 'utf8');
  assert.match(listWxml, /a-cover assessment-cover tone-\{\{item\.coverTone\}\}/);
  assert.match(detailWxml, /detail-cover assessment-cover tone-\{\{product\.coverTone\}\}/);
  assert.doesNotMatch(listWxml, /class="a-cover"[^>]*<image/);
  assert.doesNotMatch(detailWxml, /class="detail-cover"[^>]*mode="aspectFill"/);
  assert.match(listCss, /\.a-cover\s*\{[^}]*width:\s*124rpx;[^}]*height:\s*160rpx;/);
  assert.match(detailCss, /\.detail-cover\s*\{[^}]*width:\s*100%;[^}]*height:\s*340rpx;/);
});

test('assessment home price stays on the right of the title above its summary', () => {
  const wxml = fs.readFileSync(path.join(ROOT, 'pages/index/index.wxml'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'pages/index/index.wxss'), 'utf8');
  assert.match(wxml, /class="zy-assessment-row-top">\s*<text class="zy-row-title">[^<]+<\/text>\s*<text class="zy-assessment-price">[^<]+<\/text>\s*<\/view>\s*<text class="zy-job-meta">/);
  assert.match(css, /\.zy-assessment-row-top\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*baseline;/);
  assert.match(css, /\.zy-assessment-row-top \.zy-row-title\s*\{[^}]*flex:\s*1;[^}]*min-width:\s*0;/);
  assert.match(css, /\.zy-assessment-price\s*\{[^}]*flex:\s*none;[^}]*white-space:\s*nowrap;/);
});

test('assessment home keeps backend order, only three distinct companies/products, and is independent of recruitment', async () => {
  const events = [];
  const api = { home: async () => ({ enabled: true, items: [
    { companyId: 9, productId: 1, priceCents: 900 }, { companyId: 9, productId: 2 },
    { companyId: 8, productId: 1 }, { companyId: 8, productId: 3 },
    { companyId: 7, productId: 4 }, { companyId: 6, productId: 5 }
  ] }), price: value => (Number(value || 0) / 100).toFixed(2), imageUrl: value => value || '', track: (...value) => events.push(value) };
  const home = page('pages/index/index.js', api);
  home._visible = true;
  home.data.recruitmentEnabled = false;
  await home.fetchAssessmentProducts();
  assert.deepEqual(Array.from(home.data.assessmentProducts, item => item.productId), [1, 3, 4]);
  assert.equal(home.data.assessmentProducts[0].priceText, '9.00');
  assert.equal(events.length, 4);
  const wxml = fs.readFileSync(path.join(ROOT, 'pages/index/index.wxml'), 'utf8');
  assert.ok(wxml.indexOf('zy-recommend-section') < wxml.indexOf('zy-assessment-section'));
  assert.ok(wxml.indexOf('zy-assessment-section') < wxml.indexOf('zy-campus-section'));
  assert.ok(wxml.lastIndexOf('</block>', wxml.indexOf('zy-assessment-section')) > wxml.indexOf('zy-recommend-section'));
});

test('assessment home ignores late requests and hides failed configuration', async () => {
  const old = deferred(); let reads = 0;
  const api = { home: () => ++reads === 1 ? old.promise : Promise.resolve({ enabled: false, items: [] }) };
  const home = page('pages/index/index.js', api); home._visible = true;
  const first = home.fetchAssessmentProducts();
  await home.fetchAssessmentProducts();
  old.resolve({ enabled: true, items: [{ companyId: 1, productId: 1 }] }); await first;
  assert.equal(home.data.assessmentProducts.length, 0);
  api.home = async () => { throw new Error('network'); };
  await home.fetchAssessmentProducts(); assert.equal(home.data.assessmentProducts.length, 0);
});

test('assessment API bypasses all cache for orders/links and uses anonymous catalogue reads', async () => {
  const requests = [];
  const context = { module: { exports: {} }, wx: {}, require(name) {
    if (name === './api-client.js') return { request: async options => { requests.push(options); return { code: 0, data: {} }; } };
    if (name === './app-config.js') return { API_BASE_URL: 'https://api.example.test' };
    if (name === './assessment-preview.js') return require('../miniprogram/utils/assessment-preview.js');
    if (name === './date-time.js') return require('../miniprogram/utils/date-time.js');
    return {};
  }, Date };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'utils/api-assessment-resources.js'), 'utf8'), context);
  const api = context.module.exports;
  await api.home(); await api.detail('p/1'); await api.purchases({ productId: 15, ownedOnly: 1, page: 2 }); await api.order('o/1'); await api.delivery('o/1');
  assert.ok(requests.every(item => item.noCache === true));
  assert.deepEqual(requests.map(item => item.skipAuth), [true, true, false, false, false]);
  assert.equal(requests[2].params.productId, 15); assert.equal(requests[2].params.ownedOnly, 1); assert.equal(requests[2].params.page, 2);
  assert.match(requests[4].path, /o%2F1\/delivery$/);
  assert.equal(api.price(1999), '19.99');
  assert.equal(api.validPurchase({ status: 'refunded' }), false);
  assert.equal(api.validPurchase({ status: 'paid', deliveryStatus: 'revoked' }), false);
  assert.equal(api.validPurchase({ status: 'paid', deliveryStatus: 'ready', expiresAt: '2099-01-01 00:00:00' }), true);
  assert.equal(api.ownsProduct({ status: 'paid', expiresAt: '2000-01-01 00:00:00' }), true);
  assert.equal(api.ownsProduct({ status: 'payment_review', deliveryStatus: 'review' }), true);
  assert.equal(api.validPurchase({ status: 'payment_review', deliveryStatus: 'review' }), false);
  assert.equal(api.imageUrl('javascript:alert(1)'), '');
});

test('assessment detail refuses a purchased marker from an old login session', async () => {
  const response = deferred(); let current = true;
  const api = { capture: () => ({ token: 'A' }), current: () => current, purchases: () => response.promise,
    validPurchase: item => item.status === 'paid' };
  const detail = page(detailPath, api); detail._active = true; detail._productId = 'p1';
  const pending = detail.checkPurchase(); current = false;
  response.resolve({ items: [{ productId: 'p1', status: 'paid', orderNo: 'secret-A' }] }); await pending;
  assert.equal(detail.data.purchasedOrderNo, '');
  assert.equal(detail.data.purchaseChecking, false);
  assert.match(detail.data.purchaseError, /登录状态/);
});

test('expired, awaiting-delivery and payment-review purchases open the existing order without a new purchase confirmation', async () => {
  for (const owned of [
    { status: 'paid', deliveryStatus: 'ready', expiresAt: '2000-01-01T00:00:00Z', expected: 'expired' },
    { status: 'paid', deliveryStatus: 'pending', expected: 'waiting' },
    { status: 'payment_review', deliveryStatus: 'review', expected: 'review' }
  ]) {
    let confirmations = 0; let newOrders = 0; let query; const routes = [];
    const api = { capture: () => ({ token: 'A' }), current: () => true,
      purchases: async params => { query = params; return { items: [
        { productId: 'p1', status: 'refunded', orderNo: 'refund' },
        Object.assign({ productId: 'p1', orderNo: 'owned' }, owned)
      ] }; }, createOrder: async () => { newOrders += 1; }, orderUrl: value => value };
    const detail = page(detailPath, api, { wx: { showModal() { confirmations += 1; } } }, {
      '../../../utils/navigation.js': { safeNavigateTo: value => routes.push(value) }
    });
    detail._active = true; detail._productId = 'p1'; detail.data.canBuy = true;
    detail.data.product = { title: '资料', priceCents: 900 };
    await detail.confirmPurchase();
    assert.equal(query.productId, 'p1'); assert.equal(query.ownedOnly, 1);
    assert.equal(detail.data.purchasedOrderNo, 'owned'); assert.equal(detail.data.purchaseState, owned.expected);
    assert.deepEqual(routes, ['owned']); assert.equal(confirmations, 0); assert.equal(newOrders, 0);
  }
});

test('paid ownership wins over newer refund history while a refunded-only product remains purchasable', async () => {
  const api = { capture: () => ({ token: 'A' }), current: () => true, purchases: async () => ({ items: [
    { productId: 'p1', status: 'refunded', orderNo: 'refund' },
    { productId: 'p1', status: 'payment_review', orderNo: 'review' },
    { productId: 'p1', status: 'paid', orderNo: 'paid', deliveryStatus: 'ready' }
  ] }) };
  const detail = page(detailPath, api); detail._active = true; detail._productId = 'p1';
  await detail.checkPurchase(); assert.equal(detail.data.purchasedOrderNo, 'paid');
  api.purchases = async () => ({ items: [{ productId: 'p1', status: 'refunded', orderNo: 'refund' }] });
  await detail.checkPurchase(); assert.equal(detail.data.purchasedOrderNo, ''); assert.equal(detail.data.purchaseState, '');
});

test('purchased resources paginate beyond 200 orders and reject a next-page response after account change', async () => {
  let current = true; const queries = [];
  const api = { capture: () => ({ token: 'A' }), current: () => current, price: () => '9.00',
    purchases: async query => {
      queries.push(query);
      return { total: 221, items: Array.from({ length: Math.min(20, 221 - (query.page - 1) * 20) }, (_, i) => ({
        productId: String((query.page - 1) * 20 + i), orderNo: 'order-' + ((query.page - 1) * 20 + i),
        status: i ? 'paid' : 'payment_review', deliveryStatus: i ? 'ready' : 'review'
      })) };
    } };
  const purchases = page('package-content/pages/assessment-purchases/assessment-purchases.js', api); purchases._active = true;
  await purchases.load();
  assert.equal(purchases.data.items[0].statusLabel, '付款待核对');
  while (purchases.data.hasMore) await purchases.loadMore();
  assert.equal(purchases.data.items.length, 221); assert.equal(queries.length, 12);
  assert.ok(queries.every(query => query.pageSize === 20));
  const late = deferred(); purchases.data.hasMore = true; api.purchases = () => late.promise;
  const pending = purchases.loadMore(); current = false;
  late.resolve({ total: 240, items: [{ orderNo: 'private-A' }] }); await pending;
  assert.equal(purchases.data.items.length, 0); assert.equal(purchases.data.loadingMore, false);
});

test('starting a purchase-list next page under a new account replaces the old account rows', async () => {
  let generation = 0; const queries = [];
  const api = { capture: () => ({ token: 'account-' + generation, generation }),
    current: session => !!session && session.generation === generation, price: () => '9.00',
    purchases: async query => { queries.push(query.page); return { total: 2, items: [{
      productId: 'p1', status: 'paid', deliveryStatus: 'ready', orderNo: 'order-for-' + generation
    }] }; } };
  const purchases = page('package-content/pages/assessment-purchases/assessment-purchases.js', api); purchases._active = true;
  await purchases.load(); generation = 1; await purchases.loadMore();
  assert.deepEqual(queries, [1, 1]); assert.equal(purchases.data.items.length, 1);
  assert.equal(purchases.data.items[0].orderNo, 'order-for-1');
});

test('catalogue ownership is filtered to visible product IDs and load-more preserves the submitted search', async () => {
  const queries = [];
  const api = { capture: () => ({ token: 'A' }), current: () => true, productView: item => item,
    list: async query => ({ total: 2, items: [{ productId: query.page === 1 ? '700' : '701' }] }),
    purchases: async query => { queries.push(query); return { total: 1, items: [
      { productId: query.productIds, status: query.productIds === '700' ? 'paid' : 'payment_review',
        expiresAt: '2000-01-01T00:00:00Z', deliveryStatus: 'ready' }
    ] }; } };
  const list = page('package-content/pages/assessment-list/assessment-list.js', api); list._active = true;
  list.data.keyword = '公司'; await list.load();
  assert.equal(list.data.items[0].purchased, true); assert.equal(queries[0].productIds, '700');
  assert.equal(queries[0].ownedOnly, 1); assert.equal(queries[0].pageSize, 200);
  list.data.keyword = '未提交新搜索';
  let publicQuery; api.list = async query => { publicQuery = query; return { total: 2, items: [{ productId: '701' }] }; };
  await list.loadMore();
  assert.equal(publicQuery.keyword, '公司'); assert.equal(list.data.items.length, 2);
  assert.equal(list.data.items[1].ownershipLabel, '付款待核对'); assert.equal(list.data.hasMore, false);
});

test('purchase button creates a quoted order then dispatches mock, virtual, and wxpay before opening its order', async () => {
  for (const provider of ['mock', 'virtual', 'wxpay']) {
    const calls = [];
    const session = { token: 'A' };
    const payment = provider === 'mock' ? { mock: true }
      : provider === 'virtual' ? { provider: 'virtual', virtualPayment: { mode: 'goods', signData: 'signed', paySig: 'sig', signature: 'signature' } }
        : { provider: 'wxpay', timeStamp: '123', nonceStr: 'nonce', package: 'prepay_id=id', paySign: 'signed', signType: 'RSA' };
    const api = { capture: () => session, current: snapshot => snapshot === session,
      createOrder: async body => { calls.push(['create', body]); return { order: { orderNo: 'o1', status: 'pending' }, payment }; },
      orderUrl: orderNo => '/order?orderNo=' + orderNo, track() {} };
    const detail = page(detailPath, api, { wx: {
      showModal(options) { calls.push(['confirm', options.title]); options.success({ confirm: true }); },
      requestVirtualPayment(options) { calls.push(['virtual', options.signData]); options.success({}); },
      requestPayment(options) { calls.push(['wxpay', options.paySign]); options.success({}); }, showToast() {}
    } }, {
      '../../../utils/api-payment.js': { mockConfirmPay: async orderNo => { calls.push(['mock', orderNo]); } },
      '../../../utils/navigation.js': { safeNavigateTo: url => calls.push(['navigate', url]) }
    });
    detail._active = true; detail._productId = 'p1'; detail._source = 'home_assessment'; detail._companyId = '9';
    detail.data.product = { title: '公司测评资料', priceText: '9.00', priceCents: 900, instructionsVersion:7 };
    detail.data.canBuy = true;
    detail.checkPurchase = async () => {};
    detail.ensureAuthenticated = function(subtitle, next) { next.call(this); };
    detail.purchase();
    await new Promise(resolve => setImmediate(resolve));
    const creation = calls.find(call => call[0] === 'create');
    assert.ok(creation, provider + ' must create an order');
    assert.equal(creation[1].expectedPriceCents, 900);
    assert.equal(creation[1].expectedInstructionsVersion,7);
    assert.equal(creation[1].source, 'home_assessment');
    assert.equal(creation[1].companyId, '9');
    assert.match(creation[1].idempotencyKey, /^assessment-/);
    assert.equal(calls.filter(call => call[0] === provider).length, 1);
    assert.deepEqual(calls.at(-1), ['navigate', '/order?orderNo=o1']);
    assert.equal(detail.data.paying, false);
  }
});

test('assessment checkout keeps the terms version the user actually confirmed even if detail refreshes',async()=>{
  const session={token:'A'};let modal,submitted;
  const api={capture:()=>session,current:()=>true,track(){},orderUrl:value=>value,
    createOrder:async body=>{submitted=body;return {alreadyPurchased:true,order:{orderNo:'owned',status:'paid'}};}};
  const detail=page(detailPath,api,{wx:{showModal:options=>{modal=options;},showToast(){}}});
  detail._active=true;detail._productId='p1';detail.data.canBuy=true;
  detail.data.product={title:'资料',priceCents:900,priceText:'9.00',instructionsVersion:3};
  detail.checkPurchase=async()=>{};
  await detail.confirmPurchase();
  detail.data.product={...detail.data.product,instructionsVersion:4};
  modal.success({confirm:true});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(submitted.expectedInstructionsVersion,3);
});

test('assessment detail honors incomplete shared-configuration purchase gate',async()=>{
  const api={detail:async()=>({product:{productId:'p1',status:'active',purchaseEnabled:false}}),productView:value=>value,
    track(){},capture:()=>({token:''})};
  const detail=page(detailPath,api);detail._active=true;detail._productId='p1';
  await detail.load();assert.equal(detail.data.canBuy,false);assert.equal(detail.data.error,'');
});

test('assessment payment refuses stale identity and already-purchased orders skip payment', async () => {
  let current = true; let creates = 0; let dispatches = 0; const navigations = [];
  const response = deferred(); const session = { token: 'A' };
  const api = { current: () => current, createOrder: () => { creates += 1; return response.promise; },
    track() {}, orderUrl: value => value };
  const detail = page(detailPath, api, {}, { '../../../utils/navigation.js': { safeNavigateTo: value => navigations.push(value) } });
  detail._active = true; detail._productId = 'p1'; detail.data.product = { priceCents: 900 };
  detail.requestPayment = async () => { dispatches += 1; };
  const pending = detail.pay(session); current = false;
  response.resolve({ order: { orderNo: 'old', status: 'pending' }, payment: { mock: true } }); await pending;
  assert.equal(dispatches, 0); assert.equal(navigations.length, 0);
  assert.equal(detail.data.paying, false);
  await detail.pay(session); assert.equal(creates, 1);
  current = true;
  api.createOrder = async () => ({ alreadyPurchased: true, order: { orderNo: 'owned', status: 'paid' } });
  await detail.pay(session);
  assert.equal(dispatches, 0); assert.deepEqual(navigations, ['owned']);
});

test('assessment list resumes after an account change without leaving a loading spinner', async () => {
  let generation = 0; let reads = 0; const response = deferred();
  const api = { capture: () => ({ token: '', generation }), current: session => session.generation === generation,
    list: async () => { reads += 1; return reads === 1 ? response.promise : { items: [{ productId: 'p1' }] }; },
    productView: item => item };
  const list = page('package-content/pages/assessment-list/assessment-list.js', api); list._active = true;
  const pending = list.load(); generation = 1; response.resolve({ items: [{ productId: 'old' }] }); await pending;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reads, 2); assert.equal(list.data.loading, false); assert.equal(list.data.items[0].productId, 'p1');
});

test('assessment order polls at most six times and never reads a pending or refunded delivery', async () => {
  let reads = 0; let deliveries = 0; let status = 'pending';
  const api = { capture: () => ({ token: 'A' }), current: () => true, price: () => '9.00',
    order: async () => { reads += 1; return { order: { status, orderNo: 'o1' } }; }, delivery: async () => { deliveries += 1; } };
  const order = page(orderPath, api); order._active = true; order._orderNo = 'o1'; order.delay = async () => true;
  await order.load(); assert.equal(reads, 6); assert.equal(deliveries, 0); assert.equal(order.data.confirming, false);
  status = 'refunded'; await order.load(); assert.equal(reads, 7); assert.equal(deliveries, 0);
  status = 'payment_review'; await order.load(); assert.equal(reads, 8); assert.equal(deliveries, 0);
  assert.equal(order.data.statusLabel, '已收到付款，待人工核对');
});

test('assessment order clears private information and ignores a response after leaving', async () => {
  const response = deferred(); let deliveries = 0;
  const api = { capture: () => ({ token: 'A' }), current: () => true,
    order: () => response.promise, delivery: async () => { deliveries += 1; } };
  const order = page(orderPath, api); order._active = true; order._orderNo = 'o1';
  const pending = order.load(); order.stop();
  response.resolve({ order: { status: 'paid', orderNo: 'o1' } }); await pending;
  assert.equal(order.data.order, null); assert.equal(order.data.delivery, null); assert.equal(deliveries, 0);
});

test('assessment order rejects a mismatched order and a response after an account switch', async () => {
  let current = true; const response = deferred();
  const api = { capture: () => ({ token: 'A' }), current: () => current, order: async () => ({ order: { orderNo: 'other-person', status: 'paid' } }) };
  const order = page(orderPath, api); order._active = true; order._orderNo = 'owned';
  await order.load(); assert.equal(order.data.order, null); assert.match(order.data.error, /未找到/);
  api.order = () => response.promise;
  const pending = order.load(); current = false;
  response.resolve({ order: { orderNo: 'owned', status: 'paid' } }); await pending;
  assert.equal(order.data.order, null); assert.equal(order.data.loading, false); assert.match(order.data.error, /登录状态/);
});

test('copy revalidates entitlement and emits no private link into analytics', async () => {
  let reads = 0; let copied = ''; const events = [];
  const api = { capture: () => ({ token: 'A' }), current: () => true,
    delivery: async () => { reads += 1; return { title: '资料', link: 'https://drive.example.test/secret', extractionCode: '1234' }; },
    track: (name, data) => events.push({ name, data }) };
  const order = page(orderPath, api, { wx: { setClipboardData(options) { copied = options.data; options.success(); }, showToast() {} } });
  order._active = true; order._orderNo = 'o1'; order._request = 1; order._deliverySession = {};
  order.data.order = { productId: 'p1' }; order.data.delivery = { link: 'https://drive.example.test/old' };
  await order.copyDelivery();
  assert.equal(reads, 1); assert.match(copied, /secret/); assert.match(copied, /1234/);
  assert.doesNotMatch(JSON.stringify(events), /secret|1234|old/);
  api.delivery = async () => { throw new Error('订单已退款'); };
  copied = ''; await order.copyDelivery(); assert.equal(copied, ''); assert.equal(order.data.delivery, null);
});

test('assessment pages are registered in content subpackage and have complete page files', () => {
  const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  const content = app.subPackages.find(item => item.root === 'package-content');
  for (const name of ['list', 'detail', 'purchases', 'order']) {
    const route = 'pages/assessment-' + name + '/assessment-' + name;
    assert.ok(content.pages.includes(route));
    for (const extension of ['js', 'json', 'wxml', 'wxss']) assert.ok(fs.existsSync(path.join(ROOT, 'package-content', route + '.' + extension)));
    const source = fs.readFileSync(path.join(ROOT, 'package-content', route + '.js'), 'utf8');
    assert.doesNotMatch(source, /wx\.request\s*\(|setStorageSync|rich-text/);
  }
});
