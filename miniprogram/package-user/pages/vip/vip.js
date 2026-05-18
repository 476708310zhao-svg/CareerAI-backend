// pages/vip/vip.js
const { createPayOrder, mockConfirmPay, verifyOrder } = require('../../../utils/api-payment.js');
const { login } = require('../../../utils/api.js');

Page({
  data: {
    selectedPlan: 1,
    isPaying: false,
    payConfigured: false,   // 是否已配置真实微信支付

    priceList: [
      { id: 0, name: '月卡会员', price: '19.9', original: '29.9', tip: '',      day: '30天',  perDay: '0.66', save: '10.0' },
      { id: 1, name: '季卡会员', price: '49.9', original: '89.7', tip: '超值推荐', day: '90天', perDay: '0.55', save: '39.8' },
      { id: 2, name: '年卡会员', price: '199',  original: '358',  tip: '最划算', day: '365天', perDay: '0.54', save: '159'  }
    ],

    benefits: [
      { icon: '01', title: '无限 AI 模拟面试', desc: '围绕岗位生成真实追问、评分和复盘建议', tag: 'Unlimited' },
      { icon: '02', title: 'AI 深度简历优化', desc: '按 JD 重写亮点、量化成果并生成多版本', tag: '5x Resume' },
      { icon: '03', title: 'AI 求职路线规划', desc: '拆解 30/60/90 天求职行动路径', tag: 'Roadmap' },
      { icon: '04', title: 'AI 项目生成器', desc: '为目标岗位生成可写进简历的项目经历', tag: 'Portfolio' },
      { icon: '05', title: 'Offer 决策助手', desc: '对比薪资、成长、签证和长期机会', tag: 'Decision' },
      { icon: '06', title: 'AI 自动化求职工作流', desc: '串联推荐、简历、网申、面试和复盘', tag: 'Agent' }
    ],

    workflowSteps: [
      { title: '推荐岗位', desc: '筛选英国 Data Analyst 机会', status: '完成' },
      { title: '优化简历', desc: '按岗位 JD 重写项目与技能', status: '执行中' },
      { title: '生成网申', desc: '准备申请材料和动机说明', status: '排队' },
      { title: '管理投递', desc: '记录进度、提醒下一步动作', status: '排队' },
      { title: '面试准备', desc: '生成题库、评分与复盘计划', status: '排队' }
    ],
    dashboardSteps: [
      { title: '推荐岗位', desc: '筛选英国 Data Analyst 机会', status: '完成' },
      { title: '优化简历', desc: '按岗位 JD 重写项目与技能', status: '执行中' },
      { title: '生成网申', desc: '准备申请材料和动机说明', status: '排队' },
      { title: '管理投递', desc: '记录进度、提醒下一步动作', status: '排队' }
    ],

    audienceList: [
      { title: '北美留学生', desc: '面向实习、校招和全职投递，建立清晰求职节奏。' },
      { title: '英国工签求职', desc: '围绕岗位匹配、简历定位和面试准备加速行动。' },
      { title: '大厂校招', desc: '集中准备算法、行为面试、项目经历和公司研究。' },
      { title: '转专业求职', desc: '把课程、项目和经历转译成目标岗位语言。' },
      { title: '海外实习', desc: '快速生成投递材料，追踪申请与面试节点。' }
    ],

    useCases: [
      { avatar: '👩‍💻', name: 'Sarah L.', role: 'Data Analyst @ Goldman Sachs',  story: '用AI模拟面试练习18次，精准击中高频行为题',    metric: '面试通过率', value: '3x提升', tag: '金融' },
      { avatar: '🧑‍🎓', name: 'Kevin Z.', role: 'SWE Intern @ TikTok',          story: 'AI出题+LeetCode刷了200道算法题，1个月上岸', metric: '备考周期',   value: '缩短60%', tag: '算法' },
      { avatar: '👨‍💼', name: 'Mike W.',  role: 'PM @ McKinsey',                story: 'AI公司洞察提前了解面试风格，行为面试一轮过',  metric: '面试准备',   value: '有的放矢', tag: '咨询' },
      { avatar: '👩‍🔬', name: 'Lily C.',  role: 'DS @ Amazon',                  story: 'AI项目生成器生成3段经历，简历回复率大幅提升', metric: '简历回复率', value: '提升40%', tag: '数据' }
    ],

    aiFeatures: [
      { icon: '🤖', name: 'AI 模拟面试',    desc: '无限次真实对话面试',     url: '/package-ai/pages/interview-setup/interview-setup',   badge: '热门' },
      { icon: '🗺️', name: '求职路线规划',   desc: '3/6/12月定制路线图',    url: '/package-career/pages/career-planner/career-planner',     badge: '' },
      { icon: '🎯', name: 'AI 项目生成器',  desc: '一键生成量化项目经历',  url: '/package-career/pages/project-builder/project-builder',   badge: 'NEW' },
      { icon: '🏢', name: '公司深度报告',   desc: '面试风格+高频题洞察',   url: '/package-user/pages/company-detail/company-detail',     badge: '' },
      { icon: '💼', name: 'Offer 决策助手', desc: 'AI 多维度对比两份Offer', url: '/package-career/pages/offer-compare/offer-compare',       badge: 'NEW' },
      { icon: '📝', name: '简历优化诊断',   desc: '深度分析+改写建议',     url: '/package-career/pages/resume/resume',                     badge: '' },
      { icon: '🎭', name: '行为面试模板库', desc: '12个STAR模板+AI改写',   url: '/package-content/pages/star-library/star-library',         badge: '' },
      { icon: '🔬', name: '项目经历优化',   desc: 'AI拆解+STAR重构+评分',  url: '/package-ai/pages/project-review/project-review',     badge: 'NEW' },
      { icon: '📈', name: '求职趋势洞察',   desc: '热门岗位/薪资/难度趋势', url: '/package-career/pages/job-insights/job-insights',         badge: '' },
      { icon: '🚀', name: '技能成长路径',   desc: '个性化技能树+学习计划', url: '/package-career/pages/skill-pathways/skill-pathways',     badge: '' },
      { icon: '🎙️', name: '语音面试练习',  desc: 'ASR 语音转文字作答',    url: '/package-ai/pages/interview-dialog/interview-dialog', badge: '' },
      { icon: '📋', name: '求职日报',        desc: 'AI 每日求职进展总结',   url: '/package-ai/pages/daily-brief/daily-brief',           badge: 'NEW' }
    ],

    compareList: [
      { feature: 'AI 面试次数', free: '每月 1 次', vip: '无限次模拟 + 复盘' },
      { feature: '简历版本', free: '1 份基础版', vip: '多岗位版本 + JD 定制' },
      { feature: 'AI 项目生成', free: '不可用', vip: '按岗位生成项目经历' },
      { feature: 'Offer 分析', free: '不可用', vip: '薪资/成长/签证多维对比' },
      { feature: '高级薪资数据', free: '概览', vip: '城市/岗位/趋势完整报告' },
      { feature: '校招提醒', free: '基础提醒', vip: '关键节点 + 行动建议' },
      { feature: 'AI 工作流', free: '单点工具', vip: 'Agent 串联完整求职流程' }
    ],

    showCompare: false,
    userName: '',
    userVipInfo: { isVip: false, expireDate: '' }
  },

  onLoad() {
    wx.setNavigationBarColor({
      frontColor: '#000000',
      backgroundColor: '#ffffff'
    });

    // 读本地 VIP 状态
    const vipInfo = wx.getStorageSync('vipInfo');
    if (vipInfo && vipInfo.isVip) {
      const expired = vipInfo.expireDate && new Date(vipInfo.expireDate) < new Date();
      if (expired) {
        vipInfo.isVip = false;
        wx.setStorageSync('vipInfo', vipInfo);
        wx.showToast({ title: 'VIP 已过期', icon: 'none' });
      }
      this.setData({ userVipInfo: vipInfo });
    }
    const profile = wx.getStorageSync('userProfile');
    if (profile) {
      this.setData({ userName: profile.nickName || profile.name || '' });
    }
  },

  selectPlan(e) {
    this.setData({ selectedPlan: e.currentTarget.dataset.index });
  },

  toggleCompare() {
    this.setData({ showCompare: !this.data.showCompare });
  },

  jumpBenefits() {
    wx.pageScrollTo({ selector: '#benefits', duration: 280 });
  },

  goToFeature(e) {
    const url = e.currentTarget.dataset.url;
    if (url) wx.navigateTo({ url });
  },

  // ── 支付入口 ────────────────────────────────────────────────────
  handlePay() {
    if (this.data.isPaying) return;

    // 检查登录态
    const token = wx.getStorageSync('token');
    if (!token) {
      wx.showModal({
        title: '请先登录',
        content: '开通 VIP 需要登录账户，是否立即登录？',
        confirmText: '登录',
        success: (res) => {
          if (res.confirm) {
            login().then(() => this._doPay()).catch(() => {
              wx.showToast({ title: '登录失败，请重试', icon: 'none' });
            });
          }
        }
      });
      return;
    }

    this._doPay();
  },

  _doPay() {
    const plan = this.data.priceList[this.data.selectedPlan];
    wx.showModal({
      title: '确认开通',
      content: `开通 ${plan.name}\n有效期 ${plan.day} · 合计 ¥${plan.price}`,
      confirmText: '确认支付',
      confirmColor: '#D97706',
      success: (res) => {
        if (!res.confirm) return;
        this.setData({ isPaying: true });
        this._createAndPay(this.data.selectedPlan);
      }
    });
  },

  _createAndPay(planId) {
    wx.showLoading({ title: '创建订单...', mask: true });

    createPayOrder(planId)
      .then(order => {
        wx.hideLoading();

        if (order.mock) {
          // ── Mock 模式：模拟支付弹窗 ──────────────────────────
          wx.showModal({
            title: '🧪 模拟支付',
            content: `【开发测试模式】\n套餐：${order.planName}\n金额：¥${(order.amount / 100).toFixed(2)}\n\n点击确认完成模拟支付`,
            confirmText: '确认支付',
            confirmColor: '#D97706',
            success: (res) => {
              if (!res.confirm) {
                this.setData({ isPaying: false });
                return;
              }
              wx.showLoading({ title: '支付处理中...', mask: true });
              mockConfirmPay(order.orderNo)
                .then(result => {
                  wx.hideLoading();
                  this._onPaySuccess(result.planName, result.expireDate);
                })
                .catch(err => {
                  wx.hideLoading();
                  this.setData({ isPaying: false });
                  wx.showToast({ title: err.message || '支付失败', icon: 'none' });
                });
            }
          });
        } else {
          // ── 真实微信支付 ──────────────────────────────────────
          wx.requestPayment({
            timeStamp: order.timeStamp,
            nonceStr:  order.nonceStr,
            package:   order.package,
            signType:  order.signType || 'MD5',
            paySign:   order.paySign,
            success: () => {
              // 支付成功后轮询验证
              wx.showLoading({ title: '支付验证中...', mask: true });
              this._pollVerify(order.orderNo, 0);
            },
            fail: (err) => {
              this.setData({ isPaying: false });
              if (err.errMsg && err.errMsg.includes('cancel')) {
                wx.showToast({ title: '已取消支付', icon: 'none' });
              } else {
                wx.showToast({ title: '支付失败，请重试', icon: 'none' });
              }
            }
          });
        }
      })
      .catch(err => {
        wx.hideLoading();
        this.setData({ isPaying: false });
        wx.showToast({ title: err.message || '创建订单失败', icon: 'none' });
      });
  },

  // 轮询订单状态（最多 5 次，每次 2 秒）
  _pollVerify(orderNo, attempt) {
    if (attempt >= 5) {
      wx.hideLoading();
      this.setData({ isPaying: false });
      wx.showModal({
        title: '支付确认中',
        content: '支付结果正在确认，请稍后在订单记录中查看',
        showCancel: false
      });
      return;
    }

    setTimeout(() => {
      verifyOrder(orderNo)
        .then(result => {
          if (result.status === 'paid') {
            wx.hideLoading();
            this._onPaySuccess(result.planName, result.expireDate);
          } else {
            this._pollVerify(orderNo, attempt + 1);
          }
        })
        .catch(() => this._pollVerify(orderNo, attempt + 1));
    }, 2000);
  },

  // 支付成功处理
  _onPaySuccess(planName, expireDate) {
    this.setData({ isPaying: false });

    const vipInfo = { isVip: true, planName, expireDate, purchaseDate: new Date().toISOString().split('T')[0] };
    wx.setStorageSync('vipInfo', vipInfo);
    const userInfo = wx.getStorageSync('userInfo') || {};
    wx.setStorageSync('userInfo', Object.assign({}, userInfo, {
      vipLevel: 1,
      vip_level: 1,
      vipExpiresAt: expireDate,
      vip_expires_at: expireDate
    }));
    this.setData({ userVipInfo: vipInfo });

    wx.showModal({
      title: '🎉 开通成功',
      content: `恭喜！已成功开通${planName}\n有效期至 ${expireDate}\n\n12项AI功能已全部解锁！`,
      showCancel: false,
      confirmText: '开始使用',
      success: () => wx.navigateBack()
    });
  },

  restorePurchase() {
    wx.showToast({ title: '未找到历史购买记录', icon: 'none' });
  }
});
