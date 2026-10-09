const ALLOWED_QUERY_KEYS = new Set(['targeted', 'resumeId', 'applicationId']);

function forwardQuery(options) {
  return Object.keys(options || {})
    .filter(key => ALLOWED_QUERY_KEYS.has(key))
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(String(options[key] || ''))}`)
    .join('&');
}

Page({
  onLoad(options = {}) {
    const query = forwardQuery(options);
    wx.redirectTo({
      url: '/package-career/pages/resume-center/resume-center' + (query ? `?${query}` : ''),
      fail: () => wx.showToast({ title: '简历中心打开失败，请重试', icon: 'none' })
    });
  }
});
