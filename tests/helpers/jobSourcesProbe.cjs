'use strict';

const isolatedRuntime = require('./isolatedTestRuntime.cjs');
const scenario = process.argv[2] || 'normal';
isolatedRuntime.install();
Object.assign(process.env, {
  RAPID_API_KEY: 'mock_rapid_key_abcdefghijklmnopqrstuvwxyz',
  ADZUNA_APP_ID: '', ADZUNA_APP_KEY: '', THE_MUSE_API_KEY: '',
  LIVE_JOBS_ENABLED: 'true', DISABLE_FREE_JOB_SOURCES: 'false',
  JSEARCH_DAILY_REQUEST_BUDGET: scenario === 'normal' ? '10' : '6'
});
isolatedRuntime.prepare();

const axios = require('axios');
const express = require('express');
const calls = [];
const now = new Date().toISOString();

axios.get = async (url, options = {}) => {
  if (url.includes('jsearch.p.rapidapi.com/search')) {
    calls.push({ source: 'jsearch', country: options.params.country, query: options.params.query });
    if (scenario === 'limited') throw { response: { status: 429, headers: { 'retry-after': '3600' } } };
    if (scenario === 'slow') return new Promise(() => {});
    const country = options.params.country;
    return { data: { status: 'OK', data: [{
      job_id: `js_${country}`, job_title: `Engineer ${country}`,
      employer_name: 'Market Co', job_city: country, job_country: country,
      job_posted_at_datetime_utc: now, job_apply_link: 'https://example.com/apply'
    }] } };
  }
  if (url === 'https://remoteok.com/api') {
    calls.push({ source: 'remoteok' });
    return { data: [
      { legal: 'metadata' },
      { id: 1, position: 'Worldwide Engineer', company: 'Global Co', location: 'Worldwide', date: now },
      { id: 2, position: 'US Engineer', company: 'US Co', location: 'United States', date: now }
    ] };
  }
  throw new Error(`Unexpected mocked upstream: ${url}`);
};

async function main() {
  const app = express();
  app.use('/api/jobs', require('../../routes/jobs'));
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.once('error', reject);
  });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const startedAt = Date.now();
    const map = await (await fetch(`${base}/api/jobs/map?country=global&pageSize=20`)).json();
    const mapElapsedMs = Date.now() - startedAt;
    const secondMap = scenario === 'limited'
      ? await (await fetch(`${base}/api/jobs/map?country=global&pageSize=20`)).json()
      : null;
    const japan = scenario === 'normal'
      ? await (await fetch(`${base}/api/jobs?country=jp&pageSize=20`)).json()
      : null;
    const globalList = scenario === 'normal'
      ? await (await fetch(`${base}/api/jobs?country=global&pageSize=20`)).json()
      : null;
    const globalAggregate = scenario === 'normal'
      ? await (await fetch(`${base}/api/jobs/aggregate?country=global&query=Engineer&pageSize=20`)).json()
      : null;
    const aggregate = scenario === 'normal'
      ? await (await fetch(`${base}/api/jobs/aggregate?country=jp&query=Engineer&pageSize=20`)).json()
      : null;
    const search = scenario === 'normal'
      ? await (await fetch(`${base}/api/jobs/search?country=jp&query=Engineer`)).json()
      : null;
    console.log(`PROBE_RESULT:${JSON.stringify({
      calls, mapElapsedMs, map: {
        source: map.data.source,
        coverage: map.meta.coverage,
        jobs: map.data.list.map(job => ({ id: job.id, source: job.source }))
      },
      secondMap: secondMap && { source: secondMap.data.source, count: secondMap.data.list.length },
      japan: japan && {
        source: japan.data.source,
        jobs: japan.data.list.map(job => ({ id: job.id, countryCode: job.countryCode, location: job.location }))
      },
      globalList: globalList && {
        coverage: globalList.meta.coverage,
        jobs: globalList.data.list.map(job => job.id)
      },
      aggregate: aggregate && {
        sources: aggregate.sources,
        jobs: aggregate.data.map(job => ({ id: job.job_id, sourceCode: job.dataMeta?.sourceCode }))
      },
      globalAggregate: globalAggregate && {
        coverage: globalAggregate.coverage,
        jobs: globalAggregate.data.map(job => job.job_id)
      },
      search: search && { source: search._source, jobs: search.data.map(job => job.job_id) }
    })}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
