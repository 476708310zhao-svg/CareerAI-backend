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

test('global map spends at most two JSearch calls and explicit Japan results do not include US-only remote roles', () => {
  const result = probe('normal');
  assert.equal(result.calls.filter(call => call.source === 'jsearch').length, 9);
  assert.equal(result.calls.filter(call => call.source === 'remoteok').length, 1);
  assert.equal(result.map.coverage.mode, 'sampled');
  assert.equal(result.map.coverage.countries.length, 2);
  assert.ok(result.map.jobs.some(job => job.id.startsWith('js_')));
  assert.ok(result.japan.jobs.some(job => job.id === 'js_jp'));
  assert.ok(result.japan.jobs.some(job => job.id === 'rok_1'));
  assert.equal(result.japan.jobs.some(job => job.id === 'rok_2'), false);
  assert.equal(result.globalList.coverage.mode, 'sampled');
  assert.equal(result.globalList.coverage.countries.length, 2);
  assert.ok(result.globalList.jobs.some(id => id.startsWith('js_')));
  assert.ok(result.aggregate.jobs.some(job => job.id === 'js_jp' && job.sourceCode === 'jsearch'));
  assert.equal(result.aggregate.sources.includes('local'), false);
  assert.equal(result.globalAggregate.coverage.mode, 'sampled');
  assert.equal(result.globalAggregate.coverage.countries.length, 2);
  assert.ok(result.globalAggregate.jobs.some(id => id.startsWith('js_')));
  assert.equal(result.search.source, 'jsearch');
  assert.deepEqual(result.search.jobs, ['js_jp']);
});

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
