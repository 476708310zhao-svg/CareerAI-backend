'use strict';
const runtime = require('./helpers/isolatedTestRuntime.cjs');
runtime.install();
process.env.QUESTION_PDF_LOCAL_IMPORT_ENABLED = '1';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const parsePdf = require('pdf-parse');
const jwt = require('jsonwebtoken');
const db = runtime.prepare();
const store = require('../services/questionAssetStore');
const { createQuestionAssets } = require('../services/questionAssets');
const { createQuestionPdfUploads } = require('../services/questionPdfUploads');
const { permissionForAdminPath } = require('../utils/adminPermissions');
const { app } = require('../server');
runtime.registerCleanup(test);
const service = createQuestionAssets(db, store);
const pdf = fs.readFileSync(path.join(__dirname, 'fixtures', 'question-valid.pdf'));
let server, base;

test.before(async () => {
  db.prepare(`INSERT INTO admin_accounts(id,username,password_hash,role,permissions,is_active)
    VALUES (99100,'question-assets-operator','test-only','operator',?,1)`).run(JSON.stringify(['questionAssets']));
  server = runtime.trackServer(app.listen(0, '127.0.0.1'));
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test('synthetic fixture is a parseable one-page PDF', async () => {
  const parsed = await parsePdf(pdf, { max: 1 });
  assert.equal(parsed.numpages, 1);
  assert.match(parsed.text, /Test PDF/);
});
const token = permissions => jwt.sign({ role: 'admin', id: 99100, sub: 'question-assets-operator', permissions }, process.env.JWT_SECRET);
const headers = permissions => ({ Authorization: `Bearer ${token(permissions)}`, 'Content-Type': 'application/json' });
const url = suffix => `${base}/admin/api/v4/question-assets${suffix}`;
const body = response => response.json();
const post = (suffix, payload, permissions = ['questionAssets']) => fetch(url(suffix), { method: 'POST', headers: headers(permissions), body: JSON.stringify(payload) });
async function filePost(suffix, bytes = pdf, type = 'application/pdf', permissions = ['questionAssets'], filename = 'paper.pdf') {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type }), filename);
  return fetch(url(suffix), { method: 'POST', headers: { Authorization: `Bearer ${token(permissions)}` }, body: form });
}
function sampleFingerprint(bytes) {
  const sample = Math.min(bytes.length, 64 * 1024);
  return crypto.createHash('sha256').update(bytes.subarray(0, sample)).update(bytes.subarray(bytes.length - sample)).digest('hex');
}

test('question asset routes deny anonymous and unrelated admins, with explicit permission mapping', async () => {
  assert.equal(permissionForAdminPath('/admin/api/v4/question-assets/batches'), 'questionAssets');
  assert.equal(permissionForAdminPath('/admin/api/users?x=/api/v4/question-assets'), 'users');
  assert.equal(permissionForAdminPath('/ADMIN/API/USERS#question-assets'), 'users');
  assert.equal(permissionForAdminPath('/admin/api/v4/question-assets-extra'), null);
  const anonymous = await fetch(url('/batches'));
  assert.equal(anonymous.status, 401);
  const unrelated = await post('/batches', { label: '拒绝' }, ['questions']);
  assert.equal(unrelated.status, 403);
  const unknown = await post('/batches', { label: '拒绝' }, ['imaginaryPermission']);
  assert.equal(unknown.status, 403);
  const assessment = await fetch(`${base}/admin/api/v4/assessment-products`, { headers: { Authorization: `Bearer ${token(['memberships'])}` } });
  assert.equal(assessment.status, 200);
  const userQuerySpoof = await fetch(`${base}/admin/api/users?x=/api/v4/question-assets`, { headers: { Authorization: `Bearer ${token(['questionAssets'])}` } });
  assert.equal(userQuerySpoof.status, 403);
  const uppercaseUsers = await fetch(`${base}/ADMIN/API/USERS`, { headers: { Authorization: `Bearer ${token(['questionAssets'])}` } });
  assert.equal(uppercaseUsers.status, 403);
  const authorizedUsers = await fetch(`${base}/ADMIN/API/USERS`, { headers: { Authorization: `Bearer ${token(['users'])}` } });
  assert.equal(authorizedUsers.status, 200);
});

