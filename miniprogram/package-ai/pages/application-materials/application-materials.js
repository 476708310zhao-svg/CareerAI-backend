const appMaterials = require('../../../utils/application-materials.js');

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
    }
  },

  onLoad() {
    this.loadMaterials();
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
    wx.navigateTo({ url: '/package-ai/pages/ai-assistant/ai-assistant?action=application' });
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
