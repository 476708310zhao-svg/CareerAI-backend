const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function load(relative, mocks = {}, wx = {}, pageMode = false) {
  const filename = path.join(__dirname, '..', 'miniprogram', relative);
  const localRequire = createRequire(filename);
  let page;
  const context = {
    module: { exports: {} }, wx, setTimeout, clearTimeout,
    console: { warn() {}, log() {} },
    Page: value => { page = value; },
    getApp: () => ({}),
    require: name => Object.prototype.hasOwnProperty.call(mocks, name) ? mocks[name] : localRequire(name)
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  if (!pageMode) return context.module.exports;
  page.data = JSON.parse(JSON.stringify(page.data));
  page.setData = function(patch) { Object.assign(this.data, patch); };
  return page;
}

test('public campus reads use production content API anonymously; reminder writes remain on account API', async () => {
  const reads = [], writes = [];
  const api = load('utils/api-campus.js', {
    './api-client.js': {
      request: async options => { reads.push(options); return { code: 0, data: { list: [] } }; },
      _write: async options => { writes.push(options); return { code: 0 }; }
    },
    './app-config.js': { CONTENT_API_BASE_URL: 'https://api.zhiyincareer.com' }
  });
  await api.getCampusList({ sort: 'latest' });
  await api.getCampusMeta();
  await api.getCampusDetail(42);
  assert.deepEqual(Array.from(reads, item => item.path), ['/api/campus', '/api/campus/meta', '/api/campus/42']);
  for (const item of reads) {
    assert.equal(item.baseUrl, 'https://api.zhiyincareer.com');
    assert.equal(item.skipAuth, true);
  }
  await api.subscribeCampusReminder(42, 'Company', '2026-10-20', 'Engineer');
  assert.equal(writes[0].path, '/api/notify/campus-subscribe');
  assert.equal(writes[0].baseUrl, undefined);
  assert.equal(writes[0].skipAuth, undefined);
});

test('company list and detail use the public content API and reject failed reads', async () => {
  const reads = [];
  let response = { code: 0, data: { list: [{ id: 1, name: 'Company' }], total: 1 } };
  const api = load('utils/api-companies.js', {
    './api-client.js': {
      request: async options => { reads.push(options); return response; },
      DETAIL_CACHE_TTL: 1000
    },
    './app-config.js': { CONTENT_API_BASE_URL: 'https://api.zhiyincareer.com' },
    './assets.js': { normalizeLogoUrl: value => value }
  });
  assert.equal((await api.getCompanies({ page: 1 })).data.list.length, 1);
  response = { code: 0, data: { id: 1, name: 'Company' } };
  assert.equal((await api.getCompanyDetail(1)).data.id, 1);
  assert.deepEqual(Array.from(reads, item => item.path), ['/api/companies', '/api/companies/1']);
  assert.ok(reads.every(item => item.baseUrl === 'https://api.zhiyincareer.com' && item.skipAuth === true));
  response = { data: [], _source: 'networkError' };
  await assert.rejects(api.getCompanies({ page: 1 }), /公司列表暂时无法加载/);
});

test('public aggregate jobs and detail use production anonymously without eager Feishu traffic', async () => {
  const reads = []; let fallbackCalls = 0;
  const api = load('utils/api-jobs.js', {
    './api-client.js': {
      request: async options => { reads.push(options); return { data: [], total: 0, hasMore: false }; },
      post: async () => ({})
    },
    './api-feishu-content.js': { getFeishuJobs: async () => { fallbackCalls++; return { data: [] }; } },
    './app-config.js': { CONTENT_API_BASE_URL: 'https://api.zhiyincareer.com' }
  });
  assert.equal((await api.getAggregatedJobs({ country: 'global' })).total, 0);
  await api.getJobDetail('job-1');
  assert.deepEqual(Array.from(reads, item => item.path), ['/api/jobs/aggregate', '/api/jobs/detail']);
  assert.ok(reads.every(item => item.baseUrl === 'https://api.zhiyincareer.com' && item.skipAuth === true));
  assert.equal(fallbackCalls, 0);
});

test('anonymous public GET never sends or deletes the development login token', async () => {
  const sent = [], removed = [];
  const wx = {
    getStorageSync: key => key === 'token' ? 'development-token' : null,
    removeStorageSync: key => removed.push(key),
    request: options => {
      sent.push(options);
      setImmediate(() => options.success({ statusCode: sent.length === 1 ? 401 : 200, data: { code: 0, data: [] } }));
      return { abort() {} };
    }
  };
  const apiClient = load('utils/api-client.js', {
    './app-config.js': { API_BASE_URL: 'http://127.0.0.1:4400' }
  }, wx);
  await apiClient.request({ path: '/api/campus', baseUrl: 'https://api.zhiyincareer.com', skipAuth: true, noCache: true });
  await apiClient.request({ path: '/api/account', noCache: true });
  assert.equal(sent[0].url, 'https://api.zhiyincareer.com/api/campus');
  assert.equal(sent[0].header.Authorization, undefined);
  assert.equal(sent[1].url, 'http://127.0.0.1:4400/api/account');
  assert.equal(sent[1].header.Authorization, 'Bearer development-token');
  assert.deepEqual(removed, []);
});

test('local authenticated rate limits do not suppress public content reads', async () => {
  const sent = [], removed = [];
  const wx = {
    getStorageSync: key => key === 'token' ? 'development-token' : null,
    removeStorageSync: key => removed.push(key),
    request: options => {
      sent.push(options);
      setImmediate(() => options.success({
        statusCode: sent.length === 1 ? 429 : 200,
        data: { code: 0, data: [{ id: 1 }] }
      }));
      return { abort() {} };
    }
  };
  const apiClient = load('utils/api-client.js', {
    './app-config.js': { API_BASE_URL: 'http://127.0.0.1:4400' }
  }, wx);
  const limited = await apiClient.request({ path: '/api/me', noCache: true });
  const publicResult = await apiClient.request({
    path: '/api/campus', baseUrl: 'https://api.zhiyincareer.com', skipAuth: true, noCache: true
  });
  assert.equal(limited._source, 'rateLimit');
  assert.equal(publicResult.code, 0);
  assert.equal(sent.length, 2);
  assert.equal(sent[1].header.Authorization, undefined);
  assert.deepEqual(removed, []);
});

test('authenticated 401 continues to clear the local session', async () => {
  const removed = [];
  const wx = {
    getStorageSync: key => key === 'token' ? 'development-token' : null,
    removeStorageSync: key => removed.push(key),
    request: options => {
      setImmediate(() => options.success({ statusCode: 401, data: {} }));
      return { abort() {} };
    }
  };
  const apiClient = load('utils/api-client.js', {
    './app-config.js': { API_BASE_URL: 'http://127.0.0.1:4400' }
  }, wx);
  const result = await apiClient.request({ path: '/api/me', noCache: true });
  assert.equal(result._source, 'unauthorized');
  assert.deepEqual(removed, ['token', 'userProfile']);
});

test('home shows a retryable error rather than caching it as a genuine empty campus list', async () => {
  let response = { data: [], _source: 'networkError' };
  const page = load('pages/index/index.js', {
    '../../utils/api.js': { getCampusList: async () => response, getAggregatedJobs: async () => ({ data: [] }) },
    '../../utils/owner-storage.js': { capture: () => 'owner', isCurrent: () => true },
    '../../utils/demo-data.js': { enabled: () => false }
  }, {}, true);
  page._visible = true;
  page.rankCampusUpdates = items => items.map(item => ({ id: item.id, title: '校招', isUrgent: false, updateTimestamp: 1 }));
  page.normalizeCampusUpdateSubtitle = () => '近期更新';

  await page.fetchHomeCampusDigest();
  assert.equal(page.data.campusDigestError, true);
  assert.equal(page._campusDigestFetchedAt, 0);
  response = { code: 0, data: { list: [{ id: 42 }] } };
  await page.fetchHomeCampusDigest();
  assert.equal(page.data.campusDigestError, false);
  assert.equal(page.data.campusDigest.length, 1);
  response = { code: 0, data: { list: [] } };
  await page.retryCampusDigest();
  assert.equal(page.data.campusDigestError, false);
  assert.equal(page.data.campusDigest.length, 0);
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/pages/index/index.wxml'), 'utf8');
  const wxss = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/pages/index/index.wxss'), 'utf8');
  assert.match(wxml, /campusDigestError[\s\S]*?retryCampusDigest/);
  assert.match(wxss, /\.zy-campus-retry[^}]*min-height:\s*88rpx/);
});

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function accountWx(respond) {
  const storage = new Map([['token', 'account-A-token']]);
  const sent = [];
  const removed = [];
  return {
    storage, sent, removed,
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: key => { removed.push(key); storage.delete(key); },
    request: options => {
      sent.push(options);
      if (respond) respond(options, sent.length);
      return { abort() {} };
    }
  };
}

