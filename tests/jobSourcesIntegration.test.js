const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function probe(scenario) {
  const output = execFileSync(process.execPath,
    [path.join(__dirname, 'helpers', 'jobSourcesProbe.cjs'), scenario],
    { encoding: 'utf8', timeout: 20_000 });
  const line = output.split(/\r?\n/).find(item => item.startsWith('PROBE_RESULT:'));
  assert.ok(line, 'probe result missing');
  return JSON.parse(line.slice('PROBE_RESULT:'.length));
}

test('global sampling eventually includes every core student market and explicit market plans stay distinct', () => {
  const geography = require('../utils/jobGeography');
  const markets = new Set();
  for (let day = 0; day < 7; day++) {
    geography.globalSampleCountries(Date.UTC(2026, 9, 1) + day * 86400000)
      .forEach(country => markets.add(country));
  }
  for (const country of ['us', 'gb', 'cn', 'hk', 'ca']) assert.ok(markets.has(country), country);
  assert.deepEqual(geography.marketSources('hk'), ['jsearch', 'hk_csb']);
  assert.deepEqual(geography.marketSources('cn'), ['jsearch', 'cn_official']);
  assert.deepEqual(geography.marketSources('us'), ['jsearch', 'adzuna', 'official_board']);
  assert.deepEqual(geography.marketSources('gb'), ['jsearch', 'adzuna']);
});

test('official directory expands without changing China live source and detail APIs', () => {
  const result = probe('cn-official');
  assert.equal(result.directory.total, 25);
  assert.equal(result.directory.auto, 11);
  assert.equal(result.directory.china.length, 24);
  assert.equal(result.directory.us.length, 5);
  assert.equal(result.directory.china.includes('shein-us'), false);
  assert.equal(result.directory.us.includes('shein-us'), true);
  assert.ok(result.aggregate.ids.includes('official_landor_912345'));
  assert.equal(result.aggregate.official.status, 'ok');
  assert.equal(result.aggregate.official.count, 1);
  assert.equal(result.detail.id, 'official_landor_912345');
  assert.equal(result.detail.sourceUrl, 'https://job-boards.greenhouse.io/landor/jobs/912345');
  assert.equal(result.detail.publishedAt, '');
  assert.equal(result.webDetail.id, 'official_landor_912345');
  assert.equal(result.webDetail.source, 'cn_official');
  assert.equal(result.hiddenDetailStatus, 404);
});

test('Hong Kong public vacancies keep official evidence, source counts, country and detail identity', () => {
  const result = probe('hong-kong');
  assert.deepEqual(result.hongKong.countries, ['hk']);
  assert.deepEqual(result.hongKong.jobs.map(job => job.id), ['hkcsb_7001', 'hkcsb_7002']);
  assert.match(result.hongKong.jobs[0].description, /Entry requirements: Bachelor degree and SQL experience/);
  assert.equal(result.hongKong.jobs[0].salary, 'HK$30,000 per month');
  assert.equal(result.hongKong.jobs[0].apply, 'https://www.csb.gov.hk/apply/7001');
  assert.equal(result.hongKong.jobs[1].apply, '');
  assert.equal(result.hongKong.jobs[1].salary, '');
  assert.equal(result.hongKong.degraded, false);
  assert.ok(result.hongKong.sourceStatus.some(item => item.source === 'hk_csb' && item.country === 'hk'
    && item.status === 'ok' && item.count === 2));
  assert.deepEqual(result.empty.jobs, []);
  assert.equal(result.empty.degraded, false);
  assert.ok(result.empty.sourceStatus.some(item => item.source === 'hk_csb' && item.status === 'empty'));
  assert.deepEqual(result.china.countries, ['cn']);
  assert.equal(result.china.sourceStatus.some(item => item.source === 'hk_csb'), false);
  assert.deepEqual(result.global.countries, ['cn', 'hk']);
  assert.ok(result.global.jobs.includes('hkcsb_7001'));
  assert.equal(result.detail.id, 'hkcsb_7001');
  assert.equal(result.detail.sourceReference, '7001');
  assert.equal(result.skillDetail.source, 'hk_csb');
  assert.equal(result.skillDetail.id, 'hkcsb_7001');
});

