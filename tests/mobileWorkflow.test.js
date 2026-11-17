const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const { applicationState } = require('../miniprogram/utils/application-state');
const { presentJob } = require('../miniprogram/utils/job-presenter');
const { buildApplicationWorkbench } = require('../miniprogram/utils/application-workbench');

test('VIP pricing stays hidden until a saleable plan has a server supplied price', () => {
  const source = fs.readFileSync(path.join(__dirname, '../miniprogram/package-user/pages/vip/vip.js'), 'utf8');
  const context = { Page() {}, require() { return {}; } };
  vm.runInNewContext(`${source}\nglobalThis.getPlansForTest = getPlansByConfig;`, context);
  const plansFor = context.getPlansForTest;
  assert.equal(plansFor(null).length, 0);
  assert.equal(plansFor({ available: false, availablePlanIds: [0], planPrices: { 0: 4000 } }).length, 0);
  assert.equal(plansFor({ available: true, availablePlanIds: [0] }).length, 0);
  const plans = plansFor({ available: true, availablePlanIds: [0], planPrices: { 0: 4000, 1: 10000 } });
  assert.equal(plans.length, 1);
  assert.equal(plans[0].id, 0);
  assert.equal(plans[0].price, '40.00');
  const wxml = fs.readFileSync(path.join(__dirname, '../miniprogram/package-user/pages/vip/vip.wxml'), 'utf8');
  assert.match(wxml, /class="pricing-panel" wx:if="\{\{paymentAvailable &amp;&amp; plans\.length\}\}"/);
  assert.match(wxml, /class="member-footer" wx:if="\{\{paymentAvailable &amp;&amp; plans\.length\}\}"/);
});

const ok = data => ({ code: 0, data });
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture() {
  const storage = { token: 'test-user' };
  const toasts = [], copied = [], navigated = [];
  return { storage, toasts, copied, navigated, wx: {
    getStorageSync: key => storage[key],
    setStorageSync: (key, value) => { storage[key] = value; },
    showToast: value => toasts.push(value), showLoading() {}, hideLoading() {},
    showModal: () => {}, stopPullDownRefresh: () => {},
    navigateTo: value => navigated.push(value.url), switchTab: value => navigated.push(value.url),
    setClipboardData: options => { copied.push(options.data); options.success(); },
    showActionSheet: options => options.success({ tapIndex: 0 })
  } };
}
function load(relative, mocks, wx, pageMode = false) {
  const filename = path.join(__dirname, '..', 'miniprogram', relative);
  const localRequire = createRequire(filename);
  let page;
  const context = {
    module: { exports: {} }, wx, setTimeout, clearTimeout,
    Date: mocks.__Date || Date,
    console: { warn() {}, log() {} },
    Page: value => { page = value; },
    getApp: () => ({ syncCustomTabBar() {} }),
    require: name => Object.prototype.hasOwnProperty.call(mocks, name) ? mocks[name] : localRequire(name)
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  if (!pageMode) return context.module.exports;
  page.data = JSON.parse(JSON.stringify(page.data));
  page.setData = function(patch, callback) {
    for (const [key, value] of Object.entries(patch)) {
      const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.');
      let target = this.data;
      for (const part of parts.slice(0, -1)) target = target[part];
      target[parts.at(-1)] = value;
    }
    if (callback) callback();
  };
  return page;
}
function queueHarness(api) {
  const f = fixture(), cached = [];
  const queue = load('utils/application-queue.js', {
    './api-v4.js': api, './job-progress.js': { mergeRemoteList: rows => cached.push(...rows) }
  }, f.wx);
  return { ...f, cached, queue };
}

function detailHarness(api) {
  const f = fixture();
  let authRevision = 0;
  const page = load('package-user/pages/application-detail/application-detail.js', {
    '../../../utils/api-v4.js': { ...api, getApplicationWorkspace: api.getApplicationWorkspace || api.getApplicationDetail,
      getApplicationInterviewReports: api.getApplicationInterviewReports || (async () => ({ code: 0, data: { reports: [] } })) },
    '../../../utils/job-progress.js': { currentOwnerScope: () => String(f.storage.ownerScope || f.storage.token || '') },
    '../../../utils/auth-session.js': { revision: () => authRevision }
  }, f.wx, true);
  page.data.id = '41';
  const input = (field, value) => page.onPlanInput({ currentTarget: { dataset: { field } }, detail: { value } });
  return { ...f, page, input, changeAuthRevision: () => { authRevision += 1; } };
}

test('confirmed applications keep the user checklist editable while resume binding stays frozen', async () => {
  let item = null;
  const posted = [];
  const app = { id: 41, status: 'applied', resumeVersionId: 12, resumeSelectionVersion: 3, resumeSelectionAvailable: true,
    submissionConfirmation: { available: true, confirmed: true, eventId: 7 } };
  const h = detailHarness({
    getApplicationWorkspace: async () => ok({ application: app,
      resumeOptions: [{ resumeId: 1, resumeName: '主简历', versionId: 12, versionNo: 2 }],
      materialChecklist: { available: true, unavailableReason: null, items: item ? [item] : [] } }),
    saveApplicationResumeSelection: () => assert.fail('confirmed resume binding must be frozen'),
    addApplicationChecklistItem: async (_id, body) => {
      posted.push(body);
      if (posted.length === 1) throw new Error('timeout');
      item = { id: 99, label: body.label, state: 'needed', version: 1 };
      return ok({ item, changed: true });
    }
  });
  await h.page.loadDetail();
  assert.equal(h.page.data.resumeCanEdit, false);
  assert.equal(h.page.data.checklistCanEdit, true);
  h.page.onResumeChoiceChange({ detail: { value: 0 } });
  h.page.saveResumeSelection();
  h.page.onChecklistLabelInput({ detail: { value: '成绩单' } });
  await h.page.addChecklistItem();
  assert.match(h.page.data.checklistError, /timeout/);
  assert.equal(h.page.data.checklistLabel, '成绩单');
  await h.page.addChecklistItem();
  assert.equal(posted.length, 2);
  assert.equal(posted[0].clientKey, posted[1].clientKey);
  assert.equal(h.page.data.checklistItems[0].label, '成绩单');
  assert.equal(h.page.data.checklistLabel, '');
});

test('status history pages are cursor-loaded and do not duplicate timeline rows', async () => {
  const requests = [];
  const h = detailHarness({ getApplicationHistory: async (id, params) => {
    requests.push({ id, params });
    return ok({ list: [{ id: 1, toStatus: 'preparing' }, { id: 2, toStatus: 'applied' }], hasMore: false, nextCursor: null });
  } });
  h.page.data.history = [{ id: 2, toStatus: 'applied' }];
  h.page.data.historyHasMore = true;
  h.page.data.historyNextCursor = 3;
  await h.page.loadMoreHistory();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].id, '41');
  assert.equal(requests[0].params.beforeId, 3);
  assert.equal(requests[0].params.limit, 50);
  assert.deepEqual(h.page.data.history.map(item => item.id), [2, 1]);
  assert.equal(h.page.data.historyHasMore, false);
  assert.equal(h.page.data.historyNextCursor, null);
});

test('A→B→A ignores a late resume selection result and clears private readiness data', async () => {
  const pending = deferred();
  const h = detailHarness({ saveApplicationResumeSelection: () => pending.promise });
  h.page.data.application = { id: 41, resumeVersionId: 12, resumeSelectionVersion: 2, resumeSelectionAvailable: true };
  h.page.data.resumeChoices = [{ versionId: null }, { versionId: 12 }, { versionId: 13 }];
  h.page.data.resumeChoiceIndex = 2;
  h.page.data.resumeCanEdit = true;
  h.page.data.checklistItems = [{ id: 1, label: '私人材料', state: 'needed', version: 1 }];
  const saving = h.page.saveResumeSelection();
  h.storage.token = 'account-b'; h.changeAuthRevision();
  h.storage.token = 'test-user'; h.changeAuthRevision();
  h.page.clearStaleAccount();
  pending.resolve(ok({ changed: true, resumeVersionId: 13, resumeSelectionVersion: 3 }));
  await saving;
  assert.equal(h.page.data.application, null);
  assert.equal(h.page.data.checklistItems.length, 0);
  assert.equal(h.toasts.length, 0);
});

test('readiness writes stay disabled before migration and never toast success when refresh fails', async () => {
  let writes = 0;
  let failRefresh = false;
  const h = detailHarness({
    getApplicationWorkspace: async () => failRefresh ? Promise.reject(new Error('refresh offline')) : ok({
      application: { id: 41, resumeVersionId: null, resumeSelectionVersion: 0, resumeSelectionAvailable: false },
      materialChecklist: { available: false, unavailableReason: 'migration_pending', items: [] }
    }),
    addApplicationChecklistItem: async (_id, body) => { writes += 1; return ok({ item: { id: 1, label: body.label }, changed: true }); }
  });
  await h.page.loadDetail();
  h.page.onChecklistLabelInput({ detail: { value: '作品集' } });
  h.page.addChecklistItem();
  assert.equal(writes, 0);
  h.page.data.checklistCanEdit = true;
  failRefresh = true;
  await h.page.addChecklistItem();
  assert.equal(writes, 1);
  assert.equal(h.toasts.length, 0);
  assert.match(h.page.data.checklistError, /刷新失败/);
});

function campusFavoritesHarness(options = {}) {
  const f = fixture(), links = [], writes = [];
  let reminderGeneration = 0;
  f.wx.getStorageInfoSync = () => ({ keys: Object.keys(f.storage) });
  f.wx.removeStorageSync = key => { delete f.storage[key]; };
  f.wx.navigateTo = value => links.push(value.url);
  f.wx.showModal = value => value.success({ confirm: true });
  const reminders = {
    captureOperation: () => ({ owner: String(f.storage.ownerScope || f.storage.token || 'guest'), token: String(f.storage.token || ''), generation: reminderGeneration }),
    isOperationCurrent: operation => !!operation && operation.token && operation.generation === reminderGeneration &&
      operation.owner === String(f.storage.ownerScope || f.storage.token || 'guest') && operation.token === String(f.storage.token || ''),
    invalidateOperations: () => { reminderGeneration += 1; },
    fetchReminders: async () => options.reminders || [],
    isCampusReminderLocalEnabled: id => !!f.storage[`campusReminder:${f.storage.ownerScope || f.storage.token || 'guest'}:${id}`],
    listCampusReminderLocals: () => {
      const prefix = `campusReminder:${f.storage.ownerScope || f.storage.token || 'guest'}:`;
      return Object.keys(f.storage).filter(key => key.indexOf(prefix) === 0).map(key => ({
        targetId: key.slice(prefix.length), reminder: f.storage[key]
      }));
    },
    buildCampusDeadlineReminder: () => ({ reminderDate: '2026-10-25' }),
    upsertCampusDeadlineReminder: options.upsert || (async () => ({ localOnly: true })),
    saveCampusReminderLocal: (item, _row, operation) => {
      if (!reminders.isOperationCurrent(operation)) return false;
      f.storage[`campusReminder:${operation.owner}:${item.id}`] = { enabled: true };
      return true;
    },
    removeCampusReminderLocal: (id, operation) => {
      if (!reminders.isOperationCurrent(operation)) return false;
      delete f.storage[`campusReminder:${operation.owner}:${id}`];
      return true;
    },
    disableCampusDeadlineReminder: async () => null,
    upsertReminder() {}, disableReminder() {}
  };
  const favorites = load('utils/favorites.js', {
    './api-favorites.js': {
      list: options.list || (async () => ok([])),
      upsert: async value => { writes.push(value); return ok({}); },
      remove: async value => { writes.push(value); return ok({}); }
    },
    './reminders.js': reminders,
    './job-progress.js': { currentOwnerScope: () => String(f.storage.ownerScope || f.storage.token || '') },
    './api-campus.js': { getCampusDetail: async id => ok({ id, company: '历史校招公司', positionName: '校招工程师' }) }
  }, f.wx);
  const page = load('package-user/pages/favorites/favorites.js', {
    '../../../utils/favorites.js': favorites,
    '../../../utils/reminders.js': reminders,
    '../../../utils/feature-flags.js': {
      getCurrentFlags: () => ({ recruitment: false }), refreshFeatureFlags() {}, allowNavigation: () => true
    }
  }, f.wx, true);
  const detail = load('package-content/pages/campus-detail/campus-detail.js', {
    '../../../utils/favorites.js': favorites, '../../../utils/reminders.js': reminders
  }, f.wx, true);
  detail.refreshReminderCopy = () => {};
  return { ...f, favorites, page, detail, links, writes };
}

