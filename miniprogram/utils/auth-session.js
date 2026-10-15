// In-process generation of login/logout events. It supplements token equality:
// an A -> B -> A switch may reuse A's token without another API request in between.
let generation = 0;

function revision() { return generation; }
function markChanged() { generation += 1; return generation; }

function capture(storage) {
  let token = '';
  try { token = storage.getStorageSync('token') || ''; } catch (e) {}
  return { token, revision: generation };
}

function isCurrent(snapshot, storage) {
  if (!snapshot || snapshot.revision !== generation) return false;
  try { return (storage.getStorageSync('token') || '') === snapshot.token; }
  catch (e) { return false; }
}

function setToken(token, storage) {
  storage.setStorageSync('token', token);
  markChanged();
}

function clearToken(storage) {
  storage.removeStorageSync('token');
  markChanged();
}

module.exports = { revision, markChanged, capture, isCurrent, setToken, clearToken };
