'use strict';

const isolatedRuntime = require('./isolatedTestRuntime.cjs');
const scenario = process.argv[2] || 'normal';
const normalScenario = scenario === 'normal' || scenario === 'normal-with-japan';
// Keep market sampling deterministic without freezing clocks used by deadlines,
// source pacing, cache expiry, and job freshness. This module is process-local.
const sampleCountries = scenario === 'normal-with-japan' ? ['jp', 'ae']
  : scenario.startsWith('hong-kong') ? ['cn', 'hk'] : ['us', 'gb'];
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
const futureDeadline = new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString();
const expiredDeadline = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
const jsearchResponse = (jobs, cursor = '') => ({ data: { status: 'OK', data: { jobs, cursor } } });
const hongKongFeed = '\uFEFF' + JSON.stringify({ common: [{ vacancies: [
  { jobid: '7001', jobname: 'Data Analyst', deptnamejve: 'Digital Services Department',
    duties: 'Analyse data using SQL.', entreq: 'Bachelor degree and SQL experience.',
    entrypay: 'HK$30,000 per month', pubdate: now, enddate: futureDeadline,
    onlineformurl: 'https://www.csb.gov.hk/apply/7001' },
  { jobid: '7002', jobname: 'Data Intern', deptnamejve: 'Digital Services Department',
    duties: 'Support data reporting.', entreq: 'Student studying statistics.',
    entrypay: 'Negotiable', pubdate: now, enddate: futureDeadline,
    onlineformurl: 'javascript:alert(1)' },
  { jobid: '7003', jobname: 'Expired Data Analyst', deptnamejve: 'Old Department',
    duties: 'Old post.', pubdate: now, enddate: expiredDeadline }
] }, { timestamp: now }] });
if (scenario === 'deadline') {
  require('../../utils/jobData').readJobsData = () => ({ jobs: [
    { id: 900001, title: 'Local Future Engineer', company: 'Local Co', location: 'Tokyo', region: '日本',
      postedAt: now, deadline: futureDeadline, applyUrl: 'https://example.com/local-future' },
    { id: 900002, title: 'Local Unknown Engineer', company: 'Local Co', location: 'Tokyo', region: '日本',
      postedAt: now, applyUrl: 'https://example.com/local-unknown' },
    { id: 900003, title: 'Local Expired Engineer', company: 'Local Co', location: 'Tokyo', region: '日本',
      postedAt: now, deadline: expiredDeadline, applyUrl: 'https://example.com/local-expired' }
  ], companies: [] });
}