test('joining a campus follow also appears in favorites and cancelling reminders preserves it', async () => {
  const h = campusFavoritesHarness();
  h.detail.data.detail = { id: 42, company: '校招企业', positionName: '数据分析', createdAt: '2020-01-01' };
  await h.detail.subscribeReminder();
  assert.equal(h.detail.data.isFavorited, true);
  assert.equal(h.favorites.getList('campus').length, 1);
  assert.notEqual(h.favorites.getList('campus')[0].createdAt, '2020-01-01');
  await h.page.onShow();
  assert.equal(h.page.data.currentTab, 4);
  assert.equal(h.page.data.currentList[0].title, '校招企业');
  assert.equal(h.page.data.totalFavorites, 1);
  h.page.goToDetail({ currentTarget: { dataset: { item: h.page.data.currentList[0] } } });
  assert.equal(h.links[0], '/package-content/pages/campus-detail/campus-detail?id=42');
  h.detail.cancelReminder();
  await Promise.resolve();
  assert.equal(h.favorites.getList('campus').length, 1);
  assert.equal(h.detail.data.isSubscribed, false);
  h.favorites.followCampus(h.detail.data.detail);
  assert.equal(h.favorites.getList('campus').length, 1);
});

test('failed campus reminder requests do not claim that a follow was saved', async () => {
  const h = campusFavoritesHarness({ upsert: async () => { throw new Error('offline'); } });
  h.detail.data.detail = { id: 43, company: '离线校招企业' };
  await h.detail.subscribeReminder();
  assert.equal(h.favorites.isFavorited('campus', 43), false);
  assert.equal(h.detail.data.isSubscribed, false);
  assert.equal(h.storage['campusReminder:test-user:43'], undefined);
  assert.equal(h.toasts.at(-1).title, '保存失败，请重试');
});

test('delayed campus reminder completion is discarded after account switch and guests cannot save private follows', async () => {
  const wait = deferred();
  const h = campusFavoritesHarness({ upsert: () => wait.promise });
  h.detail.data.detail = { id: 44, company: '账号 A 校招' };
  const pending = h.detail.subscribeReminder();
  h.storage.ownerScope = 'owner-b';
  h.storage.token = 'owner-b-token';
  wait.resolve({ localOnly: true });
  await pending;
  assert.equal(h.storage['campusReminder:test-user:44'], undefined);
  assert.equal(h.storage['campusReminder:owner-b:44'], undefined);
  assert.equal(h.favorites.isFavorited('campus', 44), false);

  h.storage.ownerScope = '';
  h.storage.token = '';
  h.detail.data.detail = { id: 45, company: '游客校招' };
  await h.detail.subscribeReminder();
  assert.equal(h.storage['campusReminder:guest:45'], undefined);
  assert.equal(h.favorites.isFavorited('campus', 45), false);
});

test('owner-scoped campus follows import once from local and remote reminders without reviving removed favorites', async () => {
  const h = campusFavoritesHarness({ reminders: [
    { sourceType: 'campus_schedule', reminderType: 'campus_deadline', targetId: '12', enabled: true, company: '云端校招', createdAt: '2026-09-20 09:00:00' },
    { sourceType: 'campus_schedule', reminderType: 'campus_deadline', targetId: '13', enabled: false },
    { sourceType: 'campus_schedule', reminderType: 'campus_deadline', targetId: '14', enabled: true }
  ], list: async () => ok([{ type: 'campus', targetId: '14', deleted: true }]) });
  h.storage['campusReminder:test-user:11'] = { enabled: true };
  h.storage['campusReminder:test-user:13'] = { enabled: true };
  await h.page.onShow();
  assert.deepEqual(Array.from(h.favorites.getList('campus'), item => item.targetId).sort(), ['11', '12']);
  assert.equal(h.favorites.getList('campus').find(item => item.targetId === '11').title, '历史校招公司');
  h.page.removeFavorite({ currentTarget: { dataset: { type: 'campus', targetid: '11' } } });
  await h.favorites.syncCampusFollows();
  assert.equal(h.favorites.isFavorited('campus', '11'), false);
  assert.equal(h.favorites.isFavorited('campus', '14'), false);
  assert.equal(h.favorites.getList('campus').length, 1);
});

test('campus reminder imports and linked markers never cross account owners', async () => {
  const h = campusFavoritesHarness();
  h.storage['campusReminder:test-user:21'] = { enabled: true, updatedAt: 1 };
  await h.page.onShow();
  assert.equal(h.favorites.isFavorited('campus', '21'), true);
  assert.ok(h.storage['campusFollowFavoriteLinkedV1:test-user']['21']);

  h.storage.ownerScope = 'other-user';
  h.storage.token = 'other-token';
  await h.page.onShow();
  assert.equal(h.favorites.isFavorited('campus', '21'), false);
  assert.equal(h.storage['campusFollowFavoriteLinkedV1:other-user'], undefined);

  h.storage['campusReminder:other-user:21'] = { enabled: true, updatedAt: 2 };
  await h.page.onShow();
  assert.equal(h.favorites.isFavorited('campus', '21'), true);
  assert.ok(h.storage['campusFollowFavoriteLinkedV1:other-user']['21']);
});

test('profile ignores user and favorite refreshes that finish after account change or page hide', async () => {
  const f = fixture();
  const firstUserWait = deferred();
  const hiddenUserWait = deferred();
  const userWaits = [firstUserWait, hiddenUserWait];
  const favoriteWait = deferred();
  const persisted = [];
  f.storage.ownerScope = 'owner-a';
  const page = load('pages/profile/profile.js', {
    '../../utils/api.js': {
      getUserProfile: () => userWaits.shift().promise,
      persistUserSession: user => persisted.push(user)
    },
    '../../utils/favorites.js': {
      syncFromServer: () => favoriteWait.promise,
      getAll: () => ({ job: [] }), getCount: () => 0
    },
    '../../utils/feature-flags.js': { getCurrentFlags: () => ({}), refreshFeatureFlags() {}, allowNavigation: () => true },
    '../../utils/vip.js': { getInfo: () => ({ isVip: false }) },
    '../../utils/owner-storage.js': {
      capture: () => f.storage.ownerScope || 'guest',
      isCurrent: scope => scope === (f.storage.ownerScope || 'guest')
    }
  }, f.wx, true);
  page._profileVisible = true;
  const userRequest = page.refreshUserSession();
  const statsRequest = page._refreshRemoteStats();
  f.storage.ownerScope = 'owner-b';
  f.storage.token = 'owner-b-token';
  firstUserWait.resolve(ok({ id: 7, nickName: '旧账号' }));
  favoriteWait.resolve({});
  await Promise.all([userRequest, statsRequest]);
  assert.deepEqual(persisted, []);

  page._profileVisible = true;
  const hiddenRequest = page.refreshUserSession();
  page.onHide();
  hiddenUserWait.resolve(ok({ id: 8, nickName: '已离开页面' }));
  await hiddenRequest;
  assert.equal(page._profileVisible, false);
  assert.deepEqual(persisted, []);
});

test('favorites default to a populated category but background sync preserves an explicit tab selection', async () => {
  const response = deferred();
  const h = campusFavoritesHarness({ list: () => response.promise });
  h.storage.jobFavoritesVisibleOwner = 'test-user';
  h.storage.userFavorites = { campus: [{ targetId: '1', title: '已收藏校招', createdAt: '2026-09-20 09:00:00' }] };
  const showing = h.page.onShow();
  assert.equal(h.page.data.currentTab, 4);
  assert.equal(h.page.data.currentList.length, 1);
  h.page.switchTab({ currentTarget: { dataset: { index: '1' } } });
  response.resolve(ok([]));
  await showing;
  assert.equal(h.page.data.currentTab, 1);
  assert.equal(h.page.data.currentList.length, 0);
  h.page.switchTab({ currentTarget: { dataset: { index: '4' } } });
  assert.equal(h.page.data.currentList[0].targetId, '1');
});

test('resource hub exposes content assets and assessment purchases without category tabs', () => {
  const h = fixture();
  const page = load('pages/resources/resources.js', {
    '../../utils/navigation.js': { safeNavigateTo() {} }, '../../utils/feature-flags.js': { allowNavigation: () => true }
  }, h.wx, true);
  page.onLoad({});
  const source = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/resources/resources.js'), 'utf8');
  const wxml = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/resources/resources.wxml'), 'utf8');
  assert.doesNotMatch(source, /AI 求职规划|Offer 对比|薪酬查询|Networking Copilot/);
  assert.match(source, /\[item\.title, item\.desc\]\.concat\(item\.tags \|\| \[\]\)/);
  assert.equal(page.data.assets.length, 10);
  assert.deepEqual(Array.from(page.data.listAssets, item => item.id), ['assessment-products', 'agency', 'algorithm', 'companies', 'news', 'favorite']);
  assert.match(wxml, /bindtap="openPurchases"[^>]*aria-label="查看我的已购测评资料"/);
  assert.doesNotMatch(wxml, /category-scroll|type-scroll/);
});

test('resource search is local while target context is only passed into real destinations', () => {
  const h = fixture(), routes = [];
  const page = load('pages/resources/resources.js', {
    '../../utils/navigation.js': { safeNavigateTo: url => routes.push(url) },
    '../../utils/feature-flags.js': { allowNavigation: url => url !== '/blocked' }
  }, h.wx, true);
  page.onLoad({ category: 'interview', company: 'Amazon', role: 'Data', type: 'behavior' });
  assert.equal(page.data.assets.length, 10);
  assert.ok(page.data.assets.some(item => item.id === 'experience'));
  page.openAsset({ currentTarget: { dataset: { id: 'experience' } } });
  assert.match(routes[0], /^\/pages\/experiences\/experiences\?/);
  assert.match(routes[0], /company=Amazon/);
  assert.match(routes[0], /role=Data/);
  assert.match(routes[0], /type=behavior/);
  page.openAsset({ currentTarget: { dataset: { id: 'algorithm' } } });
  assert.match(routes[1], /type=algorithm/);
  assert.doesNotMatch(routes[1], /type=behavior/);
  page.onKeyword({ detail: { value: 'STAR' } });
  assert.deepEqual(Array.from(page.data.assets, item => item.id), ['star']);
  assert.deepEqual(Array.from(page.data.listAssets, item => item.id), ['star']);
});

