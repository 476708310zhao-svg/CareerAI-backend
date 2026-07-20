const progress = require('../../../utils/job-progress.js');
const featureFlags = require('../../../utils/feature-flags.js');
const reminders = require('../../../utils/reminders.js');
const analytics = require('../../../utils/analytics.js');
const jdMatch = require('../../../utils/jd-match.js');
const navigation = require('../../../utils/navigation.js');

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
    nextAction: '',
    resumeVersionId: ''
  };
}

function normalizeKeywords(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  return String(value).split(/[、,\s]+/).map(item => item.trim()).filter(Boolean);
}

function scoreTone(score) {
  const n = Number(score || 0);
  if (n >= 82) return 'good';
  if (n >= 68) return 'ok';
  if (n > 0) return 'risk';
  return '';
}

function buildReportMap() {
  const map = {};
  jdMatch.getReports().forEach(report => {
    if (!report) return;
    if (report.id) map[String(report.id)] = report;
    if (report.serverId) map[String(report.serverId)] = report;
  });
  return map;
}

const STATUS_FLOW = progress.STATUS_OPTIONS
  .filter(item => item.code !== 'closed')
  .map((item, index) => Object.assign({ level: index + 1 }, item));

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
    statusFlow: STATUS_FLOW,
    showForm: false,
    showDetail: false,
    selectedRecord: null,
    editId: '',
    form: emptyForm(),
    today: progress.getToday(),
    dailyAdvice: progress.buildDailyAdvice()
  },

  onLoad() {
    this.buildStatusTabs();
    this.loadRecords({ remote: true });
  },

  onShow() {
    this.loadRecords({ remote: true });
  },

  onPullDownRefresh() {
    this.loadRecords({ remote: true }).then(() => wx.stopPullDownRefresh());
  },

  buildStatusTabs(stats) {
    const byStatus = (stats && stats.byStatus) || {};
    const tabs = [{ code: 'all', label: '全部', count: stats ? stats.total : 0 }]
      .concat(progress.STATUS_OPTIONS.map(item => Object.assign({}, item, {
        count: byStatus[item.code] || 0
      })));
    this.setData({ statusTabs: tabs });
  },

  loadRecords(options) {
    const render = () => {
    const stats = progress.getStats();
    const records = this.enrichRecords(progress.getList({ keyword: this.data.keyword }));
    this.buildStatusTabs(stats);
    this.setData({
      records,
      stats,
      dailyAdvice: progress.buildDailyAdvice()
    }, () => this.applyFilter());
    };
    render();
    if (options && options.remote) {
      return Promise.all([
        progress.syncFromServer(),
        jdMatch.fetchRemoteReports()
      ]).then(() => {
        render();
      });
    }
    return Promise.resolve();
  },

  enrichRecords(records) {
    const reportMap = buildReportMap();
    return (records || []).map(record => {
      const report = record.aiReportId ? reportMap[String(record.aiReportId)] : null;
      const matchScore = Number(record.matchScore || (report && report.score) || 0);
      const matchedKeywords = normalizeKeywords(record.matchedKeywords && record.matchedKeywords.length ? record.matchedKeywords : report && report.matchedKeywords);
      const missingKeywords = normalizeKeywords(record.missingKeywords && record.missingKeywords.length ? record.missingKeywords : report && report.missingKeywords);
      const aiSuggestion = record.aiSuggestion || (report && (report.recommendText || (report.suggestions || [])[0])) || '';
      const nextAction = record.nextAction || this.buildNextAction(record, matchScore, missingKeywords);
      return Object.assign({}, record, {
        matchReport: report || null,
        matchScore,
        matchScoreTone: scoreTone(matchScore),
        matchedKeywords,
        missingKeywords,
        matchedPreview: matchedKeywords.slice(0, 4),
        missingPreview: missingKeywords.slice(0, 4),
        matchedPreviewText: matchedKeywords.slice(0, 4).join(' / '),
        missingPreviewText: missingKeywords.slice(0, 4).join(' / '),
        aiSuggestion,
        nextAction,
        hasMatchReport: !!(matchScore || report || record.aiReportId)
      });
    });
  },

  buildNextAction(record, matchScore, missingKeywords) {
    if (record.hasInterviewToday || record.interviewTime) return '复盘 JD 关键词和 STAR 案例';
    if (record.deadlineUrgent) return '优先确认材料并完成投递';
    if (matchScore >= 82) return '整理投递材料并设置截止提醒';
    if (matchScore >= 68) return '补齐缺失关键词后投递';
    if (matchScore > 0) return '先优化简历版本再投递';
    return '补充 JD 分析或下一步事项';
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
        nextAction: record.nextAction || '',
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
      nextAction: (form.nextAction || '').trim(),
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
    analytics.track(wasEdit ? 'job_progress_update' : 'job_progress_create', {
      status: savedRecord.status,
      sourceJobId: savedRecord.sourceJobId || '',
      hasDeadline: !!savedRecord.deadline,
      hasInterviewTime: !!savedRecord.interviewTime
    });
    this.hideForm();
    this.loadRecords();
    wx.showToast({ title: wasEdit ? '已更新' : '已添加', icon: 'success' });
  },

  openActions(e) {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    const id = e.currentTarget.dataset.id;
    const record = this.data.records.find(item => String(item.id) === String(id));
    if (!record) return;
    const actions = ['查看详情', '编辑记录', '更新状态'];
    if (record.hasMatchReport) actions.push('查看 JD 匹配');
    if (record.sourceJobId) actions.push('查看职位详情');
    actions.push('删除记录');
    wx.showActionSheet({
      itemList: actions,
      success: (res) => {
        let index = res.tapIndex;
        if (index === 0) {
          this.openRecordDetail({ currentTarget: { dataset: { id } } });
          return;
        }
        if (index === 1) {
          this.openEditForm({ currentTarget: { dataset: { id } } });
          return;
        }
        if (index === 2) {
          this.updateStatus(id);
          return;
        }
        index -= 3;
        if (record.hasMatchReport) {
          if (index === 0) {
            this.openRecordDetail({ currentTarget: { dataset: { id } } });
            return;
          }
          index -= 1;
        }
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

  openRecordDetail(e) {
    const id = e.currentTarget.dataset.id;
    const record = this.data.records.find(item => String(item.id) === String(id));
    if (!record) return;
    this.setData({
      selectedRecord: record,
      showDetail: true
    });
  },

  hideDetail() {
    this.setData({ showDetail: false, selectedRecord: null });
  },

  editSelectedRecord() {
    const record = this.data.selectedRecord;
    if (!record) return;
    this.hideDetail();
    this.openEditForm({ currentTarget: { dataset: { id: record.id } } });
  },

  updateSelectedStatus() {
    const record = this.data.selectedRecord;
    if (!record) return;
    this.updateStatus(record.id);
    this.hideDetail();
  },

  goJdMatchFromRecord() {
    const record = this.data.selectedRecord;
    if (!record) return;
    this.cacheJobSnapshot(record);
    wx.navigateTo({ url: '/package-ai/pages/jd-match/jd-match' });
  },

  goAtsFromRecord() {
    const record = this.data.selectedRecord;
    if (!record) return;
    try {
      wx.setStorageSync('pendingAtsJob', {
        jobTitle: record.jobTitle || '',
        jobDescription: record.notes || record.aiSuggestion || '',
        source: 'job-progress'
      });
    } catch (e) {}
    wx.navigateTo({ url: '/package-career/pages/ats-optimize/ats-optimize' });
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
        const saved = progress.update(id, patch);
        analytics.track('job_progress_status_update', {
          id,
          status: selected.code,
          sourceJobId: saved && saved.sourceJobId || ''
        });
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
        analytics.track('job_progress_delete', { id });
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
    if (!featureFlags.allowNavigation('/pages/campus/campus')) return;
    navigation.safeNavigateTo('/pages/campus/campus');
  },

  goDailyBrief() {
    wx.navigateTo({ url: '/package-ai/pages/daily-brief/daily-brief' });
  }
});
