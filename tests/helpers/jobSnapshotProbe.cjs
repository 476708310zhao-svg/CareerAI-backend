'use strict';

const isolatedRuntime = require('./isolatedTestRuntime.cjs');
isolatedRuntime.install();
process.env.RAPID_API_KEY = 'mock_rapid_key_abcdefghijklmnopqrstuvwxyz';
process.env.ADZUNA_APP_ID = '';
process.env.ADZUNA_APP_KEY = '';
process.env.THE_MUSE_API_KEY = '';
process.env.LIVE_JOBS_ENABLED = 'true';
process.env.DISABLE_FREE_JOB_SOURCES = 'false';
process.env.JSEARCH_DAILY_REQUEST_BUDGET = '20';
isolatedRuntime.prepare();

const scenario = process.argv[2] || 'normal';
const now = new Date().toISOString();
require('../../utils/jobData').readJobsData = () => ({
  jobs: Array.from({ length: 5 }, (_, index) => ({
    id: index + 900, title: `Local Engineer ${index}`, company: 'Local Co',
    location: 'Tokyo', region: '日本', postedAt: now,
    applyUrl: `https://example.com/local/${index}`
  })),
  companies: []
});

const axios = require('axios');
const express = require('express');
const calls = [];
axios.get = async (url, options = {}) => {
  if (url.includes('jsearch.p.rapidapi.com/search')) {
    if (url !== 'https://jsearch.p.rapidapi.com/search-v2') throw new Error(`Outdated JSearch endpoint: ${url}`);
    calls.push({ source: 'jsearch', cursor: options.params.cursor || '', country: options.params.country });
    if (scenario === 'failed') throw { response: { status: 429, headers: { 'retry-after': '300' } } };
    return { data: { status: 'OK', data: { jobs: [...Array.from({ length: scenario === 'wide' ? 250 : 5 }, (_, index) => ({
      job_id: `js_${index}`, job_title: `Engineer ${index}`, employer_name: 'Market Co',
      job_city: 'Tokyo', job_country: 'jp', job_posted_at_datetime_utc: now,
      job_apply_link: `https://example.com/apply/${index}`,
      job_description: scenario === 'wide' ? 'D'.repeat(20_000) : ''
    })), { job_id: 'js_duplicate', job_title: 'Remote Engineer 0', employer_name: 'Remote Co',
      job_city: 'Worldwide', job_country: 'jp', job_posted_at_datetime_utc: now,
      job_apply_link: 'https://example.com/apply/duplicate' }], cursor: options.params.cursor ? '' : 'next-page' } } };
  }
  if (url === 'https://remoteok.com/api') {
    calls.push({ source: 'remoteok' });
    if (scenario === 'failed') throw new Error('RemoteOK unavailable');
    return { data: [
      { legal: 'metadata' },
      { id: 1, position: 'Engineer 0', company: 'Market Co', location: 'Tokyo', date: now },
      ...Array.from({ length: 4 }, (_, index) => ({
        id: index + 2, position: `Remote Engineer ${index}`, company: 'Remote Co',
        location: 'Worldwide', date: now
      }))
    ] };
  }
  throw new Error(`Unexpected mock source: ${url}`);
};

async function main() {
  const app = express();
  app.use('/api/jobs', require('../../routes/jobs'));
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    async function request(params) {
      const response = await fetch(`${base}/api/jobs?${params}`);
      return { status: response.status, body: await response.json() };
    }
    const filters = 'pagination=snapshot&country=jp&keyword=Engineer&pageSize=3';
    const first = await request(filters);
    const callsAfterFirst = calls.length;
    const second = first.body.data.nextCursor
      ? await request(`${filters}&cursor=${encodeURIComponent(first.body.data.nextCursor)}`)
      : null;
    const secondRetry = second && await request(`${filters}&cursor=${encodeURIComponent(first.body.data.nextCursor)}`);
    const third = second?.body.data.nextCursor
      ? await request(`${filters}&cursor=${encodeURIComponent(second.body.data.nextCursor)}`)
      : null;
    const callsAfterPages = calls.length;
    const mismatch = await request(`${filters.replace('keyword=Engineer', 'keyword=Other')}&cursor=${encodeURIComponent(first.body.data.nextCursor)}`);
    const unknown = await request(`${filters}&cursor=invalid-cursor`);
    const badSize = await request('pagination=snapshot&country=jp&pageSize=51');
    const badPage = await request('pagination=snapshot&country=jp&page=2&pageSize=3');
    const objectFilter = await request('pagination=snapshot&country=jp&pageSize=3&keyword%5Bx%5D=Engineer');
    const longFilter = await request(`pagination=snapshot&country=jp&pageSize=3&keyword=${'x'.repeat(121)}`);
    const detail = scenario === 'wide'
      ? await (await fetch(`${base}/api/jobs/js_0`)).json() : null;
    const local = await request('source=local&country=jp&page=2&pageSize=3');
    const legacy = await request('country=jp&page=2&pageSize=3');
    console.log(`PROBE_RESULT:${JSON.stringify({
      first, second, secondRetry, third, mismatch, unknown, badSize, badPage,
      objectFilter, longFilter, detailLength: detail?.data?.description?.length, local, legacy,
      callsAfterFirst, callsAfterPages, calls
    })}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
