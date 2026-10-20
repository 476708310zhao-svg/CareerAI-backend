const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const authSession = require('../miniprogram/utils/auth-session.js');

const root = path.join(__dirname, '..', 'miniprogram');
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function makeWx() {
  const storage = new Map([['token', 'token-A'], ['userProfile', { id: 'A' }]]);
  return {
    storage, requests: [], loginCallbacks: [],
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: key => storage.delete(key),
    request(options) { this.requests.push(options); return { abort() {} }; },
    login(options) { this.loginCallbacks.push(options); },
    nextTick() {},
    showToast() {}
  };
}
function evaluate(relative, wx, mocks, registration) {
  const filename = path.join(root, relative);
  const context = {
    module: { exports: {} }, wx, setTimeout, clearTimeout,
    console: { log() {}, warn() {}, error() {} },
    require: name => Object.prototype.hasOwnProperty.call(mocks, name) ? mocks[name] : {},
    Page: value => registration(value), App: value => registration(value),
    getApp: () => ({ globalData: { isLoggedIn: true }, refreshGlobalData() {} }),
    getCurrentPages: () => []
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  return context.module.exports;
}
function userApi(wx, post) {
  return evaluate('utils/api-user.js', wx, {
    './api-client.js': { post, request() {}, put() {} },
    './auth-session.js': authSession,
    './user-profile-schema.js': { normalizeProfileStorage: value => value }
  }, () => {});
}
function response(token, id) { return { code: 0, data: { token, user: { id, nickname: id } } }; }
function loginCode(wx, code) { wx.loginCallbacks.shift().success({ code }); }

test('later phone login wins an older WeChat response, including a late wx.login callback', async () => {
  const wx = makeWx();
  const requests = [];
  const api = userApi(wx, options => {
    const next = deferred();
    requests.push({ options, ...next });
    return next.promise;
  });
  const old = api.login();
  loginCode(wx, 'wechat-A');
  const current = api.phoneLogin('phone-code', 'phone-login-code');
  assert.deepEqual(Array.from(requests, item => item.options.path), ['/api/users/login', '/api/users/phone-login']);
  requests[1].resolve(response('token-B', 'B'));
  assert.equal((await current).token, 'token-B');
  requests[0].resolve(response('token-A', 'A'));
  await assert.rejects(old, error => error.code === 'LOGIN_SUPERSEDED');
  assert.equal(wx.storage.get('token'), 'token-B');
  assert.equal(wx.storage.get('userProfile').userId, 'B');
  assert.equal(wx.storage.get('userProfile').nickName, 'B');

  const lateWechat = api.login();
  const newerPhone = api.phoneLogin('new-phone', 'new-code');
  loginCode(wx, 'late-wechat-code');
  await assert.rejects(lateWechat, error => error.code === 'LOGIN_SUPERSEDED');
  assert.equal(requests.length, 3, 'superseded wx.login must not create a backend request');
  requests[2].resolve(response('token-C', 'C'));
  await newerPhone;
});

test('later WeChat login wins an older phone response and stale login failure', async () => {
  const wx = makeWx();
  const requests = [];
  const api = userApi(wx, options => {
    const next = deferred();
    requests.push(next);
    return next.promise;
  });
  const oldPhone = api.phoneLogin('phone', 'code');
  const currentWechat = api.login();
  loginCode(wx, 'wechat-new');
  requests[1].resolve(response('token-B', 'B'));
  await currentWechat;
  requests[0].resolve(response('token-A', 'A'));
  await assert.rejects(oldPhone, error => error.code === 'LOGIN_SUPERSEDED');
  assert.equal(wx.storage.get('token'), 'token-B');

  const old = api.login();
  loginCode(wx, 'wechat-old');
  const newer = api.phoneLogin('phone-new', 'code-new');
  requests[3].resolve(response('token-C', 'C'));
  await newer;
  requests[2].reject(new Error('old request failed'));
  await assert.rejects(old, error => error.code === 'LOGIN_SUPERSEDED');
  assert.equal(wx.storage.get('token'), 'token-C');
});

test('explicit logout invalidates an in-flight login even without a newer attempt', async () => {
  const wx = makeWx();
  const requests = [];
  const api = userApi(wx, () => {
    const next = deferred();
    requests.push(next);
    return next.promise;
  });
  const pendingPhone = api.phoneLogin('phone', 'code');
  authSession.clearToken(wx);
  requests[0].resolve(response('late-phone-token', 'late'));
  await assert.rejects(pendingPhone, error => error.code === 'LOGIN_SUPERSEDED');
  assert.equal(wx.storage.get('token'), undefined);

  const pendingWechat = api.login();
  authSession.clearToken(wx);
  loginCode(wx, 'late-wechat-code');
  await assert.rejects(pendingWechat, error => error.code === 'LOGIN_SUPERSEDED');
  assert.equal(requests.length, 1);
});

function loadApp(wx, getUserProfile) {
  let app;
  evaluate('app.js', wx, {
    './utils/api.js': { getUserProfile },
    './utils/auth-session.js': authSession,
    './utils/favorites.js': {}, './utils/vip.js': {},
    './utils/navigation.js': { installRouteGuard() {} },
    './utils/feature-flags.js': {},
    './utils/share.js': { installPageShare() {} },
    './utils/analytics.js': { installPageTracker() {} },
    './utils/unread-messages.js': {}
  }, value => { app = value; });
  app.globalData = { isLoggedIn: true };
  return app;
}
async function nextMicrotask() { await new Promise(resolve => setImmediate(resolve)); }

test('silent validation preserves a live session on network, timeout, 429 and 500', async () => {
  const wx = makeWx();
  let result;
  const app = loadApp(wx, () => Promise.resolve(result));
  for (const failure of ['networkError', 'timeout', 'rateLimit', 'error']) {
    result = { data: [], _source: failure, _status: failure === 'error' ? 500 : undefined };
    app._silentLogin();
    await nextMicrotask();
    assert.equal(wx.storage.get('token'), 'token-A', failure);
    assert.equal(app.globalData.isLoggedIn, true, failure);
  }
});

test('silent validation handles a real 401 whether the client already cleared the token or not', async () => {
  const wx = makeWx();
  let next = deferred();
  const app = loadApp(wx, () => next.promise);
  app._silentLogin();
  authSession.clearToken(wx); // api-client has already handled HTTP 401.
  next.resolve({ data: [], _source: 'unauthorized' });
  await nextMicrotask();
  assert.equal(app.globalData.isLoggedIn, false);
  assert.equal(wx.storage.get('token'), undefined);

  authSession.setToken('token-B', wx);
  app.globalData.isLoggedIn = true;
  next = deferred();
  app._silentLogin();
  next.resolve({ code: 401 });
  await nextMicrotask();
  assert.equal(app.globalData.isLoggedIn, false);
  assert.equal(wx.storage.get('token'), undefined);
  assert.equal(wx.storage.get('userProfile'), undefined);
});

for (const relative of ['pages/ai-career/ai-career.js', 'package-ai/pages/ai-assistant/ai-assistant.js']) {
  test(`${relative} ignores A -> B -> A late stream 401 and success`, () => {
    const wx = makeWx();
    let page;
    evaluate(relative, wx, {
      '../../utils/app-config.js': { API_BASE_URL: 'https://account.example' },
      '../../../utils/app-config.js': { API_BASE_URL: 'https://account.example' },
      '../../utils/api-client.js': { post: () => Promise.resolve({}) },
      '../../../utils/api-client.js': { post: () => Promise.resolve({}) },
      '../../utils/auth-session.js': authSession,
      '../../../utils/auth-session.js': authSession,
      '../../utils/owner-storage.js': { key: () => 'ai-cache' },
      '../../../utils/owner-storage.js': { key: () => 'ai-cache' },
      '../../utils/ai-chat-sessions.js': makeChatSessions({ value: 'A' }),
      '../../../utils/ai-chat-sessions.js': makeChatSessions({ value: 'A' })
    }, value => { page = value; });
    page.data = Object.assign({}, page.data, { inputText: 'hello', messages: [], loading: false, streaming: false });
    let updates = 0;
    page.setData = function(patch) { updates += 1; Object.assign(this.data, patch); };
    page._buildResumeContext = () => '';
    page._scrollTo = () => {};
    page._showLoginRequired = () => { throw new Error('old stream must not prompt B'); };
    page.sendMessage();
    assert.equal(wx.requests.length, 1);
    assert.equal(wx.requests[0].header.Authorization, 'Bearer token-A');
    const baseline = updates;
    authSession.setToken('token-B', wx);
    authSession.setToken('token-A', wx);
    wx.requests[0].success({ statusCode: 401, data: {} });
    assert.equal(wx.storage.get('token'), 'token-A');
    assert.equal(updates, baseline + 1, 'stale stream is cleared from the visible page');
    assert.equal(page.data.loading, false);
    assert.ok(page.data.messages.every(message => message.content !== 'old answer'));
    wx.requests[0].success({ statusCode: 200, data: { choices: [{ message: { content: 'old answer' } }] } });
    assert.equal(updates, baseline + 1);
  });
}

function makeChatSessions(ownerRef) {
  const records = new Map();
  const active = new Map();
  let sequence = 0;
  const ownerRecords = () => records.get(ownerRef.value) || [];
  return {
    createId: () => `chat-${++sequence}`,
    activeId: () => active.get(ownerRef.value) || '',
    setActive: id => active.set(ownerRef.value, id),
    get: id => ownerRecords().find(item => item.id === id) || null,
    list: () => ownerRecords().map(({ id, title, updatedAt }) => ({ id, title, updatedAt })),
    save(id, messages) {
      if (!messages.some(item => item.role === 'user')) return null;
      const record = { id, title: 'A chat', updatedAt: Date.now(), messages };
      records.set(ownerRef.value, [record].concat(ownerRecords().filter(item => item.id !== id)));
      active.set(ownerRef.value, id);
      return record;
    },
    remove(id) {
      records.set(ownerRef.value, ownerRecords().filter(item => item.id !== id));
      return true;
    },
    rename: () => true
  };
}

function loadAiPage(relative, wx, ownerRef, overrides = {}) {
  let page;
  const applicationMaterials = {
    QUESTION_TYPES: [], readMaterials: () => [],
    generateDraftAi: () => Promise.resolve({ content: 'new draft' }),
    generateDraft: () => ({ content: 'fallback draft' }),
    saveMaterial() {}
  };
  const resumes = {
    fetchResumeVersions: () => Promise.resolve({ currentResume: null, currentName: '', hasResume: false, list: [], labels: [] }),
    localSelection: () => ({ currentResume: null, currentName: '', hasResume: false, list: [], labels: [] }),
    getResumeDisplayName: () => 'resume'
  };
  evaluate(relative, wx, {
    '../../utils/app-config.js': { API_BASE_URL: 'https://account.example' },
    '../../../utils/app-config.js': { API_BASE_URL: 'https://account.example' },
    '../../utils/api-client.js': { post: () => Promise.resolve({}) },
    '../../../utils/api-client.js': { post: () => Promise.resolve({}) },
    '../../utils/auth-session.js': authSession,
    '../../../utils/auth-session.js': authSession,
    '../../utils/owner-storage.js': { key: () => 'ai-cache', capture: () => ownerRef.value, get: (key, suffix, fallback) => wx.storage.get(`${key}:${ownerRef.value}`) || fallback },
    '../../../utils/owner-storage.js': { key: () => 'ai-cache', capture: () => ownerRef.value, get: (key, suffix, fallback) => wx.storage.get(`${key}:${ownerRef.value}`) || fallback },
    '../../utils/ai-chat-sessions.js': makeChatSessions(ownerRef),
    '../../../utils/ai-chat-sessions.js': makeChatSessions(ownerRef),
    '../../utils/job-progress.js': { getList: () => [] },
    '../../../utils/job-progress.js': { getList: () => [] },
    '../../utils/application-materials.js': applicationMaterials,
    '../../utils/ai-application-materials.js': applicationMaterials,
    '../../utils/resume-versions.js': resumes,
    '../../utils/ai-resume-versions.js': resumes,
    ...overrides
  }, value => { page = value; });
  page.data = Object.assign({}, page.data);
  page.setData = function(patch) {
    for (const [key, value] of Object.entries(patch)) {
      const match = /^messages\[(\d+)\]\.(.+)$/.exec(key);
      if (match) this.data.messages[Number(match[1])][match[2]] = value;
      else this.data[key] = value;
    }
  };
  page._pageOwner = ownerRef.value;
  page._scrollTo = () => {};
  return page;
}

for (const relative of ['pages/ai-career/ai-career.js', 'package-ai/pages/ai-assistant/ai-assistant.js']) {
  test(`${relative} starts a new chat without losing the previous conversation`, () => {
    const wx = makeWx();
    const owner = { value: 'A' };
    const page = loadAiPage(relative, wx, owner);
    page._restoreOrInit();
    page.setData({ messages: [
      { id: 1, role: 'user', content: '产品经理求职准备', ts: 1 },
      { id: 2, role: 'ai', content: '先整理项目经历。', ts: 2 }
    ] });
    page.onNewChat();
    assert.equal(page.data.recentChats.length, 1);
    assert.equal(page.data.messages.some(item => item.content === '产品经理求职准备'), false);
    page.onSelectChat({ currentTarget: { dataset: { id: page.data.recentChats[0].id } } });
    assert.equal(page.data.messages[0].content, '产品经理求职准备');
    assert.equal(page.data.messages[1].content, '先整理项目经历。');
  });

  test(`${relative} regenerates only the latest answer without duplicating the question`, () => {
    const wx = makeWx();
    const owner = { value: 'A' };
    const page = loadAiPage(relative, wx, owner);
    page._restoreOrInit();
    page.setData({
      messages: [
        { id: 1, role: 'user', content: '帮我准备面试', ts: 1 },
        { id: 2, role: 'ai', content: '先整理 STAR 案例。', ts: 2 }
      ],
      latestAiIdx: 1
    });
    page.onRegenerateAnswer({ currentTarget: { dataset: { index: 1 } } });
    assert.equal(wx.requests.length, 1);
    assert.equal(page.data.messages.filter(item => item.role === 'user').length, 1);
    assert.equal(page.data.messages[0].content, '帮我准备面试');
  });

  for (const partial of [false, true]) {
    test(`${relative} stops ${partial ? 'partial' : 'empty'} stream without fallback`, () => {
      const wx = makeWx();
      const owner = { value: 'A' };
      const page = loadAiPage(relative, wx, owner);
      page.data.inputText = 'question';
      page.sendMessage();
      assert.equal(wx.requests.length, 1);
      if (partial) page._queueDelta('partial answer');
      page.onStop();
      assert.equal(page.data.loading, false);
      assert.equal(page.data.streaming, false);
      assert.equal(page._streamingIdx, -1);
      assert.equal(page.data.messages.at(-1).content, partial ? 'partial answer' : '已停止生成');
      assert.equal(page.data.messages.at(-1).isStreaming, false);
      assert.equal(wx.requests.length, 1, 'stop must not start fallback AI');
      wx.requests[0].success({ statusCode: 200, data: { choices: [{ message: { content: 'late answer' } }] } });
      assert.equal(page.data.messages.at(-1).content, partial ? 'partial answer' : '已停止生成');
    });
  }

  test(`${relative} clears private page state on account switch with or without a stream`, async () => {
    const wx = makeWx();
    const owner = { value: 'A' };
    const page = loadAiPage(relative, wx, owner);
    const sensitive = {
      messages: [{ role: 'ai', content: 'A private answer' }], inputText: 'A input',
      recentChats: [{ title: 'A chat' }], contextActive: true, contextLabel: 'A company',
      contextSource: 'A source', contextApplicationId: 'A id', showApplicationPanel: true,
      applicationJobs: [{ title: 'A job' }], selectedApplicationJobId: 'A job',
      assistantResume: { name: 'A resume' }, assistantResumeName: 'A resume', hasAssistantResume: true,
      applicationResumeVersions: [{ name: 'A resume' }], selectedApplicationResumeId: 'A resume',
      selectedApplicationResume: { name: 'A resume' }, hasApplicationResume: true,
      applicationDraft: { content: 'A private draft' },
      applicationSavedMaterials: [{ content: 'A saved material' }], applicationJdText: 'A JD'
    };
    Object.assign(page.data, sensitive);
    owner.value = 'B';
    authSession.setToken('token-B', wx);
    page.onShow();
    await nextMicrotask();
    assert.equal(page.data.messages.some(item => item.content === 'A private answer'), false);
    for (const key of ['inputText', 'contextLabel', 'contextSource', 'contextApplicationId', 'selectedApplicationJobId', 'assistantResumeName', 'selectedApplicationResumeId', 'applicationJdText']) assert.equal(page.data[key], '', key);
    for (const key of ['recentChats', 'applicationJobs', 'applicationResumeVersions', 'applicationSavedMaterials']) assert.equal(page.data[key].length, 0, key);
    for (const key of ['assistantResume', 'selectedApplicationResume', 'applicationDraft']) assert.equal(page.data[key], null, key);
    assert.equal(page.data.showApplicationPanel, false);

    owner.value = 'A';
    authSession.setToken('token-A', wx);
    page.onShow();
    page.data.inputText = 'A stream';
    page.sendMessage();
    page.data.applicationDraft = { content: 'A in-flight draft' };
    page.data.applicationSavedMaterials = [{ content: 'A in-flight saved' }];
    owner.value = 'B';
    authSession.setToken('token-B', wx);
    page.onShow();
    assert.equal(page.data.loading, false);
    assert.equal(page.data.applicationDraft, null);
    assert.equal(page.data.applicationSavedMaterials.length, 0);
    wx.requests[0].success({ statusCode: 200, data: { choices: [{ message: { content: 'A late answer' } }] } });
    assert.equal(page.data.messages.some(item => item.content === 'A late answer'), false);
  });

  test(`${relative} retains same-owner draft on token rotation`, () => {
    const wx = makeWx();
    const owner = { value: 'A' };
    const page = loadAiPage(relative, wx, owner);
    page.data.applicationDraft = { content: 'same-owner draft' };
    page.data.applicationSavedMaterials = [{ content: 'saved draft' }];
    authSession.setToken('rotated-A', wx);
    page._ensurePageOwner();
    assert.equal(page.data.applicationDraft.content, 'same-owner draft');
    assert.equal(page.data.applicationSavedMaterials[0].content, 'saved draft');
  });

  test(`${relative} ignores a late application draft after account switch`, async () => {
    const wx = makeWx();
    const owner = { value: 'A' };
    const pending = deferred();
    const materials = {
      QUESTION_TYPES: [], readMaterials: () => [],
      generateDraftAi: () => pending.promise,
      generateDraft: () => ({ content: 'fallback A draft' })
    };
    const page = loadAiPage(relative, wx, owner, {
      '../../utils/ai-application-materials.js': materials,
      '../../utils/application-materials.js': materials
    });
    page.data.applicationJobs = [{ id: 'job-A', title: 'A job' }];
    page.data.selectedApplicationJobId = 'job-A';
    page.data.hasApplicationResume = true;
    page.data.selectedApplicationResume = { name: 'A resume' };
    page.generateApplicationDraft();
    assert.equal(page.data.applicationGenerating, true);
    owner.value = 'B';
    authSession.setToken('token-B', wx);
    page.onShow();
    pending.resolve({ content: 'A late private draft' });
    await nextMicrotask();
    assert.equal(page.data.applicationDraft, null);
    assert.equal(page.data.applicationGenerating, false);
  });

  test(`${relative} never injects an unowned legacy resume into another owner's AI prompt`, () => {
    const wx = makeWx();
    const owner = { value: 'B' };
    wx.storage.set('onlineResume', { basicInfo: { name: 'A Private' }, summary: 'A confidential career history' });
    const page = loadAiPage(relative, wx, owner);
    assert.equal(page._buildResumeContext('请优化简历'), '');
    wx.storage.set('onlineResume:B', { basicInfo: { name: 'B Current' }, summary: 'B own experience' });
    assert.match(page._buildResumeContext('请优化简历'), /B Current/);
    assert.doesNotMatch(page._buildResumeContext('请优化简历'), /A Private/);
  });
}
