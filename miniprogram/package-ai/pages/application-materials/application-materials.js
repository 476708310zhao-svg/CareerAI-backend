const appMaterials = require('../../utils/application-materials.js');
const v4Api = require('../../../utils/api-v4.js');
const ownerStorage = require('../../../utils/owner-storage.js');

const AI_MATERIAL_TYPES = [
  { code: 'cover_letter', label: 'Cover Letter' },
  { code: 'why_company', label: 'Why this company?' },
  { code: 'why_role', label: 'Why this role?' },
  { code: 'recruiter_message', label: 'Recruiter 消息' },
  { code: 'follow_up_email', label: 'Follow-up 邮件' }
];

function formatDate(value) {
  if (!value) return '刚刚';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return `${month}月${day}日`;
}

function typeLabel(code) {
  const found = appMaterials.QUESTION_TYPES.find(item => item.code === code);
  return found ? found.label : '申请材料';
}

function formatMaterial(item) {
  const content = item.content || '';
  return Object.assign({}, item, {
    questionLabel: item.questionLabel || typeLabel(item.questionType),
    company: item.company || '目标公司',
    jobTitle: item.jobTitle || '目标岗位',
    resumeName: item.resumeName || '',
    resumeVersionId: item.resumeVersionId || '',
    dateLabel: formatDate(item.updatedAt || item.createdAt),
    preview: content.length > 92 ? content.slice(0, 92) + '...' : content
  });
}

