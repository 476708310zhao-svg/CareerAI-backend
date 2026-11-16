'use strict';

const isolatedRuntime = require('./helpers/isolatedTestRuntime.cjs');
isolatedRuntime.install();
isolatedRuntime.prepare();
isolatedRuntime.registerCleanup(require('node:test'));

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const router = require('../routes/v4/resumes');
const resumeCenter = require('../services/v4ResumeCenter');
const aiRuntime = require('../services/v4AiRuntime');
const { syncResumeProfile } = require('../services/resumeProfileSync');
const uploadRouter = require('../routes/upload');
const { UPLOAD_DIR } = require('../utils/paths');
const { defaultSuggestions, validateSuggestions } = resumeCenter;

test('PDF-backed resume is owner-scoped, linked, and idempotent', async () => {
  const owner = db.prepare('INSERT INTO users (openid) VALUES (?)').run('attachment-owner').lastInsertRowid;
  const other = db.prepare('INSERT INTO users (openid) VALUES (?)').run('attachment-other').lastInsertRowid;
  const attachmentId = db.prepare('INSERT INTO resume_pdfs (user_id, filename, original_name, file_url, file_size) VALUES (?, ?, ?, ?, ?)')
    .run(owner, 'stored.pdf', '我的原始简历.pdf', '/uploads/resumes/stored.pdf', 1024).lastInsertRowid;
  const app = express();
  app.use(express.json());
  app.use('/api/v4/resumes', router);
  const server = isolatedRuntime.trackServer(app.listen(0, '127.0.0.1'));
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/v4/resumes`;
  const payload = { name: '我的简历', resumeType: 'general', content: {
    summary: '真实项目经历及可验证的结果', sourceAttachment: { id: attachmentId, filename: '伪造名称.pdf' }
  } };
  const send = userId => fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jwt.sign({ userId, openid: String(userId) }, process.env.JWT_SECRET) },
    body: JSON.stringify(payload)
  });
  const foreign = await send(other);
  assert.equal(foreign.status, 404);
  const first = await send(owner);
  assert.equal(first.status, 201);
  const created = (await first.json()).data;
  assert.deepEqual(created.sourceAttachment, { id: Number(attachmentId), filename: '我的原始简历.pdf' });
  const repeated = await send(owner);
  assert.equal(repeated.status, 200);
  assert.equal((await repeated.json()).data.id, created.id);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM resumes WHERE user_id=?').get(owner).count, 1);
  const syncUrl = `${url}/${created.id}/sync-profile`;
  const syncHeaders = userId => ({ Authorization: 'Bearer ' + jwt.sign({ userId, openid: String(userId) }, process.env.JWT_SECRET) });
  assert.equal((await fetch(syncUrl, { method: 'POST' })).status, 401);
  assert.equal((await fetch(syncUrl, { method: 'POST', headers: syncHeaders(other) })).status, 404);
  assert.equal((await fetch(syncUrl, { method: 'POST', headers: syncHeaders(owner) })).status, 200);
  await new Promise(resolve => server.close(resolve));
});

test('PDF resume fills empty profile fields once and preserves existing choices', () => {
  const owner = db.prepare('INSERT INTO users (openid, education, job_preference) VALUES (?, ?, ?)')
    .run('resume-profile-owner', JSON.stringify({ school: '已有学校' }), JSON.stringify({ targetRoles: ['已有目标岗位'] })).lastInsertRowid;
  const other = db.prepare('INSERT INTO users (openid) VALUES (?)').run('resume-profile-other').lastInsertRowid;
  const attachmentId = db.prepare('INSERT INTO resume_pdfs (user_id, filename, original_name, file_url, file_size) VALUES (?, ?, ?, ?, ?)')
    .run(owner, 'profile.pdf', '简历.pdf', '/uploads/resumes/profile.pdf', 1024).lastInsertRowid;
  const content = { education: [{ school: '简历学校', major: '计算机科学', degree: '硕士', time: '2024-2026' }],
    skills: ['Python', 'SQL'], projects: [{ name: '数据分析项目', desc: '构建报表' }],
    jobPreference: { targetRoles: ['数据分析师'], targetCities: ['上海'] },
    sourceAttachment: { id: attachmentId, filename: '简历.pdf' } };
  const resumeId = db.prepare("INSERT INTO resumes (user_id,name,data,is_default,resume_type,archived_at,updated_at) VALUES (?,?,?,1,'general','',datetime('now'))")
    .run(owner, '简历', JSON.stringify(content)).lastInsertRowid;
  resumeCenter.ensureCurrentVersion(owner, resumeId);
  assert.throws(() => syncResumeProfile(other, resumeId), error => error.status === 404);
  const first = syncResumeProfile(owner, resumeId);
  assert.equal(first.profile.school, '已有学校');
  assert.equal(first.profile.degree, 'master');
  assert.equal(first.profile.graduationYear, '2026');
  assert.deepEqual(first.profile.skills, ['Python', 'SQL']);
  assert.deepEqual(first.profile.targetRoles, ['已有目标岗位']);
  assert.deepEqual(first.profile.targetCities, ['上海']);
  assert.equal(first.profile.fieldSources.degree, `resume_pdf:${attachmentId}`);
  assert.ok(!first.importedFields.includes('school'));
  assert.ok(!first.importedFields.includes('targetRoles'));
  assert.deepEqual(syncResumeProfile(owner, resumeId).importedFields, []);
  const user = db.prepare('SELECT education, job_preference FROM users WHERE id=?').get(owner);
  assert.equal(JSON.parse(user.education).school, '已有学校');
  assert.equal(JSON.parse(user.job_preference).targetLocation[0], '上海');
});

test('PDF extraction keeps explicit job intent and education for profile sync', () => {
  const draft = uploadRouter.buildResumeDraftFromText([
    '张三', '教育背景', '清华大学', '计算机科学', '硕士 2024-2026',
    '技能', 'Python SQL', '求职意向：数据分析师', '期望地点：上海'
  ].join('\n'), '简历.pdf');
  assert.equal(draft.education[0].school, '清华大学');
  assert.equal(draft.education[0].major, '计算机科学');
  assert.deepEqual(draft.jobPreference.targetRoles, ['数据分析师']);
  assert.deepEqual(draft.jobPreference.targetCities, ['上海']);
  assert.deepEqual(draft.skills, ['Python', 'SQL']);
});

test('resume center presents upload before AI and blocks empty extraction', () => {
  const root = path.join(__dirname, '..', 'miniprogram');
  const view = fs.readFileSync(path.join(root, 'package-career/pages/resume-center/resume-center.wxml'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'package-career/pages/resume-center/resume-center.js'), 'utf8');
  const style = fs.readFileSync(path.join(root, 'package-career/pages/resume-center/resume-center.wxss'), 'utf8');
  assert.ok(view.indexOf('bindtap="chooseResumePdf"') < view.indexOf('bindtap="optimizeAttachment"'));
  assert.match(view, /简历评分与修改建议/);
  assert.doesNotMatch(view, /bindtap="scoreAttachment"|bindtap="scoreSelectedResume"/);
  assert.match(page, /data\.extraction\.status !== 'ok'/);
  assert.match(page, /uploadResumePdf\(file\.path, file\.name\)/);
  assert.match(page, /sourceAttachment: \{ id, filename \}/);
  assert.match(view, /原简历与附件不会被覆盖/);
  assert.doesNotMatch(view, /SPRINT 3|RESUME CENTER/);
  assert.doesNotMatch(style, /linear-gradient|#101828/);
});

test('resume review score describes content completeness without using the old PDF placeholder score', () => {
  const { scoreResumeContent } = require('../miniprogram/package-career/utils/resume-review-score.js');
  assert.equal(scoreResumeContent({ score: 65 }).score, 0);
  const complete = scoreResumeContent({ basicInfo: { name: '测试用户', email: 'test@example.com' },
    summary: '负责产品运营与数据分析，协调多团队交付，并根据真实反馈持续改进产品体验，定期梳理需求和复盘执行过程，保持跨部门沟通。',
    workExp: [{ company: '示例企业', desc: '负责梳理客户反馈和业务流程，编写分析报告，并推动团队依据反馈完成改进；定期汇总问题、跟进处理进展并记录实际结果。' }],
    education: [{ school: '示例大学', degree: '本科' }], skills: ['分析', '沟通', '协作'],
    jobPreference: { targetRoles: ['产品运营'] } });
  assert.equal(complete.score, 100);
  assert.equal(complete.checks.reduce((sum, item) => sum + item.max, 0), 100);
});

test('one resume review action keeps the score visible when AI advice is unavailable', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/package-career/pages/resume-center/resume-center.js'), 'utf8');
  const { scoreResumeContent } = require('../miniprogram/package-career/utils/resume-review-score.js');
  let page;
  const dialogs = [];
  vm.runInNewContext(source, {
    Page: config => { page = config; },
    require: id => id.includes('api-v4') ? {
      getCurrentResumeVersion: async () => ({ data: [{ id: 28, content: { summary: '负责真实项目研究和团队协作，整理客户反馈并推动产品改进。' } }] }),
      createResumeChangeSet: async () => { throw new Error('AI 模型暂时未能生成可靠建议'); }
    } : id.includes('resume-review-score') ? { scoreResumeContent }
      : id.includes('app-config') ? { MINI_PROGRAM_ENV_VERSION: 'develop' }
        : { capture: () => 'owner', isCurrent: () => true },
    wx: { showModal: options => dialogs.push(options), showToast() {} }
  });
  page.data.currentResume = { id: 19, currentVersionId: 28 };
  page.setData = function (changes) { Object.assign(this.data, changes); };
  await page.openResumeReview(page.data.currentResume);
  assert.equal(page.data.showReview, true);
  assert.ok(page.data.reviewScore.score > 0);
  assert.match(page.data.optimizationError, /AI 模型暂时/);
  assert.equal(page.data.proposal, null);
  assert.equal(page.data.optimizing, false);
  assert.equal(dialogs.length, 0);
});

test('a score read from the previous account cannot reopen the report', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/package-career/pages/resume-center/resume-center.js'), 'utf8');
  let page;
  let finishRead;
  let account = 'A';
  vm.runInNewContext(source, {
    Page: config => { page = config; },
    require: id => id.includes('api-v4') ? { getCurrentResumeVersion: () => new Promise(resolve => { finishRead = resolve; }) }
      : id.includes('resume-review-score') ? { scoreResumeContent: () => ({ score: 80, checks: [] }) }
        : { capture: () => account, isCurrent: scope => scope === account },
    wx: { showToast() {} }
  });
  page._ownerScope = account;
  page.data.currentResume = { id: 19, currentVersionId: 28 };
  page.setData = function (changes) { Object.assign(this.data, changes); };
  page.refresh = async () => {};
  const pending = page.openResumeReview(page.data.currentResume);
  account = 'B';
  page.onShow();
  finishRead({ data: [{ id: 28, content: { summary: '前一个账号的简历' } }] });
  await pending;
  assert.equal(page.data.showReview, false);
  assert.equal(page.data.reviewScore, null);
  assert.equal(page.data.currentResume, null);
});

test('AI suggestions never rewrite attachment provenance', () => {
  const content = { summary: '本人负责用户增长项目，并且完成数据分析', sourceAttachment: { filename: '本人负责简历内容，并且需要保留.pdf' } };
  const suggestions = defaultSuggestions(content);
  assert.ok(suggestions.length > 0);
  assert.ok(suggestions.every(item => !item.path.startsWith('sourceAttachment')));
  assert.throws(() => validateSuggestions(1, content, [{
    id: 'attachment', path: 'sourceAttachment.filename', before: content.sourceAttachment.filename,
    after: '改写后的文件名.pdf', reason: '测试'
  }]), error => error && error.code === 'AI_SUGGESTION_INVALID_FIELD');
  assert.throws(() => validateSuggestions(1, content, [{
    id: 'disguised', path: 'summary', before: content.sourceAttachment.filename,
    after: '改写后的文件名.pdf', reason: '测试'
  }]), error => error && error.code === 'UNVERIFIED_FACT');
});

test('AI suggestion must quote one complete resume field and fallback excludes private contact details', () => {
  const content = {
    summary: '本人负责用户增长项目，并且完成数据分析',
    contact: '电话：13800138000；负责真实项目'
  };
  assert.ok(defaultSuggestions(content).every(item => !/13800138000/.test(item.after)));
  assert.throws(() => validateSuggestions(1, content, [{
    path: 'summary', before: '负责用户增长项目', after: '负责用户增长', reason: '测试'
  }]), error => error && error.code === 'UNVERIFIED_FACT');
  const checked = validateSuggestions(1, content, [{
    path: 'summary', before: content.summary, after: '负责用户增长项目，完成数据分析', reason: '测试'
  }]);
  assert.equal(checked[0].before, content.summary);
});

test('attachment center exposes authenticated PDF preview and management', () => {
  const root = path.join(__dirname, '..');
  const view = fs.readFileSync(path.join(root, 'miniprogram/package-career/pages/resume-center/resume-center.wxml'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'miniprogram/package-career/pages/resume-center/resume-center.js'), 'utf8');
  const upload = fs.readFileSync(path.join(root, 'routes/upload.js'), 'utf8');
  assert.match(view, /bindtap="manageAttachment"/);
  assert.match(page, /api\.downloadResumePdf\(id\)/);
  assert.match(page, /wx\.openDocument/);
  assert.match(upload, /router\.get\('\/resume-pdf\/:id\/file', authMiddleware/);
});

test('online resume menu confirms removal and keeps version controls out of the page', async () => {
  const root = path.join(__dirname, '..', 'miniprogram/package-career/pages/resume-center');
  const source = fs.readFileSync(path.join(root, 'resume-center.js'), 'utf8');
  const view = fs.readFileSync(path.join(root, 'resume-center.wxml'), 'utf8');
  let page;
  let sheet;
  let modal;
  let refreshes = 0;
  const removed = [];
  vm.runInNewContext(source, {
    Page: config => { page = config; },
    require: id => id.includes('api-v4') ? {
      archiveV4Resume: async id => { removed.push(id); }
    } : { isCurrent: () => true },
    wx: {
      showActionSheet: options => { sheet = options; },
      showModal: options => { modal = options; },
      showToast() {}
    }
  });
  page._ownerScope = 'owner';
  page.data.resumes = [{ id: 7, name: '我的简历' }];
  page.data.currentResume = page.data.resumes[0];
  page.data.proposal = { id: 1 };
  page.setData = function (changes) { Object.assign(this.data, changes); };
  page.refresh = async () => { refreshes += 1; };
  page.resumeActions({ currentTarget: { dataset: { id: 7 } } });
  assert.deepEqual(Array.from(sheet.itemList), ['重命名', '设为默认', '删除简历']);
  sheet.success({ tapIndex: 2 });
  assert.match(modal.content, /原 PDF.*投递记录.*保留/);
  modal.success({ confirm: false });
  assert.deepEqual(removed, []);
  modal.success({ confirm: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(removed, [7]);
  assert.equal(refreshes, 1);
  assert.equal(page.data.currentResume, null);
  assert.equal(page.data.proposal, null);
  assert.doesNotMatch(view, /data-tab="versions"|bindtap="restoreVersion"/);
});

test('ATS scoring loads the current V4 resume version and reports read failures', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/package-career/pages/ats-optimize/ats-optimize.js'), 'utf8');
  let page;
  let requestedVersionId;
  let listFails = false;
  let scorePayload;
  const api = {
    getV4Resumes: async () => listFails ? { data: [], _source: 'networkError' } : { code: 0, data: [
      { id: 1, name: '已移除', archived: true, currentVersionId: 11 },
      { id: 2, name: '当前简历', archived: false, currentVersionId: 22 }
    ] },
    getCurrentResumeVersion: async id => {
      requestedVersionId = id;
      return { code: 0, data: [
        { id: 21, content: { summary: '旧版内容' } },
        { id: 22, content: { summary: '当前版本的真实经历内容' } }
      ] };
    }
  };
  vm.runInNewContext(source, {
    Page: config => { page = config; },
    require: id => id.includes('api-v4') ? api : id.includes('owner-storage')
      ? { capture: () => 'owner', isCurrent: () => true } : { analyzeAts: async payload => {
        scorePayload = payload;
        return { code: 0, data: { ats_score: 80, jd_match: 65 } };
      } },
    wx: { getStorageSync: () => null }
  });
  page.setData = function (changes) { Object.assign(this.data, changes); };
  page.onLoad({ resumeId: '2' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requestedVersionId, 2);
  assert.deepEqual(Array.from(page.data.serverResumes, item => item.id), [2]);
  assert.equal(page.data.resumeData.summary, '当前版本的真实经历内容');
  assert.equal(page.data.resumesLoading, false);
  page.setData({ jobDescription: '岗位需要真实工作经历、项目能力和清晰的技能说明。' });
  await page.startAnalyze();
  assert.equal(page.data.result.atsScore, 80);
  assert.equal(scorePayload.resumeData.summary, '当前版本的真实经历内容');
  assert.deepEqual(Object.keys(scorePayload.resumeData.basicInfo), []);
  listFails = true;
  await page.retryLoadResumes();
  assert.match(page.data.resumeLoadError, /读取失败/);
  assert.equal(page.data.resumeData, null);
});

test('ATS scoring discards a resume version returned after the account changes', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/package-career/pages/ats-optimize/ats-optimize.js'), 'utf8');
  let page;
  let finishRead;
  let currentOwner = true;
  vm.runInNewContext(source, {
    Page: config => { page = config; },
    require: id => id.includes('api-v4') ? {
      getV4Resumes: async () => ({ code: 0, data: [{ id: 8, name: '私人简历', currentVersionId: 9 }] }),
      getCurrentResumeVersion: () => new Promise(resolve => { finishRead = resolve; })
    } : id.includes('owner-storage') ? { capture: () => 'owner-a', isCurrent: () => currentOwner } : {},
    wx: { getStorageSync: () => null }
  });
  page.setData = function (changes) { Object.assign(this.data, changes); };
  page.onLoad({});
  await new Promise(resolve => setImmediate(resolve));
  currentOwner = false;
  finishRead({ code: 0, data: [{ id: 9, content: { summary: '账号 A 的私人内容' } }] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.data.resumeData, null);
  assert.equal(page.data.serverResumes.length, 0);
});

test('PDF preview closes loading exactly once before showing a route error', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/package-career/pages/resume-center/resume-center.js'), 'utf8');
  const events = [];
  let page;
  let textReads = 0;
  let failTextRead = false;
  const error = new Error('当前接口还不能预览附件');
  let failDownload = true;
  vm.runInNewContext(source, {
    Page: config => { page = config; },
    require: id => id.includes('api-v4') ? { extractResumePdf: async () => {
      textReads += 1;
      if (failTextRead) throw new Error('文字读取失败');
      return { data: { text: '可核对的简历文字' } };
    }, downloadResumePdf: async () => {
      if (failDownload) throw error;
      return 'resume.pdf';
    } } : {},
    wx: {
      showLoading: () => events.push('show'), hideLoading: () => events.push('hide'),
      showModal: value => events.push(value.content), showToast: () => events.push('toast'),
      openDocument: options => { events.push('open'); options.success(); }
    }
  });
  page.data.attachments = [{ id: 7 }];
  page.setData = function (changes) { Object.assign(this.data, changes); };
  await page.previewAttachment({ currentTarget: { dataset: { id: 7 } } });
  assert.deepEqual(events, ['show', 'hide', error.message]);
  error.statusCode = 404;
  events.length = 0;
  await page.previewAttachment({ currentTarget: { dataset: { id: 7 } } });
  assert.equal(events[0], 'show');
  assert.equal(events[1], 'hide');
  assert.match(events[2], /原 PDF 下载/);
  assert.equal(textReads, 0);
  events.length = 0;
  await page.openExtractedText(7);
  assert.deepEqual(events, ['show', 'hide']);
  assert.equal(textReads, 1);
  assert.equal(page.data.previewText, '可核对的简历文字');
  assert.equal(page.data.showTextPreview, true);
  page.closeTextPreview();
  failTextRead = true;
  events.length = 0;
  await page.openExtractedText(7);
  assert.deepEqual(events, ['show', 'hide', '文字读取失败']);
  failDownload = false;
  events.length = 0;
  await page.previewAttachment({ currentTarget: { dataset: { id: 7 } } });
  assert.deepEqual(events, ['show', 'hide', 'open']);
});

test('PDF preview allows only its owner and serves the original bytes', async t => {
  const owner = db.prepare('INSERT INTO users (openid) VALUES (?)').run('pdf-preview-owner').lastInsertRowid;
  const other = db.prepare('INSERT INTO users (openid) VALUES (?)').run('pdf-preview-other').lastInsertRowid;
  const filename = `preview-${Date.now()}.pdf`;
  const pdfPath = path.join(UPLOAD_DIR, 'resumes', filename);
  fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
  const bytes = Buffer.from('%PDF-1.4\npreview');
  fs.writeFileSync(pdfPath, bytes);
  t.after(() => fs.rmSync(pdfPath, { force: true }));
  const id = db.prepare('INSERT INTO resume_pdfs (user_id, filename, original_name, file_url, file_size) VALUES (?, ?, ?, ?, ?)')
    .run(owner, filename, '原始.pdf', `/uploads/resumes/${filename}`, bytes.length).lastInsertRowid;
  const app = express();
  app.use('/api/upload', uploadRouter);
  const server = isolatedRuntime.trackServer(app.listen(0, '127.0.0.1'));
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/upload/resume-pdf/${id}/file`;
  const auth = userId => ({ Authorization: 'Bearer ' + jwt.sign({ userId, openid: String(userId) }, process.env.JWT_SECRET) });
  assert.equal((await fetch(url)).status, 401);
  assert.equal((await fetch(url, { headers: auth(other) })).status, 404);
  const response = await fetch(url, { headers: auth(owner) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/pdf');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  await new Promise(resolve => server.close(resolve));
});

test('scanned PDF stays as an attachment and never creates an empty AI resume', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/package-career/pages/resume-center/resume-center.js'), 'utf8');
  let page;
  let created = 0;
  const api = {
    getV4Resumes: async () => ({ data: [] }),
    extractResumePdf: async () => ({ data: { text: '', resume: { summary: '' }, extraction: { status: 'empty' } } }),
    createV4Resume: async () => { created += 1; }
  };
  vm.runInNewContext(source, {
    Page: config => { page = config; },
    require: id => id.includes('api-v4') ? api : { isCurrent: () => true },
    wx: { showToast() {} }
  });
  page._ownerScope = 'owner';
  page.data.attachments = [{ id: 7, filename: '扫描简历.pdf' }];
  page.setData = function (changes) { Object.assign(this.data, changes); };
  await assert.rejects(page.importResumePdf(7, true), /无法提取文字/);
  assert.equal(created, 0);
});

test('readable PDF imports once without automatically requesting AI suggestions', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/package-career/pages/resume-center/resume-center.js'), 'utf8');
  let page;
  let payload;
  let optimized = 0;
  let synced = 0;
  const api = {
    getV4Resumes: async () => ({ data: [] }),
    extractResumePdf: async () => ({ data: {
      text: '真实项目经历及可验证的结果',
      resume: { summary: '真实项目经历及可验证的结果' },
      extraction: { status: 'ok' }
    } }),
    createV4Resume: async value => { payload = value; return { data: { id: 19, currentVersionId: 28 } }; },
    syncResumeProfile: async id => { synced = id; return { data: { importedFields: ['school', 'skills'] } }; }
  };
  vm.runInNewContext(source, {
    Page: config => { page = config; },
    require: id => id.includes('api-v4') ? api : { isCurrent: () => true },
    wx: { showToast() {} }
  });
  page._ownerScope = 'owner';
  page.data.attachments = [{ id: 7, filename: '原始简历.pdf' }];
  page.setData = function (changes) { Object.assign(this.data, changes); };
  page.optimizeResume = () => { optimized += 1; };
  await page.importResumePdf(7);
  assert.equal(payload.content.sourceAttachment.id, 7);
  assert.equal(payload.content.sourceAttachment.filename, '原始简历.pdf');
  assert.equal(page.data.currentResume.id, 19);
  assert.equal(optimized, 0);
  assert.equal(synced, 19);
});

