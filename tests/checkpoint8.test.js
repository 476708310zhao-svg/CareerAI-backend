'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', 'miniprogram');
const EXPECTED_TABS = [
  'pages/index/index',
  'pages/jobs/jobs',
  'pages/applications/applications',
  'pages/resources/resources',
  'pages/profile/profile'
];

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function loadModule(relativePath, mocks, globals) {
  const filename = path.join(ROOT, relativePath);
  const context = Object.assign({
    module: { exports: {} },
    exports: {},
    console: { warn() {}, log() {} },
    Date,
    Promise,
    setTimeout,
    clearTimeout,
    require(name) {
      if (Object.prototype.hasOwnProperty.call(mocks, name)) return mocks[name];
      throw new Error('Unexpected dependency: ' + name);
    }
  }, globals || {});
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  return context.module.exports;
}

function loadPage(relativePath, mocks, globals) {
  let definition;
  const filename = path.join(ROOT, relativePath);
  const context = Object.assign({
    Page(value) { definition = value; },
    console: { warn() {}, log() {} },
    Date,
    Promise,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    require(name) {
      if (Object.prototype.hasOwnProperty.call(mocks, name)) return mocks[name];
      return {};
    }
  }, globals || {});
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  return definition;
}

test('Checkpoint 8 keeps app.json, custom TabBar and navigation on the same five stable routes', () => {
  const app = JSON.parse(read('app.json'));
  const custom = read('custom-tab-bar/index.js');
  const navigation = read('utils/navigation.js');
  const tabs = app.tabBar.list.map(item => item.pagePath);
  assert.deepEqual(tabs, EXPECTED_TABS);
  assert.deepEqual(app.tabBar.list.map(item => item.text), ['首页', '找岗位', '进度', '资源中心', '我的']);
  EXPECTED_TABS.forEach(route => {
    assert.match(custom, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(navigation, new RegExp(('/' + route).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.ok(fs.existsSync(path.join(ROOT, route + '.js')), route + ' must exist');
  });
  assert.doesNotMatch(custom, /getVisibleTabList|isRecruitmentEnabled|filter\(item => item\.pagePath/);
  assert.match(custom, /const list = FULL_TAB_LIST/);
  app.tabBar.list.forEach(item => {
    assert.ok(fs.existsSync(path.join(ROOT, item.iconPath)), item.iconPath);
    assert.ok(fs.existsSync(path.join(ROOT, item.selectedIconPath)), item.selectedIconPath);
  });
});

test('feature flags keep cold-start recruitment usable but honor cached and server false', async () => {
  const storage = {};
  const observed = [];
  const app = { globalData: { featureFlags: {} }, syncCustomTabBar() {} };
  const page = { _onFeatureFlagsChange(flags) { observed.push(flags.recruitment); } };
  const wx = {
    getStorageSync(key) { return storage[key]; },
    setStorageSync(key, value) { storage[key] = value; },
    request(options) {
      options.success({ statusCode: 200, data: { code: 0, data: { recruitment: false, home_recommendations: false, membership: true } } });
      options.complete();
    },
    showToast() {}
  };
  const flags = loadModule('utils/feature-flags.js', {
    './app-config.js': {
      API_BASE_URL: 'https://example.test',
      DEFAULT_FEATURE_FLAGS: { recruitment: true, home_recommendations: false, membership: true }
    }
  }, { wx, getApp: () => app, getCurrentPages: () => [page] });

  assert.equal(flags.isRecruitmentEnabled(), true, 'unknown cold-start state must not masquerade as disabled');
  await flags.refreshFeatureFlags({ force: true });
  assert.equal(flags.isRecruitmentEnabled(), false);
  assert.deepEqual(observed, [false]);
  app.globalData.featureFlags = { recruitment: true, home_recommendations: true, membership: true };
  assert.equal(flags.isRecruitmentEnabled(), false, 'cached server false must beat local optimistic true');
});

test('custom TabBar restores selected state and owner-scoped unread badge after attach/show', () => {
  let definition;
  let owner = 'owner-a';
  const unreadByOwner = { 'owner-a': 0, 'owner-b': 120 };
  const navigated = [];
  const context = {
    Component(value) { definition = value; },
    getCurrentPages: () => [{ route: 'pages/resources/resources' }],
    require(name) {
      if (name === '../utils/navigation.js') return {
        safeSwitchTab(url, options) { navigated.push(url); if (options && options.success) options.success(); return true; }
      };
      if (name === '../utils/unread-messages.js') return { get: () => unreadByOwner[owner] || 0 };
      throw new Error('Unexpected dependency: ' + name);
    }
  };
  vm.runInNewContext(read('custom-tab-bar/index.js'), context);
  assert.ok(definition);
  const instance = {
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(patch) { Object.assign(this.data, patch); }
  };
  Object.assign(instance, definition.methods);
  instance.syncState();
  assert.equal(instance.data.selected, 3);
  assert.equal(instance.data.unreadCount, 0);
  assert.equal(instance.data.badgeText, '0');
  assert.equal(instance.data.list.length, 5);
  owner = 'owner-b';
  instance.syncState();
  assert.equal(instance.data.unreadCount, 120);
  assert.equal(instance.data.badgeText, '99+');
  instance.switchTab({ currentTarget: { dataset: { index: 1 } } });
  assert.deepEqual(navigated, ['/pages/jobs/jobs']);
});

test('home puts one honest primary action first and removes tool-hall and floating-AI distractions', () => {
  const home = read('pages/index/index.wxml');
  const homeJs = read('pages/index/index.js');
  const tabWxml = read('custom-tab-bar/index.wxml');
  const tabWxss = read('custom-tab-bar/index.wxss');
  assert.equal((home.match(/class="zy-main-action"/g) || []).length, 1);
  assert.ok(home.indexOf('class="zy-main-action"') < home.indexOf('今天还要做'));
  assert.doesNotMatch(home, /\sautoplay(?:\s|>)/);
  assert.doesNotMatch(home, /home-core-tools|home-career-insights|banner-wrap|membership-benefit-banner/);
  assert.doesNotMatch(tabWxml, /ai-float|goAiAssistant/);
  assert.doesNotMatch(tabWxss, /ai-float|ai-orbit|ai-glow/);
  assert.match(home, /workbench\.primaryUrl/);
  assert.doesNotMatch(home, /zy-progress-card|zy-progress-item|求职进展/);
  assert.match(homeJs, /title = nextTask\.title/);
  assert.match(homeJs, /buildPrimaryTaskMeta\(nextTask, applications\)/);
  assert.match(homeJs, /'找到第一个目标岗位'/);
  assert.match(homeJs, /'暂时没有待处理事项'/);
  assert.doesNotMatch(homeJs, /'今日任务已完成'|Math\.max\(1, Number\(taskStats\.pending/);
  assert.match(homeJs, /String\(item\.id \|\| ''\) !== primaryTaskId/);
  assert.match(homeJs, /\.slice\(0, 2\)/);
});

test('home-private caches and delayed responses are owner-scoped', () => {
  const homeJs = read('pages/index/index.js');
  const tasks = read('utils/daily-tasks.js');
  const matches = read('utils/jd-match.js');
  const tab = read('custom-tab-bar/index.js');
  const history = read('utils/browse-history.js');
  const settings = read('package-user/pages/settings/settings.js');
  assert.match(homeJs, /ownerStorage\.get\('cachedRecommendJobs'/);
  assert.match(homeJs, /ownerStorage\.get\('onlineResume'/);
  assert.match(homeJs, /isHomeRequestCurrent\(owner, requestId/);
  assert.match(homeJs, /ownerStorage\.isCurrent\(owner\)/);
  assert.match(tasks, /ownerStorage\.get\(DONE_KEY/);
  assert.match(tasks, /ownerStorage\.get\('onlineResume'/);
  assert.match(matches, /ownerStorage\.keyFor\(scope, STORAGE_KEY\)/);
  assert.match(matches, /if \(!ownerStorage\.isCurrent\(owner\)\) return/);
  assert.match(tab, /unreadMessages\.get\(\)/);
  assert.doesNotMatch(tab, /getStorageSync\('unreadMessages'\)/);
  assert.match(history, /ownerStorage\.get\(key/);
  assert.match(history, /ownerStorage\.set\(PRIMARY_KEY/);
  assert.match(settings, /'jdMatchReports', 'dailyTaskDoneMap', 'cachedRecommendJobs'/);
  assert.match(settings, /removeOwnerStorage\(key\)/);
});

test('a JD report response that finishes after an account switch cannot write into the new owner cache', async () => {
  let owner = 'owner-a';
  const storage = {};
  const requestA = deferred();
  const requestB = deferred();
  let callCount = 0;
  const ownerStorage = {
    capture: () => owner,
    isCurrent: scope => scope === owner,
    keyFor: (scope, base) => `${base}:${scope}`
  };
  const wx = {
    getStorageSync(key) {
      if (key === 'token') return 'token';
      return storage[key];
    },
    setStorageSync(key, value) { storage[key] = value; }
  };
  const matches = loadModule('utils/jd-match.js', {
    './api-client.js': { request: () => (++callCount === 1 ? requestA.promise : requestB.promise), post: async () => ({}) },
    './owner-storage.js': ownerStorage,
    './date-time.js': { timestamp: value => Date.parse(value) || 0 }
  }, { wx });

  const pendingA = matches.fetchRemoteReports();
  owner = 'owner-b';
  requestA.resolve({ code: 0, data: [{ id: 1, company: 'A private report' }] });
  assert.equal((await pendingA).length, 0);
  assert.equal(storage['jdMatchReports:owner-b'], undefined);

  const pendingB = matches.fetchRemoteReports();
  requestB.resolve({ code: 0, data: [{ id: 2, company: 'B report', createdAt: '2026-10-09T00:00:00Z' }] });
  const reports = await pendingB;
  assert.equal(reports.length, 1);
  assert.equal(storage['jdMatchReports:owner-b'][0].company, 'B report');
  assert.equal(storage['jdMatchReports:owner-a'], undefined);
});

test('job search history reloads per owner and never exposes guest private history', () => {
  let owner = 'owner-a';
  const storage = {
    'jobSearchHistory:owner-a': ['A secret'],
    'jobSearchHistory:owner-b': ['B search'],
    'jobSearchHistory:guest': ['legacy guest secret']
  };
  const progress = {
    currentOwnerScope: () => owner,
    getJobState: () => ({}),
    getStats: () => ({})
  };
  const ownerStorage = {
    keyFor: (scope, base) => `${base}:${scope || 'guest'}`,
    get(base, suffix, fallback) { return storage[`${base}:${owner || 'guest'}`] || fallback; },
    set(base, suffix, value) { storage[`${base}:${owner || 'guest'}`] = value; },
    remove(base) { delete storage[`${base}:${owner || 'guest'}`]; }
  };
  const page = loadPage('pages/jobs/jobs.js', {
    '../../utils/feature-flags.js': {},
    '../../utils/api.js': {},
    '../../utils/api-v4.js': {},
    '../../utils/api-news.js': {},
    '../../utils/favorites.js': { prepareOwner() {} },
    '../../utils/job-progress.js': progress,
    '../../utils/demo-data.js': { enabled: () => false },
    '../../utils/util.js': {},
    '../../utils/matcher.js': {},
    '../../utils/data-provenance.js': { markCachedDataMeta: value => value },
    '../../behaviors/login-gate.js': {},
    '../../utils/application-queue.js': {},
    '../../utils/navigation.js': {},
    '../../utils/analytics.js': {},
    '../../utils/owner-storage.js': ownerStorage
  }, {
    wx: { getStorageSync: key => storage[key], setStorageSync(key, value) { storage[key] = value; } }
  });
  const instance = {
    _ownerScope: 'owner-a',
    setData(patch) { Object.assign(this.data, patch); }
  };
  Object.assign(instance, page);
  instance.data = Object.assign({}, page.data, { jobs: [{ id: 1, isSaved: true }], recruitmentEnabled: true });
  assert.deepEqual(Array.from(instance._readSearchHistory()), ['A secret']);
  owner = 'owner-b';
  instance._handleOwnerChange('owner-b', '');
  assert.deepEqual(Array.from(instance.data.searchHistory), ['B search']);
  assert.equal(instance.data.jobs[0].isSaved, false);
  owner = '';
  assert.deepEqual(Array.from(instance._readSearchHistory()), []);
});

test('jobs hide then show resumes one discarded request exactly once', async () => {
  const first = deferred();
  const second = deferred();
  let calls = 0;
  const storage = { token: 'token-a', jobFavoritesVisibleOwner: 'owner-a' };
  const page = loadPage('pages/jobs/jobs.js', {
    '../../utils/feature-flags.js': {
      guardRecruitmentPage: () => true,
      isRecruitmentEnabled: () => true
    },
    '../../utils/api.js': {
      getAggregatedJobs: () => (++calls === 1 ? first.promise : second.promise),
      normalizeCompanyLogo: () => ''
    },
    '../../utils/api-v4.js': {},
    '../../utils/api-news.js': { getCountries: () => Promise.resolve({ countries: [] }) },
    '../../utils/favorites.js': { isFavorited: () => false },
    '../../utils/job-progress.js': { currentOwnerScope: () => 'owner-a', getJobState: () => ({}) },
    '../../utils/demo-data.js': { enabled: () => false },
    '../../utils/util.js': {},
    '../../utils/matcher.js': {},
    '../../utils/data-provenance.js': { markCachedDataMeta: value => value },
    '../../behaviors/login-gate.js': {},
    '../../utils/application-queue.js': {},
    '../../utils/navigation.js': {},
    '../../utils/analytics.js': {},
    '../../utils/owner-storage.js': {
      keyFor: (scope, base) => `${base}:${scope}`,
      get: (base, suffix, fallback) => fallback
    }
  }, {
    wx: {
      getStorageSync: key => storage[key],
      setStorageSync(key, value) { storage[key] = value; },
      stopPullDownRefresh() {}
    },
    getApp: () => ({ syncCustomTabBar() {} })
  });
  const instance = {
    _ownerScope: 'owner-a',
    _visible: true,
    setData(patch) { Object.assign(this.data, patch); }
  };
  Object.assign(instance, page);
  instance.data = Object.assign({}, page.data, { recruitmentEnabled: true, jobs: [], countryList: [] });
  instance.formatJobData = value => value;
  instance.enrichJobLogos = value => value;

  instance.loadJobs(true);
  assert.equal(instance.data.loading, true);
  assert.equal(calls, 1);
  instance.onHide();
  assert.equal(instance._needsReload, true);
  assert.equal(instance.data.loading, false);
  storage.cachedJobsList = {
    key: instance._jobsCacheKey(),
    t: Date.now(),
    total: 1,
    hasMore: false,
    items: [{ id: 'safe-cache', isSaved: true, matchScore: 99 }]
  };

  instance.onShow();
  assert.equal(calls, 2);
  assert.equal(instance._needsReload, false);
  assert.deepEqual(Array.from(instance.data.jobs).map(item => item.id), ['safe-cache']);
  assert.equal(instance.data.jobs[0].isSaved, false);
  assert.equal(instance.data.jobs[0].matchScore, 0);
  first.resolve({ data: [{ id: 'old' }], total: 1, hasMore: false });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(instance.data.loading, true, 'discarded first response must not settle the resumed request');
  assert.deepEqual(Array.from(instance.data.jobs).map(item => item.id), ['safe-cache']);

  second.resolve({ data: [{ id: 'current' }], total: 1, hasMore: false });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(instance.data.loading, false);
  assert.deepEqual(Array.from(instance.data.jobs).map(item => item.id), ['current']);
  assert.equal(calls, 2, 'show must schedule only one replacement request');
  clearTimeout(instance._onShowSyncTimer);
});

test('daily brief discards an old-owner result and stores only the current owner result', () => {
  let owner = 'owner-a';
  const storage = {};
  const ownerStorage = {
    capture: () => owner,
    isCurrent: scope => scope === owner,
    get(base, suffix, fallback) { return storage[`${base}:${owner}`] || fallback; },
    set(base, suffix, value) { storage[`${base}:${owner}`] = value; },
    remove(base) { delete storage[`${base}:${owner}`]; }
  };
  const page = loadPage('package-ai/pages/daily-brief/daily-brief.js', {
    '../../../utils/api.js': { sendChatToDeepSeek: () => Promise.resolve({}) },
    '../../../utils/job-progress.js': {},
    '../../../utils/favorites.js': {},
    '../../../utils/demo-data.js': { enabled: () => false },
    '../../../utils/interview-notebook.js': {},
    '../../../utils/navigation.js': {},
    '../../../utils/api-client.js': { post: () => Promise.resolve({}) },
    '../../../utils/daily-tasks.js': { todayKey: () => '2026-10-09' },
    '../../../utils/owner-storage.js': ownerStorage,
    '../../../utils/browse-history.js': { getList: () => [] }
  }, { wx: { showToast() {} } });
  const instance = {
    _ownerScope: 'owner-a',
    _requestGeneration: 0,
    _unloaded: false,
    _visible: true,
    setData(patch) { Object.assign(this.data, patch); }
  };
  Object.assign(instance, page);
  instance.data = { result: null };
  owner = 'owner-b';
  instance._ownerScope = 'owner-b';
  instance._requestGeneration = 1;
  instance._saveDailyBriefResult({ todaySummary: 'A late' }, {}, {}, 'owner-a', 0);
  assert.equal(storage['dailyBriefCache:owner-a'], undefined);
  assert.equal(storage['dailyBriefCache:owner-b'], undefined);
  instance._saveDailyBriefResult({ todaySummary: 'B current' }, {}, {}, 'owner-b', 1);
  assert.equal(storage['dailyBriefCache:owner-b'].result.todaySummary, 'B current');
});

test('only proven orphaned home components are removed and have no runtime references', () => {
  const removed = ['home-core-tools', 'home-career-insights'];
  removed.forEach(name => ['js', 'json', 'wxml', 'wxss'].forEach(extension => {
    assert.equal(fs.existsSync(path.join(ROOT, 'components', name, `${name}.${extension}`)), false, `${name}.${extension}`);
  }));
  const files = walk(ROOT).filter(file => /\.(?:js|json|wxml|wxss)$/.test(file));
  removed.forEach(name => {
    const refs = files.filter(file => fs.readFileSync(file, 'utf8').includes(name));
    assert.deepEqual(refs, [], name + ' must have no miniprogram references');
  });
});

test('legacy AI Career routes are lightweight safe-query redirects', () => {
  ['pages/ai-career/ai-career.js', 'package-ai/pages/ai-career/ai-career.js'].forEach(file => {
    const source = read(file);
    assert.match(source, /ALLOWED_QUERY_KEYS/);
    assert.match(source, /ai-assistant\/ai-assistant/);
    assert.match(source, /redirectTo/);
    assert.match(source, /fail:[\s\S]*showToast/);
    assert.doesNotMatch(source, /createAgentTask|aiCareerCompatTasks|refresh\(|loadTasks\(/);
  });
});