test('restored resources route uses switchTab through shared navigation', () => {
  const calls = [], h = fixture();
  h.wx.switchTab = options => calls.push(['switchTab', options.url]);
  h.wx.navigateTo = options => calls.push(['navigateTo', options.url]);
  const navigation = load('utils/navigation.js', {}, h.wx);
  navigation.safeNavigateTo('/pages/resources/resources');
  assert.deepEqual(calls, [['switchTab', '/pages/resources/resources']]);
});

test('detail request finishing after an account change clears old user data and exits loading', async () => {
  const wait = deferred();
  const h = detailHarness({ getApplicationDetail: () => wait.promise });
  const request = h.page.loadDetail();
  h.input('notes', '旧账号草稿');
  h.storage.token = 'another-user';
  wait.resolve(ok({ application: { id: 41, notes: '旧账号数据' } }));
  await request;
  assert.equal(h.page.data.loading, false);
  assert.equal(h.page.data.application, null);
  assert.equal(h.page.data.planDirty, false);
  assert.equal(h.page.data.planForm.notes, '');
  assert.ok(h.page.data.loadError);
});

test('application detail exposes load retry and ignores stale responses without losing draft notes', async () => {
  const slow = deferred(); let call = 0;
  const h = detailHarness({ getApplicationDetail() {
    call++;
    if (call === 1) return Promise.reject(new Error('网络不可用'));
    if (call === 2) return slow.promise;
    return Promise.resolve(ok({ application: { id: 41, notes: '云端备注', status: 'oa' } }));
  } });
  await h.page.loadDetail();
  assert.equal(h.page.data.loading, false);
  assert.equal(h.page.data.loadError, '网络不可用');
  const oldLoad = h.page.loadDetail();
  h.input('notes', '尚未保存的备注');
  await h.page.loadDetail();
  slow.resolve(ok({ application: { id: 41, notes: '旧值', status: 'applied' } }));
  await oldLoad;
  assert.equal(h.page.data.application.status, 'oa');
  assert.equal(h.page.data.planForm.notes, '尚未保存的备注');
  assert.equal(h.page.data.loadError, '');
});

test('follow-up save only patches edited fields and keeps failed or newer drafts for retry', async () => {
  const wait = deferred(), writes = [];
  const h = detailHarness({ updateApplication(id, payload) {
    writes.push(payload);
    return writes.length === 1 ? wait.promise : Promise.resolve(ok({ id: 41, ...payload }));
  } });
  h.page.data.application = { id: 41, status: 'oa' };
  h.page.data.planForm.interviewTime = '2026-09-20T14:30:00+08:00';
  h.page.data.planForm.notes = '长'.repeat(500);
  h.input('nextAction', '准备材料');
  const saving = h.page.savePlan();
  await h.page.savePlan();
  assert.equal(writes.length, 1);
  assert.deepEqual(Object.keys(writes[0]), ['nextAction']);
  wait.resolve({ code: -1, message: '保存失败' });
  await saving;
  assert.equal(h.page.data.savingPlan, false);
  assert.equal(h.page.data.planDirty, true);
  assert.equal(h.page.data.planForm.nextAction, '准备材料');
  assert.equal(h.toasts.at(-1).icon, 'none');
  await h.page.savePlan();
  assert.equal(h.page.data.planDirty, false);
  assert.equal(h.page.data.planForm.notes.length, 500);
  assert.equal(h.page.data.planForm.interviewTime, '2026-09-20T14:30:00+08:00');
});

test('follow-up edits during save remain dirty and clearing a date sends an explicit empty field', async () => {
  const wait = deferred(), writes = [];
  const h = detailHarness({ updateApplication(id, payload) {
    writes.push(payload);
    return writes.length === 1 ? wait.promise : Promise.resolve(ok({ id: 41, ...payload }));
  } });
  h.input('notes', '第一版');
  const saving = h.page.savePlan();
  h.input('notes', '第二版');
  wait.resolve(ok({ id: 41, notes: '第一版' }));
  await saving;
  assert.equal(h.page.data.planDirty, true);
  assert.equal(h.page.data.planForm.notes, '第二版');
  h.page.clearPlanDate({ currentTarget: { dataset: { field: 'deadline' } } });
  await h.page.savePlan();
  assert.equal(writes[1].deadline, '');
  assert.equal(writes[1].notes, '第二版');
  assert.equal(h.page.data.planDirty, false);
});

test('detail status conflict carries the server revision and refreshes without overwriting unsaved notes', async () => {
  let submitted, modalPromise;
  const h = detailHarness({
    updateApplicationStatus(id, payload) {
      submitted = payload;
      return Promise.reject(Object.assign(new Error('版本冲突'), { statusCode: 409 }));
    },
    getApplicationDetail: async () => ok({ application: { id: 41, status: 'offer', historyId: 8, notes: '服务器备注' } })
  });
  h.wx.showModal = opts => { modalPromise = opts.success({ confirm: true }); };
  h.page.data.application = { id: 41, status: 'applied', historyId: 7 };
  h.page.data.allowedTransitions = [{ value: 'oa', label: 'OA' }];
  h.input('notes', '未保存的面试记录');
  h.page.changeStatus({ currentTarget: { dataset: { status: 'oa', label: 'OA' } } });
  await modalPromise;
  assert.equal(submitted.expectedState.status, 'applied');
  assert.equal(submitted.expectedState.historyId, 7);
  assert.equal(h.page.data.application.status, 'offer');
  assert.equal(h.page.data.planForm.notes, '未保存的面试记录');
  assert.equal(h.page.data.changingStatus, false);
  assert.equal(h.toasts.some(item => item.icon === 'success'), false);
});

test('application detail uses an explicit forward status action and never auto-withdraws terminal states', async () => {
  const responses = [
    ok({ application: { id: 41, status: 'preparing', historyId: 2 }, tasks: [], allowedTransitions: [
      { value: 'interested', label: '感兴趣' }, { value: 'applied', label: '已申请' }
    ] }),
    ok({ application: { id: 41, status: 'offer', historyId: 3 }, tasks: [], allowedTransitions: [
      { value: 'withdrawn', label: '已撤回' }
    ] })
  ];
  const h = detailHarness({ getApplicationDetail: async () => responses.shift() });
  await h.page.loadDetail();
  assert.equal(h.page.data.primaryAction.action, 'status');
  assert.equal(h.page.data.primaryAction.status, 'applied');
  await h.page.loadDetail();
  assert.equal(h.page.data.primaryAction.action, 'plan');
  assert.equal(h.page.data.primaryAction.status, undefined);
});

test('final submission confirmation is separate from applied status and retries with the same client key', async () => {
  const writes = [];
  const h = detailHarness({
    confirmApplicationSubmission: async (id, payload) => {
      writes.push({ id, payload });
      if (writes.length === 1) throw new Error('network timeout');
      return ok({ changed: true, submissionConfirmation: { available: true, confirmed: true, eventId: 1, confirmedAt: '2026-10-30T03:00:00Z' } });
    },
    getApplicationDetail: async () => ok({ application: { id: 41, status: 'applied', historyId: 3, submissionConfirmation: { available: true, confirmed: true, eventId: 1, confirmedAt: '2026-10-30T03:00:00Z' } } })
  });
  h.page.data.application = { id: 41, status: 'preparing', historyId: 2, submissionConfirmation: { available: true, confirmed: false, eventId: 0, confirmedAt: null } };
  h.page.chooseSubmissionIntent({ currentTarget: { dataset: { action: 'confirm' } } });
  h.page.setSubmissionAcknowledged({ detail: { value: ['yes'] } });
  await h.page.submitSubmissionIntent();
  assert.equal(h.page.data.application.status, 'preparing');
  assert.match(h.page.data.submissionError, /network timeout/);
  assert.equal(h.page.data.submissionIntent, 'confirm');
  await h.page.submitSubmissionIntent();
  assert.equal(writes.length, 2);
  assert.equal(writes[0].id, '41');
  assert.equal(writes[0].payload.clientKey, writes[1].payload.clientKey);
  assert.match(writes[0].payload.clientKey, /^[A-Za-z0-9_-]{8,80}$/);
  assert.equal(writes[0].payload.expectedState.status, 'preparing');
  assert.equal(writes[0].payload.expectedState.historyId, 2);
  assert.equal(writes[0].payload.expectedSubmissionEventId, 0);
  assert.equal(writes[0].payload.channel, 'miniprogram');
  assert.equal(h.page.data.application.status, 'applied');
  assert.equal(h.page.data.application.submissionConfirmation.confirmed, true);
  assert.equal(h.page.data.submissionIntent, '');
});

test('old applied state and unavailable confirmation cannot claim final submission', async () => {
  const h = detailHarness({ confirmApplicationSubmission: () => assert.fail('unavailable confirmation must not write') });
  h.page.data.application = { id: 41, status: 'applied', historyId: 5, submissionConfirmation: { available: false, confirmed: false, eventId: 0, confirmedAt: null } };
  h.page.chooseSubmissionIntent({ currentTarget: { dataset: { action: 'confirm' } } });
  assert.equal(h.page.data.submissionIntent, '');
  await h.page.submitSubmissionIntent();
  assert.equal(h.page.data.application.submissionConfirmation.confirmed, false);
});

test('archived application keeps a real confirmation visible but disables new actions', async () => {
  const h = detailHarness({
    getApplicationDetail: async () => ok({ application: { id: 41, status: 'withdrawn', historyId: 9, submissionConfirmation: { available: false, unavailableReason: 'archived', confirmed: true, eventId: 3, confirmedAt: '2026-10-30T03:00:00Z' } } }),
    revokeApplicationSubmission: () => assert.fail('archived confirmation must be read only')
  });
  await h.page.loadDetail();
  assert.equal(h.page.data.application.submissionConfirmation.confirmed, true);
  assert.ok(h.page.data.submissionConfirmedAt);
  assert.match(h.page.data.submissionUnavailableText, /归档/);
  h.page.chooseSubmissionIntent({ currentTarget: { dataset: { action: 'revoke' } } });
  assert.equal(h.page.data.submissionIntent, '');
});

test('refreshing a changed confirmation invalidates an old acknowledgment and retry key', async () => {
  const h = detailHarness({ getApplicationDetail: async () => ok({ application: { id: 41, status: 'applied', historyId: 3, submissionConfirmation: { available: true, confirmed: true, eventId: 1, confirmedAt: '2026-10-30T03:00:00Z' } } }) });
  h.page.data.application = { id: 41, status: 'preparing', historyId: 2, submissionConfirmation: { available: true, confirmed: false, eventId: 0, confirmedAt: null } };
  h.page.chooseSubmissionIntent({ currentTarget: { dataset: { action: 'confirm' } } });
  h.page.setSubmissionAcknowledged({ detail: { value: ['yes'] } });
  h.page._submissionPending = { action: 'confirm', clientKey: 'pending_key_123' };
  await h.page.loadDetail();
  assert.equal(h.page.data.submissionIntent, '');
  assert.equal(h.page.data.submissionAcknowledged, false);
  assert.equal(h.page._submissionPending, null);
});

