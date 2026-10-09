const ownerStorage = require('./owner-storage.js');

const KEY = 'unreadMessages';

function get() {
  return Math.max(0, Number(ownerStorage.get(KEY, '', 0)) || 0);
}

function set(value) {
  const count = Math.max(0, Number(value) || 0);
  ownerStorage.set(KEY, '', count);
  return count;
}

function clear() { ownerStorage.remove(KEY); }

module.exports = { get, set, clear, KEY };
