'use strict';
const crypto = require('node:crypto');
// Only digests are kept. Restarting the server invalidates unused login codes.
function createStore(now = Date.now) {
  const entries = new Map();
  const digest = code => crypto.createHash('sha256').update(code).digest('hex');
  function prune() { for (const [key, item] of entries) if (item.expiresAt <= now()) entries.delete(key); }
  return {
    issue(userId) {
      prune();
      for (const [key, item] of entries) if (item.userId === userId) entries.delete(key);
      if (entries.size >= 10000) throw Object.assign(new Error('登录服务繁忙，请稍后重试'), {status:503});
      const code = crypto.randomBytes(16).toString('hex').toUpperCase();
      const expiresAt = now() + 5 * 60 * 1000;
      entries.set(digest(code), {userId, expiresAt});
      return {code, expiresAt};
    },
    redeem(value) {
      prune();
      const code = String(value || '').trim().toUpperCase();
      if (!/^[A-F0-9]{32}$/.test(code)) return null;
      const key = digest(code), item = entries.get(key);
      entries.delete(key);
      return item?.userId || null;
    }
  };
}
module.exports = {createStore, store:createStore()};
