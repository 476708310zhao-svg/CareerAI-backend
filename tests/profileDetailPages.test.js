const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadPage(relativePath, mocks, wx, app = {}) {
  const filename = path.join(__dirname, '..', 'miniprogram', relativePath);
  let page;
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    Page: value => { page = value; },
    require: key => {
      if (!(key in mocks)) throw new Error(`Unexpected dependency: ${key}`);
      return mocks[key];
    },
    wx,
    getApp: () => app,
    setTimeout,
    clearTimeout,
  }, { filename });
  page.data = JSON.parse(JSON.stringify(page.data));
  page.setData = function (patch, callback) {
    Object.assign(this.data, patch);
    if (callback) callback();
  };
  return page;
}

const settle = () => new Promise(resolve => setImmediate(resolve));

test('message categories use one complete list for totals and do not reload on tab changes', async () => {
  const requested = [];
  const badge = [];
  const rows = [
    { id: 1, type: 'application', title: '申请', content: '更新', isRead: false, createdAt: '2026-10-19' },
    { id: 2, type: 'interaction', title: '互动', content: '回复', isRead: true, createdAt: '2026-10-19' },
    { id: 3, type: 'system', title: '系统', content: '通知', isRead: false, createdAt: '2026-10-19' },
    { id: 4, type: 'payment', title: '会员支付未完成', content: 'requestVirtualPayment.fail 暂不支持非中国大陆地区苹果账号支付。', isRead: false, createdAt: '2026-10-19' },
  ];
  const page = loadPage('package-user/pages/messages/messages.js', {
    '../../../utils/api-messages.js': {
      getMessages: type => { requested.push(type); return Promise.resolve({ code: 0, data: { list: rows, unreadCount: 3 } }); },
      markMessageRead() {}, markAllMessagesRead() {},
    },
    '../../../utils/unread-messages.js': { set() {} },
  }, { getStorageSync: key => key === 'token' ? 'session' : null }, {
    globalData: {}, setUnreadCount: count => badge.push(count),
  });

  page.loadMessages();
  await settle();
  assert.deepEqual(requested, [undefined]);
  assert.deepEqual(Array.from(page.data.tabCounts), [4, 1, 1, 2]);
  assert.equal(page.data.unreadTotal, 3);
  page.switchTab({ currentTarget: { dataset: { index: 1 } } });
  assert.equal(page.data.filteredMessages.length, 1);
  assert.equal(page.data.filteredMessages[0].type, 'application');
  assert.equal(page.data.unreadTotal, 3);
  assert.equal(requested.length, 1);
  page.switchTab({ currentTarget: { dataset: { index: 3 } } });
  assert.deepEqual(Array.from(page.data.filteredMessages, message => message.type), ['system', 'payment']);
  const payment = page.data.filteredMessages[1];
  assert.equal(payment.typeLabel, '支付通知');
  assert.equal(payment.displayContent, '暂不支持非中国大陆地区苹果账号支付。');
  assert.match(payment.content, /^requestVirtualPayment\.fail/);
  assert.deepEqual(badge, [3]);
});

test('message sync failure does not expose an unscoped local message', async () => {
  const page = loadPage('package-user/pages/messages/messages.js', {
    '../../../utils/api-messages.js': { getMessages: () => Promise.reject(new Error('offline')) },
    '../../../utils/unread-messages.js': { set() {} },
  }, { getStorageSync: key => key === 'token' ? 'session' : [{ id: 99, title: 'other account' }] }, {
    globalData: {}, setUnreadCount() {},
  });
  page.loadMessages();
  await settle();
  assert.equal(page.data.syncError, true);
  assert.equal(page.data.filteredMessages.length, 0);
});

test('failed feedback submission leaves the draft visible for retry', async () => {
  const toasts = [];
  const page = loadPage('package-user/pages/feedback/feedback.js', {
    '../../../utils/api-feedback.js': { submitFeedback: () => Promise.reject(new Error('offline')) },
    '../../../utils/auth-session.js': { capture: () => ({ token: 'session', revision: 0 }), isCurrent: () => true },
  }, {
    showToast: value => toasts.push(value),
    navigateBack: () => { throw new Error('must stay on feedback page'); },
    setStorageSync: () => { throw new Error('must not store unsent feedback as delivered'); },
  });
  page.setData({ content: '职位页面提交后没有提示，希望增加反馈。', contact: 'contact' });
  page.submitFeedback();
  await settle();
  assert.equal(page.data.submitting, false);
  assert.match(page.data.submitError, /尚未提交/);
  assert.equal(page.data.content, '职位页面提交后没有提示，希望增加反馈。');
  assert.equal(toasts.length, 0);
});

