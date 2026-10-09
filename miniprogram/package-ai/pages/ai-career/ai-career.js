const ALLOWED_QUERY_KEYS = new Set(['action', 'applicationId', 'prompt']);

Page({
  onLoad(options = {}) {
    const query = Object.keys(options)
      .filter(key => ALLOWED_QUERY_KEYS.has(key))
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(String(options[key] || ''))}`)
      .join('&');
    wx.redirectTo({ url: '/package-ai/pages/ai-assistant/ai-assistant' + (query ? `?${query}` : ''),
      fail: () => wx.showToast({ title: 'AI 助手打开失败，请重试', icon: 'none' })
    });
  }
});
