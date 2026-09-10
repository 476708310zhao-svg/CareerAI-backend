// Sprint 6 证据型 Project Builder：计划、完成证据、简历素材三阶段严格分离。
const v4Api = require('../../../utils/api-v4.js');
const safePage = require('../../behaviors/safe-page');

const EMPTY_CREATE = { track: '', targetRole: '', title: '', gapsText: '' };
const EMPTY_COMPLETE = { outcomesText: '', artifactsText: '', limitationsText: '' };

function lines(value) { return String(value || '').split(/\n|；/).map(item => item.trim()).filter(Boolean); }
function modal(options) { return new Promise(resolve => wx.showModal(Object.assign({}, options, { success: resolve, fail: () => resolve({ confirm: false }) }))); }

Page({
  behaviors: [safePage],
  data: {
    loading: false, dashboard: null, projects: [], applications: [], tracks: [], selectedProject: null,
    showCreate: false, createForm: Object.assign({}, EMPTY_CREATE),
    showMilestone: false, milestoneId: '', evidenceNote: '',
    showComplete: false, completeForm: Object.assign({}, EMPTY_COMPLETE),
    showExport: false, resumeBullet: '', saving: false
  },

  onLoad(options) {
    const role = options.role ? decodeURIComponent(options.role) : '';
    this.setData({ createForm: Object.assign({}, EMPTY_CREATE, { track: options.track || '', targetRole: role }) });
    this.loadDashboard();
  },
  onPullDownRefresh() { this.loadDashboard().finally(() => wx.stopPullDownRefresh()); },

  async loadDashboard(selectId) {
    this.setData({ loading: true });
    try {
      const res = await v4Api.getProjectDashboard();
      if (!res || res.code !== 0) throw new Error((res && res.message) || '加载失败');
      const data = res.data || {}; const projects = data.projects || [];
      const wanted = selectId || (this.data.selectedProject && this.data.selectedProject.id);
      this.setData({ dashboard: data, projects, applications: data.applications || [], tracks: data.tracks || [],
        selectedProject: projects.find(item => String(item.id) === String(wanted)) || projects[0] || null });
    } catch (error) { wx.showToast({ title: error.message || '加载失败', icon: 'none' }); }
    finally { this.setData({ loading: false }); }
  },

  openCreate() { this.setData({ showCreate: true }); },
  closeCreate() { this.setData({ showCreate: false }); },
  onCreateInput(e) { this.setData({ ['createForm.' + e.currentTarget.dataset.key]: e.detail.value }); },
  selectTrack(e) { this.setData({ 'createForm.track': e.currentTarget.dataset.value }); },
  selectProject(e) {
    const project = this.data.projects.find(item => String(item.id) === String(e.currentTarget.dataset.id));
    if (project) this.setData({ selectedProject: project });
  },

  async createProject() {
    const form = this.data.createForm;
    if (!form.track || !form.targetRole.trim()) { wx.showToast({ title: '请选择方向并填写目标岗位', icon: 'none' }); return; }
    this.setData({ saving: true });
    try {
      const res = await v4Api.createEvidenceProject({ track: form.track, targetRole: form.targetRole.trim(),
        title: form.title.trim(), gaps: lines(form.gapsText) });
      this.setData({ showCreate: false, createForm: Object.assign({}, EMPTY_CREATE) });
      await this.loadDashboard(res && res.data && res.data.id); wx.showToast({ title: '计划已创建', icon: 'success' });
    } catch (error) { wx.showToast({ title: error.message || '创建失败', icon: 'none' }); }
    finally { this.setData({ saving: false }); }
  },

  openMilestone(e) {
    const milestone = this.data.selectedProject.milestones.find(item => String(item.id) === String(e.currentTarget.dataset.id));
    if (!milestone) return;
    this.setData({ showMilestone: true, milestoneId: milestone.id, evidenceNote: milestone.evidenceNote || '' });
  },
  closeMilestone() { this.setData({ showMilestone: false }); },
  onEvidenceInput(e) { this.setData({ evidenceNote: e.detail.value }); },
  async saveMilestone() {
    if (!this.data.evidenceNote.trim()) { wx.showToast({ title: '请填写真实证据', icon: 'none' }); return; }
    const result = await modal({ title: '确认里程碑证据', content: '请确认这项工作已真实完成，填写内容可由链接、截图、代码或运行记录核验。', confirmText: '确认完成' });
    if (!result.confirm) return;
    try {
      await v4Api.updateProjectMilestone(this.data.selectedProject.id, this.data.milestoneId,
        { status: 'completed', evidenceNote: this.data.evidenceNote.trim(), confirmEvidence: true });
      this.setData({ showMilestone: false }); await this.loadDashboard(this.data.selectedProject.id);
    } catch (error) { wx.showToast({ title: error.message || '保存失败', icon: 'none' }); }
  },

  openComplete() { this.setData({ showComplete: true, completeForm: Object.assign({}, EMPTY_COMPLETE) }); },
  closeComplete() { this.setData({ showComplete: false }); },
  onCompleteInput(e) { this.setData({ ['completeForm.' + e.currentTarget.dataset.key]: e.detail.value }); },
  async completeProject() {
    const form = this.data.completeForm;
    if (!lines(form.outcomesText).length || !lines(form.artifactsText).length) { wx.showToast({ title: '请填写真实成果和可核验交付物', icon: 'none' }); return; }
    const result = await modal({ title: '确认项目真实完成', content: '计划本身不是经历。请确认项目已真实完成，成果、交付物与限制均按事实填写。', confirmText: '本人确认' });
    if (!result.confirm) return;
    try {
      await v4Api.completeEvidenceProject(this.data.selectedProject.id, { confirmRealCompletion: true,
        evidence: { outcomes: lines(form.outcomesText), artifacts: lines(form.artifactsText), limitations: lines(form.limitationsText) } });
      this.setData({ showComplete: false }); await this.loadDashboard(this.data.selectedProject.id);
    } catch (error) { wx.showToast({ title: error.message || '确认失败', icon: 'none' }); }
  },

  openExport() { this.setData({ showExport: true, resumeBullet: '' }); },
  closeExport() { this.setData({ showExport: false }); },
  onResumeBulletInput(e) { this.setData({ resumeBullet: e.detail.value }); },
  async exportExperience() {
    if (!this.data.resumeBullet.trim()) { wx.showToast({ title: '请填写真实简历描述', icon: 'none' }); return; }
    const result = await modal({ title: '写入经历库', content: '数字必须已经出现在完成证据中。请确认只写入本人真实完成的成果。', confirmText: '确认写入' });
    if (!result.confirm) return;
    try {
      await v4Api.exportProjectExperience(this.data.selectedProject.id,
        { resumeBullet: this.data.resumeBullet.trim(), confirmResumeWriteback: true });
      this.setData({ showExport: false }); await this.loadDashboard(this.data.selectedProject.id); wx.showToast({ title: '已写入经历库', icon: 'success' });
    } catch (error) { wx.showToast({ title: error.message || '写入失败', icon: 'none', duration: 3000 }); }
  }
});