test('PDF asset routes recheck live administrator permission and active status', async () => {
  const staleToken = token(['questionAssets']);
  const request = () => fetch(url('/batches'), { headers: { Authorization: `Bearer ${staleToken}` } });
  assert.equal((await request()).status, 200);
  try {
    db.prepare('UPDATE admin_accounts SET permissions=? WHERE id=99100').run('[]');
    assert.equal((await request()).status, 403);
    db.prepare('UPDATE admin_accounts SET permissions=? WHERE id=99100').run(JSON.stringify(['questionAssets']));
    db.prepare('UPDATE admin_accounts SET is_active=0 WHERE id=99100').run();
    assert.equal((await request()).status, 403);
  } finally {
    db.prepare('UPDATE admin_accounts SET permissions=?,is_active=1 WHERE id=99100')
      .run(JSON.stringify(['questionAssets']));
  }
});

test('invalid upload IDs are rejected before a temporary file is created', async () => {
  const before = fs.readdirSync(store.temporaryDirectory()).length;
  for (const suffix of ['/batches/not-an-id/sources/1/complete', '/batches/1/sources/not-an-id/retry']) {
    const result = await filePost(suffix);
    assert.equal(result.status, 400);
    assert.equal(fs.readdirSync(store.temporaryDirectory()).length, before);
  }
});

test('a Chinese PDF filename is accepted and kept in source provenance', async () => {
  const batch = service.createBatch({ label: '中文文件名', clientBatchKey: 'utf8-filename' }, 'test');
  const filename = '模拟试卷.pdf';
  const source = service.prepare(batch.id, { clientKey: 'utf8', sourceType: 'synthetic', sourceReference: 'utf8-filename', originalFilename: filename }, 'test');
  const response = await filePost(`/batches/${batch.id}/sources/${source.id}/complete`, pdf, 'application/pdf', ['questionAssets'], filename);
  assert.equal(response.status, 200);
  assert.equal(db.prepare('SELECT original_filename FROM question_asset_sources WHERE id=?').pluck().get(source.id), filename);
});

test('batch import preserves distinct sources for one SHA and denies public original access', async () => {
  const created = await post('/batches', { label: '隔离测试批次', clientBatchKey: 'dedup-batch' });
  assert.equal(created.status, 200);
  const batchId = (await body(created)).data.batch.id;
  const ids = [];
  for (const [key, ref] of [['source-one', 'original:A'], ['source-two', 'original:B']]) {
    const prepared = await post(`/batches/${batchId}/sources`, { clientKey: key, sourceType: 'original', sourceReference: ref, originalFilename: 'paper.pdf' });
    assert.equal(prepared.status, 200);
    ids.push((await body(prepared)).data.source.id);
  }
  const same = await post(`/batches/${batchId}/sources`, { clientKey: 'source-one', sourceType: 'original', sourceReference: 'original:A', originalFilename: 'paper.pdf' });
  assert.equal((await body(same)).data.source.id, ids[0]);
  const conflict = await post(`/batches/${batchId}/sources`, { clientKey: 'source-one', sourceType: 'original', sourceReference: 'changed', originalFilename: 'paper.pdf' });
  assert.equal(conflict.status, 409);
  for (const id of ids) {
    const uploaded = await filePost(`/batches/${batchId}/sources/${id}/complete`);
    assert.equal(uploaded.status, 200);
    assert.equal((await body(uploaded)).data.source.status, 'quarantined');
  }
  const rows = db.prepare('SELECT * FROM question_asset_sources WHERE batch_id=? ORDER BY id').all(batchId);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].asset_id, rows[1].asset_id);
  const asset = db.prepare('SELECT * FROM question_pdf_assets WHERE id=?').get(rows[0].asset_id);
  assert.equal(asset.scan_status, 'pending');
  assert.equal(asset.processing_right, 0);
  assert.equal(asset.display_right, 0);
  assert.equal(asset.publish_status, 'blocked');
  assert.equal(db.prepare('SELECT COUNT(*) FROM question_pdf_assets WHERE sha256=?').pluck().get(asset.sha256), 1);
  assert.ok(store.verify(asset.storage_key, asset.sha256, asset.byte_size));
  assert.equal((await fetch(`${base}/uploads/${asset.sha256}.pdf`)).status, 404);
  assert.equal((await fetch(`${base}/api/v4/question-assets/batches/${batchId}`)).status, 404);
  assert.ok(!store.privateRoot.startsWith(path.resolve(process.env.UPLOAD_DIR)));
  const status = await fetch(url(`/batches/${batchId}`), { headers: { Authorization: `Bearer ${token(['questionAssets'])}` } });
  assert.equal(status.status, 200);
  assert.equal((await body(status)).data.sources.length, 2);
  const audit = db.prepare('SELECT action FROM question_asset_audit WHERE batch_id=? ORDER BY id').all(batchId).map(row => row.action);
  assert.deepEqual(audit, ['batch_created', 'source_prepared', 'source_prepared', 'upload_quarantined', 'upload_quarantined']);
  assert.throws(() => db.prepare("UPDATE question_pdf_assets SET publish_status='published' WHERE id=?").run(asset.id), /CHECK constraint/);
});

