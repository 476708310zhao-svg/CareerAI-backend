'use strict';

const isolatedRuntime = require('./helpers/isolatedTestRuntime.cjs');
isolatedRuntime.install();
isolatedRuntime.prepare();

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
isolatedRuntime.registerCleanup(test);
const {
  dateKey,
  buildDiagnostic,
  buildWeeklyReport,
  buildDynamicPlan,
  dailyCandidates,
  buildCareerState,
  ensureDailyTasks
} = require('../services/v4CareerCoach');
const todayTasks = require('../services/v4TodayTasks');
const db = require('../db/database');
const {
  shanghaiDayKey,
  utcTimestampToShanghaiDayKey,
  addCalendarDays,
  calendarDayDifference,
  shanghaiWeekRange
} = require('../utils/shanghaiDate');
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

test('Shanghai business dates cross UTC midnight at 00:00 Asia/Shanghai', () => {
  const beforeMidnight = new Date('2026-10-08T15:59:59.000Z');
  const afterMidnight = new Date('2026-10-08T16:00:00.000Z');

  assert.equal(shanghaiDayKey(beforeMidnight), '2026-10-08');
  assert.equal(shanghaiDayKey(afterMidnight), '2026-10-09');
  assert.equal(dateKey(beforeMidnight), '2026-10-08');
  assert.equal(dateKey(afterMidnight), '2026-10-09');
  assert.deepEqual(shanghaiWeekRange(beforeMidnight), { start: '2026-10-05', end: '2026-10-11' });
  assert.deepEqual(shanghaiWeekRange(afterMidnight), { start: '2026-10-05', end: '2026-10-11' });
  assert.equal(addCalendarDays('2026-10-08', 1), '2026-10-09');
  assert.equal(calendarDayDifference('2026-10-09', '2026-10-08'), 1);
  assert.equal(calendarDayDifference('2026-10-08', '2026-10-09'), -1);
  assert.equal(calendarDayDifference('2026-10-09', '2026-10-09'), 0);
  assert.equal(addCalendarDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addCalendarDays('2026-01-31', 1), '2026-02-01');
  assert.throws(() => addCalendarDays('2026-02-29', 1), /Invalid calendar day/);
  assert.throws(() => shanghaiDayKey('not-a-date'), /Invalid date/);
  assert.deepEqual(shanghaiWeekRange('2026-10-11T15:59:59.000Z'), { start: '2026-10-05', end: '2026-10-11' });
  assert.deepEqual(shanghaiWeekRange('2026-10-11T16:00:00.000Z'), { start: '2026-10-12', end: '2026-10-18' });
  assert.equal(utcTimestampToShanghaiDayKey('2026-10-11 15:59:59'), '2026-10-11');
  assert.equal(utcTimestampToShanghaiDayKey('2026-10-11 16:00:00'), '2026-10-12');
  assert.throws(() => utcTimestampToShanghaiDayKey('invalid'), /Invalid UTC timestamp/);

  const helperPath = path.join(__dirname, '..', 'utils', 'shanghaiDate.js');
  const script = `const h=require(${JSON.stringify(helperPath)});process.stdout.write(JSON.stringify({day:h.shanghaiDayKey('2026-10-11T16:00:00.000Z'),week:h.shanghaiWeekRange('2026-10-11T16:00:00.000Z'),audit:h.utcTimestampToShanghaiDayKey('2026-10-11 16:00:00')}));`;
  const outputs = ['UTC', 'America/Los_Angeles'].map(TZ => execFileSync(process.execPath, ['-e', script], {
    encoding: 'utf8', env: { ...process.env, TZ }
  }));
  assert.equal(outputs[0], outputs[1]);

  const userId = Number(db.prepare('INSERT INTO users (openid,nickname) VALUES (?,?)')
    .run(`shanghai_boundary_${Date.now()}`, 'Shanghai date boundary').lastInsertRowid);
  try {
    const beforeState = buildCareerState(userId, beforeMidnight);
    const beforeTasks = ensureDailyTasks(userId, beforeMidnight, beforeState);
    assert.equal(beforeTasks.date, '2026-10-08');
    assert.ok(beforeTasks.created > 0);
    const listedBefore = todayTasks.list(userId, beforeMidnight);
    assert.ok(listedBefore.length > 0);
    assert.ok(listedBefore.every(item => item.taskDate === '2026-10-08'));

    const afterState = buildCareerState(userId, afterMidnight);
    const afterTasks = ensureDailyTasks(userId, afterMidnight, afterState);
    assert.equal(afterTasks.date, '2026-10-09');
    assert.ok(afterTasks.created > 0);
    const listedAfter = todayTasks.list(userId, afterMidnight);
    assert.ok(listedAfter.length > 0);
    assert.ok(listedAfter.every(item => item.taskDate === '2026-10-09'));
    assert.ok(todayTasks.listScheduled(userId, 10, beforeMidnight).some(item => item.taskDate === '2026-10-09'));

    const diagnosticDays = db.prepare('SELECT snapshot_date FROM career_diagnostics_v4 WHERE user_id=? ORDER BY snapshot_date')
      .all(userId).map(row => row.snapshot_date);
    assert.deepEqual(diagnosticDays, ['2026-10-08', '2026-10-09']);

    const deadlineBefore = dailyCandidates(snapshot({
      now: beforeMidnight,
      applications: [{ id: 91, normalizedStatus: 'interested', deadline: '2026-10-09', company: 'Boundary Co' }]
    }), buildDiagnostic(snapshot()), buildWeeklyReport(snapshot()));
    const deadlineAfter = dailyCandidates(snapshot({
      now: afterMidnight,
      applications: [{ id: 91, normalizedStatus: 'interested', deadline: '2026-10-09', company: 'Boundary Co' }]
    }), buildDiagnostic(snapshot()), buildWeeklyReport(snapshot()));
    assert.match(deadlineBefore.find(item => item.key === 'deadline_91').detail, /距离截止 1 天/);
    assert.match(deadlineAfter.find(item => item.key === 'deadline_91').detail, /距离截止 0 天/);
  } finally {
    db.prepare('DELETE FROM users WHERE id=?').run(userId);
  }
});

