'use strict';
// One untrusted PDF operation per process. The parent enforces a wall-clock
// deadline and stdout byte cap, then kills this process if either is exceeded.
const fs = require('node:fs');
const PDFJS = require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');
const { layoutFromItems } = require('../services/questionPdfLayout');
PDFJS.disableWorker = true;

async function main() {
  const [mode, file, rawPageNumber] = process.argv.slice(2);
  if (!['meta','page'].includes(mode) || !file) throw Object.assign(new Error('INVALID_EXTRACTOR_INPUT'), { code: 'INVALID_EXTRACTOR_INPUT' });
  const document = await PDFJS.getDocument(fs.readFileSync(file));
  try {
    if (mode === 'meta') {
      process.stdout.write(JSON.stringify({ pageCount: document.numPages }));
      return;
    }
    const pageNumber = Number(rawPageNumber);
    if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 || pageNumber > document.numPages) {
      throw Object.assign(new Error('INVALID_PAGE_NUMBER'), { code: 'INVALID_PAGE_NUMBER' });
    }
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false });
    if (!content || !Array.isArray(content.items)) throw Object.assign(new Error('PDF_PAGE_EXTRACTION_FAILED'), { code: 'PDF_PAGE_EXTRACTION_FAILED' });
    // This PDF.js build cannot safely inspect drawing operators in Node. All
    // real digital pages therefore require human original-page review.
    const result = layoutFromItems(pageNumber, content.items, page.getViewport(1), { graphicsUnverified: true });
    process.stdout.write(JSON.stringify(result));
  } finally { document.destroy(); }
}

if (require.main === module) main().catch(error => {
  process.stderr.write(`ERR_CODE:${/^[A-Z_]+$/.test(error.code || '') ? error.code : 'PDF_PAGE_EXTRACTION_FAILED'}`);
  process.exitCode = 1;
});
