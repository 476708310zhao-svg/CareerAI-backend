const api = require('../../../utils/api-v4.js');
const loginGate = require('../../../behaviors/login-gate.js');

function emptyContactForm() {
  return {
    name: '', company: '', role: '', channel: 'linkedin', contactValue: '', relationshipContext: '',
    contextVerified: false, nextFollowUpAt: '', notes: '', applicationId: '', resumeId: ''
  };
}

Page({
  behaviors: [loginGate],

  data: {
    loading: true,
    loginRequired: false,
    error: '',
    safetyNotice: '',
    contacts: [],
    dueFollowUps: [],
    drafts: [],
    funnelStages: [],
    stages: [],
    draftTypes: [],
    applications: [],
    resumes: [],
    showContactForm: false,
    editingContactId: null,
    contactForm: emptyContactForm(),
    applicationIndex: -1,
    resumeIndex: -1,
    selectedContactIndex: -1,
    selectedDraftTypeIndex: 0,
    draftLanguage: 'zh',
    draftTone: 'formal',
    requestDetail: '',
    activeDraft: null,
    draftSubject: '',
    draftContent: '',
    followUpDate: '',
    operating: false,
    channelLabels: ['LinkedIn', '邮件', '校友', '活动', '其他'],
    referralOptions: [
      { value: 'requested', label: '已提出请求' },
      { value: 'pending', label: '等待结果' },
      { value: 'referred', label: '已获得 Referral' },
      { value: 'declined', label: '未获得 Referral' }
    ]
  },

  onLoad(options) {
    this._requestedContactId = Number(options && options.contactId) || null;
  },

  onShow() {
    this.loadDashboard();
  },

  onPullDownRefresh() {
    this.loadDashboard(true).finally(() => wx.stopPullDownRefresh());
  },

  hasToken() {
    try { return !!wx.getStorageSync('token'); } catch (error) { return false; }
  },

  loadDashboard(force) {
    if (this._loadingPromise && !force) return this._loadingPromise;
    if (!this.hasToken()) {
      this.setData({ loading: false, loginRequired: true, error: '' });
      return Promise.resolve();
    }
    this.setData({ loading: true, loginRequired: false, error: '' });
    const request = api.getNetworkingDashboard().then(response => {
      const data = response.data || {};
      const contacts = (data.contacts || []).map(item => ({
        ...item,
        meta: [item.company, item.role].filter(Boolean).join(' · ') || '待补充公司与岗位',
        followUpText: item.nextFollowUpAt ? `下次跟进 ${item.nextFollowUpAt}` : '尚未设置跟进',
        linkText: item.applicationId ? `已关联申请 #${item.applicationId}` : '未关联正式申请',
        contextText: item.relationshipContext
          ? `联系背景：${item.relationshipContext}${item.contextVerified ? '（已确认）' : '（未确认，不用于草稿）'}`
          : ''
      }));
      const applications = (data.options && data.options.applications || []).map(item => ({
        ...item, label: `${item.company || '目标公司'} · ${item.jobTitle || '目标岗位'}`
      }));
      const resumes = (data.options && data.options.resumes || []).map(item => ({
        ...item, label: item.name || `简历 #${item.id}`
      }));
      let selectedContactIndex = this.data.selectedContactIndex;
      if (this._requestedContactId) {
        const requestedIndex = contacts.findIndex(item => item.id === this._requestedContactId);
        if (requestedIndex >= 0) selectedContactIndex = requestedIndex;
        this._requestedContactId = null;
      }
      if (selectedContactIndex >= contacts.length) selectedContactIndex = contacts.length ? 0 : -1;
      this.setData({
        loading: false,
        contacts,
        dueFollowUps: data.dueFollowUps || [],
        drafts: data.drafts || [],
        funnelStages: data.funnel && data.funnel.stages || [],
        stages: data.stages || [],
        draftTypes: data.draftTypes || [],
        applications,
        resumes,
        safetyNotice: data.safetyNotice || '',
        selectedContactIndex
      });
    }).catch(problem => {
      this.setData({ loading: false, error: problem && problem.message || 'Networking 数据加载失败' });
    }).finally(() => {
      if (this._loadingPromise === request) this._loadingPromise = null;
    });
    this._loadingPromise = request;
    return request;
  },

  promptLogin() {
    this.ensureAuthenticated('登录后管理联系人、话术草稿和跟进提醒', () => this.loadDashboard(true));
  },

  retry() { this.loadDashboard(true); },

  showNewContact() {
    this.setData({
      showContactForm: true,
      editingContactId: null,
      contactForm: emptyContactForm(),
      applicationIndex: -1,
      resumeIndex: -1
    });
  },

  editContact(e) {
    const id = Number(e.currentTarget.dataset.id);
    const contact = this.data.contacts.find(item => item.id === id);
    if (!contact) return;
    this.setData({
      showContactForm: true,
      editingContactId: id,
      contactForm: {
        name: contact.name, company: contact.company, role: contact.role, channel: contact.channel, contactValue: contact.contactValue,
        relationshipContext: contact.relationshipContext, contextVerified: contact.contextVerified,
        nextFollowUpAt: contact.nextFollowUpAt, notes: contact.notes,
        applicationId: contact.applicationId || '', resumeId: contact.resumeId || ''
      },
      applicationIndex: this.data.applications.findIndex(item => item.id === contact.applicationId),
      resumeIndex: this.data.resumes.findIndex(item => item.id === contact.resumeId)
    });
  },

  cancelContactForm() {
    this.setData({ showContactForm: false, editingContactId: null });
  },

  onContactInput(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [`contactForm.${key}`]: e.detail.value });
  },

  onContextVerified(e) {
    this.setData({ 'contactForm.contextVerified': e.detail.value });
  },

  onChannelChange(e) {
    const channels = ['linkedin', 'email', 'alumni', 'event', 'other'];
    this.setData({ 'contactForm.channel': channels[Number(e.detail.value)] || 'linkedin' });
  },

  onApplicationChange(e) {
    const index = Number(e.detail.value);
    const item = this.data.applications[index];
    this.setData({
      applicationIndex: index,
      'contactForm.applicationId': item ? item.id : '',
      'contactForm.company': item && item.company || this.data.contactForm.company,
      'contactForm.role': item && item.jobTitle || this.data.contactForm.role,
      'contactForm.resumeId': item && item.resumeId || this.data.contactForm.resumeId,
      resumeIndex: item && item.resumeId ? this.data.resumes.findIndex(resume => resume.id === item.resumeId) : this.data.resumeIndex
    });
  },

  clearApplication() {
    this.setData({ applicationIndex: -1, 'contactForm.applicationId': '' });
  },

  onResumeChange(e) {
    const index = Number(e.detail.value);
    const item = this.data.resumes[index];
    this.setData({ resumeIndex: index, 'contactForm.resumeId': item ? item.id : '' });
  },

  onFollowUpChange(e) {
    this.setData({ 'contactForm.nextFollowUpAt': e.detail.value });
  },

  clearFollowUp() {
    this.setData({ 'contactForm.nextFollowUpAt': '' });
  },

  saveContact() {
    if (this.data.operating) return;
    const form = this.data.contactForm;
    if (!String(form.name || '').trim()) {
      wx.showToast({ title: '请填写联系人姓名', icon: 'none' });
      return;
    }
    this.setData({ operating: true });
    const action = this.data.editingContactId
      ? api.updateNetworkingContact(this.data.editingContactId, form)
      : api.createNetworkingContact(form);
    action.then(() => {
      wx.showToast({ title: this.data.editingContactId ? '联系人已更新' : '联系人已创建', icon: 'none' });
      this.setData({ showContactForm: false, editingContactId: null });
      return this.loadDashboard(true);
    }).catch(problem => wx.showToast({ title: problem.message || '保存失败', icon: 'none' }))
      .finally(() => this.setData({ operating: false }));
  },

  onStageChange(e) {
    const contactId = Number(e.currentTarget.dataset.id);
    const stage = this.data.stages[Number(e.detail.value)];
    if (!contactId || !stage || this.data.operating) return;
    this.setData({ operating: true });
    api.updateNetworkingStage(contactId, { stage: stage.value }).then(() => this.loadDashboard(true))
      .catch(problem => wx.showToast({ title: problem.message || '阶段更新失败', icon: 'none' }))
      .finally(() => this.setData({ operating: false }));
  },

  onReferralChange(e) {
    const contactId = Number(e.currentTarget.dataset.id);
    const option = this.data.referralOptions[Number(e.detail.value)];
    const contact = this.data.contacts.find(item => item.id === contactId);
    if (!contact || !option || this.data.operating) return;
    this.setData({ operating: true });
    api.recordNetworkingReferral(contactId, {
      outcome: option.value,
      applicationId: contact.applicationId || undefined,
      resumeId: contact.resumeId || undefined,
      resumeVersionId: contact.resumeVersionId || undefined,
      jobId: contact.jobId || undefined
    }).then(() => {
      wx.showToast({ title: 'Referral 结果已记录', icon: 'none' });
      return this.loadDashboard(true);
    }).catch(problem => wx.showToast({ title: problem.message || '记录失败', icon: 'none' }))
      .finally(() => this.setData({ operating: false }));
  },

  onContactPicker(e) {
    this.setData({ selectedContactIndex: Number(e.detail.value), activeDraft: null });
  },

  onDraftTypePicker(e) {
    this.setData({ selectedDraftTypeIndex: Number(e.detail.value), activeDraft: null });
  },

  setDraftLanguage(e) { this.setData({ draftLanguage: e.currentTarget.dataset.value }); },
  setDraftTone(e) { this.setData({ draftTone: e.currentTarget.dataset.value }); },
  onRequestInput(e) { this.setData({ requestDetail: e.detail.value }); },
  onDraftSubjectInput(e) { this.setData({ draftSubject: e.detail.value }); },
  onDraftContentInput(e) { this.setData({ draftContent: e.detail.value }); },
  onDraftFollowUpChange(e) { this.setData({ followUpDate: e.detail.value }); },

  generateDraft() {
    const contact = this.data.contacts[this.data.selectedContactIndex];
    const type = this.data.draftTypes[this.data.selectedDraftTypeIndex];
    if (!contact || !type || this.data.operating) {
      wx.showToast({ title: contact ? '请选择话术类型' : '请先创建并选择联系人', icon: 'none' });
      return;
    }
    this.setData({ operating: true });
    api.createNetworkingDraft(contact.id, {
      type: type.value,
      language: this.data.draftLanguage,
      tone: this.data.draftTone,
      requestDetail: this.data.requestDetail
    }).then(response => {
      const draft = response.data;
      this.setData({ activeDraft: draft, draftSubject: draft.subject || '', draftContent: draft.content || '' });
      return this.loadDashboard(true);
    }).catch(problem => wx.showModal({ title: '无法生成草稿', content: problem.message || '请稍后重试', showCancel: false }))
      .finally(() => this.setData({ operating: false }));
  },

  saveDraft() {
    if (!this.data.activeDraft || this.data.operating) return;
    this.setData({ operating: true });
    api.updateNetworkingDraft(this.data.activeDraft.id, {
      subject: this.data.draftSubject,
      content: this.data.draftContent
    }).then(response => {
      this.setData({ activeDraft: response.data });
      wx.showToast({ title: '草稿已保存', icon: 'none' });
      return this.loadDashboard(true);
    }).catch(problem => wx.showToast({ title: problem.message || '保存失败', icon: 'none' }))
      .finally(() => this.setData({ operating: false }));
  },

  copyDraft() {
    if (!this.data.activeDraft) return;
    const text = this.data.draftSubject
      ? `主题：${this.data.draftSubject}\n\n${this.data.draftContent}`
      : this.data.draftContent;
    wx.setClipboardData({
      data: text,
      success: () => {
        api.updateNetworkingDraft(this.data.activeDraft.id, {
          subject: this.data.draftSubject,
          content: this.data.draftContent,
          status: 'copied'
        }).catch(() => {});
      }
    });
  },

  markSent() {
    if (!this.data.activeDraft || this.data.operating) return;
    wx.showModal({
      title: '确认由你本人发送？',
      content: '系统不会执行外发。仅在你已经通过 LinkedIn、邮件等外部平台发送后记录。',
      success: result => {
        if (!result.confirm) return;
        this.setData({ operating: true });
        api.updateNetworkingDraft(this.data.activeDraft.id, {
          subject: this.data.draftSubject,
          content: this.data.draftContent
        }).then(() => api.markNetworkingDraftSent(this.data.activeDraft.id, {
          confirmExternalSend: true,
          nextFollowUpAt: this.data.followUpDate || undefined
        })).then(() => {
          wx.showToast({ title: '已记录外部发送', icon: 'none' });
          this.setData({ activeDraft: null, draftSubject: '', draftContent: '' });
          return this.loadDashboard(true);
        }).catch(problem => wx.showToast({ title: problem.message || '记录失败', icon: 'none' }))
          .finally(() => this.setData({ operating: false }));
      }
    });
  },

  openDraft(e) {
    const id = Number(e.currentTarget.dataset.id);
    const draft = this.data.drafts.find(item => item.id === id);
    const contactIndex = this.data.contacts.findIndex(item => item.id === (draft && draft.contactId));
    if (!draft || draft.status === 'user_sent') return;
    this.setData({
      activeDraft: draft,
      draftSubject: draft.subject || '',
      draftContent: draft.content || '',
      selectedContactIndex: contactIndex >= 0 ? contactIndex : this.data.selectedContactIndex
    });
  }
});
