const appMaterials = require('../../../utils/application-materials.js');
const v4Api = require('../../../utils/api-v4.js');

const AI_MATERIAL_TYPES = [
  { code: 'tailored_resume', label: '按 JD 定制简历' },
  { code: 'cover_letter', label: 'Cover Letter' },
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
    applicationIndex: 0,
    resumeIndex: 0,
    materialTypeIndex: 0,
    generatedDraft: null,
    generatedContent: '',
    quota: null,
    generating: false
  },

  onLoad() {
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
    Promise.all([v4Api.getApplicationBoard(), v4Api.getV4Resumes(), v4Api.getMaterialQuota()]).then(([board, resumes, quota]) => {
      const groups = board.data && board.data.groups || {};
      const applications = Object.keys(groups).reduce((all, key) => all.concat(groups[key] || []), []);
      this.setData({ applications, resumes: resumes.data || [], quota: quota.data || null });
    }).catch(() => {});
  },

  closeGenerator() { this.setData({ showGenerator: false, generatedDraft: null, generatedContent: '' }); },
  onApplicationChange(e) { this.setData({ applicationIndex: Number(e.detail.value) || 0 }); },
  onResumeChange(e) { this.setData({ resumeIndex: Number(e.detail.value) || 0 }); },
  onMaterialTypeChange(e) { this.setData({ materialTypeIndex: Number(e.detail.value) || 0 }); },
  onGeneratedInput(e) { this.setData({ generatedContent: e.detail.value }); },

  generateAiMaterial() {
    const application = this.data.applications[this.data.applicationIndex];
    const resume = this.data.resumes[this.data.resumeIndex];
    const type = this.data.aiMaterialTypes[this.data.materialTypeIndex] || AI_MATERIAL_TYPES[0];
    if (!application) return wx.showToast({ title: '请先创建或选择申请记录', icon: 'none' });
    if (type.code === 'tailored_resume' && !resume) return wx.showToast({ title: '定制简历必须选择原简历', icon: 'none' });
    this.setData({ generating: true });
    v4Api.createMaterialDraft({ applicationId: application.id, resumeId: resume && resume.id, materialType: type.code }).then(res => {
      const draft = res.data;
      const content = typeof draft.content === 'string' ? draft.content : JSON.stringify(draft.content, null, 2);
      this.setData({ generatedDraft: draft, generatedContent: content, generating: false });
    }).catch(err => {
      this.setData({ generating: false });
      wx.showToast({ title: err.message || '生成失败', icon: 'none' });
    });
  },

  confirmGeneratedDraft() {
    const draft = this.data.generatedDraft;
    if (!draft) return;
    let content = this.data.generatedContent;
    if (draft.materialType === 'tailored_resume') {
      try { content = JSON.parse(content); } catch (e) { return wx.showToast({ title: '简历 JSON 格式有误', icon: 'none' }); }
    }
    v4Api.confirmMaterialDraft(draft.id, { content }).then(() => {
      wx.showToast({ title: '已确认并保存', icon: 'success' });
      this.closeGenerator();
      this.loadMaterials();
      this.loadGeneratorOptions();
    }).catch(err => wx.showToast({ title: err.message || '保存失败', icon: 'none' }));
  },

  rejectGeneratedDraft() {
    const draft = this.data.generatedDraft;
    if (!draft) return this.closeGenerator();
    v4Api.rejectMaterialDraft(draft.id).then(() => this.closeGenerator());
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
