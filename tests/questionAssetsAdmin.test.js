'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'admin/question-assets.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'admin/js/question-assets.js'), 'utf8');

class Node {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.listeners = {}; this.textContent = ''; this.value = ''; this.hidden = false; this.disabled = false; this.files = []; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  setAttribute(name, value) { this[name] = value; }
  reset() { this.value = ''; }
  click() { if (this.listeners.click) return this.listeners.click({ preventDefault() {} }); }
}
class FormDataMock {
  constructor() { this.parts = []; }
  append(name, value) { this.parts.push([name, value]); }
}
class FileMock {
  constructor(parts, name, options = {}) { this.name = name; this.type = options.type || ''; this.bytes = Buffer.concat(parts.map(part => part instanceof FileMock ? part.bytes : Buffer.from(part))); this.size = this.bytes.length; }
  slice(start, end) { return new Blob([this.bytes.subarray(start, end)]); }
}
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle() { for (let i = 0; i < 8; i++) await tick(); }
function flatten(node) { return [node, ...node.children.flatMap(child => child instanceof Node ? flatten(child) : [])]; }
function setup(handler, initialUrl = 'http://localhost/admin/question-assets.html') {
  const ids = new Map(Array.from(html.matchAll(/\bid="([^"]+)"/g), match => [match[1], new Node()]));
  let url = initialUrl;
  const calls = [];
  const context = {
    document: { getElementById: id => ids.get(id), createElement: tag => new Node(tag) },
    window: { ADMIN_API: '', crypto: { randomUUID: () => 'key-1', subtle: crypto.webcrypto.subtle }, location: { get href() { return url; }, get search() { return new URL(url).search; } }, history: { replaceState: (_state, _title, next) => { url = String(next); } } },
    initPage: (_name, _title, callback) => callback(), getToken: () => 'token', logout: () => {},
    FormData: FormDataMock, File: FileMock, Blob, URL, URLSearchParams,
    fetch: async (requestUrl, options = {}) => { calls.push({ url: String(requestUrl), options }); return handler(String(requestUrl), options); }
  };
  vm.runInNewContext(script, context, { filename: 'admin/js/question-assets.js' });
  return { ids, calls };
}
function json(data, status = 200) { return { status, ok: status < 400, json: async () => data }; }
function success(data) { return json({ code: 0, message: 'ok', data }); }
function submit(node) { return node.listeners.submit({ preventDefault() {} }); }

test('PDF admin page uses isolated permission and renders untrusted labels as text', async () => {
  assert.match(fs.readFileSync(path.join(root, 'admin/js/common.js'), 'utf8'), /id: 'questionAssets', icon: .*href: 'question-assets\.html'/);
  const attack = '<img src=x onerror=alert(1)>';
  const { ids } = setup(url => url.includes('/batches?')
    ? success({ batches: [{ id: 7, label: attack, created_at: '2026-10-21' }], total: 1, nextCursor: null })
    : success({ batch: { id: 7, label: attack }, sources: [{ id: 3, batchId: 7, originalFilename: attack, sourceReference: attack, sourceType: 'other', status: 'failed', errorCode: attack, attempts: 1 }], total: 1, nextCursor: null }));
  await settle();
  const batch = ids.get('batchList').children[0];
  assert.equal(batch.children[0].textContent, attack);
  assert.equal(ids.get('detailHeading').textContent, attack);
  const source = ids.get('sourceList').children[0];
  assert.equal(source.children[0].children[0].textContent, attack);
  assert.equal(flatten(source).some(node => node.tagName === 'img'), false);
});

test('import page links its source to OCR review instead of hiding the next step', async () => {
  assert.match(html, /href="question-parsing\.html"/);
  const { ids } = setup(url => url.includes('/batches?')
    ? success({ batches: [{ id: 1, label: '批次' }], total: 1, nextCursor: null })
    : success({ batch: { id: 1, label: '批次' }, sources: [{ id: 7, batchId: 1,
      originalFilename: 'sample.pdf', sourceReference: '内部来源', sourceType: 'internal', status: 'quarantined',
      validationStatus: 'valid', scanStatus: 'clean', attempts: 1 }], total: 1, nextCursor: null }));
  await settle();
  const links = flatten(ids.get('sourceList')).filter(item => item.tagName === 'a');
  assert.ok(links.some(item => item.textContent === '进入 OCR 识题 / 草稿核对' &&
    item.href === 'question-parsing.html?source=7&review=1'));
});

test('PDF workflow has one sidebar entry for an importer while specialist roles retain their entry', () => {
  const common = fs.readFileSync(path.join(root,'admin/js/common.js'),'utf8');
  let permissions = ['questionAssets','questionBankEdit','questionRightsReview'];
  const context = { localStorage:{getItem:key => key === 'adminPermissions' ? JSON.stringify(permissions) : null} };
  vm.createContext(context);
  vm.runInContext(common,context);
  const importer = context.renderNav('questionParsing');
  assert.match(importer,/PDF 制作刷题题集/);
  assert.equal((importer.match(/question-assets\.html/g) || []).length,1);
  assert.doesNotMatch(importer,/question-governance\.html|question-bank\.html|question-parsing\.html/);
  assert.match(importer,/nav-item active[^>]*href="question-assets\.html"/);
  permissions = ['questionBankEdit'];
  const editor = context.renderNav('questionBank');
  assert.match(editor,/question-bank\.html/);
  assert.doesNotMatch(editor,/question-assets\.html/);
});

test('admin form registers source before uploading PDF with admin bearer token', async () => {
  const { ids, calls } = setup((url, options) => {
    if (url.endsWith('/batches') && options.method === 'POST') return success({ batch: { id: 8, label: '导入' } });
    if (url.endsWith('/batches/8/sources') && options.method === 'POST') return success({ source: { id: 4, status: 'awaiting_upload' } });
    if (url.endsWith('/batches/8/sources/4/complete')) return success({ source: { id: 4, status: 'quarantined' } });
    if (url.includes('/batches/8?')) return success({ batch: { id: 8, label: '导入' }, sources: [], total: 0, nextCursor: null });
    return success({ batches: [], total: 0, nextCursor: null });
  });
  await settle();
  ids.get('batchLabel').value = '导入';
  await submit(ids.get('batchForm'));
  await settle();
  ids.get('sourceType').value = 'internal';
  ids.get('sourceReference').value = '清单 A-1';
  ids.get('sourceFile').files = [new FileMock([Buffer.alloc(100)], 'sample.pdf', { type: 'application/pdf' })];
  await submit(ids.get('sourceForm'));
  await settle();
  const sourceCall = calls.find(call => call.url.endsWith('/batches/8/sources') && call.options.method === 'POST');
  const uploadCall = calls.find(call => call.url.endsWith('/batches/8/sources/4/complete'));
  assert.ok(sourceCall); assert.ok(uploadCall);
  assert.ok(calls.indexOf(sourceCall) < calls.indexOf(uploadCall));
  assert.equal(JSON.parse(sourceCall.options.body).originalFilename, 'sample.pdf');
  assert.equal(uploadCall.options.headers.Authorization, 'Bearer token');
  assert.equal(uploadCall.options.headers['Content-Type'], undefined);
  assert.deepEqual(uploadCall.options.body.parts.map(part => part[0]), ['file']);
});

test('admin resumes a large PDF after an interrupted chunk and shows completion', async () => {
  const file = new FileMock([Buffer.alloc(25 * 1024 * 1024 + 32, 32)], 'large.pdf', { type: 'application/pdf' });
  let received = 0, interrupted = false, status = 'awaiting_upload';
  const { ids, calls } = setup((url, options) => {
    if (url.endsWith('/batches/5/sources') && options.method === 'POST') return success({ source: { id: 6, status } });
    if (url.endsWith('/batches/5/sources/6/uploads') && options.method === 'POST') return success({ uploadId: 'session-1', receivedBytes: received, chunkSize: 8 * 1024 * 1024 });
    if (url.includes('/uploads/session-1/chunk?offset=')) {
      const offset = Number(new URL(url, 'http://localhost').searchParams.get('offset'));
      if (offset === 8 * 1024 * 1024 && !interrupted) { interrupted = true; return Promise.reject(new Error('network')); }
      assert.equal(offset, received);
      assert.equal(options.headers['Content-Type'], 'application/octet-stream');
      received += options.body.size;
      return success({ receivedBytes: received });
    }
    if (url.endsWith('/uploads/session-1/complete')) { status = 'quarantined'; return success({ source: { id: 6, status } }); }
    if (url.includes('/batches/5?')) return success({ batch: { id: 5, label: '大文件' }, sources: [
      { id: 6, batchId: 5, originalFilename: 'large.pdf', sourceReference: '来源', sourceType: 'internal', status, attempts: 0 }
    ], total: 1, nextCursor: null });
    return success({ batches: [{ id: 5, label: '大文件' }], total: 1, nextCursor: null });
  });
  await settle();
  ids.get('sourceType').value = 'internal'; ids.get('sourceReference').value = '来源'; ids.get('sourceFile').files = [file];
  await submit(ids.get('sourceForm'));
  assert.equal(received, 8 * 1024 * 1024, ids.get('sourceError').textContent);
  assert.match(ids.get('sourceError').textContent, /网络连接异常/);
  const picker = ids.get('sourceList').children[0].children[2].children[1];
  picker.files = [file];
  await picker.listeners.change();
  assert.equal(received, file.size);
  assert.equal(ids.get('uploadProgress').hidden, true);
  assert.equal(ids.get('sourceList').children[0].children[0].children[1].textContent, '隔离保存');
  assert.equal(calls.filter(call => call.url.endsWith('/batches/5/sources/6/uploads')).length, 2);
  assert.equal(calls.filter(call => call.url.includes('/chunk?offset=0')).length, 1);
});

test('closed import environment presents a clear disabled notice', async () => {
  const { ids } = setup((url, options) => url.endsWith('/batches') && options.method === 'POST'
    ? json({ code: -1, message: 'PRIVATE_PDF_IMPORT_DISABLED', data: null }, 503)
    : success({ batches: [], total: 0, nextCursor: null }));
  await settle();
  ids.get('batchLabel').value = '导入';
  await submit(ids.get('batchForm'));
  assert.equal(ids.get('environmentNotice').hidden, false);
  assert.match(ids.get('environmentNotice').textContent, /生产环境需要先接入私有对象存储/);
});

test('failed source retries only with its registered filename', async () => {
  let status = 'failed';
  const { ids, calls } = setup((url, options) => {
    if (url.endsWith('/batches/2/sources/9/retry') && options.method === 'POST') {
      status = 'quarantined';
      return success({ source: { id: 9, status } });
    }
    if (url.includes('/batches/2?')) return success({ batch: { id: 2, label: '重试' }, sources: [
      { id: 9, batchId: 2, originalFilename: 'original.pdf', sourceReference: '来源', sourceType: 'internal', status, errorCode: status === 'failed' ? 'INVALID_PDF_SIGNATURE' : null, attempts: 1 }
    ], total: 1, nextCursor: null });
    return success({ batches: [{ id: 2, label: '重试' }], total: 1, nextCursor: null });
  });
  await settle();
  let picker = ids.get('sourceList').children[0].children[2].children[1];
  picker.files = [new FileMock([Buffer.alloc(100)], 'different.pdf', { type: 'application/pdf' })];
  await picker.listeners.change();
  assert.equal(calls.some(call => call.url.endsWith('/retry')), false);
  assert.match(ids.get('sourceError').textContent, /完全同名/);
  picker.files = [new FileMock([Buffer.alloc(100)], 'original.pdf', { type: '' })];
  await picker.listeners.change();
  await settle();
  const retry = calls.find(call => call.url.endsWith('/retry'));
  assert.ok(retry);
  assert.equal(retry.options.body.parts[0][1].type, 'application/pdf');
  assert.equal(ids.get('sourceList').children[0].children[0].children[1].textContent, '隔离保存');
});

test('scan states use database values and never imply a risky PDF is publishable', async () => {
  const { ids } = setup(url => url.includes('/batches?')
    ? success({ batches: [{ id: 5, label: '扫描' }], total: 1, nextCursor: null })
    : success({ batch: { id: 5, label: '扫描' }, sources: [
      { id: 1, batchId: 5, originalFilename: 'clean.pdf', sourceReference: 'A', sourceType: 'internal', status: 'quarantined', validationStatus: 'valid', scanStatus: 'clean' },
      { id: 2, batchId: 5, originalFilename: 'infected.pdf', sourceReference: 'B', sourceType: 'internal', status: 'quarantined', validationStatus: 'invalid', scanStatus: 'infected' }
    ], total: 2, nextCursor: null }));
  await settle();
  const [clean, infected] = ids.get('sourceList').children;
  assert.match(clean.children[1].children[2].textContent, /扫描通过.*当前不可发布/);
  assert.match(infected.children[1].children[2].textContent, /发现风险.*当前不可发布/);
});

test('quarantined PDF check action keeps a missing scanner visible as pending', async () => {
  let validationStatus = 'pending';
  const { ids, calls } = setup((url, options) => {
    if (url.endsWith('/sources/9/check') && options.method === 'POST') {
      validationStatus = 'valid';
      return success({ check: { state: 'blocked', scanStatus: 'pending', validationStatus: 'valid', pageCount: 12, errorCode: 'SCANNER_UNAVAILABLE' } });
    }
    if (url.includes('/batches/4?')) return success({ batch: { id: 4, label: '待校验' }, sources: [
      { id: 9, batchId: 4, originalFilename: 'paper.pdf', sourceReference: '来源', sourceType: 'internal', status: 'quarantined', validationStatus, scanStatus: 'pending' }
    ], total: 1, nextCursor: null });
    return success({ batches: [{ id: 4, label: '待校验' }], total: 1, nextCursor: null });
  });
  await settle();
  const action = ids.get('sourceList').children[0].children[2].children[0];
  assert.equal(action.textContent, '运行安全校验');
  await action.click();
  assert.ok(calls.some(call => call.url.endsWith('/sources/9/check') && call.options.method === 'POST'));
  assert.match(ids.get('sourceError').textContent, /共 12 页.*扫描/);
  assert.match(ids.get('sourceList').children[0].children[1].children[2].textContent, /PDF：校验通过.*病毒扫描：待扫描.*当前不可发布/);
});

test('pagination failure keeps loaded records but a failed refresh clears stale controls', async () => {
  let calls = 0;
  const { ids } = setup(url => {
    if (url.includes('/batches?')) {
      calls += 1;
      return calls === 1
        ? success({ batches: [{ id: 1, label: '第一页' }], total: 2, nextCursor: 1 })
        : json({ code: -1, message: '服务器暂不可用' }, 503);
    }
    return success({ batch: { id: 1, label: '第一页' }, sources: [], total: 0, nextCursor: null });
  });
  await settle();
  await ids.get('moreBatches').click();
  assert.equal(ids.get('batchList').children[0].children[0].textContent, '第一页');
  assert.equal(ids.get('moreBatches').hidden, false);
  assert.equal(ids.get('batchListError').hidden, false);
  await ids.get('reloadBatches').click();
  assert.equal(ids.get('moreBatches').hidden, true);
  assert.equal(ids.get('batchCount').textContent, '');
  assert.match(ids.get('batchList').children[0].textContent, /暂时无法加载/);
});

test('an old batch upload cannot replace the selected batch message after switching', async () => {
  let finishUpload;
  const pendingUpload = new Promise(resolve => { finishUpload = resolve; });
  const { ids } = setup((url, options) => {
    if (url.endsWith('/batches/1/sources') && options.method === 'POST') return success({ source: { id: 10, status: 'awaiting_upload' } });
    if (url.endsWith('/batches/1/sources/10/complete')) return pendingUpload;
    if (url.includes('/batches/1?')) return success({ batch: { id: 1, label: 'A' }, sources: [], total: 0, nextCursor: null });
    if (url.includes('/batches/2?')) return success({ batch: { id: 2, label: 'B' }, sources: [], total: 0, nextCursor: null });
    return success({ batches: [{ id: 1, label: 'A' }, { id: 2, label: 'B' }], total: 2, nextCursor: null });
  });
  await settle();
  ids.get('sourceType').value = 'internal'; ids.get('sourceReference').value = 'A-1';
  ids.get('sourceFile').files = [new FileMock([Buffer.alloc(100)], 'a.pdf', { type: 'application/pdf' })];
  const submitting = submit(ids.get('sourceForm'));
  await settle();
  await ids.get('batchList').children[1].click();
  ids.get('sourceError').textContent = 'B 的未保存提示'; ids.get('sourceError').hidden = false;
  finishUpload(success({ source: { id: 10, status: 'quarantined' } }));
  await submitting;
  assert.equal(ids.get('detailHeading').textContent, 'B');
  assert.equal(ids.get('sourceError').textContent, 'B 的未保存提示');
});

test('an old retry failure cannot replace the selected batch message after switching', async () => {
  let failRetry;
  const pendingRetry = new Promise(resolve => { failRetry = resolve; });
  const { ids } = setup((url, options) => {
    if (url.endsWith('/batches/1/sources/10/retry') && options.method === 'POST') return pendingRetry;
    if (url.includes('/batches/1?')) return success({ batch: { id: 1, label: 'A' }, sources: [
      { id: 10, batchId: 1, originalFilename: 'a.pdf', sourceReference: 'A-1', sourceType: 'internal', status: 'failed', attempts: 1 }
    ], total: 1, nextCursor: null });
    if (url.includes('/batches/2?')) return success({ batch: { id: 2, label: 'B' }, sources: [], total: 0, nextCursor: null });
    return success({ batches: [{ id: 1, label: 'A' }, { id: 2, label: 'B' }], total: 2, nextCursor: null });
  });
  await settle();
  const picker = ids.get('sourceList').children[0].children[2].children[1];
  picker.files = [new FileMock([Buffer.alloc(100)], 'a.pdf', { type: 'application/pdf' })];
  const retrying = picker.listeners.change();
  await settle();
  await ids.get('batchList').children[1].click();
  ids.get('sourceError').textContent = 'B 的未保存提示'; ids.get('sourceError').hidden = false;
  failRetry(json({ code: -1, message: 'PDF_PRECHECK_FAILED', data: null }, 400));
  await retrying;
  assert.equal(ids.get('detailHeading').textContent, 'B');
  assert.equal(ids.get('sourceError').textContent, 'B 的未保存提示');
});

test('new batch outside the first page stays visible through refresh and pagination', async () => {
  const firstPage = Array.from({ length: 30 }, (_, index) => ({ id: index + 1, label: `旧批次 ${index + 1}` }));
  const { ids } = setup((url, options) => {
    if (url.endsWith('/batches') && options.method === 'POST') return success({ batch: { id: 31, label: '新批次' } });
    if (url.includes('/batches/31?')) return success({ batch: { id: 31, label: '新批次' }, sources: [], total: 0, nextCursor: null });
    if (url.includes('cursor=30')) return success({ batches: [{ id: 31, label: '新批次' }], total: 31, nextCursor: null });
    if (url.includes('/batches?')) return success({ batches: firstPage, total: 31, nextCursor: 30 });
    return success({ batch: { id: 1, label: '旧批次 1' }, sources: [], total: 0, nextCursor: null });
  });
  await settle();
  ids.get('batchLabel').value = '新批次';
  await submit(ids.get('batchForm'));
  assert.equal(ids.get('currentBatch').hidden, false);
  assert.equal(ids.get('currentBatch').children[1].children[0].textContent, '新批次');
  await ids.get('reloadBatches').click();
  assert.equal(ids.get('currentBatch').hidden, false);
  await ids.get('moreBatches').click();
  assert.equal(ids.get('currentBatch').hidden, true);
  assert.equal(ids.get('batchList').children.at(-1).children[0].textContent, '新批次');
});

test('deep linked batch outside the first page is shown as current', async () => {
  const { ids } = setup(url => url.includes('/batches/31?')
    ? success({ batch: { id: 31, label: '深链接批次' }, sources: [], total: 0, nextCursor: null })
    : success({ batches: [{ id: 1, label: '旧批次' }], total: 31, nextCursor: 1 }),
  'http://localhost/admin/question-assets.html?batch=31');
  await settle();
  assert.equal(ids.get('detailHeading').textContent, '深链接批次');
  assert.equal(ids.get('currentBatch').hidden, false);
  assert.equal(ids.get('currentBatch').children[1].children[0].textContent, '深链接批次');
});
