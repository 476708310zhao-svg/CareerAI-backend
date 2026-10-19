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

test('a slow country provider does not hold the map beyond its soft deadline', () => {
  const result = probe('slow');
  assert.ok(result.mapElapsedMs < 11_000, `map took ${result.mapElapsedMs} ms`);
  assert.equal(result.map.source, 'live');
  assert.deepEqual(result.map.coverage.countriesWithResults, []);
  assert.ok(result.map.jobs.some(job => job.source === 'remoteok'));
});
