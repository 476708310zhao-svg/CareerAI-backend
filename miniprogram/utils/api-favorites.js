const client = require('./api-client.js');

function list(options) {
  const opts = options || {};
  return client.request({
    path: '/api/favorites',
    params: { includeDeleted: opts.includeDeleted === false ? '0' : '1' },
    noCache: true,
    timeout: 12000
  });
}

function upsert(payload) {
  return client.post({ path: '/api/favorites', body: payload || {}, timeout: 15000 });
}

function remove(payload) {
  return client._write({ method: 'DELETE', path: '/api/favorites', body: payload || {}, timeout: 15000 });
}

module.exports = { list, upsert, remove };