test('revoking an erroneous confirmation leaves the application status intact', async () => {
  let submitted;
  const h = detailHarness({
    revokeApplicationSubmission: async (id, payload) => { submitted = payload; return ok({ changed: true, submissionConfirmation: { available: true, confirmed: false, eventId: 2, confirmedAt: null } }); },
    getApplicationDetail: async () => ok({ application: { id: 41, status: 'applied', historyId: 5, submissionConfirmation: { available: true, confirmed: false, eventId: 2, confirmedAt: null } } })
  });
  h.page.data.application = { id: 41, status: 'applied', historyId: 5, submissionConfirmation: { available: true, confirmed: true, eventId: 1, confirmedAt: '2026-10-30T03:00:00Z' } };
  h.page.chooseSubmissionIntent({ currentTarget: { dataset: { action: 'revoke' } } });
  h.page.setSubmissionAcknowledged({ detail: { value: ['yes'] } });
  await h.page.submitSubmissionIntent();
  assert.equal(submitted.expectedSubmissionEventId, 1);
  assert.equal(submitted.expectedState.status, 'applied');
  assert.equal(h.page.data.application.status, 'applied');
  assert.equal(h.page.data.application.submissionConfirmation.confirmed, false);
});

test('a successful HTTP response with a newer opposite confirmation does not claim success', async () => {
  const h = detailHarness({
    confirmApplicationSubmission: async () => ok({ changed: false, submissionConfirmation: { available: true, confirmed: false, eventId: 2, confirmedAt: null } }),
    getApplicationDetail: async () => ok({ application: { id: 41, status: 'applied', historyId: 3, submissionConfirmation: { available: true, confirmed: false, eventId: 2, confirmedAt: null } } })
  });
  h.page.data.application = { id: 41, status: 'preparing', historyId: 2, submissionConfirmation: { available: true, confirmed: false, eventId: 0, confirmedAt: null } };
  h.page.chooseSubmissionIntent({ currentTarget: { dataset: { action: 'confirm' } } });
  h.page.setSubmissionAcknowledged({ detail: { value: ['yes'] } });
  await h.page.submitSubmissionIntent();
  assert.equal(h.page.data.application.submissionConfirmation.confirmed, false);
  assert.match(h.page.data.submissionError, /其他端变化/);
  assert.equal(h.toasts.some(item => item.title === '已记录最终提交'), false);
});

test('A to B to A switch discards a delayed submission response and its retry key', async () => {
  const wait = deferred();
  const h = detailHarness({ confirmApplicationSubmission: () => wait.promise });
  h.page.data.application = { id: 41, status: 'preparing', historyId: 2, submissionConfirmation: { available: true, confirmed: false, eventId: 0, confirmedAt: null } };
  h.page.chooseSubmissionIntent({ currentTarget: { dataset: { action: 'confirm' } } });
  h.page.setSubmissionAcknowledged({ detail: { value: ['yes'] } });
  const submitting = h.page.submitSubmissionIntent();
  h.storage.token = 'other-user'; h.changeAuthRevision();
  h.storage.token = 'test-user'; h.changeAuthRevision();
  wait.resolve(ok({ changed: true, submissionConfirmation: { available: true, confirmed: true, eventId: 1, confirmedAt: '2026-10-30T03:00:00Z' } }));
  await submitting;
  assert.equal(h.page.data.application, null);
  assert.equal(h.page._submissionPending, null);
  assert.equal(h.toasts.some(item => item.title === '已记录最终提交'), false);
});

test('application detail refreshes for a new owner and ignores stale task and navigation responses', async () => {
  const task = deferred();
  const spaces = deferred();
  const h = detailHarness({
    getApplicationDetail: async () => ok({ application: { id: 41, status: 'preparing', notes: 'new owner' }, tasks: [] }),
    addApplicationTask: () => task.promise,
    getInterviewSpaces: () => spaces.promise
  });
  h.page._ownerToken = 'test-user';
  h.page.data.application = { id: 41, status: 'offer', notes: 'old owner' };
  h.storage.token = 'new-owner';
  h.page.onShow();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.page.data.application.notes, 'new owner');

  h.page.data.taskForm.title = '新任务';
  const saving = h.page.addTask();
  h.page.openInterviewSpace();
  h.storage.token = 'third-owner';
  task.resolve(ok({ id: 9 }));
  spaces.resolve(ok([{ id: 2, applicationId: 41 }]));
  await saving;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.page.data.taskForm.title, '新任务');
  assert.equal(h.toasts.some(item => item.icon === 'success'), false);
  assert.deepEqual(h.navigated, []);
  assert.equal(h.page.data.application, null);
  assert.equal(h.page.data.addingTask, false);
  assert.equal(h.page.data.addingContact, false);
  assert.equal(h.page.data.updatingTaskId, '');
  assert.equal(h.page.data.savingPlan, false);
  assert.equal(h.page.data.changingStatus, false);
});

test('application detail keeps visible data on same-owner token rotation but always releases mutation busy state', async () => {
  const task = deferred();
  const h = detailHarness({ addApplicationTask: () => task.promise });
  h.storage.ownerScope = 'stable-user-41';
  h.page._ownerScope = 'stable-user-41';
  h.page.data.application = { id: 41, status: 'preparing', notes: 'keep me' };
  h.page.data.taskForm.title = 'pending task';
  const saving = h.page.addTask();
  h.storage.token = 'rotated-token';
  task.resolve(ok({ id: 9 }));
  await saving;
  assert.equal(h.page.data.application.notes, 'keep me');
  assert.equal(h.page.data.addingTask, false);
  assert.equal(h.page.data.taskForm.title, 'pending task');
});

test('Shanghai business dates are device-timezone independent around midnight and leap day', () => {
  const { shanghaiDayKey, shanghaiDayDistance, calendarDayParts } = require('../miniprogram/utils/date-time');
  assert.equal(shanghaiDayKey(Date.UTC(2026, 9, 8, 15, 59, 59)), '2026-10-08');
  assert.equal(shanghaiDayKey(Date.UTC(2026, 9, 8, 16, 0, 0)), '2026-10-09');
  assert.equal(shanghaiDayDistance('2026-10-09', Date.UTC(2026, 9, 8, 15, 59, 59)), 1);
  assert.equal(shanghaiDayDistance('2026-10-09', Date.UTC(2026, 9, 8, 16, 0, 0)), 0);
  assert.equal(shanghaiDayDistance('2028-02-29', Date.UTC(2028, 1, 28, 16, 0, 0)), 0);
  assert.deepEqual(calendarDayParts('2026-10-08T16:00:00Z'), { year: 2026, month: 10, day: 9 });
  assert.deepEqual(calendarDayParts('2026-10-09 23:30:00'), { year: 2026, month: 10, day: 9 });
  assert.deepEqual(calendarDayParts('2026-10-09T23:30:00'), { year: 2026, month: 10, day: 9 });
  const helper = path.join(__dirname, '../miniprogram/utils/date-time.js');
  const output = execFileSync(process.execPath, ['-e', `const d=require(${JSON.stringify(helper)});process.stdout.write(JSON.stringify([d.calendarDayParts('2026-10-09 23:30:00'),d.calendarDayParts('2026-10-09T23:30:00')]))`], {
    env: { ...process.env, TZ: 'America/Los_Angeles' }, encoding: 'utf8'
  });
  assert.deepEqual(JSON.parse(output), [{ year: 2026, month: 10, day: 9 }, { year: 2026, month: 10, day: 9 }]);
  const board = buildApplicationWorkbench([{ id: 1, status: 'preparing', deadline: '2026-10-09' }], new Date(Date.UTC(2026, 9, 8, 16)));
  assert.equal(board.applications[0].deadlineLabel, '今天截止');
});

test('mobile state never treats saved, preparing or Chinese pending labels as submitted', () => {
  for (const status of ['interested', 'collected', 'preparing', 'online_apply', '待投递', '网申中']) {
    assert.equal(applicationState({ status }).isApplied, false, status);
    assert.equal(presentJob({ applicationStatus: status, isApplied: true }).isApplied, false, status);
  }
  for (const status of ['applied', 'oa', 'phone_screen', 'interview_1', 'final', 'offer']) {
    assert.equal(applicationState({ status }).isApplied, true, status);
  }
  assert.equal(presentJob({ applicationStatus: 'preparing', applyUrl: 'https://example.com' }).applyButtonText, '查看进度');
  assert.equal(presentJob({ applicationStatus: 'withdrawn', applyUrl: 'https://example.com' }).applyButtonText, '查看进度');
});

test('OA is a distinct mobile group even when the server board groups it under applied', () => {
  const board = buildApplicationWorkbench([
    { id: 1, status: 'oa', group: 'applied' }, { id: 2, status: 'applied', group: 'applied' },
    { id: 3, status: 'preparing', group: 'preparing' }
  ]);
  assert.equal(board.counts.oa, 1);
  assert.equal(board.counts.applied, 1);
  assert.equal(board.activeCount, 3);
  assert.equal(board.applications.find(item => item.id === 3).statusText, '待投递');
});

test('queue deduplicates simultaneous taps and caches only confirmed server applications', async () => {
  const wait = deferred(); let calls = 0;
  const h = queueHarness({ createApplication(payload) { calls++; assert.equal(payload.status, 'preparing'); return wait.promise; } });
  const first = h.queue.queueJob({ id: 'job-a', title: 'Engineer' });
  const second = h.queue.queueJob({ id: 'job-a' });
  assert.equal(first, second);
  assert.equal(calls, 1);
  assert.equal(h.cached.length, 0);
  wait.resolve(ok({ id: 12, jobId: 'job-a', status: 'preparing' }));
  await first;
  assert.equal(h.cached.length, 1);
  assert.equal(h.cached[0].status, 'preparing');
});

test('queue recovers a duplicate response without downgrading an interview or Offer', async () => {
  for (const status of ['interview_1', 'offer', 'withdrawn']) {
    const h = queueHarness({
      createApplication: async () => { throw Object.assign(new Error('duplicate'), { statusCode: 409, body: { data: { applicationId: 9 } } }); },
      getApplicationDetail: async () => ok({ application: { id: 9, status } }),
      updateApplicationStatus: () => assert.fail('advanced status must not be overwritten')
    });
    assert.equal((await h.queue.queueJob({ id: 'job-a' })).status, status);
  }
});

test('queue promotes only interested to preparing using the server revision', async () => {
  const h = queueHarness({
    createApplication: async () => { throw Object.assign(new Error('duplicate'), { statusCode: 409, body: { data: { applicationId: 9 } } }); },
    getApplicationDetail: async () => ok({ application: { id: 9, jobId: 'a', status: 'interested', historyId: 4 } }),
    updateApplicationStatus: async (id, payload) => {
      assert.equal(id, 9);
      assert.equal(payload.expectedState.status, 'interested');
      assert.equal(payload.expectedState.historyId, 4);
      return ok({ id, status: payload.status, historyId: 5 });
    }
  });
  assert.equal((await h.queue.queueJob({ id: 'a' })).status, 'preparing');
  assert.equal(h.cached[0].jobId, 'a');
});

