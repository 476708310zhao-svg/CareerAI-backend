const test = require('node:test');
const assert = require('node:assert/strict');
const pilot = require('../services/cnOfficialPilot');

test('20 distinct employers have fixed official HTTPS entrances with honest sync modes', () => {
  const boards = pilot.directory();
  assert.equal(boards.length, 20);
  assert.equal(new Set(boards.map(board => board.id)).size, 20);
  assert.equal(boards.filter(board => board.mode === 'auto_sync').length, 10);
  assert.equal(boards.filter(board => board.mode === 'official_link').length, 10);
  for (const board of boards) assert.match(board.url, /^https:\/\//);
});

test('Greenhouse posting keeps source evidence without inventing a publication date or salary', () => {
  const board = pilot.LIVE_BOARDS.find(item => item.id === 'landor');
  const job = pilot.normalizeRow(board, {
    id: 123, title: 'Design Intern', location: { name: 'Shanghai' },
    content: '<p>Design portfolio required</p>', updated_at: '2026-10-29T00:00:00Z',
    absolute_url: 'https://job-boards.greenhouse.io/landor/jobs/123'
  });
  assert.equal(job.job_id, 'official_landor_123');
  assert.equal(job.job_country, 'CN');
  assert.equal(job.job_posted_at_datetime_utc, '');
  assert.equal(job.job_description, 'Design portfolio required');
  assert.equal(job.job_min_salary, undefined);
  assert.equal(job.job_source_reference, 'greenhouse:landor:123');
  assert.equal(pilot.normalizeRow(board, { id: 124, title: 'Design Intern',
    location: { name: 'London' } }), null);
  assert.equal(pilot.normalizeRow(board, { id: 126, title: 'Design Intern',
    location: { name: 'Hong Kong, China' },
    absolute_url: 'https://job-boards.greenhouse.io/landor/jobs/126' }), null);
  assert.equal(pilot.normalizeRow(board, { id: 125, title: 'Design Intern',
    location: { name: 'Shanghai' } }), null); // A board homepage is not a job detail.
  assert.equal(pilot.normalizeRow(board, { id: 127, internal_job_id: null,
    title: 'Prospect Internship', location: { name: 'Shanghai' },
    absolute_url: 'https://job-boards.greenhouse.io/landor/jobs/127' }), null);
});

test('Ashby publication date is preserved while Lever creation date is not presented as publication', () => {
  const ashby = pilot.LIVE_BOARDS.find(item => item.id === 'meshy');
  const lever = pilot.LIVE_BOARDS.find(item => item.id === 'hypebeast');
  const a = pilot.normalizeRow(ashby, { id: 'a1', title: 'Software Intern',
    location: 'Beijing', jobUrl: 'https://jobs.ashbyhq.com/meshy/a1',
    applyUrl: 'https://jobs.ashbyhq.com/meshy/a1/application',
    publishedAt: '2026-10-01T00:00:00Z' });
  const l = pilot.normalizeRow(lever, { id: 'l1', text: 'Marketing Intern',
    categories: { location: 'Shanghai' }, hostedUrl: 'https://jobs.lever.co/hypebeast/l1',
    createdAt: 1790812800000 });
  assert.equal(a.job_apply_link, 'https://jobs.ashbyhq.com/meshy/a1/application');
  assert.equal(a.job_posted_at_datetime_utc, '2026-10-01T00:00:00.000Z');
  assert.equal(l.job_id, 'official_hypebeast_l1');
  assert.equal(l.job_posted_at_datetime_utc, '');
});

test('Ashby unlisted posts are excluded from search and cannot be reopened by official ID', async () => {
  const board = pilot.LIVE_BOARDS.find(item => item.id === 'meshy');
  const unlisted = { id: 'hidden', isListed: false, title: 'Data Analyst Intern',
    location: 'Shanghai', jobUrl: 'https://jobs.ashbyhq.com/meshy/hidden' };
  assert.equal(pilot.normalizeRow(board, unlisted), null);
  const httpGet = async url => ({ data: { jobs: url.includes('/meshy') ? [unlisted] : [] } });
  assert.equal((await pilot.search('实习', { httpGet })).jobs.length, 0);
  assert.equal(await pilot.findById('official_meshy_hidden', { httpGet }), null);
});

test('China secondary location is shown as the job city instead of a foreign primary location', () => {
  const ashby = pilot.LIVE_BOARDS.find(item => item.id === 'meshy');
  const job = pilot.normalizeRow(ashby, { id: 'multi', isListed: true,
    title: 'Software Intern', location: 'Houston, TX',
    secondaryLocations: [{ location: 'Shanghai' }],
    jobUrl: 'https://jobs.ashbyhq.com/meshy/multi' });
  assert.equal(job.job_city, 'Shanghai');
  assert.equal(job.job_country, 'CN');
});

test('one transient upstream 502 is retried, while a subscription 403 is not', async () => {
  const board = pilot.LIVE_BOARDS.find(item => item.id === 'landor');
  let calls = 0;
  const httpGet = async () => {
    calls += 1;
    if (calls === 1) throw { response: { status: 502 } };
    return { data: { jobs: [{ id: 999, title: 'Design Intern',
      location: { name: 'Shanghai' },
      absolute_url: 'https://job-boards.greenhouse.io/landor/jobs/999' }] } };
  };
  assert.equal((await pilot.fetchBoard(board, { httpGet })).length, 1);
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(() => pilot.fetchBoard(board, { httpGet: async () => {
    calls += 1;
    throw { response: { status: 403 } };
  } }));
  assert.equal(calls, 1);
});

test('one failed board does not turn genuine empty sources into fabricated openings', async () => {
  const httpGet = async url => {
    if (url.includes('/landor/')) throw new Error('temporary failure');
    if (url.includes('/meshy')) return { data: { jobs: [{ id: 'm1', title: 'Data Analyst Intern',
      location: 'Shanghai', jobUrl: 'https://jobs.ashbyhq.com/meshy/m1' }] } };
    if (url.includes('api.lever.co')) return { data: [] };
    return { data: { jobs: [] } };
  };
  const result = await pilot.search('数据分析实习', { httpGet });
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].job_title, 'Data Analyst Intern');
  assert.equal(result.boardStatus.find(item => item.id === 'landor').status, 'unavailable');
  assert.equal(result.boardStatus.find(item => item.id === 'enhesa').status, 'empty');
  assert.equal(result.boardStatus.find(item => item.id === 'meshy').count, 1);
});

