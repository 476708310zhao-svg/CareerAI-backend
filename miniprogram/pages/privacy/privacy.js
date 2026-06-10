// pages/privacy/privacy.js
Page({
  data: {
    updateDate: '2026-06-02',
    appName: '职引',
    contactEmail: '476708310@qq.com'
  },

  openWechatPrivacy() {
    if (!wx.openPrivacyContract) {
      wx.showToast({ title: '当前微信版本暂不支持打开隐私指引', icon: 'none' });
      return;
    }
    wx.openPrivacyContract({
      fail: () => wx.showToast({ title: '请稍后重试', icon: 'none' })
    });
  }
});
