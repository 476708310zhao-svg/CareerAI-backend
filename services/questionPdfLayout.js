'use strict';
const path = require('node:path');
const { spawn } = require('node:child_process');
const store = require('./questionAssetStore');
const ocr = require('./questionPdfOcr');

const PARSER_VERSION = 'digital-pdf-v1';
const MAX_ITEMS_PER_PAGE = 5000;
const WORKER_SCRIPT = path.join(__dirname, '..', 'scripts', 'question_pdf_page_worker.js');
const MAX_CHILD_PAGE_OUTPUT = 3 * 1024 * 1024;
const problem = (code, status = 503) => Object.assign(new Error(code), { code, status });

function layoutFromItems(pageNumber, items, viewport = {}, metadata = {}) {
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 || !Array.isArray(items)) throw problem('INVALID_PAGE_LAYOUT', 400);
  if (items.length > MAX_ITEMS_PER_PAGE) throw problem('PAGE_LAYOUT_BUDGET_EXCEEDED', 429);
  const blocks = items.map((item, index) => {
    const transform = Array.isArray(item.transform) ? item.transform : [];
    const number = value => Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) / 100 : 0;
    const originalText = String(item.str || '');
    if (originalText.length > 2000) throw problem('PAGE_LAYOUT_BUDGET_EXCEEDED', 429);
    return { text: originalText, x: number(transform[4]), y: number(transform[5]),
      width: number(item.width), height: number(item.height), order: index };
  }).filter(block => block.text.trim());
  const sorted = [...blocks].sort((a, b) => Math.abs(a.y - b.y) <= 3 ? a.x - b.x || a.order - b.order : b.y - a.y);
  const lines = [];
  for (const block of sorted) {
    const line = lines.at(-1);
    if (line && Math.abs(line.y - block.y) <= 3) {
      if (line.blocks.length && block.x > line.blocks.at(-1).x + line.blocks.at(-1).width + 1) line.text += ' ';
      line.text += block.text;
      line.blocks.push(block);
    } else lines.push({ y: block.y, text: block.text, blocks: [block] });
  }
  const text = lines.map(line => line.text.trim()).filter(Boolean).join('\n');
  if (Buffer.byteLength(text, 'utf8') > 512 * 1024) throw problem('PAGE_LAYOUT_BUDGET_EXCEEDED', 429);
  const width = Number(viewport.width) || 0;
  const midpoint = width / 2;
  const left = blocks.filter(block => block.x < midpoint - 15);
  const right = blocks.filter(block => block.x >= midpoint + 15);
  const overlapRows = left.filter(a => right.some(b => Math.abs(a.y - b.y) < 8)).length;
  const twoColumns = width > 0 && left.length >= 4 && right.length >= 4 && overlapRows >= 3;
  const hasEmbeddedGraphic = metadata.hasEmbeddedGraphic === true;
  const status = !text.trim() ? 'scanned' : twoColumns || hasEmbeddedGraphic ? 'complex_layout' : 'digital';
  return { page: pageNumber, text, blocks, width: Number(viewport.width) || null,
    height: Number(viewport.height) || null, status,
    flags: [...(twoColumns ? ['POSSIBLE_TWO_COLUMNS'] : []), ...(hasEmbeddedGraphic ? ['EMBEDDED_GRAPHIC'] : []),
      ...(metadata.graphicsUnverified === true ? ['GRAPHIC_CONTENT_UNVERIFIED'] : [])] };
}

function verifiedFile(asset) {
  store.verify(asset.storage_key, asset.sha256, asset.byte_size);
  return path.join(store.privateRoot, asset.storage_key);
}

function runIsolated(mode, file, pageNumber, options = {}) {
  if (!['meta','page'].includes(mode) || typeof file !== 'string' || !file) throw problem('INVALID_EXTRACTOR_INPUT', 400);
  const timeoutMs = Math.max(1, Math.min(Number(options.timeoutMs) || (mode === 'meta' ? 15_000 : 10_000), 15_000));
  const maxOutputBytes = Math.max(128, Math.min(Number(options.maxOutputBytes) ||
    (mode === 'meta' ? 2048 : MAX_CHILD_PAGE_OUTPUT), MAX_CHILD_PAGE_OUTPUT));
  const script = options.workerScript || WORKER_SCRIPT;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--max-old-space-size=192', script, mode, file, String(pageNumber || 0)], {
      shell: false, windowsHide: true, stdio: ['ignore','pipe','pipe'],
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
        TEMP: process.env.TEMP, TMP: process.env.TMP, NODE_OPTIONS: '' }
    });
    const chunks = []; let bytes = 0, stderr = '', settled = false;
    const fail = error => { if (settled) return; settled = true; clearTimeout(timer); child.kill('SIGKILL'); reject(error); };
    const timer = setTimeout(() => fail(problem(mode === 'meta' ? 'PDF_OPEN_TIMEOUT' : 'PDF_PAGE_TIMEOUT')), timeoutMs);
    child.stdout.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > maxOutputBytes) return fail(problem('PDF_PAGE_OUTPUT_LIMIT', 413));
      chunks.push(chunk);
    });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-1024); });
    child.on('error', () => fail(problem('PDF_EXTRACTOR_UNAVAILABLE')));
    child.on('close', code => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (code !== 0) {
        const match = /ERR_CODE:([A-Z_]+)/.exec(stderr);
        return reject(problem(match?.[1] || 'PDF_PAGE_EXTRACTION_FAILED'));
      }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (_) { reject(problem('PDF_PAGE_EXTRACTION_FAILED')); }
    });
  });
}

async function openVerifiedPdf(asset, timeoutMs = 15_000) {
  if (!asset || !/^[a-f0-9]{64}$/.test(asset.sha256 || '')) throw problem('ASSET_STORAGE_MISMATCH');
  const file = verifiedFile(asset);
  const result = await runIsolated('meta', file, 0, { timeoutMs });
  if (!Number.isSafeInteger(result.pageCount) || result.pageCount < 1) throw problem('PDF_NO_PAGES', 422);
  return { document: { file }, pageCount: result.pageCount, close: () => {} };
}

async function extractPage(document, pageNumber, timeoutMs = 10_000, options = {}) {
  if (!document || typeof document.file !== 'string' || !Number.isSafeInteger(pageNumber) || pageNumber < 1) throw problem('INVALID_EXTRACTOR_INPUT', 400);
  const digitalTimeout = Math.min(timeoutMs, 10_000);
  const result = await runIsolated('page', document.file, pageNumber, { timeoutMs: digitalTimeout });
  if (!result || result.page !== pageNumber || !Array.isArray(result.blocks) ||
      !['digital','scanned','complex_layout'].includes(result.status)) throw problem('PDF_PAGE_EXTRACTION_FAILED');
  if (result.status !== 'scanned' || process.env.QUESTION_PDF_OCR_ENABLED !== '1') return result;
  const recognized = await ocr.extractScannedPage(document.file, pageNumber, timeoutMs - digitalTimeout, options);
  if (recognized.page !== pageNumber || typeof recognized.text !== 'string' || !Array.isArray(recognized.blocks))
    throw problem('OCR_RESULT_UNVERIFIED');
  return recognized;
}

module.exports = { PARSER_VERSION, MAX_ITEMS_PER_PAGE, MAX_CHILD_PAGE_OUTPUT,
  layoutFromItems, openVerifiedPdf, extractPage, runIsolated, problem };
