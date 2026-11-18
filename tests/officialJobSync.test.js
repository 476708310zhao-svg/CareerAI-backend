'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { execFileSync } = require('node:child_process');
const sync = require('../services/officialJobSync');

const schema = fs.readFileSync(path.join(__dirname, '../db/migrations/0034_official_job_sync.sql'), 'utf8');
const board = { id: 'sample', name: 'Sample', adapter: 'greenhouse', token: 'sample' };

function database() {
  const db = new Database(':memory:');
  db.exec(schema);
  return db;
}

function job(id) {
  return {
    job_id: `official_sample_${id}`, job_title: `Software Intern ${id}`,
    employer_name: 'Sample', job_city: 'Shanghai', job_country: 'CN',
    job_description: 'Build software', job_employment_type: 'INTERN',
    job_apply_link: `https://job-boards.greenhouse.io/sample/jobs/${id}`,
    job_source_url: `https://job-boards.greenhouse.io/sample/jobs/${id}`,
    job_source_reference: `greenhouse:sample:${id}`, job_posted_at_datetime_utc: '',
    job_updated_at_datetime_utc: '2026-11-17T00:00:00.000Z'
  };
}

function options(jobs, rawCount = jobs.length) {
  return { fetchSnapshot: async () => ({ jobs, rawCount }), clock: () => '2026-11-17T08:00:00.000Z' };
}