test('queue rejects business failures and account changes without marking local success', async () => {
  const h = queueHarness({ createApplication: async () => ({ code: -1, message: 'failure' }) });
  await assert.rejects(h.queue.queueJob({ id: 'a' }));
  assert.equal(h.cached.length, 0);
  const wait = deferred();
  const other = queueHarness({ createApplication: () => wait.promise });
  const saving = other.queue.queueJob({ id: 'a' });
  other.storage.token = 'another-user';
  wait.resolve(ok({ id: 1, status: 'preparing' }));
  await assert.rejects(saving, /登录状态/);
  assert.equal(other.cached.length, 0);
});

test('local application cache survives same-user token rotation but hides legacy and other-account data', () => {
  const f = fixture();
  const progress = load('utils/job-progress.js', {
    './api-client.js': {},
    './application-state.js': require('../miniprogram/utils/application-state')
  }, f.wx);
  // First write uses the legacy opaque-token partition.
  f.storage.token = 'opaque-token-a';
  progress.mergeRemoteList([{ id: 1, jobId: 'a', status: 'preparing', company: 'A' }]);
  assert.deepEqual(Array.from(progress.getList(), item => item.id), ['1']);
  // Once a stable stored identity exists, the old partition is migrated.
  f.storage.userInfo = { id: 77 };
  assert.deepEqual(Array.from(progress.getList(), item => item.id), ['1']);
  f.storage.token = 'rotated-opaque-token';
  assert.deepEqual(Array.from(progress.getList(), item => item.id), ['1']);
  const jwt = userId => {
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    return encode({ alg: 'none' }) + '.' + encode({ userId }) + '.signature';
  };
  // JWT identity wins over a stale stored profile during an account switch.
  f.storage.token = jwt(88);
  assert.equal(progress.getList().length, 0);
  progress.mergeRemoteList([{ id: 2, jobId: 'b', status: 'offer', company: 'B' }]);
  assert.deepEqual(Array.from(progress.getList(), item => item.id), ['2']);
  f.storage.token = jwt(77);
  assert.deepEqual(Array.from(progress.getList(), item => item.id), ['1']);
  // Logging out never exposes historical unscoped records.
  f.storage.localApplications.push({ id: 99, jobId: 'legacy', status: 'applied' });
  delete f.storage.token;
  assert.equal(progress.getList().length, 0);
});

test('delayed progress sync responses never cross owners, while same-owner token rotation may merge', async () => {
  const f = fixture();
  const jwt = (userId, nonce) => {
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    return encode({ alg: 'none', nonce }) + '.' + encode({ userId }) + '.signature';
  };
  let listWait = deferred();
  const recordWait = deferred();
  const progress = load('utils/job-progress.js', {
    './api-client.js': {
      request: () => listWait.promise,
      post: () => recordWait.promise,
      put: () => recordWait.promise
    },
    './application-state.js': require('../miniprogram/utils/application-state')
  }, f.wx);

  f.storage.token = jwt(101, 'a');
  const oldList = progress.syncFromServer();
  const oldRecord = progress.syncRecordRemote({ id: 'local_a', sourceJobId: 'job-a', company: 'A private', status: 'preparing' });
  f.storage.token = jwt(202, 'b');
  progress.mergeRemoteList([{ id: 202, jobId: 'job-b', company: 'B visible', status: 'offer' }]);
  listWait.resolve(ok([{ id: 101, jobId: 'job-a', company: 'A remote', status: 'applied' }]));
  recordWait.resolve(ok({ id: 102, jobId: 'job-a-2', company: 'A single', status: 'oa' }));
  assert.equal((await oldList).length, 0);
  assert.equal(await oldRecord, null);
  assert.deepEqual(Array.from(progress.getList(), item => item.company), ['B visible']);

  listWait = deferred();
  const rotatedList = progress.syncFromServer();
  f.storage.token = jwt(202, 'rotated');
  listWait.resolve(ok([{ id: 203, jobId: 'job-b-2', company: 'B rotated', status: 'preparing' }]));
  await rotatedList;
  assert.deepEqual(Array.from(progress.getList(), item => item.company).sort(), ['B rotated', 'B visible']);
});

test('favorites clear A local outbox before B sync, preserve same-owner rotations, and become visible after sync', async () => {
  const f = fixture();
  const writes = [], lists = [];
  f.storage.ownerScope = 'owner-a';
  const favorites = load('utils/favorites.js', {
    './job-progress.js': { currentOwnerScope: () => String(f.storage.ownerScope || '') },
    './api-favorites.js': {
      list: async () => { lists.push(f.storage.ownerScope); return ok([]); },
      upsert: async operation => { writes.push([f.storage.ownerScope, operation]); throw new Error('offline'); },
      remove: async operation => { writes.push([f.storage.ownerScope, operation]); throw new Error('offline'); }
    },
    './reminders.js': { upsertReminder() {}, disableReminder() {} }
  }, f.wx);
  await favorites.syncFromServer({ force: true });
  assert.equal(f.storage.jobFavoritesVisibleOwner, 'owner-a');
  assert.equal(favorites.add('job', { targetId: 'a-private', title: 'A only' }), true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(favorites.isFavorited('job', 'a-private'), true);
  assert.ok(Object.keys(f.storage.favoriteSyncOutboxV4).length);

  f.storage.token = 'rotated-a-token';
  assert.equal(favorites.isFavorited('job', 'a-private'), true, 'stable owner must survive token rotation');

  f.storage.ownerScope = 'owner-b';
  f.storage.token = 'token-b';
  await favorites.syncFromServer({ force: true });
  assert.equal(favorites.isFavorited('job', 'a-private'), false);
  assert.deepEqual(Object.keys(f.storage.favoriteSyncOutboxV4 || {}), []);
  assert.equal(writes.some(([owner, operation]) => owner === 'owner-b' && operation.targetId === 'a-private'), false);
  assert.equal(f.storage.jobFavoritesVisibleOwner, 'owner-b');
  assert.equal(favorites.add('job', { targetId: 'b-public', title: 'B job' }), true);
  assert.equal(favorites.isFavorited('job', 'b-public'), true);
  assert.deepEqual(lists, ['owner-a', 'owner-b']);
  f.storage.ownerScope = '';
  delete f.storage.token;
  assert.equal(favorites.getCount(), 0);
  assert.equal(favorites.getCount('job'), 0);
});

test('privacy cleanup invalidates an in-flight favorite sync before it can restore deleted data', async () => {
  const f = fixture();
  const wait = deferred();
  f.storage.ownerScope = 'owner-private';
  f.storage.token = 'token-private';
  const favorites = load('utils/favorites.js', {
    './job-progress.js': { currentOwnerScope: () => String(f.storage.ownerScope || '') },
    './api-favorites.js': {
      list: () => wait.promise,
      upsert: async () => ok({}), remove: async () => ok({})
    },
    './reminders.js': { upsertReminder() {}, disableReminder() {} }
  }, f.wx);
  const pending = favorites.syncFromServer({ force: true });
  favorites.clearCurrentOwner();
  wait.resolve(ok([{ type: 'company', targetId: 'private-company', title: '不应复活' }]));
  await pending;
  assert.equal(favorites.getCount(), 0);
  assert.equal(f.storage.jobFavoritesVisibleOwner, '');
  assert.equal(f.storage.userFavorites.company.length, 0);
});

function boardPage(api) {
  const f = fixture(), cached = [];
  const page = load('pages/applications/applications.js', {
    '../../utils/api-v4.js': api,
    '../../utils/job-progress.js': { getList: () => [], mergeRemoteList: rows => cached.push(...rows),
      currentOwnerScope: () => String(f.storage.token || '') },
    '../../behaviors/login-gate.js': {}, '../../utils/analytics.js': { track() {} }
  }, f.wx, true);
  return { ...f, page, cached };
}

test('quick status uses allowed transitions and expected revision, then updates OA filter counts', async () => {
  const h = boardPage({
    getApplicationDetail: async () => ok({ application: { id: 1, status: 'applied', historyId: 6, allowedTransitions: [{ value: 'oa', label: '在线测评' }] } }),
    updateApplicationStatus: async (id, payload) => {
      assert.equal(id, '1'); assert.equal(payload.expectedState.historyId, 6);
      return ok({ id: 1, status: 'oa', historyId: 7 });
    }
  });
  h.page.renderApplications([{ id: 1, status: 'applied', group: 'applied' }]);
  await h.page.quickStatus({ currentTarget: { dataset: { id: 1 } } });
  assert.equal(h.page.data.statistics.oa, 1);
  assert.equal(h.page.data.statistics.applied, 0);
  assert.equal(h.page.data.updatingId, '');
  h.page.applyFilter('oa');
  assert.equal(h.page.data.visibleApplications.length, 1);
});

test('quick status conflict preserves the old local state and allows retry', async () => {
  const h = boardPage({
    getApplicationDetail: async () => ok({ application: { id: 1, status: 'applied', historyId: 6, allowedTransitions: [{ value: 'oa', label: 'OA' }] } }),
    updateApplicationStatus: async () => { throw Object.assign(new Error('conflict'), { statusCode: 409 }); }
  });
  h.page.renderApplications([{ id: 1, status: 'applied' }]);
  await h.page.quickStatus({ currentTarget: { dataset: { id: 1 } } });
  assert.equal(h.page.data.applications[0].status, 'applied');
  assert.equal(h.cached.length, 0);
  assert.equal(h.page.data.updatingId, '');
  assert.match(h.toasts.at(-1).title, /刷新后重试/);
});

test('failed board loads are errors, and slower previous loads cannot replace refreshed results', async () => {
  const h = boardPage({ getApplicationBoard: async () => ({ _source: 'error', data: [] }) });
  await h.page.loadBoard();
  assert.ok(h.page.data.error);
  const slow = deferred(); let count = 0;
  const another = boardPage({ getApplicationBoard: () => ++count === 1 ? slow.promise : Promise.resolve(ok({ groups: { applied: [{ id: 2, status: 'oa' }] } })) });
  const first = another.page.loadBoard();
  await another.page.loadBoard(true);
  slow.resolve(ok({ groups: { preparing: [{ id: 1, status: 'preparing' }] } }));
  await first;
  assert.equal(another.page.data.applications[0].id, 2);
});

test('manual creation retains its draft and stable job id on uncertain failure', async () => {
  const ids = [];
  const h = boardPage({ createApplication: async payload => { ids.push(payload.jobId); throw new Error('network'); } });
  h.page.openCreate();
  h.page.data.createForm.company = 'Test company';
  h.page.data.createForm.jobTitle = 'Engineer';
  await h.page.submitCreate(); await h.page.submitCreate();
  assert.equal(ids[0], ids[1]);
  assert.equal(h.page.data.showCreate, true);
  assert.equal(h.page.data.createForm.company, 'Test company');
  assert.equal(h.cached.length, 0);
});

test('a 401 during board loading exits loading and shows login instead of stale data', async () => {
  const wait = deferred();
  const h = boardPage({ getApplicationBoard: () => wait.promise });
  const loading = h.page.loadBoard();
  delete h.storage.token;
  wait.resolve({ _source: 'unauthorized', data: [] });
  await loading;
  assert.equal(h.page.data.loading, false);
  assert.equal(h.page.data.loginRequired, true);
  assert.equal(h.page.data.applications.length, 0);
});

test('Hong Kong public jobs keep source lookup details and do not gain US OPT claims', () => {
  const f = fixture();
  const page = load('pages/jobs/jobs.js', {
    '../../utils/api.js': { normalizeCompanyLogo: () => '' },
    '../../utils/demo-data.js': { enabled: () => false },
    '../../behaviors/login-gate.js': {}
  }, f.wx, true);
  const [job] = page.formatJobData([{
    job_id: 'hkcsb_7001', job_title: 'Data Analyst', employer_name: 'HK Department',
    job_city: 'Hong Kong', job_country: 'HK', job_description: 'Work authorisation required. Analyse data.',
    job_salary_string: 'HK$30,000 per month', job_source_reference: '7001',
    job_source_url: 'https://csboa2.csb.gov.hk/csboa/jve/JVE_001_text.action', _source: 'hk_csb'
  }]);
  assert.equal(job.optFriendly, false);
  assert.equal(job.salary, 'HK$30,000 per month');
  assert.equal(job.sourceReference, '7001');
  assert.match(job.sourceUrl, /csboa2\.csb\.gov\.hk/);
  assert.equal(job.applyLink, '');
});

test('job list rejects stale searches and exposes a retry after a failed page without losing rows', async () => {
  const f = fixture(), old = deferred(), latest = deferred(); let calls = 0;
  const page = load('pages/jobs/jobs.js', {
    '../../utils/api.js': { getAggregatedJobs: () => ++calls === 1 ? old.promise : latest.promise },
    '../../utils/api-v4.js': { getJobs: async () => { throw new Error('network failure'); } },
    '../../utils/demo-data.js': { enabled: () => false },
    '../../behaviors/login-gate.js': {}
  }, f.wx, true);
  page.formatJobData = rows => rows;
  page.enrichJobLogos = rows => rows;
  page.loadJobs(true);
  page.data.searchKeyword = 'new search';
  page.loadJobs(true);
  latest.resolve({ data: [{ id: 'new' }], hasMore: true, total: 2 });
  await new Promise(resolve => setImmediate(resolve));
  old.resolve({ data: [{ id: 'old' }], hasMore: false });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.data.jobs[0].id, 'new');
  assert.equal(page.data.loading, false);
  // V4 分页失败仍保留已加载岗位，下一次重试页码不前进。
  page.data.matchMode = true;
  page.loadJobs(false);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.data.jobs[0].id, 'new');
  assert.equal(page.data.currentPage, 1);
  assert.ok(page.data.loadError);
});

