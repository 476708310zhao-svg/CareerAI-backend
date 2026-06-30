const progress = require('../../../utils/job-progress.js');
const featureFlags = require('../../../utils/feature-flags.js');
const reminders = require('../../../utils/reminders.js');

function emptyForm() {
  return {
    company: '',
    jobTitle: '',
    city: '',
    salary: '',
    jobLink: '',
    appliedAt: '',
    deadline: '',
    interviewTime: '',
    status: 'collected',
    notes: '',
    resumeVersionId: ''
  };
}

Page({
  data: {
    records: [],
    filteredRecords: [],
    statusTabs: [],
    activeStatus: 'all',
    keyword: '',
    stats: {
      total: 0,
      active: 0,
      interviews: 0,
      offer: 0,
      dueSoon: 0,
      todayInterviews: 0
    },
    statusOptions: progress.STATUS_OPTIONS,
    showForm: false,
    editId: '',
    form: emptyForm(),
    today: progress.getToday(),
    dailyAdvice: progress.buildDailyAdvice()
  },

  onLoad() {
    this.buildStatusTabs();
    this.loadRecords();
  },

  onShow() {
    this.loadRecords();
  },

  onPullDownRefresh() {
    this.loadRecords();
    wx.stopPullDownRefresh();
  },

  buildStatusTabs(stats) {
    const byStatus = (stats && stats.byStatus) || {};
    const tabs = [{ code: 'all', label: '全部', count: stats ? stats.total : 0 }]
      .concat(progress.STATUS_OPTIONS.map(item => Object.assign({}, item, {
        count: byStatus[item.code] || 0
      })));
    this.setData({ statusTabs: tabs });
  },

  loadRecords() {
    const stats = progress.getStats();
    const records = progress.getList({ keyword: this.data.keyword });
    this.buildStatusTabs(stats);
    this.setData({
      records,
      stats,
      dailyAdvice: progress.buildDailyAdvice()
    }, () => this.applyFilter());
  },

  applyFilter() {
    const active = this.data.activeStatus;
    const filteredRecords = active === 'all'
      ? this.data.records
      : this.data.records.filter(item => item.status === active);
    this.setData({ filteredRecords });
  },

  setFilter(e) {
    const status = e.currentTarget.dataset.status || 'all';
    this.setData({ activeStatus: status }, () => this.applyFilter());
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value || '' }, () => this.loadRecords());
  },

  clearSearch() {
    this.setData({ keyword: '' }, () => this.loadRecords());
  },

  showAddForm() {
    this.setData({
      showForm: true,
      editId: '',
      form: Object.assign(emptyForm(), { appliedAt: progress.getToday() })
    });
  },

  openEditForm(e) {
    const id = e.currentTarget.dataset.id;
    const record = this.data.records.find(item => String(item.id) === String(id));
    if (!record) return;
    this.setData({
      showForm: true,
      editId: String(id),
      form: {
        company: record.company || '',
        jobTitle: record.jobTitle || '',
        city: record.city || '',
        salary: record.salary || '',
        jobLink: record.jobLink || '',
        appliedAt: record.appliedAt || '',
        deadline: record.deadline || '',
        interviewTime: record.interviewTime || '',
        status: record.status || 'collected',
        notes: record.notes || '',
        resumeVersionId: record.resumeVersionId || ''
      }
    });
  },

  hideForm() {
    this.setData({ showForm: false, editId: '', form: emptyForm() });
  },

  noop() {},

  syncRecordReminders(record) {
    if (!record || !record.id) return;
    let requestedSubscribe = false;
    const payload = {
      title: record.jobTitle || '',
      company: record.company || '',
      jobTitle: record.jobTitle || '',
      payload: {
        sourceJobId: record.sourceJobId || '',
        city: record.city || '',
        status: record.status || ''
      }
    };
    if (record.deadline) {
      reminders.upsertReminder(Object.assign({}, payload, {
        sourceType: 'job_progress',
        targetId: record.id,
        reminderType: 'deadline',
        reminderDate: record.deadline,
        leadDays: record.reminderLeadDays || [3, 1, 0],
        enabled: true
      }), { withSubscribe: true });
      requestedSubscribe = true;
    } else {
      reminders.disableReminder('job_progress', record.id, 'deadline');
    }
    if (record.interviewTime) {
      reminders.upsertReminder(Object.assign({}, payload, {
        sourceType: 'job_progress',
        targetId: record.id,
        reminderType: 'interview',
        reminderDate: String(record.interviewTime).slice(0, 10),
        reminderTime: record.interviewTime,
        leadDays: [1, 0],
        enabled: true
      }), { withSubscribe: !requestedSubscribe });
    } else {
      reminders.disableReminder('job_progress', record.id, 'interview');
    }
  },

  onFormInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['form.' + field]: e.detail.value });
  },

  pickDate(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['form.' + field]: e.detail.value });
  },

  clearDate(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['form.' + field]: '' });
  },

  selectFormStatus(e) {
    this.setData({ 'form.status': e.currentTarget.dataset.status });
  },

  saveRecord() {
    const form = this.data.form;
    const company = (form.company || '').trim();
    const jobTitle = (form.jobTitle || '').trim();
    if (!company || !jobTitle) {
      wx.showToast({ title: '请填写公司和岗位', icon: 'none' });
      return;
    }
    const payload = {
      company,
      jobTitle,
      city: (form.city || '').trim(),
      salary: (form.salary || '').trim(),
      jobLink: (form.jobLink || '').trim(),
      appliedAt: form.appliedAt || '',
      deadline: form.deadline || '',
      interviewTime: form.interviewTime || '',
      status: form.status || 'collected',
      notes: (form.notes || '').trim(),
      resumeVersionId: (form.resumeVersionId || '').trim()
    };
    const wasEdit = !!this.data.editId;
    let savedRecord;
    if (wasEdit) {
      savedRecord = progress.update(this.data.editId, payload);
    } else {
      savedRecord = progress.upsert(Object.assign({
        id: 'local_' + Date.now(),
        createdAt: progress.getToday()
      }, payload));
    }
    this.syncRecordReminders(savedRecord);
    this.hideForm();
    this.loadRecords();
    wx.showToast({ title: wasEdit ? '已更新' : '已添加', icon: 'success' });
  },

  openActions(e) {
    const id = e.currentTarget.dataset.id;
    const record = this.data.records.find(item => String(item.id) === String(id));
    if (!record) return;
    const actions = ['编辑记录', '更新状态'];
    if (record.sourceJobId) actions.push('查看职位详情');
    actions.push('删除记录');
    wx.showActionSheet({
      itemList: actions,
      success: (res) => {
        let index = res.tapIndex;
        if (index === 0) {
          this.openEditForm({ currentTarget: { dataset: { id } } });
          return;
        }
        if (index === 1) {
          this.updateStatus(id);
          return;
        }
        index -= 2;
        if (record.sourceJobId) {
          if (index === 0) {
            this.cacheJobSnapshot(record);
            wx.navigateTo({ url: '/package-user/pages/job-detail/job-detail?id=' + encodeURIComponent(record.sourceJobId) });
            return;
          }
          index -= 1;
        }
        this.deleteRecord(id);
      }
    });
  },

  updateStatus(id) {
    wx.showActionSheet({
      itemList: progress.STATUS_OPTIONS.map(item => item.label),
      success: (res) => {
        const selected = progress.STATUS_OPTIONS[res.tapIndex];
        if (!selected) return;
        const patch = { status: selected.code };
        if (selected.code === 'applied' && !this.data.records.find(item => String(item.id) === String(id)).appliedAt) {
          patch.appliedAt = progress.getToday();
        }
        progress.update(id, patch);
        this.loadRecords();
        wx.showToast({ title: '状态已更新', icon: 'success' });
      }
    });
  },

  deleteRecord(id) {
    wx.showModal({
      title: '删除进度记录',
      content: '删除后无法恢复，确定删除这条求职进度吗？',
      confirmText: '删除',
      confirmColor: '#DC2626',
      success: (res) => {
        if (!res.confirm) return;
        progress.remove(id);
        reminders.disableReminder('job_progress', id, 'deadline');
        reminders.disableReminder('job_progress', id, 'interview');
        this.loadRecords();
        wx.showToast({ title: '已删除', icon: 'none' });
      }
    });
  },

  cacheJobSnapshot(record) {
    const snapshot = {
      id: record.sourceJobId,
      title: record.jobTitle,
      company: record.company,
      city: record.city,
      salary: record.salary,
      applyLink: record.jobLink,
      description: record.notes || ''
    };
    wx.setStorageSync('tempJobDetail', snapshot);
    wx.setStorageSync('jobDetailSnapshot_' + String(record.sourceJobId), snapshot);
  },

  goToJobs() {
    if (!featureFlags.allowNavigation('/pages/jobs/jobs')) return;
    wx.switchTab({ url: '/pages/jobs/jobs' });
  },

  goDailyBrief() {
    wx.navigateTo({ url: '/package-ai/pages/daily-brief/daily-brief' });
  }
});