function clientWithWx(wx) {
  return load('utils/api-client.js', {
    './app-config.js': { API_BASE_URL: 'https://account.example' }
  }, wx);
}

test('authenticated GET cache is isolated across A/B and does not expose a token in its key', async () => {
  const wx = accountWx(options => setImmediate(() => options.success({
    statusCode: 200, data: { owner: options.header.Authorization }
  })));
  const client = clientWithWx(wx);
  const a = await client.request({ path: '/api/profile' });
  wx.storage.set('token', 'account-B-token');
  const b = await client.request({ path: '/api/profile' });
  assert.equal(a.owner, 'Bearer account-A-token');
  assert.equal(b.owner, 'Bearer account-B-token');
  assert.equal(wx.sent.length, 2);
  assert.ok(Array.from(wx.storage.keys()).every(key => !key.includes('account-A-token')));
});

test('in-flight GET from A is not shared with B or delivered after account switch', async () => {
  const wx = accountWx();
  const client = clientWithWx(wx);
  const old = client.request({ path: '/api/profile' });
  wx.storage.set('token', 'account-B-token');
  const current = client.request({ path: '/api/profile' });
  assert.equal(wx.sent.length, 2);
  wx.sent[0].success({ statusCode: 200, data: { owner: 'A' } });
  wx.sent[1].success({ statusCode: 200, data: { owner: 'B' } });
  assert.equal((await old)._source, 'authChanged');
  assert.equal((await current).owner, 'B');
  assert.equal((await client.request({ path: '/api/profile' })).owner, 'B');
  assert.equal(wx.sent.length, 2);
});