test('personalized job results and favorite hearts fail closed when the account changes', async () => {
  const f = fixture();
  const old = deferred();
  const page = load('pages/jobs/jobs.js', {
    '../../utils/api.js': { getAggregatedJobs: async () => ({ data: [{ id: 'public' }], total: 1, hasMore: false }) },
    '../../utils/api-v4.js': { getJobs: () => old.promise },
    '../../utils/demo-data.js': { enabled: () => false },
    '../../utils/feature-flags.js': { guardRecruitmentPage: () => true },
    '../../utils/job-progress.js': { getJobState: () => ({ inProgress: false, isApplied: false }), currentOwnerScope: () => String(f.storage.token || '') },
    '../../behaviors/login-gate.js': {}
  }, f.wx, true);
  page.formatJobData = rows => rows;
  page.enrichJobLogos = rows => rows;
  f.storage.cachedJobsList = {
    key: page._jobsCacheKey(), t: Date.now(), total: 1, hasMore: false,
    items: [{ id: 'cached-old', isSaved: true, matchScore: 99, matchReason: 'cached profile' }]
  };
  page._favoritesBlocked = true;
  assert.equal(page.loadCachedOrMock(), true);
  assert.equal(page.data.jobs[0].isSaved, false);
  assert.equal(page.data.jobs[0].matchScore, 0);
  assert.equal(page.data.jobs[0].matchReason, '');
  page._ownerToken = 'test-user';
  page._favoritesBlocked = false;
  page.data.matchMode = true;
  page.data.jobs = [{ id: 'old', isSaved: true, matchScore: 99, matchReason: 'old profile' }];
  page.loadJobs(true);
  f.storage.token = 'new-owner';
  old.resolve(ok({ list: [{ id: 'private-old', match: { score: 100 } }], total: 1 }));
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.data.matchMode, false);
  assert.equal(page.data.jobs.some(item => item.id === 'private-old'), false);
  assert.equal(page.data.jobs.some(item => item.isSaved), false);
  assert.equal(page.data.jobs.some(item => item.matchScore || item.matchReason), false);
  delete f.storage.token;
  page.data.jobs = [{ id: 'public', isSaved: true }];
  page.onShow();
  assert.equal(page.data.jobs[0].isSaved, false);
});

test('job list and detail preserve visible account state across same-owner token rotation', () => {
  const listFixture = fixture();
  listFixture.storage.ownerScope = 'stable-owner';
  const listPage = load('pages/jobs/jobs.js', {
    '../../utils/api.js': { getAggregatedJobs: async () => ({ data: [], total: 0, hasMore: false }) },
    '../../utils/api-v4.js': {}, '../../utils/demo-data.js': { enabled: () => false },
    '../../utils/feature-flags.js': { guardRecruitmentPage: () => true },
    '../../utils/job-progress.js': { getJobState: () => ({ inProgress: false }), currentOwnerScope: () => listFixture.storage.ownerScope },
    '../../utils/favorites.js': { isFavorited: () => true, syncFromServer: async () => [], prepareOwner() {} },
    '../../behaviors/login-gate.js': {}
  }, listFixture.wx, true);
  listPage._ownerScope = 'stable-owner';
  listPage._ownerToken = 'old-token';
  listPage.data.jobs = [{ id: 'visible', isSaved: true, matchScore: 75 }];
  listFixture.storage.token = 'rotated-token';
  listPage.onShow();
  assert.equal(listPage.data.jobs[0].id, 'visible');
  assert.equal(listPage.data.jobs[0].matchScore, 75);
  listPage.onUnload();

  const detailFixture = fixture();
  detailFixture.storage.ownerScope = 'stable-owner';
  const detailPage = load('package-user/pages/job-detail/job-detail.js', {
    '../../../utils/api.js': {}, '../../../utils/api-v4.js': {},
    '../../../utils/demo-data.js': { enabled: () => false },
    '../../../utils/job-progress.js': { getByJobId: () => null, currentOwnerScope: () => detailFixture.storage.ownerScope },
    '../../../utils/favorites.js': { isFavorited: () => true, syncFromServer: async () => [], prepareOwner() {} },
    '../../../utils/analytics.js': { track() {} }, '../../../behaviors/login-gate.js': {},
    '../../../utils/application-queue.js': { queueJob: async () => ({}) }
  }, detailFixture.wx, true);
  detailPage._ownerScope = 'stable-owner';
  detailPage._ownerToken = 'old-token';
  detailPage.data.job = { id: 'visible', matchScore100: 75 };
  detailPage.data.isSaved = true;
  detailFixture.storage.token = 'rotated-token';
  detailPage.onShow();
  assert.equal(detailPage.data.job.id, 'visible');
  assert.equal(detailPage.data.isSaved, true);
});

test('a restarted deep link never restores another owner match score from an unowned job snapshot', async () => {
  const f = fixture();
  f.storage.token = 'owner-b-token';
  f.storage.jobDetailSnapshot_private = {
    id: 'private', title: 'Cached role', company: 'Cached company',
    matchScore100: 98, matchReason: 'A private profile matched this role'
  };
  const page = load('package-user/pages/job-detail/job-detail.js', {
    '../../../utils/api.js': { getJobDetail: async () => ({ data: [] }), post: async () => ({}), normalizeCompanyLogo: value => value },
    '../../../utils/api-v4.js': { getJobDetail: async () => ({ code: -1 }) },
    '../../../utils/demo-data.js': { enabled: () => false },
    '../../../utils/feature-flags.js': { guardRecruitmentPage: () => true },
    '../../../utils/job-progress.js': { getByJobId: () => null, currentOwnerScope: () => 'owner-b' },
    '../../../utils/favorites.js': { isFavorited: () => false, syncFromServer: async () => [], prepareOwner() {} },
    '../../../utils/browse-history.js': { add() {} },
    '../../../utils/analytics.js': { track() {} }, '../../../behaviors/login-gate.js': {},
    '../../../utils/application-queue.js': { queueJob: async () => ({}) }
  }, f.wx, true);
  page.onLoad({ id: 'private' });
  assert.equal(page.data.job.matchScore100, 0);
  assert.equal(page.data.job.matchReason, '');
  assert.equal(page.data.jobView.hasMatch, false);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.data.job.matchScore100, 0);
});

test('aggregate API distinguishes a valid empty page from a network failure', async () => {
  const f = fixture(); let result = { data: [], total: 0, hasMore: false };
  const api = load('utils/api-jobs.js', {
    './api-client.js': { request: async () => result },
    './api-feishu-content.js': { getFeishuJobs: async () => null }
  }, f.wx);
  assert.equal((await api.getAggregatedJobs({})).total, 0);
  result = { data: [], _source: 'networkError' };
  await assert.rejects(api.getAggregatedJobs({}));
});

test('copying an apply link saves preparing once and never submits a resume or marks applied', async () => {
  const f = fixture(); let saved = 0;
  const page = load('package-user/pages/job-detail/job-detail.js', {
    '../../../utils/api.js': {}, '../../../utils/api-v4.js': {},
    '../../../utils/demo-data.js': { enabled: () => false },
    '../../../utils/job-progress.js': { getByJobId: () => null },
    '../../../utils/analytics.js': { track() {} }, '../../../behaviors/login-gate.js': {},
    '../../../utils/application-queue.js': { queueJob: async () => { saved++; return { id: 7, status: 'preparing' }; } }
  }, f.wx, true);
  page.data.job = { id: 'j', title: 'Engineer', company: 'Test', applyLink: 'https://example.com/apply' };
  page.data.jobView = presentJob(page.data.job);
  await page.doOneClickApply();
  assert.equal(saved, 1);
  assert.deepEqual(f.copied, ['https://example.com/apply']);
  assert.equal(page.data.v4Application.status, 'preparing');
  assert.equal(page.data.isApplied, false);
  assert.equal(page.data.isApplying, false);
});

