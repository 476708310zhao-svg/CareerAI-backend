'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'admin/question-governance.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'admin/js/question-governance.js'), 'utf8');

class Node {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.listeners = {}; this.textContent = ''; this.value = ''; this.hidden = false; this.disabled = false; this.checked = false; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  setAttribute(name, value) { this[name] = value; }
  querySelectorAll(selector) { return selector === 'input[name="right"]' ? this.inputs || [] : []; }
  reset() { this.value = ''; }
  click() { if (this.listeners.click) return this.listeners.click({ preventDefault() {} }); }
}
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle() { for (let i = 0; i < 9; i++) await tick(); }
const flatten = node => [node, ...node.children.flatMap(child => child instanceof Node ? flatten(child) : [])];
const success = data => ({ status: 200, ok: true, json: async () => ({ code: 0, message: 'ok', data }) });
const failure = (message, status = 400) => ({ status, ok: false, json: async () => ({ code: -1, message, data: null }) });
const defaultSource = { id: 4, batchId: 2, originalFilename: 'paper.pdf', sourceReference: '合同 1', status: 'quarantined', validationStatus: 'pending', scanStatus: 'pending', createdBy: 'uploader' };
const detail = overrides => ({ source: defaultSource, claims: [], contentReviews: [], effectiveRights: { evaluated: true, rights: {}, usable: {}, coverage: {}, contentReviewStatus: 'pending', validationStatus: 'pending', scanStatus: 'pending' }, ...overrides });
function setup(handler, permissions = ['questionAssets'], initial = 'http://localhost/admin/question-governance.html') {
  const ids = new Map(Array.from(html.matchAll(/\bid="([^"]+)"/g), match => [match[1], new Node()]));
  const rights = ['internalStorage', 'machineProcessing', 'thirdPartyProcessing', 'stemDisplay', 'imageDisplay', 'answerDisplay', 'commercialUse', 'adaptation'];
  ids.get('claimForm').inputs = rights.map(value => Object.assign(new Node('input'), { value }));
  const calls = []; let currentUrl = initial; let nextKey = 0;
  const context = {
    document: { getElementById: id => ids.get(id), createElement: tag => new Node(tag) },
    window: { ADMIN_API: '', crypto: { randomUUID: () => `draft-key-${++nextKey}` }, confirm: () => true,
      location: { get href() { return currentUrl; }, get search() { return new URL(currentUrl).search; } },
      history: { replaceState: (_state, _title, next) => { currentUrl = String(next); } } },
    initPage: (_id, _title, callback) => callback(), canAccess: permission => permissions.includes(permission),
    getToken: () => 'admin-token', logout: () => {}, URL, URLSearchParams,
    fetch: async (url, options = {}) => { calls.push({ url: String(url), options }); return handler(String(url), options); }
  };
  vm.runInNewContext(script, context, { filename: 'admin/js/question-governance.js' });
  return { ids, calls, context };
}
function basicHandler(url) {
  if (url.includes('/sources?')) return success({ sources: [defaultSource], total: 1, nextCursor: null });
  if (url.includes('/sources/4?')) return success(detail());
  return success({});
}
const submit = node => node.listeners.submit({ preventDefault() {} });

test('governance navigation admits any review permission and HTML has no original URL', () => {
  const common = fs.readFileSync(path.join(root, 'admin/js/common.js'), 'utf8');
  assert.match(common, /id: 'questionGovernance', permissionsAny: \['questionAssets', 'questionRightsReview', 'questionContentReview'\]/);
  assert.match(common, /permissionsAny\.some\(canAccess\)/);
  assert.doesNotMatch(html, /href="[^"]*\/uploads\//);
});

test('authorized source offers direct OCR handoff while pending rights stay on review step', async () => {
  const ready = detail({ source: { ...defaultSource, originalFilename: '2026 银行卷.pdf', validationStatus: 'valid', scanStatus: 'clean' },
    effectiveRights: { usable: { machineProcessing: true } } });
  const opened = setup(url => url.includes('/sources/4?') ? success(ready) : basicHandler(url),
    ['questionAssets'], 'http://localhost/admin/question-governance.html?source=4');
  await settle();
  const link = flatten(opened.ids.get('nextStep')).find(item => item.tagName === 'a');
  assert.ok(link);
  assert.equal(new URL(link.href, 'http://localhost/admin/').searchParams.get('source'), '4');
  assert.equal(new URL(link.href, 'http://localhost/admin/').searchParams.get('paper'), '2026 银行卷');
  const pending = setup(url => url.includes('/sources/4?') ? success(detail({ source: { ...defaultSource, validationStatus: 'valid', scanStatus: 'clean' },
    claims: [{ id: 8, status: 'pending', rights: { machineProcessing: true } }] })) : basicHandler(url),
  ['questionAssets'], 'http://localhost/admin/question-governance.html?source=4');
  await settle();
  assert.equal(flatten(pending.ids.get('nextStep')).some(item => item.tagName === 'a'), false);
  assert.match(pending.ids.get('nextStep').children[1].textContent, /等待/);
  const local = setup(url => url.includes('/sources/4?') ? success(detail({ source: { ...defaultSource, validationStatus: 'valid', scanStatus: 'clean' },
    localSingleReviewEnabled: true, claims: [{ id: 9, status: 'pending', rights: { machineProcessing: true } }] })) : basicHandler(url),
  ['questionAssets', 'questionRightsReview'], 'http://localhost/admin/question-governance.html?source=4');
  await settle();
  assert.match(local.ids.get('nextStep').children[1].textContent, /本地单人测试/);
  assert.ok(flatten(local.ids.get('claimList')).some(item => item.textContent === '本地确认机器处理'));
});

test('viewer sees safe source text and no authoring forms', async () => {
  const attack = '<img src=x onerror=alert(1)>';
  const { ids } = setup(url => {
    if (url.includes('/sources?')) return success({ sources: [{ ...defaultSource, originalFilename: attack, sourceReference: attack }], total: 1, nextCursor: null });
    if (url.includes('/sources/4?')) return success(detail({ source: { ...defaultSource, originalFilename: attack, sourceReference: attack } }));
    return success({});
  }, ['questionContentReview']);
  await settle();
  ids.get('sourceList').children[0].click(); await settle();
  assert.equal(ids.get('claimForm').hidden, true);
  assert.equal(ids.get('contentForm').hidden, false);
  assert.equal(ids.get('statusSummary').children[0].textContent, `${attack} · 来源 #4`);
  assert.equal(flatten(ids.get('statusSummary')).some(node => node.tagName === 'img'), false);
  assert.match(ids.get('statusSummary').children[3].textContent, /同一份有效声明/);
});

test('commercial display coverage stays denied when rights are split across claims', async () => {
  const effectiveRights = { evaluated: true,
    rights: { stemDisplay: true, commercialUse: true }, usable: { stemDisplay: false, commercialUse: false },
    coverage: { freeStemDisplay: true, commercialStemDisplay: false }, contentReviewStatus: 'pending' };
  const { ids } = setup(url => url.includes('/sources/4?') ? success(detail({ effectiveRights })) : basicHandler(url));
  await settle(); ids.get('sourceList').children[0].click(); await settle();
  const labels = flatten(ids.get('statusSummary')).map(node => node.textContent);
  assert.ok(labels.includes('免费题干展示：是'));
  assert.ok(labels.includes('商业题干展示：否'));
  assert.ok(labels.includes('商业访问：是'));
  assert.match(labels.join(' '), /单项权利汇总（不可跨声明拼接）/);
});

test('claim submission is pending and retries with the same client key after network failure', async () => {
  let attempts = 0;
  const { ids, calls } = setup((url, options) => {
    if (url.endsWith('/sources/4/claims') && options.method === 'POST') return ++attempts === 1 ? failure('网络稍后重试', 503) : success({ claim: { id: 9, status: 'pending' } });
    return basicHandler(url);
  });
  await settle(); ids.get('sourceList').children[0].click(); await settle();
  ids.get('evidenceReference').value = '授权函 A';
  ids.get('validFrom').value = '2026-10-01'; ids.get('validUntil').value = '2027-10-01'; ids.get('territory').value = 'CN';
  ids.get('claimForm').inputs.find(input => input.value === 'internalStorage').checked = true;
  await submit(ids.get('claimForm')); await settle();
  assert.match(ids.get('claimError').textContent, /网络稍后重试/);
  await submit(ids.get('claimForm')); await settle();
  const bodies = calls.filter(call => call.url.endsWith('/sources/4/claims')).map(call => JSON.parse(call.options.body));
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].clientKey, bodies[1].clientKey);
  assert.equal(bodies[0].rights.internalStorage, true);
  assert.equal(bodies[0].rights.stemDisplay, false);
  assert.equal(bodies[0].decision, undefined);
  assert.equal(calls.some(call => call.url.includes('/decision')), false);
});

