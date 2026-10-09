const PRIMARY_KEY = 'jobBrowseHistory';
const LEGACY_KEY = 'viewHistory';
const MAX_ITEMS = 20;
const ownerStorage = require('./owner-storage.js');

function normalize(item) {
  if (!item) return null;
  const id = item.id;
  if (id === undefined || id === null || id === '') return null;
  return {
    id: String(id),
    title: item.title || '',
    company: item.company || '',
    city: item.city || '',
    salary: item.salary || '',
    timestamp: item.timestamp || item.time || Date.now()
  };
}

function readRaw(key) {
  const value = ownerStorage.get(key, '', []);
  return Array.isArray(value) ? value : [];
}

function save(list) {
  const normalized = (list || []).map(normalize).filter(Boolean).slice(0, MAX_ITEMS);
  ownerStorage.set(PRIMARY_KEY, '', normalized);
  ownerStorage.set(LEGACY_KEY, '', normalized);
  return normalized;
}

function getList() {
  const merged = [];
  const seen = new Set();
  readRaw(PRIMARY_KEY).concat(readRaw(LEGACY_KEY)).forEach(item => {
    const normalized = normalize(item);
    if (!normalized || seen.has(normalized.id)) return;
    seen.add(normalized.id);
    merged.push(normalized);
  });
  merged.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  return save(merged);
}

function add(item) {
  const normalized = normalize(item);
  if (!normalized) return getList();
  const list = getList().filter(entry => entry.id !== normalized.id);
  list.unshift(Object.assign({}, normalized, { timestamp: Date.now() }));
  return save(list);
}

function clear() {
  ownerStorage.remove(PRIMARY_KEY);
  ownerStorage.remove(LEGACY_KEY);
}

module.exports = { add, getList, clear };