test('job detail clears stale apply links and blocks held applications across legacy response races', async () => {
  const f = fixture();
  const legacy = deferred();
  let queued = 0;
  f.storage.jobDetailSnapshot_held = { id: 'held', title: 'Engineer', company: 'Test', applyLink: 'https://old.example/apply' };
  f.storage.tempJobDetail = { id: 'held', applyLink: 'https://old.example/apply' };
  f.storage.cachedJobsList = { items: [{ id: 'held', applyLink: 'https://old.example/apply' }] };
  const page = load('package-user/pages/job-detail/job-detail.js', {
    '../../../utils/api.js': { getJobDetail: () => legacy.promise, normalizeCompanyLogo: value => value },
    '../../../utils/api-v4.js': { getJobDetail: async () => ok({
      job: { id: 'held', title: 'Engineer', company: 'Test', isApplyAvailable: false,
        applicationStatus: 'closed', applicationNotice: '人工核验已关闭',
        applyUrl: '', officialApplyUrl: '', sourceUrl: '' },
      trust: { officialVerification: { url: '', status: 'admin_review_hold' } }
    }) },
    '../../../utils/demo-data.js': { enabled: () => false },
    '../../../utils/job-progress.js': { getByJobId: () => null },
    '../../../utils/browse-history.js': { add() {} },
    '../../../utils/analytics.js': { track() {} }, '../../../behaviors/login-gate.js': {},
    '../../../utils/application-queue.js': { queueJob: async () => { queued++; return {}; } }
  }, f.wx, true);
  page.data.jobId = 'held';
  page.fetchJobDetail('held');
  assert.equal(page.data.job.applyLink, 'https://old.example/apply');
  page.loadV4Detail('held');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.data.applicationHeld, true);
  assert.equal(page.data.job.applyLink, '');
  assert.equal(page.data.jobView.applyButtonText, '申请已关闭');
  assert.equal(page.data.applicationNotice, '人工核验已关闭');
  assert.equal(f.storage.jobDetailSnapshot_held.applyLink, '');
  assert.equal(f.storage.tempJobDetail.applyLink, '');
  assert.equal(f.storage.cachedJobsList.items[0].applyLink, '');
  legacy.resolve({ data: { job_id: 'held', job_title: 'Engineer', employer_name: 'Test',
    job_apply_link: 'https://old.example/apply', application_status: 'unverified',
    is_apply_available: true } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.data.job.applyLink, '');
  assert.equal(page.data.job.applicationStatus, 'closed');
  assert.equal(f.storage.jobApplicationHold_held.applicationStatus, 'closed');
  page.applyJob();
  page.openOfficialForTrust();
  await page.doOneClickApply();
  assert.equal(page.data.showApplyModal, false);
  assert.equal(queued, 0);
  assert.deepEqual(f.copied, []);
  assert.ok(f.toasts.some(item => item.title === '人工核验已关闭'));
  assert.equal(page.getJobSnapshot('held').applyLink, '');
});

test('job detail retains unverified apply behavior and reopens after an explicit available response', async () => {
  const f = fixture();
  let status = 'review_needed';
  let queued = 0;
  const page = load('package-user/pages/job-detail/job-detail.js', {
    '../../../utils/api.js': { normalizeCompanyLogo: value => value },
    '../../../utils/api-v4.js': { getJobDetail: async () => ok({ job: {
      id: 'review', title: 'Engineer', company: 'Test',
      isApplyAvailable: status === 'unverified', applicationStatus: status,
      applicationNotice: status === 'review_needed' ? '等待人工复核' : '',
      applyUrl: status === 'unverified' ? 'https://official.example/apply' : ''
    } }) },
    '../../../utils/demo-data.js': { enabled: () => false },
    '../../../utils/job-progress.js': { getByJobId: () => null },
    '../../../utils/browse-history.js': { add() {} },
    '../../../utils/analytics.js': { track() {} }, '../../../behaviors/login-gate.js': {},
    '../../../utils/application-queue.js': { queueJob: async () => { queued++; return { id: 1, status: 'preparing' }; } }
  }, f.wx, true);
  page.data.jobId = 'review';
  page.loadV4Detail('review');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.data.jobView.applyButtonText, '待人工复核');
  assert.equal(page.data.job.applyLink, '');
  status = 'unverified';
  page.loadV4Detail('review');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.data.applicationHeld, false);
  assert.equal(page.data.applicationNotice, '');
  assert.equal(page.data.job.applyLink, 'https://official.example/apply');
  assert.equal(f.storage.jobApplicationHold_review, null);
  await page.doOneClickApply();
  assert.equal(queued, 1);
  assert.deepEqual(f.copied, ['https://official.example/apply']);
});

test('an expired local job keeps its manual status but blocks cached links and labels the deadline', async () => {
  const f = fixture();
  let queued = 0;
  f.storage.jobDetailSnapshot_12 = { id: '12', title: 'Old role', company: 'Test',
    source: 'local', applyLink: 'https://old.example/apply' };
  const page = load('package-user/pages/job-detail/job-detail.js', {
    '../../../utils/api.js': { normalizeCompanyLogo: value => value },
    '../../../utils/api-v4.js': { getJobDetail: async () => ok({ job: {
      id: '12', title: 'Old role', company: 'Test', source: 'local',
      deadline: '2020-01-01', isApplyAvailable: false,
      applicationStatus: 'open', applicationNotice: '该岗位截止日期已过，暂不可申请',
      applyUrl: '', officialApplyUrl: '', sourceUrl: ''
    } }) },
    '../../../utils/demo-data.js': { enabled: () => false },
    '../../../utils/job-progress.js': { getByJobId: () => null },
    '../../../utils/browse-history.js': { add() {} },
    '../../../utils/analytics.js': { track() {} }, '../../../behaviors/login-gate.js': {},
    '../../../utils/application-queue.js': { queueJob: async () => { queued++; return {}; } }
  }, f.wx, true);
  page.data.jobId = '12';
  page.loadV4Detail('12');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.data.job.applicationStatus, 'open');
  assert.equal(page.data.applicationHeld, true);
  assert.equal(page.data.jobView.applyButtonText, '截止已过');
  page.refreshProgressState('12');
  assert.equal(page.data.jobView.applyButtonText, '截止已过');
  assert.equal(page.data.job.applyLink, '');
  assert.equal(f.storage.jobApplicationHold_12.isApplyAvailable, false);
  assert.equal(f.storage.jobDetailSnapshot_12.applyLink, '');
  assert.equal(page.getJobSnapshot('12').applyLink, '');
  await page.doOneClickApply();
  assert.equal(queued, 0);
  assert.deepEqual(f.copied, []);
});

test('a held local deadline uses Shanghai day when device-local presentation disagrees', () => {
  const f = fixture();
  // Simulate a device day that still appears open while Shanghai has crossed the deadline.
  const page = load('package-user/pages/job-detail/job-detail.js', {
    '../../../utils/api.js': {}, '../../../utils/api-v4.js': {},
    '../../../utils/date-time.js': { shanghaiDayDistance: () => -1 },
    '../../../utils/demo-data.js': { enabled: () => false },
    '../../../utils/job-progress.js': { getByJobId: () => null },
    '../../../utils/analytics.js': { track() {} }, '../../../behaviors/login-gate.js': {}
  }, f.wx, true);
  page.data.jobId = '12';
  page.commitJob({ id: '12', source: 'local', title: 'Engineer', company: 'Test',
    deadline: '2099-12-31', isApplyAvailable: true, applicationStatus: 'open',
    applyLink: 'https://old.example/apply' });
  assert.equal(page.data.applicationHeld, true);
  assert.equal(page.data.job.applyLink, '');
  assert.equal(page.data.jobView.deadlineClosed, true);
  assert.equal(page.data.jobView.deadlineText, '已截止');
  assert.equal(page.data.jobView.applyButtonText, '截止已过');
  page.refreshProgressState('12');
  assert.equal(page.data.jobView.applyButtonText, '截止已过');
});

test('a zoned local deadline closes at its exact instant without changing manual status', () => {
  const deadline = '2099-12-31T12:00:00+08:00';
  function pageAt(epoch) {
    class FixedDate extends Date {
      constructor(...args) { super(...(args.length ? args : [epoch])); }
      static now() { return epoch; }
    }
    const f = fixture();
    const page = load('package-user/pages/job-detail/job-detail.js', {
      __Date: FixedDate,
      '../../../utils/api.js': {}, '../../../utils/api-v4.js': {},
      '../../../utils/demo-data.js': { enabled: () => false },
      '../../../utils/job-progress.js': { getByJobId: () => null },
      '../../../utils/analytics.js': { track() {} }, '../../../behaviors/login-gate.js': {}
    }, f.wx, true);
    page.data.jobId = '12';
    page.commitJob({ id: '12', source: 'local', title: 'Engineer', company: 'Test', deadline,
      isApplyAvailable: true, applicationStatus: 'open', applyLink: 'https://old.example/apply' });
    return page;
  }
  const instant = Date.parse(deadline);
  const before = pageAt(instant - 1);
  assert.equal(before.data.applicationHeld, false);
  assert.equal(before.data.job.applyLink, 'https://old.example/apply');
  const expired = pageAt(instant);
  assert.equal(expired.data.applicationHeld, true);
  assert.equal(expired.data.job.applicationStatus, 'open');
  assert.equal(expired.data.job.applyLink, '');
  assert.equal(expired.data.jobView.deadlineText, '已截止');
});

test('a review hold arriving while saving prevents copying an already captured apply link', async () => {
  const f = fixture();
  const saving = deferred();
  const page = load('package-user/pages/job-detail/job-detail.js', {
    '../../../utils/api.js': {}, '../../../utils/api-v4.js': {},
    '../../../utils/demo-data.js': { enabled: () => false },
    '../../../utils/job-progress.js': { getByJobId: () => null },
    '../../../utils/analytics.js': { track() {} }, '../../../behaviors/login-gate.js': {},
    '../../../utils/application-queue.js': { queueJob: () => saving.promise }
  }, f.wx, true);
  page.data.job = { id: 'pending', title: 'Engineer', company: 'Test', applyLink: 'https://old.example/apply' };
  page.data.jobView = presentJob(page.data.job);
  const applying = page.doOneClickApply();
  page.commitJob({ id: 'pending', title: 'Engineer', company: 'Test',
    applyLink: '', isApplyAvailable: false, applicationStatus: 'review_needed',
    applicationNotice: '等待人工复核' });
  saving.resolve({ id: 1, status: 'preparing' });
  await applying;
  assert.deepEqual(f.copied, []);
  assert.equal(page.data.showApplyModal, false);
  assert.equal(page.data.isApplying, false);
});