test('rights reviewer decides a claim with reason, content reviewer uses a separate endpoint', async () => {
  const claim = { id: 9, sourceId: 4, evidenceReference: '合同', status: 'pending', rights: { internalStorage: true }, territories: ['CN'], validFrom: '2026-10-01', validUntil: '2027-10-01', submittedBy: 'uploader' };
  const { ids, calls } = setup((url, options) => {
    if (url.includes('/sources/4?')) return success(detail({ claims: [claim] }));
    return basicHandler(url);
  }, ['questionRightsReview', 'questionContentReview']);
  await settle(); ids.get('sourceList').children[0].click(); await settle();
  const card = ids.get('claimList').children[0];
  const form = card.children.find(child => child.className === 'gov-decision');
  form.children[0].children[0].value = '证据核验完成';
  await form.children[1].children[0].click(); await settle();
  const decision = calls.find(call => call.url.endsWith('/claims/9/decision'));
  assert.ok(decision);
  assert.deepEqual(JSON.parse(decision.options.body), { decision: 'approved', reason: '证据核验完成' });
  ids.get('contentDecision').value = 'rejected'; ids.get('contentReason').value = '内容缺失';
  await submit(ids.get('contentForm')); await settle();
  const content = calls.find(call => call.url.endsWith('/sources/4/content-reviews'));
  assert.deepEqual(JSON.parse(content.options.body), {
    decision: 'rejected', reason: '内容缺失', clientKey: 'draft-key-1', expectedLatestReviewId: null
  });
  assert.equal(ids.get('claimForm').hidden, true);
});

