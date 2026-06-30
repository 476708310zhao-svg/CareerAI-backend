require('dotenv').config();

const http = require('http');

const port = process.env.PORT || 3001;
const cronSecret = process.env.CRON_SECRET || '';
const dateArg = process.argv.find(arg => arg.startsWith('--date='));
const body = JSON.stringify(dateArg ? { date: dateArg.slice('--date='.length) } : {});

function dispatchReminders() {
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
          resolve({ statusCode: res.statusCode, body: responseBody });
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

dispatchReminders()
  .then(({ statusCode, body: responseBody }) => {
    console.log(`[reminder-dispatch] HTTP ${statusCode}`);
    console.log(responseBody);
  })
  .catch((err) => {
    console.error('[reminder-dispatch]', err.message);
    process.exit(1);
  });