Page({
  data: {
    materials: [],
    filteredMaterials: [],
    tabs: [],
    activeType: 'all',
    keyword: '',
    stats: {
      total: 0,
      companyCount: 0
    },
    showEditor: false,
    editId: '',
    editForm: {
      questionLabel: '',
      company: '',
      jobTitle: '',
      content: ''
    },
    showGenerator: false,
    aiMaterialTypes: AI_MATERIAL_TYPES,
    applications: [],
    resumes: [],
    resumeVersions: [],
    applicationIndex: 0,
    resumeIndex: 0,
    resumeVersionIndex: 0,
    materialTypeIndex: 0,
    generatedDraft: null,
    generatedContent: '',
    quota: null,
    generating: false,
    mutatingDraft: false,
    initializingVersion: false
  },

  onLoad(options) {
    this._unloaded = false;
    this._ownerScope = ownerStorage.capture();
    this._targetApplicationId = options && options.applicationId ? String(options.applicationId) : '';
    this.loadMaterials();
    this.loadGeneratorOptions();
  },

  onShow() {
    this.loadMaterials();
  },

  onPullDownRefresh() {
    this.loadMaterials();
    wx.stopPullDownRefresh();
  },

  loadMaterials() {
    this.renderMaterials(appMaterials.readMaterials());
    appMaterials.fetchRemoteMaterials().then(list => {
      this.renderMaterials(list);
    });
  },

  renderMaterials(source) {
    const list = (source || []).map(formatMaterial);
    const stats = appMaterials.getStats();
    const tabs = [{ code: 'all', label: '全部', count: stats.total }]
      .concat(appMaterials.QUESTION_TYPES.map(item => ({
        code: item.code,
        label: item.label.replace('?', ''),
        count: stats.byType[item.code] || 0
      })));
    this.setData({ materials: list, stats, tabs }, () => this.applyFilter());
  },

  applyFilter() {
    const activeType = this.data.activeType;
    const keyword = String(this.data.keyword || '').trim().toLowerCase();
    const filteredMaterials = this.data.materials.filter(item => {
      const applicationOk = !this._targetApplicationId || String(item.applicationId || '') === this._targetApplicationId;
      if (!applicationOk) return false;
      const typeOk = activeType === 'all' || item.questionType === activeType;
      if (!typeOk) return false;
      if (!keyword) return true;
      const haystack = [item.questionLabel, item.company, item.jobTitle, item.content].join(' ').toLowerCase();
      return haystack.includes(keyword);
    });
    this.setData({ filteredMaterials });
  },

  setType(e) {
    this.setData({ activeType: e.currentTarget.dataset.type || 'all' }, () => this.applyFilter());
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value || '' }, () => this.applyFilter());
  },

  clearSearch() {
    this.setData({ keyword: '' }, () => this.applyFilter());
  },

  createDraft() {
    this.setData({ showGenerator: true, generatedDraft: null, generatedContent: '' });
    this.loadGeneratorOptions();
  },

  loadGeneratorOptions() {
    const owner = ownerStorage.capture();
    const requestId = this._optionsRequestId = (this._optionsRequestId || 0) + 1;
    Promise.all([v4Api.getApplicationBoard(), v4Api.getV4Resumes(), v4Api.getMaterialQuota()]).then(([board, resumes, quota]) => {
      if (this._unloaded || requestId !== this._optionsRequestId || !ownerStorage.isCurrent(owner)) return;
      const groups = board.data && board.data.groups || {};
      const applications = Object.keys(groups).reduce((all, key) => all.concat(groups[key] || []), []);
      const targetIndex = this._targetApplicationId
        ? applications.findIndex(item => String(item.id) === this._targetApplicationId)
        : -1;
      const applicationIndex = targetIndex >= 0 ? targetIndex : Math.min(this.data.applicationIndex, Math.max(0, applications.length - 1));
      const target = applications[applicationIndex];
      const resumeList = resumes.data || [];
      const linkedResumeIndex = target && target.resumeId
        ? resumeList.findIndex(item => String(item.id) === String(target.resumeId))
        : -1;
      const resumeIndex = linkedResumeIndex >= 0
        ? linkedResumeIndex
        : Math.min(this.data.resumeIndex, Math.max(0, resumeList.length - 1));
      this.setData({
        applications,
        resumes: resumeList,
        quota: quota.data || null,
        applicationIndex,
        resumeIndex,
        targetApplicationLabel: target ? `${target.company || '目标公司'} · ${target.jobTitle || '目标岗位'}` : ''
      }, () => this.loadResumeVersions(target && target.resumeVersionId));
    }).catch(() => {});
  },

  onUnload() {
    this._unloaded = true;
    this._draftRequestGeneration = (this._draftRequestGeneration || 0) + 1;
    this._resumeVersionsRequestId = (this._resumeVersionsRequestId || 0) + 1;
  },

  loadResumeVersions(preferredVersionId) {
    const resume = this.data.resumes[this.data.resumeIndex];
    const requestId = this._resumeVersionsRequestId = (this._resumeVersionsRequestId || 0) + 1;
    const owner = ownerStorage.capture();
    if (!resume) {
      this.setData({ resumeVersions: [], resumeVersionIndex: 0 });
      return Promise.resolve([]);
    }
    return v4Api.getResumeVersions(resume.id).then(res => {
      if (this._unloaded || requestId !== this._resumeVersionsRequestId || !ownerStorage.isCurrent(owner)) return [];
      const versions = (res.data || []).map(item => Object.assign({}, item, {
        displayName: `V${item.versionNo} · ${item.changeSummary || '原始版本'}`
      }));
      const wantedId = preferredVersionId || resume.currentVersionId;
      const selected = wantedId ? versions.findIndex(item => String(item.id) === String(wantedId)) : -1;
      this.setData({ resumeVersions: versions, resumeVersionIndex: selected >= 0 ? selected : 0 });
      return versions;
    }).catch(err => {
      if (!this._unloaded && requestId === this._resumeVersionsRequestId && ownerStorage.isCurrent(owner)) {
        this.setData({ resumeVersions: [], resumeVersionIndex: 0 });
        wx.showToast({ title: (err && err.message) || '简历版本加载失败', icon: 'none' });
      }
      return [];
    });
  },

  closeGenerator() { this.setData({ showGenerator: false, generatedDraft: null, generatedContent: '' }); },
  onApplicationChange(e) {
    const applicationIndex = Number(e.detail.value) || 0;
    const application = this.data.applications[applicationIndex];
    const linkedResumeIndex = application && application.resumeId
      ? this.data.resumes.findIndex(item => String(item.id) === String(application.resumeId))
      : -1;
    const resumeIndex = linkedResumeIndex >= 0 ? linkedResumeIndex : this.data.resumeIndex;
    this.setData({
      applicationIndex,
      resumeIndex,
      targetApplicationLabel: application ? `${application.company || '目标公司'} · ${application.jobTitle || '目标岗位'}` : ''
    }, () => this.loadResumeVersions(application && application.resumeVersionId));
  },
  onResumeChange(e) {
    const resumeIndex = Number(e.detail.value) || 0;
    const resume = this.data.resumes[resumeIndex];
    this.setData({ resumeIndex, resumeVersions: [], resumeVersionIndex: 0 }, () => {
      this.loadResumeVersions(resume && resume.currentVersionId);
    });
  },
  onResumeVersionChange(e) { this.setData({ resumeVersionIndex: Number(e.detail.value) || 0 }); },
  onMaterialTypeChange(e) { this.setData({ materialTypeIndex: Number(e.detail.value) || 0 }); },
  onGeneratedInput(e) { this.setData({ generatedContent: e.detail.value }); },

  initializeSelectedResumeVersion() {
    const resume = this.data.resumes[this.data.resumeIndex];
    if (!resume || this.data.initializingVersion || this.data.resumeVersions.length) return;
    wx.showModal({
      title: '初始化简历版本',
      content: '将当前旧简历内容明确保存为 V1，之后才能用于申请材料。',
      confirmText: '确认创建',
      success: result => {
        if (!result.confirm || this.data.initializingVersion) return;
        const owner = ownerStorage.capture();
        this.setData({ initializingVersion: true });
        v4Api.createResumeVersion(resume.id, { expectedVersionId: null, useLegacyContent: true }).then(res => {
          if (this._unloaded || !ownerStorage.isCurrent(owner)) return;
          resume.currentVersionId = res.data && res.data.id;
          return this.loadResumeVersions(resume.currentVersionId);
        }).then(() => {
          if (!this._unloaded && ownerStorage.isCurrent(owner)) wx.showToast({ title: '已创建 V1', icon: 'success' });
        }).catch(err => {
          if (!this._unloaded && ownerStorage.isCurrent(owner)) wx.showToast({ title: err.message || '初始化失败', icon: 'none' });
        }).finally(() => {
          if (!this._unloaded && ownerStorage.isCurrent(owner)) this.setData({ initializingVersion: false });
        });
      }
    });
  },

  generateAiMaterial() {
    if (this.data.generating || this.data.mutatingDraft) return;
    const application = this.data.applications[this.data.applicationIndex];
    const resume = this.data.resumes[this.data.resumeIndex];
    const version = this.data.resumeVersions[this.data.resumeVersionIndex];
    const type = this.data.aiMaterialTypes[this.data.materialTypeIndex] || AI_MATERIAL_TYPES[0];
    if (!application) return wx.showToast({ title: '请先创建或选择申请记录', icon: 'none' });
    if (!resume || !version) return wx.showToast({ title: '请选择一份可用的简历版本', icon: 'none' });
    const owner = ownerStorage.capture();
    const requestId = this._draftRequestGeneration = (this._draftRequestGeneration || 0) + 1;
    const selection = [application.id, resume.id, version.id, type.code].join(':');
    this.setData({ generating: true });
    v4Api.createMaterialDraft({ applicationId: application.id, resumeId: resume.id, resumeVersionId: version.id, materialType: type.code }).then(res => {
      const currentApplication = this.data.applications[this.data.applicationIndex] || {};
      const currentResume = this.data.resumes[this.data.resumeIndex] || {};
      const currentVersion = this.data.resumeVersions[this.data.resumeVersionIndex] || {};
      const currentType = this.data.aiMaterialTypes[this.data.materialTypeIndex] || {};
      if (this._unloaded || requestId !== this._draftRequestGeneration || !ownerStorage.isCurrent(owner)
        || selection !== [currentApplication.id, currentResume.id, currentVersion.id, currentType.code].join(':')) {
        if (!this._unloaded && requestId === this._draftRequestGeneration && ownerStorage.isCurrent(owner)) this.setData({ generating: false });
        return;
      }
      const draft = res.data;
      const content = typeof draft.content === 'string' ? draft.content : JSON.stringify(draft.content, null, 2);
      this.setData({ generatedDraft: draft, generatedContent: content, generating: false });
    }).catch(err => {
      if (this._unloaded || requestId !== this._draftRequestGeneration || !ownerStorage.isCurrent(owner)) return;
      this.setData({ generating: false });
      wx.showToast({ title: err.message || '生成失败', icon: 'none' });
    });
  },

  confirmGeneratedDraft() {
    const draft = this.data.generatedDraft;
    if (!draft || this.data.mutatingDraft || this.data.generating) return;
    let content = this.data.generatedContent;
    if (draft.materialType === 'tailored_resume') {
      try { content = JSON.parse(content); } catch (e) { return wx.showToast({ title: '简历 JSON 格式有误', icon: 'none' }); }
    }
    const owner = ownerStorage.capture();
    const requestId = this._draftRequestGeneration = (this._draftRequestGeneration || 0) + 1;
    this.setData({ mutatingDraft: true });
    v4Api.confirmMaterialDraft(draft.id, { content }).then(() => {
      if (this._unloaded || requestId !== this._draftRequestGeneration || !ownerStorage.isCurrent(owner)) return;
      wx.showToast({ title: '已确认并保存', icon: 'success' });
      this.closeGenerator();
      this.loadMaterials();
      this.loadGeneratorOptions();
    }).catch(err => {
      if (!this._unloaded && requestId === this._draftRequestGeneration && ownerStorage.isCurrent(owner)) wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    }).finally(() => {
      if (!this._unloaded && requestId === this._draftRequestGeneration && ownerStorage.isCurrent(owner)) this.setData({ mutatingDraft: false });
    });
  },

  rejectGeneratedDraft() {
    const draft = this.data.generatedDraft;
    if (!draft) return this.closeGenerator();
    if (this.data.mutatingDraft || this.data.generating) return;
    const owner = ownerStorage.capture();
    const requestId = this._draftRequestGeneration = (this._draftRequestGeneration || 0) + 1;
    this.setData({ mutatingDraft: true });
    v4Api.rejectMaterialDraft(draft.id).then(() => {
      if (!this._unloaded && requestId === this._draftRequestGeneration && ownerStorage.isCurrent(owner)) this.closeGenerator();
    }).catch(err => {
      if (!this._unloaded && requestId === this._draftRequestGeneration && ownerStorage.isCurrent(owner)) wx.showToast({ title: err.message || '拒绝失败', icon: 'none' });
    }).finally(() => {
      if (!this._unloaded && requestId === this._draftRequestGeneration && ownerStorage.isCurrent(owner)) this.setData({ mutatingDraft: false });
    });
  },

  copyMaterial(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.materials.find(row => String(row.id) === String(id));
    if (!item || !item.content) return;
    wx.setClipboardData({
      data: item.content,
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    });
  },

  openEditor(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.materials.find(row => String(row.id) === String(id));
    if (!item) return;
    this.setData({
      showEditor: true,
      editId: String(id),
      editForm: {
        questionLabel: item.questionLabel || '',
        company: item.company || '',
        jobTitle: item.jobTitle || '',
        content: item.content || ''
      }
    });
  },

  closeEditor() {
    this.setData({
      showEditor: false,
      editId: '',
      editForm: {
        questionLabel: '',
        company: '',
        jobTitle: '',
        content: ''
      }
    });
  },

  onEditInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['editForm.' + field]: e.detail.value });
  },

  saveEdit() {
    if (!this.data.editId) return;
    const form = this.data.editForm;
    if (!String(form.content || '').trim()) {
      wx.showToast({ title: '请填写草稿内容', icon: 'none' });
      return;
    }
    appMaterials.updateMaterial(this.data.editId, {
      questionLabel: String(form.questionLabel || '').trim() || '申请材料',
      company: String(form.company || '').trim() || '目标公司',
      jobTitle: String(form.jobTitle || '').trim() || '目标岗位',
      content: String(form.content || '').trim()
    });
    this.closeEditor();
    this.loadMaterials();
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  deleteMaterial(e) {
    const id = e.currentTarget.dataset.id || this.data.editId;
    if (!id) return;
    wx.showModal({
      title: '删除草稿',
      content: '删除后无法恢复，确定删除这条申请材料吗？',
      confirmText: '删除',
      confirmColor: '#DC2626',
      success: (res) => {
        if (!res.confirm) return;
        appMaterials.removeMaterial(id);
        this.closeEditor();
        this.loadMaterials();
        wx.showToast({ title: '已删除', icon: 'none' });
      }
    });
  }
});