test('lost content review response retries with the same key and expected review version', async () => {
  let attempts = 0;
  const latest = { id: 8, decision: 'rejected', reason: '较早审核', reviewer: 'reviewer' };
  const { ids, calls } = setup((url, options) => {
    if (url.endsWith('/sources/4/content-reviews') && options.method === 'POST') {
      return ++attempts === 1 ? failure('网络响应丢失', 503) : success({ review: { id: 9, decision: 'rejected' } });
    }
    if (url.includes('/sources/4?')) return success(detail({ contentReviews: [latest] }));
    return basicHandler(url);
  }, ['questionContentReview']);
  await settle(); ids.get('sourceList').children[0].click(); await settle();
  ids.get('contentDecision').value = 'rejected'; ids.get('contentReason').value = '缺少题干';
  await submit(ids.get('contentForm')); await settle();
  assert.match(ids.get('contentError').textContent, /网络响应丢失/);
  await submit(ids.get('contentForm')); await settle();
  const bodies = calls.filter(call => call.url.endsWith('/sources/4/content-reviews'))
    .map(call => JSON.parse(call.options.body));
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies[0], bodies[1]);
  assert.equal(bodies[0].expectedLatestReviewId, 8);
  assert.ok(bodies[0].clientKey);
});

test('stale content review conflict refreshes latest version before another submit', async () => {
  let attempts = 0;
  let latestId = 8;
  const { ids, calls } = setup((url, options) => {
    if (url.endsWith('/sources/4/content-reviews') && options.method === 'POST') {
      if (++attempts === 1) { latestId = 9; return failure('CONTENT_REVIEW_STALE', 409); }
      return success({ review: { id: 10, decision: 'rejected' } });
    }
    if (url.includes('/sources/4?')) return success(detail({ contentReviews: [{ id: latestId, decision: 'rejected', reason: '并发审核' }] }));
    return basicHandler(url);
  }, ['questionContentReview']);
  await settle(); ids.get('sourceList').children[0].click(); await settle();
  ids.get('contentDecision').value = 'rejected'; ids.get('contentReason').value = '缺少题干';
  await submit(ids.get('contentForm')); await settle();
  assert.match(ids.get('contentError').textContent, /已有更新的内容审核记录/);
  assert.ok(flatten(ids.get('contentReviewList')).some(node => node.textContent === '审核 #9 · —'));
  await submit(ids.get('contentForm')); await settle();
  const bodies = calls.filter(call => call.url.endsWith('/sources/4/content-reviews'))
    .map(call => JSON.parse(call.options.body));
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].expectedLatestReviewId, 8);
  assert.equal(bodies[1].expectedLatestReviewId, 9);
  assert.notEqual(bodies[0].clientKey, bodies[1].clientKey);
});

