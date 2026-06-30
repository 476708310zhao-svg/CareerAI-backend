// pages/profile-edit/profile-edit.js
const config = require('../../../utils/app-config.js');
const api = require('../../../utils/api.js');
const {
  PROFILE_SCHEMA,
  normalizeMultiValue,
  normalizeProfileStorage,
  buildProfilePayload
} = require('../../../utils/user-profile-schema.js');
const API_BASE = config.API_BASE_URL;

const MULTI_FIELD_CONFIG = {
  targetLocation: {
    title: '目标地区',
    source: 'locationPresets',
    placeholder: '搜索国家、地区或远程',
    max: 6,
    maxMessage: '最多选6个地区',
    allowCustom: false,
  },
  targetIndustries: {
    title: '目标行业',
    source: 'industryPresets',
    placeholder: '搜索行业方向',
    max: 6,
    maxMessage: '最多选6个行业',
    allowCustom: false,
  },
  targetRoles: {
    title: '目标岗位',
    source: 'rolePresets',
    placeholder: '搜索岗位名称',
    max: 5,
    maxMessage: '最多选5个岗位',
    allowCustom: true,
  },
  skills: {
    title: '技能标签',
    source: 'skillPresets',
    placeholder: '搜索技能关键词',
    max: 20,
    maxMessage: '最多添加20个技能',
    allowCustom: true,
  },
};

