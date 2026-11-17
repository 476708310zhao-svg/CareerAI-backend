const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildEvidence } = require('../miniprogram/utils/job-match-evidence.js');
const jobEvidence = require('../miniprogram/skills/job-search-skill/utils/job-evidence.js');

const source = fs.readFileSync(path.join(__dirname, '../miniprogram/skills/job-search-skill/apis/searchJobs.js'), 'utf8');

function loadSkill(response) {
  let requestOptions;
  const savedIds = [];
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module,
    require(name) {
      if (name === '../utils/request.js') return {
        request(options) {
          requestOptions = options;
          return Promise.resolve(response);
        }
      };
      if (name === '../utils/auth.js') return { rememberJobIds: ids => savedIds.push(ids) };
      if (name === '../utils/job-evidence.js') return jobEvidence;
      throw new Error(`Unexpected import: ${name}`);
    }
  }, { filename: 'searchJobs.js' });
  return { searchJobs: module.exports, requestOptions: () => requestOptions, savedIds };
}

test('job Skill searches global by default and returns real result identifiers', async () => {
  const skill = loadSkill({
    status: 'OK', data: [{ job_id: 'job-1', job_title: 'Software Engineer', employer_name: 'Example', job_country: 'Canada' }],
    sources: ['jsearch'], hasMore: false
  });
  const result = await skill.searchJobs({ keyword: 'Software Engineer' });
  assert.equal(skill.requestOptions().params.country, 'global');
  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.jobs[0].jobId, 'job-1');
  assert.equal(skill.savedIds[0][0], 'job-1');
});

test('job Skill labels sampled markets and partial source failures without claiming global coverage', async () => {
  const skill = loadSkill({ status: 'OK', data: [{ job_id: 'hkcsb_7001', job_title: 'Data Analyst',
    job_city: 'Hong Kong', job_country: 'HK', job_description: 'Analyse data using SQL.',
    job_source_url: 'https://csboa2.csb.gov.hk/csboa/jve/JVE_001_text.action',
    job_source_reference: '7001', _source: 'hk_csb' }],
  sources: ['hk_csb'], coverage: { mode: 'sampled', countries: ['cn', 'hk'] },
  sourceStatus: [{ source: 'jsearch', country: 'hk', status: 'unavailable', count: 0,
    reason: 'budget_exhausted' }, { source: 'hk_csb', country: 'hk', status: 'ok', count: 1 }] });
  const result = await skill.searchJobs({ keyword: 'Data Analyst' });
  assert.match(result.content[0].text, /中国内地、香港/);
  assert.match(result.content[0].text, /部分岗位来源暂不可用/);
  assert.equal(result.structuredContent.sourceStatus[1].count, 1);
  assert.equal(result.structuredContent.jobs[0].sourceReference, '7001');
  assert.equal(result.structuredContent.jobs[0].applyUrl, '');
});

test('job Skill translates a Chinese city and role while retaining the requested country', async () => {
  const skill = loadSkill({
    status: 'OK', data: [{ job_id: 'job-2', job_title: 'Data Analyst Intern', employer_name: 'Example', job_city: 'New York', job_country: 'United States' }],
    sources: ['jsearch'], hasMore: false
  });
  const result = await skill.searchJobs({ keyword: '数据分析实习', city: '纽约' });
  assert.equal(skill.requestOptions().params.country, 'us');
  assert.match(skill.requestOptions().params.query, /data analyst internship New York/);
  assert.equal(result.structuredContent.jobs.length, 1);
});

test('job Skill routes Hong Kong and mainland Chinese city searches to the requested market', async () => {
  for (const [input, expectedCountry, expectedCity] of [
    [{ keyword: '数据分析', city: '香港' }, 'hk', 'Hong Kong'],
    [{ keyword: '软件工程师', region: '中国内地', city: '上海' }, 'cn', 'Shanghai']
  ]) {
    const skill = loadSkill({ status: 'OK', data: [], sources: ['jsearch'] });
    await skill.searchJobs(input);
    assert.equal(skill.requestOptions().params.country, expectedCountry);
    assert.match(skill.requestOptions().params.query, new RegExp(expectedCity));
  }
});

test('job Skill reports source outage without claiming that no jobs exist', async () => {
  const skill = loadSkill({
    status: 'OK', data: [], sources: [],
    dataMeta: { degraded: true, fallbackReason: '所选地区暂无可验证实时岗位' }
  });
  const result = await skill.searchJobs({ keyword: 'Software Engineer', region: '美国' });
  assert.equal(skill.requestOptions().params.country, 'us');
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /无法确认是暂无匹配还是岗位源暂不可用/);
  assert.doesNotMatch(result.content[0].text, /没有匹配岗位/);
});