test('pending PDF cannot be marked content approved from the page', async () => {
  const { ids, calls } = setup(basicHandler, ['questionContentReview']);
  await settle(); ids.get('sourceList').children[0].click(); await settle();
  assert.equal(ids.get('contentApproveOption').disabled, true);
  assert.match(ids.get('contentGate').textContent, /深度校验和病毒扫描/);
  ids.get('contentDecision').value = 'approved'; ids.get('contentReason').value = '通过';
  await submit(ids.get('contentForm')); await settle();
  assert.equal(calls.some(call => call.url.endsWith('/content-reviews')), false);
  assert.match(ids.get('contentError').textContent, /不能记录通过/);
});

test('stale source response cannot replace the selected source', async () => {
  let release;
  const delayed = new Promise(resolve => { release = resolve; });
  const second = { ...defaultSource, id: 5, originalFilename: 'second.pdf' };
  const { ids } = setup(url => {
    if (url.includes('/sources?')) return success({ sources: [defaultSource, second], total: 2, nextCursor: null });
    if (url.includes('/sources/4?')) return delayed;
    if (url.includes('/sources/5?')) return success(detail({ source: second }));
    return success({});
  });
  await settle();
  ids.get('sourceList').children[0].click();
  ids.get('sourceList').children[1].click(); await settle();
  release(success(detail())); await settle();
  assert.match(ids.get('statusSummary').children[0].textContent, /second\.pdf/);
  assert.equal(ids.get('detailHeading').textContent, '来源 #5');
});

test('an old claim response cannot clear or overwrite the newly selected source', async () => {
  let release;
  const delayed = new Promise(resolve => { release = resolve; });
  const second = { ...defaultSource, id: 5, originalFilename: 'second.pdf' };
  const { ids } = setup((url, options) => {
    if (url.includes('/sources?')) return success({ sources: [defaultSource, second], total: 2, nextCursor: null });
    if (url.includes('/sources/4?')) return success(detail());
    if (url.includes('/sources/5?')) return success(detail({ source: second }));
    if (url.endsWith('/sources/4/claims') && options.method === 'POST') return delayed;
    return success({});
  });
  await settle(); ids.get('sourceList').children[0].click(); await settle();
  ids.get('evidenceReference').value = '授权函'; ids.get('validFrom').value = '2026-10-01';
  ids.get('validUntil').value = '2027-10-01'; ids.get('territory').value = 'CN';
  ids.get('claimForm').inputs[0].checked = true;
  const pending = submit(ids.get('claimForm'));
  ids.get('sourceList').children[1].click(); await settle();
  release(success({ claim: { id: 30, status: 'pending' } })); await pending; await settle();
  assert.match(ids.get('statusSummary').children[0].textContent, /second\.pdf/);
  assert.equal(ids.get('actionNotice').hidden, true);
  assert.equal(ids.get('detailHeading').textContent, '来源 #5');
});

