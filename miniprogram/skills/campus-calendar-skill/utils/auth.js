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

module.exports = {
  getToken,
  getAuthHeader
};
