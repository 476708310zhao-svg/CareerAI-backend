const ownerStorage = require('./owner-storage.js');

const STORE_KEY = 'ai_chat_sessions_v1';
const ACTIVE_KEY = 'ai_chat_active_v1';
const MAX_SESSIONS = 24;
const MAX_MESSAGES = 30;

function read() {
  const value = ownerStorage.get(STORE_KEY, '', []);
  return Array.isArray(value) ? value.filter(item => item && typeof item.id === 'string') : [];
}

function write(sessions) {
  ownerStorage.set(STORE_KEY, '', sessions.slice(0, MAX_SESSIONS));
}

function createId() {
  return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function activeId() {
  return String(ownerStorage.get(ACTIVE_KEY, '', '') || '');
}

function setActive(id) {
  ownerStorage.set(ACTIVE_KEY, '', String(id || ''));
}

function titleFrom(messages) {
  const first = (messages || []).find(message => message && message.role === 'user' && message.content);
  return first ? String(first.content).replace(/\s+/g, ' ').trim().slice(0, 28) || '新对话' : '新对话';
}

function cleanMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter(message => message && !message.isStreaming && (message.role === 'user' || message.role === 'ai'))
    .slice(-MAX_MESSAGES)
    .map(message => ({
      id: message.id,
      role: message.role,
      ts: Number(message.ts) || Date.now(),
      content: String(message.content || '').slice(0, 5000),
      isWelcome: !!message.isWelcome,
      isError: !!message.isError,
      retryText: String(message.retryText || '').slice(0, 300),
      showTime: !!message.showTime,
      timeLabel: String(message.timeLabel || ''),
      suggestions: Array.isArray(message.suggestions) ? message.suggestions.slice(0, 3) : []
    }));
}

function save(id, messages, context) {
  const clean = cleanMessages(messages);
  if (!clean.some(message => message.role === 'user')) return null;
  const sessions = read();
  const old = sessions.find(item => item.id === id);
  const record = {
    id: String(id || createId()),
    title: old ? old.title : titleFrom(clean),
    titleEdited: !!(old && old.titleEdited),
    updatedAt: Date.now(),
    messages: clean,
    context: {
      active: !!(context && context.active),
      label: String(context && context.label || '').slice(0, 100),
      source: String(context && context.source || '').slice(0, 40),
      applicationId: String(context && context.applicationId || '').slice(0, 80),
      company: String(context && context.company || '').slice(0, 100),
      targetJob: String(context && context.targetJob || '').slice(0, 100)
    }
  };
  write([record].concat(sessions.filter(item => item.id !== record.id)));
  setActive(record.id);
  return record;
}

function get(id) {
  return read().find(item => item.id === id) || null;
}

function list(query) {
  const needle = String(query || '').trim().toLowerCase();
  return read().filter(item => !needle || String(item.title || '').toLowerCase().includes(needle))
    .map(({ id, title, updatedAt, context }) => ({ id, title, updatedAt, context }));
}

function rename(id, title) {
  const value = String(title || '').trim().slice(0, 40);
  if (!value) return false;
  const sessions = read();
  const record = sessions.find(item => item.id === id);
  if (!record) return false;
  record.title = value;
  record.titleEdited = true;
  write(sessions);
  return true;
}

function remove(id) {
  const sessions = read();
  if (!sessions.some(item => item.id === id)) return false;
  write(sessions.filter(item => item.id !== id));
  if (activeId() === id) setActive('');
  return true;
}

module.exports = { createId, activeId, setActive, save, get, list, rename, remove, titleFrom };
