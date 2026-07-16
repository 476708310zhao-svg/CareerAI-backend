const v4Api = require('../../../utils/api-v4.js');

Page({
  data: {
    id: '',
    loading: true,
    application: null,
    history: [],
    contacts: [],
    tasks: [],
    materials: [],
    match: null,
    allowedTransitions: [],
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
      this.setData({ loading: false });
      return;
    }
    this.setData({ id: options.id });
    this.loadDetail();
  },

  onPullDownRefresh() {
    this.loadDetail().finally(() => wx.stopPullDownRefresh());
  },

  loadDetail() {
    this.setData({ loading: true });
    return v4Api.getApplicationDetail(this.data.id).then(res => {
      const data = res && res.code === 0 ? res.data : null;
      if (!data || !data.application) throw new Error('申请记录不存在');
      const app = data.application;
      this.setData({
        application: app,
        history: data.history || [],
        contacts: data.contacts || [],
        tasks: data.tasks || [],
        materials: data.materials || [],
        match: data.match || null,
        allowedTransitions: data.allowedTransitions || [],
        planForm: {
          nextAction: app.nextAction || '',
          deadline: app.deadline || '',
          interviewTime: app.interviewTime || '',
          notes: app.notes || '',
        },
        loading: false,
      });
    }).catch(err => {
      this.setData({ loading: false });
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
    });
  },

  onPlanInput(e) {
    this.setData({ [`planForm.${e.currentTarget.dataset.field}`]: e.detail.value });
  },

  onPlanDate(e) {
    this.setData({ [`planForm.${e.currentTarget.dataset.field}`]: e.detail.value });
  },

  savePlan() {
    wx.showLoading({ title: '保存中...', mask: true });
    v4Api.updateApplication(this.data.id, this.data.planForm).then(res => {
      wx.hideLoading();
      if (res && res.code === 0) {
        this.setData({ application: { ...this.data.application, ...res.data } });
        wx.showToast({ title: '跟进计划已保存', icon: 'success' });
      }
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
    });
  },

  changeStatus(e) {
    const status = e.currentTarget.dataset.status;
    const label = e.currentTarget.dataset.label;
    if (!status) return;
    wx.showModal({
      title: '更新申请状态',
      content: `确认将申请状态更新为“${label}”吗？更新后会写入状态历史。`,
      confirmText: '确认更新',
      success: res => {
        if (!res.confirm) return;
        wx.showLoading({ title: '同步状态...', mask: true });
        v4Api.updateApplicationStatus(this.data.id, { status, note: '申请详情页更新' }).then(() => {
          wx.hideLoading();
          wx.showToast({ title: '状态已更新', icon: 'success' });
          this.loadDetail();
        }).catch(err => {
          wx.hideLoading();
          wx.showToast({ title: (err && err.message) || '状态更新失败', icon: 'none' });
        });
      }
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

  addTask() {
    const form = this.data.taskForm;
    if (!String(form.title || '').trim()) {
      wx.showToast({ title: '请输入任务内容', icon: 'none' });
      return;
    }
    v4Api.addApplicationTask(this.data.id, form).then(() => {
      this.setData({ taskForm: { title: '', dueAt: '', priority: 'medium' } });
      wx.showToast({ title: '任务已添加', icon: 'success' });
      this.loadDetail();
    }).catch(err => wx.showToast({ title: (err && err.message) || '添加失败', icon: 'none' }));
  },

  toggleTask(e) {
    const taskId = e.currentTarget.dataset.id;
    const completed = e.currentTarget.dataset.completed;
    v4Api.updateApplicationTask(this.data.id, taskId, { completed: !completed }).then(() => this.loadDetail())
      .catch(err => wx.showToast({ title: (err && err.message) || '更新失败', icon: 'none' }));
  },

  onContactInput(e) {
    this.setData({ [`contactForm.${e.currentTarget.dataset.field}`]: e.detail.value });
  },

  addContact() {
    const form = this.data.contactForm;
    if (!String(form.name || '').trim()) {
      wx.showToast({ title: '请输入联系人姓名', icon: 'none' });
      return;
    }
    v4Api.addApplicationContact(this.data.id, form).then(() => {
      this.setData({ contactForm: { name: '', role: '', email: '', linkedin: '', notes: '' } });
      wx.showToast({ title: '联系人已添加', icon: 'success' });
      this.loadDetail();
    }).catch(err => wx.showToast({ title: (err && err.message) || '添加失败', icon: 'none' }));
  },

  openInterviewSpace() {
    v4Api.getInterviewSpaces().then(res => {
      const space = (res.data || []).find(item => String(item.applicationId) === String(this.data.id));
      wx.navigateTo({ url: '/package-ai/pages/interview-space/interview-space' + (space ? '?id=' + space.id : '') });
    });
  },

  viewJob() {
    const app = this.data.application;
    if (!app || !app.jobId) return;
    wx.navigateTo({ url: `/package-user/pages/job-detail/job-detail?id=${encodeURIComponent(app.jobId)}` });
  },
});
