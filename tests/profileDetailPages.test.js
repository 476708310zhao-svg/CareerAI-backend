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
  ];
  const page = loadPage('package-user/pages/messages/messages.js', {
    '../../../utils/api-messages.js': {
      getMessages: type => { requested.push(type); return Promise.resolve({ code: 0, data: { list: rows, unreadCount: 2 } }); },
      markMessageRead() {}, markAllMessagesRead() {},
    },
    '../../../utils/unread-messages.js': { set() {} },
  }, { getStorageSync: key => key === 'token' ? 'session' : null }, {
    globalData: {}, setUnreadCount: count => badge.push(count),
  });

  page.loadMessages();
  await settle();
  assert.deepEqual(requested, [undefined]);
  assert.deepEqual(Array.from(page.data.tabCounts), [3, 1, 1, 1]);
  assert.equal(page.data.unreadTotal, 2);
  page.switchTab({ currentTarget: { dataset: { index: 1 } } });
  assert.equal(page.data.filteredMessages.length, 1);
  assert.equal(page.data.filteredMessages[0].type, 'application');
  assert.equal(page.data.unreadTotal, 2);
  assert.equal(requested.length, 1);
  assert.deepEqual(badge, [2]);
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
