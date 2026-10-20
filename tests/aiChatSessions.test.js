'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture() {
  const storage = new Map();
  let owner = 'A';
  const ownerStorage = {
    get(base, suffix, fallback) {
      const key = `${owner}:${base}`;
      return storage.has(key) ? storage.get(key) : fallback;
    },
    set(base, suffix, value) { storage.set(`${owner}:${base}`, value); }
  };
  const filename = path.join(__dirname, '..', 'miniprogram', 'utils', 'ai-chat-sessions.js');
  const context = { module: { exports: {} }, require: () => ownerStorage, Date, Math };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  return { sessions: context.module.exports, setOwner: value => { owner = value; } };
}

test('AI conversations are saved, searchable and restored within one account only', () => {
  const { sessions, setOwner } = fixture();
  const id = sessions.createId();
  sessions.save(id, [
    { role: 'ai', content: '欢迎', isWelcome: true },
    { role: 'user', content: '产品经理求职准备\n下一步' },
    { role: 'ai', content: '先整理项目经历。' }
  ], { active: true, label: '示例公司 · 产品经理', source: 'applications', applicationId: '42' });
  assert.equal(sessions.activeId(), id);
  assert.equal(sessions.list('产品经理').length, 1);
  assert.equal(sessions.get(id).context.applicationId, '42');
  assert.equal(sessions.get(id).messages[2].content, '先整理项目经历。');
  setOwner('B');
  assert.equal(sessions.list().length, 0);
  assert.equal(sessions.activeId(), '');
  setOwner('A');
  assert.equal(sessions.get(id).title, '产品经理求职准备 下一步');
});

test('new chat preserves old session, while rename and delete are explicit', () => {
  const { sessions } = fixture();
  const first = sessions.createId();
  sessions.save(first, [{ role: 'user', content: '第一段对话' }], {});
  const next = sessions.createId();
  sessions.setActive(next);
  assert.equal(sessions.list().length, 1);
  assert.equal(sessions.get(first).messages[0].content, '第一段对话');
  assert.equal(sessions.rename(first, '求职计划'), true);
  sessions.save(first, [{ role: 'user', content: '新问题' }], {});
  assert.equal(sessions.get(first).title, '求职计划');
  assert.equal(sessions.remove(first), true);
  assert.equal(sessions.list().length, 0);
  assert.equal(sessions.activeId(), '');
});

test('incomplete streaming placeholders and excess messages are not persisted', () => {
  const { sessions } = fixture();
  const messages = Array.from({ length: 40 }, (_, index) => ({ role: 'user', content: `问题${index}` }));
  messages.push({ role: 'ai', content: '', isStreaming: true });
  const record = sessions.save(sessions.createId(), messages, {});
  assert.equal(record.messages.length, 30);
  assert.equal(record.messages.at(-1).content, '问题39');
  assert.equal(record.messages.some(item => item.isStreaming), false);
});
