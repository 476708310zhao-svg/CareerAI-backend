'use strict';

const isolatedRuntime = require('./isolatedTestRuntime.cjs');
isolatedRuntime.install();
Object.assign(process.env, {
  RAPID_API_KEY: '', ADZUNA_APP_ID: '', ADZUNA_APP_KEY: '',
  THE_MUSE_API_KEY: '', DISABLE_FREE_JOB_SOURCES: 'true',
  RECRUITMENT_FEATURE_ENABLED: 'true'
});
isolatedRuntime.prepare();

const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../../db/database');
const pilot = require('../../services/cnOfficialPilot');
const sync = require('../../services/officialJobSync');

async function main() {
  const posting = {
    job_id: 'official_landor_912345', job_title: 'Design Intern',
    employer_name: 'Landor', job_city: 'Shanghai', job_country: 'CN',
    job_description: 'Portfolio required', job_employment_type: 'INTERN',
    job_apply_link: 'https://job-boards.greenhouse.io/landor/jobs/912345',
    job_source_url: 'https://job-boards.greenhouse.io/landor/jobs/912345',
    job_source_reference: 'greenhouse:landor:912345',
    job_posted_at_datetime_utc: ''
  };
  await sync.syncAll(db, { boards: pilot.LIVE_BOARDS,
    fetchSnapshot: async board => board.id === 'landor'
      ? { rawCount: 1, jobs: [posting] } : { rawCount: 0, jobs: [] } });

  const app = express();
  app.use(express.json());
  app.use('/api/jobs', require('../../routes/jobs'));
  app.use('/api/v4/jobs', require('../../routes/v4/jobs'));
  app.use('/api/v4/applications', require('../../routes/v4/applications'));
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const token = jwt.sign({ userId: 1, openid: 'isolated_seed_owner' }, process.env.JWT_SECRET);
    const aggregate = await (await fetch(`${base}/api/jobs/aggregate?country=cn&query=Design%20Intern`)).json();
    const detail = await (await fetch(`${base}/api/jobs/detail?job_id=official_landor_912345`)).json();
    const v4 = await (await fetch(`${base}/api/v4/jobs?keyword=Design&pageSize=50`, {
      headers: { Authorization: `Bearer ${token}` }
    })).json();
    const applicationResponse = await fetch(`${base}/api/v4/applications`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: posting.job_id })
    });
    const application = await applicationResponse.json();
    console.log(`PROBE_RESULT:${JSON.stringify({
      ready: sync.readyToServe(db),
      aggregateId: aggregate.data?.find(job => job.job_id === posting.job_id)?.job_id,
      aggregateSource: aggregate.sourceStatus?.find(row => row.source === 'cn_official'),
      detailId: detail.data?.[0]?.job_id,
      v4Id: v4.data?.list?.find(job => job.id === posting.job_id)?.id,
      applicationStatus: applicationResponse.status,
      applicationJobId: application.data?.jobId || application.data?.application?.jobId ||
        db.prepare('SELECT job_id FROM applications WHERE user_id=1 ORDER BY id DESC LIMIT 1').get()?.job_id
    })}`);
  } finally { await new Promise(resolve => server.close(resolve)); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
