'use strict';

const isolatedRuntime = require('./isolatedTestRuntime.cjs');
const scenario = process.argv[2] || 'normal';
const normalScenario = scenario === 'normal' || scenario === 'normal-with-japan';
// Keep market sampling deterministic without freezing clocks used by deadlines,
// source pacing, cache expiry, and job freshness. This module is process-local.
const sampleCountries = scenario === 'normal-with-japan' ? ['jp', 'ae'] : ['us', 'gb'];
require('../../utils/jobGeography').globalSampleCountries = () => [...sampleCountries];
isolatedRuntime.install();
Object.assign(process.env, {
  RAPID_API_KEY: 'mock_rapid_key_abcdefghijklmnopqrstuvwxyz',
  ADZUNA_APP_ID: '', ADZUNA_APP_KEY: '', THE_MUSE_API_KEY: '',
  LIVE_JOBS_ENABLED: 'true', DISABLE_FREE_JOB_SOURCES: 'false',
  JSEARCH_DAILY_REQUEST_BUDGET: normalScenario ? '10' : '6'
});
isolatedRuntime.prepare();

const axios = require('axios');
const express = require('express');
const calls = [];
const now = new Date().toISOString();
const jsearchResponse = (jobs, cursor = '') => ({ data: { status: 'OK', data: { jobs, cursor } } });

axios.get = async (url, options = {}) => {
  if (url.includes('jsearch.p.rapidapi.com/search')) {
    if (url !== 'https://jsearch.p.rapidapi.com/search-v2') throw new Error(`Outdated JSearch endpoint: ${url}`);
    calls.push({ source: 'jsearch', country: options.params.country, query: options.params.query, cursor: options.params.cursor || '' });
    if (scenario === 'limited') throw { response: { status: 429, headers: { 'retry-after': '3600' } } };
    if (scenario === 'slow') return new Promise(() => {});
    const country = options.params.country;
    if (scenario === 'pagination') return jsearchResponse([{
      job_id: options.params.cursor ? 'js_page_2' : 'js_page_1',
      job_title: options.params.cursor ? 'Engineer Page Two' : 'Engineer Page One',
      employer_name: 'Page Co', job_country: country, job_posted_at_datetime_utc: now
    }], options.params.cursor ? '' : 'next-page');
    return jsearchResponse([{
      job_id: `js_${country}`, job_title: `Engineer ${country}`,
      employer_name: 'Market Co', job_city: country, job_country: country,
      job_posted_at_datetime_utc: now, job_apply_link: 'https://example.com/apply'
    }]);
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
    const stageCalls = {};
    async function requestStage(stage, route) {
      const before = calls.length;
      const response = await (await fetch(`${base}${route}`)).json();
      stageCalls[stage] = calls.slice(before);
      return response;
    }
    if (scenario === 'pagination') {
      const search = await requestStage('search', '/api/jobs/search?country=us&query=Engineer&page=2');
      console.log(`PROBE_RESULT:${JSON.stringify({ calls, source: search._source,
        jobs: search.data.map(job => job.job_id) })}`);
      return;
    }
    const startedAt = Date.now();
    const map = await requestStage('map', '/api/jobs/map?country=global&pageSize=20');
    const mapElapsedMs = Date.now() - startedAt;
    const secondMap = scenario === 'limited'
      ? await requestStage('secondMap', '/api/jobs/map?country=global&pageSize=20')
      : null;
    const japan = normalScenario
      ? await requestStage('japan', '/api/jobs?country=jp&pageSize=20')
      : null;
    const globalList = normalScenario
      ? await requestStage('globalList', '/api/jobs?country=global&pageSize=20')
      : null;
    const globalAggregate = normalScenario
      ? await requestStage('globalAggregate', '/api/jobs/aggregate?country=global&query=Engineer&pageSize=20')
      : null;
    const aggregate = normalScenario
      ? await requestStage('aggregate', '/api/jobs/aggregate?country=jp&query=Engineer&pageSize=20')
      : null;
    const search = normalScenario
      ? await requestStage('search', '/api/jobs/search?country=jp&query=Engineer')
      : null;
    console.log(`PROBE_RESULT:${JSON.stringify({
      calls, stageCalls, mapElapsedMs, map: {
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
