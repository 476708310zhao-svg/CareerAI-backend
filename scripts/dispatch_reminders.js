require('dotenv').config();

const http = require('http');

const port = process.env.PORT || 4400;
const cronSecret = process.env.CRON_SECRET || '';
const dateArg = process.argv.find(arg => arg.startsWith('--date='));
const batchArg = process.argv.find(arg => arg.startsWith('--batch-size='));
const concurrencyArg = process.argv.find(arg => arg.startsWith('--concurrency='));
const basePayload = {};
if (dateArg) basePayload.date = dateArg.slice('--date='.length);
if (batchArg) basePayload.batchSize = Number(batchArg.slice('--batch-size='.length));
if (concurrencyArg) basePayload.concurrency = Number(concurrencyArg.slice('--concurrency='.length));

function dispatchReminders(cursorId) {
  const body = JSON.stringify(Object.assign({}, basePayload, cursorId ? { cursorId } : {}));
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/api/notify/reminders/dispatch',
      method: 'POST',
      timeout: 90000,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-Cron-Secret': cronSecret,
        'X-Triggered-By': 'server-cron'
      }
    }, (res) => {
      let responseBody = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { responseBody += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          let parsed = null;
          try { parsed = JSON.parse(responseBody); } catch (error) {}
          resolve({ statusCode: res.statusCode, body: responseBody, parsed });
          return;
        }
        reject(new Error(`reminder dispatch failed: HTTP ${res.statusCode} ${responseBody}`));
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('reminder dispatch request timed out'));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function dispatchAllPages() {
  let cursorId = 0;
  let pages = 0;
  const totals = { checked: 0, due: 0, sent: 0, failed: 0, skipped: 0 };
  do {
    const response = await dispatchReminders(cursorId);
    const data = response.parsed && response.parsed.data || {};
    pages += 1;
    totals.checked += Number(data.checked) || 0;
    totals.due += Number(data.due) || 0;
    totals.sent += Array.isArray(data.sent) ? data.sent.length : 0;
    totals.failed += Array.isArray(data.failed) ? data.failed.length : 0;
    totals.skipped += Array.isArray(data.skipped) ? data.skipped.length : 0;
    cursorId = Number(data.nextCursorId) || 0;
  } while (cursorId && pages < 20);
  return { pages, totals, truncated: !!cursorId };
}

dispatchAllPages()
  .then(result => {
    console.log('[reminder-dispatch]', JSON.stringify(result));
    if (result.truncated || result.totals.failed > 0) process.exitCode = 1;
  })
  .catch((err) => {
    console.error('[reminder-dispatch]', err.message);
    process.exit(1);
  });