test('a PDF above 25 MiB resumes in private 8 MiB chunks and retains the complete original', async () => {
  const bytes = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(25 * 1024 * 1024, 32), Buffer.from('\nstartxref\n0\n%%EOF\n')]);
  const batch = service.createBatch({ label: '大文件续传', clientBatchKey: 'large-resume' }, 'test');
  const source = service.prepare(batch.id, { clientKey: 'large', sourceType: 'synthetic', sourceReference: 'large-test', originalFilename: 'large.pdf' }, 'test');
  const endpoint = `/batches/${batch.id}/sources/${source.id}/uploads`;
  const input = { originalFilename: 'large.pdf', byteSize: bytes.length, fingerprint: sampleFingerprint(bytes) };
  const created = await post(endpoint, input);
  assert.equal(created.status, 200);
  const session = (await body(created)).data;
  assert.equal(session.chunkSize, 8 * 1024 * 1024);
  const chunk = (offset, data, bearer = token(['questionAssets'])) => fetch(url(`${endpoint}/${session.uploadId}/chunk?offset=${offset}`), {
    method: 'PUT', headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/octet-stream' }, body: data
  });
  assert.equal((await chunk(0, bytes.subarray(0, session.chunkSize), token(['questions']))).status, 403);
  const first = await chunk(0, bytes.subarray(0, session.chunkSize));
  assert.equal(first.status, 200);
  assert.equal((await body(first)).data.receivedBytes, session.chunkSize);
  const resumed = await post(endpoint, input);
  assert.equal((await body(resumed)).data.uploadId, session.uploadId);
  assert.equal((await body(await post(endpoint, input))).data.receivedBytes, session.chunkSize);
  assert.equal((await chunk(0, bytes.subarray(0, session.chunkSize))).status, 200);
  assert.equal((await chunk(0, Buffer.alloc(16, 0))).status, 409);
  assert.equal((await fetch(url(`${endpoint}/${session.uploadId}/complete`), { method: 'POST', headers: headers(['questionAssets']) })).status, 409);
  for (let offset = session.chunkSize; offset < bytes.length; offset += session.chunkSize) {
    const uploaded = await chunk(offset, bytes.subarray(offset, offset + session.chunkSize));
    assert.equal(uploaded.status, 200);
  }
  const finished = await fetch(url(`${endpoint}/${session.uploadId}/complete`), { method: 'POST', headers: headers(['questionAssets']) });
  assert.equal(finished.status, 200);
  assert.equal((await body(finished)).data.source.status, 'quarantined');
  const asset = db.prepare('SELECT * FROM question_pdf_assets WHERE id=(SELECT asset_id FROM question_asset_sources WHERE id=?)').get(source.id);
  assert.equal(asset.byte_size, bytes.length);
  assert.equal(asset.sha256, crypto.createHash('sha256').update(bytes).digest('hex'));
  assert.equal(asset.scan_status, 'pending');
  assert.equal(asset.publish_status, 'blocked');
  assert.equal(fs.existsSync(path.join(store.privateRoot, 'tmp', session.uploadId)), false);
  assert.equal((await fetch(`${base}/uploads/${asset.sha256}.pdf`)).status, 404);
});

test('large PDF sessions reject over-limit sizes and changed content without publishing', async () => {
  const batch = service.createBatch({ label: '大文件边界', clientBatchKey: 'large-limits' }, 'test');
  const source = service.prepare(batch.id, { clientKey: 'large', sourceType: 'synthetic', sourceReference: 'limits', originalFilename: 'large.pdf' }, 'test');
  const endpoint = `/batches/${batch.id}/sources/${source.id}/uploads`;
  assert.equal((await post(endpoint, { originalFilename: 'large.pdf', byteSize: 256 * 1024 * 1024 + 1, fingerprint: 'a'.repeat(64) })).status, 413);
  const valid = Buffer.from('%PDF-1.4\nstartxref\n0\n%%EOF\n');
  const original = { originalFilename: 'large.pdf', byteSize: valid.length, fingerprint: sampleFingerprint(valid) };
  const created = await post(endpoint, original);
  const session = (await body(created)).data;
  const changed = Buffer.from(valid); changed[8] = 32;
  const chunk = await fetch(url(`${endpoint}/${session.uploadId}/chunk?offset=0`), {
    method: 'PUT', headers: { Authorization: `Bearer ${token(['questionAssets'])}`, 'Content-Type': 'application/octet-stream' }, body: changed
  });
  assert.equal(chunk.status, 200);
  const finished = await fetch(url(`${endpoint}/${session.uploadId}/complete`), { method: 'POST', headers: headers(['questionAssets']) });
  assert.equal(finished.status, 409);
  assert.equal((await body(finished)).message, 'UPLOAD_FINGERPRINT_MISMATCH');
  assert.equal(db.prepare('SELECT status FROM question_asset_sources WHERE id=?').pluck().get(source.id), 'failed');
  assert.equal(db.prepare('SELECT COUNT(*) FROM question_pdf_upload_sessions WHERE source_id=?').pluck().get(source.id), 0);
});

