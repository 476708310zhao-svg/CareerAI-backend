'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const storeDefault = require('./questionAssetStore');

const problem = (code, status = 409) => Object.assign(new Error(code), { code, status });
const worker = path.join(__dirname, '..', 'scripts', 'question_pdf_validate_worker.js');
const MAX_OUTPUT = 32 * 1024;
function runProgram(command, args, timeoutMs, maxOutput = MAX_OUTPUT) {
  return new Promise(resolve => {
    const child = spawn(command, args, { shell: false, windowsHide: true, stdio: ['ignore','pipe','pipe'] });
    let stdout = '', stderr = '', done = false;
    const finish = result => { if (done) return; done = true; clearTimeout(timer); resolve(result); };
    const timer = setTimeout(() => { child.kill('SIGKILL'); finish({ error: 'PROCESS_TIMEOUT' }); }, timeoutMs);
    const collect = (target, chunk) => {
      const next = target + chunk.toString('utf8');
      if (Buffer.byteLength(next) > maxOutput) { child.kill('SIGKILL'); finish({ error: 'PROCESS_OUTPUT_LIMIT' }); return target; }
      return next;
    };
    child.stdout.on('data', chunk => { stdout = collect(stdout, chunk); });
    child.stderr.on('data', chunk => { stderr = collect(stderr, chunk); });
    child.on('error', error => finish({ error: error.code === 'ENOENT' ? 'SCANNER_UNAVAILABLE' : 'PROCESS_FAILED' }));
    child.on('close', code => finish({ code, stdout, stderr }));
  });
}

async function scanClam(file, run = runProgram) {
  const binary = process.env.QUESTION_PDF_CLAMSCAN_PATH || 'clamscan';
  const result = await run(binary, ['--max-filesize=300M', '--max-scansize=1G', '--max-files=100000',
    '--max-recursion=100', '--alert-exceeds-max=yes', '--no-warnings', file], 180_000);
  if (result.error === 'SCANNER_UNAVAILABLE') return { status: 'pending', code: 'SCANNER_UNAVAILABLE', scanner: 'ClamAV' };
  if (result.error) return { status: 'failed', code: result.error, scanner: 'ClamAV' };
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  if (/Heuristics\.Limits\.Exceeded/i.test(output)) return { status: 'failed', code: 'SCANNER_LIMIT_EXCEEDED', scanner: 'ClamAV' };
  if (result.code === 1 && /\bFOUND\b/.test(output)) return { status: 'infected', code: 'MALWARE_DETECTED', scanner: 'ClamAV' };
  const known = /Known viruses:\s*(\d+)/i.exec(output);
  const scanned = /Scanned files:\s*(\d+)/i.exec(output);
  const infected = /Infected files:\s*(\d+)/i.exec(output);
  if (result.code !== 0 || !known || Number(known[1]) < 1 || !scanned || Number(scanned[1]) !== 1 || !infected || Number(infected[1]) !== 0) {
    return { status: 'failed', code: 'SCANNER_RESULT_UNVERIFIED', scanner: 'ClamAV' };
  }
  return { status: 'clean', code: null, scanner: 'ClamAV' };
}

const defenderScanner = 'Windows Defender';
const defenderStatusScript = '$s=Get-MpComputerStatus; [pscustomobject]@{ service=$s.AMServiceEnabled; antivirus=$s.AntivirusEnabled; realtime=$s.RealTimeProtectionEnabled; signatureAge=$s.AntivirusSignatureAge; signatureVersion=$s.AntivirusSignatureVersion } | ConvertTo-Json -Compress';
async function defenderStatus(run = runProgram) {
  const result = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', defenderStatusScript], 20_000, 4096);
  if (result.error || result.code !== 0) return { ready: false, code: 'SCANNER_UNAVAILABLE' };
  try {
    const state = JSON.parse(result.stdout);
    if (state.service !== true || state.antivirus !== true || state.realtime !== true) return { ready: false, code: 'SCANNER_UNAVAILABLE' };
    if (!Number.isSafeInteger(state.signatureAge) || state.signatureAge < 0 || state.signatureAge > 7 ||
        !/^\d+(?:\.\d+)+$/.test(state.signatureVersion)) return { ready: false, code: 'SCANNER_SIGNATURE_STALE' };
    return { ready: true };
  } catch (_) { return { ready: false, code: 'SCANNER_STATUS_UNVERIFIED' }; }
}

