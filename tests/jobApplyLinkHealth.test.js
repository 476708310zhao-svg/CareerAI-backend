const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const runtime = require('./helpers/isolatedTestRuntime.cjs');

runtime.install();
runtime.registerCleanup(test);

const { probeApplyUrl, runLinkCheckBatch, isPublicAddress, defaultRequest } = require('../services/jobApplyLinkHealth');

test('default transport uses pinned lookup and ignores proxy environment', async () => {
  let seenHost = '';
  const server = http.createServer((request, response) => {
    seenHost = request.headers.host;
    response.writeHead(200);
    response.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const previousProxy = process.env.HTTP_PROXY;
  const previousLowerProxy = process.env.http_proxy;
  try {
    process.env.HTTP_PROXY = 'http://127.0.0.1:1';
    process.env.http_proxy = 'http://127.0.0.1:1';
    const port = server.address().port;
    // Directly exercise the transport with a local socket. Probe validation blocks
    // loopback in production; this fixture only proves the validated address is pinned.
    const result = await defaultRequest({ url: new URL(`http://public-name.invalid:${port}/`),
      address: '127.0.0.1', family: 4, method: 'HEAD', timeoutMs: 1000 });
    assert.equal(result.statusCode, 200);
    assert.equal(seenHost, `public-name.invalid:${port}`);
  } finally {
    if (previousProxy === undefined) delete process.env.HTTP_PROXY;
    else process.env.HTTP_PROXY = previousProxy;
    if (previousLowerProxy === undefined) delete process.env.http_proxy;
    else process.env.http_proxy = previousLowerProxy;
    await new Promise(resolve => server.close(resolve));
  }
});

test('link probe rejects private addresses and every unsafe redirect before transport', async () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '169.254.169.254', '100.64.0.1',
    '192.168.1.1', '198.51.100.2', '::1', 'fc00::1', 'fe80::1',
    '::ffff:127.0.0.1', '2001:db8::1', '2002:c0a8:0101::']) {
    assert.equal(isPublicAddress(address), false, address);
  }
  assert.equal(isPublicAddress('8.8.8.8'), true);
  assert.equal(isPublicAddress('2001:4860:4860::8888'), true);
  let requests = 0;
  const requestHeaders = async () => { requests++; return { statusCode: 200 }; };
  for (const url of ['http://127.0.0.1/', 'http://[::1]/', 'https://user:pass@example.com/',
    'ftp://example.com/', 'https://example.com:8443/', 'http://metadata.google.internal/']) {
    assert.equal((await probeApplyUrl(url, { requestHeaders })).outcome, 'blocked', url);
  }
  const mixed = await probeApplyUrl('https://example.com/apply', {
    resolveHost: async () => [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }],
    requestHeaders
  });
  assert.equal(mixed.outcome, 'blocked');
  assert.equal(requests, 0);
  const redirect = await probeApplyUrl('https://example.com/apply', {
    resolveHost: async () => [{ address: '8.8.8.8', family: 4 }],
    requestHeaders: async () => { requests++; return { statusCode: 302, location: 'http://169.254.169.254/latest' }; }
  });
  assert.equal(redirect.outcome, 'blocked');
  assert.equal(redirect.reason, 'unsafe_address');
  assert.equal(requests, 1);
});

test('link probe classifies HTTP evidence without treating access blocks as closure', async () => {
  const calls = [];
  const resolveHost = async host => {
    calls.push(['resolve', host]);
    return [{ address: '8.8.8.8', family: 4 }];
  };
  const reachable = await probeApplyUrl('https://example.com/apply', {
    resolveHost, requestHeaders: async request => {
      calls.push(['request', request.url.hostname, request.address, request.method]);
      if (request.url.hostname === 'example.com') return { statusCode: 302, location: 'https://careers.example.org/apply' };
      if (request.method === 'HEAD') return { statusCode: 405 };
      return { statusCode: 200 };
    }
  });
  assert.deepEqual({ outcome: reachable.outcome, redirects: reachable.redirects, method: reachable.method },
    { outcome: 'reachable', redirects: 1, method: 'GET' });
  assert.deepEqual(calls, [
    ['resolve', 'example.com'], ['request', 'example.com', '8.8.8.8', 'HEAD'],
    ['resolve', 'careers.example.org'], ['request', 'careers.example.org', '8.8.8.8', 'HEAD'],
    ['request', 'careers.example.org', '8.8.8.8', 'GET']
  ]);
  for (const [code, expected] of [[403, 'inconclusive'], [429, 'inconclusive'],
    [500, 'inconclusive'], [404, 'needs_review'], [410, 'needs_review']]) {
    const result = await probeApplyUrl('https://example.com/', {
      resolveHost, requestHeaders: async () => ({ statusCode: code })
    });
    assert.equal(result.outcome, expected, String(code));
    assert.equal(result.statusCode, code);
  }
  const failed = await probeApplyUrl('https://example.com/', {
    resolveHost, requestHeaders: async () => { throw new Error('connection reset'); }
  });
  assert.equal(failed.outcome, 'inconclusive');
  assert.equal(failed.reason, 'network_error');
});