test('a second upload cannot reopen a session while full-file validation is running', async () => {
  const batch = service.createBatch({ label: '完成时并发', clientBatchKey: 'large-finalizing' }, 'test');
  const source = service.prepare(batch.id, { clientKey: 'one', sourceType: 'synthetic', sourceReference: 'race', originalFilename: 'paper.pdf' }, 'test');
  let entered, release;
  const inspectionStarted = new Promise(resolve => { entered = resolve; });
  const inspectionGate = new Promise(resolve => { release = resolve; });
  const slowStore = { ...store, inspectPdf: async file => { entered(); await inspectionGate; return store.inspectPdf(file); } };
  const uploads = createQuestionPdfUploads(db, createQuestionAssets(db, slowStore), slowStore);
  const input = { originalFilename: 'paper.pdf', byteSize: pdf.length, fingerprint: sampleFingerprint(pdf) };
  const session = uploads.create(batch.id, source.id, input, 'test');
  uploads.append(batch.id, source.id, session.uploadId, 0, pdf);
  const finishing = uploads.finish(batch.id, source.id, session.uploadId, 'test');
  await inspectionStarted;
  assert.throws(() => uploads.create(batch.id, source.id, input, 'test'), /UPLOAD_FINALIZING/);
  release();
  assert.equal((await finishing).status, 'quarantined');
});

test('invalid PDF is failed, traceable and retryable with a valid file', async () => {
  const batch = service.createBatch({ label: '失败重试测试', clientBatchKey: 'retry-batch' }, 'test');
  const source = service.prepare(batch.id, { clientKey: 'retry-one', sourceType: 'original', sourceReference: 'self:test', originalFilename: 'paper.pdf' }, 'test');
  const endpoint = `/batches/${batch.id}/sources/${source.id}`;
  const bad = await filePost(`${endpoint}/complete`, Buffer.from('not a PDF despite extension'), 'application/pdf');
  assert.equal(bad.status, 400);
  assert.equal((await body(bad)).message, 'INVALID_PDF_SIGNATURE');
  let record = db.prepare('SELECT * FROM question_asset_sources WHERE id=?').get(source.id);
  assert.equal(record.status, 'failed');
  assert.equal(record.error_code, 'INVALID_PDF_SIGNATURE');
  assert.equal(record.attempts, 1);
  const retry = await filePost(`${endpoint}/retry`);
  assert.equal(retry.status, 200);
  assert.equal((await body(retry)).data.source.status, 'quarantined');
  record = db.prepare('SELECT * FROM question_asset_sources WHERE id=?').get(source.id);
  assert.equal(record.attempts, 2);
  const again = await filePost(`${endpoint}/retry`);
  assert.equal(again.status, 200);
  assert.equal(db.prepare('SELECT attempts FROM question_asset_sources WHERE id=?').pluck().get(source.id), 2);
  assert.deepEqual(db.prepare('SELECT action FROM question_asset_audit WHERE source_id=? ORDER BY id').all(source.id).map(row => row.action), ['source_prepared', 'upload_failed', 'upload_quarantined']);
});

test('multipart rejection also records a retryable failed source', async () => {
  const batch = service.createBatch({ label: '上传字段错误测试', clientBatchKey: 'bad-form-batch' }, 'test');
  const source = service.prepare(batch.id, { clientKey: 'bad-form', sourceType: 'original', sourceReference: 'self:form', originalFilename: 'paper.pdf' }, 'test');
  const form = new FormData();
  form.append('wrongField', new Blob([pdf], { type: 'application/pdf' }), 'paper.pdf');
  const rejected = await fetch(url(`/batches/${batch.id}/sources/${source.id}/complete`), {
    method: 'POST', headers: { Authorization: `Bearer ${token(['questionAssets'])}` }, body: form
  });
  assert.equal(rejected.status, 400);
  assert.equal((await body(rejected)).message, 'PDF_UPLOAD_REJECTED');
  const failed = db.prepare('SELECT status,error_code,attempts FROM question_asset_sources WHERE id=?').get(source.id);
  assert.deepEqual(failed, { status: 'failed', error_code: 'PDF_UPLOAD_REJECTED', attempts: 1 });
  assert.equal((await filePost(`/batches/${batch.id}/sources/${source.id}/retry`)).status, 200);
});