test('old backend version content restores the attachment link and prevents a duplicate import', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/package-career/pages/resume-center/resume-center.js'), 'utf8');
  let page;
  let extracted = 0;
  let created = 0;
  const api = {
    getV4Resumes: async () => ({ data: [{ id: 19, name: '赵鑫简历', currentVersionId: 29 }] }),
    getCompleteResumeVersions: async () => ({ data: [{ id: 29 }] }),
    getResumeVersion: async () => ({ data: { id: 29, content: { sourceAttachment: { id: 7, filename: '赵鑫简历.pdf' } } } }),
    getCurrentResumeVersion: async () => ({ data: [{ id: 29, content: { sourceAttachment: { id: 7, filename: '赵鑫简历.pdf' } } }] }),
    extractResumePdf: async () => { extracted += 1; },
    createV4Resume: async () => { created += 1; }
  };
  vm.runInNewContext(source, {
    Page: config => { page = config; },
    require: id => id.includes('api-v4') ? api : { isCurrent: () => true },
    wx: { showToast() {} }
  });
  page._ownerScope = 'owner';
  page.data.attachments = [{ id: 7, filename: '赵鑫简历.pdf' }];
  page.setData = function (changes) { Object.assign(this.data, changes); };
  await page.importResumePdf(7);
  assert.equal(page.data.currentResume.id, 19);
  assert.equal(extracted, 0);
  assert.equal(created, 0);
});