test('Hong Kong source matches city words and internship type as well as role text', () => {
  const adapter = require('../services/hkGovJobs');
  const feed = { common: [{ vacancies: [
    { jobid: '7004', jobname: 'Data Analyst', jobnature: 'Internship',
      duties: 'Analyse data', entreq: 'SQL', enddate: '2099-12-31 23:59' }
  ] }] };
  assert.deepEqual(adapter.searchVacancies(feed, 'data analyst internship in Hong Kong')
    .map(job => job.job_id), ['hkcsb_7004']);
});

test('Hong Kong source failure is reported separately from a genuine empty search', () => {
  const result = probe('hong-kong-outage');
  assert.deepEqual(result.hongKong.jobs, []);
  assert.equal(result.hongKong.degraded, true);
  assert.ok(result.hongKong.sourceStatus.some(item => item.source === 'hk_csb'
    && item.status === 'unavailable' && item.reason === 'upstream_error'));
});

for (const fixture of [
  { scenario: 'normal', countries: ['us', 'gb'], listCountries: ['us', 'gb'], total: 9 },
  { scenario: 'normal-with-japan', countries: ['jp', 'ae'], listCountries: ['ae'], total: 8 }
]) {
test(`global sampling ${fixture.countries.join('/')} preserves Japan results and reuses identical country queries`, () => {
  const result = probe(fixture.scenario);
  const marketCalls = stage => result.stageCalls[stage].filter(call => call.source === 'jsearch');
  for (const [stage, countries, query] of [
    ['map', fixture.countries, 'software engineer'],
    ['japan', ['jp'], 'jobs'],
    ['globalList', fixture.listCountries, 'jobs'],
    ['globalAggregate', fixture.countries, 'Engineer'],
    ['aggregate', ['jp'], 'Engineer'],
    ['search', ['jp'], 'Engineer']
  ]) {
    assert.deepEqual(marketCalls(stage).map(call => call.country), countries, `${stage} upstream calls`);
    assert.ok(marketCalls(stage).every(call => call.query === query), `${stage} query`);
  }
  assert.equal(result.calls.filter(call => call.source === 'jsearch').length, fixture.total);
  assert.equal(result.calls.filter(call => call.source === 'remoteok').length, 1);
  assert.equal(result.map.coverage.mode, 'sampled');
  assert.deepEqual(result.map.coverage.countries, fixture.countries);
  for (const country of fixture.countries) {
    assert.ok(result.map.jobs.some(job => job.id === `js_${country}`), `map returns ${country}`);
    assert.ok(result.globalList.jobs.includes(`js_${country}`), `global list returns ${country}, including cached results`);
    assert.ok(result.globalAggregate.jobs.includes(`js_${country}`), `global aggregate returns ${country}`);
  }
  assert.ok(result.japan.jobs.some(job => job.id === 'js_jp'));
  assert.ok(result.japan.jobs.some(job => job.id === 'rok_1'));
  assert.equal(result.japan.jobs.some(job => job.id === 'rok_2'), false);
  assert.equal(result.globalList.coverage.mode, 'sampled');
  assert.deepEqual(result.globalList.coverage.countries, fixture.countries);
  assert.ok(result.globalList.jobs.some(id => id.startsWith('js_')));
  assert.ok(result.aggregate.jobs.some(job => job.id === 'js_jp' && job.sourceCode === 'jsearch'));
  assert.equal(result.aggregate.jobs.some(job => job.id === 'rok_2'), false);
  assert.equal(result.aggregate.sources.includes('local'), false);
  assert.equal(result.globalAggregate.coverage.mode, 'sampled');
  assert.deepEqual(result.globalAggregate.coverage.countries, fixture.countries);
  assert.ok(result.globalAggregate.jobs.some(id => id.startsWith('js_')));
  assert.equal(result.search.source, 'jsearch');
  assert.deepEqual(result.search.jobs, ['js_jp']);
});
}

