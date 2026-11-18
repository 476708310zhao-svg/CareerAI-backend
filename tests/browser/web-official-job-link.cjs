// Optional browser acceptance with a disposable database and a synthetic official posting.
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.WEB_PLAYWRIGHT_MODULE || 'playwright');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'careerai-web-browser-'));
fs.writeFileSync(path.join(directory, 'test.db'), '');
fs.mkdirSync(path.join(directory, 'data'));
fs.mkdirSync(path.join(directory, 'uploads'));
Object.assign(process.env, {
  WEB_TEST_ISOLATED: '1', DB_PATH: path.join(directory, 'test.db'),
  DATA_DIR: path.join(directory, 'data'), UPLOAD_DIR: path.join(directory, 'uploads'),
  JWT_SECRET: 'web_official_browser_test_only_123456', V4_AI_LIVE_ENABLED: 'false', ANALYTICS_DATA_CLASS: 'test'
});

(async () => {
  let fixture;
  let browser;
  try {
    fixture = await require('../helpers/webApplicationFixture.cjs').start();
    const sync = require('../../services/officialJobSync');
    const boards = require('../../services/cnOfficialPilot').LIVE_BOARDS;
    const boardId = boards[0].id;
    const officialUrl = 'https://job-boards.greenhouse.io/browserexample/jobs/123';
    const runs = await sync.syncAll(fixture.db, { boards, fetchSnapshot: async board => ({
      rawCount: board.id === boardId ? 1 : 0,
      jobs: board.id === boardId ? [{
        job_id: `official_${boardId}_browser123`, job_title: 'Browser Official Intern',
        employer_name: 'Browser Example', job_city: 'Shanghai', job_country: 'CN',
        job_description: 'Do not republish this description', job_employment_type: 'INTERN',
        job_apply_link: officialUrl, job_source_url: officialUrl,
        job_source_reference: `greenhouse:${boardId}:browser123`
      }] : []
    }) });
    assert.equal(runs[0].status, 'ok');
    assert.equal(sync.readyToServe(fixture.db), true);

    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(token => localStorage.setItem('careerai_web_token', token), fixture.token);
    await page.goto(fixture.url + '/web/');
    await page.locator('[data-view="jobs"]').click();
    await page.locator('#web-job-search [name="keyword"]').fill('Browser Official Intern');
    await page.locator('#web-job-search button').click();
    const result = page.locator('#web-job-results');
    const officialLink = result.getByRole('link', { name: '企业官网申请' });
    await officialLink.waitFor();
    assert.equal(await officialLink.getAttribute('href'), officialUrl);
    assert.equal(await officialLink.getAttribute('rel'), 'noopener noreferrer');
    assert.equal((await result.textContent()).includes('Do not republish'), false);

    await result.locator('[data-add-job]').click();
    const detailLink = page.locator('#detail-content').getByRole('link', { name: '前往企业官网查看岗位并申请' });
    await detailLink.waitFor();
    assert.equal(await detailLink.getAttribute('href'), officialUrl);
    const detailText = await page.locator('#detail-content').textContent();
    assert.equal(detailText.includes('本站整理的岗位概览'), true);
    assert.equal(detailText.includes('Do not republish this description'), false);
    assert.deepEqual(errors, []);
    console.log('Browser official job link acceptance passed.');
  } finally {
    await browser?.close();
    await fixture?.close();
    if (path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith('careerai-web-browser-')) {
      throw new Error('Unexpected browser cleanup path');
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