test('explicit login generation rejects an old A response even after A -> B -> A', async () => {
  const wx = accountWx();
  const authSession = require('../miniprogram/utils/auth-session.js');
  const client = clientWithWx(wx);
  const oldRead = client.request({ path: '/api/profile' });
  const oldWrite = client.post({ path: '/api/profile', body: { name: 'old' } });
  authSession.setToken('account-B-token', wx);
  authSession.setToken('account-A-token', wx);
  wx.sent[0].success({ statusCode: 200, data: { owner: 'old-A' } });
  wx.sent[1].success({ statusCode: 200, data: { owner: 'old-A-write' } });
  assert.equal((await oldRead)._source, 'authChanged');
  await assert.rejects(oldWrite, error => error.code === 'AUTH_CHANGED');
  const fresh = client.request({ path: '/api/profile' });
  assert.equal(wx.sent.length, 3);
  wx.sent[2].success({ statusCode: 200, data: { owner: 'fresh-A' } });
  assert.equal((await fresh).owner, 'fresh-A');
});

test('late 401 from A cannot clear B for GET, write or silent startup validation', async () => {
  const wx = accountWx();
  const client = clientWithWx(wx);
  const read = client.request({ path: '/api/profile', noCache: true });
  const write = client.post({ path: '/api/profile', body: { name: 'A' } });
  wx.storage.set('token', 'account-B-token');
  wx.sent[0].success({ statusCode: 401, data: {} });
  wx.sent[1].success({ statusCode: 401, data: {} });
  assert.equal((await read)._source, 'authChanged');
  await assert.rejects(write, error => error.code === 'AUTH_CHANGED');
  assert.equal(wx.storage.get('token'), 'account-B-token');
  assert.deepEqual(wx.removed, []);

  let validation = deferred();
  const authSession = require('../miniprogram/utils/auth-session.js');
  let app;
  const filename = path.join(__dirname, '..', 'miniprogram/app.js');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    App: value => { app = value; }, wx,
    require: name => name === './utils/api.js'
      ? { getUserProfile: () => validation.promise }
      : name === './utils/auth-session.js' ? authSession
      : ({
        './utils/favorites.js': {}, './utils/vip.js': {},
        './utils/navigation.js': { installRouteGuard() {} },
        './utils/feature-flags.js': {}, './utils/share.js': { installPageShare() {} },
        './utils/analytics.js': { installPageTracker() {} },
        './utils/unread-messages.js': {}
      })[name],
    console: { log() {}, warn() {} }, setTimeout, clearTimeout
  }, { filename });
  app.globalData = { isLoggedIn: true };
  app._silentLogin();
  wx.storage.set('token', 'account-C-token');
  validation.resolve({ code: 401 });
  await validation.promise;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(wx.storage.get('token'), 'account-C-token');
  assert.equal(app.globalData.isLoggedIn, true);

  validation = deferred();
  app._silentLogin();
  authSession.setToken('account-B-token', wx);
  authSession.setToken('account-C-token', wx);
  validation.resolve({ code: 401 });
  await validation.promise;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(wx.storage.get('token'), 'account-C-token');
  assert.equal(app.globalData.isLoggedIn, true);
});