test('production importer fails closed without storage and scanner', () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try { assert.throws(() => store.assertAvailable(), /PRIVATE_PDF_IMPORT_DISABLED/); }
  finally { process.env.NODE_ENV = previous; }
});

test('local importer defaults closed unless explicitly enabled', () => {
  const previous = process.env.QUESTION_PDF_LOCAL_IMPORT_ENABLED;
  delete process.env.QUESTION_PDF_LOCAL_IMPORT_ENABLED;
  try { assert.throws(() => store.assertAvailable(), /PRIVATE_PDF_IMPORT_DISABLED/); }
  finally { process.env.QUESTION_PDF_LOCAL_IMPORT_ENABLED = previous; }
});

test('custom private directory outside DATA_DIR is rejected before creation', () => {
  const outside = path.join(os.tmpdir(), `question-outside-${process.pid}`);
  const result = spawnSync(process.execPath, ['-e', "try { require('./services/questionAssetStore').assertAvailable(); process.exit(2); } catch (error) { console.error(error.message); }"], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'test', QUESTION_PDF_LOCAL_IMPORT_ENABLED: '1', QUESTION_PDF_PRIVATE_DIR: outside }
  });
  assert.equal(result.status, 0);
  assert.match(result.stderr, /PRIVATE_STORAGE_OUTSIDE_DATA_DIR/);
  assert.equal(fs.existsSync(outside), false);
});

test('private root cannot contain or sit inside a publicly served directory', () => {
  const unsafeUpload = path.join(process.env.DATA_DIR, 'private-question-pdfs', 'served-child');
  const result = spawnSync(process.execPath, ['-e', "try { require('./services/questionAssetStore').assertAvailable(); process.exit(2); } catch (error) { console.error(error.message); }"], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'test', QUESTION_PDF_LOCAL_IMPORT_ENABLED: '1', UPLOAD_DIR: unsafeUpload }
  });
  assert.equal(result.status, 0);
  assert.match(result.stderr, /PRIVATE_STORAGE_EXPOSED/);
});