test('Ashby public posting without id keeps a stable key from its official URL', () => {
  const board = pilot.LIVE_BOARDS.find(item => item.id === 'meshy');
  const row = { title: 'Software Intern', location: 'Shanghai',
    jobUrl: 'https://jobs.ashbyhq.com/meshy/a1?utm_source=test',
    applyUrl: 'https://jobs.ashbyhq.com/meshy/a1/application' };
  const first = pilot.normalizeRow(board, row);
  const second = pilot.normalizeRow(board, { ...row, jobUrl: 'https://jobs.ashbyhq.com/meshy/a1?utm_source=other' });
  assert.match(first.job_id, /^official_meshy_url_[a-f0-9]{20}$/);
  assert.equal(first.job_id, second.job_id);
});

test('Greenhouse custom careers host needs explicit allowlist', () => {
  const original = pilot.LIVE_BOARDS.find(item => item.id === 'landor');
  const row = { id: 123, title: 'Design Intern', location: { name: 'Shanghai' },
    absolute_url: 'https://careers.example.com/jobs/123' };
  assert.equal(pilot.normalizeRow(original, row), null);
  assert.ok(pilot.normalizeRow({ ...original, allowedHosts: ['careers.example.com'] }, row));
});

test('Lever board reads all complete pages and supports the EU instance', async () => {
  const board = { id: 'eu-example', name: 'EU Example', adapter: 'lever', token: 'eu-example', region: 'eu' };
  const urls = [];
  const posting = id => ({ id: `p${id}`, text: 'Marketing Intern',
    categories: { location: 'Shanghai' },
    hostedUrl: `https://jobs.eu.lever.co/eu-example/p${id}` });
  const result = await pilot.fetchBoardSnapshot(board, { httpGet: async url => {
    urls.push(url);
    return { data: urls.length === 1 ? Array.from({ length: 100 }, (_, index) => posting(index)) : [posting(100)] };
  } });
  assert.equal(result.rawCount, 101);
  assert.equal(result.jobs.length, 101);
  assert.match(urls[1], /api\.eu\.lever\.co\/.*skip=100/);
});

test('UK and US boards require explicit market evidence before accepting a posting', () => {
  const gb = { id: 'uk-example', name: 'UK Example', adapter: 'lever', token: 'uk-example', countryCode: 'gb' };
  const us = { id: 'us-example', name: 'US Example', adapter: 'lever', token: 'us-example', countryCode: 'us' };
  const row = (board, location, country) => ({ id: 'p1', text: 'Software Intern',
    categories: { location }, country, hostedUrl: `https://jobs.lever.co/${board.token}/p1` });
  assert.equal(pilot.normalizeRow(gb, row(gb, 'London', null)), null);
  assert.equal(pilot.normalizeRow(gb, row(gb, 'London', 'US')), null);
  assert.equal(pilot.normalizeRow(gb, row(gb, 'London', 'GB')).job_country, 'GB');
  assert.equal(pilot.normalizeRow(us, row(us, 'New York, United States', null)).job_country, 'US');
  assert.equal(pilot.normalizeRow(us, row(us, 'London, United Kingdom', null)), null);
});
