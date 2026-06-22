const SEARCH_JOB_IDS_KEY = 'jobSearchSkillRecentJobIds';
let memoryJobIds = [];

function getStorage() {
  return typeof wx !== 'undefined' && wx && wx.getStorageSync ? wx : null;
}

function getToken() {
  const storage = getStorage();
  if (!storage) return '';
  try {
    return storage.getStorageSync('token') || '';
  } catch (e) {
    return '';
  }
}

function getAuthHeader() {
  const token = getToken();
  return token ? { Authorization: 'Bearer ' + token } : {};
}

function rememberJobIds(ids) {
  const cleanIds = (ids || []).map(id => String(id || '').trim()).filter(Boolean);
  memoryJobIds = cleanIds;
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setStorageSync(SEARCH_JOB_IDS_KEY, {
      ids: cleanIds,
      t: Date.now()
    });
  } catch (e) {}
}

function hasRecentJobId(jobId) {
  const id = String(jobId || '').trim();
  if (!id) return false;
  const storage = getStorage();
  if (!storage) return memoryJobIds.includes(id);
  try {
    const record = storage.getStorageSync(SEARCH_JOB_IDS_KEY);
    const fresh = record && Array.isArray(record.ids) && (Date.now() - (record.t || 0)) < 30 * 60 * 1000;
    if (fresh) return record.ids.includes(id);
  } catch (e) {}
  return memoryJobIds.includes(id);
}

module.exports = {
  getToken,
  getAuthHeader,
  rememberJobIds,
  hasRecentJobId
};