test('old backend list labels existing imports and AI action does not create another resume', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/package-career/pages/resume-center/resume-center.js'), 'utf8');
  let page;
  let optimized = 0;
  let created = 0;
  const api = {
    getResumeTemplates: async () => ({ data: [] }),
    getV4Resumes: async () => ({ data: [{ id: 19, name: '赵鑫简历', currentVersionId: 28 }, { id: 20, name: '赵鑫简历', currentVersionId: 29 }] }),
    getCareerExperiences: async () => ({ data: [] }),
    getResumePdfs: async () => ({ data: [{ id: 7, original_name: '赵鑫简历.pdf', file_size: 1024 }] }),
    getCompleteResumeVersions: async () => ({ data: [{ id: 28 }] }),
    getResumeVersion: async () => ({ data: { id: 28, content: { sourceAttachment: { id: 7 }, summary: '真实经历概述内容，可用于形成简历报告' } } }),
    getCurrentResumeVersion: async () => ({ data: [{ id: 28, content: { sourceAttachment: { id: 7 }, summary: '真实经历概述内容，可用于形成简历报告' } }] }),
    createV4Resume: async () => { created += 1; }
  };
  vm.runInNewContext(source, {
    Page: config => { page = config; },
    require: id => id.includes('api-v4') ? api
      : id.includes('resume-review-score') ? { scoreResumeContent: () => ({ score: 42, checks: [] }) }
        : { capture: () => 'owner', isCurrent: () => true },
    wx: { showToast() {} }
  });
  page._ownerScope = 'owner';
  page.setData = function (changes, callback) { Object.assign(this.data, changes); if (callback) callback(); };
  page.optimizeResume = () => { optimized += 1; };
  await page.refresh();
  assert.equal(page.data.attachments[0].linkedResumeId, 19);
  assert.equal(page.data.resumes[0].duplicateSource, false);
  assert.equal(page.data.resumes[1].duplicateSource, true);
  await page.optimizeAttachment({ currentTarget: { dataset: { id: 7 } } });
  assert.equal(optimized, 1);
  assert.equal(page.data.reviewScore.score, 42);
  assert.equal(created, 0);
});

