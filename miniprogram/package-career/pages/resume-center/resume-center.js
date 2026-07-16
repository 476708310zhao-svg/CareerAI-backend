const api = require('../../../utils/api-v4.js');

const TYPE_LABELS = {
  education: '教育', experience: '工作', project: '项目', skill: '技能', award: '奖项'
};

Page({
  data: {
    activeTab: 'resumes',
    templates: [],
    resumes: [],
    experiences: [],
    currentResume: null,
    versions: [],
    proposal: null,
    decisions: {},
    manualMode: false,
    manualJson: '',
    loading: false,
    showCreate: false,
    createName: '',
    templateIndex: 0,
    showExperience: false,
    experienceTypeIndex: 0,
    experienceTypes: ['education', 'experience', 'project', 'skill', 'award'],
    experienceForm: { title: '', organization: '', description: '' }
  },

  onLoad() { this.refresh(); },
  onPullDownRefresh() { this.refresh().finally(() => wx.stopPullDownRefresh()); },

  refresh() {
    this.setData({ loading: true });
    return Promise.all([api.getResumeTemplates(), api.getV4Resumes(), api.getCareerExperiences()])
      .then(([templates, resumes, experiences]) => {
        const list = (resumes.data || []).map(item => Object.assign({}, item, {
          typeLabel: ((templates.data || []).find(type => type.code === item.resumeType) || {}).name || item.resumeType,
          updatedLabel: String(item.updatedAt || '').slice(0, 10)
        }));
        this.setData({
          templates: templates.data || [],
          resumes: list,
          experiences: (experiences.data || []).map(item => Object.assign({}, item, { typeLabel: TYPE_LABELS[item.type] || item.type })),
          currentResume: list.find(item => item.isDefault) || list[0] || null,
          loading: false
        });
      }).catch(err => {
        this.setData({ loading: false });
        wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      });
  },

  switchTab(e) { this.setData({ activeTab: e.currentTarget.dataset.tab }); },
  openCreate() { this.setData({ showCreate: true, createName: '' }); },
  closeCreate() { this.setData({ showCreate: false }); },
  onCreateName(e) { this.setData({ createName: e.detail.value }); },
  onTemplateChange(e) { this.setData({ templateIndex: Number(e.detail.value) || 0 }); },
  createResume() {
    const template = this.data.templates[this.data.templateIndex] || { code: 'general', name: 'General Resume' };
    const name = String(this.data.createName || '').trim() || template.name;
    api.createV4Resume({
      name, resumeType: template.code,
      content: { summary: '', education: [], experience: [], projects: [], skills: [], awards: [] }
    }).then(() => {
      this.closeCreate();
      wx.showToast({ title: '已创建', icon: 'success' });
      this.refresh();
    }).catch(err => wx.showToast({ title: err.message || '创建失败', icon: 'none' }));
  },

  selectResume(e) {
    const item = this.data.resumes.find(row => String(row.id) === String(e.currentTarget.dataset.id));
    if (item) this.setData({ currentResume: item, versions: [], proposal: null });
  },

  resumeActions(e) {
    const id = e.currentTarget.dataset.id;
    const resume = this.data.resumes.find(item => String(item.id) === String(id));
    if (!resume) return;
    wx.showActionSheet({
      itemList: ['查看版本', '复制简历', '重命名', '设为默认', '归档'],
      success: result => {
        if (result.tapIndex === 0) this.loadVersions(resume);
        if (result.tapIndex === 1) api.copyV4Resume(id, {}).then(() => this.refresh());
        if (result.tapIndex === 2) this.renameResume(resume);
        if (result.tapIndex === 3) api.setDefaultV4Resume(id).then(() => this.refresh());
        if (result.tapIndex === 4) this.archiveResume(resume);
      }
    });
  },

  renameResume(resume) {
    wx.showModal({ title: '重命名简历', editable: true, placeholderText: resume.name,
      success: result => {
        if (!result.confirm || !String(result.content || '').trim()) return;
        api.updateV4Resume(resume.id, { name: result.content.trim() }).then(() => this.refresh());
      }
    });
  },

  archiveResume(resume) {
    wx.showModal({ title: '归档简历', content: `归档「${resume.name}」？历史版本仍会保留。`,
      success: result => {
        if (result.confirm) api.archiveV4Resume(resume.id).then(() => this.refresh());
      }
    });
  },

  loadVersions(resume) {
    api.getResumeVersions(resume.id).then(res => {
      this.setData({ currentResume: resume, versions: res.data || [], activeTab: 'versions' });
    });
  },

  restoreVersion(e) {
    const version = this.data.versions.find(item => String(item.id) === String(e.currentTarget.dataset.id));
    if (!version || !this.data.currentResume) return;
    wx.showModal({ title: `恢复 V${version.versionNo}`, content: '恢复会创建一个新版本，不会覆盖现有历史。',
      success: result => {
        if (!result.confirm) return;
        api.restoreResumeVersion(this.data.currentResume.id, version.id).then(() => {
          wx.showToast({ title: '已创建恢复版本', icon: 'success' });
          this.loadVersions(this.data.currentResume);
        });
      }
    });
  },

  optimizeResume() {
    if (!this.data.currentResume) return wx.showToast({ title: '请先选择简历', icon: 'none' });
    this.setData({ loading: true });
    api.createResumeChangeSet(this.data.currentResume.id, {}).then(res => {
      const proposal = res.data;
      const decisions = {};
      (proposal.suggestions || []).forEach(item => { decisions[item.id] = 'reject'; });
      this.setData({ proposal, decisions, manualMode: false, manualJson: JSON.stringify(proposal.sourceContent || {}, null, 2), loading: false });
    }).catch(err => {
      this.setData({ loading: false });
      wx.showToast({ title: err.message || '生成失败', icon: 'none' });
    });
  },

  toggleSuggestion(e) {
    const id = e.currentTarget.dataset.id;
    const next = this.data.decisions[id] === 'accept' ? 'reject' : 'accept';
    this.setData({ ['decisions.' + id]: next });
  },

  toggleManualMode() { this.setData({ manualMode: !this.data.manualMode }); },
  onManualJsonInput(e) { this.setData({ manualJson: e.detail.value }); },

  confirmSuggestions() {
    const payload = { decisions: this.data.decisions };
    if (this.data.manualMode) {
      try { payload.manualContent = JSON.parse(this.data.manualJson); }
      catch (e) { return wx.showToast({ title: '手动编辑的 JSON 格式有误', icon: 'none' }); }
    }
    api.confirmResumeChangeSet(this.data.proposal.id, payload).then(() => {
      wx.showToast({ title: '已保存新版本', icon: 'success' });
      this.setData({ proposal: null, manualMode: false, manualJson: '' });
      this.refresh();
    }).catch(err => wx.showToast({ title: err.message || '保存失败', icon: 'none' }));
  },

  rejectSuggestions() {
    api.rejectResumeChangeSet(this.data.proposal.id, { decisions: this.data.decisions }).then(() => this.setData({ proposal: null }));
  },

  openExperience() { this.setData({ showExperience: true, experienceForm: { title: '', organization: '', description: '' } }); },
  closeExperience() { this.setData({ showExperience: false }); },
  onExperienceType(e) { this.setData({ experienceTypeIndex: Number(e.detail.value) || 0 }); },
  onExperienceInput(e) { this.setData({ ['experienceForm.' + e.currentTarget.dataset.field]: e.detail.value }); },
  saveExperience() {
    const form = this.data.experienceForm;
    if (!String(form.title || '').trim()) return wx.showToast({ title: '请填写经历标题', icon: 'none' });
    api.createCareerExperience({
      type: this.data.experienceTypes[this.data.experienceTypeIndex], title: form.title,
      organization: form.organization, content: { description: form.description }, verified: true
    }).then(() => { this.closeExperience(); this.refresh(); });
  },

  archiveExperience(e) {
    api.archiveCareerExperience(e.currentTarget.dataset.id).then(() => this.refresh());
  }
});
