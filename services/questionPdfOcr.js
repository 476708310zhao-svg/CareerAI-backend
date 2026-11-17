'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const store = require('./questionAssetStore');
const { hasAnswerAppendixHeading } = require('./questionPdfParser');

const WORKER = path.join(__dirname, '..', 'scripts', 'question_pdf_ocr_worker.js');
const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
const MAX_TEXT_BYTES = 512 * 1024;
const problem = (code, status = 503) => Object.assign(new Error(code), { code, status });

function modelDirectory() {
  const directory = process.env.QUESTION_PDF_OCR_DATA_DIR;
  if (!directory || !path.isAbsolute(directory)) throw problem('OCR_MODELS_UNAVAILABLE');
  for (const language of ['chi_sim', 'eng']) {
    const file = path.join(directory, `${language}.traineddata`);
    try {
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 100_000 || stat.size > 100 * 1024 * 1024) throw new Error();
    } catch (_) { throw problem('OCR_MODELS_UNAVAILABLE'); }
  }
  return directory;
}

function renderPage(file, pageNumber, timeoutMs = 20_000, profile = 'questions') {
  return new Promise((resolve, reject) => {
    const binary = process.env.QUESTION_PDFTOPPM_PATH || 'pdftoppm';
    const renderArgs = profile === 'answers' ? ['-scale-to', '2100'] : ['-scale-to', '2600', '-gray'];
    const child = spawn(binary, ['-f', String(pageNumber), '-l', String(pageNumber), '-singlefile',
      ...renderArgs, '-png', file], { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = []; let size = 0, done = false;
    const fail = code => { if (done) return; done = true; clearTimeout(timer); child.kill('SIGKILL'); reject(problem(code)); };
    const timer = setTimeout(() => fail('OCR_RENDER_TIMEOUT'), timeoutMs);
    child.stdout.on('data', chunk => { size += chunk.length; if (size > MAX_IMAGE_BYTES) return fail('OCR_IMAGE_TOO_LARGE'); chunks.push(chunk); });
    child.stderr.on('data', () => {});
    child.on('error', () => fail('OCR_RENDER_UNAVAILABLE'));
    child.on('close', code => {
      if (done) return;
      done = true; clearTimeout(timer);
      const image = Buffer.concat(chunks);
      if (code !== 0 || !image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
        return reject(problem('OCR_RENDER_FAILED'));
      resolve(image);
    });
  });
}

function recognizeImage(image, directory, timeoutMs = 65_000, profile = 'questions') {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--max-old-space-size=512', WORKER], {
      shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
        TEMP: process.env.TEMP, TMP: process.env.TMP, NODE_OPTIONS: '', QUESTION_PDF_OCR_DATA_DIR: directory,
        QUESTION_PDF_OCR_PROFILE: profile }
    });
    const chunks = []; let size = 0, stderr = '', done = false;
    const fail = code => { if (done) return; done = true; clearTimeout(timer); child.kill('SIGKILL'); reject(problem(code)); };
    const timer = setTimeout(() => fail('OCR_TIMEOUT'), timeoutMs);
    child.stdout.on('data', chunk => { size += chunk.length; if (size > MAX_TEXT_BYTES + 4096) return fail('OCR_OUTPUT_LIMIT'); chunks.push(chunk); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString('utf8')).slice(-1024); });
    child.stdin.on('error', () => {});
    child.on('error', () => fail('OCR_UNAVAILABLE'));
    child.on('close', code => {
      if (done) return;
      done = true; clearTimeout(timer);
      if (code !== 0) return reject(problem(/ERR_CODE:(OCR_[A-Z_]+)/.exec(stderr)?.[1] || 'OCR_PROCESS_FAILED'));
      try {
        const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (typeof result.text !== 'string' || Buffer.byteLength(result.text, 'utf8') > MAX_TEXT_BYTES ||
            result.confidence !== null && (!Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 100))
          throw new Error();
        resolve(result);
      } catch (_) { reject(problem('OCR_RESULT_UNVERIFIED')); }
    });
    child.stdin.end(image);
  });
}

async function extractScannedPage(file, pageNumber, timeoutMs = 90_000, options = {}) {
  if (process.env.QUESTION_PDF_OCR_ENABLED !== '1') throw problem('OCR_NOT_ENABLED');
  store.assertAvailable();
  const directory = modelDirectory();
  const deadline = Date.now() + timeoutMs;
  const runProfile = async profile => {
    const image = await renderPage(file, pageNumber, Math.min(20_000, Math.max(1, deadline - Date.now())), profile);
    return recognizeImage(image, directory, Math.min(50_000, Math.max(1, deadline - Date.now())), profile);
  };
  let profile = options.answerAppendix ? 'answers' : 'questions';
  let result;
  let fallback = false;
  try { result = await runProfile(profile); }
  catch (error) {
    if (profile !== 'questions' || error.code !== 'OCR_TIMEOUT' || deadline - Date.now() < 5_000) throw error;
    profile = 'answers'; fallback = true;
    result = await runProfile(profile);
  }
  // The first answer page is not known until its heading is read. Re-read it
  // with the answer profile so later pages use the same, better suited mode.
  if (profile === 'questions' && hasAnswerAppendixHeading(result.text) && deadline - Date.now() >= 5_000) {
    try { result = await runProfile('answers'); profile = 'answers'; }
    catch (_) { fallback = true; }
  }
  const text = result.text.replace(/\r\n/g, '\n').trim();
  const flags = ['OCR_UNVERIFIED', 'GRAPHIC_CONTENT_UNVERIFIED'];
  if (fallback) flags.push('OCR_PROFILE_FALLBACK');
  if (result.confidence !== null && result.confidence < 65) flags.push('OCR_LOW_CONFIDENCE');
  if (!text) flags.push('OCR_EMPTY');
  return { page: pageNumber, text, blocks: [], width: null, height: null,
    status: text ? 'complex_layout' : 'scanned', flags, ocrConfidence: result.confidence };
}

module.exports = { extractScannedPage, modelDirectory, renderPage, recognizeImage, problem };
