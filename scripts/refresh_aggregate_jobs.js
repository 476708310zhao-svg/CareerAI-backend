require('dotenv').config();

const http = require('http');

const port = process.env.PORT || 3001;
const cronSecret = process.env.CRON_SECRET || '';

function postRefresh() {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/api/aggregate/refresh',
      method: 'POST',
      timeout: 180000,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': 2,
        'X-Cron-Secret': cronSecret,
        'X-Triggered-By': 'server-cron'
      }
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ statusCode: res.statusCode, body });
          return;
        }
        reject(new Error(`refresh failed: HTTP ${res.statusCode} ${body}`));
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('refresh request timed out'));
    });
    req.on('error', reject);
    req.write('{}');
    req.end();
  });
}

postRefresh()
  .then(({ statusCode, body }) => {
    console.log(`[aggregate-refresh] HTTP ${statusCode}`);
    console.log(body);
  })
  .catch((err) => {
    console.error('[aggregate-refresh]', err.message);
    process.exit(1);
  });
