'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  buildDiagnostic,
  buildWeeklyReport,
  buildDynamicPlan,
  dailyCandidates
} = require('../services/v4CareerCoach');
const {
  parseDashboardResponse
} = require('../miniprogram/package-career/pages/career-coach/career-coach-state');

function snapshot(overrides = {}) {
  return {
    userId: 1,
    now: new Date('2026-09-08T10:00:00+08:00'),
    profile: {
      school: 'Example University', major: 'Computer Science', degree: 'Master', graduationYear: '2027',
      targetRoles: ['Data Analyst'], skills: ['SQL', 'Python'], projects: [], profileVersion: 3
    },
    experiences: [
      { type: 'experience', verified: 1, title: '实习', content: JSON.stringify({ description: '完成用户分析并交付真实报告，说明个人贡献和复盘。' }) }
    ],
    resumes: [{ id: 1, current_version_id: 2, target_job_id: '' }],
    resumeVersions: 2,
    confirmedResumeChanges: 1,
    resumeLinks: 0,
    interviewReports: [],
    contacts: 0,
    contactApplications: 0,
    applications: [],
    history: [],
    eventCounts: {},
    completedTodayTasks: 0,
    weekStart: '2026-09-07',
    weekEnd: '2026-09-13',
    ...overrides
  };
}

test('Sprint 4 diagnostic always returns seven evidence-backed dimensions', () => {
  const diagnostic = buildDiagnostic(snapshot());
  assert.equal(diagnostic.dimensions.length, 7);
  assert.deepEqual(diagnostic.dimensions.map(item => item.key), [
    'education', 'experience', 'skills', 'projects', 'resume', 'interview', 'networking'
  ]);
  diagnostic.dimensions.forEach(item => {
    assert.ok(item.evidence.length >= 2);
    assert.ok(item.gap);
    assert.ok(item.action.url.startsWith('/'));
  });
  assert.match(diagnostic.scoreMeaning, /不是.*录用概率/);
  assert.ok(diagnostic.priorities.includes('networking'));
});

test('Sprint 4 weekly report keeps sample counts explicit and never fabricates a success rate', () => {
  const report = buildWeeklyReport(snapshot());
  assert.equal(report.conversions[0].rate, null);
  assert.equal(report.conversions[0].display, '样本不足');
  assert.equal(report.bottleneck.code, 'sourcing');
  assert.match(report.evidenceNotice, /不预测未来录用概率/);
});

test('Sprint 4 dynamic plan responds to the real funnel bottleneck', () => {
  const applications = [1, 2, 3].map(id => ({ id, normalizedStatus: 'applied', updated_at: '2026-09-08 00:00:00' }));
  const source = snapshot({ applications });
  const diagnostic = buildDiagnostic(source);
  const weekly = buildWeeklyReport(source);
  const plan = buildDynamicPlan(diagnostic, weekly);
  assert.equal(weekly.bottleneck.code, 'resume_targeting');
  assert.match(plan.horizons[0].objective, /投递到面试/);
  assert.deepEqual(plan.horizons.map(item => item.months), [3, 6, 12]);
});

test('Sprint 4 daily coach selects three to five unique actionable tasks', () => {
  const source = snapshot();
  const diagnostic = buildDiagnostic(source);
  const weekly = buildWeeklyReport(source);
  const tasks = dailyCandidates(source, diagnostic, weekly);
  assert.ok(tasks.length >= 3 && tasks.length <= 5);
  assert.equal(new Set(tasks.map(item => item.key)).size, tasks.length);
  assert.ok(tasks.every(item => item.title && item.detail && item.url.startsWith('/')));
});

test('Sprint 4 mini program exposes the coach page, task completion and deferral', () => {
  const root = path.join(__dirname, '..', 'miniprogram');
  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  const careerPackage = appConfig.subPackages.find(item => item.root === 'package-career');
  const pageConfig = JSON.parse(fs.readFileSync(path.join(root, 'package-career', 'pages', 'career-coach', 'career-coach.json'), 'utf8'));
  const page = fs.readFileSync(path.join(root, 'package-career', 'pages', 'career-coach', 'career-coach.js'), 'utf8');
  const resource = fs.readFileSync(path.join(root, 'pages', 'resources', 'resources.js'), 'utf8');
  assert.ok(careerPackage.pages.includes('pages/career-coach/career-coach'));
  assert.equal(pageConfig.usingComponents['c-ai-disclosure'], '/components/c-ai-disclosure/c-ai-disclosure');
  assert.match(page, /getCareerCoachDashboard/);
  assert.match(page, /deferTodayTask/);
  assert.match(page, /updateTodayTask/);
  assert.match(page, /parseDashboardResponse/);
  assert.match(resource, /career-coach\/career-coach/);
});

test('Sprint 4 mini program never renders request failures as an empty dashboard', () => {
  assert.equal(parseDashboardResponse({ data: [], _source: 'unauthorized' }).state, 'login');
  for (const source of ['timeout', 'networkError', 'rateLimit', 'error']) {
    const parsed = parseDashboardResponse({ data: [], _source: source });
    assert.equal(parsed.state, 'error');
    assert.ok(parsed.message);
  }
  assert.equal(parseDashboardResponse({ code: 0, data: {} }).state, 'error');

  const source = snapshot();
  const diagnostic = buildDiagnostic(source);
  const weeklyReport = buildWeeklyReport(source);
  const dynamicPlan = buildDynamicPlan(diagnostic, weeklyReport);
  const parsed = parseDashboardResponse({
    code: 0,
    data: {
      diagnostic,
      weeklyReport,
      dynamicPlan,
      today: { tasks: [], scheduled: [] }
    }
  });
  assert.equal(parsed.state, 'ready');
  assert.equal(parsed.data.diagnostic.dimensions.length, 7);
});
