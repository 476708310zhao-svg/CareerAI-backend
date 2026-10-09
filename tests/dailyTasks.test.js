const test = require('node:test');
const assert = require('node:assert/strict');

const storage = {};
global.wx = {
  getStorageSync(key) { return storage[key]; },
  setStorageSync(key, value) { storage[key] = value; }
};

const dailyTasks = require('../miniprogram/utils/daily-tasks');

test('daily task state records offline changes and clears pending state after sync', () => {
  storage.dailyTaskDoneMap = {};
  dailyTasks.setTaskDone('remote_12', true, { pending: true, serverId: 12 });
  const pending = dailyTasks.readTaskState('remote_12');
  assert.equal(pending.done, true);
  assert.equal(pending.pending, true);
  assert.equal(pending.serverId, 12);
  assert.equal(dailyTasks.getPendingRemoteUpdates().length, 1);

  dailyTasks.markTaskSynced('remote_12', true, 12);
  const synced = dailyTasks.readTaskState('remote_12');
  assert.equal(synced.done, true);
  assert.equal(synced.pending, false);
  assert.equal(dailyTasks.getPendingRemoteUpdates().length, 0);
});

test('daily task state migrates legacy boolean completion values', () => {
  storage.dailyTaskDoneMap = {
    [dailyTasks.todayKey()]: { legacy_task: true }
  };
  const state = dailyTasks.readTaskState('legacy_task');
  assert.equal(state.done, true);
  assert.equal(state.pending, true);
});

test('SQLite server timestamps reconcile completion without iOS-only date parsing', () => {
  const NativeDate = global.Date;
  class IOSDate extends NativeDate {
    constructor(...args) {
      if (typeof args[0] === 'string' && /^\d{4}-\d{2}-\d{2} /.test(args[0])) {
        throw new Error('Unsupported iOS date string');
      }
      super(...args);
    }
  }
  storage.dailyTaskDoneMap = {};
  global.Date = IOSDate;
  try {
    wx.setStorageSync('dailyTaskDoneMap', {
      [dailyTasks.todayKey()]: {
        sqlite_task: { done: false, pending: true, updatedAt: '2026-07-14T08:00:00.000Z' }
      }
    });
    dailyTasks.reconcileServerTask('sqlite_task', {
      id: 13, completed: true, updatedAt: '2026-07-14 09:03:56'
    });
    assert.equal(dailyTasks.readTaskState('sqlite_task').done, true);
    const util = require('../miniprogram/utils/util');
    assert.equal(util.formatDate('2026-07-14 09:03:56'), util.formatDate('2026-07-14T09:03:56Z'));
    assert.equal(util.formatTimeAgo('not-a-date'), '--');
  } finally { global.Date = NativeDate; }
});
