const api = require('../../../utils/api-v4.js');
const ownerStorage = require('../../../utils/owner-storage.js');

const TYPE_LABELS = {
  education: '教育', experience: '工作', project: '项目', skill: '技能', award: '奖项'
};
const RESUME_TYPE_LABELS = {
  sde: '开发岗位', ai_engineer: 'AI 岗位', data: '数据岗位', quant: '量化岗位', general: '通用简历'
};

Page({
  data: {
    activeTab: 'resumes',
    templates: [],
    attachments: [],
    attachmentBusy: false,
    attachmentStage: '',
    attachmentError: '',
    busyAttachmentId: null,
    resumes: [],
    experiences: [],
    currentResume: null,
    optimizationContext: null,
    versions: [],
    proposal: null,
    decisions: {},
    manualMode: false,
    manualJson: '',
    loading: false,
    restoreBusy: false,
    showCreate: false,
    createName: '',
    templateIndex: 0,
    showExperience: false,
    experienceTypeIndex: 0,
    experienceTypes: ['education', 'experience', 'project', 'skill', 'award'],
    experienceForm: { title: '', organization: '', description: '' }
  },

  onLoad(options) {
    this._ownerScope = ownerStorage.capture();
    this._unloaded = false;
    const context = options && options.targeted === '1' ? ownerStorage.get('pendingResumeOptimization', '', null) : null;
    this.setData({ optimizationContext: context && context.jobId ? context : null });
    this.refresh();
  },
  onUnload() {
    this._unloaded = true;
    this._requestGeneration = (this._requestGeneration || 0) + 1;
    this._restoreRequestGeneration = (this._restoreRequestGeneration || 0) + 1;
  },
  onPullDownRefresh() { this.refresh().finally(() => wx.stopPullDownRefresh()); },

  // Older running backends do not expose sourceAttachment in the resume list.
  // Recover it from the immutable V1 content before deciding an attachment is new.
  reconcileResumeSources(resumes) {
    return Promise.all(resumes.map(resume => {
      if (Object.prototype.hasOwnProperty.call(resume, 'sourceAttachment')) return Promise.resolve(resume);
      return api.getResumeVersions(resume.id).then(result => {
        const source = (result.data || []).find(version => version.content && version.content.sourceAttachment);
        return Object.assign({}, resume, { sourceAttachment: source ? source.content.sourceAttachment : null });
      });
    }));
  },

  findLinkedResumeForAttachment(id) {
    return api.getV4Resumes().then(result => this.reconcileResumeSources(result.data || []))
      .then(resumes => resumes.find(resume => resume.sourceAttachment
        && Number(resume.sourceAttachment.id) === Number(id)) || null);
  },

  refresh() {
    const generation = this._requestGeneration = (this._requestGeneration || 0) + 1;
    const owner = this._ownerScope;
    this.setData({ loading: true });
    return Promise.all([api.getResumeTemplates(), api.getV4Resumes(), api.getCareerExperiences(), api.getResumePdfs()])
      .then(async ([templates, resumes, experiences, pdfs]) => {
        if (this._unloaded || generation !== this._requestGeneration || !ownerStorage.isCurrent(owner)) return;
        const recovered = (pdfs.data || []).length
          ? await this.reconcileResumeSources(resumes.data || []) : (resumes.data || []);
        if (this._unloaded || generation !== this._requestGeneration || !ownerStorage.isCurrent(owner)) return;
        const list = recovered.map(item => Object.assign({}, item, {
          typeLabel: RESUME_TYPE_LABELS[item.resumeType] || '通用简历',
          updatedLabel: String(item.updatedAt || '').slice(0, 10)
        }));
        const seenAttachments = {};
        list.forEach(item => {
          const sourceId = item.sourceAttachment && Number(item.sourceAttachment.id);
          item.duplicateSource = !!(sourceId && seenAttachments[sourceId]);
          if (sourceId) seenAttachments[sourceId] = true;
        });
        const attachments = (pdfs.data || []).map(item => {
          const linked = list.find(resume => resume.sourceAttachment && Number(resume.sourceAttachment.id) === Number(item.id));
          return Object.assign({}, item, {
            filename: item.original_name || '附件简历.pdf',
            sizeLabel: (Number(item.file_size || 0) / 1024 / 1024).toFixed(1) + ' MB',
            dateLabel: String(item.created_at || '').slice(0, 10),
            linkedResumeId: linked ? linked.id : null,
            linkedResumeName: linked ? linked.name : ''
          });
        });
        const selectedId = this.data.currentResume && this.data.currentResume.id;
        this.setData({
          templates: (templates.data || []).map(item => Object.assign({}, item, { name: RESUME_TYPE_LABELS[item.code] || item.name })),
          attachments,
          resumes: list,
          experiences: (experiences.data || []).map(item => Object.assign({}, item, { typeLabel: TYPE_LABELS[item.type] || item.type })),
          currentResume: list.find(item => String(item.id) === String(selectedId)) || list.find(item => item.isDefault) || list[0] || null,
          loading: false
        });
      }).catch(err => {
        if (this._unloaded || generation !== this._requestGeneration || !ownerStorage.isCurrent(owner)) return;
        this.setData({ loading: false });
        wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      });
  },

  switchTab(e) { this.setData({ activeTab: e.currentTarget.dataset.tab }); },
  chooseResumePdf() {
    if (this.data.attachmentBusy) return;
    wx.chooseMessageFile({ count: 1, type: 'file', extension: ['pdf'],
      success: result => {
        const file = result.tempFiles && result.tempFiles[0];
        if (!file || !/\.pdf$/i.test(String(file.name || ''))) {
          return this.setData({ attachmentError: '请选择 PDF 格式的附件简历。' });
        }
        if (Number(file.size) > 10 * 1024 * 1024) {
          return this.setData({ attachmentError: '文件不能超过 10 MB，请压缩后重试。' });
        }
        const owner = this._ownerScope;
        this.setData({ attachmentBusy: true, attachmentStage: '正在上传简历…', attachmentError: '' });
        api.uploadResumePdf(file.path, file.name).then(uploaded => {
          if (this._unloaded || !ownerStorage.isCurrent(owner)) return;
          this.setData({ attachmentStage: '上传成功，正在建立原始版本…', busyAttachmentId: uploaded.data.id });
          return this.importResumePdf(uploaded.data.id);
        }).catch(err => {
          if (!this._unloaded && ownerStorage.isCurrent(owner)) this.setData({ attachmentError: err.message || '上传失败，请重试。' });
        }).finally(() => {
          if (!this._unloaded && ownerStorage.isCurrent(owner)) {
            this.setData({ attachmentBusy: false, attachmentStage: '', busyAttachmentId: null });
            this.refresh();
          }
        });
      },
      fail: error => {
        if (error && !/cancel/i.test(error.errMsg || '')) this.setData({ attachmentError: '无法选择文件，请重试。' });
      }
    });
  },
  optimizeAttachment(e) {
    if (this.data.attachmentBusy) return;
    const id = Number(e.currentTarget.dataset.id);
    const attachment = this.data.attachments.find(item => Number(item.id) === id);
    if (!attachment) return;
    if (attachment.linkedResumeId) {
      const resume = this.data.resumes.find(item => String(item.id) === String(attachment.linkedResumeId));
      if (resume) return this.setData({ currentResume: resume, proposal: null }, () => this.optimizeResume());
    }
    const owner = this._ownerScope;
    this.setData({ attachmentBusy: true, busyAttachmentId: id, attachmentStage: '正在读取简历内容…', attachmentError: '' });
    this.importResumePdf(id).catch(err => {
      if (!this._unloaded && ownerStorage.isCurrent(owner)) this.setData({ attachmentError: err.message || '读取失败，请重试。' });
    }).finally(() => {
      if (!this._unloaded && ownerStorage.isCurrent(owner)) {
        this.setData({ attachmentBusy: false, busyAttachmentId: null, attachmentStage: '' });
        this.refresh();
      }
    });
  },
  importResumePdf(id) {
    const owner = this._ownerScope;
    return this.findLinkedResumeForAttachment(id).then(existing => {
      if (this._unloaded || !ownerStorage.isCurrent(owner)) return null;
      if (existing) {
        this.setData({ currentResume: existing, attachmentError: '', attachmentStage: '' });
        wx.showToast({ title: '已关联原简历', icon: 'success' });
        return null;
      }
      return api.extractResumePdf(id);
    }).then(result => {
      if (!result) return null;
      if (this._unloaded || !ownerStorage.isCurrent(owner)) return;
      const data = result.data || {};
      if (!data.extraction || data.extraction.status !== 'ok' || !String(data.text || '').trim()) {
        throw new Error('这份 PDF 无法提取文字。请上传可选中文字的 PDF，扫描件可先转为文字版。');
      }
      const attachment = this.data.attachments.find(item => Number(item.id) === Number(id));
      const source = data.resume || {};
      const filename = (attachment && attachment.filename) || (source.sourceAttachment && source.sourceAttachment.filename) || '我的简历.pdf';
      const content = Object.assign({}, source, { sourceAttachment: { id, filename } });
      this.setData({ attachmentStage: '正在建立可优化版本…' });
      return api.createV4Resume({ name: filename.replace(/\.pdf$/i, '').slice(0, 80) || '我的简历', resumeType: 'general', content });
    }).then(created => {
      if (!created || this._unloaded || !ownerStorage.isCurrent(owner)) return;
      const resume = created.data;
      this.setData({ currentResume: resume, attachmentError: '', attachmentStage: '' });
      wx.showToast({ title: '简历已导入', icon: 'success' });
    });
  },
  openCreate() { this.setData({ showCreate: true, createName: '' }); },
  closeCreate() { this.setData({ showCreate: false }); },
  onCreateName(e) { this.setData({ createName: e.detail.value }); },
  onTemplateChange(e) { this.setData({ templateIndex: Number(e.detail.value) || 0 }); },
  createResume() {
    const template = this.data.templates[this.data.templateIndex] || { code: 'general', name: '通用简历' };
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
    if (item) {
      this._restoreRequestGeneration = (this._restoreRequestGeneration || 0) + 1;
      this._restoreBusy = false;
      this.setData({ currentResume: item, versions: [], proposal: null, restoreBusy: false });
    }
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

  initializeResumeVersion() {
    const resume = this.data.currentResume;
    if (!resume || resume.currentVersionId || this._initializingVersion) return;
    wx.showModal({
      title: '初始化首个版本',
      content: '将当前旧简历内容保存为 V1，之后才能用于申请材料和 AI 优化。',
      confirmText: '确认创建',
      success: result => {
        if (!result.confirm || this._initializingVersion) return;
        this._initializingVersion = true;
        const owner = ownerStorage.capture();
        api.createResumeVersion(resume.id, { expectedVersionId: null, useLegacyContent: true }).then(() => {
          if (!this._unloaded && ownerStorage.isCurrent(owner)) {
            wx.showToast({ title: '已创建 V1', icon: 'success' });
            this.refresh();
          }
        }).catch(err => {
          if (!this._unloaded && ownerStorage.isCurrent(owner)) wx.showToast({ title: err.message || '初始化失败', icon: 'none' });
        }).finally(() => { this._initializingVersion = false; });
      }
    });
  },

  restoreVersion(e) {
    const version = this.data.versions.find(item => String(item.id) === String(e.currentTarget.dataset.id));
    const resume = this.data.currentResume;
    if (!version || !resume || this._restoreBusy) return;
    const expectedVersionId = Number(resume.currentVersionId);
    if (!Number.isSafeInteger(expectedVersionId) || expectedVersionId <= 0) return this.initializeResumeVersion();
    const owner = this._ownerScope;
    const selectedResumeId = resume.id;
    wx.showModal({ title: `恢复 V${version.versionNo}`, content: '恢复会创建一个新版本，不会覆盖现有历史。',
      success: result => {
        if (!result.confirm || this._unloaded || this._restoreBusy || !ownerStorage.isCurrent(owner)
          || !this.data.currentResume || String(this.data.currentResume.id) !== String(selectedResumeId)
          || Number(this.data.currentResume.currentVersionId) !== expectedVersionId) return;
        const generation = this._restoreRequestGeneration = (this._restoreRequestGeneration || 0) + 1;
        this._restoreBusy = true;
        this.setData({ restoreBusy: true });
        api.restoreResumeVersion(selectedResumeId, version.id, { expectedVersionId }).then(res => {
          if (this._unloaded || generation !== this._restoreRequestGeneration || !ownerStorage.isCurrent(owner)
            || !this.data.currentResume || String(this.data.currentResume.id) !== String(selectedResumeId)) return null;
          const updatedResume = Object.assign({}, this.data.currentResume, { currentVersionId: res.data.id });
          this.setData({
            currentResume: updatedResume,
            resumes: this.data.resumes.map(item => String(item.id) === String(selectedResumeId) ? Object.assign({}, item, { currentVersionId: res.data.id }) : item)
          });
          wx.showToast({ title: '已创建恢复版本', icon: 'success' });
          return api.getResumeVersions(selectedResumeId).then(versions => {
            if (this._unloaded || generation !== this._restoreRequestGeneration || !ownerStorage.isCurrent(owner)
              || !this.data.currentResume || String(this.data.currentResume.id) !== String(selectedResumeId)) return;
            this.setData({ versions: versions.data || [], activeTab: 'versions' });
          });
        }).catch(err => {
          if (!this._unloaded && generation === this._restoreRequestGeneration && ownerStorage.isCurrent(owner)) {
            wx.showToast({ title: err.message || '恢复失败', icon: 'none' });
          }
        }).finally(() => {
          if (!this._unloaded && generation === this._restoreRequestGeneration && ownerStorage.isCurrent(owner)) {
            this._restoreBusy = false;
            this.setData({ restoreBusy: false });
          }
        });
      }
    });
  },

  optimizeResume() {
    if (!this.data.currentResume) return wx.showToast({ title: '请先选择简历', icon: 'none' });
    if (!this.data.currentResume.currentVersionId) return this.initializeResumeVersion();
    if (this.data.loading || this._proposalMutationBusy || this._optimizingResume) return;
    this._optimizingResume = true;
    const owner = ownerStorage.capture();
    const generation = this._proposalRequestGeneration = (this._proposalRequestGeneration || 0) + 1;
    const selectedResumeId = this.data.currentResume.id;
    this.setData({ loading: true });
    const context = this.data.optimizationContext || {};
    api.createResumeChangeSet(this.data.currentResume.id, {
      jobId: context.jobId || '',
      applicationId: context.applicationId || null,
      jdText: context.jdText || ''
    }).then(res => {
      if (this._unloaded || generation !== this._proposalRequestGeneration || !ownerStorage.isCurrent(owner)
        || !this.data.currentResume || String(this.data.currentResume.id) !== String(selectedResumeId)) return;
      const proposal = res.data;
      const generation = proposal.generation || {};
      proposal.isFallback = generation.degraded === true;
      proposal.modelLabel = proposal.isFallback ? '规则降级（非大模型）' : proposal.aiModel;
      proposal.suggestionLabel = proposal.isFallback ? '规则建议' : 'AI 建议';
      if (proposal.isFallback) {
        proposal.generationNotice = '大模型服务暂不可用，以下是本地规则生成的基础建议，请仔细核验后再接受。';
      }
      const decisions = {};
      (proposal.suggestions || []).forEach(item => { decisions[item.id] = 'reject'; });
      this.setData({ proposal, decisions, manualMode: false, manualJson: JSON.stringify(proposal.sourceContent || {}, null, 2), loading: false });
    }).catch(err => {
      if (this._unloaded || generation !== this._proposalRequestGeneration || !ownerStorage.isCurrent(owner)) return;
      this.setData({ loading: false });
      this.setData({ attachmentError: err.message || '生成失败，请补充简历内容后重试。' });
      wx.showToast({ title: '优化失败，请查看提示', icon: 'none' });
    }).finally(() => { this._optimizingResume = false; });
  },

  toggleSuggestion(e) {
    const id = e.currentTarget.dataset.id;
    const next = this.data.decisions[id] === 'accept' ? 'reject' : 'accept';
    this.setData({ ['decisions.' + id]: next });
  },

  toggleManualMode() { this.setData({ manualMode: !this.data.manualMode }); },
  onManualJsonInput(e) { this.setData({ manualJson: e.detail.value }); },

  confirmSuggestions() {
    if (!this.data.proposal || this._proposalMutationBusy) return;
    const payload = { decisions: this.data.decisions };
    if (this.data.manualMode) {
      try { payload.manualContent = JSON.parse(this.data.manualJson); }
      catch (e) { return wx.showToast({ title: '手动编辑的 JSON 格式有误', icon: 'none' }); }
    }
    const owner = ownerStorage.capture();
    const proposalId = this.data.proposal.id;
    this._proposalMutationBusy = true;
    api.confirmResumeChangeSet(proposalId, payload).then(() => {
      if (this._unloaded || !ownerStorage.isCurrent(owner) || !this.data.proposal || String(this.data.proposal.id) !== String(proposalId)) return;
      wx.showToast({ title: '已保存新版本', icon: 'success' });
      if (this.data.optimizationContext) ownerStorage.remove('pendingResumeOptimization');
      this.setData({ proposal: null, manualMode: false, manualJson: '', optimizationContext: null });
      this.refresh();
    }).catch(err => { if (!this._unloaded && ownerStorage.isCurrent(owner)) wx.showToast({ title: err.message || '保存失败', icon: 'none' }); })
      .finally(() => { this._proposalMutationBusy = false; });
  },

  rejectSuggestions() {
    if (!this.data.proposal || this._proposalMutationBusy) return;
    const owner=ownerStorage.capture(); const proposalId=this.data.proposal.id; this._proposalMutationBusy=true;
    api.rejectResumeChangeSet(proposalId, { decisions: this.data.decisions }).then(() => {
      if (!this._unloaded && ownerStorage.isCurrent(owner) && this.data.proposal && String(this.data.proposal.id)===String(proposalId)) this.setData({ proposal: null });
    }).finally(()=>{this._proposalMutationBusy=false;});
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