test('older claim and content audit records load through their separate cursors', async () => {
  const claims = [{ id: 3, status: 'rejected', evidenceReference: '近', rights: {} }, { id: 2, status: 'approved', evidenceReference: '中', rights: {} }];
  const reviews = [{ id: 8, decision: 'rejected', reason: '近' }, { id: 7, decision: 'rejected', reason: '中' }];
  const { ids, calls } = setup(url => {
    if (url.includes('/sources/4/claims?')) return success({ items: [{ id: 1, status: 'revoked', evidenceReference: '旧', rights: {} }], total: 3, nextCursor: null });
    if (url.includes('/sources/4/content-reviews?')) return success({ items: [{ id: 6, decision: 'rejected', reason: '旧' }], total: 3, nextCursor: null });
    if (url.includes('/sources/4?')) return success(detail({ claims, claimsTotal: 3, contentReviews: reviews, contentReviewsTotal: 3 }));
    return basicHandler(url);
  }, ['questionRightsReview']);
  await settle(); ids.get('sourceList').children[0].click(); await settle();
  assert.equal(ids.get('moreClaims').hidden, false);
  assert.equal(ids.get('moreContent').hidden, false);
  await ids.get('moreClaims').click(); await ids.get('moreContent').click(); await settle();
  assert.equal(ids.get('claimList').children.length, 3);
  assert.equal(ids.get('contentReviewList').children.length, 3);
  assert.equal(ids.get('moreClaims').hidden, true);
  assert.equal(ids.get('moreContent').hidden, true);
  assert.ok(calls.some(call => call.url.includes('/sources/4/claims?cursor=2')));
  assert.ok(calls.some(call => call.url.includes('/sources/4/content-reviews?cursor=7')));
});

test('stale history failure after same-source refresh cannot overwrite the new detail', async () => {
  let release;
  const delayed = new Promise(resolve => { release = resolve; });
  const claims = [{ id: 2, status: 'pending', evidenceReference: '近', rights: {} }];
  const { ids } = setup(url => {
    if (url.includes('/sources/4/claims?')) return delayed;
    if (url.includes('/sources/4?')) return success(detail({ claims, claimsTotal: 2 }));
    return basicHandler(url);
  }, ['questionRightsReview']);
  await settle(); ids.get('sourceList').children[0].click(); await settle();
  const oldRequest = ids.get('moreClaims').click();
  assert.equal(ids.get('moreClaims').disabled, true);
  ids.get('refreshDetail').click(); await settle();
  assert.equal(ids.get('moreClaims').disabled, false);
  release(failure('旧分页失败', 503)); await oldRequest; await settle();
  assert.equal(ids.get('detailError').hidden, true);
  assert.equal(ids.get('moreClaims').disabled, false);
});

test('old source submission cannot re-enable the new source submit button', async () => {
  let releaseA, releaseB;
  const pendingA = new Promise(resolve => { releaseA = resolve; });
  const pendingB = new Promise(resolve => { releaseB = resolve; });
  const second = { ...defaultSource, id: 5, originalFilename: 'second.pdf' };
  const { ids } = setup((url, options) => {
    if (url.includes('/sources?')) return success({ sources: [defaultSource, second], total: 2, nextCursor: null });
    if (url.includes('/sources/4?')) return success(detail());
    if (url.includes('/sources/5?')) return success(detail({ source: second }));
    if (url.endsWith('/sources/4/claims') && options.method === 'POST') return pendingA;
    if (url.endsWith('/sources/5/claims') && options.method === 'POST') return pendingB;
    return success({});
  });
  await settle(); ids.get('sourceList').children[0].click(); await settle();
  ids.get('evidenceReference').value = '授权函'; ids.get('validFrom').value = '2026-10-01';
  ids.get('validUntil').value = '2027-10-01'; ids.get('territory').value = 'CN';
  ids.get('claimForm').inputs[0].checked = true;
  const first = submit(ids.get('claimForm'));
  ids.get('sourceList').children[1].click(); await settle();
  const secondSubmit = submit(ids.get('claimForm'));
  assert.equal(ids.get('submitClaim').disabled, true);
  releaseA(success({ claim: { id: 30, status: 'pending' } })); await first; await settle();
  assert.equal(ids.get('submitClaim').disabled, true);
  releaseB(success({ claim: { id: 31, status: 'pending' } })); await secondSubmit; await settle();
  assert.equal(ids.get('submitClaim').disabled, false);
});

test('deep linked source remains visible while the first list page omits it', async () => {
  const selected = { ...defaultSource, id: 101, originalFilename: 'deep.pdf' };
  const { ids } = setup(url => url.includes('/sources/101?') ? success(detail({ source: selected }))
    : success({ sources: [defaultSource], total: 101, nextCursor: 4 }), ['questionRightsReview'], 'http://localhost/admin/question-governance.html?source=101');
  await settle();
  assert.equal(ids.get('sourceList').children[0].children[0].textContent, 'deep.pdf');
  assert.equal(ids.get('sourceList').children[0]['aria-pressed'], 'true');
});
