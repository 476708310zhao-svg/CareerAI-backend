// pages/job-projects/job-projects.js
const STORAGE_KEY = 'jobProjects';

const CATEGORIES = [
  { id: 'na_tech',     label: '北美 Tech', icon: '🇺🇸', color: '#3B82F6', bg: '#EFF6FF' },
  { id: 'uk_consult',  label: '英国咨询',  icon: '🇬🇧', color: '#8B5CF6', bg: '#F5F3FF' },
  { id: 'cn_campus',   label: '国内校招',  icon: '🇨🇳', color: '#EF4444', bg: '#FEF2F2' },
  { id: 'sg_finance',  label: '新加坡金融', icon: '🇸🇬', color: '#F59E0B', bg: '#FFFBEB' },
  { id: 'au_general',  label: '澳洲求职',  icon: '🇦🇺', color: '#10B981', bg: '#ECFDF5' },
  { id: 'custom',      label: '自定义',    icon: '✏️',  color: '#6B7280', bg: '#F9FAFB' },
];

Page({
  data: {
    categories: CATEGORIES,
    projects: [],
    currentProjectIdx: -1,   // which project is expanded
    showModal: false,
    editId: '',
    form: { name: '', categoryId: 'na_tech', description: '', targetCompanies: '', startDate: '', deadline: '' },
    showDetail: false,
    detailProject: null,
  },

  onLoad() {
    this._loadProjects();
  },

  onShow() {
    this._loadProjects();
  },

  _loadProjects() {
    const raw = wx.getStorageSync(STORAGE_KEY) || [];
    const apps = wx.getStorageSync('localApplications') || [];
    const projects = raw.map(p => {
      const cat = CATEGORIES.find(c => c.id === p.categoryId) || CATEGORIES[5];
      const linked = apps.filter(a => a.projectId === p.id);
      return {
        ...p,
        _cat: cat,
        _appCount: linked.length,
        _offerCount: linked.filter(a => a.status === 'offer').length,
        _interviewCount: linked.filter(a => a.status === 'interview').length,
      };
    });
    this.setData({ projects });
  },

  // 展开/收起项目详情
  toggleDetail(e) {
    const idx = e.currentTarget.dataset.idx;
    const cur = this.data.currentProjectIdx;
    this.setData({ currentProjectIdx: cur === idx ? -1 : idx });
  },

  // 查看详情页
  openDetail(e) {
    const idx = e.currentTarget.dataset.idx;
    this.setData({ showDetail: true, detailProject: this.data.projects[idx] });
  },

  closeDetail() {
    this.setData({ showDetail: false, detailProject: null });
  },

  // 添加
  showAddModal() {
    this.setData({
      showModal: true, editId: '',
      form: { name: '', categoryId: 'na_tech', description: '', targetCompanies: '', startDate: '', deadline: '' }
    });
  },

  // 编辑
  openEdit(e) {
    const idx = e.currentTarget.dataset.idx;
    const p = this.data.projects[idx];
    this.setData({
      showModal: true,
      editId: p.id,
      form: { name: p.name, categoryId: p.categoryId, description: p.description || '', targetCompanies: (p.targetCompanies || []).join('、'), startDate: p.startDate || '', deadline: p.deadline || '' }
    });
  },

  hideModal() {
    this.setData({ showModal: false });
  },

  noop() {},

  onFormInput(e) {
    this.setData({ ['form.' + e.currentTarget.dataset.field]: e.detail.value });
  },

  selectCategory(e) {
    this.setData({ 'form.categoryId': e.currentTarget.dataset.id });
  },

  onStartDatePick(e) {
    this.setData({ 'form.startDate': e.detail.value });
  },

  onDeadlinePick(e) {
    this.setData({ 'form.deadline': e.detail.value });
  },

  saveProject() {
    const { name, categoryId, description, targetCompanies, startDate, deadline } = this.data.form;
    if (!name.trim()) { wx.showToast({ title: '请填写项目名称', icon: 'none' }); return; }

    const companies = targetCompanies.trim()
      ? targetCompanies.split(/[，,、\n]/).map(s => s.trim()).filter(Boolean)
      : [];

    let list = wx.getStorageSync(STORAGE_KEY) || [];
    if (this.data.editId) {
      list = list.map(p => p.id === this.data.editId
        ? { ...p, name: name.trim(), categoryId, description: description.trim(), targetCompanies: companies, startDate, deadline, updatedAt: new Date().toISOString().slice(0, 10) }
        : p
      );
      wx.showToast({ title: '已更新', icon: 'success' });
    } else {
      list.unshift({
        id: 'proj_' + Date.now(),
        name: name.trim(),
        categoryId,
        description: description.trim(),
        targetCompanies: companies,
        startDate,
        deadline,
        createdAt: new Date().toISOString().slice(0, 10),
        updatedAt: new Date().toISOString().slice(0, 10),
      });
      wx.showToast({ title: '项目已创建', icon: 'success' });
    }
    wx.setStorageSync(STORAGE_KEY, list);
    this.setData({ showModal: false });
    this._loadProjects();
  },

  deleteProject(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除项目',
      content: '确定删除该求职项目？已关联的投递记录不受影响。',
      success: (res) => {
        if (!res.confirm) return;
        let list = wx.getStorageSync(STORAGE_KEY) || [];
        list = list.filter(p => p.id !== id);
        wx.setStorageSync(STORAGE_KEY, list);
        this._loadProjects();
        wx.showToast({ title: '已删除', icon: 'success' });
      }
    });
  },

  // 跳转到该项目的投递列表（筛选）
  goToApplications(e) {
    const projectId = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    wx.navigateTo({ url: '/pages/applications/applications?projectFilter=' + encodeURIComponent(projectId) + '&projectName=' + encodeURIComponent(name) });
  },

  goToJobs() {
    wx.switchTab({ url: '/pages/jobs/jobs' });
  },

  goToResume() {
    wx.navigateTo({ url: '/pages/resume/resume' });
  },
});