test('unlinked PDF review imports once and then opens the combined report', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/package-career/pages/resume-center/resume-center.js'), 'utf8');
  let page;
  let imported = 0;
  let reviewed = 0;
  vm.runInNewContext(source, {
    Page: config => { page = config; },
    require: id => id.includes('api-v4') ? {} : { capture: () => 'owner', isCurrent: () => true },
    wx: { showToast() {} }
  });
  page._ownerScope = 'owner';
  page.data.attachments = [{ id: 7, filename: '原简历.pdf', linkedResumeId: null }];
  page.setData = function (changes) { Object.assign(this.data, changes); };
  page.importResumePdf = async () => { imported += 1; };
  page.refresh = async function () {
    const resume = { id: 19, currentVersionId: 28 };
    this.data.resumes = [resume];
    this.data.attachments = [{ id: 7, linkedResumeId: 19 }];
  };
  page.openResumeReview = () => { reviewed += 1; };
  await page.optimizeAttachment({ currentTarget: { dataset: { id: 7 } } });
  assert.equal(imported, 1);
  assert.equal(reviewed, 1);
  assert.equal(page.data.currentResume.id, 19);
  assert.equal(page.data.attachmentBusy, false);
});

test('resume optimization displays a successful suggestion response and clears its busy state', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/package-career/pages/resume-center/resume-center.js'), 'utf8');
  let page;
  const dialogs = [];
  const proposal = { id: 41, sourceContent: { summary: '原文' },
    suggestions: [{ id: 'suggestion_1', before: '原文', after: '改写' }],
    generation: { degraded: false }, aiModel: 'test-model' };
  vm.runInNewContext(source, {
    Page: config => { page = config; },
    require: id => id.includes('api-v4') ? { createResumeChangeSet: async () => ({ data: proposal }) }
      : id.includes('app-config') ? { MINI_PROGRAM_ENV_VERSION: 'develop' }
        : { capture: () => 'owner', isCurrent: () => true },
    wx: { showModal: options => dialogs.push(options), showToast() {} }
  });
  page.data.currentResume = { id: 19, currentVersionId: 28 };
  page.setData = function (changes) { Object.assign(this.data, changes); };
  await page.optimizeResume();
  assert.equal(page.data.proposal.id, 41);
  assert.equal(page.data.proposal.suggestions.length, 1);
  assert.equal(page.data.optimizing, false);
  assert.equal(page.data.loading, false);
  assert.equal(page._optimizingResume, false);
  assert.equal(dialogs.length, 0);
});

