'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createJobListSnapshotStore } = require('../utils/jobListSnapshot');

function probe(scenario) {
  const output = execFileSync(process.execPath,
    [path.join(__dirname, 'helpers', 'jobSnapshotProbe.cjs'), scenario],
    { encoding: 'utf8', timeout: 20_000 });
  const line = output.split(/\r?\n/).find(item => item.startsWith('PROBE_RESULT:'));
  assert.ok(line, 'snapshot probe result missing');
  return JSON.parse(line.slice('PROBE_RESULT:'.length));
}

test('snapshot continuation spans one deduplicated sample without refetching providers', () => {
  const result = probe('normal');
  const pages = [result.first, result.second, result.third];
  assert.ok(pages.every(item => item.status === 200));
  assert.deepEqual(pages.map(item => item.body.data.page), [1, 2, 3]);
  assert.deepEqual(pages.map(item => item.body.data.list.length), [3, 3, 3]);
  assert.ok(pages.every(item => item.body.data.total === 9 &&
    item.body.data.totalPages === 3 && item.body.data.totalScope === 'retrieved_snapshot' &&
    item.body.meta.totalScope === 'retrieved_snapshot'));
  assert.deepEqual(pages.map(item => item.body.data.hasMore), [true, true, false]);
  assert.equal(result.third.body.data.nextCursor, null);
  const ids = pages.flatMap(item => item.body.data.list.map(job => job.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.includes('rok_2'), false, 'duplicate RemoteOK entry excluded');
  assert.equal(ids.includes('js_duplicate'), true);
  assert.deepEqual(result.secondRetry.body.data.list.map(job => job.id),
    result.second.body.data.list.map(job => job.id));
  assert.equal(result.secondRetry.body.data.nextCursor, result.second.body.data.nextCursor);
  assert.equal(result.callsAfterFirst, 2);
  assert.equal(result.callsAfterPages, 2, 'continuation makes no provider request');
  assert.ok(pages.every(item => item.body.data.source === 'live'));
});

test('snapshot rejects mismatched filters, unknown cursors and invalid page bounds', () => {
  const result = probe('normal');
  assert.deepEqual([result.mismatch.status, result.mismatch.body.code], [400, 'JOB_SNAPSHOT_QUERY_MISMATCH']);
  assert.deepEqual([result.unknown.status, result.unknown.body.code], [410, 'JOB_SNAPSHOT_EXPIRED']);
  assert.deepEqual([result.badSize.status, result.badSize.body.code], [400, 'JOB_SNAPSHOT_BAD_PAGE']);
  assert.deepEqual([result.badPage.status, result.badPage.body.code], [400, 'JOB_SNAPSHOT_BAD_PAGE']);
  assert.deepEqual([result.objectFilter.status, result.objectFilter.body.code], [400, 'JOB_SNAPSHOT_BAD_FILTER']);
  assert.deepEqual([result.longFilter.status, result.longFilter.body.code], [400, 'JOB_SNAPSHOT_BAD_FILTER']);
});

test('wide source batches and large descriptions keep a bounded visible first page', () => {
  const result = probe('wide');
  assert.equal(result.first.status, 200);
  assert.equal(result.first.body.data.list.length, 3);
  assert.equal(result.first.body.data.total, 200);
  assert.equal(result.first.body.data.totalScope, 'retrieved_snapshot');
  assert.equal(result.first.body.data.snapshotTruncated, true);
  assert.equal(result.first.body.meta.totalScope, 'retrieved_snapshot');
  assert.ok(result.first.body.data.list.every(job => job.description.length <= 2000));
  assert.equal(result.detailLength, 20_000, 'detail remains independently accessible');
  assert.equal(result.callsAfterFirst, result.callsAfterPages);
});

test('provider failure freezes the local fallback while legacy and local page routes stay unchanged', () => {
  const failed = probe('failed');
  assert.equal(failed.first.status, 200);
  assert.equal(failed.first.body.data.source, 'local_fallback');
  assert.equal(failed.first.body.data.total, 5);
  assert.equal(failed.second.body.data.source, 'local_fallback');
  assert.equal(failed.callsAfterFirst, failed.callsAfterPages);

  const normal = probe('normal');
  assert.deepEqual([normal.local.status, normal.local.body.data.page,
    normal.local.body.data.total, normal.local.body.data.list.length], [200, 2, 5, 2]);
  assert.equal(normal.local.body.meta.totalScope, undefined);
  assert.equal(normal.legacy.status, 200);
  assert.equal(normal.legacy.body.data.page, 2);
  assert.equal(normal.legacy.body.data.nextCursor, undefined);
  assert.equal(normal.legacy.body.data.totalScope, undefined);
  assert.equal(normal.legacy.body.meta.totalScope, undefined);
  assert.ok(normal.calls.some(call => call.source === 'jsearch' && call.cursor === 'next-page'));
});

test('snapshot store expires, evicts and bounds in-memory results', () => {
  let currentTime = 100;
  const store = createJobListSnapshotStore({ now: () => currentTime, ttlMs: 50,
    maxSnapshots: 1, maxItems: 2, maxSnapshotBytes: 1000, maxTotalBytes: 1000 });
  const value = items => ({ items, pageSize: 1, fingerprint: 'filters', source: 'live',
    sources: ['jsearch'], dataMeta: {}, coverage: {} });
  const first = store.create(value([{ id: 'a' }, { id: 'b' }]));
  assert.ok(first.nextCursor);
  assert.equal(store.read(first.nextCursor, 'other').status, 'mismatch');
  assert.equal(store.read(first.nextCursor, 'filters').page.list[0].id, 'b');
  const second = store.create(value([{ id: 'c' }, { id: 'd' }]));
  assert.equal(store.read(first.nextCursor, 'filters').status, 'expired', 'evicted cursor fails closed');
  currentTime += 50;
  assert.equal(store.read(second.nextCursor, 'filters').status, 'expired', 'expired cursor fails closed');
  const limitedItems = store.create(value([{ id: 'x' }, { id: 'y' }, { id: 'z' }]));
  assert.equal(limitedItems.total, 2);
  assert.equal(limitedItems.snapshotTruncated, true);
  const limitedBytes = store.create(value([{ id: 'x'.repeat(1001) }, { id: 'safe' }]));
  assert.deepEqual(limitedBytes.list.map(job => job.id), ['safe']);
  assert.equal(limitedBytes.snapshotTruncated, true);
});
