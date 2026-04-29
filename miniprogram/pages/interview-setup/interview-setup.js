// pages/interview-setup/interview-setup.js
const { sendChatToDeepSeek } = require('../../utils/api.js');
const matcher = require('../../utils/matcher.js');

Page({
  data: {
    profileHint: '', // 显示"根据你的资料预填"提示

    // 面试类型
    interviewTypes: [
      { id: 'behavior', name: '行为面试', icon: '🗣️', desc: '考察沟通、领导力、团队协作' },
      { id: 'technical', name: '技术面试', icon: '💻', desc: '考察编程、系统设计能力' },
      { id: 'case', name: '案例面试', icon: '📊', desc: '考察分析与解决问题能力' },
      { id: 'product', name: '产品面试', icon: '🎯', desc: '考察产品思维与用户洞察' }
    ],
    selectedType: '',

    // 目标公司
    hotCompanies: ['Google', 'Meta', 'Amazon', 'Apple', 'Microsoft', '字节跳动', '腾讯', '阿里巴巴'],
    companyInput: '',

    // 目标岗位
    hotPositions: ['Software Engineer', 'Product Manager', 'Data Scientist', 'Frontend Developer', 'Backend Developer', '产品经理', '算法工程师'],
    positionInput: '',

    // 面试难度
    difficulties: [
      { id: 'easy', name: '入门级', desc: '适合应届生' },
      { id: 'medium', name: '中级', desc: '1-3年经验' },
      { id: 'hard', name: '高级', desc: '3年以上经验' }
    ],
    selectedDifficulty: 'medium',

    // 题目数量
    questionCounts: [3, 5, 8, 10],
    selectedCount: 5
  },

  onLoad() {
    const profile = wx.getStorageSync('userProfile');
    if (!profile) return;
    const preset = matcher.getInterviewPreset(profile);
    const hints = [];
    const patch = {};
    if (preset.type) {
      patch.selectedType = preset.type;
      hints.push('面试类型');
    }
    if (preset.position) {
      patch.positionInput = preset.position;
      hints.push('目标岗位');
    }
    if (preset.difficulty) {
      patch.selectedDifficulty = preset.difficulty;
      hints.push('难度');
    }
    if (hints.length) {
      patch.profileHint = '已根据你的资料预填：' + hints.join('、');
    }
    if (Object.keys(patch).length) this.setData(patch);
  },

  // 选择面试类型
  selectType(e) {
    this.setData({ selectedType: e.currentTarget.dataset.id });
  },

  // 选择热门公司
  selectCompany(e) {
    this.setData({ companyInput: e.currentTarget.dataset.name });
  },

  // 输入公司名
  onCompanyInput(e) {
    this.setData({ companyInput: e.detail.value });
  },

  // 选择热门岗位
  selectPosition(e) {
    this.setData({ positionInput: e.currentTarget.dataset.name });
  },

  // 输入岗位名
  onPositionInput(e) {
    this.setData({ positionInput: e.detail.value });
  },

  // 选择难度
  selectDifficulty(e) {
    this.setData({ selectedDifficulty: e.currentTarget.dataset.id });
  },

  // 选择题目数量
  selectCount(e) {
    this.setData({ selectedCount: parseInt(e.currentTarget.dataset.count, 10) });
  },

  // 开始面试
  startInterview() {
    const { selectedType, companyInput, positionInput, selectedDifficulty, selectedCount } = this.data;

    if (!selectedType) {
      wx.showToast({ title: '请选择面试类型', icon: 'none' });
      return;
    }

    if (!positionInput) {
      wx.showToast({ title: '请输入目标岗位', icon: 'none' });
      return;
    }

    // 构建面试参数，传递给面试对话页
    const params = {
      type: selectedType,
      company: companyInput || '未指定公司',
      position: positionInput,
      difficulty: selectedDifficulty,
      questionCount: selectedCount
    };

    const query = Object.keys(params).map(k => `${k}=${encodeURIComponent(params[k])}`).join('&');

    wx.navigateTo({
      url: `/pages/interview-dialog/interview-dialog?${query}`
    });
  }
});
