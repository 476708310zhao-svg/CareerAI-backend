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
async function settle() { for (let i = 0; i < 12; i++) await tick(); }
const flatten = node => [node, ...node.children.flatMap(child => child instanceof Node ? flatten(child) : [])];
const success = data => ({ status: 200, ok: true, json: async () => ({ code: 0, message: 'success', data }) });
const failure = (message, status = 400) => ({ status, ok: false, json: async () => ({ code: message, message, data: null }) });
const q1 = { id: 1, latestRevisionId: 11, revisionCount: 1 };
const q2 = { id: 2, latestRevisionId: 21, revisionCount: 1 };
const revision = (id, questionId = 1, stem = '题干') => ({ id, questionId, revisionNo: 1, createdAt: '2026-10-21', content: { type: 'single', stem, options: ['A','B','C','D'].map(letter => ({ id: letter, text: letter })), answer: ['A'], explanation: '解析' }, provenance: { kind: 'original', authorName: '作者', ownershipEvidence: '证据' }, media: [], contentReviewStatus: 'pending', rightsStatus: 'pending', contentReviews: [], rightsClaims: [] });
function basic(url) {
  if (url.includes('/questions?')) return success({ questions: [q1, q2], total: 2, nextCursor: null });
  if (url.endsWith('/questions/1')) return success({ question: q1, revisions: [revision(11)] });
  if (url.endsWith('/questions/2')) return success({ question: q2, revisions: [revision(21, 2, '第二题')] });
  if (url.includes('/sets?')) return success({ sets: [{ id: 5, title: '练习集', status: 'draft', version: 1 }], total: 1, nextCursor: null });
  if (url.endsWith('/sets/5')) return success({ set: { id: 5, title: '练习集', status: 'draft', version: 1 }, items: [{ position: 1, revisionId: 11, questionId: 1, stem: '题干' }] });
  return success({});
}
function setup(handler = basic, permissions = ['questionBankEdit', 'questionBankPublish', 'questionContentReview', 'questionRightsReview'], search = '') {
  const ids = new Map(Array.from(html.matchAll(/\bid="([^"]+)"/g), match => [match[1], new Node()]));
  const rights = ['stemDisplay','answerDisplay','imageDisplay','commercialUse','adaptation']; ids.get('claimForm').rights = rights.map(value => Object.assign(new Node('input'), { value }));
  let nextKey = 0; const calls = [];
  const context = { document: { getElementById: id => ids.get(id), createElement: tag => new Node(tag) }, window: { ADMIN_API: '', crypto: { randomUUID: () => `key-${++nextKey}` }, confirm: () => true, location: { search } },
    initPage: (_id, _title, callback) => callback(), canAccess: permission => permissions.includes(permission), getToken: () => 'token', logout: () => {}, URLSearchParams,
    fetch: async (url, options = {}) => { calls.push({ url: String(url), options }); return handler(String(url), options); } };
  vm.runInNewContext(script, context, { filename: 'admin/js/question-bank.js' });
  return { ids, calls, context };
}
const submit = node => node.listeners.submit({ preventDefault() {} });

test('new nav permission and dedicated page avoid public asset delivery', () => {
  const common = fs.readFileSync(path.join(root, 'admin/js/common.js'), 'utf8');
  assert.match(common, /id: 'questionBank', permissionsAny: \['questionBankEdit', 'questionBankPublish', 'questionContentReview', 'questionRightsReview'\]/);
  assert.doesNotMatch(html, /href="[^"]*\/uploads\/|<img[^>]+src=/);
  assert.doesNotMatch(script, /innerHTML|insertAdjacentHTML/);
});

