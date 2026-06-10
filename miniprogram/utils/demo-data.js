// Development-only fixture access. Production pages should not import mock-data directly.

const config = require('./app-config.js');

function enabled() {
  return config.ENABLE_DEMO_FALLBACK === true;
}

function readFixtures() {
  if (!enabled()) return {};
  return require('./mock-data.js');
}

function get(name) {
  return readFixtures()[name];
}

function getList(name) {
  const value = get(name);
  return Array.isArray(value) ? value : [];
}

function getMap(name) {
  const value = get(name);
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

module.exports = { enabled, get, getList, getMap };
