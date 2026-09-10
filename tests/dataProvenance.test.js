const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeSourceCode,
  parseTimestamp,
  buildDataMeta,
  summarizeDataMeta
} = require('../utils/dataProvenance');

const NOW = '2026-09-04T00:00:00+08:00';

test('data provenance normalizes source aliases and fallback state', () => {
  assert.equal(normalizeSourceCode('飞书校招日历'), 'campus_feishu');
  const meta = buildDataMeta({ domain: 'job', source: 'local_fallback', publishedAt: '2026-09-01', now: NOW });
  assert.equal(meta.sourceCode, 'local');
  assert.equal(meta.sourceLabel, '历史职位库');
  assert.equal(meta.isFallback, true);
  assert.equal(meta.freshness, 'fresh');
  assert.ok(meta.fallbackReason);
});

test('job freshness uses published time and never treats fetch time as publication time', () => {
  assert.equal(buildDataMeta({ domain: 'job', source: 'jsearch', publishedAt: '2026-08-20', now: NOW }).freshness, 'fresh');
  assert.equal(buildDataMeta({ domain: 'job', source: 'jsearch', publishedAt: '2026-07-01', now: NOW }).freshness, 'aging');
  assert.equal(buildDataMeta({ domain: 'job', source: 'jsearch', publishedAt: '2026-05-01', now: NOW }).freshness, 'stale');
  assert.equal(buildDataMeta({ domain: 'job', source: 'jsearch', fetchedAt: NOW, now: NOW }).freshness, 'unknown');
});

test('campus freshness has a tighter sync window and explicit deadlines win', () => {
  assert.equal(buildDataMeta({ domain: 'campus', source: '飞书校招日历', updatedAt: '2026-09-01', now: NOW }).freshness, 'fresh');
  assert.equal(buildDataMeta({ domain: 'campus', source: '飞书校招日历', updatedAt: '2026-08-15', now: NOW }).freshness, 'aging');
  assert.equal(buildDataMeta({ domain: 'campus', source: '飞书校招日历', updatedAt: '2026-07-01', now: NOW }).freshness, 'stale');
  assert.equal(buildDataMeta({ domain: 'campus', source: '飞书校招日历', updatedAt: '2026-09-03', isExpired: true, now: NOW }).freshness, 'expired');
});

test('collection provenance reports degraded and freshness counts', () => {
  const items = [
    { dataMeta: buildDataMeta({ domain: 'job', source: 'jsearch', publishedAt: '2026-09-01', now: NOW }) },
    { dataMeta: buildDataMeta({ domain: 'job', source: 'local_fallback', publishedAt: '2026-05-01', now: NOW }) }
  ];
  const summary = summarizeDataMeta(items, { generatedAt: NOW });
  assert.deepEqual(summary.sourceCodes, ['jsearch', 'local']);
  assert.equal(summary.freshnessCounts.fresh, 1);
  assert.equal(summary.freshnessCounts.stale, 1);
  assert.equal(summary.fallbackCount, 1);
  assert.equal(summary.degraded, true);
});

test('timezone-free SQLite timestamps are interpreted as Shanghai time', () => {
  assert.equal(
    new Date(parseTimestamp('2026-08-10 12:31:54')).toISOString(),
    '2026-08-10T04:31:54.000Z'
  );
});
