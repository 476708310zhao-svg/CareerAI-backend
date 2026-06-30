const STORAGE_KEY = 'interviewMistakeNotebook';
const DAILY_KEY = 'dailyPracticeQuestions';
const apiClient = require('./api-client.js');

function readList() {
  try {
    const list = wx.getStorageSync(STORAGE_KEY);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function hasToken() {
  try {
    return !!wx.getStorageSync('token');
  } catch (e) {
    return false;
  }
}

function normalizeRemoteQuestion(item) {
  return {
    id: String(item.id || item.questionId || item.qid || Date.now()),
    serverId: item.serverId || '',
    title: item.title || item.question || '面试题',
    answer: item.answer || '',
    category: item.category || 'behavior',
    difficulty: item.difficulty || '中等',
    status: item.status || 'unknown',
    createdAt: item.createdAt || '',
    updatedAt: item.updatedAt || ''
  };
}

function writeList(list) {
  try {
    wx.setStorageSync(STORAGE_KEY, list || []);
  } catch (e) {}
}

function normalizeQuestion(question) {
  const q = question || {};
  return {
    id: String(q.id || q.qid || Date.now()),
    title: q.title || q.question || '面试题',
    answer: q.answer || '',
    category: q.category || 'behavior',
    difficulty: q.difficulty || '中等'
  };
}

function getItem(id) {
  return readList().find(item => String(item.id) === String(id)) || null;
}

function upsert(question, patch) {
  const normalized = normalizeQuestion(question);
  const list = readList();
  const idx = list.findIndex(item => String(item.id) === normalized.id);
  const next = Object.assign({}, idx >= 0 ? list[idx] : normalized, normalized, patch || {}, {
    updatedAt: new Date().toISOString(),
    createdAt: idx >= 0 ? list[idx].createdAt : new Date().toISOString()
  });
  if (idx >= 0) list[idx] = next;
  else list.unshift(next);
  writeList(list);
  syncNotebookItem(next).catch(() => {});
  return next;
}

function remove(id) {
  const list = readList();
  writeList(list.filter(item => String(item.id) !== String(id)));
  deleteRemoteNotebookItem(id).catch(() => {});
}

function mark(question, status) {
  return upsert(question, { status: status || 'unknown' });
}

function addDailyPractice(question) {
  const q = normalizeQuestion(question);
  let list = [];
  try {
    list = wx.getStorageSync(DAILY_KEY) || [];
  } catch (e) {}
  if (!Array.isArray(list)) list = [];
  const exists = list.some(item => String(item.id) === String(q.id));
  if (!exists) {
    list.unshift(Object.assign({}, q, { addedAt: new Date().toISOString() }));
    try {
      wx.setStorageSync(DAILY_KEY, list.slice(0, 30));
    } catch (e) {}
  }
  syncDailyPractice(q).catch(() => {});
  return q;
}

function removeDailyPractice(id) {
  let list = [];
  try {
    list = wx.getStorageSync(DAILY_KEY) || [];
  } catch (e) {}
  if (!Array.isArray(list)) list = [];
  try {
    wx.setStorageSync(DAILY_KEY, list.filter(item => String(item.id) !== String(id)));
  } catch (e) {}
  deleteRemoteDailyPractice(id).catch(() => {});
}

function getDailyPractice() {
  try {
    const list = wx.getStorageSync(DAILY_KEY);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function getStats() {
  const list = readList();
  const daily = getDailyPractice();
  return {
    total: list.length,
    unknown: list.filter(item => item.status === 'unknown').length,
    mastered: list.filter(item => item.status === 'mastered').length,
    daily: daily.length
  };
}

function buildReferenceAnswer(question) {
  const q = normalizeQuestion(question);
  if (q.answer) return q.answer;
  return [
    `参考思路：先直接回应「${q.title}」。`,
    '1. 用一句话给出结论，避免一开始铺太多背景。',
    '2. 如果是行为题，按 Situation / Task / Action / Result 展开，并补充量化结果。',
    '3. 如果是技术题，先讲核心原理，再补充适用场景、边界和项目中的真实例子。',
    '4. 结尾主动复盘你学到了什么，以及下一次会如何做得更好。'
  ].join('\n');
}

function fetchRemoteNotebook() {
  if (!hasToken()) return Promise.resolve(readList());
  return apiClient.request({
    path: '/api/career-assets/interview-notebook',
    noCache: true,
    timeout: 12000
  }).then(res => {
    if (!res || res.code !== 0 || !Array.isArray(res.data)) return readList();
    const remote = res.data.map(normalizeRemoteQuestion);
    writeList(remote);
    return remote;
  }).catch(() => readList());
}

function fetchRemoteDailyPractice() {
  if (!hasToken()) return Promise.resolve(getDailyPractice());
  return apiClient.request({
    path: '/api/career-assets/interview-daily-practice',
    noCache: true,
    timeout: 12000
  }).then(res => {
    if (!res || res.code !== 0 || !Array.isArray(res.data)) return getDailyPractice();
    const remote = res.data.map(normalizeRemoteQuestion);
    try { wx.setStorageSync(DAILY_KEY, remote); } catch (e) {}
    return remote;
  }).catch(() => getDailyPractice());
}

function syncNotebookItem(item) {
  if (!hasToken() || !item || !item.id || !item.title) return Promise.resolve(item);
  return apiClient.post({
    path: '/api/career-assets/interview-notebook',
    body: item,
    timeout: 15000
  }).then(res => {
    if (res && res.code === 0 && res.data) return normalizeRemoteQuestion(res.data);
    return item;
  });
}

function syncDailyPractice(item) {
  if (!hasToken() || !item || !item.id || !item.title) return Promise.resolve(item);
  return apiClient.post({
    path: '/api/career-assets/interview-daily-practice',
    body: item,
    timeout: 15000
  }).then(res => {
    if (res && res.code === 0 && res.data) return normalizeRemoteQuestion(res.data);
    return item;
  });
}

function deleteRemoteNotebookItem(id) {
  if (!hasToken() || !id) return Promise.resolve();
  return apiClient._write({
    method: 'DELETE',
    path: '/api/career-assets/interview-notebook/' + encodeURIComponent(id),
    timeout: 15000
  }).catch(() => {});
}

function deleteRemoteDailyPractice(id) {
  if (!hasToken() || !id) return Promise.resolve();
  return apiClient._write({
    method: 'DELETE',
    path: '/api/career-assets/interview-daily-practice/' + encodeURIComponent(id),
    timeout: 15000
  }).catch(() => {});
}

module.exports = {
  readList,
  getItem,
  upsert,
  remove,
  mark,
  addDailyPractice,
  removeDailyPractice,
  getDailyPractice,
  getStats,
  buildReferenceAnswer,
  fetchRemoteNotebook,
  fetchRemoteDailyPractice,
  syncNotebookItem,
  syncDailyPractice
};
