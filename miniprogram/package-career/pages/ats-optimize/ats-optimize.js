// pages/ats-optimize/ats-optimize.js
const { analyzeAts }        = require('../../../utils/api-ats.js');
const { post, request }     = require('../../../utils/api-client.js');

const PRIORITY_MAP = { high: '高', medium: '中', low: '低' };
const PRIORITY_COLOR = { high: '#dc2626', medium: '#d97706', low: '#16a34a' };
const SECTION_LABEL  = { summary: '个人简介', workExp: '工作经历', skills: '技能', projects: '项目经历', education: '教育背景' };

Page({
  data: {
    // 姝ラ鎺у埗
    step: 1,   // 1=杈撳叆JD, 2=鍒嗘瀽涓? 3=缁撴灉

    // 杈撳叆
    jobTitle:       '',
    jobDescription: '',
    jdLen:          0,

    // 绠€鍘嗘潵婧?    serverResumes:  [],
    selectedResumeId: null,
    selectedResumeName: '',
    resumeData:     null,

    // 缁撴灉
    result: null,

    // 灞曞紑鎺у埗
    expandSuggestions: true,
    expandKeywords:    true,
    expandRewrites:    true,
    expandFormat:      true,
  },

  onLoad(options) {
    // 鏀寔浠庣畝鍘嗛〉鎼哄甫 resumeId 鐩存帴璺冲叆
    if (options.resumeId) {
      this._loadResumeById(parseInt(options.resumeId));
    }
    this._loadServerResumes();
  },

  // 鈹€鈹€ 杈撳叆澶勭悊 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  onJdInput(e) {
    const v = e.detail.value || '';
    this.setData({ jobDescription: v, jdLen: v.length });
  },
  onTitleInput(e) {
    this.setData({ jobTitle: e.detail.value || '' });
  },

  // 鈹€鈹€ 绠€鍘嗗姞杞?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  async _loadServerResumes() {
    try {
      const res = await request({ path: '/api/resumes', params: {}, cacheTTL: 0 });
      if (res && res.code === 0) {
        this.setData({ serverResumes: res.data || [] });
        // 濡傛灉娌℃湁棰勯€夌畝鍘嗕笖鍙湁涓€浠斤紝鑷姩閫変腑
        if (!this.data.selectedResumeId && res.data && res.data.length === 1) {
          this._loadResumeById(res.data[0].id);
        }
      }
    } catch (e) {}
  },

  async _loadResumeById(id) {
    try {
      const res = await request({ path: `/api/resumes/${id}`, params: {}, cacheTTL: 0 });
      if (res && res.code === 0 && res.data) {
        this.setData({
          selectedResumeId:   res.data.id,
          selectedResumeName: res.data.name || '我的简历',
          resumeData:         res.data.data || {},
        });
      }
    } catch (e) {}
  },

  onSelectResume(e) {
    const id = parseInt(e.currentTarget.dataset.id);
    const name = e.currentTarget.dataset.name;
    if (this.data.selectedResumeId === id) return;
    this.setData({ selectedResumeId: id, selectedResumeName: name, resumeData: null });
    this._loadResumeById(id);
  },

  // 鈹€鈹€ 寮€濮嬪垎鏋?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  async startAnalyze() {
    const { jobDescription, resumeData, jobTitle } = this.data;
    if (!jobDescription || jobDescription.trim().length < 20) {
      wx.showToast({ title: '璇风矘璐村畬鏁寸殑宀椾綅鎻忚堪', icon: 'none' });
      return;
    }
    if (!resumeData) {
      wx.showToast({ title: '请先选择或完善简历', icon: 'none' });
      return;
    }

    this.setData({ step: 2 });

    try {
      const res = await analyzeAts({ resumeData, jobDescription, jobTitle });
      if (!res || res.code !== 0) {
        throw new Error(res && res.message ? res.message : '鍒嗘瀽澶辫触');
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
      const msg = err.message || '鍒嗘瀽澶辫触锛岃閲嶈瘯';
      wx.showModal({
        title: '鍒嗘瀽澶辫触',
        content: msg.includes('娆℃暟') ? msg : '缃戠粶寮傚父鎴朅I瓒呮椂锛岃閲嶈瘯',
        showCancel: false,
      });
      this.setData({ step: 1 });
    }
  },

  goBack() {
    this.setData({ step: 1, result: null });
  },

  // 鈹€鈹€ 灞曞紑/鎶樺彔 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  toggleSection(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [key]: !this.data[key] });
  },

  // 鈹€鈹€ 璺宠浆绠€鍘嗛〉 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  goToResume() {
    wx.navigateTo({ url: '/package-career/pages/resume/resume' });
  },
});
