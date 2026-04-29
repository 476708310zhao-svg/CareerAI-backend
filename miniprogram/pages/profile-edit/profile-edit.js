// pages/profile-edit/profile-edit.js
const config = require('../../utils/config.js');
const API_BASE = config.API_BASE_URL;

Page({
  data: {
    avatarPreview: '',  // 仅用于上传失败时的临时 UI 预览，不会被保存
    userInfo: {
      nickName: '',
      avatarUrl: '',
      school: '',
      major: '',
      status: '',          // 'student' | 'fresh' | 'working'
      gradYear: '',        // '2025'
      targetRoles: [],     // ['Software Engineer', ...]
      targetLocation: [],  // ['美国', ...]
      skills: [],          // ['Python', ...]
    },

    // 预设选项
    statusOptions: [
      { id: 'student', label: '在读学生' },
      { id: 'fresh',   label: '应届毕业' },
      { id: 'working', label: '工作中' },
    ],
    gradYearOptions: ['2024', '2025', '2026', '2027', '2028'],
    rolePresets: [
      '软件工程师', '产品经理', '数据分析师', 'AI/机器学习',
      '前端工程师', '后端工程师', '全栈工程师', 'DevOps/SRE',
      'UX/UI 设计师', '市场营销', '运营', '量化研究员',
      '咨询顾问', '金融分析师', '商业分析师',
    ],
    locationPresets: ['国内', '美国', '加拿大', '英国', '新加坡', '澳大利亚'],
    skillPresets: [
      'Python', 'Java', 'JavaScript', 'TypeScript', 'C++', 'Go',
      'React', 'Vue', 'Node.js', 'SQL', '机器学习',
      '数据分析', 'AWS', 'Docker', 'Git', '产品管理',
    ],

    customRoleInput: '',
    customSkillInput: '',

    completeness: 0,
  },

  onLoad() {
    const cached = wx.getStorageSync('userProfile');
    if (cached) {
      this.setData({ userInfo: { ...this.data.userInfo, ...cached } });
    } else {
      // 尝试从简历自动填充
      this._autoFillFromResume();
    }
    this._calcCompleteness();
  },

  // ── 从简历自动读取 ──────────────────────────────────────────────────────
  _autoFillFromResume() {
    const resume = wx.getStorageSync('onlineResume');
    if (!resume) return;
    const patch = {};
    if (resume.basicInfo) {
      if (resume.basicInfo.name)  patch.nickName = resume.basicInfo.name;
    }
    if (resume.education && resume.education.length) {
      const edu = resume.education[0];
      if (edu.school) patch.school = edu.school;
      if (edu.major)  patch.major  = edu.major;
    }
    if (resume.skills && resume.skills.length) {
      patch.skills = resume.skills.slice(0, 12);
    }
    if (Object.keys(patch).length) {
      this.setData({ userInfo: { ...this.data.userInfo, ...patch } });
    }
  },

  _calcCompleteness() {
    const u = this.data.userInfo;
    const checks = [
      u.nickName, u.school, u.major, u.status, u.gradYear,
      (u.targetRoles || []).length > 0,
      (u.targetLocation || []).length > 0,
      (u.skills || []).length > 0,
    ];
    const score = checks.reduce((s, c) => s + (c ? 12 : 0), 0);
    this.setData({ completeness: Math.min(score, 100) });
  },

  // ── 普通文本输入 ─────────────────────────────────────────────────────────
  onInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [`userInfo.${field}`]: e.detail.value });
    this._calcCompleteness();
  },

  // ── 单选切换（status / gradYear）─────────────────────────────────────────
  selectSingle(e) {
    const { field, value } = e.currentTarget.dataset;
    const current = this.data.userInfo[field];
    this.setData({ [`userInfo.${field}`]: current === value ? '' : value });
    this._calcCompleteness();
  },

  // ── 多选切换（targetLocation）────────────────────────────────────────────
  toggleLocation(e) {
    const { value } = e.currentTarget.dataset;
    const list = [...(this.data.userInfo.targetLocation || [])];
    const idx = list.indexOf(value);
    if (idx >= 0) list.splice(idx, 1); else list.push(value);
    this.setData({ 'userInfo.targetLocation': list });
    this._calcCompleteness();
  },

  // ── 目标岗位：预设切换 ───────────────────────────────────────────────────
  toggleRole(e) {
    const { value } = e.currentTarget.dataset;
    const list = [...(this.data.userInfo.targetRoles || [])];
    const idx = list.indexOf(value);
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      if (list.length >= 5) {
        wx.showToast({ title: '最多选5个岗位', icon: 'none' });
        return;
      }
      list.push(value);
    }
    this.setData({ 'userInfo.targetRoles': list });
    this._calcCompleteness();
  },

  // ── 目标岗位：自定义输入 ──────────────────────────────────────────────────
  onCustomRoleInput(e) {
    this.setData({ customRoleInput: e.detail.value });
  },

  addCustomRole() {
    const val = (this.data.customRoleInput || '').trim();
    if (!val) return;
    const list = [...(this.data.userInfo.targetRoles || [])];
    if (list.includes(val)) {
      wx.showToast({ title: '已添加过该岗位', icon: 'none' });
      return;
    }
    if (list.length >= 5) {
      wx.showToast({ title: '最多选5个岗位', icon: 'none' });
      return;
    }
    list.push(val);
    this.setData({ 'userInfo.targetRoles': list, customRoleInput: '' });
    this._calcCompleteness();
  },

  removeRole(e) {
    const { value } = e.currentTarget.dataset;
    const list = (this.data.userInfo.targetRoles || []).filter(r => r !== value);
    this.setData({ 'userInfo.targetRoles': list });
    this._calcCompleteness();
  },

  // ── 技能标签：预设切换 ───────────────────────────────────────────────────
  toggleSkill(e) {
    const { value } = e.currentTarget.dataset;
    const list = [...(this.data.userInfo.skills || [])];
    const idx = list.indexOf(value);
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      if (list.length >= 20) {
        wx.showToast({ title: '最多添加20个技能', icon: 'none' });
        return;
      }
      list.push(value);
    }
    this.setData({ 'userInfo.skills': list });
    this._calcCompleteness();
  },

  onCustomSkillInput(e) {
    this.setData({ customSkillInput: e.detail.value });
  },

  addCustomSkill() {
    const val = (this.data.customSkillInput || '').trim();
    if (!val) return;
    const list = [...(this.data.userInfo.skills || [])];
    if (list.includes(val)) {
      wx.showToast({ title: '已添加', icon: 'none' });
      return;
    }
    if (list.length >= 20) {
      wx.showToast({ title: '最多添加20个技能', icon: 'none' });
      return;
    }
    list.push(val);
    this.setData({ 'userInfo.skills': list, customSkillInput: '' });
    this._calcCompleteness();
  },

  removeSkill(e) {
    const { value } = e.currentTarget.dataset;
    const list = (this.data.userInfo.skills || []).filter(s => s !== value);
    this.setData({ 'userInfo.skills': list });
    this._calcCompleteness();
  },

  // ── 头像 ─────────────────────────────────────────────────────────────────
  changeAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        wx.showLoading({ title: '上传中...', mask: true });
        wx.compressImage({
          src: tempFilePath,
          quality: 80,
          complete: (compRes) => {
            const filePath = compRes.tempFilePath || tempFilePath;
            this._uploadAvatar(filePath);
          }
        });
      }
    });
  },

  _uploadAvatar(filePath) {
    const token = wx.getStorageSync('token') || '';
    wx.uploadFile({
      url: API_BASE + '/api/upload/avatar',
      filePath,
      name: 'file',
      header: { 'Authorization': 'Bearer ' + token },
      success: (res) => {
        wx.hideLoading();
        try {
          const data = JSON.parse(res.data);
          if (data.code === 0 && data.data && data.data.url) {
            const serverUrl = API_BASE + data.data.url;
            this.setData({ 'userInfo.avatarUrl': serverUrl });
            wx.showToast({ title: '头像已更新', icon: 'success' });
          } else {
            // 上传失败：只做 UI 预览，不写入 userInfo（保存时不持久化临时路径）
            this._tempAvatarPreview = filePath;
            this.setData({ avatarPreview: filePath });
            wx.showToast({ title: '上传失败，请重试', icon: 'none' });
          }
        } catch (e) {
          this._tempAvatarPreview = filePath;
          this.setData({ avatarPreview: filePath });
          wx.showToast({ title: '上传失败，请重试', icon: 'none' });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '网络异常，头像上传失败', icon: 'none' });
        // 网络失败：不更新任何头像状态，保留原头像
      }
    });
  },

  // ── 保存 ─────────────────────────────────────────────────────────────────
  handleSave() {
    const u = this.data.userInfo;
    if (!u.nickName && !u.school && !u.major) {
      wx.showToast({ title: '请至少填写一项基本信息', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '保存中...', mask: true });

    // 先保存到本地
    wx.setStorageSync('userProfile', u);
    getApp().refreshGlobalData();

    // 同步昵称、头像到服务器（后台静默，不阻塞 UI）
    const token = wx.getStorageSync('token');
    if (token && u.nickName) {
      wx.request({
        url: API_BASE + '/api/users/update-profile',
        method: 'POST',
        header: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        data: { nickname: u.nickName, avatar: u.avatarUrl },
        fail: () => {} // 静默失败
      });
    }

    wx.hideLoading();
    wx.showToast({ title: '保存成功', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 800);
  }
});