test('degraded rules do not appear as AI resume advice', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/package-career/pages/resume-center/resume-center.js'), 'utf8');
  let page;
  const dialogs = [];
  vm.runInNewContext(source, {
    Page: config => { page = config; },
    require: id => id.includes('api-v4') ? { createResumeChangeSet: async () => ({ data: {
      id: 41, suggestions: [{ id: 'rule_1', before: '旧', after: '新' }],
      generation: { degraded: true, fallbackReason: 'feature_disabled', attempts: 0 }
    } }) } : id.includes('app-config') ? { MINI_PROGRAM_ENV_VERSION: 'develop' }
      : { capture: () => 'owner', isCurrent: () => true },
    wx: { showModal: options => dialogs.push(options), showToast() {} }
  });
  page.data.currentResume = { id: 19, currentVersionId: 28 };
  page.setData = function (changes) { Object.assign(this.data, changes); };
  await page.optimizeResume();
  assert.equal(page.data.proposal, null);
  assert.equal(page.data.optimizing, false);
  assert.match(page.data.optimizationError, /模型尚未启用/);
  assert.match(dialogs[0].content, /feature_disabled/);
});

test('online resume editor saves readable fields as a new version and keeps PDF provenance', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/package-career/pages/resume-center/resume-center.js'), 'utf8');
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/package-career/pages/resume-center/resume-center.wxml'), 'utf8');
  let page;
  let saved;
  const content = { summary: '原概述', workExp: [], education: [], projects: [], skills: [],
    sourceAttachment: { id: 7, filename: '原简历.pdf' }, customField: '保留' };
  vm.runInNewContext(source, {
    Page: config => { page = config; },
    require: id => id.includes('api-v4') ? {
      getCurrentResumeVersion: async () => ({ data: [{ id: 28, content }] }),
      createResumeVersion: async (id, payload) => { saved = { id, payload }; return { code: 0 }; }
    } : { capture: () => 'owner', isCurrent: () => true },
    wx: { showToast() {} }
  });
  page.data.currentResume = { id: 19, currentVersionId: 28 };
  page.setData = function (changes) { Object.assign(this.data, changes); };
  page.refresh = async () => {};
  await page.openResumeEditor();
  page.data.resumeEditor.summary = '真实工作经历';
  page.data.resumeEditor.skillsText = '数据分析、项目管理';
  page.data.resumeEditor.workExp = [{ company: '测试公司', role: '分析师', desc: '负责真实项目' }];
  await page.saveResumeEditor();
  assert.equal(saved.id, 19);
  assert.equal(saved.payload.expectedVersionId, 28);
  assert.equal(saved.payload.content.summary, '真实工作经历');
  assert.equal(saved.payload.content.workExp[0].desc, '负责真实项目');
  assert.equal(saved.payload.content.sourceAttachment.id, 7);
  assert.equal(saved.payload.content.customField, '保留');
  assert.equal(page.data.showResumeEditor, false);
  assert.doesNotMatch(wxml, /manualJson|toggleManualMode|手动编辑完整简历/);
  assert.match(wxml, /编辑在线简历/);
});

