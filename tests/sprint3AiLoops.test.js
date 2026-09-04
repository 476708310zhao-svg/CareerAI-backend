'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { buildJobMatch } = require('../services/v4JobMatch');
const { buildInterviewBrief } = require('../services/v4Interview');

const completeProfile = {
  workAuthorization: 'OPT',
  sponsorNeeded: false,
  degree: 'Master',
  graduationYear: '2026',
  major: 'Computer Science',
  targetCities: ['New York'],
  targetRoles: ['Software Engineer'],
  targetIndustries: ['Technology'],
  skills: ['Python', 'SQL', 'JavaScript'],
  projects: ['Built Python SQL data platform']
};

const alignedJob = {
  id: 'sprint3-safe',
  title: 'Software Engineer',
  company: 'Example Tech',
  location: 'New York',
  industry: 'Technology',
  description: 'Software Engineer using Python SQL JavaScript. Bachelor degree.',
  requirements: []
};

test('Sprint 3 job match provides an actionable tier and explicit apply decision', () => {
  const result = buildJobMatch(alignedJob, completeProfile, { h1bSponsor: true, confidence: 0.9, source: 'official' });
  assert.equal(result.tier, 'safe');
  assert.match(result.tierLabel, /Safe/);
  assert.equal(result.decision.worthApplying, true);
  assert.equal(result.decision.code, 'apply');
  assert.match(result.decision.summary, /资格.*技能/);
  assert.equal(result.sponsorAssessment.status, 'not_required');
});

test('Sprint 3 sponsor evidence uses the stored zero-to-one confidence scale', () => {
  const result = buildJobMatch(alignedJob, { ...completeProfile, sponsorNeeded: true }, {
    h1bSponsor: true,
    confidence: 0.9,
    source: 'official'
  });
  assert.equal(result.sponsorAssessment.status, 'supported');
  assert.equal(result.sponsorAssessment.confidence, 0.9);
});

test('Sprint 3 never puts a citizen-only role into Target Reach or Safe', () => {
  const result = buildJobMatch({ ...alignedJob, citizenRequired: true }, completeProfile, { citizenRequired: true, source: 'official' });
  assert.equal(result.tier, 'blocked');
  assert.equal(result.decision.code, 'skip');
  assert.equal(result.decision.worthApplying, false);
  assert.equal(result.sponsorAssessment.status, 'blocked');
});

test('Sprint 3 interview brief uses stored evidence and keeps uncertainty explicit', () => {
  const brief = buildInterviewBrief({
    space: { company: 'Example Tech', job_title: 'Data Engineer', round: 'second_interview' },
    application: { job_snapshot: JSON.stringify({ description: 'Python SQL distributed systems' }), notes: '' },
    companyExperiences: [{ title: '数据平台二面', round: '二面', content: '讨论系统设计与项目取舍' }],
    starMaterials: [{ id: 8, title: '数据管道', organization: '课程项目', content: JSON.stringify({ description: '用 Python 和 SQL 构建数据管道' }) }]
  });
  assert.ok(brief.jdCapabilities.includes('Python'));
  assert.ok(brief.jdCapabilities.includes('SQL'));
  assert.equal(brief.historicalPatterns[0].title, '数据平台二面');
  assert.equal(brief.starMaterials[0].id, 8);
  assert.match(brief.evidenceNotice, /不由 AI 补造/);
});

test('Sprint 3 mini program connects job match to targeted resume and focused interview practice', () => {
  const root = path.join(__dirname, '..', 'miniprogram');
  const jobDetail = fs.readFileSync(path.join(root, 'package-user', 'pages', 'job-detail', 'job-detail.js'), 'utf8');
  const resumeCenter = fs.readFileSync(path.join(root, 'package-career', 'pages', 'resume-center', 'resume-center.js'), 'utf8');
  const interviewSpace = fs.readFileSync(path.join(root, 'package-ai', 'pages', 'interview-space', 'interview-space.js'), 'utf8');
  assert.match(jobDetail, /pendingResumeOptimization/);
  assert.match(jobDetail, /resume-center\?targeted=1/);
  assert.match(resumeCenter, /jobId: context\.jobId/);
  assert.match(resumeCenter, /applicationId: context\.applicationId/);
  assert.match(interviewSpace, /startFocusPractice/);
});