test('non-idempotent POST is not automatically replayed after a network error', async () => {
  const wx = accountWx(options => setImmediate(() => options.fail({ errMsg: 'network lost' })));
  const client = clientWithWx(wx);
  await assert.rejects(client.post({ path: '/api/orders', body: { amount: 1 } }),
    error => error.code === 'NETWORK_ERROR');
  assert.equal(wx.sent.length, 1);
});

test('opt-in idempotent retry is cancelled when account changes during backoff', async () => {
  const wx = accountWx(options => setImmediate(() => options.fail({ errMsg: 'network lost' })));
  const client = clientWithWx(wx);
  const writing = client.put({ path: '/api/profile', body: {}, retryOnNetworkError: true });
  await new Promise(resolve => setImmediate(resolve));
  wx.storage.set('token', 'account-B-token');
  await assert.rejects(writing, error => error.code === 'AUTH_CHANGED');
  assert.equal(wx.sent.length, 1);
});

test('429 on aggregate does not suppress campus at the same public host', async () => {
  const wx = accountWx((options, number) => setImmediate(() => options.success({
    statusCode: number === 1 ? 429 : 200,
    data: { code: 0, data: [{ id: 'campus' }] }
  })));
  const client = clientWithWx(wx);
  const options = { baseUrl: 'https://content.example', skipAuth: true, noCache: true };
  assert.equal((await client.request({ ...options, path: '/api/jobs/aggregate' }))._source, 'rateLimit');
  assert.equal((await client.request({ ...options, path: '/api/campus' })).code, 0);
  assert.equal(wx.sent.length, 2);
});

test('all Feishu public GET routes explicitly skip account Authorization', async () => {
  const reads = [];
  const feishu = load('utils/api-feishu-content.js', {
    './app-config.js': { FEISHU_CONTENT_API_BASE_URL: 'https://feishu.example' },
    './api-client.js': {
      request: async options => { reads.push(options); return { items: [{ id: 1 }], item: { id: 1 } }; },
      post: async () => ({})
    }
  });
  await feishu.getFeishuList('manual-jobs', {});
  await feishu.getFeishuDetail('manual-jobs', 1);
  await feishu.getFeishuHome();
  await feishu.getFeishuSearch('engineer');
  assert.equal(reads.length, 4);
  assert.ok(reads.every(item => item.skipAuth === true));
});

test('country-specific job source failures never fall back to unfiltered Feishu jobs', async () => {
  let fallbackCalls = 0;
  const jobs = load('utils/api-jobs.js', {
    './api-client.js': {
      request: async () => ({ data: [], _source: 'networkError' }),
      post: async () => ({})
    },
    './api-feishu-content.js': {
      getFeishuJobs: async () => { fallbackCalls++; return { data: [{ job_country: 'US' }] }; }
    },
    './app-config.js': { CONTENT_API_BASE_URL: 'https://content.example' },
    './data-provenance.js': { normalizeDataMeta: value => value || {} }
  });
  await assert.rejects(jobs.getAggregatedJobs({ country: 'ca' }));
  await assert.rejects(jobs.getJobs({ country: 'ca' }));
  assert.equal(fallbackCalls, 0);
  assert.equal((await jobs.getAggregatedJobs({ country: 'global' })).data.length, 1);
  assert.equal(fallbackCalls, 1);
});
