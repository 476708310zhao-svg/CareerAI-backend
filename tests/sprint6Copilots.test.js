'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const oa = require('../services/v4OaCopilot');
const projects = require('../services/v4ProjectBuilder');
const trust = require('../services/v4JobTrust');

test('Sprint 6 OA does not infer capability without user-confirmed samples', () => {
  const stats = oa.capabilityStats(-60001);
  assert.equal(stats.length, Object.keys(oa.QUESTION_TYPES).length);
  stats.forEach(item => {
    assert.equal(item.sessions, 0);
    assert.equal(item.accuracy, null);
    assert.equal(item.averageSecondsPerQuestion, null);
    assert.match(item.sampleNotice, /尚无练习样本/);
  });
});

test('Sprint 6 OA completion requires explicit self-report confirmation before lookup', () => {
  assert.throws(() => oa.completeSession(-60001, -1, {
    totalQuestions: 10, correctCount: 8
  }), error => error.code === 'RESULT_CONFIRMATION_REQUIRED');
});

test('Sprint 6 Project Builder blocks unfinished projects and unverified resume numbers', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'services', 'v4ProjectBuilder.js'), 'utf8');
  assert.match(source, /project\.status !== 'completed' \|\| !project\.verified_completion/);
  assert.match(source, /UNVERIFIED_PROJECT_METRIC/);
  assert.deepEqual(projects.numericalTokens('处理 120 条数据，准确率 91%，复核 120 条'), ['120', '91%']);
});

test('Sprint 6 Job Trust evidence weights sum to 100 and score stays bounded', () => {
  const job = {
    id: 'trust-complete', title: 'Data Analyst', company: 'Example', location: 'Shanghai',
    applyUrl: 'https://jobs.example.com/1', source: 'local', postedAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  const result = trust.buildTrust(job, [job], [{ status: 'active', checkedOfficial: true,
    officialUrl: job.applyUrl, observedAt: new Date().toISOString() }]);
  assert.equal(result.evidence.reduce((sum, item) => sum + item.maximum, 0), 100);
  assert.equal(result.evidence.reduce((sum, item) => sum + item.score, 0), result.score);
  assert.ok(result.score >= 0 && result.score <= 100);
  assert.match(result.notice, /不能证明岗位真实/);
});

test('Sprint 6 Job Trust exposes missing evidence as risk instead of a conclusion', () => {
  const job = { id: 'trust-missing', title: 'Analyst', company: 'Unknown', location: '' };
  const result = trust.buildTrust(job, [job], []);
  assert.equal(result.confidence, 'low');
  assert.ok(result.risks.some(item => item.includes('缺少可核验')));
  assert.ok(result.risks.some(item => item.includes('尚未由用户')));
  assert.match(result.notice, /缺失数据不会被包装成确定结论/);
});

test('Sprint 6 migration is additive and creates all six persistence tables', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', '0004_sprint6_oa_projects_job_trust.sql'), 'utf8');
  for (const table of ['oa_training_plans_v4', 'oa_practice_sessions_v4', 'oa_mistakes_v4',
    'career_projects_v4', 'career_project_milestones_v4', 'job_trust_observations_v4']) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.doesNotMatch(sql, /^\s*(?:DROP|DELETE|TRUNCATE|ALTER)\b/im);
});

test('Sprint 6 mini program uses V4 evidence workflows and removes fictional project writeback', () => {
  const root = path.join(__dirname, '..', 'miniprogram');
  const oaPage = fs.readFileSync(path.join(root, 'package-career', 'pages', 'oa-bank', 'oa-bank.js'), 'utf8');
  const projectPage = fs.readFileSync(path.join(root, 'package-career', 'pages', 'project-builder', 'project-builder.js'), 'utf8');
  const trustPage = fs.readFileSync(path.join(root, 'package-user', 'pages', 'job-detail', 'job-detail.wxml'), 'utf8');
  assert.match(oaPage, /confirmSelfReported:\s*true/);
  assert.match(projectPage, /confirmEvidence:\s*true/);
  assert.match(projectPage, /confirmRealCompletion:\s*true/);
  assert.match(projectPage, /confirmResumeWriteback:\s*true/);
  assert.doesNotMatch(projectPage, /generateProject|onlineResume|\/api\/ai\/project-builder/);
  assert.match(trustPage, /Job Trust Score 仅汇总现有证据|jobTrust\.notice/);
});
