// pages/resume/resume.js
const api = require('../../../utils/api.js');
const config = require('../../../utils/config.js');
const safePage = require('../../behaviors/safe-page');
const vip = require('../../../utils/vip.js');
const aiMethods = require('./resume-ai');
const exportMethods = require('./resume-export');

const DEFAULT_RESUME = {
  score: 65,
  basicInfo: { name: '', title: '', phone: '', email: '', location: '', linkedin: '' },
  summary: '',
  workExp: [],
  education: [],
  skills: [],
  projects: []
};

Page(Object.assign({
  behaviors: [safePage],
  data: {
    currentTab: 0,

    // 多份简历（T-5）
    isLoggedIn: false,
    isVip: false,
    currentResumeId: null,
    currentResumeName: '我的简历',
    serverResumes: [],
    showResumeManager: false,

    // 弹窗控制
    showAiResult: false,
    aiResultTitle: '',
    aiResultContent: '',
    isPolishMode: false,

    // 编辑弹窗控制
    showEditBasic: false,
    editBasicForm: {},
    showEditSummary: false,
    editSummaryText: '',
    showEditWork: false,
    editWorkForm: {},
    editWorkIndex: -1,
    // 教育经历弹窗
    showEditEdu: false,
    editEduForm: {},
    editEduIndex: -1,
    // 技能标签
    showEditSkills: false,
    skillInput: '',
    // 项目经历弹窗
    showEditProject: false,
    editProjectForm: {},
    editProjectIndex: -1,

    // 导出 & NLP
    exportLoading: false,
    showNlpPanel: false,
    nlpLoading: false,
    nlpResult: '',
    nlpAtsScore: 0,

    // 附件简历
    resumeList: [],

    // 在线简历数据
    onlineResume: DEFAULT_RESUME,
    targetJobInput: '',

    // 统一弹窗高度（动态更新）
    _modalStyle: 'height: 60vh; background: #fff; border-radius: 24rpx 24rpx 0 0;'
  },

  onLoad() {
    const token = wx.getStorageSync('token');
    this.setData({ isLoggedIn: !!token, isVip: vip.isVip() });
    if (token) {
      this._syncServerResumes();
      this.loadAttachmentResumes();
    } else {
      this.loadResume();
    }
  },

  onShow() {
    const token = wx.getStorageSync('token');
    this.setData({ isLoggedIn: !!token, isVip: vip.isVip() });
    if (token) {
      this._syncServerResumes();
      this.loadAttachmentResumes();
    } else {
      this.loadResume();
    }
  },

  // 从 localStorage 加载简历（未登录时使用）
  loadResume() {
    const saved = wx.getStorageSync('onlineResume');
    if (saved && saved.basicInfo) {
      saved.score = this._calcScore(saved);
      this.setData({ onlineResume: saved });
    } else {
      const profile = wx.getStorageSync('userProfile') || {};
      const resume = JSON.parse(JSON.stringify(DEFAULT_RESUME));
      if (profile.nickName) resume.basicInfo.name = profile.nickName;
      if (profile.major) resume.basicInfo.title = profile.major;
      resume.score = this._calcScore(resume);
      this.setData({ onlineResume: resume });
    }
    const files = wx.getStorageSync('resumeFiles') || [];
    this.setData({ resumeList: files });
  },

  // ── 多份简历：从服务端同步列表并加载当前简历 ──────────────────────────────
  async _syncServerResumes() {
    try {
      const res = await api.getResumes();
      if (res && res.code === 0) {
        const list = res.data || [];
        this.setData({ serverResumes: list });

        if (list.length === 0) {
          // 用户没有简历记录：把 localStorage 内容上传为第 1 份
          const local = wx.getStorageSync('onlineResume');
          const name = (local && local.basicInfo && local.basicInfo.name)
            ? local.basicInfo.name + '的简历'
            : '我的简历';
          const cr = await api.createResume({ name, data: local || {} });
          if (cr && cr.code === 0) {
            this.setData({ currentResumeId: cr.data.id, currentResumeName: name });
            // 重新拉取列表
            const res2 = await api.getResumes();
            if (res2 && res2.code === 0) this.setData({ serverResumes: res2.data || [] });
          }
          this.loadResume();
        } else {
          // 加载最近编辑的那份（列表第 1 条）
          const target = list[0];
          const detail = await api.getResume(target.id);
          if (detail && detail.code === 0 && detail.data && detail.data.data) {
            const r = detail.data.data;
            r.score = this._calcScore(r);
            this.setData({
              onlineResume: r,
              currentResumeId: target.id,
              currentResumeName: target.name
            });
          } else {
            this.loadResume();
            this.setData({ currentResumeId: target.id, currentResumeName: target.name });
          }
        }
      } else {
        this.loadResume();
      }
    } catch (e) {
      this.loadResume();
    }
    const files = wx.getStorageSync('resumeFiles') || [];
    this.setData({ resumeList: files });
  },

  // ── 保存简历（登录时存服务端，否则存 localStorage）──────────────────────────
  _saveResume() {
    const resume = this.data.onlineResume;
    resume.score = this._calcScore(resume);
    this.setData({ onlineResume: resume });
    wx.setStorageSync('onlineResume', resume); // 本地始终同步一份备份

    if (this.data.isLoggedIn && this.data.currentResumeId) {
      api.updateResume(this.data.currentResumeId, {
        name: this.data.currentResumeName,
        data: resume
      }).catch(() => {});
    }
  },

  // ── 简历管理面板 ──────────────────────────────────────────────────────────
  showResumeManager() {
    this.setData({ showResumeManager: true });
  },
  hideResumeManager() {
    this.setData({ showResumeManager: false });
  },

  async selectResume(e) {
    const id   = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    if (id === this.data.currentResumeId) { this.hideResumeManager(); return; }
    wx.showLoading({ title: '加载中...' });
    try {
      const res = await api.getResume(id);
      if (res && res.code === 0 && res.data && res.data.data) {
        const r = res.data.data;
        r.score = this._calcScore(r);
        this.setData({ onlineResume: r, currentResumeId: id, currentResumeName: name });
      } else {
        wx.showToast({ title: '加载失败', icon: 'none' });
      }
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
    wx.hideLoading();
    this.hideResumeManager();
  },

  async createResume() {
    const { serverResumes } = this.data;
    const vipLevel = vip.isVip() ? 1 : 0;
    // 免费用户限 1 份；VIP 无限（后端限 999）
    if (vipLevel <= 0 && serverResumes.length >= 1) {
      wx.showModal({
        title: 'VIP 权益',
        content: 'VIP 用户可无限创建简历，免费用户最多 1 份。升级 VIP 解锁无限简历？',
        confirmText: '去升级',
        success: r => { if (r.confirm) wx.navigateTo({ url: '/package-user/pages/vip/vip' }); }
      });
      return;
    }
    wx.showLoading({ title: '创建中...' });
    try {
      const res = await api.createResume({ name: '新简历', data: {} });
      if (res && res.code === 0) {
        const newId = res.data.id;
        const empty = JSON.parse(JSON.stringify(DEFAULT_RESUME));
        empty.score = 0;
        this.setData({ onlineResume: empty, currentResumeId: newId, currentResumeName: '新简历' });
        // 刷新列表
        const list = await api.getResumes();
        if (list && list.code === 0) this.setData({ serverResumes: list.data || [] });
        wx.showToast({ title: '新简历已创建', icon: 'success' });
      } else {
        wx.showToast({ title: res.message || '创建失败', icon: 'none' });
      }
    } catch (e) {
      wx.showToast({ title: '创建失败', icon: 'none' });
    }
    wx.hideLoading();
    this.hideResumeManager();
  },

  deleteServerResume(e) {
    const id = e.currentTarget.dataset.id;
    if (this.data.serverResumes.length <= 1) {
      wx.showToast({ title: '至少保留一份简历', icon: 'none' }); return;
    }
    wx.showModal({ title: '确认删除', content: '删除后无法恢复', success: async (r) => {
      if (!r.confirm) return;
      const res = await api.deleteResume(id);
      if (res && res.code === 0) {
        const list = await api.getResumes();
        const newList = (list && list.code === 0) ? list.data || [] : [];
        this.setData({ serverResumes: newList });
        if (id === this.data.currentResumeId && newList.length > 0) {
          this.selectResume({ currentTarget: { dataset: { id: newList[0].id, name: newList[0].name } } });
        }
        wx.showToast({ title: '已删除', icon: 'success' });
      } else {
        wx.showToast({ title: '删除失败', icon: 'none' });
      }
    }});
  },

  // 计算完整度
  _calcScore(r) {
    let score = 0;
    const b = r.basicInfo || {};
    if (b.name) score += 15;
    if (b.title) score += 10;
    if (b.phone) score += 8;
    if (b.email) score += 8;
    if (b.location) score += 4;
    if (r.summary && r.summary.length > 20) score += 15;
    if (r.workExp && r.workExp.length > 0) score += 20;
    if (r.education && r.education.length > 0) score += 10;
    if (r.skills && r.skills.length > 0) score += 5;
    if (r.projects && r.projects.length > 0) score += 5;
    return Math.min(100, score);
  },

  switchTab(e) {
    this.setData({ currentTab: Number(e.currentTarget.dataset.index) });
  },

  // ==========================================
  // 编辑基本信息
  // ==========================================
  // 统一关闭当前弹窗（page-container overlay 回调）
  _closeActiveModal() {
    const d = this.data;
    if (d.showEditBasic) this.cancelEditBasic();
    else if (d.showEditSummary) this.cancelEditSummary();
    else if (d.showEditWork) this.cancelEditWork();
    else if (d.showEditEdu) this.cancelEditEdu();
    else if (d.showEditSkills) this.closeSkillsEdit();
    else if (d.showEditProject) this.cancelEditProject();
    else if (d.showAiResult) this.closeAiResult();
  },

  editBasicInfo() {
    this.setData({
      showEditBasic: true,
      _modalStyle: 'height: 65vh; background: #fff; border-radius: 24rpx 24rpx 0 0;',
      editBasicForm: JSON.parse(JSON.stringify(this.data.onlineResume.basicInfo))
    });
  },

  onBasicInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['editBasicForm.' + field]: e.detail.value });
  },

  saveBasicInfo() {
    this.setData({
      'onlineResume.basicInfo': this.data.editBasicForm,
      showEditBasic: false
    });
    this._saveResume();
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  cancelEditBasic() {
    this.setData({ showEditBasic: false });
  },

  // ==========================================
  // 编辑个人优势
  // ==========================================
  editSummary() {
    this.setData({
      showEditSummary: true,
      _modalStyle: 'height: 50vh; background: #fff; border-radius: 24rpx 24rpx 0 0;',
      editSummaryText: this.data.onlineResume.summary
    });
  },

  onSummaryInput(e) {
    this.setData({ editSummaryText: e.detail.value });
  },

  saveSummary() {
    this.setData({
      'onlineResume.summary': this.data.editSummaryText,
      showEditSummary: false
    });
    this._saveResume();
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  cancelEditSummary() {
    this.setData({ showEditSummary: false });
  },

  // ==========================================
  // 编辑/添加工作经历
  // ==========================================
  addWorkExp() {
    this.setData({
      showEditWork: true,
      _modalStyle: 'height: 70vh; background: #fff; border-radius: 24rpx 24rpx 0 0;',
      editWorkIndex: -1,
      editWorkForm: { company: '', role: '', time: '', desc: '' }
    });
  },

  editWorkExp(e) {
    const index = e.currentTarget.dataset.index;
    const item = this.data.onlineResume.workExp[index];
    this.setData({
      showEditWork: true,
      _modalStyle: 'height: 70vh; background: #fff; border-radius: 24rpx 24rpx 0 0;',
      editWorkIndex: index,
      editWorkForm: JSON.parse(JSON.stringify(item))
    });
  },

  onWorkInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['editWorkForm.' + field]: e.detail.value });
  },

  saveWorkExp() {
    const form = this.data.editWorkForm;
    if (!form.company || !form.role) {
      wx.showToast({ title: '请填写公司和职位', icon: 'none' });
      return;
    }

    const workExp = this.data.onlineResume.workExp.slice();
    if (this.data.editWorkIndex >= 0) {
      workExp[this.data.editWorkIndex] = { ...form, id: workExp[this.data.editWorkIndex].id };
    } else {
      workExp.push({ ...form, id: Date.now() });
    }

    this.setData({
      'onlineResume.workExp': workExp,
      showEditWork: false
    });
    this._saveResume();
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  deleteWorkExp() {
    if (this.data.editWorkIndex < 0) return;
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复',
      success: (res) => {
        if (res.confirm) {
          const workExp = this.data.onlineResume.workExp.slice();
          workExp.splice(this.data.editWorkIndex, 1);
          this.setData({
            'onlineResume.workExp': workExp,
            showEditWork: false
          });
          this._saveResume();
        }
      }
    });
  },

  cancelEditWork() {
    this.setData({ showEditWork: false });
  },

  // ==========================================
  // 教育经历
  // ==========================================
  addEdu() {
    this.setData({ showEditEdu: true, _modalStyle: 'height: 60vh; background: #fff; border-radius: 24rpx 24rpx 0 0;', editEduIndex: -1, editEduForm: { school: '', degree: '', major: '', time: '' } });
  },
  editEdu(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ showEditEdu: true, _modalStyle: 'height: 60vh; background: #fff; border-radius: 24rpx 24rpx 0 0;', editEduIndex: index, editEduForm: JSON.parse(JSON.stringify(this.data.onlineResume.education[index])) });
  },
  onEduInput(e) {
    this.setData({ ['editEduForm.' + e.currentTarget.dataset.field]: e.detail.value });
  },
  saveEdu() {
    const form = this.data.editEduForm;
    if (!form.school || !form.degree) { wx.showToast({ title: '请填写学校和学历', icon: 'none' }); return; }
    const education = this.data.onlineResume.education.slice();
    if (this.data.editEduIndex >= 0) {
      education[this.data.editEduIndex] = { ...form, id: education[this.data.editEduIndex].id };
    } else {
      education.push({ ...form, id: Date.now() });
    }
    this.setData({ 'onlineResume.education': education, showEditEdu: false });
    this._saveResume();
    wx.showToast({ title: '已保存', icon: 'success' });
  },
  deleteEdu() {
    if (this.data.editEduIndex < 0) return;
    wx.showModal({ title: '确认删除', content: '删除后无法恢复', success: (res) => {
      if (res.confirm) {
        const education = this.data.onlineResume.education.slice();
        education.splice(this.data.editEduIndex, 1);
        this.setData({ 'onlineResume.education': education, showEditEdu: false });
        this._saveResume();
      }
    }});
  },
  cancelEditEdu() { this.setData({ showEditEdu: false }); },

  // ==========================================
  // 技能标签
  // ==========================================
  openSkillsEdit() { this.setData({ showEditSkills: true, _modalStyle: 'height: 55vh; background: #fff; border-radius: 24rpx 24rpx 0 0;', skillInput: '' }); },
  onSkillInput(e) { this.setData({ skillInput: e.detail.value }); },
  addSkill() {
    const tag = this.data.skillInput.trim();
    if (!tag) return;
    if (this.data.onlineResume.skills.includes(tag)) { wx.showToast({ title: '已存在', icon: 'none' }); return; }
    if (this.data.onlineResume.skills.length >= 20) { wx.showToast({ title: '最多添加20个技能', icon: 'none' }); return; }
    const skills = [...this.data.onlineResume.skills, tag];
    this.setData({ 'onlineResume.skills': skills, skillInput: '' });
    this._saveResume();
  },
  removeSkill(e) {
    const index = e.currentTarget.dataset.index;
    const skills = this.data.onlineResume.skills.filter((_, i) => i !== index);
    this.setData({ 'onlineResume.skills': skills });
    this._saveResume();
  },
  closeSkillsEdit() { this.setData({ showEditSkills: false }); },

  // ==========================================
  // 项目经历
  // ==========================================
  goToProjectBuilder() {
    wx.navigateTo({ url: '/package-career/pages/project-builder/project-builder' });
  },
  addProject() {
    this.setData({ showEditProject: true, _modalStyle: 'height: 72vh; background: #fff; border-radius: 24rpx 24rpx 0 0;', editProjectIndex: -1, editProjectForm: { name: '', role: '', time: '', desc: '' } });
  },
  editProject(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ showEditProject: true, _modalStyle: 'height: 72vh; background: #fff; border-radius: 24rpx 24rpx 0 0;', editProjectIndex: index, editProjectForm: JSON.parse(JSON.stringify(this.data.onlineResume.projects[index])) });
  },
  onProjectInput(e) {
    this.setData({ ['editProjectForm.' + e.currentTarget.dataset.field]: e.detail.value });
  },
  saveProject() {
    const form = this.data.editProjectForm;
    if (!form.name) { wx.showToast({ title: '请填写项目名称', icon: 'none' }); return; }
    const projects = this.data.onlineResume.projects.slice();
    if (this.data.editProjectIndex >= 0) {
      projects[this.data.editProjectIndex] = { ...form, id: projects[this.data.editProjectIndex].id };
    } else {
      projects.push({ ...form, id: Date.now() });
    }
    this.setData({ 'onlineResume.projects': projects, showEditProject: false });
    this._saveResume();
    wx.showToast({ title: '已保存', icon: 'success' });
  },
  deleteProject() {
    if (this.data.editProjectIndex < 0) return;
    wx.showModal({ title: '确认删除', content: '删除后无法恢复', success: (res) => {
      if (res.confirm) {
        const projects = this.data.onlineResume.projects.slice();
        projects.splice(this.data.editProjectIndex, 1);
        this.setData({ 'onlineResume.projects': projects, showEditProject: false });
        this._saveResume();
      }
    }});
  },
  cancelEditProject() { this.setData({ showEditProject: false }); },

  // AI 方法、导出方法已拆分到 resume-ai.js 和 resume-export.js
  // 通过文件底部 Object.assign 混入

  // 小程序分享
  onShareAppMessage() {
    const name = (this.data.onlineResume.basicInfo || {}).name || '我的简历';
    return {
      title: name + ' 的求职简历 — 留学生求职助手',
      path: '/package-career/pages/resume/resume'
    };
  },

  // --- 附件简历 ---
  handleUpload() {
    wx.showActionSheet({
      itemList: ['从微信聊天选择', '从手机文件选择'],
      success: () => {
        const files = this.data.resumeList.slice();
        files.push({
          id: Date.now(),
          name: '新简历_' + new Date().toISOString().slice(0, 10) + '.pdf',
          date: new Date().toISOString().slice(0, 10),
          type: 'pdf',
          isDefault: files.length === 0
        });
        this.setData({ resumeList: files });
        wx.setStorageSync('resumeFiles', files);
        wx.showToast({ title: '上传成功', icon: 'success' });
      }
    });
  },

  handleAction(e) {
    const index = e.currentTarget.dataset.index;
    wx.showActionSheet({
      itemList: ['设为默认', '删除'],
      success: (res) => {
        const files = this.data.resumeList.slice();
        if (res.tapIndex === 0) {
          files.forEach((f, i) => { f.isDefault = i === index; });
          this.setData({ resumeList: files });
          wx.setStorageSync('resumeFiles', files);
          wx.showToast({ title: '已设为默认', icon: 'success' });
        } else if (res.tapIndex === 1) {
          files.splice(index, 1);
          this.setData({ resumeList: files });
          wx.setStorageSync('resumeFiles', files);
          wx.showToast({ title: '已删除', icon: 'success' });
        }
      }
    });
  },

  _formatAttachmentResume(row, index) {
    const createdAt = row.created_at || row.date || '';
    return {
      id: row.id || Date.now() + index,
      name: row.original_name || row.filename || row.name || '附件简历.pdf',
      date: String(createdAt).slice(0, 10) || new Date().toISOString().slice(0, 10),
      type: 'pdf',
      url: row.file_url || row.url || '',
      size: row.file_size || row.size || 0,
      isDefault: index === 0
    };
  },

  loadAttachmentResumes() {
    const token = wx.getStorageSync('token');
    if (!token) {
      const files = wx.getStorageSync('resumeFiles') || [];
      this.setData({ resumeList: files });
      return Promise.resolve(files);
    }

    return new Promise((resolve) => {
      wx.request({
        url: config.API_BASE_URL + '/api/upload/resume-pdfs',
        method: 'GET',
        header: { Authorization: 'Bearer ' + token },
        success: (res) => {
          if (res.statusCode === 200 && res.data && res.data.code === 0) {
            const files = (res.data.data || []).map((item, idx) => this._formatAttachmentResume(item, idx));
            this.setData({ resumeList: files });
            wx.setStorageSync('resumeFiles', files);
            resolve(files);
          } else {
            const files = wx.getStorageSync('resumeFiles') || [];
            this.setData({ resumeList: files });
            resolve(files);
          }
        },
        fail: () => {
          const files = wx.getStorageSync('resumeFiles') || [];
          this.setData({ resumeList: files });
          resolve(files);
        }
      });
    });
  },

  chooseResumeFileFromChat() {
    return new Promise((resolve, reject) => {
      wx.chooseMessageFile({
        count: 1,
        type: 'file',
        extension: ['pdf'],
        success: (res) => {
          const file = (res.tempFiles || [])[0];
          file ? resolve(file) : reject(new Error('未选择文件'));
        },
        fail: (err) => reject(new Error((err && err.errMsg) || '未选择文件'))
      });
    });
  },

  chooseResumeFileFromDevice() {
    return new Promise((resolve, reject) => {
      if (!wx.chooseFile) {
        reject(new Error('当前微信不支持直接从手机文件选择，请先把 PDF 发到微信聊天或文件传输助手，再从聊天选择'));
        return;
      }
      wx.chooseFile({
        count: 1,
        type: 'file',
        extension: ['pdf'],
        success: (res) => {
          const file = (res.tempFiles || [])[0];
          file ? resolve(file) : reject(new Error('未选择文件'));
        },
        fail: (err) => reject(new Error((err && err.errMsg) || '未选择文件'))
      });
    });
  },

  getResumeFileName(file) {
    if (!file) return '';
    const raw = file.name || file.fileName || file.path || file.tempFilePath || '';
    const parts = String(raw).split(/[\\/]/);
    return parts[parts.length - 1] || '';
  },

  validateResumeFile(file) {
    const name = this.getResumeFileName(file);
    const filePath = file && (file.path || file.tempFilePath);
    if (!filePath) return '未获取到文件路径';
    if (!/\.pdf$/i.test(name)) return '请上传 PDF 格式的简历';
    if (file.size && file.size > 10 * 1024 * 1024) return 'PDF 文件不能超过 10MB';
    return '';
  },

  uploadResumePdf(file) {
    return new Promise((resolve, reject) => {
      const token = wx.getStorageSync('token');
      if (!token) {
        reject(new Error('请先登录后再上传附件简历'));
        return;
      }

      wx.uploadFile({
        url: config.API_BASE_URL + '/api/upload/resume-pdf',
        filePath: file.path || file.tempFilePath,
        name: 'file',
        fileName: this.getResumeFileName(file) || 'resume.pdf',
        formData: { originalName: this.getResumeFileName(file) || 'resume.pdf' },
        header: {
          Authorization: 'Bearer ' + token,
          Accept: 'application/json'
        },
        timeout: 30000,
        success: (res) => {
          let data = null;
          try { data = JSON.parse(res.data || '{}'); } catch (e) {}
          if (res.statusCode >= 200 && res.statusCode < 300 && data && data.code === 0) {
            resolve(data.data);
          } else {
            const message = (data && data.message) || `上传失败（${res.statusCode || '无状态码'}）`;
            reject(new Error(message));
          }
        },
        fail: (err) => {
          console.warn('[resume upload] wx.uploadFile failed', err);
          reject(new Error((err && err.errMsg) || '上传失败，请检查网络'));
        }
      });
    });
  },

  getAttachmentUrl(file) {
    const url = file && file.url;
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    return config.API_BASE_URL + url;
  },

  previewAttachmentResume(file) {
    const url = this.getAttachmentUrl(file);
    if (!url) {
      wx.showToast({ title: '文件地址不存在', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '打开中...' });
    wx.downloadFile({
      url,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.tempFilePath) {
          wx.openDocument({
            filePath: res.tempFilePath,
            fileType: 'pdf',
            showMenu: true,
            fail: (err) => {
              wx.showModal({
                title: '预览失败',
                content: (err && err.errMsg) || '当前文件无法预览，请确认是 PDF 文件',
                showCancel: false
              });
            }
          });
        } else {
          wx.showModal({
            title: '预览失败',
            content: `文件下载失败（${res.statusCode || '无状态码'}）`,
            showCancel: false
          });
        }
      },
      fail: (err) => {
        wx.showModal({
          title: '预览失败',
          content: (err && err.errMsg) || '文件下载失败，请检查网络',
          showCancel: false
        });
      },
      complete: () => wx.hideLoading()
    });
  },

  syncAttachmentToOnlineResume(file) {
    if (!file || !file.id) {
      wx.showToast({ title: '附件信息缺失', icon: 'none' });
      return;
    }
    const token = wx.getStorageSync('token');
    if (!token) {
      wx.showModal({
        title: '请先登录',
        content: '同步提取需要登录后读取已上传的附件简历。',
        showCancel: false
      });
      return;
    }

    wx.showLoading({ title: '提取中...' });
    wx.request({
      url: config.API_BASE_URL + '/api/upload/resume-pdf/' + file.id + '/extract',
      method: 'POST',
      header: { Authorization: 'Bearer ' + token },
      success: async (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.code === 0) {
          const parsed = res.data.data && res.data.data.resume;
          const current = this.data.onlineResume || {};
          const merged = Object.assign({}, current, parsed, {
            basicInfo: Object.assign({}, current.basicInfo || {}, parsed.basicInfo || {}),
            workExp: (parsed.workExp && parsed.workExp.length) ? parsed.workExp : (current.workExp || []),
            education: (parsed.education && parsed.education.length) ? parsed.education : (current.education || []),
            projects: (parsed.projects && parsed.projects.length) ? parsed.projects : (current.projects || []),
            skills: Array.from(new Set([...(current.skills || []), ...((parsed && parsed.skills) || [])]))
          });
          merged.score = this._calcScore(merged);

          if (this.data.isLoggedIn && !this.data.currentResumeId) {
            await this._syncServerResumes();
          }

          this.setData({ onlineResume: merged, currentTab: 0 });
          this._saveResume();
          wx.showModal({
            title: '同步完成',
            content: '已从附件简历提取基础信息到在线简历。PDF 自动解析可能不完整，请继续检查工作经历、教育经历和项目经历。',
            showCancel: false
          });
        } else {
          wx.showModal({
            title: '同步失败',
            content: (res.data && res.data.message) || `解析失败（${res.statusCode || '无状态码'}）`,
            showCancel: false
          });
        }
      },
      fail: (err) => {
        wx.showModal({
          title: '同步失败',
          content: (err && err.errMsg) || '网络请求失败',
          showCancel: false
        });
      },
      complete: () => wx.hideLoading()
    });
  },

  handleUpload() {
    wx.showActionSheet({
      itemList: ['从微信聊天选择', '从手机文件选择'],
      success: async (res) => {
        const chooseFile = res.tapIndex === 0
          ? this.chooseResumeFileFromChat
          : this.chooseResumeFileFromDevice;

        try {
          const file = await chooseFile.call(this);
          const invalidMsg = this.validateResumeFile(file);
          if (invalidMsg) {
            wx.showToast({ title: invalidMsg, icon: 'none' });
            return;
          }

          wx.showLoading({ title: '上传中...' });
          const uploaded = await this.uploadResumePdf(file);
          const fileName = this.getResumeFileName(file) || uploaded.filename || 'resume.pdf';
          const nextFile = this._formatAttachmentResume({
            id: uploaded.id,
            original_name: fileName,
            file_url: uploaded.url,
            file_size: uploaded.size,
            created_at: new Date().toISOString().slice(0, 10)
          }, 0);
          const files = [nextFile].concat(this.data.resumeList.map((item) => {
            return Object.assign({}, item, { isDefault: false });
          }));
          this.setData({ resumeList: files });
          wx.setStorageSync('resumeFiles', files);
          wx.showToast({ title: '上传成功', icon: 'success' });
        } catch (err) {
          const msg = (err && err.message) || '上传失败';
          if (!/cancel|取消/.test(msg)) {
            wx.showModal({
              title: '上传失败',
              content: msg,
              showCancel: false,
              confirmText: '知道了'
            });
          }
        } finally {
          wx.hideLoading();
        }
      }
    });
  },

  handleAction(e) {
    const index = e.currentTarget.dataset.index;
    wx.showActionSheet({
      itemList: ['预览附件', '同步到在线简历', '设为默认', '删除'],
      success: (res) => {
        const files = this.data.resumeList.slice();
        const target = files[index];
        if (!target) return;

        if (res.tapIndex === 0) {
          this.previewAttachmentResume(target);
        } else if (res.tapIndex === 1) {
          this.syncAttachmentToOnlineResume(target);
        } else if (res.tapIndex === 2) {
          files.forEach((f, i) => { f.isDefault = i === index; });
          this.setData({ resumeList: files });
          wx.setStorageSync('resumeFiles', files);
          wx.showToast({ title: '已设为默认', icon: 'success' });
        } else if (res.tapIndex === 3) {
          const removeLocal = () => {
            files.splice(index, 1);
            if (files.length && !files.some((f) => f.isDefault)) files[0].isDefault = true;
            this.setData({ resumeList: files });
            wx.setStorageSync('resumeFiles', files);
            wx.showToast({ title: '已删除', icon: 'success' });
          };

          if (!target || !target.url) {
            removeLocal();
            return;
          }

          const token = wx.getStorageSync('token');
          wx.request({
            url: config.API_BASE_URL + '/api/upload/resume-pdf/' + target.id,
            method: 'DELETE',
            header: token ? { Authorization: 'Bearer ' + token } : {},
            complete: removeLocal
          });
        }
      }
    });
  }
}, aiMethods, exportMethods))
