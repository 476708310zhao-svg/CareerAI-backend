'use strict';
// Receives one rendered PNG on stdin. The parent bounds image size, output,
// memory and wall time, and never sends the private PDF to an OCR provider.
const { createWorker } = require('tesseract.js');

async function readImage() {
  const chunks = []; let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 16 * 1024 * 1024) throw new Error('OCR_IMAGE_TOO_LARGE');
    chunks.push(chunk);
  }
  const image = Buffer.concat(chunks);
  if (!image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('OCR_INVALID_IMAGE');
  return image;
}

async function main() {
  const modelDir = process.env.QUESTION_PDF_OCR_DATA_DIR;
  if (!modelDir) throw new Error('OCR_MODELS_UNAVAILABLE');
  const image = await readImage();
  const worker = await createWorker(['chi_sim', 'eng'], 1,
    { langPath: modelDir, gzip: false, cacheMethod: 'none' });
  try {
    // Full-page exam scans have dense horizontal text and two-column options.
    // PSM 6 keeps the reading lines together; spacing preserves option gaps.
    if (process.env.QUESTION_PDF_OCR_PROFILE !== 'answers')
      await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
    const result = await worker.recognize(image);
    const text = String(result.data?.text || '');
    const confidence = Number(result.data?.confidence);
    process.stdout.write(JSON.stringify({ text, confidence: Number.isFinite(confidence) ? confidence : null }));
  } finally { await worker.terminate(); }
}

main().catch(error => {
  const code = ['OCR_IMAGE_TOO_LARGE', 'OCR_INVALID_IMAGE', 'OCR_MODELS_UNAVAILABLE'].includes(error.message)
    ? error.message : 'OCR_PROCESS_FAILED';
  process.stderr.write(`ERR_CODE:${code}`);
  process.exitCode = 1;
});