Page({
  data: {
    avatarPreview: '',  // 仅用于上传失败时的临时 UI 预览，不会被保存
    userInfo: {
      nickName: '',
      avatarUrl: '',
      school: '',
      major: '',
      degree: '',
      status: '',          // 'student' | 'fresh' | 'working'
      gradYear: '',        // '2025'
      targetRoles: [],     // ['Software Engineer', ...]
      targetLocation: [],  // ['美国', ...]
      targetIndustries: [],
      jobTypes: [],
      workAuthorization: '',
      expectedSalaryRange: '',
      skills: [],          // ['Python', ...]
    },

    // 预设选项
    statusOptions: PROFILE_SCHEMA.options.statusOptions,
    degreeOptions: PROFILE_SCHEMA.options.degreeOptions,
    gradYearOptions: PROFILE_SCHEMA.options.gradYearOptions,
    rolePresets: PROFILE_SCHEMA.options.roleOptions,
    roleOptions: [],
    locationPresets: PROFILE_SCHEMA.options.locationOptions,
    locationOptions: [],
    industryPresets: PROFILE_SCHEMA.options.industryOptions,
    industryOptions: [],
    jobTypePresets: PROFILE_SCHEMA.options.jobTypeOptions,
    jobTypeOptions: [],
    workAuthOptions: PROFILE_SCHEMA.options.workAuthOptions,
    skillPresets: [
      ...PROFILE_SCHEMA.options.skillOptions,
    ],
    skillOptions: [],

    customRoleInput: '',
    customSkillInput: '',
    selector: {
      visible: false,
      field: '',
      title: '',
      query: '',
      placeholder: '',
      allowCustom: false,
      max: 0,
      selected: [],
      filteredOptions: [],
    },

    completeness: 0,
  },

  onLoad(options) {
    // 从登录弹窗跳转过来时，提示用户设置真实昵称
    if (options.fromLogin === '1') {
      wx.showToast({ title: '请设置你的昵称和头像', icon: 'none', duration: 2500 });
    }

    const cached = wx.getStorageSync('userProfile');
    if (cached) {
      this.setData({ userInfo: this._normalizeUserInfo({ ...this.data.userInfo, ...cached }) });
    } else {
      // 尝试从简历自动填充
      this._autoFillFromResume();
    }
    this._loadProfileSchema();
    this._loadRemoteProfile();
    this._refreshLocationOptions();
    this._refreshIndustryOptions();
    this._refreshJobTypeOptions();
    this._refreshPresetOptions();
    this._calcCompleteness();
  },

  _loadProfileSchema() {
    if (typeof api.getUserProfileSchema !== 'function') return;
    api.getUserProfileSchema().then(res => {
      const schema = res && res.code === 0 ? res.data : null;
      const options = schema && schema.options;
      if (!options) return;
      this.setData({
        statusOptions: options.statusOptions || this.data.statusOptions,
        degreeOptions: options.degreeOptions || this.data.degreeOptions,
        gradYearOptions: options.gradYearOptions || this.data.gradYearOptions,
        rolePresets: options.roleOptions || this.data.rolePresets,
        locationPresets: options.locationOptions || this.data.locationPresets,
        industryPresets: options.industryOptions || this.data.industryPresets,
        jobTypePresets: options.jobTypeOptions || this.data.jobTypePresets,
        workAuthOptions: options.workAuthOptions || this.data.workAuthOptions,
        skillPresets: options.skillOptions || this.data.skillPresets,
      }, () => {
        this._refreshLocationOptions();
        this._refreshIndustryOptions();
        this._refreshJobTypeOptions();
        this._refreshPresetOptions();
      });
    }).catch(() => {});
  },

  _loadRemoteProfile() {
    if (!wx.getStorageSync('token') || typeof api.getUserProfile !== 'function') return;
    api.getUserProfile().then(res => {
      const user = res && res.code === 0 ? res.data : null;
      if (!user || typeof api.persistUserSession !== 'function') return;
      const profile = api.persistUserSession(user);
      this.setData({ userInfo: this._normalizeUserInfo({ ...this.data.userInfo, ...profile }) }, () => {
        this._refreshLocationOptions();
        this._refreshIndustryOptions();
        this._refreshJobTypeOptions();
        this._refreshPresetOptions();
        this._calcCompleteness();
      });
    }).catch(() => {});
  },

  _normalizeMultiValue(value) {
    return normalizeMultiValue(value);
  },

  _normalizeUserInfo(userInfo) {
    const normalized = normalizeProfileStorage(userInfo);
    return {
      ...normalized,
      targetLocation: this._normalizeMultiValue(normalized.targetLocation),
      targetRoles: this._normalizeMultiValue(normalized.targetRoles),
      targetIndustries: this._normalizeMultiValue(normalized.targetIndustries),
      jobTypes: this._normalizeMultiValue(normalized.jobTypes),
      skills: this._normalizeMultiValue(normalized.skills),
    };
  },

  _refreshLocationOptions() {
    const selected = new Set(this._normalizeMultiValue(this.data.userInfo.targetLocation));
    this.setData({
      locationOptions: this.data.locationPresets.map(label => ({
        label,
        selected: selected.has(label),
      })),
    });
  },

  _refreshIndustryOptions() {
    const selected = new Set(this._normalizeMultiValue(this.data.userInfo.targetIndustries));
    this.setData({
      industryOptions: this.data.industryPresets.map(label => ({
        label,
        selected: selected.has(label),
      })),
    });
  },

  _refreshJobTypeOptions() {
    const selected = new Set(this._normalizeMultiValue(this.data.userInfo.jobTypes));
    this.setData({
      jobTypeOptions: this.data.jobTypePresets.map(option => ({
        value: option.value,
        label: option.label,
        selected: selected.has(option.value),
      })),
    });
  },

  _refreshPresetOptions() {
    const selectedRoles = new Set(this._normalizeMultiValue(this.data.userInfo.targetRoles));
    const selectedSkills = new Set(this._normalizeMultiValue(this.data.userInfo.skills));
    this.setData({
      roleOptions: this.data.rolePresets.map(label => ({
        label,
        selected: selectedRoles.has(label),
      })),
      skillOptions: this.data.skillPresets.map(label => ({
        label,
        selected: selectedSkills.has(label),
      })),
    });
  },

  _refreshFieldOptions(field) {
    if (field === 'targetLocation') this._refreshLocationOptions();
    if (field === 'targetIndustries') this._refreshIndustryOptions();
    if (field === 'targetRoles' || field === 'skills') this._refreshPresetOptions();
  },

  _getSelectorOptions(field) {
    const fieldConfig = MULTI_FIELD_CONFIG[field];
    const rawOptions = fieldConfig ? this.data[fieldConfig.source] || [] : [];
    return rawOptions.map(item => {
      if (typeof item === 'string') return { value: item, label: item };
      return { value: item.value || item.label, label: item.label || item.value };
    }).filter(item => item.value && item.label);
  },

  _buildSelectorState(field, query) {
    const fieldConfig = MULTI_FIELD_CONFIG[field];
    if (!fieldConfig) return this.data.selector;
    const keyword = String(query || '').trim().toLowerCase();
    const selected = this._normalizeMultiValue(this.data.userInfo[field]);
    const selectedSet = new Set(selected);
    const filteredOptions = this._getSelectorOptions(field)
      .filter(item => {
        if (!keyword) return true;
        return String(item.label).toLowerCase().includes(keyword)
          || String(item.value).toLowerCase().includes(keyword);
      })
      .map(item => ({
        ...item,
        selected: selectedSet.has(item.value),
      }));
    return {
      visible: true,
      field,
      title: fieldConfig.title,
      query: query || '',
      placeholder: fieldConfig.placeholder,
      allowCustom: fieldConfig.allowCustom,
      max: fieldConfig.max,
      selected,
      filteredOptions,
    };
  },

  _syncSelector(field, query) {
    if (!this.data.selector.visible || this.data.selector.field !== field) return;
    const nextQuery = typeof query === 'string' ? query : this.data.selector.query;
    this.setData({ selector: this._buildSelectorState(field, nextQuery) });
  },

  _toggleMultiValue(field, value, nextQuery) {
    const fieldConfig = MULTI_FIELD_CONFIG[field] || {};
    const val = String(value || '').trim();
    if (!val) return false;
    const list = this._normalizeMultiValue(this.data.userInfo[field]);
    const idx = list.indexOf(val);
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      if (fieldConfig.max && list.length >= fieldConfig.max) {
        wx.showToast({ title: fieldConfig.maxMessage || `最多选${fieldConfig.max}个`, icon: 'none' });
        return false;
      }
      list.push(val);
    }
    this.setData({ [`userInfo.${field}`]: list }, () => {
      this._refreshFieldOptions(field);
      this._calcCompleteness();
      this._syncSelector(field, nextQuery);
    });
    return true;
  },

  _removeMultiValue(field, value) {
    const val = String(value || '').trim();
    const list = this._normalizeMultiValue(this.data.userInfo[field]).filter(item => item !== val);
    this.setData({ [`userInfo.${field}`]: list }, () => {
      this._refreshFieldOptions(field);
      this._calcCompleteness();
      this._syncSelector(field);
    });
  },

  openMultiSelector(e) {
    const { field } = e.currentTarget.dataset;
    if (!MULTI_FIELD_CONFIG[field]) return;
    this.setData({ selector: this._buildSelectorState(field, '') });
  },

  closeSelector() {
    this.setData({ 'selector.visible': false });
  },

  onSelectorSearch(e) {
    const field = this.data.selector.field;
    if (!field) return;
    this.setData({ selector: this._buildSelectorState(field, e.detail.value || '') });
  },

  toggleSelectorOption(e) {
    const { value } = e.currentTarget.dataset;
    const field = this.data.selector.field;
    this._toggleMultiValue(field, value);
  },

  addSelectorCustom() {
    const field = this.data.selector.field;
    const fieldConfig = MULTI_FIELD_CONFIG[field];
    const value = String(this.data.selector.query || '').trim();
    if (!fieldConfig || !fieldConfig.allowCustom || !value) return;
    if (this._normalizeMultiValue(this.data.userInfo[field]).includes(value)) {
      wx.showToast({ title: '已添加过该项', icon: 'none' });
      return;
    }
    this._toggleMultiValue(field, value, '');
  },

  removeMultiValue(e) {
    const { field, value } = e.currentTarget.dataset;
    this._removeMultiValue(field, value);
  },

  removeSelectorValue(e) {
    const { value } = e.currentTarget.dataset;
    this._removeMultiValue(this.data.selector.field, value);
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
      if (edu.degree) patch.degree = edu.degree;
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
      u.nickName, u.school, u.major, u.degree, u.status, u.gradYear,
      (u.targetRoles || []).length > 0,
      (u.targetLocation || []).length > 0,
      (u.targetIndustries || []).length > 0 || (u.jobTypes || []).length > 0,
      (u.skills || []).length > 0,
    ];
    const score = checks.reduce((s, c) => s + (c ? 10 : 0), 0);
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
    this._toggleMultiValue('targetLocation', value);
  },

  toggleIndustry(e) {
    const { value } = e.currentTarget.dataset;
    this._toggleMultiValue('targetIndustries', value);
  },

  toggleJobType(e) {
    const { value } = e.currentTarget.dataset;
    const list = this._normalizeMultiValue(this.data.userInfo.jobTypes);
    const idx = list.indexOf(value);
    if (idx >= 0) list.splice(idx, 1); else list.push(value);
    this.setData({ 'userInfo.jobTypes': list });
    this._refreshJobTypeOptions();
    this._calcCompleteness();
  },

  // ── 目标岗位：预设切换 ───────────────────────────────────────────────────
  toggleRole(e) {
    const { value } = e.currentTarget.dataset;
    this._toggleMultiValue('targetRoles', value);
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
    this.setData({ 'userInfo.targetRoles': list, customRoleInput: '' }, () => {
      this._refreshPresetOptions();
      this._calcCompleteness();
    });
  },

  removeRole(e) {
    const { value } = e.currentTarget.dataset;
    const list = (this.data.userInfo.targetRoles || []).filter(r => r !== value);
    this.setData({ 'userInfo.targetRoles': list }, () => {
      this._refreshPresetOptions();
      this._calcCompleteness();
    });
  },

  // ── 技能标签：预设切换 ───────────────────────────────────────────────────
  toggleSkill(e) {
    const { value } = e.currentTarget.dataset;
    this._toggleMultiValue('skills', value);
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
    this.setData({ 'userInfo.skills': list, customSkillInput: '' }, () => {
      this._refreshPresetOptions();
      this._calcCompleteness();
    });
  },

  removeSkill(e) {
    const { value } = e.currentTarget.dataset;
    const list = (this.data.userInfo.skills || []).filter(s => s !== value);
    this.setData({ 'userInfo.skills': list }, () => {
      this._refreshPresetOptions();
      this._calcCompleteness();
    });
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
  async handleSave() {
    const u = this._normalizeUserInfo(this.data.userInfo);
    if (!u.nickName && !u.school && !u.major) {
      wx.showToast({ title: '请至少填写一项基本信息', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '保存中...', mask: true });

    // 先保存到本地，保证弱网下用户填写不会丢
    wx.setStorageSync('userProfile', u);
    getApp().refreshGlobalData();

    const token = wx.getStorageSync('token');
    if (token && typeof api.updateUserDetail === 'function') {
      try {
        const res = await api.updateUserDetail(buildProfilePayload(u));
        if (res && res.code === 0 && res.data && typeof api.persistUserSession === 'function') {
          api.persistUserSession(res.data);
          getApp().refreshGlobalData();
        } else if (res && res.message) {
          throw new Error(res.message);
        }
      } catch (err) {
        wx.hideLoading();
        wx.showToast({ title: '本地已保存，服务器同步失败', icon: 'none', duration: 2200 });
        return;
      }
    }

    wx.hideLoading();
    wx.showToast({ title: '保存成功', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 800);
  }
});