test('job Skill keeps a genuine filtered empty result distinct from an outage', async () => {
  const skill = loadSkill({
    status: 'OK', data: [{ job_id: 'job-3', job_title: 'Software Engineer', employer_name: 'Example', job_city: 'Seattle' }],
    sources: ['jsearch'], hasMore: false
  });
  const result = await skill.searchJobs({ keyword: 'Software Engineer', city: '纽约' });
  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.total, 0);
  assert.match(result.content[0].text, /暂时没有找到匹配岗位/);
});

test('job Skill puts role-matching titles ahead of incidental description matches', async () => {
  const skill = loadSkill({
    status: 'OK', data: [
      { job_id: 'sales-1', job_title: 'Account Executive', employer_name: 'Example', job_description: 'Works with software engineer teams' },
      { job_id: 'engineer-1', job_title: 'Senior Software Engineer', employer_name: 'Example' }
    ],
    sources: ['remoteok'], hasMore: false
  });
  const result = await skill.searchJobs({ keyword: '软件工程师' });
  assert.equal(result.structuredContent.jobs[0].jobId, 'engineer-1');
});

test('same-title jobs prefer the requested city and then the newer posting', async () => {
  const skill = loadSkill({ status: 'OK', sources: ['jsearch'], data: [
    { job_id: 'near', job_title: 'Data Analyst', job_city: 'New York City', job_posted_at_datetime_utc: '2026-10-20T00:00:00Z' },
    { job_id: 'old', job_title: 'Data Analyst', job_city: 'New York', job_posted_at_datetime_utc: '2026-10-01T00:00:00Z' },
    { job_id: 'new', job_title: 'Data Analyst', job_city: 'New York', job_posted_at_datetime_utc: '2026-10-25T00:00:00Z' }
  ] });
  const result = await skill.searchJobs({ keyword: 'data analyst', city: 'New York' });
  assert.deepEqual(Array.from(result.structuredContent.jobs, job => job.jobId), ['new', 'old', 'near']);
});

test('job Skill reports the retrieved scope and shows only source-supported visa and salary claims', async () => {
  const skill = loadSkill({
    status: 'OK', total: 19, sources: ['jsearch'], data: [
      { job_id: 'a', job_title: 'Data Analyst Intern', employer_name: 'A',
        job_description: 'We do not sponsor H-1B visas. We accept OPT candidates. We participate in E-Verify.',
        job_min_salary: 80000, job_max_salary: 100000, job_salary_currency: 'USD', job_salary_period: 'YEAR' },
      { job_id: 'b', job_title: 'Data Analyst Intern', employer_name: 'B',
        job_description: 'Applicants need sponsorship.' }
    ]
  });
  const result = await skill.searchJobs({ keyword: '数据分析实习' });
  assert.equal(result.isError, false);
  assert.match(result.content[0].text, /本次检索找到 2 条.*先展示 2 条/);
  assert.equal(result.structuredContent.retrievedTotal, 19);
  assert.deepEqual(Array.from(result.structuredContent.jobs[0].visaTags), ['OPT', 'E-Verify']);
  assert.equal(result.structuredContent.jobs[0].salaryRange, 'USD 80,000–100,000/年');
  assert.equal(result.structuredContent.jobs[1].visaTags.length, 0);
  assert.equal(result.structuredContent.jobs[1].salaryRange, '');
  assert.equal(jobEvidence.salaryFromSource({ job_min_salary: 50, job_salary_currency: 'USD' }).text, '');
});

test('personal match cites job and resume text and treats missing text as unverified', () => {
  const report = buildEvidence({ skills: ['Python'], projects: [{ name: '分析看板', desc: '用 SQL 构建报表。' }] },
    { description: 'We use Python and SQL to analyze data. AWS experience is required.' });
  assert.equal(report.status, 'supported');
  assert.deepEqual(report.matches.map(item => item.label), ['Python', 'SQL']);
  assert.match(report.matches[1].jobQuote, /SQL/);
  assert.match(report.matches[1].resumeQuote, /SQL/);
  assert.match(report.matches[1].resumeSource, /分析看板/);
  assert.equal(report.gaps[0].label, 'AWS');
  assert.match(report.gaps[0].note, /不代表你不具备/);
  assert.match(report.nextActions[0], /AWS/);
  assert.equal(buildEvidence({ skills: ['Python'] }, { title: 'Engineer' }).status, 'insufficient_jd');
});