test('feedback history handles paging, failures and account switching without showing old rows', async () => {
  let token = 'account-a';
  let revision = 0;
  let resolveFirst;
  const requests = [];
  const auth = {
    capture: () => ({ token, revision }),
    isCurrent: snapshot => snapshot.token === token && snapshot.revision === revision,
  };
  const page = loadPage('package-user/pages/feedback/feedback.js', {
    '../../../utils/api-feedback.js': {
      submitFeedback: () => Promise.resolve({ code: 0 }),
      getMyFeedback: cursor => {
        requests.push(cursor);
        if (requests.length === 1) return new Promise(resolve => { resolveFirst = resolve; });
        if (requests.length === 2) return Promise.resolve({ code: 0, data: { items: [{ id: 9, type: '岗位信息纠错', content: '账号 B 的岗位反馈', status: 'processing', createdAt: '2026-10-30T09:00:00', jobFeedback: { jobId: 'rok_9' } }], nextCursor: 9 } });
        if (requests.length === 3) return Promise.resolve({ _source: 'networkError', data: [] });
        return Promise.resolve({ code: 0, data: { items: [{ id: 8, type: '其他', content: '第二页', status: 'resolved' }], nextCursor: null } });
      }
    },
    '../../../utils/auth-session.js': auth,
  }, { getStorageSync: () => token, showToast() {} });
  page.onLoad();
  token = 'account-b'; revision++;
  page.onShow();
  await settle();
  assert.equal(page.data.history.length, 1);
  assert.equal(page.data.history[0].content, '账号 B 的岗位反馈');
  resolveFirst({ code: 0, data: { items: [{ id: 50, content: '账号 A 的私有反馈' }], nextCursor: null } });
  await settle();
  assert.equal(page.data.history.length, 1);
  page.loadMoreHistory();
  await settle();
  assert.match(page.data.historyError, /重试/);
  assert.equal(page.data.history.length, 1);
  page.retryHistory();
  await settle();
  assert.equal(page.data.history.length, 2);
  assert.equal(page.data.nextCursor, null);
  assert.deepEqual(requests, [null, null, 9, 9]);
});

test('feedback refresh failure retries the first page and unknown status is not called open', async () => {
  let count = 0;
  const cursors = [];
  const page = loadPage('package-user/pages/feedback/feedback.js', {
    '../../../utils/api-feedback.js': {
      submitFeedback: () => Promise.resolve({ code: 0 }),
      getMyFeedback: cursor => {
        cursors.push(cursor);
        count++;
        if (count === 2) return Promise.resolve({ _source: 'networkError', data: [] });
        return Promise.resolve({ code: 0, data: { items: [{ id: count, type: '其他', content: '旧反馈', status: 'unknown' }], nextCursor: count } });
      }
    },
    '../../../utils/auth-session.js': { capture: () => ({ token: 'a', revision: 1 }), isCurrent: () => true },
  }, { getStorageSync: () => 'a' });
  page.onLoad();
  await settle();
  assert.equal(page.data.history[0].statusLabel, '状态待核实');
  page.refreshHistory();
  await settle();
  assert.match(page.data.historyError, /重试/);
  assert.equal(page.data.history.length, 1);
  page.retryHistory();
  await settle();
  assert.deepEqual(cursors, [null, null, null]);
  assert.equal(page.data.history[0].statusLabel, '状态待核实');
});

test('feedback requires login and keeps a draft when the session expires', async () => {
  let token = '';
  let submissions = 0;
  const page = loadPage('package-user/pages/feedback/feedback.js', {
    '../../../utils/api-feedback.js': {
      submitFeedback: () => { submissions++; return Promise.reject(new Error('unauthorized')); },
      getMyFeedback: () => Promise.resolve({ _source: 'unauthorized', data: [] }),
    },
    '../../../utils/auth-session.js': {
      capture: () => ({ token, revision: 0 }),
      isCurrent: () => !!token,
    },
  }, { getStorageSync: () => token, showToast() {} });
  page.setData({ content: '反馈内容至少十个字，请协助查看岗位信息。' });
  page.submitFeedback();
  assert.equal(submissions, 0);
  assert.match(page.data.submitError, /登录/);
  token = 'active-session';
  page.submitFeedback();
  await settle();
  assert.equal(submissions, 1);
  assert.match(page.data.submitError, /登录已失效/);
  assert.match(page.data.content, /反馈内容/);
});
