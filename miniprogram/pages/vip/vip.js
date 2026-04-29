// pages/vip/vip.js
const { createPayOrder, mockConfirmPay, verifyOrder } = require('../../utils/api-payment.js');
const { login } = require('../../utils/api.js');

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

    useCases: [
      { avatar: '👩‍💻', name: 'Sarah L.', role: 'Data Analyst @ Goldman Sachs',  story: '用AI模拟面试练习18次，精准击中高频行为题',    metric: '面试通过率', value: '3x提升', tag: '金融' },
      { avatar: '🧑‍🎓', name: 'Kevin Z.', role: 'SWE Intern @ TikTok',          story: 'AI出题+LeetCode刷了200道算法题，1个月上岸', metric: '备考周期',   value: '缩短60%', tag: '算法' },
      { avatar: '👨‍💼', name: 'Mike W.',  role: 'PM @ McKinsey',                story: 'AI公司洞察提前了解面试风格，行为面试一轮过',  metric: '面试准备',   value: '有的放矢', tag: '咨询' },
      { avatar: '👩‍🔬', name: 'Lily C.',  role: 'DS @ Amazon',                  story: 'AI项目生成器生成3段经历，简历回复率大幅提升', metric: '简历回复率', value: '提升40%', tag: '数据' }
    ],

    aiFeatures: [
      { icon: '🤖', name: 'AI 模拟面试',    desc: '无限次真实对话面试',     url: '/pages/interview-setup/interview-setup',   badge: '热门' },
      { icon: '🗺️', name: '求职路线规划',   desc: '3/6/12月定制路线图',    url: '/pages/career-planner/career-planner',     badge: '' },
      { icon: '🎯', name: 'AI 项目生成器',  desc: '一键生成量化项目经历',  url: '/pages/project-builder/project-builder',   badge: 'NEW' },
      { icon: '🏢', name: '公司深度报告',   desc: '面试风格+高频题洞察',   url: '/pages/company-detail/company-detail',     badge: '' },
      { icon: '💼', name: 'Offer 决策助手', desc: 'AI 多维度对比两份Offer', url: '/pages/offer-compare/offer-compare',       badge: 'NEW' },
      { icon: '📝', name: '简历优化诊断',   desc: '深度分析+改写建议',     url: '/pages/resume/resume',                     badge: '' },
      { icon: '🎭', name: '行为面试模板库', desc: '12个STAR模板+AI改写',   url: '/pages/star-library/star-library',         badge: '' },
      { icon: '🔬', name: '项目经历优化',   desc: 'AI拆解+STAR重构+评分',  url: '/pages/project-review/project-review',     badge: 'NEW' },
      { icon: '📈', name: '求职趋势洞察',   desc: '热门岗位/薪资/难度趋势', url: '/pages/job-insights/job-insights',         badge: '' },
      { icon: '🚀', name: '技能成长路径',   desc: '个性化技能树+学习计划', url: '/pages/skill-pathways/skill-pathways',     badge: '' },
      { icon: '🎙️', name: '语音面试练习',  desc: 'ASR 语音转文字作答',    url: '/pages/interview-dialog/interview-dialog', badge: '' },
      { icon: '📋', name: '求职日报',        desc: 'AI 每日求职进展总结',   url: '/pages/daily-brief/daily-brief',           badge: 'NEW' }
    ],

    compareList: [
      { feature: 'AI模拟面试',   free: '每月1次',  vip: '无限次' },
      { feature: '简历版本数',   free: '1份',      vip: '5份' },
      { feature: '每日投递上限', free: '10个',     vip: '无限制' },
      { feature: '薪资报告',     free: '概览',     vip: '完整+趋势' },
      { feature: '精华面经',     free: '不可查看', vip: '全部解锁' },
      { feature: 'AI 功能',      free: '受限',     vip: '12项全开' }
    ],

    showCompare: false,
    userName: '',
    userVipInfo: { isVip: false, expireDate: '' }
  },

  onLoad() {
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
