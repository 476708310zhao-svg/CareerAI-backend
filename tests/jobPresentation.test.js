const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'miniprogram');
const { presentJob, contentBlocks, deadlineMeta } = require('../miniprogram/utils/job-presenter.js');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('job presenter provides restrained fallbacks and caps decision tags', () => {
  const view = presentJob({
    id: 'job-long-title',
    title: 'Senior International Financial Data Analytics and Reporting Specialist',
    company: 'Example Company',
    city: 'Boston',
    state: 'MA',
    type: 'FULLTIME',
    graduationYear: '2027届',
    recruitmentType: '校招',
    conversionOpportunity: true,
    education: '本科及以上',
    remoteType: '混合办公',
    optFriendly: true,
    h1bSponsor: true,
    tags: ['接受应届生'],
    description: 'Use Python, SQL, Tableau, AWS and Excel for data analysis.',
    requirements: ['Python', 'SQL', 'Tableau', 'AWS']
  });

  assert.equal(view.salary, '薪资面议');
  assert.equal(view.employmentType, '全职');
  assert.equal(view.location, 'Boston, MA');
  assert.equal(view.attributeTags.length, 4);
  assert.ok(view.extraAttributeCount > 0);
  assert.equal(view.skills.length, 3);
  assert.equal(view.deadlineText, '长期招聘');
  assert.equal(view.applyCountText, '');
});

test('job presenter marks past deadlines and applied jobs as unavailable to apply', () => {
  const expired = presentJob({ id: 'expired', deadline: '2000-01-01' });
  const applied = presentJob({ id: 'applied', applicationStatus: 'applied' });
  const missing = presentJob({ id: 'missing-fields' });
  const singleSalary = presentJob({ id: 'single-salary', salary: '$76k - $76k' });
  const hourlySalary = presentJob({ id: 'hourly-salary', salaryMin: 35, salaryMax: 50, salaryUnit: 'hour' });
  const matched = presentJob({ id: 'matched', matchScore: 86, matchReasons: ['专业匹配', '技能匹配'] });

  assert.equal(deadlineMeta('2000-01-01').closed, true);
  assert.equal(expired.applyButtonText, '已截止');
  assert.equal(applied.isApplied, true);
  assert.equal(applied.applyButtonText, '已投递');
  assert.equal(missing.location, '');
  assert.equal(singleSalary.salary, '$76k');
  assert.equal(hourlySalary.salary, '$35–$50/小时');
  assert.equal(matched.matchScore, 86);
  assert.equal(matched.hasMatch, true);
});

test('HTML job descriptions become readable text blocks without markup', () => {
  const blocks = contentBlocks('<p>About the role</p><ul><li>Build dashboards</li><li>Analyze data</li></ul>');
  assert.deepEqual(blocks.map(item => item.text), ['About the role', 'Build dashboards', 'Analyze data']);
  assert.equal(blocks.some(item => /<[^>]+>/.test(item.text)), false);
});

test('job lists share one card component and detail follows the decision order', () => {
  const jobsWxml = read('pages/jobs/jobs.wxml');
  const searchWxml = read('package-user/pages/search/search.wxml');
  const cardWxml = read('components/c-job-card/c-job-card.wxml');
  const detailWxml = read('package-user/pages/job-detail/job-detail.wxml');

  assert.match(jobsWxml, /<c-job-card[\s\S]*bind:favorite="toggleSave"/);
  assert.match(searchWxml, /<c-job-card[\s\S]*bind:favorite="toggleJobFavorite"/);
  assert.match(cardWxml, /job-card__headline[\s\S]*job-card__title[\s\S]*job-card__salary/);
  assert.match(cardWxml, /attributeTags/);
  assert.match(cardWxml, /view\.skills/);
  assert.match(cardWxml, /job-card__deadline/);
  assert.match(cardWxml, /catchtap="toggleFavorite"/);

  const orderedMarkers = [
    'class="core-card"',
    'company-summary-card',
    'match-summary-card',
    '职位基础条件',
    '职位描述',
    '任职要求',
    'timeline-card',
    '公司介绍',
    '相似职位',
    'class="footer"'
  ];
  let previous = -1;
  orderedMarkers.forEach(marker => {
    const current = detailWxml.indexOf(marker);
    assert.ok(current > previous, marker + ' must appear after the prior detail module');
    previous = current;
  });
  assert.match(detailWxml, /deadlineClosed \|\| isApplied/);
  assert.match(detailWxml, /loading && !job/);
  assert.match(detailWxml, /bindtap="retryLoad"/);
});
