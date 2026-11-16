'use strict';
const runtime = require('./helpers/isolatedTestRuntime.cjs');
runtime.install();
process.env.QUESTION_PDF_LOCAL_IMPORT_ENABLED = '1';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const db = runtime.prepare();
const store = require('../services/questionAssetStore');
const { createQuestionAssets } = require('../services/questionAssets');
const { createQuestionAssetChecks, scanClam, scanDefender, defenderStatus, validatePdf } = require('../services/questionAssetChecks');
const { app } = require('../server');
runtime.registerCleanup(test);
const assets = createQuestionAssets(db, store);
const checks = createQuestionAssetChecks(db, { store });
const pdf = fs.readFileSync(path.join(__dirname, 'fixtures', 'question-valid.pdf'));
let server, base, sourceId;

test.before(async () => {
  db.prepare(`INSERT INTO admin_accounts(id,username,password_hash,role,permissions,is_active)
    VALUES (99190,'pdf-check-operator','test-only','operator',?,1)`).run(JSON.stringify(['questionAssets']));
  db.prepare(`INSERT INTO admin_accounts(id,username,password_hash,role,permissions,is_active)
    VALUES (99191,'pdf-check-unrelated','test-only','operator',?,1)`).run(JSON.stringify(['questions']));
  server = runtime.trackServer(app.listen(0, '127.0.0.1'));
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/admin/api/v4/question-assets`;
  const batch = assets.createBatch({ label: '安全校验', clientBatchKey: 'checks' }, 'test');
  const source = assets.prepare(batch.id, { clientKey: 'pdf', sourceType: 'synthetic', sourceReference: 'checks', originalFilename: 'checks.pdf' }, 'test');
  sourceId = source.id;
  const form = new FormData();
  form.append('file', new Blob([pdf], { type: 'application/pdf' }), 'checks.pdf');
  const response = await fetch(`${base}/batches/${batch.id}/sources/${sourceId}/complete`, {
    method: 'POST', headers: auth(['questionAssets']), body: form
  });
  assert.equal(response.status, 200);
});
const auth = permissions => ({ Authorization: `Bearer ${jwt.sign({ role: 'admin', id: permissions.includes('questions') ? 99191 : 99190,
  sub: permissions.includes('questions') ? 'pdf-check-unrelated' : 'pdf-check-operator', permissions }, process.env.JWT_SECRET)}` });
const endpoint = () => `${base}/sources/${sourceId}/check`;

test('PDF validator reads every page in a bounded worker and rejects malformed content', async () => {
  const original = path.join(__dirname, 'fixtures', 'question-valid.pdf');
  assert.deepEqual(await validatePdf(original), { status: 'valid', code: null, pageCount: 1, textPages: 1 });
  assert.deepEqual(await validatePdf(__filename), { status: 'invalid', code: 'PDF_STRUCTURE_INVALID' });
});

test('scanner interface fails closed for absent, partial, infected, and successful scans', async () => {
  assert.deepEqual(await scanClam('private.pdf', async () => ({ error: 'SCANNER_UNAVAILABLE' })),
    { status: 'pending', code: 'SCANNER_UNAVAILABLE', scanner: 'ClamAV' });
  const clean = 'Known viruses: 10\nScanned files: 1\nInfected files: 0\n';
  assert.equal((await scanClam('private.pdf', async () => ({ code: 0, stdout: clean }))).status, 'clean');
  assert.equal((await scanClam('private.pdf', async () => ({ code: 0, stdout: 'Scanned files: 1\nInfected files: 0' }))).status, 'failed');
  assert.equal((await scanClam('private.pdf', async () => ({ code: 1, stdout: 'private.pdf: Test FOUND' }))).status, 'infected');
  assert.equal((await scanClam('private.pdf', async () => ({ code: 1, stdout: 'Heuristics.Limits.Exceeded FOUND' }))).status, 'failed');
});

test('Windows Defender adapter requires a fresh enabled scanner and an explicit no-threat result', async () => {
  const state = values => async () => ({ code: 0, stdout: JSON.stringify(values) });
  const enabled = { service: true, antivirus: true, realtime: true, signatureAge: 1, signatureVersion: '1.451.223.0' };
  assert.deepEqual(await defenderStatus(state({ ...enabled, antivirus: false })), { ready: false, code: 'SCANNER_UNAVAILABLE' });
  assert.deepEqual(await defenderStatus(state({ ...enabled, signatureAge: 143 })), { ready: false, code: 'SCANNER_SIGNATURE_STALE' });
  assert.deepEqual(await defenderStatus(state(enabled)), { ready: true });
  const clean = 'Scan starting...\nScan finished.\nScanning private.pdf found no threats.\n';
  let args;
  const run = async (_command, values) => { args = values; return { code: 0, stdout: clean }; };
  const ready = async () => ({ ready: true });
  assert.deepEqual(await scanDefender('private.pdf', run, ready, () => 'MpCmdRun.exe'),
    { status: 'clean', code: null, scanner: 'Windows Defender' });
  assert.deepEqual(args, ['-Scan', '-ScanType', '3', '-DisableRemediation', '-File', 'private.pdf']);
  assert.equal((await scanDefender('private.pdf', async () => ({ code: 0, stdout: 'Scan finished.' }), ready, () => 'MpCmdRun.exe')).status, 'failed');
  assert.equal((await scanDefender('private.pdf', async () => ({ code: 2, stdout: clean }), ready, () => 'MpCmdRun.exe')).status, 'failed');
  assert.equal((await scanDefender('private.pdf', run, async () => ({ ready: false, code: 'SCANNER_SIGNATURE_STALE' }), () => 'MpCmdRun.exe')).status, 'pending');
});

test('check route requires current PDF asset permission and preserves the scanner gate', async () => {
  assert.equal((await fetch(endpoint())).status, 401);
  assert.equal((await fetch(endpoint(), { method: 'POST', headers: auth(['questions']) })).status, 403);
  const response = await fetch(endpoint(), { method: 'POST', headers: auth(['questionAssets']) });
  assert.equal(response.status, 200);
  const check = (await response.json()).data.check;
  assert.ok(['blocked', 'completed'].includes(check.state));
  assert.equal(check.validationStatus, 'valid');
  assert.ok(['pending', 'clean'].includes(check.scanStatus));
  if (check.scanStatus === 'pending') assert.ok(['SCANNER_UNAVAILABLE', 'SCANNER_SIGNATURE_STALE', 'SCANNER_STATUS_UNVERIFIED'].includes(check.errorCode));
  assert.equal(check.pageCount, 1);
  const status = await fetch(endpoint(), { headers: auth(['questionAssets']) });
  assert.equal(status.status, 200);
  assert.equal((await status.json()).data.latest.id, check.id);
  const asset = db.prepare('SELECT validation_status,scan_status,publish_status FROM question_pdf_assets WHERE id=(SELECT asset_id FROM question_asset_sources WHERE id=?)').get(sourceId);
  assert.deepEqual(asset, { validation_status: 'valid', scan_status: check.scanStatus, publish_status: 'blocked' });
});

test('a verified scanner result and validation can clear both asset gates', async () => {
  const injected = createQuestionAssetChecks(db, { store, scan: async () => ({ status: 'clean', code: null, scanner: 'test-scanner' }) });
  const result = await injected.run(sourceId, 'test');
  assert.equal(result.state, 'completed');
  assert.equal(result.scanStatus, 'clean');
  assert.equal(result.validationStatus, 'valid');
  assert.equal(result.scanner, 'test-scanner');
  const asset = db.prepare('SELECT scan_status,validation_status,publish_status,processing_right,display_right FROM question_pdf_assets WHERE id=(SELECT asset_id FROM question_asset_sources WHERE id=?)').get(sourceId);
  assert.deepEqual(asset, { scan_status: 'clean', validation_status: 'valid', publish_status: 'blocked', processing_right: 0, display_right: 0 });
});

test('infected scan skips PDF parsing and a structurally invalid PDF remains blocked', async () => {
  let parsed = false;
  const infected = createQuestionAssetChecks(db, { store,
    scan: async () => ({ status: 'infected', code: 'MALWARE_DETECTED', scanner: 'test-scanner' }),
    validate: async () => { parsed = true; return { status: 'valid' }; }
  });
  const first = await infected.run(sourceId, 'test');
  assert.equal(first.scanStatus, 'infected');
  assert.equal(first.validationStatus, 'pending');
  assert.equal(parsed, false);
  const invalid = createQuestionAssetChecks(db, { store,
    scan: async () => ({ status: 'clean', code: null, scanner: 'test-scanner' }),
    validate: async () => ({ status: 'invalid', code: 'PDF_STRUCTURE_INVALID' })
  });
  const second = await invalid.run(sourceId, 'test');
  assert.equal(second.scanStatus, 'clean');
  assert.equal(second.validationStatus, 'invalid');
  assert.equal(second.state, 'blocked');
  assert.equal(db.prepare('SELECT publish_status FROM question_pdf_assets WHERE id=(SELECT asset_id FROM question_asset_sources WHERE id=?)').pluck().get(sourceId), 'blocked');
});
