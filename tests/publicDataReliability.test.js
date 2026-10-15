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