test('a 429 on the first global market request suppresses the queued second call and repeated refreshes', () => {
  const result = probe('limited');
  assert.equal(result.calls.filter(call => call.source === 'jsearch').length, 1);
  assert.equal(result.calls.filter(call => call.source === 'remoteok').length, 1);
  assert.equal(result.map.source, 'live');
  assert.equal(result.secondMap.source, 'live');
});

test('JSearch v5 cursor loads the requested second page through search-v2', () => {
  const result = probe('pagination');
  assert.equal(result.source, 'jsearch');
  assert.deepEqual(result.jobs, ['js_page_2']);
  assert.deepEqual(result.calls.map(call => call.cursor), ['', 'next-page']);
});

test('a slow country provider does not hold the map beyond its soft deadline', () => {
  const result = probe('slow');
  assert.ok(result.mapElapsedMs < 11_000, `map took ${result.mapElapsedMs} ms`);
  assert.equal(result.map.source, 'live');
  assert.deepEqual(result.map.coverage.countriesWithResults, []);
  assert.ok(result.map.jobs.some(job => job.source === 'remoteok'));
});

test('JSearch country conflicts are excluded while missing countries inherit the requested market', () => {
  const result = probe('country-mismatch');
  const expected = [
    { id: 'js_japan_name', countryCode: 'jp' },
    { id: 'js_missing_country', countryCode: 'jp' }
  ];
  for (const stage of ['map', 'list', 'snapshot']) {
    assert.deepEqual(result[stage], expected, `${stage} must use actual source country`);
  }
  assert.deepEqual(result.aggregate, expected.map(job => job.id));
  assert.ok(result.calls.filter(call => call.source === 'jsearch').every(call => call.country === 'jp'));
});

test('JSearch UK country codes and display names resolve to canonical GB', () => {
  const result = probe('country-alias');
  const expected = ['js_uk_code', 'js_uk_english', 'js_uk_chinese'];
  for (const stage of ['map', 'list', 'snapshot']) {
    assert.deepEqual(result[stage].map(job => job.id), expected);
    assert.ok(result[stage].every(job => job.countryCode === 'gb'));
  }
  assert.deepEqual(result.aggregate, expected);
  assert.ok(result.calls.filter(call => call.source === 'jsearch').every(call => call.country === 'gb'));
});

test('explicit job deadlines survive Web list, detail, search and aggregate normalization', () => {
  const result = probe('deadline');
  const future = result.list.find(job => job.id === 'js_future');
  const unknown = result.list.find(job => job.id === 'js_unknown');
  assert.equal(future.deadline, result.futureDeadline);
  assert.equal(future.freshness, 'fresh');
  assert.equal(unknown.deadline, '');
  assert.equal(unknown.freshness, 'fresh');
  assert.equal(result.list.some(job => job.id === 'js_expired'), false);
  assert.deepEqual(result.detail, { deadline: result.futureDeadline, freshness: 'fresh' });
  assert.deepEqual(result.unknownDetail, { deadline: '', freshness: 'fresh' });
  for (const collection of [result.search, result.aggregate]) {
    assert.equal(collection.find(job => job.id === 'js_future').deadline, result.futureDeadline);
    assert.equal(collection.find(job => job.id === 'js_unknown').deadline, '');
    assert.equal(collection.find(job => job.id === 'js_expired').deadline, result.expiredDeadline);
    assert.equal(collection.find(job => job.id === 'js_expired').freshness, 'expired');
  }
  assert.equal(result.localList.find(job => job.id === '900001').deadline, result.futureDeadline);
  assert.equal(result.localList.find(job => job.id === '900002').deadline, '');
  assert.equal(result.localList.some(job => job.id === '900003'), false);
  assert.deepEqual(result.localDetail, { deadline: result.futureDeadline, fallback: true });
  assert.equal(result.localSearch.find(job => job.id === '900001').deadline, result.futureDeadline);
  assert.equal(result.localSearch.find(job => job.id === '900002').deadline, '');
  assert.deepEqual(result.legacyLocalDetail, { deadline: result.futureDeadline, fallback: true });
});