test('reparsing an owned PDF fills only empty online resume sections and keeps the original', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/package-career/pages/resume-center/resume-center.js'), 'utf8');
  let page;
  let saved;
  const original = { summary: '用户已确认的概述', workExp: [],
    education: [{ school: '已有学校' }], projects: [], skills: [],
    sourceAttachment: { id: 7, filename: '原简历.pdf' } };
  const fresh = { workExp: [{ company: '新识别公司', role: '分析师', desc: '真实工作内容' }],
    education: [{ school: '不能覆盖的学校' }], projects: [], skills: ['SQL'] };
  vm.runInNewContext(source, {
    Page: config => { page = config; },
    require: id => id.includes('api-v4') ? {
      extractResumePdf: async () => ({ data: { extraction: { status: 'ok' }, resume: fresh } }),
      getCurrentResumeVersion: async () => ({ data: [{ id: 28, content: original }] }),
      createResumeVersion: async (id, payload) => { saved = { id, payload }; return { code: 0 }; }
    } : id.includes('owner-storage') ? { capture: () => 'owner', isCurrent: () => true, set() {} }
      : {},
    wx: { showToast() {} }
  });
  page.data.resumes = [{ id: 19, currentVersionId: 28 }];
  page.setData = function (changes) { Object.assign(this.data, changes); };
  page.syncImportedProfile = async () => {};
  page.refresh = async () => {};
  await page.reparseAttachment({ id: 7, linkedResumeId: 19 });
  assert.equal(saved.id, 19);
  assert.equal(saved.payload.expectedVersionId, 28);
  assert.equal(saved.payload.content.summary, original.summary);
  assert.equal(saved.payload.content.education[0].school, '已有学校');
  assert.equal(saved.payload.content.workExp[0].company, '新识别公司');
  assert.equal(saved.payload.content.sourceAttachment.id, 7);
  assert.equal(page.data.attachmentBusy, false);
  assert.match(source, /重新识别并补齐在线简历/);
});

