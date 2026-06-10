// pages/applications/applications.js
const { getApplications } = require('../../../utils/api.js');
const demoData = require('../../../utils/demo-data.js');
const ALLOW_DEMO_FALLBACK = demoData.enabled();

const AVATAR_COLORS = ['#6B4EFF','#FF6B35','#00B894','#0984E3','#E17055','#6C5CE7','#FDCB6E','#00CEC9','#E84393','#74B9FF'];
const PROJECT_STORAGE_KEY = 'jobProjects';
const PROJECT_CATEGORIES = [
  { id: 'na_tech',     label: '北美 Tech', color: '#3B82F6', bg: '#EFF6FF' },
  { id: 'uk_consult',  label: '英国咨询',  color: '#8B5CF6', bg: '#F5F3FF' },
  { id: 'cn_campus',   label: '国内校招',  color: '#EF4444', bg: '#FEF2F2' },
  { id: 'sg_finance',  label: '新加坡金融', color: '#F59E0B', bg: '#FFFBEB' },
  { id: 'au_general',  label: '澳洲求职',  color: '#10B981', bg: '#ECFDF5' },
  { id: 'custom',      label: '自定义',    color: '#6B7280', bg: '#F9FAFB' },
];

Page({
  data: {
    applications: [],
    filteredApps: [],
    loading: true,
    isRefreshing: false,
    isVip: false,
    filterTab: 'all',
    showModal: false,
    form: { company: '', job_title: '', city: '', salary: '', status: 'pending', deadline: '', projectId: '' },
    statusOptions: [
      { code: 'pending',   text: '⏳ 待初筛' },
      { code: 'interview', text: '📅 面试中' },
      { code: 'offer',     text: '🎉 已录用' },
      { code: 'rejected',  text: '❌ 已结束' }
    ],
    stats: { total: 0, pending: 0, interviewing: 0, offer: 0, rejected: 0, interviewRate: 0, offerRate: 0 },
    showNoteModal: false,
    noteContent: '',
    noteTargetId: '',
    // 编辑模式：非空时为编辑已有记录的 id
    editId: '',
    searchKeyword: '',
    sortBy: 'date',  // 'date' | 'deadline'
    projectCategories: PROJECT_CATEGORIES,
    projects: [],
    projectFilter: '',
    projectName: '',
    showProjectModal: false,
    projectEditId: '',
    projectForm: { name: '', categoryId: 'na_tech', description: '', targetCompanies: '', startDate: '', deadline: '' },

    // Offer 追踪
    showOfferModal: false,
    offerTargetId: '',
    offerForm: { interviewers: '', interviewTime: '', feedback: '', ocDetails: '', offerBase: '', offerBonus: '', offerRsu: '' },
  },

  _searchTimer: null,

  onLoad: function(options = {}) {
    const vipLevel = (wx.getStorageSync('userInfo') || {}).vipLevel || 0;
    this.setData({ isVip: vipLevel > 0 });
    if (options.projectFilter) {
      this.setData({
        projectFilter: decodeURIComponent(options.projectFilter),
        projectName: options.projectName ? decodeURIComponent(options.projectName) : '求职项目'
      });
    }
    this.loadProjects();
    this.loadApplications();
  },

  onShow: function() {
    const vipLevel = (wx.getStorageSync('userInfo') || {}).vipLevel || 0;
    this.setData({ isVip: vipLevel > 0 });
    this.loadProjects();
    this.checkDeadlineReminders();
  },

  onUnload: function() {
    if (this._searchTimer) {
      clearTimeout(this._searchTimer);
      this._searchTimer = null;
    }
  },

  checkDeadlineReminders: function() {
    const apps = wx.getStorageSync('localApplications') || [];
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const threeDaysLater = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);
    const threeStr = threeDaysLater.toISOString().slice(0, 10);
    const urgent = apps.filter(a => {
      if (!a.deadline || a.status === 'offer' || a.status === 'rejected') return false;
      return a.deadline >= todayStr && a.deadline <= threeStr;
    });
    if (urgent.length > 0) {
      wx.showModal({
        title: '⏰ 截止日期提醒',
        content: '有 ' + urgent.length + ' 个职位即将截止，请及时处理！\n最近：' + urgent[0].company + ' - ' + urgent[0].job_title + '（' + urgent[0].deadline + '）',
        showCancel: false,
        confirmText: '知道了'
      });
    }
  },

  onPullDownRefresh: function() {
    this.setData({ isRefreshing: true });
    this.loadApplications();
  },

  loadApplications: function() {
    this.setData({ loading: true });

    // Try local storage first (user-added entries)
    const localApps = wx.getStorageSync('localApplications') || [];

    const userProfile = wx.getStorageSync('userProfile');
    const userId = (userProfile && userProfile.userId) ? userProfile.userId : wx.getStorageSync('deviceUserId') || (() => {
      const id = 'u_' + Date.now();
      wx.setStorageSync('deviceUserId', id);
      return id;
    })();

    getApplications(userId).then(res => {
      if (!res || !res.data || res.data.length === 0) {
        this.updateList(this.mergeApps([], localApps));
        return;
      }
      const apiList = this.processData(res.data);
      // Merge: local additions take priority (dedup by id)
      const merged = this.mergeApps(apiList, localApps);
      this.updateList(merged);
    }).catch(() => {
      if (ALLOW_DEMO_FALLBACK) {
        this.loadMockData(localApps);
      } else {
        this.updateList(this.mergeApps([], localApps));
      }
    }).finally(() => {
      if (this.data.isRefreshing) {
        wx.stopPullDownRefresh();
        this.setData({ isRefreshing: false });
      }
    });
  },

  mergeApps: function(apiList, localList) {
    const localIds = new Set(localList.map(a => String(a.id)));
    const apiProcessed = apiList.filter(a => !localIds.has(String(a.id)));
    const localProcessed = localList.map(a => {
      const cfg = this.getStatusConfig(a.status);
      return { ...a, projectId: a.projectId || '', statusCode: a.status, statusText: cfg.text, stageLevel: this.getStageLevel(a.status), avatarInitial: this.getInitial(a.company), avatarColor: this.getAvatarColor(a.company) };
    });
    return [...localProcessed, ...this.processData(apiProcessed)];
  },

  loadMockData: function(localApps) {
    if (!ALLOW_DEMO_FALLBACK) {
      this.updateList(this.mergeApps([], localApps || []));
      return;
    }
    const MOCK_APPLICATIONS = demoData.getList('APPLICATIONS');
    this.updateList(this.mergeApps(this.processData(MOCK_APPLICATIONS), localApps));
  },

  processData: function(rawData) {
    const today = new Date().toISOString().slice(0, 10);
    const threeDaysLater = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return rawData.map(item => {
      const cfg = this.getStatusConfig(item.status);
      const deadline = item.deadline || '';
      const deadlineUrgent = deadline && item.status !== 'offer' && item.status !== 'rejected'
        && deadline >= today && deadline <= threeDaysLater;
      return {
        id: item.id,
        job_id: item.job_id || item.sourceJobId || item.source_job_id || '',
        job_title: item.job_title || 'Unknown Position',
        company: item.company || 'Unknown Company',
        city: item.city || '',
        salary: item.salary || '面议',
        applied_at: item.applied_at || '',
        notes: item.notes || '',
        projectId: item.projectId || '',
        deadline,
        deadlineUrgent,
        statusCode: item.status,
        statusText: cfg.text,
        stageLevel: this.getStageLevel(item.status),
        avatarInitial: this.getInitial(item.company || 'U'),
        avatarColor: this.getAvatarColor(item.company || 'U'),
        offer: item.offer || null,
      };
    });
  },

  updateList: function(list) {
    const pending = list.filter(i => i.statusCode === 'pending').length;
    const interviewing = list.filter(i => i.statusCode === 'interview').length;
    const offer = list.filter(i => i.statusCode === 'offer').length;
    const rejected = list.filter(i => i.statusCode === 'rejected').length;
    const total = list.length;
    const interviewRate = total > 0 ? Math.round((interviewing + offer) / total * 100) : 0;
    const offerRate = total > 0 ? Math.round(offer / total * 100) : 0;
    const stats = { total, pending, interviewing, offer, rejected, interviewRate, offerRate };
    this.setData({ applications: list, stats, loading: false });
    this.loadProjects(list);
    this.applyFilter(this.data.filterTab, list);
  },

  applyFilter: function(tab, list) {
    const src = list || this.data.applications;
    const keyword = (this.data.searchKeyword || '').trim().toLowerCase();
    let filtered = tab === 'all' ? src : src.filter(a => a.statusCode === tab);
    if (this.data.projectFilter) {
      filtered = filtered.filter(a => String(a.projectId || '') === String(this.data.projectFilter));
    }
    if (keyword) {
      filtered = filtered.filter(a =>
        (a.company || '').toLowerCase().includes(keyword) ||
        (a.job_title || '').toLowerCase().includes(keyword)
      );
    }
    // 排序
    const sortBy = this.data.sortBy;
    filtered = [...filtered].sort((a, b) => {
      if (sortBy === 'deadline') {
        const da = a.deadline || '9999-12-31';
        const db = b.deadline || '9999-12-31';
        return da < db ? -1 : da > db ? 1 : 0;
      }
      // 默认按投递时间倒序
      const ta = a.applied_at || '';
      const tb = b.applied_at || '';
      return ta < tb ? 1 : ta > tb ? -1 : 0;
    });
    this.setData({ filteredApps: filtered });
  },

  onSearchInput: function(e) {
    this.setData({ searchKeyword: e.detail.value });
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => {
      this.applyFilter(this.data.filterTab);
      this._searchTimer = null;
    }, 220);
  },

  clearSearch: function() {
    if (this._searchTimer) {
      clearTimeout(this._searchTimer);
      this._searchTimer = null;
    }
    this.setData({ searchKeyword: '' });
    this.applyFilter(this.data.filterTab);
  },

  toggleSort: function() {
    const sortBy = this.data.sortBy === 'date' ? 'deadline' : 'date';
    this.setData({ sortBy });
    this.applyFilter(this.data.filterTab);
    wx.showToast({ title: sortBy === 'deadline' ? '按截止日期排序' : '按投递时间排序', icon: 'none', duration: 1200 });
  },

  setFilter: function(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ filterTab: tab });
    this.applyFilter(tab);
  },

  getStatusConfig: function(status) {
    switch (status) {
      case 'offer':     return { text: '已录用' };
      case 'interview': return { text: '面试中' };
      case 'rejected':  return { text: '已结束' };
      case 'pending':
      default:          return { text: '待初筛' };
    }
  },

  getStageLevel: function(status) {
    switch (status) {
      case 'offer':     return 4;
      case 'interview': return 3;
      case 'pending':   return 2;
      default:          return 1;
    }
  },

  getInitial: function(name) {
    if (!name) return '?';
    return name[0].toUpperCase();
  },

  getAvatarColor: function(name) {
    if (!name) return AVATAR_COLORS[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  },

  viewApplication: function(e) {
    const id = e.currentTarget.dataset.id;
    const app = this.data.applications.find(a => String(a.id) === String(id));
    const hasJobDetail = app && app.job_id && !String(app.id).startsWith('local_');
    const isOffer = app && app.statusCode === 'offer';

    const actions = ['编辑记录', '更新状态'];
    if (isOffer) actions.push('✏️ Offer 详情');
    if (hasJobDetail) actions.push('查看职位详情');
    actions.push('删除记录');

    wx.showActionSheet({
      itemList: actions,
      success: (res) => {
        let idx = res.tapIndex;
        if (idx === 0) { this.openEditModal(id); return; }
        if (idx === 1) { this.updateApplicationStatus(id); return; }
        idx -= 2;  // remaining
        if (isOffer) {
          if (idx === 0) { this.openOfferModal(id); return; }
          idx--;
        }
        if (hasJobDetail) {
          if (idx === 0) {
            this.cacheJobDetailSnapshot(app);
            wx.navigateTo({ url: `/package-user/pages/job-detail/job-detail?id=${app.job_id}` });
            return;
          }
          idx--;
        }
        this.deleteApplication(id);
      }
    });
  },

  cacheJobDetailSnapshot: function(app) {
    if (!app || !app.job_id) return;
    const snapshot = {
      id: app.job_id,
      title: app.job_title,
      company: app.company,
      city: app.city,
      salary: app.salary,
      postedAt: app.applied_at,
      description: app.notes || ''
    };
    wx.setStorageSync('tempJobDetail', snapshot);
    wx.setStorageSync('jobDetailSnapshot_' + String(app.job_id), snapshot);
  },

  openEditModal: function(id) {
    const app = this.data.applications.find(a => String(a.id) === String(id));
    if (!app) return;
    this.setData({
      showModal: true,
      editId: String(id),
      form: {
        company:   app.company   || '',
        job_title: app.job_title || '',
        city:      app.city      || '',
        salary:    app.salary !== '面议' ? app.salary : '',
        notes:     app.notes     || '',
        deadline:  app.deadline  || '',
        projectId: app.projectId || '',
        status:    app.statusCode || 'pending'
      }
    });
  },

  openNoteModal: function(id) {
    const app = this.data.applications.find(a => String(a.id) === String(id));
    this.setData({ showNoteModal: true, noteTargetId: String(id), noteContent: app ? (app.notes || '') : '' });
  },

  closeNoteModal: function() {
    this.setData({ showNoteModal: false });
  },

  onNoteInput: function(e) {
    this.setData({ noteContent: e.detail.value });
  },

  saveNote: function() {
    const { noteTargetId, noteContent } = this.data;
    let localApps = wx.getStorageSync('localApplications') || [];
    const idx = localApps.findIndex(a => String(a.id) === noteTargetId);
    if (idx >= 0) {
      localApps[idx].notes = noteContent;
      wx.setStorageSync('localApplications', localApps);
    }
    const apps = this.data.applications.map(a =>
      String(a.id) === noteTargetId ? { ...a, notes: noteContent } : a
    );
    this.setData({ showNoteModal: false });
    this.updateList(apps);
    wx.showToast({ title: '备注已保存', icon: 'success' });
  },

  quickUpdateStatus: function(e) {
    this.updateApplicationStatus(e.currentTarget.dataset.id);
  },

  updateApplicationStatus: function(id) {
    wx.showActionSheet({
      itemList: ['⏳ 待初筛', '📅 面试中', '🎉 已录用', '❌ 已结束'],
      success: (res) => {
        const codes = ['pending', 'interview', 'offer', 'rejected'];
        const newStatus = codes[res.tapIndex];
        // Update in local storage
        let localApps = wx.getStorageSync('localApplications') || [];
        const idx = localApps.findIndex(a => String(a.id) === String(id));
        if (idx >= 0) {
          localApps[idx].status = newStatus;
          wx.setStorageSync('localApplications', localApps);
        }
        // Update in current list
        const apps = this.data.applications.map(a => {
          if (String(a.id) === String(id)) {
            const cfg = this.getStatusConfig(newStatus);
            return { ...a, statusCode: newStatus, statusText: cfg.text, stageLevel: this.getStageLevel(newStatus) };
          }
          return a;
        });
        this.updateList(apps);
        wx.showToast({ title: '状态已更新', icon: 'success' });
      }
    });
  },

  deleteApplication: function(id) {
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定吗？',
      success: (res) => {
        if (res.confirm) {
          let localApps = wx.getStorageSync('localApplications') || [];
          localApps = localApps.filter(a => String(a.id) !== String(id));
          wx.setStorageSync('localApplications', localApps);
          const apps = this.data.applications.filter(a => String(a.id) !== String(id));
          this.updateList(apps);
          wx.showToast({ title: '已删除', icon: 'success' });
        }
      }
    });
  },

  showAddModal: function() {
    this.setData({ showModal: true, editId: '', form: { company: '', job_title: '', city: '', salary: '', notes: '', deadline: '', status: 'pending', projectId: this.data.projectFilter || '' } });
  },

  hideAddModal: function() {
    this.setData({ showModal: false, editId: '' });
  },

  onFormInput: function(e) {
    const field = e.currentTarget.dataset.field;
    const form = { ...this.data.form, [field]: e.detail.value };
    this.setData({ form });
  },

  noop: function() {},

  onDeadlinePick: function(e) {
    this.setData({ form: { ...this.data.form, deadline: e.detail.value } });
  },

  clearDeadline: function() {
    this.setData({ form: { ...this.data.form, deadline: '' } });
  },

  selectStatus: function(e) {
    const code = e.currentTarget.dataset.code;
    this.setData({ form: { ...this.data.form, status: code } });
  },

  saveApplication: function() {
    const { company, job_title, city, salary, status, notes, deadline, projectId } = this.data.form;
    const { editId } = this.data;
    if (!company.trim() || !job_title.trim()) {
      wx.showToast({ title: '请填写公司和职位', icon: 'none' });
      return;
    }

    let localApps = wx.getStorageSync('localApplications') || [];

    if (editId) {
      // ── 编辑模式：更新已有记录 ──
      const idx = localApps.findIndex(a => String(a.id) === editId);
      if (idx >= 0) {
        localApps[idx] = {
          ...localApps[idx],
          company: company.trim(),
          job_title: job_title.trim(),
          city: city.trim(),
          salary: salary.trim() || '面议',
          notes: (notes || '').trim(),
          deadline: (deadline || '').trim(),
          projectId: projectId || '',
          status
        };
      }
      wx.setStorageSync('localApplications', localApps);
      const apps = this.data.applications.map(a =>
        String(a.id) === editId ? this.processData([localApps.find(l => String(l.id) === editId)])[0] : a
      );
      this.setData({ showModal: false, editId: '' });
      this.updateList(apps);
      wx.showToast({ title: '已更新', icon: 'success' });
    } else {
      // ── 新增模式 ──
      const newApp = {
        id: 'local_' + Date.now(),
        company: company.trim(),
        job_title: job_title.trim(),
        city: city.trim(),
        salary: salary.trim() || '面议',
        notes: (notes || '').trim(),
        deadline: (deadline || '').trim(),
        projectId: projectId || '',
        status,
        applied_at: new Date().toISOString().slice(0, 10)
      };
      localApps.unshift(newApp);
      wx.setStorageSync('localApplications', localApps);
      const processed = this.processData([newApp])[0];
      const apps = [processed, ...this.data.applications];
      this.setData({ showModal: false });
      this.updateList(apps);
      wx.showToast({ title: '添加成功', icon: 'success' });
    }
  },

  // ── Offer 追踪 ─────────────────────────────────────────────────────────
  openOfferModal: function(id) {
    const app = this.data.applications.find(a => String(a.id) === String(id));
    if (!app) return;
    const o = app.offer || {};
    this.setData({
      showOfferModal: true,
      offerTargetId: String(id),
      offerForm: {
        interviewers: o.interviewers || '',
        interviewTime: o.interviewTime || '',
        feedback:      o.feedback     || '',
        ocDetails:     o.ocDetails    || '',
        offerBase:     o.offerBase    || '',
        offerBonus:    o.offerBonus   || '',
        offerRsu:      o.offerRsu     || '',
      }
    });
  },

  closeOfferModal: function() {
    this.setData({ showOfferModal: false });
  },

  onOfferInput: function(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ offerForm: { ...this.data.offerForm, [field]: e.detail.value } });
  },

  saveOfferDetail: function() {
    const { offerTargetId, offerForm } = this.data;
    let localApps = wx.getStorageSync('localApplications') || [];
    const idx = localApps.findIndex(a => String(a.id) === offerTargetId);
    if (idx >= 0) {
      localApps[idx].offer = { ...offerForm };
      wx.setStorageSync('localApplications', localApps);
    }
    const apps = this.data.applications.map(a =>
      String(a.id) === offerTargetId ? { ...a, offer: { ...offerForm } } : a
    );
    this.setData({ showOfferModal: false });
    this.updateList(apps);
    wx.showToast({ title: 'Offer 信息已保存', icon: 'success' });
  },

  goToOfferCompare: function() {
    wx.navigateTo({ url: '/package-career/pages/offer-compare/offer-compare' });
  },

  loadProjects: function(sourceApps) {
    const raw = wx.getStorageSync(PROJECT_STORAGE_KEY) || [];
    const apps = sourceApps || this.data.applications || [];
    const projects = raw.map(project => {
      const category = PROJECT_CATEGORIES.find(item => item.id === project.categoryId) || PROJECT_CATEGORIES[PROJECT_CATEGORIES.length - 1];
      const linked = apps.filter(app => String(app.projectId || '') === String(project.id));
      return {
        ...project,
        category,
        appCount: linked.length,
        interviewCount: linked.filter(app => app.statusCode === 'interview' || app.status === 'interview').length,
        offerCount: linked.filter(app => app.statusCode === 'offer' || app.status === 'offer').length
      };
    });
    this.setData({ projects });
  },

  setProjectFilter: function(e) {
    const { id, name } = e.currentTarget.dataset;
    this.setData({ projectFilter: id || '', projectName: name || '', filterTab: 'all' });
    this.applyFilter('all');
  },

  clearProjectFilter: function() {
    this.setData({ projectFilter: '', projectName: '', filterTab: 'all' });
    this.applyFilter('all');
  },

  showProjectModal: function() {
    this.setData({
      showProjectModal: true,
      projectEditId: '',
      projectForm: { name: '', categoryId: 'na_tech', description: '', targetCompanies: '', startDate: '', deadline: '' }
    });
  },

  hideProjectModal: function() {
    this.setData({ showProjectModal: false, projectEditId: '' });
  },

  onProjectInput: function(e) {
    this.setData({ ['projectForm.' + e.currentTarget.dataset.field]: e.detail.value });
  },

  selectProjectCategory: function(e) {
    this.setData({ 'projectForm.categoryId': e.currentTarget.dataset.id });
  },

  onProjectStartPick: function(e) {
    this.setData({ 'projectForm.startDate': e.detail.value });
  },

  onProjectDeadlinePick: function(e) {
    this.setData({ 'projectForm.deadline': e.detail.value });
  },

  selectFormProject: function(e) {
    this.setData({ 'form.projectId': e.currentTarget.dataset.id || '' });
  },

  saveProject: function() {
    const { name, categoryId, description, targetCompanies, startDate, deadline } = this.data.projectForm;
    if (!name.trim()) {
      wx.showToast({ title: '请填写项目名称', icon: 'none' });
      return;
    }

    const companies = targetCompanies.trim()
      ? targetCompanies.split(/[，,、\n]/).map(item => item.trim()).filter(Boolean)
      : [];
    const list = wx.getStorageSync(PROJECT_STORAGE_KEY) || [];
    list.unshift({
      id: 'proj_' + Date.now(),
      name: name.trim(),
      categoryId,
      description: description.trim(),
      targetCompanies: companies,
      startDate,
      deadline,
      createdAt: new Date().toISOString().slice(0, 10),
      updatedAt: new Date().toISOString().slice(0, 10)
    });

    wx.setStorageSync(PROJECT_STORAGE_KEY, list);
    this.setData({ showProjectModal: false });
    this.loadProjects();
    wx.showToast({ title: '项目已创建', icon: 'success' });
  },

  goToCareerPlanner: function() {
    wx.navigateTo({ url: '/package-career/pages/career-planner/career-planner' });
  },

  goToJobs: function() {
    wx.switchTab({ url: '/pages/jobs/jobs' });
  }
});