test('saved OCR draft is fetched with admin auth and prefilled as PDF provenance without publishing', async () => {
  const sourceDraft = { id: 11, jobId: 3, pageNumber: 4, type: 'single', stem: '银行题干',
    options: ['A', 'B', 'C'].map(letter => ({ id: letter, text: `选项 ${letter}` })),
    answerOptionIds: ['B'], answerStatus: 'UNVERIFIED', explanation: '解析待核对' };
  const { ids, calls } = setup(url => {
    if (url.endsWith('/question-parsing/drafts/11')) return success({ draft: sourceDraft });
    if (url.endsWith('/question-parsing/jobs/3')) return success({ job: { id: 3, sourceId: 7 } });
    return basic(url);
  }, ['questionAssets', 'questionBankEdit'], '?draft=11');
  await settle();
  assert.equal(ids.get('stem').value, '银行题干');
  assert.equal(ids.get('sourceKind').value, 'pdf');
  assert.equal(ids.get('sourceId').value, '7');
  assert.match(ids.get('sourceEvidence').value, /OCR 草稿 #11，PDF 第 4 页/);
  assert.match(ids.get('draftImportNote').textContent, /答案尚未核实/);
  assert.ok(calls.some(call => call.url.endsWith('/question-parsing/drafts/11') && call.options.headers.Authorization === 'Bearer token'));
  assert.equal(calls.some(call => call.options.method === 'POST'), false);
});

test('revoked PDF rights prevent draft handoff from filling the bank form', async () => {
  const { ids, calls } = setup(url => url.endsWith('/question-parsing/drafts/11') ? failure('SOURCE_USE_DENIED', 403) : basic(url),
    ['questionAssets', 'questionBankEdit'], '?draft=11');
  await settle();
  assert.equal(ids.get('stem').value, '');
  assert.equal(ids.get('sourceKind').value, 'original');
  assert.match(ids.get('draftImportNote').textContent, /PDF 来源尚未满足/);
  assert.equal(calls.some(call => call.options.method === 'POST'), false);
});

test('question detail renders hostile text as text and keeps answers on admin page', async () => {
  const attack = '<img src=x onerror=alert(1)>';
  const { ids } = setup(url => url.endsWith('/questions/1') ? success({ question: q1, revisions: [revision(11, 1, attack)] }) : basic(url));
  await settle(); await ids.get('questionList').children[0].click(); await settle();
  const nodes = flatten(ids.get('questionSummary'));
  assert.ok(nodes.some(node => node.textContent === `题干：${attack}`));
  assert.ok(nodes.some(node => node.textContent === '正确答案：A'));
  assert.ok(!nodes.some(node => node.tagName === 'img'));
});

test('lost content review response retries with stable key and expected latest review', async () => {
  let attempts = 0; const { ids, calls } = setup((url, options) => {
    if (url.endsWith('/revisions/11/content-reviews') && options.method === 'POST') return ++attempts === 1 ? failure('连接断开', 503) : success({ contentReview: { id: 7 } });
    return basic(url);
  });
  await settle(); await ids.get('questionList').children[0].click(); await settle();
  ids.get('contentReason').value = '已核对'; ids.get('contentDecision').value = 'approved';
  await submit(ids.get('contentReviewForm')); await settle(); await submit(ids.get('contentReviewForm')); await settle();
  const bodies = calls.filter(call => call.url.endsWith('/revisions/11/content-reviews')).map(call => JSON.parse(call.options.body));
  assert.equal(bodies.length, 2); assert.deepEqual(bodies[0], bodies[1]); assert.equal(bodies[0].expectedLatestReviewId, null); assert.ok(bodies[0].clientKey);
});

test('six-option revision keeps all options when opened for editing', async () => {
  const six = revision(11); six.content.options = 'ABCDEF'.split('').map(letter => ({ id: letter, text: `选项 ${letter}` })); six.content.answer = ['A', 'F']; six.content.type = 'multiple';
  const { ids } = setup(url => url.endsWith('/questions/1') ? success({ question: q1, revisions: [six] }) : basic(url));
  await settle(); await ids.get('questionList').children[0].click(); await settle();
  assert.equal(ids.get('optionsList').children.length, 6);
  assert.equal(ids.get('optionsList').children[5].querySelector('input[type="text"]').value, '选项 F');
  assert.equal(ids.get('optionsList').children[5].querySelector('input[type="radio"],input[type="checkbox"]').checked, true);
});

test('new boolean question sends a boolean answer and retries with the same client key', async () => {
  let attempts = 0; const { ids, calls } = setup((url, options) => {
    if (url.endsWith('/questions') && options.method === 'POST') return ++attempts === 1 ? failure('响应丢失', 503) : success({ question: q1, revision: revision(11) });
    return basic(url);
  });
  await settle(); ids.get('questionType').value = 'boolean'; ids.get('questionType').listeners.change(); ids.get('stem').value = '判断题'; ids.get('explanation').value = '解析'; ids.get('booleanAnswer').value = 'false'; ids.get('authorName').value = '作者'; ids.get('ownershipEvidence').value = '内部编号';
  await submit(ids.get('questionForm')); await settle(); await submit(ids.get('questionForm')); await settle();
  const bodies = calls.filter(call => call.url.endsWith('/questions') && call.options.method === 'POST').map(call => JSON.parse(call.options.body));
  assert.equal(bodies.length, 2); assert.deepEqual(bodies[0], bodies[1]); assert.equal(bodies[0].content.answer, false); assert.equal(bodies[0].content.options, undefined);
});

test('stale question response cannot replace the newly selected question', async () => {
  let release; const delayed = new Promise(resolve => { release = resolve; });
  const { ids } = setup(url => url.endsWith('/questions/1') ? delayed : basic(url));
  await settle(); ids.get('questionList').children[0].click(); ids.get('questionList').children[1].click(); await settle();
  release(success({ question: q1, revisions: [revision(11)] })); await settle();
  assert.equal(ids.get('detailHeading').textContent, '题目 #2');
  assert.equal(ids.get('stem').value, '第二题');
});

test('set version conflict refreshes fixed server order before next edit', async () => {
  let version = 1; let attempts = 0;
  const { ids, calls } = setup((url, options) => {
    if (url.endsWith('/sets/5/items') && options.method === 'PUT') { attempts++; version = 2; return failure('SET_VERSION_CONFLICT', 409); }
    if (url.endsWith('/sets/5')) return success({ set: { id: 5, title: '练习集', status: 'draft', version }, items: [{ position: 1, revisionId: version === 1 ? 11 : 21, questionId: version === 1 ? 1 : 2, stem: '题干' }] });
    return basic(url);
  });
  await settle(); await ids.get('setsTab').click(); await ids.get('setList').children[0].click(); await settle();
  ids.get('addRevisionId').value = '31'; await submit(ids.get('addSetItemForm')); await ids.get('saveSetItems').click(); await settle();
  const body = JSON.parse(calls.find(call => call.url.endsWith('/sets/5/items')).options.body);
  assert.equal(body.expectedVersion, 1); assert.deepEqual(body.revisionIds, [11, 31]);
  assert.match(ids.get('setItemsError').textContent, /版本已变化/);
  assert.match(ids.get('setItems').children[0].children[0].textContent, /修订 #21/);
  assert.equal(attempts, 1);
});

test('set editor accepts several revision IDs at once and rejects duplicates without partial changes', async () => {
  const { ids, calls } = setup();
  await settle(); await ids.get('setsTab').click(); await ids.get('setList').children[0].click(); await settle();
  ids.get('addRevisionId').value = '31、#41, 51';
  await submit(ids.get('addSetItemForm'));
  assert.equal(ids.get('setItems').children.length, 4);
  ids.get('addRevisionId').value = '61 41';
  await submit(ids.get('addSetItemForm'));
  assert.equal(ids.get('setItems').children.length, 4);
  assert.match(ids.get('setItemsError').textContent, /重复 ID/);
  await ids.get('saveSetItems').click(); await settle();
  const body = JSON.parse(calls.find(call => call.url.endsWith('/sets/5/items')).options.body);
  assert.deepEqual(body.revisionIds, [11, 31, 41, 51]);
});