test('official sync requires migration and keeps published date distinct from source update', async () => {
  const missing = new Database(':memory:');
  try {
    assert.deepEqual(sync.listActiveRaw(missing), []);
    await assert.rejects(sync.syncBoard(missing, board, options([job(1)])), /migration 0034/i);
  } finally { missing.close(); }
  const db = database();
  try {
    const first = await sync.syncBoard(db, board, options([job(1)]));
    const second = await sync.syncBoard(db, board, options([job(1)]));
    assert.equal(first.status, 'ok');
    assert.equal(first.inserted_count, 1);
    assert.equal(second.updated_count, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM official_job_postings').get().n, 1);
    assert.equal(db.prepare('SELECT description FROM official_job_postings WHERE id=?').get('official_sample_1').description, '');
    assert.equal(sync.findActiveRaw(db, 'official_sample_1').job_posted_at_datetime_utc, '');
    assert.match(sync.findActiveRaw(db, 'official_sample_1').job_description, /本站整理的岗位概览.*Software Intern 1/);
    assert.match(sync.findActiveV4(db, 'official_sample_1').description, /工作地点为Shanghai/);
    assert.doesNotMatch(sync.findActiveV4(db, 'official_sample_1').description, /Build software/);
    assert.equal(sync.findActiveV4(db, 'official_sample_1').updatedAt, '2026-11-17T00:00:00.000Z');
    assert.equal(sync.listActiveRaw(db, 'Software').length, 1);
  } finally { db.close(); }
});

test('a posting closes only after two complete successful snapshots omit it', async () => {
  const db = database();
  try {
    await sync.syncBoard(db, board, options([job(1), job(2)]));
    const firstMiss = await sync.syncBoard(db, board, options([job(1)]));
    assert.equal(firstMiss.missing_count, 1);
    assert.ok(sync.findActiveRaw(db, 'official_sample_2'));
    const secondMiss = await sync.syncBoard(db, board, options([job(1)]));
    assert.equal(secondMiss.closed_count, 1);
    assert.equal(sync.findActiveRaw(db, 'official_sample_2'), null);
    await sync.syncBoard(db, board, options([job(1), job(2)]));
    assert.ok(sync.findActiveRaw(db, 'official_sample_2'));
  } finally { db.close(); }
});

test('upstream failure and unexpectedly empty board preserve published postings', async () => {
  const db = database();
  try {
    await sync.syncBoard(db, board, options([job(1)]));
    const failure = await sync.syncBoard(db, board, {
      fetchSnapshot: async () => { throw new Error('temporary upstream failure'); }
    });
    const empty = await sync.syncBoard(db, board, options([], 0));
    assert.equal(failure.status, 'error');
    assert.equal(empty.status, 'anomalous');
    assert.ok(sync.findActiveRaw(db, 'official_sample_1'));
    assert.equal(db.prepare('SELECT missing_successes FROM official_job_postings WHERE id=?').get('official_sample_1').missing_successes, 0);
  } finally { db.close(); }
});

test('invalid board response is recorded as an error without interrupting the next board', async () => {
  const db = database();
  const nextBoard = { ...board, id: 'next' };
  try {
    const runs = await sync.syncAll(db, {
      boards: [board, nextBoard],
      fetchSnapshot: async current => current.id === board.id
        ? { jobs: [{ ...job(1), job_apply_link: 'http://invalid.example/job' }], rawCount: 1 }
        : { jobs: [{ ...job(2), job_id: 'official_next_2' }], rawCount: 1 }
    });
    assert.deepEqual(runs.map(run => run.status), ['error', 'ok']);
    assert.equal(runs[0].error_code, 'invalid_official_posting');
    assert.ok(sync.findActiveRaw(db, 'official_next_2'));
  } finally { db.close(); }
});

test('mass disappearance is flagged for review instead of closing the board', async () => {
  const db = database();
  try {
    await sync.syncBoard(db, board, options([1, 2, 3, 4, 5, 6].map(job)));
    const run = await sync.syncBoard(db, board, options([job(1)]));
    assert.equal(run.status, 'anomalous');
    assert.equal(run.missing_count, 0);
    assert.equal(sync.listActiveRaw(db).length, 6);
  } finally { db.close(); }
});

test('snapshot serving starts after every registered board was attempted and one succeeded', async () => {
  const db = database();
  const other = { id: 'other', name: 'Other', adapter: 'ashby', token: 'other' };
  try {
    await sync.syncBoard(db, board, options([job(1)]));
    assert.equal(sync.readyToServe(db, [board, other]), false);
    await sync.syncBoard(db, other, { fetchSnapshot: async () => { throw new Error('unavailable'); } });
    assert.equal(sync.readyToServe(db, [board, other]), true);
    assert.equal(sync.latestBoardStatus(db, other.id).status, 'error');
  } finally { db.close(); }
});

test('new US board does not make an existing China snapshot unready', async () => {
  const db = database();
  try {
    for (const current of require('../services/cnOfficialPilot').LIVE_CN_BOARDS) {
      await sync.syncBoard(db, current, options(current.id === 'landor'
        ? [{ ...job(1), job_id: 'official_landor_1' }] : []));
    }
    assert.equal(sync.readyToServe(db), true);
    assert.equal(sync.latestBoardStatus(db, 'shein-us'), null);
  } finally { db.close(); }
});

test('empty first snapshots do not replace the existing live job search', async () => {
  const db = database();
  try {
    await sync.syncBoard(db, board, options([], 0));
    assert.equal(sync.readyToServe(db, [board]), false);
    await sync.syncBoard(db, board, options([job(1)]));
    assert.equal(sync.readyToServe(db, [board]), true);
  } finally { db.close(); }
});

test('storage keeps UK and China postings in separate market results', async () => {
  const db = database();
  const ukBoard = { id: 'uk-sample', name: 'UK Sample', adapter: 'lever', token: 'uk-sample', countryCode: 'gb' };
  const ukJob = { ...job(3), job_id: 'official_uk-sample_3', employer_name: 'UK Sample',
    job_city: 'London', job_country: 'GB', job_source_reference: 'lever:uk-sample:3' };
  try {
    await sync.syncBoard(db, board, options([job(1)]));
    await sync.syncBoard(db, ukBoard, options([ukJob]));
    assert.equal(sync.listActiveRaw(db, 'Software', 'cn').length, 1);
    assert.equal(sync.listActiveRaw(db, 'Software', 'gb').length, 1);
    assert.equal(sync.listActiveRaw(db, 'Software', 'global').length, 2);
    assert.equal(sync.findActiveV4(db, ukJob.job_id).region, '英国');
  } finally { db.close(); }
});

test('synced posting is shared by mobile aggregate, detail and V4 web jobs', () => {
  const output = execFileSync(process.execPath,
    [path.join(__dirname, 'helpers/officialJobSyncProbe.cjs')],
    { encoding: 'utf8', timeout: 30_000 });
  const line = output.split(/\r?\n/).find(item => item.startsWith('PROBE_RESULT:'));
  assert.ok(line, 'probe result missing');
  const result = JSON.parse(line.slice('PROBE_RESULT:'.length));
  assert.equal(result.ready, true);
  assert.equal(result.aggregateId, 'official_landor_912345');
  assert.equal(result.aggregateSource.count, 1);
  assert.equal(result.usAggregateId, 'official_shein-us_912347');
  assert.equal(result.usAggregateSource.country, 'us');
  assert.equal(result.usAggregateSource.count, 1);
  assert.equal(result.detailId, 'official_landor_912345');
  assert.equal(result.webFastJob.id, 'official_landor_912345');
  assert.match(result.webFastJob.description, /本站整理的岗位概览.*Design Intern/);
  assert.match(result.webFastJob.applyUrl, /^https:\/\//);
  assert.equal(result.webListJob.id, 'official_landor_912345');
  assert.match(result.webListJob.description, /本站整理的岗位概览.*Design Intern/);
  assert.equal(result.webOtherCountryHasJob, false);
  assert.equal(result.webOldOpenJobId, 'official_landor_912346');
  assert.equal(result.webSnapshotHasCursor, true);
  assert.equal(result.webClosedCursorStatus, 410);
  assert.equal(result.v4Id, 'official_landor_912345');
  assert.equal(result.applicationStatus, 200);
  assert.equal(result.applicationJobId, 'official_landor_912345');
});
