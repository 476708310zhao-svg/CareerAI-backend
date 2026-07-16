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
