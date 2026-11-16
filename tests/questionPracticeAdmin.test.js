'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'admin/question-bank.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'admin/js/question-bank.js'), 'utf8');
class Node {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.listeners = {}; this.textContent = ''; this.value = ''; this.hidden = false; this.disabled = false; this.checked = false; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  setAttribute(name, value) { this[name] = value; }
  focus() { this.focused = true; }
  reset() { this.value = ''; }
  querySelector(selector) {
    if (selector === 'input[type="text"]') return this.children.find(node => node.type === 'text');
    if (selector === 'input[type="radio"],input[type="checkbox"]') return this.children.find(node => node.type === 'radio' || node.type === 'checkbox');
    return null;
  }
  querySelectorAll(selector) { return selector === 'input[name="right"]' ? this.rights || [] : []; }
  click() { return this.listeners.click && this.listeners.click({ preventDefault() {} }); }
}
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle() { for (let i = 0; i < 14; i++) await tick(); }
const success = data => ({ status: 200, ok: true, json: async () => ({ code: 0, message: 'success', data }) });
const failure = (code, status = 409) => ({ status, ok: false, json: async () => ({ code, message: code, data: null }) });
const set = (id, status = 'ready') => ({ id, title: `题集 ${id}`, status, version: 2, publishCommercial: true });
function basic(url) {
  if (url.includes('/questions?')) return success({ questions: [], total: 0, nextCursor: null });
  if (url.includes('/question-bank/sets?')) return success({ sets: [set(5), set(6)], total: 2, nextCursor: null });
  if (url.endsWith('/question-bank/sets/5')) return success({ set: set(5), items: [{ position: 1, revisionId: 11, questionId: 1, stem: '题干' }] });
  if (url.endsWith('/question-bank/sets/6')) return success({ set: set(6), items: [{ position: 1, revisionId: 21, questionId: 2, stem: '第二题' }] });
  const match = /question-practice\/sets\/(\d+)\/publication$/.exec(url);
  if (match) return success({ publication: { setId: Number(match[1]), enabled: false, effectiveAvailable: false, availabilityReason: 'NOT_ENABLED', version: 0, changedBy: null, changedAt: null } });
  return success({});
}
function setup(handler = basic, permissions = ['questionBankPublish'], confirm = () => true) {
  const ids = new Map(Array.from(html.matchAll(/\bid="([^"]+)"/g), match => [match[1], new Node()]));
  const rights = ['stemDisplay','answerDisplay','imageDisplay','commercialUse','adaptation']; ids.get('claimForm').rights = rights.map(value => Object.assign(new Node('input'), { value }));
  let nextKey = 0; const calls = [];
  const context = { document: { getElementById: id => ids.get(id), createElement: tag => new Node(tag) },
    window: { ADMIN_API: '', crypto: { randomUUID: () => `publication-key-${++nextKey}` }, confirm, location: { search: '' } },
    initPage: (_id, _title, callback) => callback(), canAccess: permission => permissions.includes(permission), getToken: () => 'token', logout: () => {}, URLSearchParams,
    fetch: async (url, options = {}) => { calls.push({ url: String(url), options }); return handler(String(url), options); } };
  vm.runInNewContext(script, context, { filename: 'admin/js/question-bank.js' });
  return { ids, calls };
}
async function openSet(ids, index = 0) { await ids.get('setsTab').click(); await settle(); await ids.get('setList').children[index].click(); await settle(); }

test('internal ready is not public by default and only publishing admins can see the switch', async () => {
  assert.match(html, /内部 ready 不会自动公开/);
  assert.doesNotMatch(script, /innerHTML|insertAdjacentHTML/);
  const viewer = setup(basic, ['questionBankEdit']); await settle(); await openSet(viewer.ids);
  assert.equal(viewer.ids.get('freeWebSection').hidden, true);
  assert.equal(viewer.calls.some(call => call.url.includes('/question-practice/')), false);
  const publisher = setup(); await settle(); await openSet(publisher.ids);
  assert.equal(publisher.ids.get('freeWebSection').hidden, false);
  assert.equal(publisher.ids.get('freeWebStatus').textContent, '未开放免费网页');
  assert.equal(publisher.ids.get('toggleFreeWeb').textContent, '开放免费网页');
});

test('enable requires confirmation and sends a version-bound stable request', async () => {
  let attempts = 0;
  const { ids, calls } = setup((url, options) => {
    if (url.endsWith('/question-practice/sets/5/publication') && options.method === 'PUT') return ++attempts === 1 ? failure('NETWORK_LOST', 503) : success({ publication: { setId: 5, enabled: true, effectiveAvailable: true, version: 1 } });
    if (url.endsWith('/question-practice/sets/5/publication') && attempts > 1) return success({ publication: { setId: 5, enabled: true, effectiveAvailable: true, version: 1 } });
    return basic(url);
  });
  await settle(); await openSet(ids);
  await ids.get('toggleFreeWeb').click(); await settle();
  assert.match(ids.get('freeWebError').textContent, /NETWORK_LOST/);
  await ids.get('toggleFreeWeb').click(); await settle();
  const puts = calls.filter(call => call.url.endsWith('/question-practice/sets/5/publication') && call.options.method === 'PUT').map(call => JSON.parse(call.options.body));
  assert.equal(puts.length, 2); assert.deepEqual(puts[0], puts[1]);
  assert.deepEqual(puts[0], { clientKey: 'publication-key-1', enabled: true, expectedVersion: 0 });
  assert.equal(ids.get('freeWebStatus').textContent, '已开放免费网页（当前授权有效）');
});

test('version conflict refreshes status and does not replay an old publication key', async () => {
  let version = 0, enabled = false;
  const { ids, calls } = setup((url, options) => {
    if (url.endsWith('/question-practice/sets/5/publication') && options.method === 'PUT') { version = 1; enabled = true; return failure('PUBLICATION_VERSION_CONFLICT'); }
    if (url.endsWith('/question-practice/sets/5/publication')) return success({ publication: { setId: 5, enabled, effectiveAvailable: enabled, version, changedBy: '其他管理员', changedAt: '2026-10-21' } });
    return basic(url);
  });
  await settle(); await openSet(ids); await ids.get('toggleFreeWeb').click(); await settle();
  assert.match(ids.get('freeWebError').textContent, /已被其他管理员修改/);
  assert.equal(ids.get('freeWebStatus').textContent, '已开放免费网页（当前授权有效）');
  assert.equal(ids.get('toggleFreeWeb').textContent, '撤下免费网页');
  assert.equal(calls.filter(call => call.options.method === 'PUT').length, 1);
});

test('enabled switch reports live rights loss as hidden from the web', async () => {
  const { ids } = setup(url => url.endsWith('/question-practice/sets/5/publication') ? success({ publication: {
    setId: 5, enabled: true, effectiveAvailable: false, availabilityReason: 'PUBLIC_RIGHTS_UNAVAILABLE',
    version: 3, changedBy: '发布管理员', changedAt: '2026-10-21'
  } }) : basic(url));
  await settle(); await openSet(ids);
  assert.match(ids.get('freeWebStatus').textContent, /当前授权不可用，网页已隐藏/);
  assert.match(ids.get('freeWebAudit').textContent, /授权撤销、到期或来源状态/);
  assert.equal(ids.get('toggleFreeWeb').textContent, '撤下免费网页');
});

test('ready set published without commercial use explains why it cannot open on the web', async () => {
  const nonCommercial = { ...set(5), publishCommercial: false };
  const { ids, calls } = setup(url => url.endsWith('/question-bank/sets/5') ? success({ set: nonCommercial, items: [] }) : basic(url));
  await settle(); await openSet(ids);
  assert.match(ids.get('freeWebAudit').textContent, /未按商业使用发布/);
  assert.equal(ids.get('toggleFreeWeb').disabled, true);
  assert.equal(calls.filter(call => call.options.method === 'PUT').length, 0);
});

test('publication read failure leaves the action disabled and requests a refresh', async () => {
  const { ids } = setup(url => url.endsWith('/question-practice/sets/5/publication') ? failure('SERVICE_UNAVAILABLE', 503) : basic(url));
  await settle(); await openSet(ids);
  assert.equal(ids.get('freeWebStatus').textContent, '公开状态读取失败');
  assert.equal(ids.get('toggleFreeWeb').disabled, true);
  assert.match(ids.get('freeWebError').textContent, /刷新题集详情/);
});

test('late publication state from another set cannot replace the current set', async () => {
  let release; const delayed = new Promise(resolve => { release = resolve; });
  const { ids } = setup(url => url.endsWith('/question-practice/sets/5/publication') ? delayed : basic(url));
  await settle(); await ids.get('setsTab').click(); ids.get('setList').children[0].click(); await tick();
  await ids.get('setList').children[1].click(); await settle();
  release(success({ publication: { setId: 5, enabled: true, effectiveAvailable: true, version: 3, changedBy: '旧管理员' } })); await settle();
  assert.equal(ids.get('setHeading').textContent, '题集 6');
  assert.equal(ids.get('freeWebStatus').textContent, '未开放免费网页');
  assert.equal(ids.get('toggleFreeWeb').textContent, '开放免费网页');
});
