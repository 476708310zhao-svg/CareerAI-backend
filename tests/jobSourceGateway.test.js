const test = require('node:test');
const assert = require('node:assert/strict');
const { createJobSourceGateway } = require('../services/jobSourceGateway');

test('job source requests coalesce and reuse a bounded fresh cache', async () => {
  let time = 1_000;
  let calls = 0;
  const gateway = createJobSourceGateway({ now: () => time, sleep: async () => {} });
  const fetcher = async () => { calls += 1; return [{ id: calls }]; };
  const policy = { ttlMs: 100, minIntervalMs: 0 };

  const [first, second] = await Promise.all([
    gateway.request('jsearch', 'us:engineer', fetcher, policy),
    gateway.request('jsearch', 'us:engineer', fetcher, policy)
  ]);
  assert.strictEqual(first, second);
  assert.equal(calls, 1);
  assert.strictEqual(await gateway.request('jsearch', 'us:engineer', fetcher, policy), first);
  time += 101;
  assert.deepEqual(await gateway.request('jsearch', 'us:engineer', fetcher, policy), [{ id: 2 }]);
});

test('429 and 403 open a source-wide circuit instead of retrying queued keys', async () => {
  let time = 1_000;
  let calls = 0;
  const gateway = createJobSourceGateway({ now: () => time, sleep: async () => {} });
  const blocked = async () => {
    calls += 1;
    throw { response: { status: 429, headers: { 'retry-after': '1200' } } };
  };
  const policy = { ttlMs: 0, minIntervalMs: 0 };

  const attempts = await Promise.allSettled([
    gateway.request('jsearch', 'us', blocked, policy),
    gateway.request('jsearch', 'gb', blocked, policy)
  ]);
  assert.equal(calls, 1);
  assert.equal(attempts[0].reason.reason, 'rate_limited');
  assert.equal(attempts[1].reason.reason, 'cooldown');
  time += 1_200_001;
  await assert.rejects(gateway.request('jsearch', 'de', async () => {
    calls += 1;
    throw { response: { status: 403 } };
  }, policy), error => error.status === 403);
  await assert.rejects(gateway.request('jsearch', 'fr', blocked, policy), error => error.reason === 'cooldown');
  assert.equal(calls, 2);
});

test('three transient failures pause one source without affecting another', async () => {
  let time = 10_000;
  const gateway = createJobSourceGateway({ now: () => time, sleep: async () => {} });
  let calls = 0;
  for (let index = 0; index < 3; index++) {
    await assert.rejects(gateway.request('themuse', String(index), async () => {
      calls += 1;
      throw { response: { status: 503 } };
    }, { minIntervalMs: 0 }), error => error.reason === 'upstream_error');
  }
  await assert.rejects(gateway.request('themuse', 'later', async () => { calls += 1; }),
    error => error.reason === 'cooldown');
  assert.equal(calls, 3);
  assert.equal(await gateway.request('remoteok', 'feed', async () => 'ok', { minIntervalMs: 0 }), 'ok');
  time += 120_001;
  assert.equal(await gateway.request('themuse', 'later', async () => 'recovered', { minIntervalMs: 0 }), 'recovered');
});

test('a configurable daily request budget caps unique upstream calls and resets the next UTC day', async () => {
  let time = 10_000;
  let calls = 0;
  const gateway = createJobSourceGateway({ now: () => time, sleep: async () => {} });
  const policy = { ttlMs: 0, minIntervalMs: 0, dailyBudget: 2 };
  const fetcher = async () => ++calls;
  assert.equal(await gateway.request('jsearch', 'us', fetcher, policy), 1);
  assert.equal(await gateway.request('jsearch', 'gb', fetcher, policy), 2);
  await assert.rejects(gateway.request('jsearch', 'de', fetcher, policy),
    error => error.reason === 'budget_exhausted');
  assert.equal(calls, 2);
  time += 86_400_000;
  assert.equal(await gateway.request('jsearch', 'de', fetcher, policy), 3);
});

test('JSearch multi-page credits count against the daily budget before the request', async () => {
  let calls = 0;
  const gateway = createJobSourceGateway({ now: () => 10_000, sleep: async () => {} });
  const fetcher = async () => ++calls;
  const policy = { ttlMs: 0, minIntervalMs: 0, dailyBudget: 3 };
  assert.equal(await gateway.request('jsearch', 'two-pages', fetcher, { ...policy, requestCost: 2 }), 1);
  await assert.rejects(gateway.request('jsearch', 'another-two-pages', fetcher, { ...policy, requestCost: 2 }),
    error => error.reason === 'budget_exhausted');
  assert.equal(await gateway.request('jsearch', 'one-page', fetcher, { ...policy, requestCost: 1 }), 2);
  assert.equal(calls, 2);
});
