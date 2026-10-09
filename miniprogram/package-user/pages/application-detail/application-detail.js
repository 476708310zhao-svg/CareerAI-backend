const v4Api = require('../../../utils/api-v4.js');
const progress = require('../../../utils/job-progress.js');
const ownerStorage = require('../../../utils/owner-storage.js');

function currentOwnerScope() {
  return progress.currentOwnerScope ? String(progress.currentOwnerScope() || '') : '';
}

const NEXT_STATUS = Object.freeze({
  interested: 'preparing', preparing: 'applied', applied: 'oa', oa: 'phone_screen',
  phone_screen: 'interview_1', interview_1: 'interview_2', interview_2: 'final', final: 'offer'
});

function primaryActionFor(application, tasks, allowedTransitions) {
  const pendingTask = (tasks || []).find(item => !item.completed);
  if (pendingTask) return { label: `完成：${pendingTask.title}`, action: 'tasks' };
  const status = String(application && application.status || '');
  if (['offer', 'rejected', 'withdrawn'].includes(status)) {
    return { label: status === 'offer' ? '记录 Offer 后续' : '记录复盘与下一步', action: 'plan' };
  }
  const preferred = NEXT_STATUS[status];
  const next = (allowedTransitions || []).find(item => item.value === preferred);
  if (next) return { label: `推进到${next.label}`, action: 'status', status: next.value, statusLabel: next.label };
  return { label: '更新下一步', action: 'plan' };
}

