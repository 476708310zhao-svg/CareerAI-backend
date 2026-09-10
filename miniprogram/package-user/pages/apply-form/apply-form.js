// pages/apply-form/apply-form.js
const { getMyPdfs, deletePdf, fetchApplyForm, submitApply, uploadPdf } = require('../../utils/api-apply');
const featureFlags = require('../../../utils/feature-flags.js');

function extractSourceJobId(source, applyUrl) {
  if (!applyUrl) return '';
  if (source === 'greenhouse') {
    const m = applyUrl.match(/\/jobs\/(\d+)/);
    return m ? m[1] : '';
  }
  if (source === 'lever') {
    const m = applyUrl.match(/lever\.co\/[^/]+\/([^/?#]+)/);
    return m ? m[1] : '';
  }
  return '';
}

Page({
  data: {
    source: '', slug: '', jobId: '', title: '', company: '', sourceLabel: '',
    step: 1,

    pdfs: [],
    pdfsLoading: true,
    hasPdfs: false,
    selectedPdfId: '',

    formLoading: true,
    formData: null,
    formError: '',
    formReadyText: '',

    basicInfo: { firstName: '', lastName: '', email: '', phone: '', linkedin: '', website: '' },
    customAnswers: [],
    hasCustomAnswers: false,

    submitting: false,
    submitResult: null,
    resultTitle: '',
    resultSubtitle: '',
  },

  onLoad(query) {
    if (!featureFlags.guardRecruitmentPage()) return;
    const source  = query.source  || '';
    const slug    = query.slug    || '';
    const jobId   = query.jobId   || '';
    const title   = decodeURIComponent(query.title   || '');
    const company = decodeURIComponent(query.company || '');

    this.setData({ source, slug, jobId, title, company, sourceLabel: source === 'greenhouse' ? 'Greenhouse' : 'Lever' });
    wx.setNavigationBarTitle({ title: company ? `申请 · ${company}` : '一键申请' });

    this._loadPdfs();
    if (source && slug && jobId) {
      this._loadForm(source, slug, jobId);
    } else {
      this.setData({ formLoading: false, formError: '缺少职位信息，无法自动填表' });
    }
  },

  _loadPdfs() {
    this.setData({ pdfsLoading: true });
    getMyPdfs().then(res => {
      const pdfs = ((res && res.data) || []).map(item => {
        const sizeKb = item.file_size > 0 ? Math.round(item.file_size / 1024) + ' KB' : '';
        const createdDate = item.created_at ? String(item.created_at).slice(0, 10) : '';
        return Object.assign({}, item, {
          idText: String(item.id),
          displayName: item.original_name || '简历.pdf',
          metaText: [sizeKb, createdDate].filter(Boolean).join('  ')
        });
      });
      this.setData({
        pdfs,
        pdfsLoading: false,
        hasPdfs: pdfs.length > 0,
        selectedPdfId: pdfs.length > 0 ? String(pdfs[0].id) : '',
      });
    }).catch(() => this.setData({ pdfsLoading: false, hasPdfs: false }));
  },

  _loadForm(source, slug, jobId) {
    this.setData({ formLoading: true, formError: '' });
    fetchApplyForm({ source, slug, jobId }).then(res => {
      if (res && res.code === 0) {
        const d = res.data;
        const auto = d.autoFields || {};
        const customAnswers = (d.customRequired || []).flatMap(q =>
          (q.fields || [])
            .filter(f => ['input_text', 'textarea', 'multi_value_single_select'].includes(f.type))
            .map(f => ({
              fieldName: f.name,
              label:     q.label,
              type:      f.type,
              isTextarea: f.type === 'textarea',
              values:    f.values || [],
              value:     '',
              required:  !!q.required,
            }))
        );
        this.setData({
          formData: d,
          formLoading: false,
          basicInfo: {
            firstName: auto.firstName || '',
            lastName:  auto.lastName  || '',
            email:     auto.email     || '',
            phone:     auto.phone     || '',
            linkedin:  auto.linkedin  || '',
            website:   auto.website   || '',
          },
          customAnswers,
          hasCustomAnswers: customAnswers.length > 0,
          formReadyText: customAnswers.length > 0 ? `表单已就绪，有 ${customAnswers.length} 个附加问题需填写` : '表单已就绪，无附加必填项',
        });
      } else {
        const msg = (res && res.message) || '获取表单失败';
        this.setData({ formLoading: false, formError: msg });
        wx.showToast({ title: msg, icon: 'none' });
      }
    }).catch(() => {
      this.setData({ formLoading: false, formError: '网络错误，无法获取表单' });
    });
  },

  // Step 1: PDF 选择
  selectPdf(e) {
    this.setData({ selectedPdfId: String(e.currentTarget.dataset.id) });
  },

  uploadNewPdf() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['pdf'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file) return;
        wx.showLoading({ title: '上传中...', mask: true });
        uploadPdf(file.path).then(() => {
          wx.hideLoading();
          wx.showToast({ title: '上传成功', icon: 'success' });
          this._loadPdfs();
        }).catch(err => {
          wx.hideLoading();
          wx.showToast({ title: err.message || '上传失败', icon: 'error' });
        });
      },
      fail() {},
    });
  },

  deletePdfItem(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除简历',
      content: '确认删除这份 PDF 简历？',
      success: ({ confirm }) => {
        if (!confirm) return;
        deletePdf(id).then(() => {
          wx.showToast({ title: '已删除', icon: 'success' });
          if (this.data.selectedPdfId === String(id)) this.setData({ selectedPdfId: '' });
          this._loadPdfs();
        }).catch(() => wx.showToast({ title: '删除失败', icon: 'error' }));
      },
    });
  },

  goToStep2() {
    if (!this.data.selectedPdfId) {
      wx.showToast({ title: '请先选择一份 PDF 简历', icon: 'none' });
      return;
    }
    if (this.data.formLoading) {
      wx.showToast({ title: '表单加载中，请稍候', icon: 'none' });
      return;
    }
    this.setData({ step: 2 });
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },

  // Step 2: 填写信息
  onBasicInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`basicInfo.${field}`]: e.detail.value });
  },

  onCustomInput(e) {
    const idx     = e.currentTarget.dataset.idx;
    const answers = this.data.customAnswers.slice();
    answers[idx]  = Object.assign({}, answers[idx], { value: e.detail.value });
    this.setData({ customAnswers: answers });
  },

  goBackStep() {
    this.setData({ step: 1 });
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },

  submitApply() {
    const { source, slug, jobId, title, company, selectedPdfId, basicInfo, customAnswers } = this.data;

    if (!basicInfo.email) {
      wx.showToast({ title: '邮箱不能为空', icon: 'none' });
      return;
    }
    const missing = customAnswers.find(a => a.required && !a.value.trim());
    if (missing) {
      wx.showToast({ title: `「${missing.label}」为必填项`, icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    submitApply({
      source, slug, jobId,
      pdfId: selectedPdfId,
      basicInfo,
      customAnswers: customAnswers.map(a => ({ fieldName: a.fieldName, value: a.value })),
      jobSnapshot: { title, company },
    }).then(res => {
      this.setData({
        submitting: false,
        step: 3,
        submitResult: { success: true, message: res.message || '投递成功' },
        resultTitle: '投递成功',
        resultSubtitle: `已投递 ${company}${title ? ' · ' + title : ''}`,
      });
    }).catch(err => {
      const msg = err.message || '投递失败，请稍后重试或手动申请';
      this.setData({
        submitting: false,
        step: 3,
        submitResult: { success: false, message: msg },
        resultTitle: '投递失败',
        resultSubtitle: msg,
      });
    });
  },

  // Step 3: 结果
  retrySubmit() {
    this.setData({ step: 2, submitResult: null });
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },

  goBack() {
    wx.navigateBack();
  },

  goApplications() {
    wx.switchTab({ url: '/pages/applications/applications' });
  },
});