test('anonymous local detail requires a fresh status and maps closed, review and reopened links', async () => {
  const f = fixture();
  f.storage.token = '';
  f.storage.jobDetailSnapshot_1 = { id: '1', title: 'Cached role', company: 'Test',
    applyLink: 'https://old.example/apply', source: 'local_fallback' };
  let current = deferred(), v4Calls = 0, queued = 0;
  const page = load('package-user/pages/job-detail/job-detail.js', {
    '../../../utils/api.js': { getJobDetail: () => current.promise, normalizeCompanyLogo: value => value },
    '../../../utils/api-v4.js': { getJobDetail: () => { v4Calls++; return Promise.resolve({ code: -1 }); } },
    '../../../utils/demo-data.js': { enabled: () => false },
    '../../../utils/feature-flags.js': { guardRecruitmentPage: () => true },
    '../../../utils/job-progress.js': { getByJobId: () => null, currentOwnerScope: () => '' },
    '../../../utils/favorites.js': { isFavorited: () => false, prepareOwner() {} },
    '../../../utils/browse-history.js': { add() {} },
    '../../../utils/analytics.js': { track() {} }, '../../../behaviors/login-gate.js': {},
    '../../../utils/application-queue.js': { queueJob: async () => { queued++; return {}; } }
  }, f.wx, true);
  page.onLoad({ id: '1' });
  assert.equal(v4Calls, 0);
  assert.equal(page.data.applicationPending, true);
  assert.equal(page.data.job.applyLink, '');
  assert.equal(page.data.jobView.applyButtonText, '核对中');
  page.applyJob();
  await page.doOneClickApply();
  assert.equal(queued, 0);
  const raw = (status, available, url) => ({ data: [{ job_id: '1', job_title: 'Engineer',
    employer_name: 'Test', job_apply_link: url, _local: true, deadline: '2026-12-31',
    application_status: status, is_apply_available: available,
    application_notice: available ? '' : '人工核验：' + status }] });
  current.resolve(raw('closed', false, ''));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.data.applicationPending, false);
  assert.equal(page.data.applicationHeld, true);
  assert.equal(page.data.job.applicationStatus, 'closed');
  assert.equal(page.data.jobView.applyButtonText, '申请已关闭');
  assert.equal(page.data.job.deadline, '2026-12-31');
  assert.equal(f.storage.jobDetailSnapshot_1.applyLink, '');
  current = deferred(); page.fetchJobDetail('1');
  current.resolve(raw('review_needed', false, ''));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.data.job.applicationStatus, 'review_needed');
  assert.equal(page.data.jobView.applyButtonText, '待人工复核');
  assert.equal(page.data.applicationNotice, '人工核验：review_needed');
  current = deferred(); page.fetchJobDetail('1');
  current.resolve(raw('unverified', true, 'https://official.example/apply'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.data.applicationHeld, false);
  assert.equal(page.data.applicationPending, false);
  assert.equal(page.data.job.applyLink, 'https://official.example/apply');
  assert.equal(f.storage.jobApplicationHold_1, null);
  assert.equal(page.data.jobView.applyButtonText, '前往投递');
  current = deferred();
  page._hasShown = true;
  page.onShow();
  assert.equal(page.data.applicationPending, true);
  assert.equal(page.data.job.applyLink, '');
  current.resolve(raw('closed', false, ''));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.data.applicationHeld, true);
  assert.equal(page.data.job.applyLink, '');
});

test('local detail without a fresh application status never opens a cached apply link', async () => {
  const f = fixture();
  f.storage.token = '';
  f.storage.jobDetailSnapshot_2 = { id: '2', title: 'Old role', company: 'Test',
    applyLink: 'https://old.example/apply' };
  const page = load('package-user/pages/job-detail/job-detail.js', {
    '../../../utils/api.js': { getJobDetail: async () => ({ data: [{ job_id: '2', job_title: 'Old role',
      employer_name: 'Test', job_apply_link: 'https://old.example/apply', _local: true }] }), normalizeCompanyLogo: value => value },
    '../../../utils/api-v4.js': {},
    '../../../utils/demo-data.js': { enabled: () => false },
    '../../../utils/job-progress.js': { getByJobId: () => null },
    '../../../utils/browse-history.js': { add() {} },
    '../../../utils/analytics.js': { track() {} }, '../../../behaviors/login-gate.js': {},
    '../../../utils/application-queue.js': { queueJob: async () => ({}) }
  }, f.wx, true);
  page.fetchJobDetail('2');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.data.applicationPending, true);
  assert.equal(page.data.job.applyLink, '');
  assert.equal(page.data.jobView.applyButtonText, '核对中');
  const external = page.buildSnapshotDetail({ id: '3', title: 'External role', company: 'Test',
    source: 'jsearch', applyLink: 'https://external.example/apply' });
  assert.equal(external.applicationVerificationPending, false);
  assert.equal(external.applyLink, 'https://external.example/apply');
});

test('job detail API opts out of fresh and stale caches', async () => {
  const f = fixture();
  let fail = false;
  f.wx.request = options => {
    setImmediate(() => fail
      ? options.fail({ errMsg: 'network fail' })
      : options.success({ statusCode: 200, data: { data: [{ job_id: '1', job_apply_link: 'https://old.example' }] } }));
    return { abort() {} };
  };
  const client = load('utils/api-client.js', {
    './app-config.js': { API_BASE_URL: 'https://example.test' },
    './auth-session.js': { revision: () => 0 }
  }, f.wx);
  const first = await client.request({ path: '/api/jobs/detail', params: { job_id: '1' }, skipAuth: true, cacheTTL: 1 });
  assert.equal(first.data[0].job_apply_link, 'https://old.example');
  fail = true;
  const second = await client.request({ path: '/api/jobs/detail', params: { job_id: '1' },
    skipAuth: true, noCache: true, noStale: true });
  assert.equal(second._source, 'networkError');
  const calls = [];
  const jobs = load('utils/api-jobs.js', {
    './api-client.js': { request: options => { calls.push(options); return Promise.resolve({ data: [] }); } },
    './app-config.js': { CONTENT_API_BASE_URL: 'https://example.test' },
    './api-feishu-content.js': {},
    './data-provenance.js': { normalizeDataMeta: value => value }
  }, f.wx);
  await jobs.getJobDetail('1');
  assert.equal(calls[0].noCache, true);
  assert.equal(calls[0].noStale, true);
});

test('an in-progress closed job opens progress instead of showing the deadline warning', () => {
  const f = fixture(), routes = [];
  const page = load('package-user/pages/job-detail/job-detail.js', {
    '../../../utils/api.js': {}, '../../../utils/api-v4.js': {},
    '../../../utils/demo-data.js': { enabled: () => false },
    '../../../utils/job-progress.js': { getByJobId: () => null, currentOwnerScope: () => 'owner' },
    '../../../utils/navigation.js': { safeNavigateTo: url => routes.push(url) },
    '../../../utils/analytics.js': { track() {} }, '../../../behaviors/login-gate.js': {},
    '../../../utils/application-queue.js': { queueJob: async () => ({}) }
  }, f.wx, true);
  page.data.job = { id: 'closed-in-progress' };
  page.data.jobView = { deadlineClosed: true };
  page.data.inProgress = true;
  page.applyJob();
  assert.deepEqual(routes, ['/pages/applications/applications']);
  assert.equal(f.toasts.length, 0);
});

test('job detail ignores an application response that arrives after an account switch', async () => {
  const f = fixture();
  const wait = deferred(); let calls = 0;
  const page = load('package-user/pages/job-detail/job-detail.js', {
    '../../../utils/api.js': {},
    '../../../utils/api-v4.js': { getJobDetail: () => ++calls === 1 ? wait.promise : Promise.resolve({ code: -1 }) },
    '../../../utils/demo-data.js': { enabled: () => false },
    '../../../utils/job-progress.js': { getByJobId: () => null },
    '../../../utils/analytics.js': { track() {} },
    '../../../behaviors/login-gate.js': {},
    '../../../utils/application-queue.js': { queueJob: async () => ({ id: 7, status: 'preparing' }) }
  }, f.wx, true);
  let committed = false;
  page.commitJob = () => { committed = true; };
  page.loadV4Detail('job-a');
  f.storage.token = 'another-user';
  wait.resolve(ok({ job: { id: 'job-a', title: 'Private application job' }, application: { id: 9, status: 'offer' } }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(committed, false);
  assert.equal(page.data.v4Application, null);
});

test('job detail clears match and favorite state when a match response crosses owners', async () => {
  const f = fixture();
  const wait = deferred();
  const page = load('package-user/pages/job-detail/job-detail.js', {
    '../../../utils/api.js': {},
    '../../../utils/api-v4.js': { calculateJobMatch: () => wait.promise, getJobDetail: async () => ({ code: -1 }) },
    '../../../utils/demo-data.js': { enabled: () => false },
    '../../../utils/job-progress.js': { getByJobId: () => null, currentOwnerScope: () => String(f.storage.token || '') },
    '../../../utils/analytics.js': { track() {} },
    '../../../behaviors/login-gate.js': {},
    '../../../utils/application-queue.js': { queueJob: async () => ({ id: 7, status: 'preparing' }) }
  }, f.wx, true);
  page._ownerToken = 'test-user';
  page.data.jobId = 'job-a';
  page.data.job = { id: 'job-a', title: 'Engineer', matchScore100: 88, matchReason: 'old owner' };
  page.data.jobView = { isSaved: true, isApplied: true, hasMatch: true, matchScore: 88 };
  page.data.isSaved = true;
  page.data.matchReport = { score: 88 };
  page.data.inlineMatch = { score: 88 };
  const matching = page.runJdMatch();
  f.storage.token = 'new-owner';
  wait.resolve(ok({ score: 100 }));
  await matching;
  assert.equal(page.data.isSaved, false);
  assert.equal(page.data.matchReport, null);
  assert.equal(page.data.inlineMatch, null);
  assert.equal(page.data.jobView.hasMatch, false);
  assert.equal(page.data.job.matchScore100, 0);
});

test('legacy progress keeps numeric cloud applications read-only and routes them to V4 detail', () => {
  const source = fs.readFileSync(path.join(__dirname, '../miniprogram/package-user/pages/job-progress/job-progress.js'), 'utf8');
  assert.match(source, /remoteManaged:\s*\/\^\[1-9\]\\d\*\$\//);
  assert.match(source, /if \(record\.remoteManaged\) return this\.openManagedApplication\(record\)/);
  assert.match(source, /application-detail\/application-detail\?id=/);
  assert.doesNotMatch(source, /remoteManaged[\s\S]{0,300}progress\.update/);
});

test('application materials ask uses bound application, guards stale owner responses and saves with CAS', async () => {
  const f = fixture();
  f.storage.token = 'owner-1';
  const generated = deferred();
  let sent;
  let saved;
  const page = load('package-ai/pages/application-materials/application-materials.js', {
    '../../utils/application-materials.js': { QUESTION_TYPES: [], readMaterials: () => [], getStats: () => ({ total: 0, byType: {} }), fetchRemoteMaterials: async () => [] },
    '../../../utils/api-v4.js': {
      generateApplicationAnswer: payload => { sent = payload; return generated.promise; },
      updateApplicationAnswerDraft: async (id, payload) => { saved = { id, payload }; return ok({ id, version: 2, applicationId: 9, draft: payload.content, maxChars: 100, evidence: [], evidenceRefs: [], unsupportedClaims: [] }); }
    },
    '../../../utils/owner-storage.js': { capture: () => 'owner-1', isCurrent: owner => owner === f.storage.token }
  }, f.wx, true);
  page._unloaded = false;
  page.data.applications = [{ id: 9 }, { id: 10 }];
  page.data.resumes = [];
  page.data.applicationIndex = 0;
  page.data.answerQuestion = 'Describe one project';
  page.generateApplicationAnswer();
  assert.equal(sent.applicationId, 9);
  assert.equal(sent.question, 'Describe one project');
  assert.equal(sent.maxChars, 500);
  page.onApplicationChange({ detail: { value: 1 } });
  generated.resolve(ok({ id: 1, version: 1, applicationId: 9, draft: 'stale answer', maxChars: 500, evidence: [], evidenceRefs: [], unsupportedClaims: [] }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.data.answerResult, null, 'late result for a different selected application is discarded');

  page.data.applicationIndex = 0;
  page.data.answerResult = { id: 1, version: 1, applicationId: 9, maxChars: 100 };
  page.data.answerContent = '编辑后的答案🧭';
  page.saveApplicationAnswerDraft();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(saved.id, 1);
  assert.equal(saved.payload.expectedVersion, 1);
  assert.equal(page.data.answerResult.version, 2);
});
