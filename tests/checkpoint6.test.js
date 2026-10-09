'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs');
const jwt = require('jsonwebtoken');
const path = require('node:path');
const vm = require('node:vm');
const isolatedRuntime = require('./helpers/isolatedTestRuntime.cjs');

isolatedRuntime.install();
const db = isolatedRuntime.prepare();
isolatedRuntime.registerCleanup(test);

const resumeCenter = require('../services/v4ResumeCenter');
const interviewService = require('../services/v4Interview');
const aiRuntime = require('../services/v4AiRuntime');
const resumeRoutes = require('../routes/v4/resumes');
const materialRoutes = require('../routes/v4/materials');
const interviewRoutes = require('../routes/v4/interviews');
const careerAssetRoutes = require('../routes/career-assets');

const OWNER_ID = 986001;
const OTHER_ID = 986002;
let ownerResume;
let otherResume;
let ownerApplicationId;
let otherApplicationId;
let ownerSpaceId;
let legacyResumeId;
let server;
let baseUrl;

const tokenFor = userId => jwt.sign({ userId, openid: `cp6-${userId}` }, process.env.JWT_SECRET);

async function request(prefix, path, { method = 'GET', userId = OWNER_ID, body } = {}) {
  const response = await fetch(`${baseUrl}/api/v4/${prefix}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(userId ? { Authorization: `Bearer ${tokenFor(userId)}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { response, payload: await response.json() };
}

function createResume(userId, suffix) {
  const result = db.prepare(`
    INSERT INTO resumes (user_id,name,data,is_default,resume_type,archived_at,updated_at)
    VALUES (?,?,?,0,'general','',datetime('now'))
  `).run(userId, `CP6 ${suffix}`, JSON.stringify({
    summary: `真实的 ${suffix} 项目经历`,
    skills: ['Node.js'],
    projects: [{ title: suffix, description: '负责真实功能交付' }]
  }));
  const owned = resumeCenter.ensureCurrentVersion(userId, Number(result.lastInsertRowid));
  return { id: owned.resume.id, versionId: owned.version.id };
}

function createApplication(userId, resume, suffix, progressStatus = 'interested') {
  return Number(db.prepare(`
    INSERT INTO applications
      (user_id,job_id,job_snapshot,status,status_text,progress_status,company,job_title,resume_id,resume_version_id)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(
    userId,
    `cp6-job-${suffix}`,
    JSON.stringify({ company: `CP6 ${suffix} 公司`, title: `CP6 ${suffix} 岗位`, description: '负责可靠系统开发' }),
    progressStatus,
    '测试状态',
    progressStatus,
    `CP6 ${suffix} 公司`,
    `CP6 ${suffix} 岗位`,
    resume.id,
    String(resume.versionId)
  ).lastInsertRowid);
}

test.before(async () => {
  db.prepare('INSERT OR IGNORE INTO users(id,openid,nickname) VALUES (?,?,?)').run(OWNER_ID, 'cp6-owner', 'CP6 Owner');
  db.prepare('INSERT OR IGNORE INTO users(id,openid,nickname) VALUES (?,?,?)').run(OTHER_ID, 'cp6-other', 'CP6 Other');
  ownerResume = createResume(OWNER_ID, 'Owner');
  otherResume = createResume(OTHER_ID, 'Other');
  ownerApplicationId = createApplication(OWNER_ID, ownerResume, 'Owner', 'first_interview');
  otherApplicationId = createApplication(OTHER_ID, otherResume, 'Other', 'first_interview');
  ownerSpaceId = interviewService.ensureSpace(OWNER_ID, ownerApplicationId).id;

  legacyResumeId = Number(db.prepare(`
    INSERT INTO resumes (user_id,name,data,is_default,resume_type,archived_at,updated_at)
    VALUES (?,?,?,0,'general','',datetime('now'))
  `).run(OWNER_ID, 'CP6 Legacy Read Only', '{}').lastInsertRowid);

  const app = express();
  app.use(express.json());
  app.use('/api/v4/resumes', resumeRoutes);
  app.use('/api/v4/materials', materialRoutes);
  app.use('/api/v4/interviews', interviewRoutes);
  app.use('/api/v4/career-assets', careerAssetRoutes);
  server = isolatedRuntime.trackServer(await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  }));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test('resume reads are side-effect free while manual versions enforce owner and optimistic concurrency', async () => {
  const before = db.prepare('SELECT COUNT(*) AS count FROM resume_versions_v4 WHERE resume_id=?').get(legacyResumeId).count;
  assert.equal(before, 0);
  assert.equal((await request('resumes', '')).response.status, 200);
  const versionsRead = await request('resumes', `/${legacyResumeId}/versions`);
  assert.equal(versionsRead.response.status, 200);
  assert.equal(versionsRead.response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(versionsRead.payload.data, []);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM resume_versions_v4 WHERE resume_id=?').get(legacyResumeId).count, 0);

  const initialized = await request('resumes', `/${legacyResumeId}/versions`, {
    method: 'POST', body: { expectedVersionId: null, useLegacyContent: true }
  });
  assert.equal(initialized.response.status, 201);
  assert.equal(initialized.payload.data.versionNo, 1);
  assert.equal(db.prepare('SELECT current_version_id FROM resumes WHERE id=?').pluck().get(legacyResumeId), initialized.payload.data.id);
  assert.equal((await request('resumes', `/${legacyResumeId}/versions`, {
    method: 'POST', body: { expectedVersionId: null, useLegacyContent: true }
  })).response.status, 409);

  const missingExpected = await request('resumes', `/${ownerResume.id}/versions`, {
    method: 'POST', body: { content: { summary: 'draft' } }
  });
  assert.equal(missingExpected.response.status, 400);
  const stale = await request('resumes', `/${ownerResume.id}/versions`, {
    method: 'POST', body: { expectedVersionId: ownerResume.versionId + 9999, content: { summary: 'draft' } }
  });
  assert.equal(stale.response.status, 409);
  const foreign = await request('resumes', `/${otherResume.id}/versions`, {
    method: 'POST', body: { expectedVersionId: otherResume.versionId, content: { summary: 'cross owner' } }
  });
  assert.equal(foreign.response.status, 404);

  const created = await request('resumes', `/${ownerResume.id}/versions`, {
    method: 'POST',
    body: { expectedVersionId: ownerResume.versionId, content: { summary: '用户确认后的完整简历', skills: ['Node.js'] } }
  });
  assert.equal(created.response.status, 201);
  assert.notEqual(created.payload.data.id, ownerResume.versionId);
  assert.equal(db.prepare('SELECT current_version_id FROM resumes WHERE id=?').pluck().get(ownerResume.id), created.payload.data.id);

  const versionsBeforeRestore = db.prepare('SELECT COUNT(*) FROM resume_versions_v4 WHERE resume_id=?').pluck().get(ownerResume.id);
  const missingRestoreExpected = await request('resumes', `/${ownerResume.id}/versions/${ownerResume.versionId}/restore`, {
    method:'POST', body:{}
  });
  assert.equal(missingRestoreExpected.response.status, 400);
  const staleRestore = await request('resumes', `/${ownerResume.id}/versions/${ownerResume.versionId}/restore`, {
    method:'POST', body:{ expectedVersionId:ownerResume.versionId }
  });
  assert.equal(staleRestore.response.status, 409);
  assert.equal(staleRestore.payload.code, 'STALE_RESUME_VERSION');
  assert.equal(db.prepare('SELECT COUNT(*) FROM resume_versions_v4 WHERE resume_id=?').pluck().get(ownerResume.id), versionsBeforeRestore);
  const restored = await request('resumes', `/${ownerResume.id}/versions/${ownerResume.versionId}/restore`, {
    method:'POST', body:{ expectedVersionId:created.payload.data.id }
  });
  assert.equal(restored.response.status, 201);
  assert.equal(db.prepare('SELECT current_version_id FROM resumes WHERE id=?').pluck().get(ownerResume.id), restored.payload.data.id);
  const repeatedRestore = await request('resumes', `/${ownerResume.id}/versions/${ownerResume.versionId}/restore`, {
    method:'POST', body:{ expectedVersionId:created.payload.data.id }
  });
  assert.equal(repeatedRestore.response.status, 409);
});

test('application materials validate application, resume and selected version ownership before consuming quota', async () => {
  assert.equal((await request('materials', '/drafts?applicationId=invalid')).response.status, 400);
  assert.equal((await request('materials', `/drafts?applicationId=${otherApplicationId}`)).response.status, 404);
  assert.equal((await request('materials', '/drafts', {
    method: 'POST', body: { applicationId: otherApplicationId, materialType: 'why_company' }
  })).response.status, 404);
  assert.equal((await request('materials', '/drafts', {
    method: 'POST', body: { applicationId: ownerApplicationId, resumeId: otherResume.id, materialType: 'why_company' }
  })).response.status, 404);
  assert.equal((await request('materials', '/drafts', {
    method: 'POST',
    body: { applicationId: ownerApplicationId, resumeId: ownerResume.id, resumeVersionId: otherResume.versionId, materialType: 'why_role' }
  })).response.status, 404);
});

test('application materials stay pending until confirmation and saved materials archive only for their owner', async () => {
  const originalGenerate = aiRuntime.generate;
  aiRuntime.generate = async options => ({
    value: options.fallback(), source: 'fallback', degraded: true, provider: 'test', model: 'cp6-fixture',
    attempts: 0, elapsedMs: 0, usage: null, estimatedCostUsd: null, fallbackReason: 'test'
  });
  try {
    const currentVersionId = db.prepare('SELECT current_version_id FROM resumes WHERE id=?').pluck().get(ownerResume.id);
    const savedBefore = db.prepare('SELECT COUNT(*) AS count FROM application_materials WHERE user_id=?').get(OWNER_ID).count;
    const draft = await request('materials', '/drafts', {
      method: 'POST',
      body: {
        applicationId: ownerApplicationId,
        resumeId: ownerResume.id,
        resumeVersionId: currentVersionId,
        materialType: 'why_company'
      }
    });
    assert.equal(draft.response.status, 201);
    assert.equal(draft.payload.data.status, 'pending');
    assert.equal(draft.payload.data.materialType, 'why_company');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM application_materials WHERE user_id=?').get(OWNER_ID).count, savedBefore);

    const confirmed = await request('materials', `/drafts/${draft.payload.data.id}/confirm`, {
      method: 'POST', body: { content: '这是用户核验并确认保存的申请材料。' }
    });
    assert.equal(confirmed.response.status, 201);
    const materialId = confirmed.payload.data.materialId;
    const confirmedAgain = await request('materials', `/drafts/${draft.payload.data.id}/confirm`, {
      method: 'POST', body: { content: '这是用户核验并确认保存的申请材料。' }
    });
    assert.equal(confirmedAgain.response.status, 200);
    assert.equal(confirmedAgain.payload.data.materialId, materialId);
    assert.equal(db.prepare('SELECT COUNT(*) FROM application_materials WHERE user_id=? AND ai_draft_id=?').pluck().get(OWNER_ID, draft.payload.data.id), 1);
    assert.equal(db.prepare('SELECT status FROM application_materials WHERE id=?').pluck().get(materialId), 'saved');
    assert.equal((await request('materials', `/saved/${materialId}/archive`, { method: 'POST', userId: OTHER_ID })).response.status, 404);
    assert.equal((await request('materials', `/saved/${materialId}/archive`, { method: 'POST' })).response.status, 200);
    assert.equal(db.prepare('SELECT status FROM application_materials WHERE id=?').pluck().get(materialId), 'archived');
  } finally {
    aiRuntime.generate = originalGenerate;
  }
});

test('interview reads never create spaces and all space details remain owner scoped', async () => {
  const noSpaceApplicationId = createApplication(OWNER_ID, ownerResume, 'NoSpace', 'second_interview');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM interview_spaces_v4 WHERE application_id=?').get(noSpaceApplicationId).count, 0);
  const list = await request('interviews', '/spaces');
  assert.equal(list.response.status, 200);
  assert.ok(list.payload.data.some(item => Number(item.id) === Number(ownerSpaceId)));
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM interview_spaces_v4 WHERE application_id=?').get(noSpaceApplicationId).count, 0);
  const created = await request('interviews', '/spaces', { method:'POST', body:{ applicationId:noSpaceApplicationId } });
  assert.equal(created.response.status, 201);
  const createdAgain = await request('interviews', '/spaces', { method:'POST', body:{ applicationId:noSpaceApplicationId } });
  assert.equal(createdAgain.response.status, 200);
  assert.equal(createdAgain.payload.data.id, created.payload.data.id);
  assert.equal((await request('interviews', `/spaces/${ownerSpaceId}`, { userId: OTHER_ID })).response.status, 404);
  const detail = await request('interviews', `/spaces/${ownerSpaceId}`);
  assert.equal(detail.response.status, 200);
  assert.equal(Number(detail.payload.data.space.applicationId), ownerApplicationId);
});

test('stale resume AI plans cannot overwrite a newer current version', async () => {
  const staleResume = createResume(OWNER_ID, 'Stale Change Set');
  const current = db.prepare('SELECT * FROM resume_versions_v4 WHERE id=(SELECT current_version_id FROM resumes WHERE id=?)').get(staleResume.id);
  const sourceContent = resumeCenter.parseJson(current.content, {});
  const before = sourceContent.summary;
  const changeSet = await resumeCenter.createChangeSet({
    userId: OWNER_ID,
    resumeId: staleResume.id,
    suggestions: [{ id:'cp6-stale', path:'summary', before, after:before + '，并明确交付责任', reason:'测试过期保护', sourceExperienceIds:[], addsFacts:false }]
  });
  resumeCenter.createVersion({ userId:OWNER_ID, resumeId:staleResume.id, content:Object.assign({}, sourceContent,{summary:before+'，新版本'}), sourceVersionId:current.id, summary:'并发更新' });
  assert.throws(
    () => resumeCenter.confirmChangeSet({ userId:OWNER_ID, changeSetId:changeSet.id, decisions:{'cp6-stale':'accept'} }),
    err => err && err.status === 409 && err.code === 'STALE_RESUME_CHANGE_SET'
  );
  assert.equal(db.prepare('SELECT status FROM resume_ai_change_sets WHERE id=?').pluck().get(changeSet.id), 'pending');
});

test('interview answer writes recheck active state and completion requires explicit effects confirmation', async () => {
  const startedAnalyticsBefore = db.prepare("SELECT COUNT(*) FROM analytics_events WHERE user_id=? AND event_name='interview_training_started'").pluck().get(OWNER_ID);
  const started = await request('interviews', `/spaces/${ownerSpaceId}/sessions`, { method:'POST', body:{sessionType:'mock'} });
  assert.equal(started.response.status, 201);
  assert.equal(started.payload.created, true);
  const duplicate = await request('interviews', `/spaces/${ownerSpaceId}/sessions`, { method:'POST', body:{sessionType:'mock'} });
  assert.equal(duplicate.response.status, 200);
  assert.equal(duplicate.payload.created, false);
  assert.equal(duplicate.payload.data.id, started.payload.data.id);
  assert.equal(db.prepare("SELECT COUNT(*) FROM analytics_events WHERE user_id=? AND event_name='interview_training_started'").pluck().get(OWNER_ID), startedAnalyticsBefore + 1);
  const sessionId = started.payload.data.id;
  let resolveScore;
  const originalScore = interviewService.scoreAnswer;
  interviewService.scoreAnswer = () => new Promise(resolve => { resolveScore = resolve; });
  try {
    const pendingAnswer = request('interviews', `/sessions/${sessionId}/answers`, { method:'POST', body:{question:'请介绍项目',answer:'真实回答'} });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal((await request('interviews', `/sessions/${sessionId}/cancel`, { method:'POST' })).response.status, 200);
    resolveScore({ content:80,structure:80,expression:80,jobMatch:80,average:80,feedback:'ok',generation:{model:'fixture'} });
    assert.equal((await pendingAnswer).response.status, 409);
    assert.equal(db.prepare('SELECT COUNT(*) FROM interview_answers_v4 WHERE session_id=?').pluck().get(sessionId), 0);
    assert.equal((await request('interviews', `/sessions/${sessionId}/complete`, { method:'POST', body:{confirmEffects:true} })).response.status, 409);
  } finally { interviewService.scoreAnswer = originalScore; }

  const next = await request('interviews', `/spaces/${ownerSpaceId}/sessions`, { method:'POST', body:{sessionType:'mock'} });
  const nextId = next.payload.data.id;
  db.prepare(`INSERT INTO interview_answers_v4(session_id,user_id,question,answer,feedback,content_score,structure_score,expression_score,job_match_score)
    VALUES (?,?,?,?,?,80,75,70,85)`).run(nextId, OWNER_ID, '问题', '回答', '反馈');
  const preview = await request('interviews', `/sessions/${nextId}/complete`, { method:'POST', body:{} });
  assert.equal(preview.response.status, 200);
  assert.equal(preview.payload.data.requiresConfirmation, true);
  assert.equal(db.prepare('SELECT status FROM interview_sessions_v4 WHERE id=?').pluck().get(nextId), 'active');
  assert.equal(db.prepare('SELECT COUNT(*) FROM interview_reports_v4 WHERE session_id=?').pluck().get(nextId), 0);
  const completedAnalyticsBefore = db.prepare("SELECT COUNT(*) FROM analytics_events WHERE user_id=? AND event_name='interview_training_completed'").pluck().get(OWNER_ID);
  const completed = await request('interviews', `/sessions/${nextId}/complete`, { method:'POST', body:{confirmEffects:true} });
  assert.equal(completed.response.status, 201);
  assert.equal(completed.payload.alreadyCompleted, false);
  assert.equal(db.prepare('SELECT status FROM interview_sessions_v4 WHERE id=?').pluck().get(nextId), 'completed');
  const completedAgain = await request('interviews', `/sessions/${nextId}/complete`, { method:'POST', body:{confirmEffects:true} });
  assert.equal(completedAgain.response.status, 200);
  assert.equal(completedAgain.payload.alreadyCompleted, true);
  assert.equal(completedAgain.payload.data.id, completed.payload.data.id);
  assert.equal(db.prepare("SELECT COUNT(*) FROM analytics_events WHERE user_id=? AND event_name='interview_training_completed'").pluck().get(OWNER_ID), completedAnalyticsBefore + 1);
});

test('interview notebook context is canonicalized to an owned application', async () => {
  const foreign = await request('career-assets', '/interview-notebook', {
    method: 'POST',
    body: { id: 'cp6-foreign-context', title: 'foreign', applicationId: otherApplicationId }
  });
  assert.equal(foreign.response.status, 404);

  const saved = await request('career-assets', '/interview-notebook', {
    method: 'POST',
    body: { id: 'cp6-owned-context', title: '如何介绍项目？', applicationId: ownerApplicationId, company: '伪造公司' }
  });
  assert.equal(saved.response.status, 200);
  assert.equal(Number(saved.payload.data.applicationId), ownerApplicationId);
  assert.equal(saved.payload.data.company, 'CP6 Owner 公司');
  assert.equal(saved.payload.data.position, 'CP6 Owner 岗位');
});

test('mobile resume, material and interview links preserve the selected application and version', () => {
  const mini = path.join(__dirname, '..', 'miniprogram');
  const read = relative => fs.readFileSync(path.join(mini, relative), 'utf8');
  assert.equal(fs.existsSync(path.join(mini, 'utils/application-materials.js')), false);
  assert.equal(fs.existsSync(path.join(mini, 'package-ai/utils/application-materials.js')), true);
  assert.match(read('package-ai/utils/application-materials.js'), /MATERIAL_KEY}:\$\{owner \|\| 'guest'/);
  assert.match(read('package-ai/utils/application-materials.js'), /ownerKey !== storageKey\(\)/);
  for (const consumer of [
    'package-ai/pages/ai-assistant/ai-assistant.js',
    'package-ai/pages/application-materials/application-materials.js'
  ]) {
    assert.match(read(consumer), /require\('\.\.\/\.\.\/utils\/application-materials\.js'\)/);
  }

  const materials = read('package-ai/pages/application-materials/application-materials.js');
  const materialsView = read('package-ai/pages/application-materials/application-materials.wxml');
  assert.match(materials, /getResumeVersions\(resume\.id\)/);
  assert.match(materials, /resumeVersionId:\s*version\.id/);
  assert.match(materials, /findIndex\(item => String\(item\.id\) === this\._targetApplicationId\)/);
  assert.match(materialsView, /bindchange="onResumeVersionChange"/);
  assert.match(materials, /ownerStorage\.isCurrent/);
  assert.match(materials, /initializeSelectedResumeVersion/);

  const detail = read('package-user/pages/application-detail/application-detail.js');
  const resumeCenterPage = read('package-career/pages/resume-center/resume-center.js');
  const resumeApi = read('utils/api-v4.js');
  const space = read('package-ai/pages/interview-space/interview-space.js');
  const setup = read('package-ai/pages/interview-setup/interview-setup.js');
  const dialog = read('package-ai/pages/interview-dialog/interview-dialog.js');
  const report = read('package-ai/pages/ai-report/ai-report.js');
  const notebook = read('package-ai/pages/interview-notebook/interview-notebook.js');
  const notebookStore = read('utils/interview-notebook.js');
  assert.match(detail, /applicationId=' \+ encodeURIComponent\(this\.data\.id\)/);
  assert.match(resumeCenterPage, /restoreResumeVersion\(selectedResumeId, version\.id, \{ expectedVersionId \}\)/);
  assert.match(resumeCenterPage, /_restoreRequestGeneration/);
  assert.match(resumeCenterPage, /ownerStorage\.isCurrent\(owner\)/);
  assert.match(resumeApi, /restoreResumeVersion\(id, versionId, payload\)/);
  assert.match(space, /applicationId:\s*space\.applicationId\s*\|\|\s*this\.data\.applicationId/);
  assert.match(space, /confirmEffects:\s*false/);
  assert.match(space, /ownerStorage\.set\('interviewContext'/);
  assert.match(space, /const owner = this\._ownerScope/);
  assert.match(space, /!ownerStorage\.isCurrent\(this\._ownerScope\)/);
  assert.match(setup, /navigationParams\.applicationId/);
  assert.match(dialog, /applicationId:\s*this\.data\.applicationId/);
  assert.match(dialog, /!ownerStorage\.isCurrent\(this\._ownerScope\)/);
  assert.match(report, /applicationId:\s*report\.applicationId/);
  assert.match(notebook, /item\.applicationId/);
  assert.match(notebookStore, /scopedKey\(STORAGE_KEY\)/);
  assert.match(notebookStore, /applicationId:\s*q\.applicationId/);
});

test('sensitive mobile caches are isolated across account switches', () => {
  const storage = new Map();
  const previousWx = global.wx;
  global.wx = {
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: key => storage.delete(key)
  };
  const ownerStoragePath = require.resolve('../miniprogram/utils/owner-storage.js');
  const progressPath = require.resolve('../miniprogram/utils/job-progress.js');
  delete require.cache[ownerStoragePath];
  delete require.cache[progressPath];
  try {
    const ownerStorage = require(ownerStoragePath);
    storage.set('token', tokenFor(OWNER_ID));
    ownerStorage.set('lastAiReport', '', { id:'owner-report' });
    ownerStorage.set('interviewContext', '', { applicationId:ownerApplicationId });
    storage.set('token', tokenFor(OTHER_ID));
    assert.equal(ownerStorage.get('lastAiReport', '', null), null);
    assert.equal(ownerStorage.get('interviewContext', '', null), null);
    ownerStorage.set('lastAiReport', '', { id:'other-report' });
    storage.set('token', tokenFor(OWNER_ID));
    assert.deepEqual(ownerStorage.get('lastAiReport', '', null), { id:'owner-report' });
  } finally {
    delete require.cache[ownerStoragePath];
    delete require.cache[progressPath];
    global.wx = previousWx;
  }
});

test('late interview page results are discarded after the initialized owner changes', () => {
  const mini = path.join(__dirname, '..', 'miniprogram');
  const loadPage = (relative, modules) => {
    let definition;
    vm.runInNewContext(fs.readFileSync(path.join(mini, relative), 'utf8'), {
      Page: value => { definition = value; },
      require: request => {
        if (Object.prototype.hasOwnProperty.call(modules, request)) return modules[request];
        throw new Error(`Unexpected mini program require: ${request}`);
      },
      wx: {}, console, Date, Number, String, Object, Array, Promise, Math, JSON,
      setTimeout, clearTimeout, encodeURIComponent, decodeURIComponent
    }, { filename:relative });
    return definition;
  };
  const writes = [];
  const staleOwnerStorage = {
    capture: () => 'owner-a',
    isCurrent: () => false,
    set: (...args) => writes.push(args),
    get: (_prefix, _suffix, fallback) => fallback
  };
  const interviewSpace = loadPage('package-ai/pages/interview-space/interview-space.js', {
    '../../../utils/api-v4.js': {},
    '../../../utils/owner-storage.js': staleOwnerStorage
  });
  const cachedId = interviewSpace.cacheReport.call({
    _ownerScope:'owner-a', _unloaded:false,
    data:{ report:{ id:11, dimensions:{}, questionFeedback:[] }, current:null, applicationId:'' }
  });
  assert.equal(cachedId, null);

  let setDataCalls = 0;
  const interviewDialog = loadPage('package-ai/pages/interview-dialog/interview-dialog.js', {
    '../../../utils/api.js': { sendChatToDeepSeek: () => {} },
    '../../behaviors/safe-page': {},
    '../../../utils/app-config.js': { API_BASE_URL:'' },
    '../../../utils/analytics.js': { track:() => {} },
    '../../../behaviors/login-gate.js': {},
    '../../../utils/owner-storage.js': staleOwnerStorage
  });
  interviewDialog.handleSummary.call({
    _ownerScope:'owner-a', _unmounted:false, data:{},
    setData:() => { setDataCalls += 1; }
  }, '{"totalScore":90}');
  assert.equal(setDataCalls, 0);
  assert.deepEqual(writes, []);
});
