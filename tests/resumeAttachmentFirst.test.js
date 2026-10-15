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
const { defaultSuggestions, validateSuggestions } = require('../services/v4ResumeCenter');

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
  await new Promise(resolve => server.close(resolve));
});

test('resume center presents upload before AI and blocks empty extraction', () => {
  const root = path.join(__dirname, '..', 'miniprogram');
  const view = fs.readFileSync(path.join(root, 'package-career/pages/resume-center/resume-center.wxml'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'package-career/pages/resume-center/resume-center.js'), 'utf8');
  const style = fs.readFileSync(path.join(root, 'package-career/pages/resume-center/resume-center.wxss'), 'utf8');
  assert.ok(view.indexOf('先上传附件简历') < view.indexOf('AI 优化'));
  assert.match(page, /data\.extraction\.status !== 'ok'/);
  assert.match(page, /uploadResumePdf\(file\.path, file\.name\)/);
  assert.match(page, /sourceAttachment: \{ id, filename \}/);
  assert.match(view, /原简历与附件不会被覆盖/);
  assert.doesNotMatch(view, /SPRINT 3|RESUME CENTER/);
  assert.doesNotMatch(style, /linear-gradient|#101828/);
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
  const api = {
    getV4Resumes: async () => ({ data: [] }),
    extractResumePdf: async () => ({ data: {
      text: '真实项目经历及可验证的结果',
      resume: { summary: '真实项目经历及可验证的结果' },
      extraction: { status: 'ok' }
    } }),
    createV4Resume: async value => { payload = value; return { data: { id: 19, currentVersionId: 28 } }; }
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
});

test('old backend version content restores the attachment link and prevents a duplicate import', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/package-career/pages/resume-center/resume-center.js'), 'utf8');
  let page;
  let extracted = 0;
  let created = 0;
  const api = {
    getV4Resumes: async () => ({ data: [{ id: 19, name: '赵鑫简历', currentVersionId: 29 }] }),
    getResumeVersions: async () => ({ data: [{ id: 29, content: { sourceAttachment: { id: 7, filename: '赵鑫简历.pdf' } } }] }),
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
    getV4Resumes: async () => ({ data: [{ id: 19, name: '赵鑫简历' }, { id: 20, name: '赵鑫简历' }] }),
    getCareerExperiences: async () => ({ data: [] }),
    getResumePdfs: async () => ({ data: [{ id: 7, original_name: '赵鑫简历.pdf', file_size: 1024 }] }),
    getResumeVersions: async () => ({ data: [{ content: { sourceAttachment: { id: 7 } } }] }),
    createV4Resume: async () => { created += 1; }
  };
  vm.runInNewContext(source, {
    Page: config => { page = config; },
    require: id => id.includes('api-v4') ? api : { isCurrent: () => true },
    wx: { showToast() {} }
  });
  page._ownerScope = 'owner';
  page.setData = function (changes, callback) { Object.assign(this.data, changes); if (callback) callback(); };
  page.optimizeResume = () => { optimized += 1; };
  await page.refresh();
  assert.equal(page.data.attachments[0].linkedResumeId, 19);
  assert.equal(page.data.resumes[0].duplicateSource, false);
  assert.equal(page.data.resumes[1].duplicateSource, true);
  page.optimizeAttachment({ currentTarget: { dataset: { id: 7 } } });
  assert.equal(optimized, 1);
  assert.equal(created, 0);
});
