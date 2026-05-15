// pages/about/about.js
Page({
  data: {
    version: '1.0.0',
    stats: [
      { value: 'AI', label: '求职助手' },
      { value: '12+', label: '智能功能' },
      { value: 'Offer', label: '目标导向' }
    ],
    features: [
      { icon: '/images/application.png', title: '智能求职', desc: '基于简历、偏好和目标岗位推荐机会' },
      { icon: '/images/interview.png', title: 'AI模拟面试', desc: '围绕岗位生成问答、评分和复盘建议' },
      { icon: '/images/salary.png', title: '薪资查询', desc: '辅助判断岗位薪资区间和城市差异' },
      { icon: '/images/experience.png', title: '面经题库', desc: '沉淀真题、面经和复习重点' }
    ],
    values: [
      { title: '更少信息差', desc: '把职位、公司、面经、校招和网申进度集中到一个工作台。' },
      { title: '更强行动感', desc: '从完善资料、生成规划到模拟面试，减少“下一步做什么”的犹豫。' },
      { title: '更贴近留学生', desc: '围绕海外背景、跨地区投递和中英文面试场景设计体验。' }
    ]
  },

  copyEmail() {
    wx.setClipboardData({
      data: 'support@jobassistant.com',
      success: () => wx.showToast({ title: '已复制邮箱', icon: 'success' })
    });
  }
})