test('Career weekly statistics assign SQLite UTC audit timestamps to Shanghai Monday', () => {
  const userId = Number(db.prepare('INSERT INTO users (openid,nickname) VALUES (?,?)')
    .run(`career_week_boundary_${Date.now()}`, 'Career week boundary').lastInsertRowid);
  const applicationId = Number(db.prepare("INSERT INTO applications (user_id,job_id,status) VALUES (?,?,'applied')")
    .run(userId, `career_week_job_${Date.now()}`).lastInsertRowid);
  try {
    db.prepare(`INSERT INTO application_history (application_id,user_id,to_status,created_at)
      VALUES (?,?,'applied',?), (?,?,'interview_1',?)`)
      .run(applicationId, userId, '2026-10-11 15:59:00', applicationId, userId, '2026-10-11 16:10:00');
    db.prepare(`INSERT INTO analytics_events (user_id,event_name,created_at)
      VALUES (?,'job_viewed',?), (?,'job_matched',?)`)
      .run(userId, '2026-10-11 15:59:00', userId, '2026-10-11 16:10:00');
    db.prepare(`INSERT INTO today_tasks_v4 (user_id,source_type,source_id,title,status,task_date,completed_at)
      VALUES (?,'week_boundary',1,'Sunday task','completed','2026-10-11',?),
             (?,'week_boundary',2,'Monday task','completed','2026-10-12',?)`)
      .run(userId, '2026-10-11 15:59:00', userId, '2026-10-11 16:10:00');

    const state = buildCareerState(userId, new Date('2026-10-11T16:30:00.000Z'));
    assert.deepEqual(state.weeklyReport.period, { start: '2026-10-12', end: '2026-10-18' });
    assert.equal(state.snapshot.eventCounts.job_viewed || 0, 0);
    assert.equal(state.snapshot.eventCounts.job_matched, 1);
    assert.equal(state.snapshot.completedTodayTasks, 1);
    assert.equal(state.weeklyReport.input.applicationsSubmitted, 0);
    assert.equal(state.weeklyReport.input.interviewsReached, 1);
  } finally {
    db.prepare('DELETE FROM users WHERE id=?').run(userId);
  }
});

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
  const pageView = fs.readFileSync(path.join(root, 'package-career', 'pages', 'career-coach', 'career-coach.wxml'), 'utf8');
  const resource = fs.readFileSync(path.join(root, 'pages', 'resources', 'resources.js'), 'utf8');
  assert.ok(careerPackage.pages.includes('pages/career-coach/career-coach'));
  assert.equal(pageConfig.usingComponents['c-ai-disclosure'], '/components/c-ai-disclosure/c-ai-disclosure');
  assert.equal(pageConfig.usingComponents['c-login-popup'], '/components/c-login-popup/c-login-popup');
  assert.match(pageView, /<c-login-popup\b/);
  assert.match(pageView, /show="\{\{authPromptVisible\}\}"/);
  assert.match(pageView, /bindsuccess="onAuthPromptSuccess"/);
  assert.match(page, /getCareerCoachDashboard/);
  assert.match(page, /deferTodayTask/);
  assert.match(page, /updateTodayTask/);
  assert.match(page, /parseDashboardResponse/);
  assert.match(resource, /精选/);
  assert.match(resource, /笔试题库/);
  assert.doesNotMatch(resource, /career-coach\/career-coach|Career Coach/);
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
