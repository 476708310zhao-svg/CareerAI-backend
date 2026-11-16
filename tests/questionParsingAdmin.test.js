'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'admin/question-parsing.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'admin/js/question-parsing.js'), 'utf8');
class Node {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.listeners = {}; this.textContent = ''; this.value = ''; this.hidden = false; this.disabled = false; this.checked = false; this.attributes = {}; }
  append(...nodes) { nodes.forEach(node => { if (node instanceof Node) node.parent = this; }); this.children.push(...nodes); }
  replaceChildren(...nodes) { nodes.forEach(node => { if (node instanceof Node) node.parent = this; }); this.children = [...nodes]; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; delete this[name]; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this); }
  focus() { this.focused = true; }
  reset() { this.value = ''; }
  click() { return this.listeners.click && this.listeners.click({ preventDefault() {} }); }
}
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle() { for (let i = 0; i < 18; i++) await tick(); }
const flatten = item => [item, ...item.children.flatMap(child => child instanceof Node ? flatten(child) : [])];
const ok = data => ({ status: 200, ok: true, json: async () => ({ code: 0, message: 'success', data }) });
const fail = (code, status = 400) => ({ status, ok: false, json: async () => ({ code, message: code, data: null }) });
const job = (status = 'DONE') => ({ id: 3, sourceId: 7, assetSha256: 'a'.repeat(64), paperVersion: 'A 卷', territory: 'CN', commercial: false, status, reasonCode: status.startsWith('WAIT_') ? status : null, pageCount: 8, checkpointPage: 8, parserVersion: 'v1', createdAt: '2026-10-21', updatedAt: '2026-10-21' });
const draft = (id = 11, version = 1, stem = '示例题') => ({ id, jobId: 3, pageNumber: 1, sourcePages: [1], section: '一、单选题', questionNumber: id === 11 ? '1' : '2', type: 'single', stem, options: ['A', 'B', 'C'].map(letter => ({ id: letter, text: `选项 ${letter}` })), answerOptionIds: ['B'], answerStatus: 'VERIFIED', answerEvidence: { pageNumber: 1, text: '1.B', kind: 'inline' }, explanation: '解析', flags: [], version, status: 'pending_review', sourceBlocks: [{ pageNumber: 1, x: 11, y: 22, text: stem }] });
const crossPage = () => ({ ...draft(11), sourcePages: [1, 2], sourceBlocks: [
  { pageNumber: 1, x: 11, y: 22, text: '第一页题干' }, { pageNumber: 2, x: 33, y: 44, text: '第二页续题' }
] });
const png = { status: 200, ok: true, headers: { get: name => name === 'content-type' ? 'image/png' : null }, blob: async () => ({ size: 1024 }) };
function basic(url) {
  if (url.includes('/jobs?')) return ok({ jobs: [job()], total: 1, nextCursor: null });
  if (url.endsWith('/jobs/3')) return ok({ job: job() });
  if (url.includes('/jobs/3/drafts?')) return ok({ drafts: [draft(11), draft(12)], total: 2, nextCursor: null });
  if (url.endsWith('/drafts/11')) return ok({ draft: draft(11), edits: [] });
  if (url.endsWith('/drafts/12')) return ok({ draft: draft(12), edits: [] });
  if (url.endsWith('/jobs/3/pages/1')) return ok({ page: { text: '页级文本' } });
  if (url.includes('/preview')) return fail('PREVIEW_UNAVAILABLE', 503);
  return ok({});
}
function setup(handler = basic, permissions = ['questionAssets', 'questionBankEdit'], search = '') {
  const ids = new Map(Array.from(html.matchAll(/\bid="([^"]+)"/g), match => [match[1], new Node()]));
  ids.get('territory').value = 'CN';
  let nextKey = 0; const calls = []; const revoked = []; const documentListeners = {};
  const context = {
    document: { getElementById: id => ids.get(id), createElement: tag => new Node(tag),
      addEventListener: (name, listener) => { documentListeners[name] = listener; } },
    window: { ADMIN_API: '', crypto: { randomUUID: () => `key-${++nextKey}` }, confirm: () => true,
      location: { search }, URL: { createObjectURL: () => 'blob:test', revokeObjectURL: url => revoked.push(url) } },
    initPage: (_id, _title, callback) => callback(), canAccess: permission => permissions.includes(permission),
    getToken: () => 'admin-token', logout: () => {}, URLSearchParams,
    fetch: async (url, options = {}) => { calls.push({ url: String(url), options }); return handler(String(url), options); }
  };
  vm.runInNewContext(script, context, { filename: 'admin/js/question-parsing.js' });
  return { ids, calls, context, revoked, documentListeners };
}
const submit = item => item.listeners.submit({ preventDefault() {} });

test('batch promotion starts unchecked and sends only confirmed draft ids', async () => {
  const confirmed = { ...draft(11), review: { decision: 'confirmed', draftVersion: 1 }, promotion: null };
  const handler = (url, options) => {
    if (url.includes('/jobs/3/drafts?')) return ok({ drafts: [confirmed], total: 1,
      counts: { all: 1, priority: 0, candidate: 1 }, nextCursor: null });
    if (url.endsWith('/jobs/3/drafts/promotions') && options.method === 'POST') return ok({ promoted: [
      { draftId: 11, questionId: 21, revisionId: 31, alreadyPromoted: false }
    ] });
    return basic(url);
  };
  const { ids, calls } = setup(handler); await settle();
  ids.get('jobList').children[0].click(); await settle();
  assert.equal(ids.get('promotionPanel').hidden, false);
  const check = ids.get('promotionList').children[0].children[0];
  assert.equal(check.checked, false);
  await ids.get('promoteSelected').click(); await settle();
  assert.equal(calls.some(call => call.url.endsWith('/drafts/promotions')), false);
  check.checked = true; check.listeners.change();
  await ids.get('promoteSelected').click(); await settle();
  const sent = calls.find(call => call.url.endsWith('/jobs/3/drafts/promotions'));
  assert.ok(sent);
  assert.deepEqual(JSON.parse(sent.options.body), { draftIds: [11], clientKey: 'key-1' });
  assert.ok(ids.get('promotionResult').children.some(item => item.href === 'question-bank.html?question=21'));
});

test('human confirmation sends a separate version-bound review request after checking unsaved edits', async () => {
  const { ids, calls } = setup();
  await settle();
  ids.get('jobList').children[0].click(); await settle();
  ids.get('draftList').children[0].click(); await settle();
  ids.get('humanReviewNote').value = '核对第 1 页题目及答案';
  await ids.get('confirmDraft').click(); await settle();
  const review = calls.find(call => call.url.endsWith('/drafts/11/reviews') && call.options.method === 'POST');
  assert.ok(review);
  assert.deepEqual(JSON.parse(review.options.body), { expectedVersion: 1, expectedReviewId: null,
    decision: 'confirmed', reviewNote: '核对第 1 页题目及答案', clientKey: 'key-1' });
  assert.equal(calls.some(call => call.url.endsWith('/drafts/11') && call.options.method === 'PATCH'), false);
});

test('bulk confirmation starts unchecked and posts only individually selected candidates', async () => {
  const candidate = id => ({ ...draft(id), reviewTriage: { bucket: 'candidate', reasons: [] }, review: null });
  const handler = (url, options) => {
    if (url.includes('/jobs/3/drafts?')) return ok({ drafts: [candidate(11), candidate(12)], total: 2,
      counts: { all: 2, priority: 0, candidate: 2 }, nextCursor: null });
    if (url.endsWith('/jobs/3/drafts/reviews') && options.method === 'POST') return ok({ reviews: [] });
    return basic(url, options);
  };
  const { ids, calls } = setup(handler);
  await settle();
  ids.get('jobList').children[0].click(); await settle();
  ids.get('reviewFilter').value = 'candidate'; ids.get('reviewFilter').listeners.change(); await settle();
  assert.equal(ids.get('bulkReviewList').children.length, 2);
  const first = ids.get('bulkReviewList').children[0].children[0];
  assert.equal(first.checked, false);
  first.checked = true; first.listeners.change();
  ids.get('bulkReviewNote').value = '已逐题核对原页';
  await ids.get('bulkConfirm').click(); await settle();
  const review = calls.find(call => call.url.endsWith('/jobs/3/drafts/reviews') && call.options.method === 'POST');
  assert.ok(review);
  assert.deepEqual(JSON.parse(review.options.body).items, [{ draftId: 11, expectedVersion: 1, expectedReviewId: null }]);
});

test('private workbench has a permission-scoped nav and no public asset URL', () => {
  const common = fs.readFileSync(path.join(root, 'admin/js/common.js'), 'utf8');
  assert.match(common, /id: 'questionParsing', permission: 'questionAssets'/);
  assert.match(html, /仅限内部待审/);
  assert.doesNotMatch(html + script, /\/uploads\/|innerHTML|insertAdjacentHTML|<iframe/i);
  assert.match(script, /Authorization: `Bearer \$\{getToken\(\)\}`/);
});

test('OCR handoff pre-fills the source and paper without starting a job', async () => {
  const { ids, calls } = setup(basic, ['questionAssets'], '?source=7&paper=2026+%E9%93%B6%E8%A1%8C%E5%8D%B7');
  await settle();
  assert.equal(ids.get('sourceId').value, '7');
  assert.equal(ids.get('paperVersion').value, '2026 银行卷');
  assert.equal(calls.some(call => call.url.endsWith('/jobs') && call.options.method === 'POST'), false);
});

test('review handoff opens the newest task for its PDF source', async () => {
  const newest = { ...job('WAIT_REVIEW'), id: 6, sourceId: 7 };
  const handler = url => {
    if (url.includes('/jobs?')) return ok({ jobs: [{ ...job('WAIT_REVIEW'), id: 4, sourceId: 7 },
      { ...job('WAIT_REVIEW'), id: 5, sourceId: 8 }, newest], total: 3, nextCursor: null });
    if (url.endsWith('/jobs/6')) return ok({ job: newest });
    if (url.includes('/jobs/6/drafts?')) return ok({ drafts: [], total: 0, nextCursor: null });
    return basic(url);
  };
  const { ids, calls } = setup(handler, ['questionAssets'], '?source=7&review=1');
  await settle();
  assert.match(ids.get('jobHeading').textContent, /任务 #6/);
  assert.ok(calls.some(call => call.url.endsWith('/jobs/6')));
  assert.equal(calls.some(call => call.url.endsWith('/jobs') && call.options.method === 'POST'), false);
});

test('saved OCR draft links to an authenticated bank handoff and save advances to the next draft', async () => {
  const { ids, calls } = setup((url, options) => {
    if (url.endsWith('/drafts/11') && options.method === 'PATCH') return ok({ draft: draft(11, 2) });
    return basic(url);
  });
  await settle(); await ids.get('jobList').children[0].click(); await settle();
  await ids.get('draftList').children[0].click(); await settle();
  assert.equal(ids.get('draftToBank').href, 'question-bank.html?draft=11');
  ids.get('reviewNote').value = '已对照原页核对';
  await ids.get('saveAndNextDraft').click(); await settle();
  assert.equal(ids.get('draftHeading').textContent, '一、单选题 · 第 2 题');
  assert.ok(calls.some(call => call.url.endsWith('/drafts/11') && call.options.method === 'PATCH'));
  assert.match(ids.get('actionNotice').textContent, /题目仍未发布/);
});

test('server-filtered review queue clears the old draft and shows whole-job counts', async () => {
  const counts = { all: 2, priority: 1, candidate: 1, confirmed: 1, needs_repair: 1, excluded: 0 };
  const handler = url => {
    if (url.includes('/jobs/3/drafts?') && url.includes('filter=priority')) return ok({
      drafts: [{ ...draft(12), reviewTriage: { bucket: 'priority', reasons: ['MISSING_ANSWER'] } }],
      total: 1, counts, nextCursor: null });
    if (url.includes('/jobs/3/drafts?') && url.includes('filter=confirmed')) return ok({
      drafts: [{ ...draft(11), review: { decision: 'confirmed' } }], total: 1, counts, nextCursor: null });
    if (url.includes('/jobs/3/drafts?') && url.includes('filter=needs_repair')) return ok({
      drafts: [{ ...draft(12), review: { decision: 'needs_repair' } }], total: 1, counts, nextCursor: null });
    if (url.includes('/jobs/3/drafts?') && url.includes('filter=excluded')) return ok({
      drafts: [], total: 0, counts, nextCursor: null });
    if (url.includes('/jobs/3/drafts?')) return ok({ drafts: [draft(11), draft(12)], total: 2, counts, nextCursor: null });
    return basic(url);
  };
  const { ids, calls } = setup(handler);
  await settle(); await ids.get('jobList').children[0].click(); await settle();
  await ids.get('draftList').children[0].click(); await settle();
  ids.get('reviewFilter').value = 'priority'; ids.get('reviewFilter').listeners.change(); await settle();
  assert.equal(ids.get('draftDetailPanel').hidden, true);
  assert.equal(ids.get('draftStem').value, '');
  assert.equal(ids.get('draftList').children.length, 1);
  assert.match(ids.get('reviewCounts').textContent, /优先核对 1/);
  assert.ok(calls.some(call => call.url.includes('filter=priority')));
  for (const filter of ['confirmed', 'needs_repair', 'excluded']) {
    ids.get('reviewFilter').value = filter; ids.get('reviewFilter').listeners.change(); await settle();
    assert.ok(calls.some(call => call.url.includes(`filter=${filter}`)));
  }
  assert.equal(ids.get('draftList').children.length, 1);
  assert.match(ids.get('reviewCounts').textContent, /已确认 1 · 待修复 1 · 已排除 0/);
});

test('switching tasks preserves unsaved draft changes when cancelled', async () => {
  const secondJob = { ...job(), id: 4, paperVersion: 'B 卷' };
  const handler = url => {
    if (url.includes('/jobs?')) return ok({ jobs: [job(), secondJob], total: 2, nextCursor: null });
    if (url.endsWith('/jobs/4')) return ok({ job: secondJob });
    if (url.includes('/jobs/4/drafts?')) return ok({ drafts: [], total: 0, nextCursor: null });
    return basic(url);
  };
  const { ids, context, calls } = setup(handler);
  await settle(); await ids.get('jobList').children[0].click(); await settle();
  await ids.get('draftList').children[0].click(); await settle();
  ids.get('draftStem').value = '尚未保存的修改';
  let confirmations = 0;
  context.window.confirm = () => { confirmations++; return false; };
  await ids.get('jobList').children[1].click(); await settle();
  assert.equal(confirmations, 1);
  assert.equal(ids.get('draftStem').value, '尚未保存的修改');
  assert.equal(ids.get('draftDetailPanel').hidden, false);
  assert.equal(calls.some(call => call.url.endsWith('/jobs/4')), false);
  context.window.confirm = () => true;
  await ids.get('jobList').children[1].click(); await settle();
  assert.equal(ids.get('draftDetailPanel').hidden, true);
  assert.ok(calls.some(call => call.url.endsWith('/jobs/4')));
});

test('quick navigation ignores typing focus and zoom keeps the same private preview', async () => {
  const { ids, documentListeners, calls } = setup(url => url.includes('/preview') ? png : basic(url));
  await settle(); await ids.get('jobList').children[0].click(); await settle();
  await ids.get('draftList').children[0].click(); await settle();
  const typing = { key: ']', target: { tagName: 'TEXTAREA' }, preventDefault() { throw new Error('typing intercepted'); } };
  documentListeners.keydown(typing); await settle();
  assert.equal(ids.get('draftHeading').textContent, '一、单选题 · 第 1 题');
  let prevented = false;
  documentListeners.keydown({ key: ']', target: { tagName: 'DIV' }, preventDefault() { prevented = true; } });
  await settle();
  assert.equal(prevented, true);
  assert.equal(ids.get('draftHeading').textContent, '一、单选题 · 第 2 题');
  documentListeners.keydown({ key: '[', target: { tagName: 'DIV' }, preventDefault() {} });
  await settle();
  assert.equal(ids.get('draftHeading').textContent, '一、单选题 · 第 1 题');
  ids.get('togglePageZoom').click();
  assert.match(ids.get('sourcePageFrame').className, /is-expanded/);
  assert.equal(ids.get('togglePageZoom').attributes['aria-pressed'], 'true');
  assert.equal(calls.filter(call => call.url.includes('/preview')).length, 3);
});

test('next question loads the next server page in the selected review queue', async () => {
  const handler = url => {
    if (url.includes('/jobs/3/drafts?') && url.includes('cursor=11')) return ok({
      drafts: [draft(12)], total: 2, counts: { all: 2, priority: 2, candidate: 0 }, nextCursor: null });
    if (url.includes('/jobs/3/drafts?')) return ok({
      drafts: [draft(11)], total: 2, counts: { all: 2, priority: 2, candidate: 0 }, nextCursor: 11 });
    return basic(url);
  };
  const { ids, calls } = setup(handler);
  await settle(); await ids.get('jobList').children[0].click(); await settle();
  await ids.get('draftList').children[0].click(); await settle();
  await ids.get('nextDraft').click(); await settle();
  assert.equal(ids.get('draftHeading').textContent, '一、单选题 · 第 2 题');
  assert.ok(calls.some(call => call.url.includes('/jobs/3/drafts?') && call.url.includes('cursor=11')));
});

test('rights wait is visible and job creation retries with one stable client key', async () => {
  let creates = 0;
  const { ids, calls } = setup((url, options) => {
    if (url.endsWith('/jobs') && options.method === 'POST') return ++creates === 1 ? fail('NETWORK_LOST', 503) : ok({ job: { ...job('WAIT_RIGHTS'), reasonCode: 'MACHINE_PROCESSING_RIGHT_REQUIRED' } });
    if (url.endsWith('/jobs/3')) return ok({ job: { ...job('WAIT_RIGHTS'), reasonCode: 'MACHINE_PROCESSING_RIGHT_REQUIRED' } });
    return basic(url);
  });
  await settle(); ids.get('sourceId').value = '7'; ids.get('paperVersion').value = 'A 卷';
  await submit(ids.get('createJobForm')); await settle();
  await submit(ids.get('createJobForm')); await settle();
  const bodies = calls.filter(call => call.url.endsWith('/jobs') && call.options.method === 'POST').map(call => JSON.parse(call.options.body));
  assert.equal(bodies.length, 2); assert.deepEqual(bodies[0], bodies[1]);
  assert.equal(bodies[0].commercial, false); assert.equal(bodies[0].territory, 'CN');
  assert.ok(flatten(ids.get('jobSummary')).some(item => item.textContent.includes('等待机器处理授权')));
  assert.ok(flatten(ids.get('jobSummary')).some(item => item.textContent.includes('机器处理权')));
});

test('hostile PDF text is rendered as text and unavailable PNG shows explicit fallback', async () => {
  const attack = '<img src=x onerror=alert(1)>';
  const { ids, calls } = setup(url => url.endsWith('/drafts/11') ? ok({ draft: draft(11, 1, attack), edits: [] }) : basic(url));
  await settle(); await ids.get('jobList').children[0].click(); await settle();
  await ids.get('draftList').children[0].click(); await settle();
  assert.equal(ids.get('draftStem').value, attack);
  assert.ok(flatten(ids.get('evidenceList')).some(item => item.textContent.includes(attack)));
  assert.equal(ids.get('sourcePageImage').hidden, true);
  assert.match(ids.get('sourcePageFallback').textContent, /没有安全的原页渲染能力/);
  assert.ok(calls.some(call => call.url.endsWith('/jobs/3/pages/1')));
  assert.ok(calls.some(call => call.url.endsWith('/sources/7/pages/1/preview?jobId=3') && call.options.headers.Authorization === 'Bearer admin-token'));
});

test('successful private page preview uses a revocable blob URL without token in URL', async () => {
  const { ids, calls, revoked } = setup(url => url.includes('/preview') ? png : basic(url));
  await settle(); await ids.get('jobList').children[0].click(); await settle();
  await ids.get('draftList').children[0].click(); await settle();
  assert.equal(ids.get('sourcePageImage').src, 'blob:test');
  assert.equal(ids.get('sourcePageFallback').hidden, true);
  ids.get('draftList').children[1].click(); await settle();
  assert.ok(revoked.includes('blob:test'));
  assert.ok(calls.filter(call => call.url.includes('/preview')).every(call => !call.url.includes('admin-token') && call.options.headers.Authorization === 'Bearer admin-token'));
});

test('TC-008 cross-page draft switches both page evidence and private PNG to page two', async () => {
  const { ids, calls, revoked } = setup(url => {
    if (url.endsWith('/drafts/11')) return ok({ draft: crossPage(), edits: [] });
    if (url.endsWith('/jobs/3/pages/2')) return ok({ page: { pageNumber: 2, text: '第二页提取文本' } });
    if (url.includes('/preview')) return png;
    return basic(url);
  });
  await settle(); await ids.get('jobList').children[0].click(); await settle();
  await ids.get('draftList').children[0].click(); await settle();
  assert.equal(ids.get('sourcePagePicker').hidden, false);
  assert.equal(ids.get('sourcePageSelect').value, '1');
  ids.get('sourcePageSelect').value = '2'; ids.get('sourcePageSelect').listeners.change(); await settle();
  assert.ok(calls.some(call => call.url.endsWith('/jobs/3/pages/2')));
  assert.ok(calls.some(call => call.url.endsWith('/sources/7/pages/2/preview?jobId=3')));
  assert.match(ids.get('sourcePageImage').alt, /第 2 页/);
  assert.ok(flatten(ids.get('evidenceList')).some(item => item.textContent.includes('第二页提取文本')));
  assert.ok(!flatten(ids.get('evidenceList')).some(item => item.textContent.includes('第一页题干')));
  assert.ok(revoked.includes('blob:test'));
});

test('end-of-paper answer evidence page is selectable even when question spans only page one', async () => {
  const source = { ...draft(11), answerEvidence: { pageNumber: 8, text: '1.C 2.C', kind: 'answer_key' } };
  const { ids, calls } = setup(url => {
    if (url.endsWith('/drafts/11')) return ok({ draft: source, edits: [] });
    if (url.endsWith('/jobs/3/pages/8')) return ok({ page: { pageNumber: 8, text: '文末答案表 1.C' } });
    if (url.includes('/preview')) return png;
    return basic(url);
  });
  await settle(); await ids.get('jobList').children[0].click(); await settle();
  await ids.get('draftList').children[0].click(); await settle();
  assert.equal(ids.get('sourcePagePicker').hidden, false);
  assert.equal(ids.get('sourcePageSelect').children[1].textContent, '第 8 页 · 答案证据页');
  ids.get('sourcePageSelect').value = '8'; ids.get('sourcePageSelect').listeners.change(); await settle();
  assert.ok(calls.some(call => call.url.endsWith('/jobs/3/pages/8')));
  assert.ok(calls.some(call => call.url.endsWith('/sources/7/pages/8/preview?jobId=3')));
  assert.match(ids.get('sourcePageImage').alt, /第 8 页/);
});

test('CASE05 conflicting answer candidates remain unselected and both evidence pages can be reviewed', async () => {
  const source = { ...draft(11), answerStatus: 'ANSWER_UNCERTAIN', answerOptionIds: [], answerEvidence: null,
    flags: ['CONFLICTING_ANSWER', 'GRAPHIC_CONTENT_UNVERIFIED'], answerEvidenceCandidates: [
      { kind: 'inline', choices: ['C'], pageNumber: 1, text: '答案：C' },
      { kind: 'answer_key', choices: ['B'], pageNumber: 3, text: '答案表 1.B' }
    ] };
  const { ids, calls } = setup(url => {
    if (url.endsWith('/drafts/11')) return ok({ draft: source, edits: [] });
    if (url.endsWith('/jobs/3/pages/3')) return ok({ page: { pageNumber: 3, text: '答案表 1.B' } });
    if (url.includes('/preview')) return png;
    return basic(url);
  });
  await settle(); await ids.get('jobList').children[0].click(); await settle();
  await ids.get('draftList').children[0].click(); await settle();
  assert.equal(ids.get('draftOptions').children.filter(row => row.children[1].checked).length, 0);
  assert.equal(ids.get('sourcePageSelect').children[1].textContent, '第 3 页 · 候选答案页');
  const evidence = flatten(ids.get('evidenceList')).map(item => item.textContent).join('\n');
  assert.match(evidence, /候选 C · 答案：C/); assert.match(evidence, /候选 B · 答案表 1\.B/);
  assert.match(flatten(ids.get('draftWarnings')).map(item => item.textContent).join(''), /图形内容未核实/);
  ids.get('sourcePageSelect').value = '3'; ids.get('sourcePageSelect').listeners.change(); await settle();
  assert.ok(calls.some(call => call.url.endsWith('/jobs/3/pages/3')));
  assert.ok(calls.some(call => call.url.endsWith('/sources/7/pages/3/preview?jobId=3')));
  assert.equal(ids.get('draftOptions').children.filter(row => row.children[1].checked).length, 0);
});

test('rights revoked during draft list refresh removes old answer, text and PNG', async () => {
  let reads = 0;
  const { ids, revoked } = setup(url => {
    if (url.includes('/jobs/3/drafts?')) return ++reads === 1 ? basic(url) : fail('SOURCE_USE_DENIED', 403);
    if (url.includes('/preview')) return png;
    return basic(url);
  });
  await settle(); await ids.get('jobList').children[0].click(); await settle();
  await ids.get('draftList').children[0].click(); await settle();
  assert.equal(ids.get('sourcePageImage').hidden, false);
  await ids.get('refreshDrafts').click(); await settle();
  assert.equal(ids.get('draftStem').value, ''); assert.equal(ids.get('draftOptions').children.length, 0);
  assert.equal(ids.get('evidenceList').children.length, 0); assert.equal(ids.get('sourcePageImage').hidden, true);
  assert.equal(ids.get('jobMeta').textContent, ''); assert.equal(ids.get('jobList').children.length, 1);
  assert.ok(revoked.includes('blob:test'));
});

test('administrator asset permission removed during job refresh clears current draft and PNG', async () => {
  let reads = 0;
  const { ids, revoked } = setup(url => {
    if (url.includes('/jobs?')) return ++reads === 1 ? basic(url) : fail('PERMISSION_DENIED', 403);
    if (url.includes('/preview')) return png;
    return basic(url);
  });
  await settle(); await ids.get('jobList').children[0].click(); await settle();
  await ids.get('draftList').children[0].click(); await settle();
  assert.equal(ids.get('sourcePageImage').hidden, false);
  await ids.get('refreshJobs').click(); await settle();
  assert.equal(ids.get('draftStem').value, ''); assert.equal(ids.get('draftOptions').children.length, 0);
  assert.equal(ids.get('evidenceList').children.length, 0); assert.equal(ids.get('sourcePageImage').hidden, true);
  assert.ok(revoked.includes('blob:test'));
});

test('administrator asset permission removed during job detail refresh clears current draft', async () => {
  let reads = 0;
  const { ids, revoked } = setup(url => {
    if (url.endsWith('/jobs/3')) return ++reads === 1 ? basic(url) : fail('PERMISSION_DENIED', 403);
    if (url.includes('/preview')) return png;
    return basic(url);
  });
  await settle(); await ids.get('jobList').children[0].click(); await settle();
  await ids.get('draftList').children[0].click(); await settle();
  await ids.get('refreshJob').click(); await settle();
  assert.equal(ids.get('draftStem').value, ''); assert.equal(ids.get('evidenceList').children.length, 0);
  assert.equal(ids.get('sourcePageImage').hidden, true); assert.ok(revoked.includes('blob:test'));
});

test('rights revoked on the next page evidence clears old content and ignores late PNG', async () => {
  let release; const latePreview = new Promise(resolve => { release = resolve; });
  const { ids, revoked } = setup(url => {
    if (url.endsWith('/drafts/11')) return ok({ draft: crossPage(), edits: [] });
    if (url.endsWith('/jobs/3/pages/2')) return fail('SOURCE_USE_DENIED', 403);
    if (url.includes('/pages/2/preview')) return latePreview;
    if (url.includes('/preview')) return png;
    return basic(url);
  });
  await settle(); await ids.get('jobList').children[0].click(); await settle();
  await ids.get('draftList').children[0].click(); await settle();
  ids.get('sourcePageSelect').value = '2'; ids.get('sourcePageSelect').listeners.change(); await settle();
  release(png); await settle();
  assert.equal(ids.get('draftStem').value, ''); assert.equal(ids.get('evidenceList').children.length, 0);
  assert.equal(ids.get('sourcePageImage').hidden, true); assert.ok(revoked.includes('blob:test'));
});

test('rights revoked by page preview removes text and answer despite valid text response', async () => {
  const { ids, revoked } = setup(url => {
    if (url.endsWith('/drafts/11')) return ok({ draft: crossPage(), edits: [] });
    if (url.includes('/pages/2/preview')) return fail('SOURCE_USE_DENIED', 403);
    if (url.includes('/preview')) return png;
    return basic(url);
  });
  await settle(); await ids.get('jobList').children[0].click(); await settle();
  await ids.get('draftList').children[0].click(); await settle();
  ids.get('sourcePageSelect').value = '2'; ids.get('sourcePageSelect').listeners.change(); await settle();
  assert.equal(ids.get('draftStem').value, ''); assert.equal(ids.get('draftOptions').children.length, 0);
  assert.equal(ids.get('evidenceList').children.length, 0); assert.equal(ids.get('sourcePageImage').hidden, true);
  assert.ok(revoked.includes('blob:test'));
});

test('stale draft response cannot replace a newer selection', async () => {
  let release;
  const delayed = new Promise(resolve => { release = resolve; });
  const { ids } = setup(url => url.endsWith('/drafts/11') ? delayed : basic(url));
  await settle(); await ids.get('jobList').children[0].click(); await settle();
  ids.get('draftList').children[0].click(); ids.get('draftList').children[1].click(); await settle();
  release(ok({ draft: draft(11, 1, '过期内容'), edits: [] })); await settle();
  assert.equal(ids.get('draftHeading').textContent, '一、单选题 · 第 2 题');
  assert.equal(ids.get('draftStem').value, '示例题');
});

test('denied next draft clears previously displayed protected fields', async () => {
  const { ids } = setup(url => url.endsWith('/drafts/12') ? fail('SOURCE_USE_DENIED', 403) : basic(url));
  await settle(); await ids.get('jobList').children[0].click(); await settle();
  await ids.get('draftList').children[0].click(); await settle();
  assert.equal(ids.get('draftStem').value, '示例题');
  await ids.get('draftList').children[1].click(); await settle();
  assert.equal(ids.get('draftStem').value, '');
  assert.equal(ids.get('draftOptions').children.length, 0);
  assert.equal(ids.get('evidenceList').children.length, 0);
  assert.equal(ids.get('sourcePageImage').hidden, true);
  assert.match(ids.get('draftDetailError').textContent, /有效授权/);
});

test('edit submits full fields with expected version and conflict reloads current draft', async () => {
  let currentVersion = 1;
  const { ids, calls } = setup((url, options) => {
    if (url.endsWith('/drafts/11') && options.method === 'PATCH') { currentVersion = 2; return fail('DRAFT_VERSION_CONFLICT', 409); }
    if (url.endsWith('/drafts/11')) return ok({ draft: draft(11, currentVersion, currentVersion === 2 ? '他人修订' : '示例题'), edits: [] });
    return basic(url);
  });
  await settle(); await ids.get('jobList').children[0].click(); await settle();
  await ids.get('draftList').children[0].click(); await settle();
  ids.get('draftStem').value = '我修订的题'; ids.get('reviewNote').value = '对照第 1 页';
  await submit(ids.get('draftForm')); await settle();
  const body = JSON.parse(calls.find(call => call.url.endsWith('/drafts/11') && call.options.method === 'PATCH').options.body);
  assert.equal(body.expectedVersion, 1); assert.equal(body.stem, '我修订的题');
  assert.deepEqual(body.answerOptionIds, ['B']); assert.equal(body.reviewNote, '对照第 1 页');
  assert.equal(ids.get('draftStem').value, '他人修订');
  assert.match(ids.get('saveError').textContent, /其他管理员修订/);
});

test('reviewer can repair a missing option without altering the source evidence', async () => {
  const { ids, calls } = setup((url, options) => {
    if (url.endsWith('/drafts/11') && options.method === 'PATCH') return ok({ draft: draft(11, 2) });
    return basic(url);
  });
  await settle(); await ids.get('jobList').children[0].click(); await settle();
  await ids.get('draftList').children[0].click(); await settle();
  await ids.get('addDraftOption').click();
  assert.equal(ids.get('draftOptions').children.length, 4);
  ids.get('draftOptions').children[3].children[2].value = '补录 D';
  ids.get('reviewNote').value = '对照原件第 1 页补录选项';
  await submit(ids.get('draftForm')); await settle();
  const body = JSON.parse(calls.find(call => call.url.endsWith('/drafts/11') && call.options.method === 'PATCH').options.body);
  assert.equal(body.options[3].id, 'D'); assert.equal(body.options[3].text, '补录 D');
  assert.equal(body.answerOptionIds[0], 'B');
});

test('asset-only reviewer sees read-only draft; editor with both permissions can save', async () => {
  const readonly = setup(basic, ['questionAssets']);
  await settle(); await readonly.ids.get('jobList').children[0].click(); await settle();
  await readonly.ids.get('draftList').children[0].click(); await settle();
  assert.equal(readonly.ids.get('draftForm').hidden, false);
  assert.equal(readonly.ids.get('draftStem').disabled, true);
  assert.equal(readonly.ids.get('saveDraft').hidden, true);
  const editor = setup(basic, ['questionAssets', 'questionBankEdit']);
  await settle(); await editor.ids.get('jobList').children[0].click(); await settle();
  await editor.ids.get('draftList').children[0].click(); await settle();
  assert.equal(editor.ids.get('draftForm').hidden, false);
});