test('resume optimization stops showing progress when the account changes before the response', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/package-career/pages/resume-center/resume-center.js'), 'utf8');
  let page;
  let finishRequest;
  let currentOwner = true;
  vm.runInNewContext(source, {
    Page: config => { page = config; },
    require: id => id.includes('api-v4') ? { createResumeChangeSet: () => new Promise(resolve => { finishRequest = resolve; }) }
      : id.includes('app-config') ? { MINI_PROGRAM_ENV_VERSION: 'develop' }
        : { capture: () => 'owner', isCurrent: () => currentOwner },
    wx: { showModal() {}, showToast() {} }
  });
  page.data.currentResume = { id: 19, currentVersionId: 28 };
  page.setData = function (changes) { Object.assign(this.data, changes); };
  const action = page.optimizeResume();
  await Promise.resolve();
  currentOwner = false;
  finishRequest({ data: { id: 41, suggestions: [] } });
  await action;
  assert.equal(page.data.proposal, null);
  assert.equal(page.data.optimizing, false);
  assert.equal(page.data.loading, false);
  assert.equal(page._optimizingResume, false);
});

test('resume optimization shows progress immediately and explains a timeout without changing the selected resume', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/package-career/pages/resume-center/resume-center.js'), 'utf8');
  let page;
  let rejectRequest;
  const dialogs = [];
  const api = {
    createResumeChangeSet: () => new Promise((resolve, reject) => { rejectRequest = reject; })
  };
  vm.runInNewContext(source, {
    Page: config => { page = config; },
    require: id => id.includes('api-v4') ? api
      : id.includes('app-config') ? { MINI_PROGRAM_ENV_VERSION: 'develop' }
        : { capture: () => 'owner', isCurrent: () => true },
    wx: { showModal: options => dialogs.push(options), showToast() {} }
  });
  page.data.currentResume = { id: 19, currentVersionId: 28 };
  page.data.resumes = [page.data.currentResume, { id: 20, currentVersionId: 29 }];
  page.setData = function (changes) { Object.assign(this.data, changes); };
  const action = page.optimizeResume();
  assert.equal(page.data.optimizing, true);
  assert.equal(page.data.optimizingResumeId, 19);
  assert.equal(page.data.loading, true);
  page.selectResume({ currentTarget: { dataset: { id: 20 } } });
  assert.equal(page.data.currentResume.id, 19);
  await Promise.resolve();
  rejectRequest(new Error('请求超时，请稍后重试'));
  await action;
  assert.equal(page.data.optimizing, false);
  assert.equal(page.data.loading, false);
  assert.match(page.data.optimizationError, /超时.*原简历没有被修改/);
  assert.equal(dialogs[0].title, '优化未完成');
  assert.equal(page.data.currentResume.id, 19);

  const retry = page.optimizeResume();
  await Promise.resolve();
  const networkError = new Error('网络连接失败，请检查网络后重试');
  networkError.code = 'NETWORK_ERROR';
  networkError.detail = 'request:fail connection reset';
  rejectRequest(networkError);
  await retry;
  assert.match(page.data.optimizationError, /连接中断/);
  assert.match(page.data.optimizationDiagnostic, /NETWORK_ERROR，\d+ 秒，request:fail connection reset/);
  assert.match(dialogs[1].content, /request:fail connection reset/);
});

