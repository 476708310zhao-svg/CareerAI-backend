// pages/about/about.js
Page({
  data: {
    version: '1.0.0',
    features: [
      { icon: '/images/application.png', title: '智能求职', desc: 'AI驱动的职位推荐与匹配' },
      { icon: '/images/interview.png', title: 'AI模拟面试', desc: 'DeepSeek驱动的真实面试体验' },
      { icon: '/images/salary.png', title: '薪资查询', desc: '全球薪资数据实时查询' },
      { icon: '/images/experience.png', title: '面经题库', desc: '海量真题与经验分享' }
    ]
  },

  copyEmail() {
    wx.setClipboardData({
      data: 'support@jobassistant.com',
      success: () => wx.showToast({ title: '已复制邮箱', icon: 'success' })
    });
  }
})
