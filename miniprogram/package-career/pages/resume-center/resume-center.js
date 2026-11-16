const api = require('../../../utils/api-v4.js');
const userApi = require('../../../utils/api.js');
const ownerStorage = require('../../../utils/owner-storage.js');
const appConfig = require('../../../utils/app-config.js');
const { scoreResumeContent } = require('../../utils/resume-review-score.js');

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
    showTextPreview: false,
    previewText: '',
    previewTitle: '',
    attachmentBusy: false,
    attachmentStage: '',
    attachmentError: '',
    busyAttachmentId: null,
    optimizing: false,
    optimizingResumeId: null,
    optimizationError: '',
    optimizationDiagnostic: '',
    resumes: [],
    experiences: [],
    currentResume: null,
    optimizationContext: null,
    proposal: null,
    decisions: {},
    showReview: false,
    reviewLoading: false,
    reviewScore: null,
    reviewError: '',
    showResumeEditor: false,
    resumeEditorLoading: false,
    resumeEditorSaving: false,
    resumeEditorError: '',
    resumeEditor: { summary: '', skillsText: '', targetRolesText: '', targetCitiesText: '', workExp: [], education: [], projects: [] },
    loading: false,
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
  onShow() {
    if (!this._ownerScope || ownerStorage.isCurrent(this._ownerScope)) return;
    this._ownerScope = ownerStorage.capture();
    this._reviewRequestGeneration = (this._reviewRequestGeneration || 0) + 1;
    this._proposalRequestGeneration = (this._proposalRequestGeneration || 0) + 1;
    this._optimizingResume = false;
    this.setData({ attachments: [], resumes: [], currentResume: null, proposal: null,
      showReview: false, reviewLoading: false, reviewScore: null, reviewError: '',
      optimizationError: '', optimizationDiagnostic: '', optimizing: false, optimizingResumeId: null });
    this.refresh();
  },
  onUnload() {
    this._unloaded = true;
    this._requestGeneration = (this._requestGeneration || 0) + 1;
    this._reviewRequestGeneration = (this._reviewRequestGeneration || 0) + 1;
  },
  onPullDownRefresh() { this.refresh().finally(() => wx.stopPullDownRefresh()); },

  // Older running backends do not expose sourceAttachment in the resume list.
  // Recover it from the immutable V1 content before deciding an attachment is new.
  reconcileResumeSources(resumes) {
    return Promise.all(resumes.map(resume => {
      if (Object.prototype.hasOwnProperty.call(resume, 'sourceAttachment')) return Promise.resolve(resume);
      return api.getCompleteResumeVersions(resume.id).then(async result => {
        for (const version of result.data || []) {
          const detail = version.content ? { data: version } : await api.getResumeVersion(resume.id, version.id);
          const source = detail.data && detail.data.content && detail.data.content.sourceAttachment;
          if (source) return Object.assign({}, resume, { sourceAttachment: source });
        }
        return Object.assign({}, resume, { sourceAttachment: null });
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
  previewAttachment(e) {
    const id = Number(e.currentTarget.dataset.id);
    if (this._previewInFlight || !this.data.attachments.some(item => Number(item.id) === id)) return;
    this._previewInFlight = true;
    let loadingVisible = true;
    const hideLoading = () => {
      if (!loadingVisible) return;
      loadingVisible = false;
      wx.hideLoading();
    };
    wx.showLoading({ title: '正在打开简历…', mask: true });
    return Promise.resolve().then(() => api.downloadResumePdf(id)).then(filePath => {
      hideLoading();
      return new Promise((resolve, reject) => {
        wx.openDocument({ filePath, fileType: 'pdf', showMenu: true, success: resolve, fail: reject });
      });
    }).catch(err => {
      hideLoading();
      if (this._unloaded) return;
      if (err && err.statusCode === 404 && typeof wx.showModal === 'function') {
        wx.showModal({ title: 'PDF 原件暂不能打开',
          content: '原 PDF 下载接口可能尚未更新，或原文件已不存在。你可以先查看提取文字。',
          cancelText: '关闭', confirmText: '查看文字',
          success: choice => { if (choice.confirm) this.openExtractedText(id); }
        });
        return;
      }
      const message = err.message || 'PDF 打开失败，请稍后重试。';
      if (typeof wx.showModal === 'function') wx.showModal({ title: '暂时无法查看附件', content: message, showCancel: false });
      else wx.showToast({ title: message, icon: 'none' });
    }).finally(() => {
      hideLoading();
      this._previewInFlight = false;
    });
  },
  openExtractedText(id) {
    if (this._textPreviewInFlight) return;
    this._textPreviewInFlight = true;
    let loadingVisible = true;
    const hideLoading = () => {
      if (!loadingVisible) return;
      loadingVisible = false;
      wx.hideLoading();
    };
    wx.showLoading({ title: '正在读取简历文字…', mask: true });
    return Promise.resolve().then(() => api.extractResumePdf(id)).then(result => {
      const text = String(result && result.data && result.data.text || '').trim();
      if (!text) throw new Error('这份 PDF 没有可提取的文字，暂无法显示文字预览。');
      hideLoading();
      if (this._unloaded) return;
      const attachment = this.data.attachments.find(item => Number(item.id) === Number(id));
      this.setData({ showTextPreview: true, previewText: text,
        previewTitle: attachment && attachment.filename || '附件简历' });
    }).catch(err => {
      hideLoading();
      if (!this._unloaded) wx.showModal({ title: '文字预览未完成', content: err.message || '请稍后重试', showCancel: false });
    }).finally(() => {
      hideLoading();
      this._textPreviewInFlight = false;
    });
  },
  closeTextPreview() { this.setData({ showTextPreview: false, previewText: '', previewTitle: '' }); },
  manageAttachment(e) {
    const id = Number(e.currentTarget.dataset.id);
    const attachment = this.data.attachments.find(item => Number(item.id) === id);
    if (!attachment) return;
    const itemList = attachment.linkedResumeId
      ? ['打开原 PDF', '查看提取文字', '重新识别并补齐在线简历', '删除附件']
      : ['打开原 PDF', '查看提取文字', '删除附件'];
    wx.showActionSheet({ itemList, success: result => {
      if (result.tapIndex === 0) return this.previewAttachment({ currentTarget: { dataset: { id } } });
      if (result.tapIndex === 1) return this.openExtractedText(id);
      if (attachment.linkedResumeId && result.tapIndex === 2) {
        return wx.showModal({ title: '重新识别简历',
          content: '从原 PDF 重新提取内容，只补齐在线简历的空白字段，并保存为新版本。已有内容不会被覆盖。',
          success: choice => { if (choice.confirm) this.reparseAttachment(attachment); }
        });
      }
      if (result.tapIndex !== itemList.length - 1) return;
      if (attachment.linkedResumeId) return wx.showModal({ title: '先删除在线简历', content: '此附件已关联在线简历。请先在下方删除对应在线简历，再删除原 PDF。', showCancel: false });
      wx.showModal({ title: '删除附件', content: `删除「${attachment.filename}」？此操作无法恢复。`, success: choice => {
        if (!choice.confirm) return;
        api.deleteResumePdf(id).then(() => this.refresh())
          .catch(err => wx.showToast({ title: err.message || '删除失败', icon: 'none' }));
      } });
    } });
  },
  reparseAttachment(attachment) {
    if (this.data.attachmentBusy || !attachment || !attachment.linkedResumeId) return;
    const owner = ownerStorage.capture();
    const resumeId = attachment.linkedResumeId;
    this.setData({ attachmentBusy: true, busyAttachmentId: attachment.id,
      attachmentStage: '正在重新识别原 PDF…', attachmentError: '' });
    return Promise.all([api.extractResumePdf(attachment.id), api.getCurrentResumeVersion(resumeId, this.data.resumes.find(resume => Number(resume.id) === Number(resumeId))?.currentVersionId)])
      .then(([extracted, versions]) => {
        if (this._unloaded || !ownerStorage.isCurrent(owner)) return null;
        const fresh = extracted.data || {};
        if (!fresh.extraction || fresh.extraction.status !== 'ok') throw new Error('原 PDF 无法提取文字，请检查文件');
        const current = (versions.data || []).find(item => Number(item.id) === Number(this.data.resumes.find(resume => Number(resume.id) === Number(resumeId))?.currentVersionId));
        if (!current || !current.content) throw new Error('在线简历版本已变化，请刷新后重试');
        const content = JSON.parse(JSON.stringify(current.content));
        const draft = fresh.resume || {};
        let filled = 0;
        for (const field of ['workExp', 'education', 'projects', 'skills']) {
          if ((!Array.isArray(content[field]) || !content[field].length) && Array.isArray(draft[field]) && draft[field].length) {
            content[field] = draft[field];
            filled += 1;
          }
        }
        const preference = Object.assign({}, content.jobPreference || {});
        for (const field of ['targetRoles', 'targetCities']) {
          if ((!Array.isArray(preference[field]) || !preference[field].length)
            && Array.isArray(draft.jobPreference && draft.jobPreference[field]) && draft.jobPreference[field].length) {
            preference[field] = draft.jobPreference[field];
            filled += 1;
          }
        }
        content.jobPreference = preference;
        if (!filled) throw new Error('没有识别出可补充的新经历。你可以编辑在线简历核对内容。');
        this.setData({ attachmentStage: `已识别 ${filled} 类空白资料，正在保存新版本…` });
        return api.createResumeVersion(resumeId, { expectedVersionId: current.id, content }).then(() => {
          if (!this._unloaded && ownerStorage.isCurrent(owner) && typeof ownerStorage.set === 'function') {
            ownerStorage.set('onlineResume', '', content);
          }
          return resumeId;
        });
      }).then(savedId => {
        if (!savedId || this._unloaded || !ownerStorage.isCurrent(owner)) return;
        return this.syncImportedProfile(savedId).then(() => this.refresh());
      }).catch(error => {
        if (!this._unloaded && ownerStorage.isCurrent(owner)) {
          this.setData({ attachmentError: error.message || '重新识别失败，请稍后重试' });
        }
      }).finally(() => {
        if (!this._unloaded && ownerStorage.isCurrent(owner)) {
          this.setData({ attachmentBusy: false, busyAttachmentId: null, attachmentStage: '' });
        }
      });
  },
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
    if (this.data.attachmentBusy || this.data.loading || this._optimizingResume) return;
    const id = Number(e.currentTarget.dataset.id);
    const attachment = this.data.attachments.find(item => Number(item.id) === id);
    if (!attachment) return;
    if (attachment.linkedResumeId) {
      const resume = this.data.resumes.find(item => String(item.id) === String(attachment.linkedResumeId));
      if (resume) {
        this.setData({ currentResume: resume, proposal: null });
        return this.openResumeReview(resume);
      }
    }
    const owner = this._ownerScope;
    this.setData({ attachmentBusy: true, busyAttachmentId: id, attachmentStage: '正在读取简历内容…', attachmentError: '' });
    return this.importResumePdf(id).then(() => this.refresh()).then(() => {
      if (this._unloaded || !ownerStorage.isCurrent(owner)) return;
      const linked = this.data.attachments.find(item => Number(item.id) === id);
      const resume = linked && this.data.resumes.find(item => Number(item.id) === Number(linked.linkedResumeId));
      if (resume) {
        this.setData({ attachmentBusy: false, busyAttachmentId: null, attachmentStage: '', currentResume: resume });
        return this.openResumeReview(resume);
      }
    }).catch(err => {
      if (!this._unloaded && ownerStorage.isCurrent(owner)) this.setData({ attachmentError: err.message || '读取失败，请重试。' });
    }).finally(() => {
      if (!this._unloaded && ownerStorage.isCurrent(owner)) {
        this.setData({ attachmentBusy: false, busyAttachmentId: null, attachmentStage: '' });
      }
    });
  },
  reviewSelectedResume() { return this.openResumeReview(this.data.currentResume); },
  openResumeReview(resume) {
    if (!resume || this._optimizingResume || this.data.reviewLoading || this.data.loading) return;
    if (!resume.currentVersionId) return this.initializeResumeVersion();
    const owner = ownerStorage.capture();
    const generation = this._reviewRequestGeneration = (this._reviewRequestGeneration || 0) + 1;
    this.setData({ showReview: true, reviewLoading: true, reviewScore: null, reviewError: '',
      proposal: null, optimizationError: '', optimizationDiagnostic: '' });
    return api.getCurrentResumeVersion(resume.id, resume.currentVersionId).then(result => {
      if (this._unloaded || generation !== this._reviewRequestGeneration || !ownerStorage.isCurrent(owner)) return;
      if (!this.data.currentResume || Number(this.data.currentResume.id) !== Number(resume.id)) return;
      const version = (result.data || []).find(item => Number(item.id) === Number(resume.currentVersionId));
      if (!version || !version.content) throw new Error('在线简历读取失败，请刷新后重试');
      this.setData({ reviewLoading: false, reviewScore: scoreResumeContent(version.content) });
      return this.optimizeResume();
    }).catch(error => {
      if (!this._unloaded && generation === this._reviewRequestGeneration && ownerStorage.isCurrent(owner)) {
        this.setData({ reviewLoading: false, reviewError: error.message || '简历读取失败，请重试' });
      }
    });
  },
  closeResumeReview() {
    if (this.data.optimizing || this._proposalMutationBusy) return;
    if (this.data.proposal) return this.rejectSuggestions();
    this._reviewRequestGeneration = (this._reviewRequestGeneration || 0) + 1;
    this.setData({ showReview: false, reviewLoading: false, reviewScore: null, reviewError: '' });
  },
  retryResumeReview() {
    if (this.data.optimizing || this.data.reviewLoading) return;
    this.setData({ showReview: false });
    return this.openResumeReview(this.data.currentResume);
  },
  importResumePdf(id) {
    const owner = this._ownerScope;
    let importedContent = null;
    return this.findLinkedResumeForAttachment(id).then(existing => {
      if (this._unloaded || !ownerStorage.isCurrent(owner)) return null;
      if (existing) {
        this.setData({ currentResume: existing, attachmentError: '', attachmentStage: '' });
        return this.syncImportedProfile(existing.id).then(() => api.getCurrentResumeVersion(existing.id, existing.currentVersionId)).then(versions => {
          if (!this._unloaded && ownerStorage.isCurrent(owner) && typeof ownerStorage.set === 'function') {
            const current = (versions.data || []).find(item => Number(item.id) === Number(existing.currentVersionId)) || (versions.data || [])[0];
            if (current && current.content) ownerStorage.set('onlineResume', '', current.content);
          }
          return null;
        }).catch(() => null);
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
      importedContent = content;
      this.setData({ attachmentStage: '正在建立可优化版本…' });
      return api.createV4Resume({ name: filename.replace(/\.pdf$/i, '').slice(0, 80) || '我的简历', resumeType: 'general', content });
    }).then(created => {
      if (!created || this._unloaded || !ownerStorage.isCurrent(owner)) return;
      const resume = created.data;
      this.setData({ currentResume: resume, attachmentError: '', attachmentStage: '' });
      if (importedContent && typeof ownerStorage.set === 'function') ownerStorage.set('onlineResume', '', importedContent);
      return this.syncImportedProfile(resume.id);
    });
  },
  syncImportedProfile(resumeId) {
    if (typeof api.syncResumeProfile !== 'function') return Promise.resolve();
    const owner = this._ownerScope;
    this.setData({ attachmentStage: '正在同步学校、学历与求职资料…' });
    return api.syncResumeProfile(resumeId).then(async result => {
      if (this._unloaded || !ownerStorage.isCurrent(owner)) return;
      if (typeof userApi.getUserProfile === 'function' && typeof userApi.persistUserSession === 'function') {
        try {
          const current = await userApi.getUserProfile();
          if (!this._unloaded && ownerStorage.isCurrent(owner) && current && current.code === 0) {
            userApi.persistUserSession(current.data);
            const app = getApp();
            if (app && typeof app.refreshGlobalData === 'function') app.refreshGlobalData();
          }
        } catch (error) { /* The server sync succeeded; profile refresh can retry on next page load. */ }
      }
      const count = (result.data && result.data.importedFields || []).length;
      wx.showToast({ title: count ? `简历已导入，同步 ${count} 项资料` : '简历已导入', icon: 'none' });
    }).catch(err => {
      if (!this._unloaded && ownerStorage.isCurrent(owner)) {
        this.setData({ attachmentError: `在线简历已生成，资料同步失败：${err.message || '请稍后重试'}` });
      }
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
    if (this._optimizingResume) {
      wx.showToast({ title: '正在生成建议，请稍候', icon: 'none' });
      return;
    }
    const item = this.data.resumes.find(row => String(row.id) === String(e.currentTarget.dataset.id));
    if (item) {
      this._reviewRequestGeneration = (this._reviewRequestGeneration || 0) + 1;
      this.setData({ currentResume: item, proposal: null, showReview: false,
        reviewLoading: false, reviewScore: null, reviewError: '' });
    }
  },

  resumeActions(e) {
    const id = e.currentTarget.dataset.id;
    const resume = this.data.resumes.find(item => String(item.id) === String(id));
    if (!resume) return;
    wx.showActionSheet({
      itemList: ['重命名', '设为默认', '删除简历'],
      success: result => {
        if (result.tapIndex === 0) this.renameResume(resume);
        if (result.tapIndex === 1) api.setDefaultV4Resume(id).then(() => this.refresh())
          .catch(err => wx.showToast({ title: err.message || '设置失败', icon: 'none' }));
        if (result.tapIndex === 2) this.deleteResume(resume);
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

  deleteResume(resume) {
    wx.showModal({ title: '删除简历', content: `删除「${resume.name}」？在线简历会从列表移除，原 PDF 和已产生的投递记录仍会保留。`, confirmText: '删除', confirmColor: '#d92d20',
      success: result => {
        if (!result.confirm || this._deletingResume) return;
        this._deletingResume = true;
        const owner = this._ownerScope;
        api.archiveV4Resume(resume.id).then(() => {
          if (this._unloaded || !ownerStorage.isCurrent(owner)) return;
          if (this.data.currentResume && String(this.data.currentResume.id) === String(resume.id)) {
            this.setData({ currentResume: null, proposal: null });
          }
          wx.showToast({ title: '已删除在线简历', icon: 'success' });
          return this.refresh();
        }).catch(err => {
          if (!this._unloaded && ownerStorage.isCurrent(owner)) wx.showToast({ title: err.message || '删除失败', icon: 'none' });
        }).finally(() => { this._deletingResume = false; });
      }
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

  optimizeResume() {
    if (!this.data.currentResume) return wx.showToast({ title: '请先选择简历', icon: 'none' });
    if (!this.data.currentResume.currentVersionId) return this.initializeResumeVersion();
    if (this.data.loading || this._proposalMutationBusy || this._optimizingResume) return;
    this._optimizingResume = true;
    const owner = ownerStorage.capture();
    const requestGeneration = this._proposalRequestGeneration = (this._proposalRequestGeneration || 0) + 1;
    const selectedResumeId = this.data.currentResume.id;
    const startedAt = Date.now();
    this.setData({ loading: true, optimizing: true, optimizingResumeId: selectedResumeId, optimizationError: '', optimizationDiagnostic: '', attachmentError: '' });
    const context = this.data.optimizationContext || {};
    let deadlineTimer = null;
    const deadline = new Promise((_, reject) => {
      if (typeof setTimeout !== 'function') return;
      deadlineTimer = setTimeout(() => {
        const error = new Error('生成建议超时，请稍后重试');
        error.code = 'REQUEST_TIMEOUT';
        reject(error);
      }, 60000);
    });
    const request = Promise.resolve().then(() => api.createResumeChangeSet(selectedResumeId, {
      jobId: context.jobId || '',
      applicationId: context.applicationId || null,
      jdText: context.jdText || ''
    }));
    return Promise.race([request, deadline]).then(res => {
      if (this._unloaded || requestGeneration !== this._proposalRequestGeneration || !ownerStorage.isCurrent(owner)
        || !this.data.currentResume || String(this.data.currentResume.id) !== String(selectedResumeId)) return;
      const proposal = res.data;
      const generationMeta = proposal.generation || {};
      proposal.isFallback = generationMeta.degraded === true;
      if (proposal.isFallback) {
        const reason = generationMeta.fallbackReason || generationMeta.errorCode || 'unknown';
        const message = reason === 'feature_disabled' || reason === 'provider_not_configured'
          ? 'AI 模型尚未启用，暂时无法生成优化意见。'
          : reason === 'ai_schema_invalid'
            ? 'AI 未能依据当前在线简历生成可靠建议。请先检查并补充工作或项目经历。'
            : 'AI 模型暂时没有返回可靠建议，请稍后重试。';
        const diagnostic = appConfig.MINI_PROGRAM_ENV_VERSION === 'develop'
          ? `调试信息：${reason}，调用 ${generationMeta.attempts || 0} 次` : '';
        this.setData({ loading: false, optimizing: false, optimizingResumeId: null,
          optimizationError: message, optimizationDiagnostic: diagnostic });
        if (!this.data.showReview && typeof wx.showModal === 'function') wx.showModal({ title: 'AI 优化暂不可用',
          content: diagnostic ? `${message}\n${diagnostic}` : message,
          showCancel: false, confirmText: '知道了' });
        return;
      }
      proposal.suggestionLabel = 'AI 建议';
      const decisions = {};
      (proposal.suggestions || []).forEach(item => { decisions[item.id] = 'reject'; });
      this.setData({ proposal, decisions, loading: false, optimizing: false, optimizingResumeId: null });
    }).catch(err => {
      if (this._unloaded || requestGeneration !== this._proposalRequestGeneration || !ownerStorage.isCurrent(owner)) return;
      const isTimeout = /超时|timeout/i.test(String(err && err.message || ''));
      const rawDetail = String(err && err.detail || '');
      const isNetworkFailure = err && err.code === 'NETWORK_ERROR' && !isTimeout;
      let message = (err && err.message) || '生成失败，请补充简历内容后重试。';
      if (isTimeout) message = '生成建议超时，请稍后重试。原简历没有被修改。';
      else if (isNetworkFailure && /domain|合法域名/i.test(rawDetail)) {
        message = '小程序无法请求当前接口域名，请联系管理员检查 request 合法域名配置。';
      } else if (isNetworkFailure && /ssl|tls|cert|证书/i.test(rawDetail)) {
        message = '安全连接建立失败，请联系管理员检查接口证书。';
      } else if (isNetworkFailure) {
        message = '简历优化请求的连接中断了，请稍后重试。原简历没有被修改。';
      }
      const safeDetail = rawDetail.replace(/(Bearer\s+)\S+/ig, '$1[hidden]')
        .replace(/([?&](?:token|key|auth)=)[^&\s]+/ig, '$1[hidden]').slice(0, 120);
      const diagnostic = appConfig.MINI_PROGRAM_ENV_VERSION === 'develop' && (isNetworkFailure || isTimeout)
        ? `调试信息：${err.code || 'TIMEOUT'}，${Math.round((Date.now() - startedAt) / 1000)} 秒，${isTimeout ? '等待接口响应超时' : (safeDetail || 'wx.request fail')}` : '';
      this.setData({ loading: false, optimizing: false, optimizingResumeId: null, optimizationError: message, optimizationDiagnostic: diagnostic });
      if (this.data.showReview) return;
      if (typeof wx.showModal === 'function') {
        wx.showModal({ title: '优化未完成', content: diagnostic ? `${message}\n${diagnostic}` : message, showCancel: false, confirmText: '知道了' });
      } else {
        wx.showToast({ title: '优化未完成，请查看提示', icon: 'none' });
      }
    }).finally(() => {
      if (deadlineTimer !== null && typeof clearTimeout === 'function') clearTimeout(deadlineTimer);
      if (requestGeneration === this._proposalRequestGeneration) this._optimizingResume = false;
      if (!this._unloaded && requestGeneration === this._proposalRequestGeneration && this.data.optimizing) {
        this.setData({ loading: false, optimizing: false, optimizingResumeId: null });
      }
    });
  },

  toggleSuggestion(e) {
    const id = e.currentTarget.dataset.id;
    const next = this.data.decisions[id] === 'accept' ? 'reject' : 'accept';
    this.setData({ ['decisions.' + id]: next });
  },

  openResumeEditor() {
    const resume = this.data.currentResume;
    if (!resume || !resume.currentVersionId) return wx.showToast({ title: '请先建立在线简历版本', icon: 'none' });
    const owner = ownerStorage.capture();
    const requestId = this._resumeEditorRequestId = (this._resumeEditorRequestId || 0) + 1;
    this.setData({ showResumeEditor: true, resumeEditorLoading: true, resumeEditorError: '' });
    return api.getCurrentResumeVersion(resume.id, resume.currentVersionId).then(result => {
      if (this._unloaded || requestId !== this._resumeEditorRequestId || !ownerStorage.isCurrent(owner)) return;
      const version = (result.data || []).find(item => Number(item.id) === Number(resume.currentVersionId));
      if (!version || !version.content) throw new Error('当前在线简历读取失败，请刷新后重试');
      const content = JSON.parse(JSON.stringify(version.content));
      this._resumeEditorSource = { owner, resumeId: resume.id, versionId: version.id, content };
      const preference = content.jobPreference || {};
      this.setData({ resumeEditorLoading: false, resumeEditor: {
        summary: String(content.summary || ''),
        skillsText: (Array.isArray(content.skills) ? content.skills : []).join('、'),
        targetRolesText: (Array.isArray(preference.targetRoles) ? preference.targetRoles : []).join('、'),
        targetCitiesText: (Array.isArray(preference.targetCities) ? preference.targetCities : []).join('、'),
        workExp: (Array.isArray(content.workExp) ? content.workExp : []).map((item, index) => Object.assign({ id: `work-${index}` }, item)),
        education: (Array.isArray(content.education) ? content.education : []).map((item, index) => Object.assign({ id: `education-${index}` }, item)),
        projects: (Array.isArray(content.projects) ? content.projects : []).map((item, index) => Object.assign({ id: `project-${index}` }, item))
      } });
    }).catch(error => {
      if (!this._unloaded && requestId === this._resumeEditorRequestId && ownerStorage.isCurrent(owner)) {
        this.setData({ resumeEditorLoading: false, resumeEditorError: error.message || '读取失败' });
      }
    });
  },
  closeResumeEditor() {
    if (this.data.resumeEditorSaving) return;
    this._resumeEditorRequestId = (this._resumeEditorRequestId || 0) + 1;
    this._resumeEditorSource = null;
    this.setData({ showResumeEditor: false, resumeEditorLoading: false, resumeEditorError: '' });
  },
  onResumeEditorInput(e) {
    const field = e.currentTarget.dataset.field;
    if (!['summary', 'skillsText', 'targetRolesText', 'targetCitiesText'].includes(field)) return;
    this.setData({ [`resumeEditor.${field}`]: e.detail.value });
  },
  onResumeEditorItemInput(e) {
    const { section, field } = e.currentTarget.dataset;
    const index = Number(e.currentTarget.dataset.index);
    const fields = { workExp: ['company', 'role', 'time', 'desc'],
      education: ['school', 'degree', 'major', 'time'], projects: ['name', 'role', 'time', 'desc'] };
    if (!fields[section] || !fields[section].includes(field) || !Number.isInteger(index)
      || index < 0 || index >= this.data.resumeEditor[section].length) return;
    this.setData({ [`resumeEditor.${section}[${index}].${field}`]: e.detail.value });
  },
  addResumeEditorItem(e) {
    const section = e.currentTarget.dataset.section;
    const blank = { workExp: { company: '', role: '', time: '', desc: '' },
      education: { school: '', degree: '', major: '', time: '' },
      projects: { name: '', role: '', time: '', desc: '' } }[section];
    if (!blank || this.data.resumeEditor[section].length >= 12) return;
    blank.id = Date.now() + this.data.resumeEditor[section].length;
    this.setData({ [`resumeEditor.${section}`]: this.data.resumeEditor[section].concat([blank]) });
  },
  removeResumeEditorItem(e) {
    const section = e.currentTarget.dataset.section;
    const index = Number(e.currentTarget.dataset.index);
    if (!['workExp', 'education', 'projects'].includes(section) || !Number.isInteger(index)) return;
    this.setData({ [`resumeEditor.${section}`]: this.data.resumeEditor[section].filter((_, position) => position !== index) });
  },
  saveResumeEditor() {
    const source = this._resumeEditorSource;
    if (!source || this.data.resumeEditorLoading || this.data.resumeEditorSaving) return;
    if (!ownerStorage.isCurrent(source.owner) || !this.data.currentResume
      || Number(this.data.currentResume.id) !== Number(source.resumeId)) return this.closeResumeEditor();
    const editor = this.data.resumeEditor;
    const text = value => String(value || '').trim();
    const list = value => [...new Set(text(value).split(/[,，、;；\n]+/).map(text).filter(Boolean))].slice(0, 20);
    const entries = (items, fields) => items.map(item => Object.assign({}, item,
      fields.reduce((values, field) => { values[field] = text(item[field]); return values; }, {})))
      .filter(item => fields.some(field => item[field]));
    const content = Object.assign({}, source.content, {
      summary: text(editor.summary), skills: list(editor.skillsText),
      workExp: entries(editor.workExp, ['company', 'role', 'time', 'desc']),
      education: entries(editor.education, ['school', 'degree', 'major', 'time']),
      projects: entries(editor.projects, ['name', 'role', 'time', 'desc']),
      jobPreference: Object.assign({}, source.content.jobPreference || {}, {
        targetRoles: list(editor.targetRolesText), targetCities: list(editor.targetCitiesText)
      })
    });
    this.setData({ resumeEditorSaving: true, resumeEditorError: '' });
    return api.createResumeVersion(source.resumeId, { expectedVersionId: source.versionId, content }).then(() => {
      if (this._unloaded || !ownerStorage.isCurrent(source.owner)) return;
      this._resumeEditorSource = null;
      this.setData({ showResumeEditor: false, resumeEditorSaving: false });
      wx.showToast({ title: '在线简历已保存', icon: 'success' });
      return this.refresh();
    }).catch(error => {
      if (!this._unloaded && ownerStorage.isCurrent(source.owner)) {
        this.setData({ resumeEditorSaving: false, resumeEditorError: error.message || '保存失败，请重试' });
      }
    });
  },

  confirmSuggestions() {
    if (!this.data.proposal || this._proposalMutationBusy) return;
    const payload = { decisions: this.data.decisions };
    const owner = ownerStorage.capture();
    const proposalId = this.data.proposal.id;
    this._proposalMutationBusy = true;
    api.confirmResumeChangeSet(proposalId, payload).then(() => {
      if (this._unloaded || !ownerStorage.isCurrent(owner) || !this.data.proposal || String(this.data.proposal.id) !== String(proposalId)) return;
      wx.showToast({ title: '已保存新版本', icon: 'success' });
      if (this.data.optimizationContext) ownerStorage.remove('pendingResumeOptimization');
      this.setData({ proposal: null, showReview: false, reviewScore: null, optimizationContext: null });
      this.refresh();
    }).catch(err => { if (!this._unloaded && ownerStorage.isCurrent(owner)) wx.showToast({ title: err.message || '保存失败', icon: 'none' }); })
      .finally(() => { this._proposalMutationBusy = false; });
  },

  rejectSuggestions() {
    if (!this.data.proposal || this._proposalMutationBusy) return;
    const owner=ownerStorage.capture(); const proposalId=this.data.proposal.id; this._proposalMutationBusy=true;
    api.rejectResumeChangeSet(proposalId, { decisions: this.data.decisions }).then(() => {
      if (!this._unloaded && ownerStorage.isCurrent(owner) && this.data.proposal && String(this.data.proposal.id)===String(proposalId)) this.setData({ proposal: null, showReview: false, reviewScore: null });
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