test('resume page ends progress after its own deadline even if the API promise never settles', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/package-career/pages/resume-center/resume-center.js'), 'utf8');
  let page;
  let fireDeadline;
  let finishRequest;
  let cleared = 0;
  const dialogs = [];
  vm.runInNewContext(source, {
    Page: config => { page = config; },
    require: id => id.includes('api-v4') ? { createResumeChangeSet: () => new Promise(resolve => { finishRequest = resolve; }) }
      : id.includes('app-config') ? { MINI_PROGRAM_ENV_VERSION: 'develop' }
        : { capture: () => 'owner', isCurrent: () => true },
    setTimeout: (callback, ms) => { assert.equal(ms, 60000); fireDeadline = callback; return 1; },
    clearTimeout: () => { cleared += 1; },
    wx: { showModal: options => dialogs.push(options), showToast() {} }
  });
  page.data.currentResume = { id: 19, currentVersionId: 28 };
  page.setData = function (changes) { Object.assign(this.data, changes); };
  const action = page.optimizeResume();
  await Promise.resolve();
  assert.equal(page.data.optimizing, true);
  fireDeadline();
  await action;
  assert.equal(page.data.optimizing, false);
  assert.equal(page.data.loading, false);
  assert.equal(page._optimizingResume, false);
  assert.equal(cleared, 1);
  assert.match(dialogs[0].content, /超时/);
  finishRequest({ data: { id: 41, suggestions: [] } });
  await Promise.resolve();
  assert.equal(page.data.proposal, null);
});

test('resume optimization uses a dedicated request deadline and a bounded model attempt', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/utils/api-v4.js'), 'utf8');
  const writes = [];
  const sandbox = { module: { exports: {} }, require: id => id.includes('api-client')
    ? { _write: options => { writes.push(options); return Promise.resolve({ code: 0 }); } }
    : {} };
  vm.runInNewContext(source, sandbox);
  await sandbox.module.exports.createResumeChangeSet(19, { jdText: '真实目标岗位' });
  await sandbox.module.exports.createV4Resume({ name: '简历' });
  assert.equal(writes[0].timeout, 50000);
  assert.equal(writes[0].hardTimeoutMs, 55000);
  assert.equal(writes[1].timeout, 20000);

  const owner = db.prepare('INSERT INTO users (openid) VALUES (?)').run('resume-timeout-owner').lastInsertRowid;
  const resumeId = Number(db.prepare("INSERT INTO resumes (user_id,name,data,is_default,resume_type,archived_at,updated_at) VALUES (?,?,?,0,'general','',datetime('now'))")
    .run(owner, '超时测试简历', JSON.stringify({ summary: '本人负责用户增长项目，并且完成数据分析' })).lastInsertRowid);
  const beforeVersionId = resumeCenter.ensureCurrentVersion(owner, resumeId).version.id;
  const originalGenerate = aiRuntime.generate;
  let generationOptions;
  aiRuntime.generate = async options => {
    generationOptions = options;
    return { value: options.fallback(), model: 'fallback-rules', degraded: true, source: 'fallback' };
  };
  try {
    const proposal = await resumeCenter.createChangeSet({ userId: owner, resumeId });
    assert.equal(generationOptions.timeoutMs, 35000);
    assert.equal(generationOptions.retries, 0);
    assert.equal(proposal.sourceVersionId, beforeVersionId);
    assert.equal(resumeCenter.ensureCurrentVersion(owner, resumeId).version.id, beforeVersionId);
  } finally {
    aiRuntime.generate = originalGenerate;
  }
});

test('live resume advice retains the source quote validated before deep redaction', async () => {
  const owner = db.prepare('INSERT INTO users (openid) VALUES (?)').run('resume-live-quote-main').lastInsertRowid;
  const content = { summary: '本人负责用户增长项目，并且完成数据分析' };
  const resumeId = Number(db.prepare("INSERT INTO resumes (user_id,name,data,is_default,resume_type,archived_at,updated_at) VALUES (?,?,?,0,'general','',datetime('now'))")
    .run(owner, '正常 AI 引用简历', JSON.stringify(content)).lastInsertRowid);
  resumeCenter.ensureCurrentVersion(owner, resumeId);
  const originalGenerate = aiRuntime.generate;
  aiRuntime.generate = async options => {
    const suggestion = {
      id: 'live_1', path: 'summary', before: content.summary,
      after: '负责用户增长项目，完成数据分析', reason: '压缩冗余表达',
      sourceExperienceIds: [], addsFacts: false
    };
    assert.equal(options.validate([suggestion]), true);
    return { value: [{ ...suggestion, before: '[redacted]' }], model: 'test-model', degraded: false, source: 'live' };
  };
  try {
    const proposal = await resumeCenter.createChangeSet({ userId: owner, resumeId });
    assert.equal(proposal.suggestions[0].before, content.summary);
    assert.equal(proposal.suggestions[0].after, '负责用户增长项目，完成数据分析');
  } finally {
    aiRuntime.generate = originalGenerate;
  }
});