axios.get = async (url, options = {}) => {
  if (/^https:\/\/(?:boards-api\.greenhouse\.io|api\.ashbyhq\.com|api\.lever\.co)\//.test(url)) {
    calls.push({ source: 'cn_official' });
    if (scenario === 'cn-official' && url.includes('/landor/')) return { data: { jobs: [{
      id: 912345, title: 'Design Intern', location: { name: 'Shanghai' },
      absolute_url: 'https://job-boards.greenhouse.io/landor/jobs/912345',
      content: '<p>Portfolio and visual design</p>'
    }] } };
    if (scenario === 'cn-official' && url.includes('/meshy')) return { data: { jobs: [{
      id: 'hidden', title: 'Design Intern', location: 'Shanghai', isListed: false,
      jobUrl: 'https://jobs.ashbyhq.com/meshy/hidden'
    }] } };
    return url.includes('api.lever.co') ? { data: [] } : { data: { jobs: [] } };
  }
  if (url === 'https://www.csb.gov.hk/datagovhk/gov-vacancies/gov-job-vacancies-en.json') {
    calls.push({ source: 'hk_csb' });
    if (scenario === 'hong-kong-outage') throw { response: { status: 503 } };
    return { data: hongKongFeed };
  }
  if (url.includes('jsearch.p.rapidapi.com/search')) {
    if (url !== 'https://jsearch.p.rapidapi.com/search-v2') throw new Error(`Outdated JSearch endpoint: ${url}`);
    calls.push({ source: 'jsearch', country: options.params.country, query: options.params.query, cursor: options.params.cursor || '' });
    if (scenario === 'limited') throw { response: { status: 429, headers: { 'retry-after': '3600' } } };
    if (scenario === 'slow') return new Promise(() => {});
    const country = options.params.country;
    if (scenario.startsWith('hong-kong') && country === 'hk') return jsearchResponse([]);
    if (scenario === 'pagination') return jsearchResponse([{
      job_id: options.params.cursor ? 'js_page_2' : 'js_page_1',
      job_title: options.params.cursor ? 'Engineer Page Two' : 'Engineer Page One',
      employer_name: 'Page Co', job_country: country, job_posted_at_datetime_utc: now
    }], options.params.cursor ? '' : 'next-page');
    if (scenario === 'country-mismatch') return jsearchResponse([
      { job_id: 'js_wrong_code', job_title: 'Engineer US Code', employer_name: 'Wrong Co',
        job_city: 'New York', job_country: 'US', job_posted_at_datetime_utc: now },
      { job_id: 'js_wrong_name', job_title: 'Engineer US Name', employer_name: 'Wrong Co',
        job_city: 'New York', job_country: 'United States', job_posted_at_datetime_utc: now },
      { job_id: 'js_japan_name', job_title: 'Engineer Japan', employer_name: 'Japan Co',
        job_city: 'Tokyo', job_country: 'Japan', job_posted_at_datetime_utc: now },
      { job_id: 'js_missing_country', job_title: 'Engineer Missing Country', employer_name: 'Japan Co',
        job_city: 'Tokyo', job_posted_at_datetime_utc: now }
    ]);
    if (scenario === 'country-alias') return jsearchResponse([
      { job_id: 'js_uk_code', job_title: 'Engineer UK', employer_name: 'UK Co',
        job_city: 'London', job_country: 'UK', job_posted_at_datetime_utc: now },
      { job_id: 'js_uk_english', job_title: 'Engineer United Kingdom', employer_name: 'UK Co',
        job_city: 'London', job_country: 'United Kingdom', job_posted_at_datetime_utc: now },
      { job_id: 'js_uk_chinese', job_title: 'Engineer 英国', employer_name: 'UK Co',
        job_city: 'London', job_country: '英国', job_posted_at_datetime_utc: now },
      { job_id: 'js_us_conflict', job_title: 'Engineer US', employer_name: 'US Co',
        job_city: 'New York', job_country: 'United States', job_posted_at_datetime_utc: now }
    ]);
    if (scenario === 'deadline') return jsearchResponse([
      { job_id: 'js_future', job_title: 'Future Engineer', employer_name: 'Future Co',
        job_city: country, job_country: country, job_posted_at_datetime_utc: now,
        job_offer_expiration_datetime_utc: futureDeadline, job_apply_link: 'https://example.com/future' },
      { job_id: 'js_unknown', job_title: 'Unknown Engineer', employer_name: 'Unknown Co',
        job_city: country, job_country: country, job_posted_at_datetime_utc: now,
        job_apply_link: 'https://example.com/unknown' },
      { job_id: 'js_expired', job_title: 'Expired Engineer', employer_name: 'Expired Co',
        job_city: country, job_country: country, job_posted_at_datetime_utc: now,
        job_offer_expiration_datetime_utc: expiredDeadline, job_apply_link: 'https://example.com/expired' }
    ]);
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
    if (scenario === 'cn-official') {
      const directory = await requestStage('directory', '/api/jobs/official-boards');
      const aggregate = await requestStage('aggregate', '/api/jobs/aggregate?country=cn&query=Design&pageSize=20');
      const detail = await requestStage('detail', '/api/jobs/detail?job_id=official_landor_912345');
      const webDetail = await requestStage('webDetail', '/api/jobs/official_landor_912345');
      const hiddenDetail = await fetch(`${base}/api/jobs/detail?job_id=official_meshy_hidden`);
      console.log(`PROBE_RESULT:${JSON.stringify({ directory: { total: directory.total,
        auto: directory.boards.filter(board => board.mode === 'auto_sync').length },
        aggregate: { ids: aggregate.data.map(job => job.job_id),
          official: aggregate.sourceStatus.find(item => item.source === 'cn_official') },
        detail: { id: detail.data?.[0]?.job_id, sourceUrl: detail.data?.[0]?.job_source_url,
          publishedAt: detail.data?.[0]?.job_posted_at_datetime_utc },
        webDetail: { id: webDetail.data?.id, source: webDetail.data?.source },
        hiddenDetailStatus: hiddenDetail.status })}`);
      return;
    }
    if (scenario.startsWith('hong-kong')) {
      const hongKong = await requestStage('hongKong', '/api/jobs/aggregate?country=hk&query=data&pageSize=20');
      const empty = await requestStage('empty', '/api/jobs/aggregate?country=hk&query=quantum%20physicist&pageSize=20');
      const china = await requestStage('china', '/api/jobs/aggregate?country=cn&query=Engineer&pageSize=20');
      const global = await requestStage('global', '/api/jobs/aggregate?country=global&query=data&pageSize=20');
      const detail = scenario === 'hong-kong' ? await requestStage('detail', '/api/jobs/hkcsb_7001') : null;
      const skillDetail = scenario === 'hong-kong'
        ? await requestStage('skillDetail', '/api/jobs/detail?job_id=hkcsb_7001') : null;
      console.log(`PROBE_RESULT:${JSON.stringify({ calls, stageCalls,
        hongKong: { jobs: hongKong.data.map(job => ({ id: job.job_id, apply: job.job_apply_link,
          salary: job.job_salary_string, description: job.job_description })),
          sourceStatus: hongKong.sourceStatus, degraded: hongKong.dataMeta.degraded,
          countries: hongKong.coverage.countries },
        empty: { jobs: empty.data.map(job => job.job_id), sourceStatus: empty.sourceStatus,
          degraded: empty.dataMeta.degraded },
        china: { jobs: china.data.map(job => job.job_id), countries: china.coverage.countries,
          sourceStatus: china.sourceStatus },
        global: { jobs: global.data.map(job => job.job_id), countries: global.coverage.countries,
          sourceStatus: global.sourceStatus },
        detail: detail && { id: detail.data?.id, sourceUrl: detail.data?.sourceUrl,
          sourceReference: detail.data?.sourceReference },
        skillDetail: skillDetail && { id: skillDetail.data?.[0]?.job_id,
          source: skillDetail._source }
      })}`);
      return;
    }
    if (scenario === 'pagination') {
      const search = await requestStage('search', '/api/jobs/search?country=us&query=Engineer&page=2');
      console.log(`PROBE_RESULT:${JSON.stringify({ calls, source: search._source,
        jobs: search.data.map(job => job.job_id) })}`);
      return;
    }
    if (scenario === 'deadline') {
      const list = await requestStage('list', '/api/jobs?country=jp&pageSize=20');
      const detail = await requestStage('detail', '/api/jobs/js_future');
      const unknownDetail = await requestStage('unknownDetail', '/api/jobs/js_unknown');
      const search = await requestStage('search', '/api/jobs/search?country=jp&query=Engineer');
      const aggregate = await requestStage('aggregate', '/api/jobs/aggregate?country=jp&query=Engineer&pageSize=20');
      const localList = await requestStage('localList', '/api/jobs?source=local&country=global&pageSize=20');
      const localDetail = await requestStage('localDetail', '/api/jobs/900001');
      const localSearch = await requestStage('localSearch', '/api/jobs/search?country=global&query=Local');
      const legacyLocalDetail = await requestStage('legacyLocalDetail', '/api/jobs/detail?job_id=900001');
      console.log(`PROBE_RESULT:${JSON.stringify({
        futureDeadline, expiredDeadline,
        list: list.data.list.map(job => ({ id: job.id, deadline: job.deadline, freshness: job.dataMeta?.freshness })),
        detail: { deadline: detail.data.deadline, freshness: detail.data.dataMeta?.freshness },
        unknownDetail: { deadline: unknownDetail.data.deadline, freshness: unknownDetail.data.dataMeta?.freshness },
        search: search.data.map(job => ({ id: job.job_id, deadline: job.deadline, freshness: job.dataMeta?.freshness })),
        aggregate: aggregate.data.map(job => ({ id: job.job_id, deadline: job.deadline, freshness: job.dataMeta?.freshness })),
        localList: localList.data.list.map(job => ({ id: job.id, deadline: job.deadline })),
        localDetail: { deadline: localDetail.data.deadline, fallback: localDetail.data.dataMeta?.isFallback },
        localSearch: localSearch.data.map(job => ({ id: job.job_id, deadline: job.deadline })),
        legacyLocalDetail: { deadline: legacyLocalDetail.data[0]?.deadline, fallback: legacyLocalDetail.data[0]?.dataMeta?.isFallback }
      })}`);
      return;
    }
    if (scenario === 'country-mismatch' || scenario === 'country-alias') {
      const country = scenario === 'country-alias' ? 'gb' : 'jp';
      const region = encodeURIComponent(scenario === 'country-alias' ? '英国' : '日本');
      const map = await requestStage('map', `/api/jobs/map?country=${country}&pageSize=20`);
      const list = await requestStage('list', `/api/jobs?country=${country}&region=${region}&pageSize=20`);
      const snapshot = await requestStage('snapshot', `/api/jobs?country=${country}&region=${region}&pagination=snapshot&pageSize=20`);
      const aggregate = await requestStage('aggregate', `/api/jobs/aggregate?country=${country}&query=Engineer&pageSize=20`);
      console.log(`PROBE_RESULT:${JSON.stringify({
        calls,
        map: map.data.list.filter(job => job.source === 'jsearch').map(job => ({ id: job.id, countryCode: job.countryCode })),
        list: list.data.list.filter(job => job.source === 'jsearch').map(job => ({ id: job.id, countryCode: job.countryCode })),
        snapshot: snapshot.data.list.filter(job => job.source === 'jsearch').map(job => ({ id: job.id, countryCode: job.countryCode })),
        aggregate: aggregate.data.filter(job => job.dataMeta?.sourceCode === 'jsearch').map(job => job.job_id)
      })}`);
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