test('tmp and hash prefix junctions cannot redirect private writes', () => {
  for (const leaf of ['tmp', 'ab']) {
    const customRoot = path.join(process.env.DATA_DIR, `unsafe-${leaf}-${crypto.randomUUID()}`);
    const script = `const fs=require('fs');const path=require('path');const root=process.env.QUESTION_PDF_PRIVATE_DIR;fs.mkdirSync(root,{recursive:true});const link=path.join(root,'${leaf}');fs.symlinkSync(process.env.UPLOAD_DIR,link,'junction');try{const store=require('./services/questionAssetStore');${leaf === 'tmp' ? 'store.temporaryDirectory()' : "store.retain(path.join(root,'tmp','x'),'ab'+'0'.repeat(62),1)"};process.exitCode=2}catch(error){console.error(error.message)}finally{fs.unlinkSync(link)}`;
    const result = spawnSync(process.execPath, ['-e', script], {
      cwd: path.join(__dirname, '..'), encoding: 'utf8',
      env: { ...process.env, NODE_ENV: 'test', QUESTION_PDF_LOCAL_IMPORT_ENABLED: '1', QUESTION_PDF_PRIVATE_DIR: customRoot }
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /PRIVATE_STORAGE_UNSAFE_PATH/);
  }
});

test('structurally uncertain and encryption-marker PDFs stay quarantined for deep validation', async () => {
  const batch = service.createBatch({ label: 'PDF 结构检查', clientBatchKey: 'pdf-structure' }, 'test');
  const cases = [
    ['broken', Buffer.from('%PDF-1.4\nstartxref\n0\n%%EOF\n')],
    ['encryption-marker', Buffer.concat([pdf, Buffer.from('\n% /Encrypt text in a comment\n')])]
  ];
  for (const [key, bytes] of cases) {
    const source = service.prepare(batch.id, { clientKey: key, sourceType: 'synthetic', sourceReference: key, originalFilename: 'paper.pdf' }, 'test');
    const response = await filePost(`/batches/${batch.id}/sources/${source.id}/complete`, bytes);
    assert.equal(response.status, 200);
    const result = (await body(response)).data.source;
    assert.equal(result.status, 'quarantined');
    assert.equal(result.validationStatus, 'pending');
    assert.equal(result.scanStatus, 'pending');
    const asset = db.prepare('SELECT * FROM question_pdf_assets WHERE id=?').get(result.assetId);
    assert.equal(asset.publish_status, 'blocked');
    assert.throws(() => db.prepare("UPDATE question_pdf_assets SET publish_status='published' WHERE id=?").run(asset.id), /CHECK constraint/);
  }
});

test('batch and source pagination expose every row and batch creation is idempotent', async () => {
  const batch = service.createBatch({ label: '分页批次', clientBatchKey: 'paged-batch' }, 'test');
  assert.equal(service.createBatch({ label: '分页批次', clientBatchKey: 'paged-batch' }, 'test').id, batch.id);
  assert.throws(() => service.createBatch({ label: '不同标题', clientBatchKey: 'paged-batch' }, 'test'), /CLIENT_BATCH_KEY_CONFLICT/);
  const insertSource = db.prepare('INSERT INTO question_asset_sources(batch_id,client_key,source_type,source_reference,original_filename,created_by) VALUES (?,?,?,?,?,?)');
  db.transaction(() => {
    for (let i = 0; i < 121; i++) insertSource.run(batch.id, `page-${i}`, 'synthetic', `page:${i}`, 'paper.pdf', 'test');
  })();
  const first = service.list(batch.id, { limit: 100 });
  const second = service.list(batch.id, { limit: 100, cursor: first.nextCursor });
  assert.deepEqual([first.sources.length, second.sources.length, first.total, second.nextCursor], [100, 21, 121, null]);
  const response = await fetch(url(`/batches/${batch.id}?limit=100&cursor=${first.nextCursor}`), { headers: { Authorization: `Bearer ${token(['questionAssets'])}` } });
  assert.equal((await body(response)).data.sources.length, 21);
  assert.ok(service.listBatches({ limit: 2 }).nextCursor);
  assert.throws(() => service.list(batch.id, { limit: 501 }), /INVALID_PAGINATION/);
});

test('same-size tampered stored asset blocks deduplication and keeps source retryable', async () => {
  const variant = Buffer.concat([pdf, Buffer.from('\n% integrity variant\n')]);
  const batch = service.createBatch({ label: '完整性检查', clientBatchKey: 'integrity-batch' }, 'test');
  const first = service.prepare(batch.id, { clientKey: 'first', sourceType: 'synthetic', sourceReference: 'one', originalFilename: 'paper.pdf' }, 'test');
  const initial = await filePost(`/batches/${batch.id}/sources/${first.id}/complete`, variant);
  assert.equal(initial.status, 200);
  const asset = db.prepare('SELECT * FROM question_pdf_assets WHERE id=?').get((await body(initial)).data.source.assetId);
  const target = path.join(store.privateRoot, asset.storage_key);
  const original = fs.readFileSync(target);
  const second = service.prepare(batch.id, { clientKey: 'second', sourceType: 'synthetic', sourceReference: 'two', originalFilename: 'paper.pdf' }, 'test');
  try {
    fs.writeFileSync(target, Buffer.alloc(original.length, 0));
    const rejected = await filePost(`/batches/${batch.id}/sources/${second.id}/complete`, variant);
    assert.equal(rejected.status, 503);
    assert.equal((await body(rejected)).message, 'ASSET_STORAGE_MISMATCH');
    assert.equal(db.prepare('SELECT status FROM question_asset_sources WHERE id=?').pluck().get(second.id), 'failed');
  } finally { fs.writeFileSync(target, original); }
  assert.ok(store.verify(asset.storage_key, asset.sha256, asset.byte_size));
  assert.equal((await filePost(`/batches/${batch.id}/sources/${second.id}/retry`, variant)).status, 200);
});

test('old temporary and unreferenced stored files are reconciled without removing active assets', () => {
  const temp = path.join(store.temporaryDirectory(), crypto.randomUUID());
  fs.writeFileSync(temp, Buffer.from('stale'));
  const orphanSha = 'cd' + '0'.repeat(62);
  const orphanDirectory = path.join(store.privateRoot, 'cd');
  fs.mkdirSync(orphanDirectory, { recursive: true });
  const orphan = path.join(orphanDirectory, `${orphanSha}.pdf`);
  fs.writeFileSync(orphan, Buffer.from('orphan'));
  const old = new Date(Date.now() - store.STALE_MS - 5000);
  fs.utimesSync(temp, old, old);
  fs.utimesSync(orphan, old, old);
  service.createBatch({ label: '清理触发', clientBatchKey: 'cleanup-batch' }, 'test');
  assert.equal(fs.existsSync(temp), false);
  assert.equal(fs.existsSync(orphan), false);
  assert.ok(db.prepare('SELECT COUNT(*) FROM question_pdf_assets').pluck().get() >= 1);
});

test('a pre-existing orphan target is verified before reuse', async () => {
  const bytes = Buffer.concat([pdf, Buffer.from('\n% orphan reuse\n')]);
  const tempOne = path.join(store.temporaryDirectory(), crypto.randomUUID());
  const tempTwo = path.join(store.temporaryDirectory(), crypto.randomUUID());
  fs.writeFileSync(tempOne, bytes);
  fs.writeFileSync(tempTwo, bytes);
  const inspected = await store.inspectPdf(tempOne);
  const retained = store.retain(tempOne, inspected.sha256, inspected.byteSize);
  const target = path.join(store.privateRoot, retained.key);
  try {
    fs.writeFileSync(target, Buffer.alloc(inspected.byteSize, 0));
    assert.throws(() => store.retain(tempTwo, inspected.sha256, inspected.byteSize), /ASSET_STORAGE_MISMATCH/);
    assert.equal(fs.existsSync(tempTwo), true);
  } finally {
    if (fs.existsSync(tempTwo)) fs.unlinkSync(tempTwo);
    store.removeNewFile(retained.key, db);
  }
});

test('a failed database transaction removes its newly retained file', async () => {
  const bytes = Buffer.concat([pdf, Buffer.from('\n% transaction rollback\n')]);
  const batch = service.createBatch({ label: '事务失败恢复', clientBatchKey: 'rollback-batch' }, 'test');
  const source = service.prepare(batch.id, { clientKey: 'rollback', sourceType: 'synthetic', sourceReference: 'rollback', originalFilename: 'paper.pdf' }, 'test');
  const filePath = path.join(store.temporaryDirectory(), crypto.randomUUID());
  fs.writeFileSync(filePath, bytes);
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  const key = `${sha.slice(0, 2)}/${sha}.pdf`;
  const failingDb = { prepare: sql => db.prepare(sql), transaction: () => () => { throw new Error('SIMULATED_DB_FAILURE'); } };
  const failingService = createQuestionAssets(failingDb, store);
  await assert.rejects(() => failingService.complete(batch.id, source.id, { path: filePath, originalname: 'paper.pdf', mimetype: 'application/pdf' }, 'test'), /SIMULATED_DB_FAILURE/);
  assert.equal(fs.existsSync(path.join(store.privateRoot, key)), false);
  assert.equal(fs.existsSync(filePath), false);
  assert.equal(db.prepare('SELECT asset_id FROM question_asset_sources WHERE id=?').pluck().get(source.id), null);
});

test('temporary quota fails closed and bounded cleanup can drain expired files', () => {
  const tmp = store.temporaryDirectory();
  const created = [];
  const old = new Date(Date.now() - store.STALE_MS - 5000);
  try {
    for (let i = 0; i < 256; i++) {
      const file = path.join(tmp, crypto.randomUUID());
      fs.writeFileSync(file, 'x');
      fs.utimesSync(file, old, old);
      created.push(file);
    }
    assert.throws(() => store.temporaryDirectory(), /PRIVATE_TEMP_QUOTA_EXCEEDED/);
    assert.equal(store.cleanupStale(db), 100);
    assert.equal(store.cleanupStale(db), 100);
    assert.equal(store.cleanupStale(db), 56);
    assert.doesNotThrow(() => store.temporaryDirectory());
  } finally {
    for (const file of created) if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});

async function concurrentCompletions(bytesA, bytesB, clientBatchKey) {
  const batch = service.createBatch({ label: clientBatchKey, clientBatchKey }, 'test');
  const source = service.prepare(batch.id, { clientKey: 'one-source', sourceType: 'synthetic', sourceReference: clientBatchKey, originalFilename: 'paper.pdf' }, 'test');
  const paths = [bytesA, bytesB].map(bytes => {
    const filePath = path.join(store.temporaryDirectory(), crypto.randomUUID());
    fs.writeFileSync(filePath, bytes);
    return filePath;
  });
  let entered = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  const delayedStore = { ...store, async inspectPdf(filePath) {
    entered++;
    if (entered === 2) release();
    await gate;
    return store.inspectPdf(filePath);
  } };
  const concurrentService = createQuestionAssets(db, delayedStore);
  const beforeAssets = db.prepare('SELECT COUNT(*) FROM question_pdf_assets').pluck().get();
  const beforeAudit = db.prepare("SELECT COUNT(*) FROM question_asset_audit WHERE source_id=? AND action='upload_quarantined'").pluck().get(source.id);
  try {
    const results = await Promise.all(paths.map(filePath => concurrentService.complete(batch.id, source.id,
      { path: filePath, mimetype: 'application/pdf', originalname: 'paper.pdf' }, 'test')));
    const final = db.prepare('SELECT * FROM question_asset_sources WHERE id=?').get(source.id);
    assert.equal(entered, 2);
    assert.equal(final.status, 'quarantined');
    assert.equal(final.attempts, 1);
    assert.equal(results[0].assetId, final.asset_id);
    assert.equal(results[1].assetId, final.asset_id);
    assert.equal(db.prepare("SELECT COUNT(*) FROM question_asset_audit WHERE source_id=? AND action='upload_quarantined'").pluck().get(source.id), beforeAudit + 1);
    assert.equal(db.prepare('SELECT COUNT(*) FROM question_pdf_assets').pluck().get(), beforeAssets + 1);
    assert.equal(fs.existsSync(paths[0]), false);
    assert.equal(fs.existsSync(paths[1]), false);
    return final;
  } finally {
    for (const filePath of paths) if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}

test('two different PDF uploads racing for one source keep the first committed asset immutable', async () => {
  const a = Buffer.concat([pdf, Buffer.from('\n% racing source A\n')]);
  const b = Buffer.concat([pdf, Buffer.from('\n% racing source B\n')]);
  const final = await concurrentCompletions(a, b, 'race-different-pdfs');
  const winning = db.prepare('SELECT sha256 FROM question_pdf_assets WHERE id=?').pluck().get(final.asset_id);
  const hashes = [a, b].map(bytes => crypto.createHash('sha256').update(bytes).digest('hex'));
  assert.ok(hashes.includes(winning));
  const losing = hashes.find(hash => hash !== winning);
  assert.equal(db.prepare('SELECT COUNT(*) FROM question_pdf_assets WHERE sha256=?').pluck().get(losing), 0);
  assert.equal(fs.existsSync(path.join(store.privateRoot, losing.slice(0, 2), `${losing}.pdf`)), false);
});

test('two identical PDF uploads racing for one source create one asset and one audit event', async () => {
  const bytes = Buffer.concat([pdf, Buffer.from('\n% racing identical\n')]);
  await concurrentCompletions(bytes, bytes, 'race-identical-pdfs');
});

test('closing a batch during precheck prevents a late upload commit', async () => {
  const bytes = Buffer.concat([pdf, Buffer.from('\n% closed batch\n')]);
  const batch = service.createBatch({ label: '批次关闭竞态', clientBatchKey: 'close-during-precheck' }, 'test');
  const source = service.prepare(batch.id, { clientKey: 'late', sourceType: 'synthetic', sourceReference: 'late', originalFilename: 'paper.pdf' }, 'test');
  const filePath = path.join(store.temporaryDirectory(), crypto.randomUUID());
  fs.writeFileSync(filePath, bytes);
  let entered, release;
  const enteredPrecheck = new Promise(resolve => { entered = resolve; });
  const continuePrecheck = new Promise(resolve => { release = resolve; });
  const delayedStore = { ...store, async inspectPdf(value) { entered(); await continuePrecheck; return store.inspectPdf(value); } };
  const pending = createQuestionAssets(db, delayedStore).complete(batch.id, source.id,
    { path: filePath, mimetype: 'application/pdf', originalname: 'paper.pdf' }, 'test');
  await enteredPrecheck;
  db.prepare("UPDATE question_asset_batches SET status='closed' WHERE id=?").run(batch.id);
  release();
  await assert.rejects(pending, /BATCH_CLOSED/);
  assert.equal(db.prepare('SELECT status FROM question_asset_sources WHERE id=?').pluck().get(source.id), 'awaiting_upload');
  assert.throws(() => service.failUpload(batch.id, source.id, 'LATE_UPLOAD_ERROR', 'test'), /BATCH_CLOSED/);
  assert.equal(db.prepare('SELECT attempts FROM question_asset_sources WHERE id=?').pluck().get(source.id), 0);
  assert.equal(fs.existsSync(filePath), false);
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  assert.equal(db.prepare('SELECT COUNT(*) FROM question_pdf_assets WHERE sha256=?').pluck().get(sha), 0);
});
