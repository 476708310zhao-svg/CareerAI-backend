const api = require('../../../utils/api-v4.js');
const auth = require('../../../utils/auth-session.js');

const TYPES = [
  { type: 'resume_optimization', title: '简历优化' },
  { type: 'manual_job_screening', title: '人工筛岗' },
  { type: 'application_assistance', title: '申请协助' }
];
function key() { return 'service_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10); }
function list(response) { return response && response.code === 0 && response.data; }

Page({
  data: { types: TYPES, typeIndex: 0, consent: null, requests: [], resumes: [], applications: [], resumeIndex: 0,
    applicationIndex: 0, scopes: [], screeningResume: false, screeningApplication: false, summary: '', durationDays: '30', accepted: false, busy: false,
    selected: null, error: '', notice: '', authRequired: false },
  onLoad() { this._generation = 0; this.refresh(); },
  onShow() { if (this._identity && !auth.isCurrent(this._identity, wx)) this.refresh(); },
  onUnload() { this._generation = (this._generation || 0) + 1; },
  refresh() {
    const identity = auth.capture(wx); this._identity = identity;
    const generation = this._generation = (this._generation || 0) + 1;
    if (!identity.token) { this.setData({ requests: [], selected: null, consent: null, resumes: [], applications: [], authRequired: true, error: '请先登录后查看工单。' }); return; }
    this.setData({ selected: null });
    Promise.all([api.getManualServiceConsent(), api.getManualServiceRequests(), api.getV4Resumes(), api.getCompleteApplicationBoard()]).then(results => {
      if (generation !== this._generation || !auth.isCurrent(identity, wx)) return;
      const [consent, requests, resumes, board] = results;
      if (!list(consent) || !list(requests)) { this.setData({ error: '工单暂时无法读取，请重试。' }); return; }
      const groups = board && board.code === 0 && board.data && board.data.groups || {};
      const applications = Object.keys(groups).reduce((all, group) => all.concat(groups[group] || []), []);
      this.setData({ consent: consent.data, requests: requests.data.list || [], resumes: resumes && resumes.code === 0 && Array.isArray(resumes.data) ? resumes.data : [],
        applications, authRequired: false, error: '' });
    }).catch(() => { if (generation === this._generation && auth.isCurrent(identity, wx)) this.setData({ error: '工单暂时无法读取，请重试。' }); });
  },
  chooseType(e) { this.setData({ typeIndex: Number(e.detail.value), scopes: [], accepted: false, notice: '' }); },
  chooseResume(e) { this.setData({ resumeIndex: Number(e.detail.value) }); },
  chooseApplication(e) { this.setData({ applicationIndex: Number(e.detail.value) }); },
  chooseScopes(e) { const scopes = e.detail.value || []; this.setData({ scopes, screeningResume: scopes.includes('resume_content'), screeningApplication: scopes.includes('application_details') }); },
  changeSummary(e) { this.setData({ summary: e.detail.value || '' }); },
  changeDays(e) { this.setData({ durationDays: e.detail.value || '' }); },
  changeAccepted(e) { this.setData({ accepted: (e.detail.value || []).includes('yes') }); },
  submit() {
    if (this.data.busy || !this.data.consent) return;
    const serviceType = TYPES[this.data.typeIndex].type;
    const resumeId = this.data.resumes[this.data.resumeIndex] && this.data.resumes[this.data.resumeIndex].id;
    const applicationId = this.data.applications[this.data.applicationIndex] && this.data.applications[this.data.applicationIndex].id;
    const scopes = serviceType === 'resume_optimization' ? ['resume_content'] : serviceType === 'application_assistance'
      ? ['resume_content', 'application_details'] : this.data.scopes;
    if (!this.data.accepted) { this.setData({ error: '请先阅读并勾选授权说明。' }); return; }
    const payload = { serviceType, consentVersion: this.data.consent.version, consentAccepted: true, durationDays: Number(this.data.durationDays),
      scopes, summary: this.data.summary, resumeId: scopes.includes('resume_content') ? resumeId : null,
      applicationId: scopes.includes('application_details') ? applicationId : null,
      clientRequestKey: this._pendingKey || key() };
    this._pendingKey = payload.clientRequestKey;
    const identity = auth.capture(wx); this.setData({ busy: true, error: '' });
    api.createManualServiceRequest(payload).then(result => {
      if (!auth.isCurrent(identity, wx)) { this.refresh(); return; }
      if (!list(result)) { this.setData({ error: result && result.message || '提交失败，可重试同一申请。' }); return; }
      this._pendingKey = null; this.setData({ notice: '工单已创建。当前未收费，服务安排以工单状态为准。', summary: '', accepted: false }); this.refresh();
    }).catch(() => { if (auth.isCurrent(identity, wx)) this.setData({ error: '网络异常，可重试同一申请。' }); })
      .finally(() => { if (auth.isCurrent(identity, wx)) this.setData({ busy: false }); });
  },
  revoke(e) {
    const item = this.data.requests.find(row => String(row.id) === String(e.currentTarget.dataset.id));
    if (!item || item.revoked || this.data.busy) return;
    wx.showModal({ title: '撤销授权', content: '撤销后服务人员将不能继续处理工单，已授权资料会清理。', success: result => {
      if (!result.confirm) return;
      const identity = auth.capture(wx); this.setData({ busy: true, error: '' });
      api.revokeManualServiceRequest(item.id, item.version).then(response => {
        if (!auth.isCurrent(identity, wx)) { this.refresh(); return; }
        if (!list(response)) { this.setData({ error: response && response.message || '撤销失败，请刷新后重试。' }); return; }
        this.setData({ notice: '授权已撤销。' }); this.refresh();
      }).catch(() => { if (auth.isCurrent(identity, wx)) this.setData({ error: '网络异常，请刷新后重试。' }); })
        .finally(() => { if (auth.isCurrent(identity, wx)) this.setData({ busy: false }); });
    } });
  },
  openRequest(e) {
    const id = Number(e.currentTarget.dataset.id); const identity = auth.capture(wx);
    api.getManualServiceRequest(id).then(result => {
      if (!auth.isCurrent(identity, wx)) { this.refresh(); return; }
      if (!list(result)) { this.setData({ error: result && result.message || '详情暂时无法读取。' }); return; }
      this.setData({ selected: result.data, error: '' });
    }).catch(() => { if (auth.isCurrent(identity, wx)) this.setData({ error: '详情暂时无法读取。' }); });
  }
});
