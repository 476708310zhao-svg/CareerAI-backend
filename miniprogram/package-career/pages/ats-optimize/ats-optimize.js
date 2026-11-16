// pages/ats-optimize/ats-optimize.js
const { analyzeAts }        = require('../../utils/api-ats.js');
const resumeApi           = require('../../../utils/api-v4.js');
const ownerStorage        = require('../../../utils/owner-storage.js');

const PRIORITY_MAP = { high: '高', medium: '中', low: '低' };
const PRIORITY_COLOR = { high: '#dc2626', medium: '#d97706', low: '#16a34a' };
const SECTION_LABEL  = { summary: '个人简介', workExp: '工作经历', skills: '技能', projects: '项目经历', education: '教育背景' };

function toAtsResume(content) {
  const text = value => typeof value === 'string' ? value : '';
  const entries = value => Array.isArray(value) ? value : [];
  const experience = entries(content.workExp).length ? content.workExp : entries(content.experience);
  const skills = Array.isArray(content.skills) ? content.skills : text(content.skills).split(/[,，、;；\n]/);
  return {
    basicInfo: {},
    summary: text(content.summary),
    skills: skills.map(item => typeof item === 'string' ? item : text(item && (item.name || item.title))).filter(Boolean),
    workExp: entries(experience).map(item => ({
      company: text(item && (item.company || item.organization)),
      role: text(item && (item.role || item.title)),
      desc: text(item && (item.desc || item.description || item.summary))
    })),
    education: entries(content.education).map(item => ({
      school: text(item && item.school), degree: text(item && item.degree), major: text(item && item.major)
    })),
    projects: entries(content.projects).map(item => ({
      name: text(item && (item.name || item.title)),
      desc: text(item && (item.desc || item.description))
    }))
  };
}