function defenderBinary() {
  const base = process.env.ProgramData && path.join(process.env.ProgramData, 'Microsoft', 'Windows Defender', 'Platform');
  if (base && fs.existsSync(base)) {
    const versions = fs.readdirSync(base, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort().reverse();
    for (const version of versions) {
      const binary = path.join(base, version, 'MpCmdRun.exe');
      if (fs.existsSync(binary)) return binary;
    }
  }
  const fallback = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Windows Defender', 'MpCmdRun.exe');
  return fs.existsSync(fallback) ? fallback : null;
}

async function scanDefender(file, run = runProgram, status = defenderStatus, binary = defenderBinary) {
  const before = await status(run);
  if (!before.ready) return { status: 'pending', code: before.code, scanner: defenderScanner };
  const executable = binary();
  if (!executable) return { status: 'pending', code: 'SCANNER_UNAVAILABLE', scanner: defenderScanner };
  const result = await run(executable, ['-Scan', '-ScanType', '3', '-DisableRemediation', '-File', file], 180_000);
  if (result.error) return { status: 'failed', code: result.error, scanner: defenderScanner };
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  if (result.code !== 0) return { status: 'failed', code: 'SCANNER_RESULT_UNVERIFIED', scanner: defenderScanner };
  if (!/Scan finished\./i.test(output) || !/\bfound no threats\./i.test(output)) {
    return { status: 'failed', code: 'SCANNER_RESULT_UNVERIFIED', scanner: defenderScanner };
  }
  const after = await status(run);
  if (!after.ready) return { status: 'pending', code: after.code, scanner: defenderScanner };
  return { status: 'clean', code: null, scanner: defenderScanner };
}

async function scanLocal(file) {
  const clam = await scanClam(file);
  return process.platform === 'win32' && clam.status === 'pending' && clam.code === 'SCANNER_UNAVAILABLE'
    ? scanDefender(file) : clam;
}

async function validatePdf(file, run = runProgram) {
  const result = await run(process.execPath, ['--max-old-space-size=512', worker, file], 120_000, 4096);
  if (result.error) return { status: 'pending', code: result.error };
  if (result.code !== 0) {
    const match = /ERR_CODE:(PDF_[A-Z_]+)/.exec(result.stderr || '');
    return { status: 'invalid', code: match?.[1] || 'PDF_STRUCTURE_INVALID' };
  }
  try {
    const value = JSON.parse(result.stdout);
    if (!Number.isSafeInteger(value.pageCount) || value.pageCount < 1 || value.pageCount > 2000 ||
        !Number.isSafeInteger(value.textPages) || value.textPages < 0 || value.textPages > value.pageCount) throw new Error();
    return { status: 'valid', code: null, pageCount: value.pageCount, textPages: value.textPages };
  } catch (_) { return { status: 'pending', code: 'PDF_VALIDATION_RESULT_UNVERIFIED' }; }
}

function createQuestionAssetChecks(db, options = {}) {
  const store = options.store || storeDefault;
  const scan = options.scan || scanLocal;
  const validate = options.validate || validatePdf;
  const sourceRow = sourceId => {
    const id = Number(sourceId);
    if (!Number.isSafeInteger(id) || id < 1) throw problem('INVALID_SOURCE_ID', 400);
    const row = db.prepare(`SELECT s.id AS source_id,s.batch_id,s.status,s.asset_id,a.sha256,a.byte_size,a.storage_key
      FROM question_asset_sources s LEFT JOIN question_pdf_assets a ON a.id=s.asset_id WHERE s.id=?`).get(id);
    if (!row) throw problem('SOURCE_NOT_FOUND', 404);
    if (row.status !== 'quarantined' || !row.asset_id) throw problem('SOURCE_NOT_QUARANTINED');
    return row;
  };
  const view = row => row && ({ id: row.id, state: row.state, scanner: row.scanner,
    scanStatus: row.scan_status, validationStatus: row.validation_status,
    pageCount: row.page_count, textPages: row.text_pages, errorCode: row.error_code,
    startedAt: row.started_at, finishedAt: row.finished_at });
  const latest = assetId => db.prepare('SELECT * FROM question_pdf_asset_checks WHERE asset_id=? ORDER BY id DESC LIMIT 1').get(assetId);
  return {
    status(sourceId) {
      const source = sourceRow(sourceId);
      const asset = db.prepare('SELECT validation_status,scan_status FROM question_pdf_assets WHERE id=?').get(source.asset_id);
      return { validationStatus: asset.validation_status, scanStatus: asset.scan_status, latest: view(latest(source.asset_id)) };
    },
    async run(sourceId, actor) {
      store.assertAvailable();
      const source = sourceRow(sourceId);
      const checkId = db.transaction(() => {
        const current = latest(source.asset_id);
        if (current?.state === 'running' && Date.now() - Date.parse(current.started_at.replace(' ', 'T') + 'Z') < 10 * 60 * 1000) {
          throw problem('ASSET_CHECK_RUNNING');
        }
        const running = db.prepare("SELECT COUNT(*) FROM question_pdf_asset_checks WHERE state='running' AND started_at>datetime('now','-10 minutes')").pluck().get();
        if (running >= 2) throw problem('ASSET_CHECK_CAPACITY', 429);
        const result = db.prepare(`INSERT INTO question_pdf_asset_checks
          (asset_id,source_id,state,scanner,scan_status,validation_status,started_by)
          VALUES (?,?,'running','LocalAV','pending','pending',?)`).run(source.asset_id, source.source_id, actor);
        db.prepare("UPDATE question_pdf_assets SET validation_status='pending',scan_status='pending',publish_status='blocked' WHERE id=?").run(source.asset_id);
        db.prepare(`INSERT INTO question_asset_audit(batch_id,source_id,action,actor,detail)
          VALUES (?,?,'asset_check_started',?,'{}')`).run(source.batch_id, source.source_id, actor);
        return result.lastInsertRowid;
      }).immediate();
      let scanResult = { status: 'pending', code: 'SCANNER_UNAVAILABLE', scanner: 'LocalAV' };
      let validation = { status: 'pending', code: null };
      try {
        store.verify(source.storage_key, source.sha256, source.byte_size);
        const file = path.join(store.privateRoot, source.storage_key);
        scanResult = await scan(file);
        if (scanResult.status === 'clean' || scanResult.status === 'pending') {
          store.verify(source.storage_key, source.sha256, source.byte_size);
          validation = await validate(file);
          store.verify(source.storage_key, source.sha256, source.byte_size);
        }
      } catch (error) {
        scanResult = { status: 'failed', code: error.code || 'ASSET_CHECK_FAILED', scanner: 'LocalAV' };
        validation = { status: 'pending', code: null };
      }
      const errorCode = scanResult.code || validation.code || null;
      const state = scanResult.status === 'clean' && validation.status === 'valid' ? 'completed' : 'blocked';
      return db.transaction(() => {
        const current = latest(source.asset_id);
        if (!current || current.id !== checkId) throw problem('ASSET_CHECK_SUPERSEDED');
        db.prepare(`UPDATE question_pdf_asset_checks SET state=?,scanner=?,scan_status=?,validation_status=?,
          page_count=?,text_pages=?,error_code=?,finished_at=datetime('now') WHERE id=?`)
          .run(state, scanResult.scanner || 'LocalAV', scanResult.status, validation.status,
            validation.pageCount || null, validation.textPages ?? null, errorCode, checkId);
        db.prepare("UPDATE question_pdf_assets SET scan_status=?,validation_status=?,publish_status='blocked' WHERE id=?")
          .run(scanResult.status, validation.status, source.asset_id);
        db.prepare(`INSERT INTO question_asset_audit(batch_id,source_id,action,actor,detail) VALUES (?,?,?,?,?)`)
          .run(source.batch_id, source.source_id, 'asset_check_finished', actor,
            JSON.stringify({ checkId, scanStatus: scanResult.status, validationStatus: validation.status, errorCode }));
        return view(db.prepare('SELECT * FROM question_pdf_asset_checks WHERE id=?').get(checkId));
      }).immediate();
    }
  };
}

module.exports = { createQuestionAssetChecks, scanClam, scanDefender, scanLocal, defenderStatus, defenderBinary, validatePdf, runProgram };
