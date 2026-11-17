const v4Api = require('../../../utils/api-v4.js');
const progress = require('../../../utils/job-progress.js');
const ownerStorage = require('../../../utils/owner-storage.js');
const authSession = require('../../../utils/auth-session.js');
const reminders = require('../../../utils/reminders.js');

function currentOwnerScope() {
  return progress.currentOwnerScope ? String(progress.currentOwnerScope() || '') : '';
}

function submissionTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function submissionUnavailableText(reason) {
  if (reason === 'archived') return '申请已归档，当前不可操作。';
  if (reason === 'migration_pending') return '服务端确认功能尚未启用。';
  return '当前不可操作。';
}

const MATERIAL_STATES = [
  { value: 'needed', label: '待准备' },
  { value: 'ready', label: '已准备' },
  { value: 'not_applicable', label: '不适用' }
];

function checklistUnavailableText(reason) {
  if (reason === 'archived') return '申请已归档，清单仅可查看。';
  if (reason === 'migration_pending') return '材料清单功能尚未在服务端启用。';
  return '材料清单暂不可编辑。';
}

function resumeChoices(options, selectedId) {
  const choices = [{ versionId: null, displayName: '未绑定简历版本' }]
    .concat((options || []).map(item => ({ versionId: item.versionId, displayName: `${item.resumeName} · V${item.versionNo}` })));
  if (selectedId && !choices.some(item => String(item.versionId) === String(selectedId))) {
    choices.push({ versionId: selectedId, displayName: '原绑定版本已不可用' });
  }
  return choices;
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
  if (next) return { label: next.value === 'applied' ? '记录进度为已投递' : `推进到${next.label}`, action: 'status', status: next.value, statusLabel: next.label };
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
    historyHasMore: false,
    historyNextCursor: null,
    historyLoadingMore: false,
    contacts: [],
    tasks: [],
    interviewReports: [],
    interviewReportsAvailable: true,
    convertingReportId: '',
    reminderReceipts: [],
    reminderSubscriptions: [],
    reminderBusyKey: '',
    materials: [],
    resumeChoices: [{ versionId: null, displayName: '未绑定简历版本' }],
    resumeChoiceIndex: 0,
    resumeSelectionDirty: false,
    resumeCanEdit: false,
    savingResumeSelection: false,
    resumeSelectionError: '',
    materialChecklist: { available: false, unavailableReason: 'migration_pending', items: [] },
    checklistItems: [],
    materialStates: MATERIAL_STATES,
    checklistCanEdit: false,
    checklistUnavailableText: '材料清单功能尚未在服务端启用。',
    checklistLabel: '',
    checklistEditId: null,
    checklistEditLabel: '',
    checklistBusy: false,
    checklistError: '',
    match: null,
    allowedTransitions: [],
    primaryAction: null,
    submissionIntent: '',
    submissionAcknowledged: false,
    submittingSubmission: false,
    submissionError: '',
    submissionConfirmedAt: '',
    submissionReady: false,
    submissionUnavailableText: '当前不可操作。',
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
    this._ownerRevision = authSession.revision();
    this._submissionPending = null;
    this._submissionRequestId = 0;
    this._materialAddKey = null;
    this._readinessRequestId = 0;
    this._unloaded = false;
    this.setData({ id: options.id });
    this.loadDetail();
  },

  onShow() {
    const token = String(wx.getStorageSync('token') || '');
    const ownerScope = currentOwnerScope();
    const ownerRevision = authSession.revision();
    this._unloaded = false;
    if (this._ownerScope !== ownerScope || this._ownerRevision !== ownerRevision) {
      this._ownerScope = ownerScope;
      this._ownerRevision = ownerRevision;
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

  async loadReminderReceipts() {
    const applicationId = String(this.data.id || '');
    const token = String(wx.getStorageSync('token') || '');
    const ownerRevision = authSession.revision();
    const requestId = this._receiptRequestId = (this._receiptRequestId || 0) + 1;
    const isCurrent = () => !this._unloaded && requestId === this._receiptRequestId
      && applicationId === String(this.data.id || '') && token === String(wx.getStorageSync('token') || '')
      && ownerRevision === authSession.revision();
    const [rows, subscriptions] = await Promise.all([
      reminders.fetchReminderReceipts(applicationId), reminders.fetchSubscriptions()
    ]);
    if (isCurrent()) this.setData({ reminderReceipts: rows || [], reminderSubscriptions: subscriptions || [] });
  },

  async setApplicationReminder(e) {
    const sourceType = String(e.currentTarget.dataset.source || 'application');
    const targetId = String(e.currentTarget.dataset.id || this.data.id || '');
    const date = String(e.currentTarget.dataset.date || '');
    const title = String(e.currentTarget.dataset.title || '申请截止提醒');
    const channel = String(e.currentTarget.dataset.channel || 'in_app');
    if (!targetId || !date) return wx.showToast({ title: '请先设置有效日期', icon: 'none' });
    const key = `${sourceType}:${targetId}:${channel}`;
    if (this.data.reminderBusyKey) return;
    this.setData({ reminderBusyKey: key });
    try {
      const result = await reminders.upsertReminder({
        sourceType, targetId,
        reminderType: sourceType === 'application_task' ? 'task_due' : 'deadline',
        reminderDate: date, title,
        company: this.data.application.company || '',
        jobTitle: this.data.application.jobTitle || '',
        leadDays: [1, 0]
      }, channel === 'wechat' ? { withSubscribe: true } : { deliveryChannel: 'in_app' });
      if (result && result.authorizationDenied) {
        wx.showToast({ title: '未获微信授权，可选择站内提醒', icon: 'none' });
      } else {
        wx.showToast({ title: channel === 'wechat' ? '已授权并设置提醒' : '站内提醒已设置', icon: 'success' });
        await this.loadReminderReceipts();
      }
    } catch (error) {
      wx.showToast({ title: error && error.message || '提醒设置失败', icon: 'none' });
    } finally {
      this.setData({ reminderBusyKey: '' });
    }
  },

  async revokeReminderSubscription(e) {
    const templateId = String(e.currentTarget.dataset.template || '');
    if (!templateId || this.data.reminderBusyKey) return;
    this.setData({ reminderBusyKey: `revoke:${templateId}` });
    const result = await reminders.revokeSubscription(templateId);
    if (result) {
      wx.showToast({ title: '微信提醒授权已撤销', icon: 'success' });
      await this.loadReminderReceipts();
    } else {
      wx.showToast({ title: '撤销失败，请重试', icon: 'none' });
    }
    this.setData({ reminderBusyKey: '' });
  },

  loadMoreHistory() {
    if (!this.data.historyHasMore || !this.data.historyNextCursor || this.data.historyLoadingMore || !this.data.id) return;
    const requestId = this._historyRequestId = (this._historyRequestId || 0) + 1;
    const applicationId = String(this.data.id);
    const token = wx.getStorageSync('token');
    const ownerRevision = authSession.revision();
    const isCurrent = () => !this._unloaded && requestId === this._historyRequestId
      && String(this.data.id) === applicationId && token === wx.getStorageSync('token')
      && ownerRevision === authSession.revision();
    this.setData({ historyLoadingMore: true });
    v4Api.getApplicationHistory(applicationId, { beforeId: this.data.historyNextCursor, limit: 50 }).then(res => {
      if (!isCurrent()) return;
      const page = res && res.code === 0 ? res.data : null;
      if (!page || !Array.isArray(page.list)) throw new Error('状态历史暂不可用，请重试');
      const known = new Set(this.data.history.map(item => String(item.id)));
      const merged = this.data.history.concat(page.list.filter(item => !known.has(String(item.id))));
      this.setData({ history: merged, historyHasMore: !!page.hasMore, historyNextCursor: page.nextCursor || null });
    }).catch(error => {
      if (isCurrent()) wx.showToast({ title: error.message || '状态历史加载失败', icon: 'none' });
    }).finally(() => { if (isCurrent()) this.setData({ historyLoadingMore: false }); });
  },

  loadDetail() {
    if (!this.data.id || this.data.savingPlan || this.data.changingStatus) return Promise.resolve();
    const requestId = this._detailRequestId = (this._detailRequestId || 0) + 1;
    const token = wx.getStorageSync('token');
    const ownerScope = currentOwnerScope();
    const ownerRevision = authSession.revision();
    const isCurrent = () => !this._unloaded && requestId === this._detailRequestId && token === wx.getStorageSync('token') && ownerRevision === authSession.revision();
    this.setData({ loading: !this.data.application, loadError: '' });
    return v4Api.getApplicationWorkspace(this.data.id).then(res => {
      if (!isCurrent()) return;
      const data = res && res.code === 0 ? res.data : null;
      if (!data || !data.application) throw new Error('申请记录不存在');
      const app = data.application;
      const boundVersion = app.resumeVersionId || null;
      const choices = resumeChoices(data.resumeOptions, boundVersion);
      const selectedIndex = Math.max(0, choices.findIndex(item => String(item.versionId || '') === String(boundVersion || '')));
      const checklist = data.materialChecklist || { available: false, unavailableReason: 'migration_pending', items: [] };
      const checklistItems = (checklist.items || []).map(item => ({
        ...item,
        stateIndex: Math.max(0, MATERIAL_STATES.findIndex(state => state.value === item.state)),
        stateLabel: (MATERIAL_STATES.find(state => state.value === item.state) || MATERIAL_STATES[0]).label
      }));
      const previous = this.data.application;
      const submissionChanged = !!previous && (previous.status !== app.status || previous.historyId !== app.historyId ||
        (previous.submissionConfirmation && previous.submissionConfirmation.eventId) !== (app.submissionConfirmation && app.submissionConfirmation.eventId) ||
        (previous.submissionConfirmation && previous.submissionConfirmation.confirmed) !== (app.submissionConfirmation && app.submissionConfirmation.confirmed));
      if (submissionChanged) this._submissionPending = null;
      const primaryAction = primaryActionFor(app, data.tasks, data.allowedTransitions);
      this.setData({
        application: app,
        history: data.history || [],
        historyHasMore: !!data.historyHasMore,
        historyNextCursor: data.historyNextCursor || null,
        historyLoadingMore: false,
        contacts: data.contacts || [],
        tasks: data.tasks || [],
        materials: data.materials || [],
        resumeChoices: choices,
        resumeChoiceIndex: selectedIndex,
        resumeSelectionDirty: false,
        resumeCanEdit: !!app.resumeSelectionAvailable && !(app.submissionConfirmation && app.submissionConfirmation.confirmed),
        materialChecklist: checklist,
        checklistItems,
        checklistCanEdit: !!checklist.available,
        checklistUnavailableText: checklistUnavailableText(checklist.unavailableReason),
        match: data.match || null,
        allowedTransitions: data.allowedTransitions || [],
        primaryAction,
        submissionConfirmedAt: submissionTime(app.submissionConfirmation && app.submissionConfirmation.confirmedAt),
        submissionReady: Number.isSafeInteger(app.historyId) && !!app.submissionConfirmation && Number.isSafeInteger(app.submissionConfirmation.eventId),
        submissionUnavailableText: submissionUnavailableText(app.submissionConfirmation && app.submissionConfirmation.unavailableReason),
        submissionIntent: submissionChanged ? '' : this.data.submissionIntent,
        submissionAcknowledged: submissionChanged ? false : this.data.submissionAcknowledged,
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
      this.loadReminderReceipts();
      this.loadInterviewReports();
      return true;
    }).catch(err => {
      if (!isCurrent()) return;
      this.setData({ loading: false, loadError: (err && err.message) || '加载失败，请重试' });
      return false;
    }).finally(() => {
      if (this._unloaded || requestId !== this._detailRequestId) return;
      if (ownerScope !== currentOwnerScope() || ownerRevision !== authSession.revision()) this.clearStaleAccount();
      else if (token !== wx.getStorageSync('token')) this.setData({ loading: false });
    });
  },

  loadInterviewReports() {
    const applicationId = String(this.data.id || '');
    const token = String(wx.getStorageSync('token') || '');
    const revision = authSession.revision();
    const requestId = this._interviewReportsRequestId = (this._interviewReportsRequestId || 0) + 1;
    const isCurrent = () => !this._unloaded && requestId === this._interviewReportsRequestId
      && String(this.data.id) === applicationId && token === String(wx.getStorageSync('token') || '')
      && revision === authSession.revision();
    return v4Api.getApplicationInterviewReports(applicationId).then(res => {
      if (!isCurrent()) return;
      const reports = res && res.code === 0 && res.data && Array.isArray(res.data.reports) ? res.data.reports : [];
      this.setData({ interviewReports: reports, interviewReportsAvailable: true });
    }).catch(() => { if (isCurrent()) this.setData({ interviewReports: [], interviewReportsAvailable: false }); });
  },

  convertInterviewReportToTask(e) {
    const reportId = String(e.currentTarget.dataset.id || '');
    const title = String(e.currentTarget.dataset.title || '').trim();
    const report = (this.data.interviewReports || []).find(item => String(item.id) === reportId);
    const app = this.data.application;
    if (!report || report.converted || !app || !title || this.data.convertingReportId) return;
    wx.showModal({ title: '加入申请任务', content: `确认将“${title}”加入这条申请的任务清单吗？`, success: async choice => {
      if (!choice.confirm || this._unloaded || !authSession.isCurrent(this._ownerRevision)) return;
      this.setData({ convertingReportId: reportId });
      try {
        const response = await v4Api.convertApplicationInterviewReportToTask(this.data.id, reportId, {
          clientKey: `interview-task-${reportId}`,
          title,
          expectedState: { status: app.status, historyId: app.historyId }
        });
        if (!response || response.code !== 0) throw new Error(response && response.message || '创建任务失败');
        await this.loadDetail();
        wx.showToast({ title: '已加入申请任务', icon: 'success' });
      } catch (error) { wx.showToast({ title: error.message || '创建任务失败', icon: 'none' }); }
      finally { if (!this._unloaded) this.setData({ convertingReportId: '' }); }
    } });
  },

  clearStaleAccount() {
    this._ownerRevision = authSession.revision();
    this._planEdits = {};
    this._detailRequestId = (this._detailRequestId || 0) + 1;
    this._mutationRequestId = (this._mutationRequestId || 0) + 1;
    this._navigationRequestId = (this._navigationRequestId || 0) + 1;
    this._submissionRequestId = (this._submissionRequestId || 0) + 1;
    this._submissionPending = null;
    this._readinessRequestId = (this._readinessRequestId || 0) + 1;
    this._materialAddKey = null;
    this._readinessInFlight = null;
    this.setData({
      application: null, history: [], tasks: [], contacts: [], materials: [], match: null,
      resumeChoices: [{ versionId: null, displayName: '未绑定简历版本' }], resumeChoiceIndex: 0, resumeSelectionDirty: false, resumeCanEdit: false,
      savingResumeSelection: false, resumeSelectionError: '',
      materialChecklist: { available: false, unavailableReason: 'migration_pending', items: [] }, checklistItems: [],
      checklistCanEdit: false, checklistUnavailableText: '材料清单功能尚未在服务端启用。',
      checklistLabel: '', checklistEditId: null, checklistEditLabel: '', checklistBusy: false, checklistError: '',
      primaryAction: null, allowedTransitions: [], loading: false, planDirty: false,
      submissionIntent: '', submissionAcknowledged: false, submittingSubmission: false, submissionError: '', submissionConfirmedAt: '', submissionReady: false, submissionUnavailableText: '当前不可操作。',
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
    this._submissionRequestId = (this._submissionRequestId || 0) + 1;
    this._readinessRequestId = (this._readinessRequestId || 0) + 1;
  },

  onResumeChoiceChange(e) {
    const index = Number(e.detail.value) || 0;
    const choice = this.data.resumeChoices[index];
    this.setData({ resumeChoiceIndex: index, resumeSelectionDirty: !!choice && String(choice.versionId || '') !== String(this.data.application && this.data.application.resumeVersionId || ''), resumeSelectionError: '' });
  },

  async runReadinessMutation(kind, request, verify, success, afterSuccess) {
    if (this._readinessInFlight) return;
    const token = String(wx.getStorageSync('token') || '');
    const ownerScope = currentOwnerScope();
    const ownerRevision = authSession.revision();
    if (!token) return;
    const requestId = this._readinessRequestId = (this._readinessRequestId || 0) + 1;
    const isCurrent = () => !this._unloaded && requestId === this._readinessRequestId &&
      token === String(wx.getStorageSync('token') || '') && ownerScope === currentOwnerScope() && ownerRevision === authSession.revision();
    const busyField = kind === 'resume' ? 'savingResumeSelection' : 'checklistBusy';
    const errorField = kind === 'resume' ? 'resumeSelectionError' : 'checklistError';
    this._readinessInFlight = requestId;
    this.setData({ [busyField]: true, [errorField]: '' });
    try {
      const response = await request();
      if (!isCurrent()) return;
      if (!response || response.code !== 0 || !verify(response.data)) throw new Error('操作结果未确认，请刷新后核对。');
      if (afterSuccess) afterSuccess();
      const refreshed = await this.loadDetail();
      if (!refreshed && isCurrent()) {
        this.setData({ [errorField]: '操作已写入，但刷新失败；请重新加载核对最新内容。' });
        return;
      }
      if (isCurrent()) wx.showToast({ title: success, icon: 'success' });
    } catch (error) {
      if (!isCurrent()) return;
      if (error.statusCode === 409 || error.statusCode === 404) {
        this._materialAddKey = null;
        await this.loadDetail();
        if (isCurrent()) this.setData({ [errorField]: '申请已在其他页面或设备变化，请核对最新内容后重试。' });
      } else {
        this.setData({ [errorField]: error.message || '操作结果尚未确认，请检查网络后重试。' });
      }
    } finally {
      if (this._readinessInFlight === requestId) this._readinessInFlight = null;
      if (isCurrent()) this.setData({ [busyField]: false });
    }
  },

  saveResumeSelection() {
    const app = this.data.application;
    const choice = this.data.resumeChoices[this.data.resumeChoiceIndex];
    if (!app || !this.data.resumeCanEdit || !choice || this.data.savingResumeSelection) return;
    if (!Number.isSafeInteger(app.resumeSelectionVersion)) {
      this.setData({ resumeSelectionError: '申请版本暂不可用，请刷新后重试。' });
      return;
    }
    const selectedId = choice.versionId || null;
    if (String(selectedId || '') === String(app.resumeVersionId || '')) return;
    return this.runReadinessMutation('resume', () => v4Api.saveApplicationResumeSelection(this.data.id, {
      resumeVersionId: selectedId, expectedResumeSelectionVersion: app.resumeSelectionVersion
    }), result => result && Number.isSafeInteger(result.resumeSelectionVersion) &&
      String(result.resumeVersionId || '') === String(selectedId || ''),
    '简历版本已保存', null);
  },

  onChecklistLabelInput(e) {
    this._materialAddKey = null;
    this.setData({ checklistLabel: e.detail.value, checklistError: '' });
  },

  addChecklistItem() {
    const label = String(this.data.checklistLabel || '').trim();
    if (!this.data.checklistCanEdit || this.data.checklistBusy) return;
    if (!label || label.length > 120) {
      this.setData({ checklistError: '请填写 1～120 字的材料名称。' });
      return;
    }
    if (this.data.checklistItems.length >= 30) {
      this.setData({ checklistError: '每条申请最多 30 项材料。' });
      return;
    }
    const clientKey = this._materialAddKey && this._materialAddKey.label === label
      ? this._materialAddKey.value : `mini_material_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
    this._materialAddKey = { label, value: clientKey };
    return this.runReadinessMutation('checklist', () => v4Api.addApplicationChecklistItem(this.data.id, { label, clientKey }),
      result => result && result.item && result.item.label === label,
      '已加入材料清单', () => { this._materialAddKey = null; this.setData({ checklistLabel: '' }); });
  },

  startChecklistEdit(e) {
    const item = this.data.checklistItems.find(row => row.id === Number(e.currentTarget.dataset.id));
    if (!item || !this.data.checklistCanEdit) return;
    this.setData({ checklistEditId: item.id, checklistEditLabel: item.label, checklistError: '' });
  },

  onChecklistEditInput(e) { this.setData({ checklistEditLabel: e.detail.value }); },
  cancelChecklistEdit() { if (!this.data.checklistBusy) this.setData({ checklistEditId: null, checklistEditLabel: '' }); },

  saveChecklistEdit() {
    const item = this.data.checklistItems.find(row => row.id === this.data.checklistEditId);
    const label = String(this.data.checklistEditLabel || '').trim();
    if (!item || !this.data.checklistCanEdit || this.data.checklistBusy) return;
    if (!label || label.length > 120) { this.setData({ checklistError: '请填写 1～120 字的材料名称。' }); return; }
    return this.runReadinessMutation('checklist', () => v4Api.updateApplicationChecklistItem(this.data.id, item.id, { label, expectedVersion: item.version }),
      result => result && result.item && result.item.label === label,
      '材料名称已保存', () => this.setData({ checklistEditId: null, checklistEditLabel: '' }));
  },

  onChecklistStateChange(e) {
    const item = this.data.checklistItems.find(row => row.id === Number(e.currentTarget.dataset.id));
    const next = MATERIAL_STATES[Number(e.detail.value)];
    if (!item || !next || !this.data.checklistCanEdit || this.data.checklistBusy || item.state === next.value) return;
    return this.runReadinessMutation('checklist', () => v4Api.updateApplicationChecklistItem(this.data.id, item.id, { state: next.value, expectedVersion: item.version }),
      result => result && result.item && result.item.state === next.value,
      '准备状态已更新', null);
  },

  deleteChecklistItem(e) {
    const item = this.data.checklistItems.find(row => row.id === Number(e.currentTarget.dataset.id));
    if (!item || !this.data.checklistCanEdit || this.data.checklistBusy) return;
    const token = String(wx.getStorageSync('token') || '');
    const revision = authSession.revision();
    wx.showModal({
      title: '删除材料清单项',
      content: `确认从这条申请移除“${item.label}”吗？`,
      confirmText: '确认删除',
      success: result => {
        if (!result.confirm || this._unloaded || token !== String(wx.getStorageSync('token') || '') || revision !== authSession.revision()) return;
        this.runReadinessMutation('checklist', () => v4Api.deleteApplicationChecklistItem(this.data.id, item.id, { expectedVersion: item.version }),
          data => data && data.id === item.id && data.deleted === true,
          '已删除清单项', null);
      }
    });
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
      content: status === 'applied'
        ? `确认将申请状态更新为“${label}”吗？此操作只记录进度，不代表你已完成企业官网最终提交；最终提交请在下方单独确认。`
        : `确认将申请状态更新为“${label}”吗？更新后会写入状态历史。`,
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
          wx.showToast({ title: (err.statusCode === 409 || err.statusCode === 428) ? '状态已变化，正在刷新' : (err.message || '状态更新失败'), icon: 'none' });
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

  chooseSubmissionIntent(e) {
    const intent = e.currentTarget.dataset.action;
    const app = this.data.application;
    const confirmation = app && app.submissionConfirmation;
    if (!confirmation || !confirmation.available || this.data.submittingSubmission) return;
    if (intent === 'confirm' && (confirmation.confirmed || !['preparing', 'applied'].includes(app.status))) return;
    if (intent === 'revoke' && !confirmation.confirmed) return;
    if (intent !== 'confirm' && intent !== 'revoke') return;
    if (this._submissionPending && this._submissionPending.action !== intent) this._submissionPending = null;
    this.setData({ submissionIntent: intent, submissionAcknowledged: false, submissionError: '' });
  },

  setSubmissionAcknowledged(e) {
    this.setData({ submissionAcknowledged: Array.isArray(e.detail.value) && e.detail.value.includes('yes') });
  },

  cancelSubmissionIntent() {
    if (this.data.submittingSubmission) return;
    this.setData({ submissionIntent: '', submissionAcknowledged: false, submissionError: '' });
  },

  async submitSubmissionIntent() {
    const app = this.data.application;
    const confirmation = app && app.submissionConfirmation;
    const intent = this.data.submissionIntent;
    if (!app || !confirmation || !confirmation.available || !this.data.submissionAcknowledged || this.data.submittingSubmission || this._submissionInFlight) return;
    if (intent === 'confirm' && (confirmation.confirmed || !['preparing', 'applied'].includes(app.status))) return;
    if (intent === 'revoke' && !confirmation.confirmed) return;
    if (intent !== 'confirm' && intent !== 'revoke') return;
    if (!Number.isSafeInteger(app.historyId) || !Number.isSafeInteger(confirmation.eventId)) {
      this.setData({ submissionError: '申请版本暂不可用，请刷新详情后重试。' });
      return;
    }
    const token = String(wx.getStorageSync('token') || '');
    const ownerScope = currentOwnerScope();
    const ownerRevision = authSession.revision();
    if (!token) return;
    const requestId = this._submissionRequestId = (this._submissionRequestId || 0) + 1;
    const isCurrent = () => !this._unloaded && requestId === this._submissionRequestId && token === String(wx.getStorageSync('token') || '') && ownerScope === currentOwnerScope() && ownerRevision === authSession.revision();
    const clientKey = this._submissionPending && this._submissionPending.action === intent
      ? this._submissionPending.clientKey
      : `miniprogram_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
    this._submissionPending = { action: intent, clientKey };
    const payload = {
      expectedState: { status: app.status, historyId: app.historyId },
      expectedSubmissionEventId: confirmation.eventId,
      clientKey,
      channel: 'miniprogram'
    };
    this._submissionInFlight = true;
    this.setData({ submittingSubmission: true, submissionError: '' });
    try {
      const response = intent === 'confirm'
        ? await v4Api.confirmApplicationSubmission(this.data.id, payload)
        : await v4Api.revokeApplicationSubmission(this.data.id, payload);
      if (!isCurrent()) return;
      if (!response || response.code !== 0 || !response.data || !response.data.submissionConfirmation) throw new Error('操作结果未确认，请重试。');
      if (response.data.submissionConfirmation.confirmed !== (intent === 'confirm')) {
        this._submissionPending = null;
        this.setData({ submissionIntent: '', submissionAcknowledged: false, submittingSubmission: false, submissionError: '确认记录已在其他端变化，请核对最新状态。' });
        await this.loadDetail();
        return;
      }
      this._submissionPending = null;
      this.setData({ submissionIntent: '', submissionAcknowledged: false, submittingSubmission: false });
      await this.loadDetail();
      if (isCurrent()) wx.showToast({ title: intent === 'confirm' ? '已记录最终提交' : '已撤回误确认', icon: 'success' });
    } catch (error) {
      if (!isCurrent()) return;
      if (error.statusCode === 409) {
        this._submissionPending = null;
        this.setData({ submittingSubmission: false, submissionIntent: '', submissionAcknowledged: false, submissionError: '申请记录已变化，请核对最新状态后重试。' });
        await this.loadDetail();
      } else {
        this.setData({ submissionError: (error && error.message) || '操作未确认，请检查网络后重试。' });
      }
    } finally {
      this._submissionInFlight = false;
      if (isCurrent()) this.setData({ submittingSubmission: false });
      else if (ownerScope !== currentOwnerScope() || ownerRevision !== authSession.revision()) this.clearStaleAccount();
    }
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

  openContextAi() {
    const application = this.data.application || {};
    const snapshot = application.jobSnapshot || {};
    const params = {
      source: 'applications',
      applicationId: this.data.id,
      company: application.company || snapshot.company || '',
      role: application.jobTitle || snapshot.title || snapshot.jobTitle || ''
    };
    const query = Object.keys(params)
      .filter(key => params[key] !== '')
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
      .join('&');
    wx.navigateTo({ url: '/package-ai/pages/ai-assistant/ai-assistant?' + query });
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