Page({
  data: {
    id: '',
    loading: true,
    loadError: '',
    savingPlan: false,
    planDirty: false,
    changingStatus: false,
    addingTask: false,
    updatingTaskId: '',
    addingContact: false,
    application: null,
    history: [],
    contacts: [],
    tasks: [],
    materials: [],
    match: null,
    allowedTransitions: [],
    primaryAction: null,
    planForm: { nextAction: '', deadline: '', interviewTime: '', notes: '' },
    taskForm: { title: '', dueAt: '', priority: 'medium' },
    contactForm: { name: '', role: '', email: '', linkedin: '', notes: '' },
    priorityOptions: [
      { value: 'low', label: '低' },
      { value: 'medium', label: '中' },
      { value: 'high', label: '高' },
    ],
  },

  onLoad(options) {
    if (!options.id) {
      wx.showToast({ title: '申请记录不存在', icon: 'none' });
      this.setData({ loading: false, loadError: '申请记录不存在' });
      return;
    }
    this._ownerToken = String(wx.getStorageSync('token') || '');
    this._ownerScope = currentOwnerScope();
    this._unloaded = false;
    this.setData({ id: options.id });
    this.loadDetail();
  },

  onShow() {
    const token = String(wx.getStorageSync('token') || '');
    const ownerScope = currentOwnerScope();
    this._unloaded = false;
    if (this._ownerScope !== ownerScope) {
      this._ownerScope = ownerScope;
      this._ownerToken = token;
      this.clearStaleAccount();
      if (token && this.data.id) this.loadDetail();
      this._hasShown = true;
      return;
    }
    this._ownerToken = token;
    if (this._hasShown && token && this.data.id) this.loadDetail();
    this._hasShown = true;
  },

  onPullDownRefresh() {
    this.loadDetail().finally(() => wx.stopPullDownRefresh());
  },

  loadDetail() {
    if (!this.data.id || this.data.savingPlan || this.data.changingStatus) return Promise.resolve();
    const requestId = this._detailRequestId = (this._detailRequestId || 0) + 1;
    const token = wx.getStorageSync('token');
    const ownerScope = currentOwnerScope();
    const isCurrent = () => !this._unloaded && requestId === this._detailRequestId && token === wx.getStorageSync('token');
    this.setData({ loading: !this.data.application, loadError: '' });
    return v4Api.getApplicationDetail(this.data.id).then(res => {
      if (!isCurrent()) return;
      const data = res && res.code === 0 ? res.data : null;
      if (!data || !data.application) throw new Error('申请记录不存在');
      const app = data.application;
      const primaryAction = primaryActionFor(app, data.tasks, data.allowedTransitions);
      this.setData({
        application: app,
        history: data.history || [],
        contacts: data.contacts || [],
        tasks: data.tasks || [],
        materials: data.materials || [],
        match: data.match || null,
        allowedTransitions: data.allowedTransitions || [],
        primaryAction,
        planForm: Object.assign({
          nextAction: app.nextAction || '',
          deadline: app.deadline || '',
          interviewTime: app.interviewTime || '',
          notes: app.notes || '',
        }, Object.keys(this._planEdits || {}).reduce((draft, field) => {
          draft[field] = this.data.planForm[field];
          return draft;
        }, {})),
        loading: false,
      });
    }).catch(err => {
      if (!isCurrent()) return;
      this.setData({ loading: false, loadError: (err && err.message) || '加载失败，请重试' });
    }).finally(() => {
      if (this._unloaded || requestId !== this._detailRequestId) return;
      if (ownerScope !== currentOwnerScope()) this.clearStaleAccount();
      else if (token !== wx.getStorageSync('token')) this.setData({ loading: false });
    });
  },

  clearStaleAccount() {
    this._planEdits = {};
    this._detailRequestId = (this._detailRequestId || 0) + 1;
    this._mutationRequestId = (this._mutationRequestId || 0) + 1;
    this._navigationRequestId = (this._navigationRequestId || 0) + 1;
    this.setData({
      application: null, history: [], tasks: [], contacts: [], materials: [], match: null,
      primaryAction: null, allowedTransitions: [], loading: false, planDirty: false,
      planForm: { nextAction: '', deadline: '', interviewTime: '', notes: '' },
      savingPlan: false, changingStatus: false, addingTask: false, updatingTaskId: '', addingContact: false,
      loadError: '登录状态已变化，请重新加载'
    });
  },

  onUnload() {
    this._unloaded = true;
    this._detailRequestId = (this._detailRequestId || 0) + 1;
    this._mutationRequestId = (this._mutationRequestId || 0) + 1;
    this._navigationRequestId = (this._navigationRequestId || 0) + 1;
  },

  onPlanInput(e) {
    const field = e.currentTarget.dataset.field;
    if (!['nextAction', 'deadline', 'interviewTime', 'notes'].includes(field)) return;
    this._planEdits = this._planEdits || {};
    this._planEdits[field] = (this._editRevision || 0) + 1;
    this._editRevision = this._planEdits[field];
    this.setData({ [`planForm.${field}`]: e.detail.value, planDirty: true });
  },

  onPlanDate(e) {
    this.onPlanInput(e);
  },

  clearPlanDate(e) {
    this.onPlanInput({ currentTarget: e.currentTarget, detail: { value: '' } });
  },

  async savePlan() {
    if (this.data.savingPlan || this.data.changingStatus || !this.data.planDirty) return;
    const revisions = Object.assign({}, this._planEdits);
    const payload = Object.keys(revisions).reduce((result, field) => {
      result[field] = this.data.planForm[field];
      return result;
    }, {});
    const token = wx.getStorageSync('token');
    const ownerScope = currentOwnerScope();
    this._detailRequestId = (this._detailRequestId || 0) + 1;
    this.setData({ savingPlan: true });
    try {
      const res = await v4Api.updateApplication(this.data.id, payload);
      if (this._unloaded || token !== wx.getStorageSync('token')) return;
      if (!res || res.code !== 0 || !res.data || !res.data.id) throw new Error(res && res.message || '保存失败，请重试');
      Object.keys(revisions).forEach(field => {
        if (this._planEdits[field] === revisions[field]) delete this._planEdits[field];
      });
      this.setData({ application: { ...this.data.application, ...res.data }, planDirty: Object.keys(this._planEdits).length > 0 });
      wx.showToast({ title: '跟进已保存', icon: 'success' });
    } catch (err) {
      if (!this._unloaded && token === wx.getStorageSync('token')) {
        wx.showToast({ title: err.message || '保存失败，请重试', icon: 'none' });
      }
    } finally {
      if (!this._unloaded) {
        this.setData({ savingPlan: false });
        if (ownerScope !== currentOwnerScope()) this.clearStaleAccount();
      }
    }
  },

  changeStatus(e) {
    const status = e.currentTarget.dataset.status;
    const label = e.currentTarget.dataset.label;
    if (!status || this.data.changingStatus || this.data.savingPlan || !this.data.application) return;
    if (!this.data.allowedTransitions.some(item => item.value === status)) return;
    const token = wx.getStorageSync('token');
    const ownerScope = currentOwnerScope();
    const expectedState = { status: this.data.application.status, historyId: this.data.application.historyId };
    this.setData({ changingStatus: true });
    wx.showModal({
      title: '更新申请状态',
      content: `确认将申请状态更新为“${label}”吗？更新后会写入状态历史。`,
      confirmText: '确认更新',
      success: async res => {
        if (this._unloaded) return;
        if (!res.confirm || token !== wx.getStorageSync('token')) {
          this.setData({ changingStatus: false });
          if (ownerScope !== currentOwnerScope()) this.clearStaleAccount();
          return;
        }
        this._detailRequestId = (this._detailRequestId || 0) + 1;
        try {
          const response = await v4Api.updateApplicationStatus(this.data.id, { status, note: '申请详情页更新', expectedState });
          if (this._unloaded || token !== wx.getStorageSync('token')) return;
          if (!response || response.code !== 0 || !response.data || !response.data.status) throw new Error(response && response.message || '状态更新失败');
          this.setData({ application: { ...this.data.application, ...response.data }, allowedTransitions: [] });
          wx.showToast({ title: '状态已更新', icon: 'success' });
        } catch (err) {
          if (this._unloaded || token !== wx.getStorageSync('token')) return;
          wx.showToast({ title: err.statusCode === 409 ? '状态已变化，正在刷新' : (err.message || '状态更新失败'), icon: 'none' });
        } finally {
          if (!this._unloaded) {
            this.setData({ changingStatus: false });
            if (ownerScope !== currentOwnerScope()) this.clearStaleAccount();
          }
        }
        if (!this._unloaded && token === wx.getStorageSync('token')) return this.loadDetail();
      },
      fail: () => { if (!this._unloaded) this.setData({ changingStatus: false }); }
    });
  },

  onTaskInput(e) {
    this.setData({ [`taskForm.${e.currentTarget.dataset.field}`]: e.detail.value });
  },

  onTaskDate(e) {
    this.setData({ 'taskForm.dueAt': e.detail.value });
  },

  selectPriority(e) {
    this.setData({ 'taskForm.priority': e.currentTarget.dataset.value });
  },

  async addTask() {
    const form = this.data.taskForm;
    if (!String(form.title || '').trim()) {
      wx.showToast({ title: '请输入任务内容', icon: 'none' });
      return;
    }
    if (this.data.addingTask) return;
    const token = String(wx.getStorageSync('token') || '');
    const ownerScope = currentOwnerScope();
    const requestId = this._mutationRequestId = (this._mutationRequestId || 0) + 1;
    const isCurrent = () => !this._unloaded && requestId === this._mutationRequestId
      && token === String(wx.getStorageSync('token') || '');
    this.setData({ addingTask: true });
    try {
      const response = await v4Api.addApplicationTask(this.data.id, Object.assign({}, form));
      if (!isCurrent()) return;
      if (!response || response.code !== 0) throw new Error(response && response.message || '添加失败');
      this.setData({ taskForm: { title: '', dueAt: '', priority: 'medium' } });
      wx.showToast({ title: '任务已添加', icon: 'success' });
      await this.loadDetail();
    } catch (err) {
      if (isCurrent()) wx.showToast({ title: (err && err.message) || '添加失败', icon: 'none' });
    } finally {
      if (!this._unloaded) {
        this.setData({ addingTask: false });
        if (ownerScope !== currentOwnerScope()) this.clearStaleAccount();
      }
    }
  },

  async toggleTask(e) {
    const taskId = e.currentTarget.dataset.id;
    const completed = e.currentTarget.dataset.completed;
    if (!taskId || this.data.updatingTaskId) return;
    const token = String(wx.getStorageSync('token') || '');
    const ownerScope = currentOwnerScope();
    const requestId = this._mutationRequestId = (this._mutationRequestId || 0) + 1;
    const isCurrent = () => !this._unloaded && requestId === this._mutationRequestId
      && token === String(wx.getStorageSync('token') || '');
    this.setData({ updatingTaskId: String(taskId) });
    try {
      const response = await v4Api.updateApplicationTask(this.data.id, taskId, { completed: !completed });
      if (!isCurrent()) return;
      if (!response || response.code !== 0) throw new Error(response && response.message || '更新失败');
      await this.loadDetail();
    } catch (err) {
      if (isCurrent()) wx.showToast({ title: (err && err.message) || '更新失败', icon: 'none' });
    } finally {
      if (!this._unloaded) {
        this.setData({ updatingTaskId: '' });
        if (ownerScope !== currentOwnerScope()) this.clearStaleAccount();
      }
    }
  },

  onContactInput(e) {
    this.setData({ [`contactForm.${e.currentTarget.dataset.field}`]: e.detail.value });
  },

  async addContact() {
    const form = this.data.contactForm;
    if (!String(form.name || '').trim()) {
      wx.showToast({ title: '请输入联系人姓名', icon: 'none' });
      return;
    }
    if (this.data.addingContact) return;
    const token = String(wx.getStorageSync('token') || '');
    const ownerScope = currentOwnerScope();
    const requestId = this._mutationRequestId = (this._mutationRequestId || 0) + 1;
    const isCurrent = () => !this._unloaded && requestId === this._mutationRequestId
      && token === String(wx.getStorageSync('token') || '');
    this.setData({ addingContact: true });
    try {
      const response = await v4Api.addApplicationContact(this.data.id, Object.assign({}, form));
      if (!isCurrent()) return;
      if (!response || response.code !== 0) throw new Error(response && response.message || '添加失败');
      this.setData({ contactForm: { name: '', role: '', email: '', linkedin: '', notes: '' } });
      wx.showToast({ title: '联系人已添加', icon: 'success' });
      await this.loadDetail();
    } catch (err) {
      if (isCurrent()) wx.showToast({ title: (err && err.message) || '添加失败', icon: 'none' });
    } finally {
      if (!this._unloaded) {
        this.setData({ addingContact: false });
        if (ownerScope !== currentOwnerScope()) this.clearStaleAccount();
      }
    }
  },

  openInterviewSpace() {
    const token = String(wx.getStorageSync('token') || '');
    const ownerScope = currentOwnerScope();
    const requestId = this._navigationRequestId = (this._navigationRequestId || 0) + 1;
    v4Api.getInterviewSpaces().then(res => {
      if (this._unloaded || requestId !== this._navigationRequestId) return;
      if (ownerScope !== currentOwnerScope()) return this.clearStaleAccount();
      if (token !== String(wx.getStorageSync('token') || '')) return;
      const space = (res.data || []).find(item => String(item.applicationId) === String(this.data.id));
      if (!space) return v4Api.ensureInterviewSpace(this.data.id).then(created => {
        if (this._unloaded || requestId !== this._navigationRequestId || ownerScope !== currentOwnerScope()) return;
        wx.navigateTo({ url: '/package-ai/pages/interview-space/interview-space?id=' + encodeURIComponent(created.data.id) + '&applicationId=' + encodeURIComponent(this.data.id) });
      });
      const query = [];
      if (space) query.push('id=' + encodeURIComponent(space.id));
      query.push('applicationId=' + encodeURIComponent(this.data.id));
      wx.navigateTo({ url: '/package-ai/pages/interview-space/interview-space?' + query.join('&') });
    }).catch(err => {
      if (!this._unloaded && ownerScope !== currentOwnerScope()) return this.clearStaleAccount();
      if (!this._unloaded && requestId === this._navigationRequestId && token === String(wx.getStorageSync('token') || '')) {
        wx.showToast({ title: (err && err.message) || '面试空间加载失败', icon: 'none' });
      }
    });
  },

  handlePrimaryAction() {
    const action = this.data.primaryAction;
    if (!action) return;
    if (action.action === 'status') return this.changeStatus({ currentTarget: { dataset: { status: action.status, label: action.statusLabel } } });
    wx.pageScrollTo({ selector: action.action === 'tasks' ? '#application-tasks' : '#follow-up', duration: 280 });
  },

  openApplicationMaterials() {
    if (!this.data.id) return;
    wx.navigateTo({
      url: '/package-ai/pages/application-materials/application-materials?applicationId=' + encodeURIComponent(this.data.id)
    });
  },

  openResumeCenter() {
    const app = this.data.application || {};
    const snapshot = app.jobSnapshot || {};
    ownerStorage.set('pendingResumeOptimization', '', {
      applicationId: this.data.id,
      jobId: app.jobId || snapshot.id || '',
      company: app.company || snapshot.company || '',
      jobTitle: app.jobTitle || snapshot.title || snapshot.jobTitle || '',
      jdText: snapshot.description || snapshot.jd || snapshot.requirements || ''
    });
    wx.navigateTo({ url: '/package-career/pages/resume-center/resume-center?targeted=1' });
  },

  openJdMatch() {
    const app = this.data.application;
    if (!app) return;
    const snapshot = app.jobSnapshot || {};
    try {
      wx.setStorageSync('tempJobDetail', {
        title: app.jobTitle || snapshot.title || '',
        company: app.company || snapshot.company || '',
        applyLink: app.officialApplyUrl || snapshot.applyUrl || snapshot.sourceUrl || '',
        jobLink: app.officialApplyUrl || snapshot.applyUrl || snapshot.sourceUrl || '',
        description: snapshot.description || snapshot.jd || snapshot.requirements || ''
      });
    } catch (error) {}
    wx.navigateTo({ url: '/package-ai/pages/jd-match/jd-match?applicationId=' + encodeURIComponent(this.data.id) });
  },

  viewJob() {
    const app = this.data.application;
    if (!app || !app.jobId) return;
    wx.navigateTo({ url: `/package-user/pages/job-detail/job-detail?id=${encodeURIComponent(app.jobId)}` });
  },
});
