const test = require('node:test');
const assert = require('node:assert/strict');

const storage = {};
global.wx = {
  getStorageSync(key) { return storage[key]; },
  setStorageSync(key, value) { storage[key] = value; }
};

const dailyTasks = require('../miniprogram/utils/daily-tasks');
const progress = require('../miniprogram/utils/job-progress');
const notebook = require('../miniprogram/utils/interview-notebook');
const DONE_KEY = 'dailyTaskDoneMap:guest';

test('daily task state records offline changes and clears pending state after sync', () => {
  storage[DONE_KEY] = {};
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
  storage[DONE_KEY] = {
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
  storage[DONE_KEY] = {};
  global.Date = IOSDate;
  try {
    wx.setStorageSync(DONE_KEY, {
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

test('Today preview keeps high before medium before low and takes only the first three', () => {
  const originals = {
    getStats: progress.getStats,
    getList: progress.getList,
    getUpcomingDeadlines: progress.getUpcomingDeadlines,
    getTodayInterviews: progress.getTodayInterviews,
    getDailyPractice: notebook.getDailyPractice
  };
  storage[DONE_KEY] = {};
  storage['onlineResume:guest'] = { score: 95 };
  storage['cachedRecommendJobs:guest'] = [];
  progress.getStats = () => ({ active: 1 });
  progress.getList = () => [];
  progress.getUpcomingDeadlines = () => [{ id: 11 }];
  progress.getTodayInterviews = () => [];
  notebook.getDailyPractice = () => [];
  try {
    const preview = dailyTasks.buildTasks().slice(0, 3);
    assert.deepEqual(preview.map(item => item.priority), ['high', 'medium', 'low']);
    assert.equal(preview.length, 3);
  } finally {
    Object.assign(progress, {
      getStats: originals.getStats,
      getList: originals.getList,
      getUpcomingDeadlines: originals.getUpcomingDeadlines,
      getTodayInterviews: originals.getTodayInterviews
    });
    notebook.getDailyPractice = originals.getDailyPractice;
  }
});
