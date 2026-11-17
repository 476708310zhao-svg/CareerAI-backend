'use strict';
// Runs in a bounded child process; validation alone never clears the scan gate.
const fs = require('node:fs');
const PDFJS = require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');
PDFJS.disableWorker = true;

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('INVALID_VALIDATION_INPUT');
  const document = await PDFJS.getDocument(fs.readFileSync(file));
  try {
    if (!Number.isSafeInteger(document.numPages) || document.numPages < 1 || document.numPages > 2000) {
      throw new Error('PDF_PAGE_COUNT_INVALID');
    }
    let textPages = 0;
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false });
      if (!content || !Array.isArray(content.items)) throw new Error('PDF_PAGE_INVALID');
      if (content.items.some(item => String(item.str || '').trim())) textPages++;
      page.cleanup();
    }
    process.stdout.write(JSON.stringify({ pageCount: document.numPages, textPages }));
  } finally { document.destroy(); }
}

if (require.main === module) main().catch(error => {
  process.stderr.write(`ERR_CODE:${['PDF_PAGE_COUNT_INVALID','PDF_PAGE_INVALID'].includes(error.message) ? error.message : 'PDF_STRUCTURE_INVALID'}`);
  process.exitCode = 1;
});
