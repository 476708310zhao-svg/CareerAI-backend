const config = require('../../../utils/app-config.js');

function getHost(url) {
  const match = String(url || '').match(/^https?:\/\/([^/?#:]+)/i);
  return match ? match[1].toLowerCase() : '';
}

function isAllowedWebviewUrl(url) {
  if (config.ALLOW_EXTERNAL_WEBVIEW) return true;
  const host = getHost(url);
  const allowed = config.WEBVIEW_ALLOWED_DOMAINS || [];
  return allowed.some(domain => {
    const normalized = String(domain || '').toLowerCase();
    return host === normalized || host.endsWith('.' + normalized);
  });
}

Page({
  data: {
    url: ''
  },

  onLoad(options) {
    const url = options.url ? decodeURIComponent(options.url) : '';
    if (!/^https?:\/\//i.test(url)) {
      wx.showToast({ title: '链接无效', icon: 'none' });
      return;
    }

    if (!isAllowedWebviewUrl(url)) {
      wx.setClipboardData({
        data: url,
        success: () => {
          wx.showModal({
            title: '链接已复制',
            content: '该外部网页暂不在小程序内打开。请在浏览器中粘贴链接继续访问。',
            showCancel: false,
            complete: () => this.goBackSafe()
          });
        },
        fail: () => this.goBackSafe()
      });
      return;
    }

    this.setData({ url });
  },

  goBackSafe() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
    }
  }
});