test('batch records only current verified employer URL and never changes human status', async () => {
  runtime.prepare();
  const jobsPath = path.join(runtime.paths().dataDir, 'jobs.json');
  require('../utils/jobsFile').ensureJobsFile();
  const previous = fs.readFileSync(jobsPath);
  const url = 'https://example.com/apply';
  const data = { jobs: [
    { id: 1, title: 'Open', company: 'A', applyUrl: url },
    { id: 2, title: 'Closed', company: 'B', applyUrl: 'https://example.org/apply' },
    { id: 3, title: 'Invalid legacy URL', company: 'C', applyUrl: 'javascript:old' }
  ], companies: [], jobVerification: {
    '1': { status: 'open', employerApplyUrl: url, version: 1, availabilityHold: false },
    '2': { status: 'closed', employerApplyUrl: 'https://example.org/apply', version: 1, availabilityHold: true },
    '3': { status: 'open', employerApplyUrl: 'https://example.net/apply', version: 1, availabilityHold: false }
  } };
  try {
    fs.writeFileSync(jobsPath, JSON.stringify(data));
    const store = require('../utils/adminJobsStore');
    assert.deepEqual(store.listLinkCheckCandidates(10).map(item => item.id), [1]);
    const summary = await runLinkCheckBatch({ limit: 10, store, probeOptions: {
      resolveHost: async () => [{ address: '8.8.8.8', family: 4 }],
      requestHeaders: async () => ({ statusCode: 404 })
    } });
    assert.equal(summary.recorded, 1);
    assert.equal(summary.needs_review, 1);
    const saved = JSON.parse(fs.readFileSync(jobsPath, 'utf8'));
    assert.equal(saved.jobVerification['1'].status, 'open');
    assert.equal(saved.jobApplyLinkHealth['1'].statusCode, 404);
    assert.equal(store.listJobs()[0].linkHealth.outcome, 'needs_review');
    assert.equal(store.getJobVerification(1).linkHealth.outcome, 'needs_review');
    const beforeOld = fs.readFileSync(jobsPath);
    assert.equal(store.recordLinkCheck(1, url, { outcome: 'reachable', checkedAt: '2020-01-01T00:00:00.000Z' }), false);
    assert.deepEqual(fs.readFileSync(jobsPath), beforeOld);
    const malformed = JSON.parse(beforeOld);
    malformed.jobs[0].applyUrl = 'javascript:changed-outside-admin';
    fs.writeFileSync(jobsPath, JSON.stringify(malformed));
    const beforeMalformed = fs.readFileSync(jobsPath);
    assert.equal(store.recordLinkCheck(1, url, { outcome: 'reachable' }), false);
    assert.deepEqual(fs.readFileSync(jobsPath), beforeMalformed);
    assert.deepEqual(store.listLinkCheckCandidates(10), []);
    fs.writeFileSync(jobsPath, beforeOld);
    store.updateJob(1, { applyUrl: 'https://example.com/new' }, { id: 1, username: 'tester' });
    const beforeStale = fs.readFileSync(jobsPath);
    assert.equal(store.recordLinkCheck(1, url, { outcome: 'reachable' }), false);
    assert.deepEqual(fs.readFileSync(jobsPath), beforeStale);
    assert.equal(store.listJobs()[0].verification.status, 'review_needed');
    assert.equal(store.listJobs()[0].linkHealth, null);
    assert.equal(store.deleteJob(1, { id: 1, username: 'tester' }), true);
    const afterDelete = JSON.parse(fs.readFileSync(jobsPath, 'utf8'));
    assert.equal(afterDelete.jobApplyLinkHealth['1'], undefined);
  } finally {
    fs.writeFileSync(jobsPath, previous);
  }
});
