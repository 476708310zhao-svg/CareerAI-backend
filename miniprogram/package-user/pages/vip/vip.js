Page({
  onLoad() {
    wx.setNavigationBarColor({
      frontColor: '#000000',
      backgroundColor: '#ffffff'
    });
  },

  scrollToTop() {
    wx.pageScrollTo({
      scrollTop: 0,
      duration: 280
    });
  },

  handlePay() {
    wx.showModal({
      title: '会员开通筹备中',
      content: '当前版本仅展示会员权益说明，暂不提供在线购买。微信支付和权益校验完成后会开放开通入口。',
      confirmText: '知道了',
      showCancel: false
    });
  }
});
