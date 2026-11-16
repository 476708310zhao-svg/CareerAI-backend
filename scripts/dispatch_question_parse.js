'use strict';
const crypto = require('node:crypto');
const db = require('../db/database');
const { createQuestionParseJobs } = require('../services/questionParseJobs');

const service = createQuestionParseJobs(db);
const once = !process.argv.includes('--loop');
const workerId = `digital-pdf-${process.pid}-${crypto.randomUUID()}`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  do {
    const result = await service.processNext(workerId);
    if (result) console.log(JSON.stringify({ jobId: result.id, status: result.status, reasonCode: result.reasonCode }));
    if (once) return;
    if (!result) await sleep(5000);
  } while (true);
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { main };