test('job list handoff preserves the query for the full jobs tab', () => {
  const source = fs.readFileSync(path.join(__dirname, '../miniprogram/skills/job-search-skill/components/job-list/index.js'), 'utf8');
  let component;
  let pending;
  let destination;
  vm.runInNewContext(source, {
    Component(value) { component = value; },
    wx: {
      setStorageSync(key, value) { if (key === 'jobSearchSkillPendingQuery') pending = value; },
      switchTab(options) { destination = options.url; }
    }
  });
  component.methods.onViewAll.call({ data: { query: {
    keyword: 'data analyst New York', country: 'us', jobType: 'internship', updatedWithinDays: 7
  } } });
  assert.equal(destination, '/pages/jobs/jobs');
  assert.equal(pending.keyword, 'data analyst New York');
  assert.equal(pending.country, 'us');
  assert.equal(pending.jobType, 'internship');
  assert.equal(pending.updatedWithinDays, 7);
});

test('full jobs tab consumes the handoff and keeps the seven-day filter', () => {
  const source = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/jobs/jobs.js'), 'utf8');
  let page;
  let removed = false;
  const pending = { keyword: 'data analyst New York', country: 'us', jobType: 'internship',
    updatedWithinDays: 7, createdAt: Date.now() };
  vm.runInNewContext(source, {
    Page(value) { page = value; },
    require(name) { return name.includes('demo-data') ? { enabled: () => false } : {}; },
    wx: {
      getStorageSync(key) { return key === 'jobSearchSkillPendingQuery' ? pending : null; },
      removeStorageSync() { removed = true; }
    }
  });
  const state = page._takeSkillPendingSearch();
  assert.equal(state.searchKeyword, 'data analyst New York');
  assert.equal(state.filterCountry, 'us');
  assert.equal(state.filterType, 'INTERN');
  assert.equal(state.filterDate, 'week7');
  assert.equal(removed, true);
});

test('job detail reuses a recent real search snapshot without spending another source request', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../miniprogram/skills/job-search-skill/apis/getJobDetail.js'), 'utf8');
  const module = { exports: {} };
  let requests = 0;
  vm.runInNewContext(source, {
    module,
    wx: { getStorageSync(key) { return key === 'jobDetailSnapshot_job-1' ? {
      id: 'job-1', title: 'Data Analyst Intern', company: 'Example',
      description: 'We accept OPT candidates. Strong SQL skills required.',
      source: 'jsearch', skillSnapshotAt: Date.now()
    } : null; } },
    require(name) {
      if (name === '../utils/request.js') return { request() { requests += 1; return Promise.resolve({}); } };
      if (name === '../utils/auth.js') return { hasRecentJobId: () => true };
      if (name === '../utils/job-evidence.js') return jobEvidence;
      throw new Error(name);
    }
  });
  const result = await module.exports({ jobId: 'job-1' });
  assert.equal(requests, 0);
  assert.equal(result.structuredContent.job.title, 'Data Analyst Intern');
  assert.deepEqual(Array.from(result.structuredContent.job.visaTags), ['OPT']);
});

test('external job match stays evidence-based and does not call the local-job scoring API', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../miniprogram/package-user/pages/job-detail/job-detail.js'), 'utf8');
  let page;
  let v4Calls = 0;
  vm.runInNewContext(source, {
    Page(value) { page = value; },
    setTimeout,
    wx: { getStorageSync(key) { return key === 'token' ? 'signed-in' : ''; } },
    require(name) {
      if (name.includes('job-match-evidence')) return { buildEvidence };
      if (name.includes('owner-storage')) return { get: () => ({ skills: ['Python'] }) };
      if (name.includes('job-progress')) return { currentOwnerScope: () => 'owner-1' };
      if (name.includes('api-v4')) return { calculateJobMatch() { v4Calls += 1; } };
      if (name.includes('demo-data')) return { enabled: () => false };
      return {};
    }
  });
  const context = {
    data: { job: { id: '123456', title: 'Engineer', company: 'Example',
      description: 'Python and SQL are required.', source: 'cache', fromSkillSearch: true } },
    _matchRequestSeq: 0,
    isLocalJobDetail: () => true,
    setData(value) { Object.assign(this.data, value); }
  };
  await page.runJdMatch.call(context);
  assert.equal(v4Calls, 0);
  assert.equal(context.data.matchReport.score, null);
  assert.equal(context.data.matchReport.evidence.matches[0].label, 'Python');
  assert.equal(context.data.matchReport.evidence.gaps[0].label, 'SQL');
});