Page({
  data: {
    // 步骤控制
    step: 1,   // 1=输入 JD, 2=分析中, 3=结果

    // 输入
    jobTitle:       '',
    jobDescription: '',
    jdLen:          0,

    // 简历来源
    serverResumes:  [],
    resumesLoading: false,
    resumeLoadError: '',
    selectedResumeId: null,
    selectedResumeName: '',
    resumeData:     null,

    // 结果
    result: null,

    // 展开控制
    expandSuggestions: true,
    expandKeywords:    true,
    expandRewrites:    true,
    expandFormat:      true,
  },

  onLoad(options) {
    this._ownerScope = ownerStorage.capture();
    this._unloaded = false;
    this._loadPendingJd();
    this._requestedResumeId = Number(options && options.resumeId) || null;
    this._loadServerResumes();
  },
  onShow() {
    if (!this._ownerScope || ownerStorage.isCurrent(this._ownerScope)) return;
    this._ownerScope = ownerStorage.capture();
    this._resumeRequestGeneration = (this._resumeRequestGeneration || 0) + 1;
    this._analysisGeneration = (this._analysisGeneration || 0) + 1;
    this.setData({ serverResumes: [], selectedResumeId: null, selectedResumeName: '',
      resumeData: null, resumeLoadError: '', result: null, step: 1 });
    this._loadServerResumes();
  },
  onUnload() {
    this._unloaded = true;
    this._resumeListGeneration = (this._resumeListGeneration || 0) + 1;
    this._resumeRequestGeneration = (this._resumeRequestGeneration || 0) + 1;
    this._analysisGeneration = (this._analysisGeneration || 0) + 1;
  },

  _loadPendingJd() {
    try {
      const pending = wx.getStorageSync('pendingAtsJob') || {};
      if (!pending.jobDescription) return;
      this.setData({
        jobTitle: pending.jobTitle || '',
        jobDescription: pending.jobDescription || '',
        jdLen: String(pending.jobDescription || '').length
      });
    } catch (e) {}
  },

  // 输入处理
  onJdInput(e) {
    const v = e.detail.value || '';
    this.setData({ jobDescription: v, jdLen: v.length });
  },
  onTitleInput(e) {
    this.setData({ jobTitle: e.detail.value || '' });
  },

  // 简历加载
  async _loadServerResumes() {
    const owner = this._ownerScope;
    const generation = this._resumeListGeneration = (this._resumeListGeneration || 0) + 1;
    this._resumeRequestGeneration = (this._resumeRequestGeneration || 0) + 1;
    this.setData({ resumesLoading: true, resumeLoadError: '', resumeData: null });
    try {
      const res = await resumeApi.getV4Resumes();
      if (this._unloaded || generation !== this._resumeListGeneration) return;
      if (!ownerStorage.isCurrent(owner)) {
        this.setData({ serverResumes: [], selectedResumeId: null, selectedResumeName: '',
          resumeData: null, resumesLoading: false });
        return;
      }
      if (!res || res.code !== 0 || !Array.isArray(res.data)) throw new Error('在线简历读取失败，请检查网络后重试');
      const resumes = res.data.filter(item => !item.archived);
      this.setData({ serverResumes: resumes, resumesLoading: false });
      const selected = resumes.find(item => Number(item.id) === Number(this._requestedResumeId))
        || resumes.find(item => Number(item.id) === Number(this.data.selectedResumeId))
        || resumes.find(item => item.isDefault) || resumes[0];
      if (selected) await this._loadResumeById(selected.id);
      else this.setData({ selectedResumeId: null, selectedResumeName: '', resumeData: null });
    } catch (error) {
      if (!this._unloaded && generation === this._resumeListGeneration && ownerStorage.isCurrent(owner)) {
        this.setData({ serverResumes: [], resumeData: null, resumesLoading: false,
          resumeLoadError: error.message || '在线简历读取失败，请重试' });
      }
    }
  },

  async _loadResumeById(id) {
    const owner = this._ownerScope;
    const generation = this._resumeRequestGeneration = (this._resumeRequestGeneration || 0) + 1;
    this.setData({ resumeData: null, resumesLoading: true, resumeLoadError: '' });
    try {
      const selected = this.data.serverResumes.find(item => Number(item.id) === Number(id));
      if (!selected) throw new Error('选中的在线简历已不存在，请重新选择');
      const res = await resumeApi.getCurrentResumeVersion(id, selected.currentVersionId);
      if (this._unloaded || generation !== this._resumeRequestGeneration) return;
      if (!ownerStorage.isCurrent(owner)) {
        this.setData({ serverResumes: [], selectedResumeId: null, selectedResumeName: '',
          resumeData: null, resumesLoading: false });
        return;
      }
      if (!res || res.code !== 0 || !Array.isArray(res.data)) throw new Error('简历内容读取失败，请重试');
      const version = res.data.find(item => Number(item.id) === Number(selected.currentVersionId)) || res.data[0];
      const content = version && version.content;
      if (!content || !String(content.summary || '').trim()
        && !['workExp', 'experience', 'projects', 'skills', 'education'].some(key => Array.isArray(content[key]) && content[key].length)) {
        throw new Error('这份在线简历还没有可评分的内容，请先导入文字版 PDF 或完善简历');
      }
      this.setData({ selectedResumeId: selected.id, selectedResumeName: selected.name || '我的简历',
        resumeData: content, resumesLoading: false });
    } catch (error) {
      if (!this._unloaded && generation === this._resumeRequestGeneration && ownerStorage.isCurrent(owner)) {
        this.setData({ resumeData: null, resumesLoading: false,
          resumeLoadError: error.message || '简历内容读取失败，请重试' });
      }
    }
  },

  onSelectResume(e) {
    const id = parseInt(e.currentTarget.dataset.id);
    if (this.data.selectedResumeId === id) return;
    this.setData({ selectedResumeId: id, resumeData: null });
    this._loadResumeById(id);
  },
  retryLoadResumes() { return this._loadServerResumes(); },

  // 开始分析
  async startAnalyze() {
    if (this._unloaded || !ownerStorage.isCurrent(this._ownerScope)) return;
    const { jobDescription, resumeData, jobTitle } = this.data;
    if (!jobDescription || jobDescription.trim().length < 20) {
      wx.showToast({ title: '请粘贴完整的岗位描述', icon: 'none' });
      return;
    }
    if (!resumeData) {
      wx.showToast({ title: this.data.resumesLoading ? '正在读取简历，请稍候' :
        (this.data.resumeLoadError || '请先选择或完善简历'), icon: 'none' });
      return;
    }

    const owner = this._ownerScope;
    const generation = this._analysisGeneration = (this._analysisGeneration || 0) + 1;
    this.setData({ step: 2 });

    try {
      const res = await analyzeAts({ resumeData: toAtsResume(resumeData), jobDescription, jobTitle });
      if (this._unloaded || generation !== this._analysisGeneration || !ownerStorage.isCurrent(owner)) return;
      if (!res || res.code !== 0) {
        throw new Error(res && res.message ? res.message : '分析失败');
      }

      const d = res.data;
      const result = {
        atsScore:     d.ats_score || 0,
        jdMatch:      d.jd_match  || 0,
        overallAdvice: d.overall_advice || '',
        matchedKeywords: (d.matched_keywords || []),
        missingKeywords: (d.missing_keywords || []).map(k => ({
          ...k,
          priorityLabel: PRIORITY_MAP[k.priority] || '中',
          priorityColor: PRIORITY_COLOR[k.priority] || '#d97706',
        })),
        sectionSuggestions: (d.section_suggestions || []).map(s => ({
          ...s,
          sectionLabel:  SECTION_LABEL[s.section] || s.section,
          priorityLabel: PRIORITY_MAP[s.priority] || '中',
          priorityColor: PRIORITY_COLOR[s.priority] || '#d97706',
        })),
        bulletRewrites: (d.bullet_rewrites || []),
        formatIssues:   (d.format_issues || []),
        scoreColor:     d.ats_score >= 75 ? '#16a34a' : d.ats_score >= 50 ? '#d97706' : '#dc2626',
        scoreLabel:     d.ats_score >= 75 ? '优秀' : d.ats_score >= 50 ? '待优化' : '需改进',
      };

      this.setData({ result, step: 3 });
    } catch (err) {
      if (this._unloaded || generation !== this._analysisGeneration || !ownerStorage.isCurrent(owner)) return;
      const msg = err.message || '分析失败，请重试';
      wx.showModal({
        title: '分析失败',
        content: msg === 'unauthorized' ? '登录已过期，请重新登录后重试' : msg.slice(0, 180),
        showCancel: false,
      });
      this.setData({ step: 1 });
    }
  },

  goBack() {
    this.setData({ step: 1, result: null });
  },

  // 展开/收起
  toggleSection(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [key]: !this.data[key] });
  },

  // 跳转简历页
  goToResume() {
    wx.navigateTo({ url: '/package-career/pages/resume-center/resume-center' });
  },
});
