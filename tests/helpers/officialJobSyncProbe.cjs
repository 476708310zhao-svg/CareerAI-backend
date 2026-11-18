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
  const usPosting = { ...posting, job_id: 'official_shein-us_912347',
    job_title: 'Marketing Intern', employer_name: 'SHEIN', job_city: 'Los Angeles',
    job_country: 'US', job_apply_link: 'https://job-boards.greenhouse.io/shein/jobs/912347',
    job_source_url: 'https://job-boards.greenhouse.io/shein/jobs/912347',
    job_source_reference: 'greenhouse:shein:912347' };
  await sync.syncBoard(db, pilot.LIVE_BOARDS.find(board => board.id === 'shein-us'), {
    fetchSnapshot: async () => ({ rawCount: 1, jobs: [usPosting] })
  });
  await sync.syncBoard(db, pilot.LIVE_BOARDS.find(board => board.id === 'bosch-gb'), {
    fetchOptions: { httpGet: async () => ({ data: { totalFound: 1, offset: 0, limit: 100,
      content: [{ id: '912348', name: 'Engineering Placement', visibility: 'PUBLIC',
        company: { identifier: 'BoschGroup' }, location: { country: 'gb', city: 'Worcester' },
        experienceLevel: { id: 'internship' } }]
    } }) }
  });

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
    const usAggregate = await (await fetch(`${base}/api/jobs/aggregate?country=us&query=Marketing%20Intern`)).json();
    const gbAggregate = await (await fetch(`${base}/api/jobs/aggregate?country=gb&query=Engineering%20Placement`)).json();
    const gbWeb = await (await fetch(`${base}/api/jobs?source=local&country=gb&keyword=Engineering%20Placement`)).json();
    const gbDetail = await (await fetch(`${base}/api/jobs/detail?job_id=official_bosch-gb_912348`)).json();
    const detail = await (await fetch(`${base}/api/jobs/detail?job_id=official_landor_912345`)).json();
    const webFast = await (await fetch(`${base}/api/jobs?source=local&country=cn&keyword=Design%20Intern`)).json();
    const webList = await (await fetch(`${base}/api/jobs?country=cn&keyword=Design%20Intern`)).json();
    const webOtherCountry = await (await fetch(`${base}/api/jobs?source=local&country=us&keyword=Design%20Intern`)).json();
    const v4 = await (await fetch(`${base}/api/v4/jobs?keyword=Design&pageSize=50`, {
      headers: { Authorization: `Bearer ${token}` }
    })).json();
    const applicationResponse = await fetch(`${base}/api/v4/applications`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: posting.job_id })
    });
    const application = await applicationResponse.json();
    const secondPosting = { ...posting, job_id: 'official_landor_912346', job_title: 'Design Intern II',
      job_apply_link: 'https://job-boards.greenhouse.io/landor/jobs/912346',
      job_source_url: 'https://job-boards.greenhouse.io/landor/jobs/912346',
      job_source_reference: 'greenhouse:landor:912346',
      job_posted_at_datetime_utc: '2025-01-01T00:00:00.000Z' };
    await sync.syncBoard(db, pilot.LIVE_BOARDS.find(board => board.id === 'landor'), {
      fetchSnapshot: async () => ({ rawCount: 2, jobs: [posting, secondPosting] })
    });
    const oldOpenWebJob = await (await fetch(`${base}/api/jobs?source=local&country=cn&keyword=Design%20Intern%20II`)).json();
    const snapshotQuery = 'pagination=snapshot&country=cn&pageSize=1&keyword=Design%20Intern';
    const snapshot = await (await fetch(`${base}/api/jobs?${snapshotQuery}`)).json();
    db.prepare("UPDATE official_job_postings SET status='closed' WHERE id=?").run(posting.job_id);
    const closedCursorStatus = await fetch(`${base}/api/jobs?${snapshotQuery}&cursor=${encodeURIComponent(snapshot.data.nextCursor)}`);
    console.log(`PROBE_RESULT:${JSON.stringify({
      ready: sync.readyToServe(db),
      aggregateId: aggregate.data?.find(job => job.job_id === posting.job_id)?.job_id,
      aggregateSource: aggregate.sourceStatus?.find(row => row.source === 'cn_official'),
      usAggregateId: usAggregate.data?.find(job => job.job_id === usPosting.job_id)?.job_id,
      usAggregateSource: usAggregate.sourceStatus?.find(row => row.source === 'official_board'),
      gbAggregateId: gbAggregate.data?.find(job => job.job_id === 'official_bosch-gb_912348')?.job_id,
      gbWebId: gbWeb.data?.list?.find(job => job.id === 'official_bosch-gb_912348')?.id,
      gbDetailSource: gbDetail._source,
      detailId: detail.data?.[0]?.job_id,
      webFastJob: webFast.data?.list?.find(job => job.id === posting.job_id),
      webListJob: webList.data?.list?.find(job => job.id === posting.job_id),
      webOtherCountryHasJob: webOtherCountry.data?.list?.some(job => job.id === posting.job_id),
      webOldOpenJobId: oldOpenWebJob.data?.list?.find(job => job.id === secondPosting.job_id)?.id,
      webSnapshotHasCursor: Boolean(snapshot.data?.nextCursor),
      webClosedCursorStatus: closedCursorStatus.status,
      v4Id: v4.data?.list?.find(job => job.id === posting.job_id)?.id,
      applicationStatus: applicationResponse.status,
      applicationJobId: application.data?.jobId || application.data?.application?.jobId ||
        db.prepare('SELECT job_id FROM applications WHERE user_id=1 ORDER BY id DESC LIMIT 1').get()?.job_id
    })}`);
  } finally { await new Promise(resolve => server.close(resolve)); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
