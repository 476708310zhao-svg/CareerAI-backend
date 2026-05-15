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
    this.setData({ url });
  }
});
