'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture(id) {
  return { id, title: `资料 ${id}`, coverUrl: 'https://example.test/cover.png', summary: '简介',
    description: '介绍', catalogText: '目录', sampleImages: [], priceCents: 900,
    status: 'active', claimDays: null, companyIds: [], companies: [],
    usageInstructions: '使用说明', claimInstructions: '领取说明', updateInstructions: '更新说明',
    afterSalesInstructions: '售后说明', sourceDescription: '来源说明', driveName: '网盘',
    driveUrl: 'https://example.test/drive' };
}
function harness(options = {}) {
  const fields = new Map();
  const confirms = [];
  const writes = [];
  const requests = new Map();
  class Element {
    constructor(tag = 'div') {
      this.tagName = tag.toUpperCase(); this.children = []; this.listeners = new Map();
      this.value = ''; this.hidden = false; this.disabled = false; this.dataset = {};
      this.textContent = ''; this.classList = { toggle() {} };
    }
    append(...items) { this.children.push(...items); }
    get childNodes() { return this.children; }
    replaceChildren(...items) { this.children = items; }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    trigger(type, event = {}) { return this.listeners.get(type)?.({ preventDefault() {}, currentTarget: this, ...event }); }
    setAttribute(key, value) { this[key] = value; }
    querySelectorAll() { return []; }
    focus() {}
    reset() {}
    showModal() { this.open = true; }
    close() { this.open = false; }
  }
  const get = id => {
    if (!fields.has(id)) fields.set(id, new Element());
    return fields.get(id);
  };
  const tabs = ['products', 'home', 'orders', 'instructions'].map(tab => {
    const control = new Element('button'); control.dataset.tab = tab; return control;
  });
  get('productEditor').hidden = true;
  const ok = data => ({ code: 0, data });
  const context = {
    document: { getElementById: get, createElement: tag => new Element(tag),
      createTextNode: text => ({ textContent: text }), querySelectorAll: () => tabs },
    window: { ADMIN_API: 'https://example.test', addEventListener() {} },
    URL, URLSearchParams, console,
    getToken: () => 'fixture-token', canAccess: () => true,
    initPage: (_id, _title, run) => run(), toast() {},
    confirm: (message, action) => { confirms.push({ message, action }); },
    GET: async url => {
      const detail = url.match(/assessment-products\/(\d+)$/);
      if (detail) { const pending = deferred(); requests.set(Number(detail[1]), pending); return pending.promise; }
      if (url.includes('assessment-products?')) return ok({ items: [fixture(1), fixture(2)], total: 2 });
      if (url.includes('assessment-orders?')) return ok({ items: options.orders || [], total: (options.orders || []).length });
      if (url.endsWith('assessment-home')) return ok({ enabled: false, items: [] });
      if (url.endsWith('assessment-instructions')) return options.getInstructions?options.getInstructions():ok({version:1,configured:true,usageInstructions:'原使用',claimInstructions:'原领取',updateInstructions:'原更新',afterSalesInstructions:'原售后'});
      throw new Error(`Unexpected GET ${url}`);
    },
    POST: async (url, body) => { writes.push({ url, body }); return ok({}); },
    PUT: async (url,body) => {writes.push({url,body});return options.putInstructions?options.putInstructions(url,body):ok({version:2});}, api: async () => ok({}),
    fetch: async () => ({ ok: true, json: async () => ok({ list: [], total: 0 }) })
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../admin/js/assessment-products.js'), 'utf8'), context);
  const walk = element => [element, ...(element.children || []).flatMap(walk)];
  const buttons = (id, text) => walk(get(id)).filter(item => item.tagName === 'BUTTON' && item.textContent === text);
  return { get, tabs, requests, confirms, writes, buttons, allText: id => walk(get(id)).map(item => item.textContent).join(' ') };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('assessment admin creates nine-yuan products and ignores a changed read-only price field', async () => {
  const app=harness();await settle();await app.get('addProduct').trigger('click');
  assert.equal(app.get('f_priceCents').value,900);
  assert.match(app.get('pricePreview').textContent,/9\.00/);
  for(const key of ['title','summary','description','catalogText','usageInstructions','claimInstructions','updateInstructions','afterSalesInstructions','sourceDescription']) app.get('f_'+key).value='真实资料说明';
  app.get('f_coverUrl').value='https://example.test/cover.png';
  app.get('f_priceCents').value=1990;app.get('f_status').value='draft';app.get('f_sampleImages').value='';
  await app.get('productForm').trigger('submit');
  assert.equal(app.writes.length,1);assert.equal(app.writes[0].body.priceCents,900);
  const html=fs.readFileSync(path.join(__dirname,'../admin/assessment-products.html'),'utf8');
  assert.match(html,/id="f_priceCents"[^>]*value="900"[^>]*readonly/);
});

test('assessment admin ignores a late product response and preserves newer unsaved edits', async () => {
  const app = harness(); await settle();
  const edits = app.buttons('productRows', '编辑');
  const first = edits[0].trigger('click');
  const second = edits[1].trigger('click');
  app.requests.get(2).resolve({ code: 0, data: { product: fixture(2) } });
  await second;
  app.get('f_title').value = '资料 2 的未保存修改';
  app.get('productForm').trigger('input');
  app.requests.get(1).resolve({ code: 0, data: { product: fixture(1) } });
  await first;
  assert.equal(app.get('f_title').value, '资料 2 的未保存修改');
  assert.equal(app.get('productEditor').hidden, false);
  app.get('cancelEditor').trigger('click');
  assert.equal(app.confirms.length, 1);
  assert.match(app.confirms[0].message, /尚未保存/);
});

test('assessment admin edits shared copy once and omits per-product instruction fields',async()=>{
  const app=harness();await settle();app.tabs[3].trigger('click');await settle();
  assert.equal(app.get('shared_usageInstructions').value,'原使用');
  for(const key of ['usageInstructions','claimInstructions','updateInstructions','afterSalesInstructions'])app.get('shared_'+key).value='确认的统一文案';
  await app.get('instructionsForm').trigger('submit');
  assert.equal(app.writes.length,1);assert.match(app.writes[0].url,/assessment-instructions$/);
  assert.equal(app.writes[0].body.expectedVersion,1);assert.equal(app.writes[0].body.usageInstructions,'确认的统一文案');
  assert.match(app.get('instructionsStatus').textContent,/第 2 版/);
  const html=fs.readFileSync(path.join(__dirname,'../admin/assessment-products.html'),'utf8');
  assert.doesNotMatch(html,/id="f_(?:usage|claim|update|afterSales)Instructions"/);
  assert.match(html,/id="shared_usageInstructions"/);
});

test('assessment shared settings ignore stale GET success and failure after a newer page load is edited',async()=>{
  for(const outcome of ['resolve','reject']) {
    const requests=[];const app=harness({getInstructions:()=>{const pending=deferred();requests.push(pending);return pending.promise;}});
    await settle();app.tabs[3].trigger('click');app.tabs[0].trigger('click');app.tabs[3].trigger('click');
    requests[1].resolve({code:0,data:{version:2,configured:true,usageInstructions:'第二版'}});await settle();
    app.get('shared_usageInstructions').value='尚未保存的新修改';app.get('instructionsForm').trigger('input');
    if(outcome==='resolve')requests[0].resolve({code:0,data:{version:1,configured:true,usageInstructions:'迟到旧版'}});
    else requests[0].reject(new Error('迟到旧失败'));
    await settle();assert.equal(app.get('shared_usageInstructions').value,'尚未保存的新修改');
    assert.equal(app.get('instructionsError').textContent,'');assert.equal(app.get('saveInstructions').disabled,false);
    app.tabs[0].trigger('click');assert.match(app.confirms.at(-1).message,/统一说明尚未保存/);
  }
});

test('assessment shared GET cannot overwrite a completed PUT and navigation stays locked while saving',async()=>{
  const requests=[],put=deferred();
  const app=harness({getInstructions:()=>{const pending=deferred();requests.push(pending);return pending.promise;},putInstructions:()=>put.promise});
  await settle();app.tabs[3].trigger('click');app.tabs[0].trigger('click');app.tabs[3].trigger('click');
  const copy={version:2,configured:true,usageInstructions:'新使用',claimInstructions:'新领取',updateInstructions:'新更新',afterSalesInstructions:'新售后'};
  requests[1].resolve({code:0,data:copy});await settle();
  app.get('shared_usageInstructions').value='保存后文案';app.get('instructionsForm').trigger('input');
  const saving=app.get('instructionsForm').trigger('submit');
  assert.equal(app.tabs[0].disabled,true);app.tabs[0].trigger('click');assert.equal(app.get('panel-instructions').hidden,false);
  app.get('reloadInstructions').trigger('click');assert.equal(requests.length,2);
  requests[0].resolve({code:0,data:{...copy,version:1,usageInstructions:'旧GET'}});await settle();
  assert.equal(app.get('shared_usageInstructions').value,'保存后文案');assert.equal(app.get('saveInstructions').disabled,true);
  put.resolve({code:0,data:{version:3}});await saving;
  assert.equal(app.get('shared_usageInstructions').value,'保存后文案');assert.match(app.get('instructionsStatus').textContent,/第 3 版/);
  assert.equal(app.tabs[0].disabled,false);assert.equal(app.get('saveInstructions').disabled,false);
  app.tabs[0].trigger('click');assert.equal(app.confirms.length,0);
});

test('assessment admin invalidates product loads when closing or switching tabs', async () => {
  for (const action of ['close', 'switch']) {
    const app = harness(); await settle();
    const pending = app.buttons('productRows', '编辑')[0].trigger('click');
    if (action === 'close') app.get('closeEditor').trigger('click');
    else app.tabs[2].trigger('click');
    app.requests.get(1).resolve({ code: 0, data: { product: fixture(1) } });
    await pending;
    assert.equal(app.get('productEditor').hidden, true, action);
    assert.equal(app.get('f_title').value, '', action);
    if (action === 'switch') assert.equal(app.get('panel-orders').hidden, false);
  }
});

test('assessment admin ignores stale product failures after a newer product opens', async () => {
  const app = harness(); await settle();
  const edits = app.buttons('productRows', '编辑');
  const first = edits[0].trigger('click'); const second = edits[1].trigger('click');
  app.requests.get(2).resolve({ code: 0, data: { product: fixture(2) } }); await second;
  app.requests.get(1).reject(new Error('late failure')); await first;
  assert.equal(app.get('pageNotice').textContent, '');
  assert.equal(app.get('f_title').value, '资料 2');
});

test('assessment admin review payments allow receipt-backed refund but never delivery retry', async () => {
  const app = harness({ orders: [{ orderNo: 'REVIEW001', userId: 1, title: '资料', amount: 900,
    status: 'payment_review', deliveryStatus: 'review' }] });
  await settle(); app.tabs[2].trigger('click'); await settle();
  assert.match(app.allText('orderRows'), /已收到付款，待人工核对/);
  assert.match(app.allText('orderRows'), /闭单后收到付款，资料未交付/);
  assert.equal(app.buttons('orderRows', '重试交付').length, 0);
  const refunds = app.buttons('orderRows', '记录人工退款'); assert.equal(refunds.length, 1);
  refunds[0].trigger('click');
  await app.get('refundForm').trigger('submit');
  assert.equal(app.writes.length, 0, 'receipt and note are mandatory');
  app.get('refundReference').value = 'EXTERNAL-REFUND-001'; app.get('refundReason').value = '核对后已原路退款';
  await app.get('refundForm').trigger('submit');
  assert.equal(app.writes.length, 1);
  assert.match(app.writes[0].url, /REVIEW001\/refund-completed$/);
  assert.equal(app.writes[0].body.confirmExternalRefund, true);
  assert.equal(app.writes[0].body.externalReference, 'EXTERNAL-REFUND-001');
  assert.equal(app.writes[0].body.note, '核对后已原路退款');
  const html = fs.readFileSync(path.join(__dirname, '../admin/assessment-products.html'), 'utf8');
  assert.match(html, /option value="payment_review"/);
});
