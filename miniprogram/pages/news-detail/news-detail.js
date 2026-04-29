// pages/news-detail/news-detail.js
Page({
  data: {
    news: null,
    typeLabel: { news: '资讯', tip: '技巧', data: '数据', policy: '政策' },
    typeBgMap: { news: '#FA8C16', tip: '#2B5CE6', data: '#059669', policy: '#6C5CE7' }
  },

  onLoad(options) {
    const news = wx.getStorageSync('currentNewsDetail');
    if (news) {
      this.setData({ news });
      wx.setNavigationBarTitle({ title: news.title });
    } else {
      wx.showToast({ title: '内容加载失败', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  onBack() {
    wx.navigateBack();
  },

  onShareAppMessage() {
    const news = this.data.news;
    return {
      title: news ? news.title : '求职快讯',
      path: '/pages/news/news'
    };
  }
});
