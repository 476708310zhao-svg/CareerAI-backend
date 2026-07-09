// pages/job-detail/job-detail.js
const { getJobDetail, post, normalizeCompanyLogo } = require('../../../utils/api.js');
const favUtil = require('../../../utils/favorites.js');
const progress = require('../../../utils/job-progress.js');
const jdMatch = require('../../utils/jd-match.js');
const { fromNow, formatSalaryRange } = require('../../../utils/util.js');
const demoData = require('../../../utils/demo-data.js');
const { extractSkillTags } = require('../../utils/skill-icons.js');
const browseHistory = require('../../../utils/browse-history.js');
const featureFlags = require('../../../utils/feature-flags.js');
const navigation = require('../../../utils/navigation.js');
const reminders = require('../../../utils/reminders.js');
const analytics = require('../../../utils/analytics.js');
const ALLOW_DEMO_FALLBACK = demoData.enabled();

Page({
  data: {
    jobId: '',
    job: null,
    loading: true,
    isSaved: false,
    inProgress: false,
    progressStatusText: '',
    showMatchPanel: false,
    matchReport: null,
    // 一键投递弹窗
    showApplyModal: false,
    resumeSnap: null
  },

  onLoad: function(options) {
    if (!featureFlags.guardRecruitmentPage()) return;
    const jobId = options.id;
    const isSaved = jobId ? favUtil.isFavorited('job', jobId) : false;
    this.setData({ jobId, isSaved });
    analytics.track('job_detail_click', { jobId: jobId || '' });
    this.refreshProgressState(jobId);
    if (jobId && wx.getStorageSync('token')) {
      favUtil.syncFromServer().then(() => {
        this.setData({ isSaved: favUtil.isFavorited('job', jobId) });
      });
    }
    if (jobId) {
      this.fetchJobDetail(jobId);
    } else {
      this.setData({ loading: false });
      wx.showToast({ title: '职位信息不存在', icon: 'none' });
    }
  },

  getCompanyInitial: function(companyName) {
    const name = String(companyName || 'C').trim();
    return name ? name.slice(0, 1).toUpperCase() : 'C';
  },

  buildCompanyLogo: function(companyName) {
    if (!companyName) return '';
    return normalizeCompanyLogo(`/api/logo?name=${encodeURIComponent(companyName)}`);
  },

  getJobSnapshot: function(id) {
    const stored = wx.getStorageSync('jobDetailSnapshot_' + String(id));
    if (stored && String(stored.id) === String(id)) return stored;
    const temp = wx.getStorageSync('tempJobDetail');
    return temp && String(temp.id) === String(id) ? temp : null;
  },

  buildSnapshotDetail: function(snapshot) {
    if (!snapshot) return null;
    const desc = snapshot.description || '';
    return {
      id: snapshot.id,
      title: snapshot.title,
      company: snapshot.company,
      logo: snapshot.logo || this.buildCompanyLogo(snapshot.company),
      logoFailed: !!snapshot.logoFailed,
      companyInitial: snapshot.companyInitial || this.getCompanyInitial(snapshot.company),
      city: snapshot.city || 'Remote',
      state: snapshot.state,
      type: snapshot.type || 'Full-time',
      postedAt: snapshot.postedAt || 'Recently posted',
      applyLink: snapshot.applyLink || '',
      description: this.formatDescription(desc) || '暂无职位详情，请通过原始招聘链接查看完整 JD。',
      salary: snapshot.salary || 'Negotiable',
      visaSponsored: !!snapshot.optFriendly,
      skillTags: extractSkillTags(desc || `${snapshot.title || ''} ${snapshot.company || ''}`)
    };
  },

  useFallbackDetail: function(id, snapshotDetail) {
    if (snapshotDetail) {
      this.setData({ job: snapshotDetail, loading: false });
      this.refreshProgressState(snapshotDetail.id);
      this._saveBrowseHistory(snapshotDetail);
      return;
    }
    if (ALLOW_DEMO_FALLBACK) {
      this.loadMockDetail(id);
      return;
    }
    this.setData({ job: null, loading: false });
    wx.showToast({ title: '职位信息暂不可用', icon: 'none' });
  },

  fetchJobDetail: function(id) {
    this.setData({ loading: true });
    const snapshot = this.getJobSnapshot(id);
    const snapshotDetail = this.buildSnapshotDetail(snapshot);

    // 模拟数据判断
    if (String(id).startsWith('mock') || String(id).startsWith('default')) {
      if (ALLOW_DEMO_FALLBACK) {
        this.loadMockDetail(id);
      } else {
        this.setData({ job: null, loading: false });
        wx.showToast({ title: '职位信息暂不可用', icon: 'none' });
      }
      return;
    }

    if (snapshotDetail) {
      this.setData({ job: snapshotDetail, loading: false });
    }

    getJobDetail(id).then(res => {
      const rawData = Array.isArray(res.data) ? res.data[0] : (res.data && res.data.job_id ? res.data : null);
      if (!rawData) {
        this.useFallbackDetail(id, snapshotDetail);
        return;
      }

      const desc = (rawData.job_description || '') + ' ' + (rawData.job_highlights ? JSON.stringify(rawData.job_highlights) : '');
      const visaSponsored = /\b(opt|cpt|h[- ]?1b|visa\s+sponsor|will\s+sponsor|work\s+authori)/i.test(desc);

      const jobDetail = {
        id: rawData.job_id,
        title: rawData.job_title,
        company: rawData.employer_name,
        logo: (snapshot && snapshot.logo) || (rawData.employer_logo ? normalizeCompanyLogo(rawData.employer_logo) : this.buildCompanyLogo(rawData.employer_name)),
        logoFailed: !!(snapshot && snapshot.logoFailed),
        companyInitial: (snapshot && snapshot.companyInitial) || this.getCompanyInitial(rawData.employer_name),
        city: rawData.job_city || 'Remote',
        state: rawData.job_state,
        type: rawData.job_employment_type || 'Full-time',
        postedAt: rawData.job_posted_at_datetime_utc ? fromNow(rawData.job_posted_at_datetime_utc) : 'Recently posted',
        applyLink: rawData.job_apply_link,
        description: this.formatDescription(rawData.job_description),
        salary: formatSalaryRange(rawData.job_min_salary, rawData.job_max_salary) || (snapshot && snapshot.salary) || 'Negotiable',
        visaSponsored,
        skillTags: extractSkillTags(desc)
      };

      this.setData({ job: jobDetail, loading: false });
      this.refreshProgressState(jobDetail.id);
      this._saveBrowseHistory(jobDetail);
    }).catch(err => {
      console.warn('[job-detail] detail request failed, using fallback:', err && (err.message || err.errMsg || err));
      this.useFallbackDetail(id, snapshotDetail);
    });
  },

  _saveBrowseHistory: function(job) {
    try {
      browseHistory.add({
        id: job.id,
        title: job.title,
        company: job.company,
        city: job.city,
        salary: job.salary
      });
    } catch (e) {}
  },

  // ✅ 文本格式化优化
  formatDescription: function(desc) {
    if (!desc) return '';
    // 1. 给常见的小标题加双换行，增加留白
    let formatted = desc.replace(/(Responsibilities|Requirements|Qualifications|What you will do|About the role):/gi, '\n\n$1:\n');
    // 2. 仅替换行首的 • 或 - 列表符号，避免破坏连字符单词（如 Full-time、Node.js）
    formatted = formatted.replace(/^[ \t]*[•\-][ \t]*/gm, ' • ');
    return formatted.trim();
  },

  // 模拟数据
  loadMockDetail: function(id) {
    if (!ALLOW_DEMO_FALLBACK) {
      this.setData({ job: null, loading: false });
      return;
    }
    const mockJob = {
      id: id,
      title: 'Senior Full Stack Engineer',
      company: 'TechFlow Solutions',
      logo: this.buildCompanyLogo('TechFlow Solutions'),
      logoFailed: false,
      companyInitial: this.getCompanyInitial('TechFlow Solutions'),
      city: 'San Francisco',
      state: 'CA',
      type: 'Full-time',
      postedAt: 'Posted 3 days ago',
      salary: '$140k - $180k',
      applyLink: 'https://google.com',
      description: `We are seeking a talented Senior Full Stack Engineer to join our core product team.

Responsibilities:
• Design and build scalable RESTful APIs using Node.js.
• Develop responsive front-end interfaces using React and Tailwind CSS.
• Collaborate with product managers and designers to deliver high-quality features.
• Mentor junior developers and conduct code reviews.

Requirements:
• 5+ years of experience in software development.
• Strong proficiency in JavaScript/TypeScript, React, and Node.js.
• Experience with cloud platforms (AWS/GCP).
• Excellent problem-solving skills.`
    };
    this.setData({ job: mockJob, loading: false });
    this.refreshProgressState(mockJob.id);
    this._saveBrowseHistory(mockJob);
  },

  // --- 交互功能 ---

  goBack: function() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
    } else {
      wx.switchTab({ url: '/pages/jobs/jobs' });
    }
  },

  // 收藏切换
  toggleSave: function() {
    if (!this.data.job) return;
    const jobData = {
      targetId: String(this.data.job.id),
      title: this.data.job.title,
      company: this.data.job.company,
      logo: this.data.job.logo,
      city: this.data.job.city,
      salary: this.data.job.salary,
      type: this.data.job.type
    };
    const isSaved = favUtil.toggle('job', jobData);
    this.setData({ isSaved });
    analytics.track(isSaved ? 'favorite_job' : 'unfavorite_job', {
      jobId: jobData.targetId,
      company: jobData.company,
      title: jobData.title
    });
    if (isSaved) {
      const savedProgress = progress.upsertFromJob(this.data.job, { status: 'collected' });
      this.setData({ inProgress: true, progressStatusText: savedProgress.statusText });
      this.promptFavoriteReminder();
    }
    wx.showToast({
      title: isSaved ? '已收藏' : '已取消收藏',
      icon: 'none'
    });
  },

  refreshProgressState: function(jobId) {
    const record = progress.getByJobId(jobId || this.data.jobId);
    this.setData({
      inProgress: !!record,
      progressStatusText: record ? record.statusText : ''
    });
  },

  promptFavoriteReminder: function() {
    wx.showModal({
      title: '已加入收藏',
      content: '可以在收藏夹为这个岗位设置截止提醒，截止前 3 天和 1 天优先提醒自己。',
      cancelText: '稍后',
      confirmText: '去设置',
      success: (res) => {
        if (res.confirm) {
          wx.navigateTo({ url: '/package-user/pages/favorites/favorites?tab=job' });
        }
      }
    });
  },

  addToProgress: function() {
    const job = this.data.job;
    if (!job) return;
    const existing = progress.getByJobId(job.id);
    if (existing) {
      this.setData({ inProgress: true, progressStatusText: existing.statusText });
      navigation.safeNavigateTo('/package-user/pages/job-progress/job-progress');
      return;
    }
    const record = progress.upsertFromJob(job, {
      status: 'collected',
      jobLink: job.applyLink || '',
      salary: job.salary || '',
      city: job.city || ''
    });
    analytics.track('job_progress_add_from_detail', {
      jobId: job.id,
      company: job.company,
      title: job.title
    });
    this.setData({ inProgress: true, progressStatusText: record.statusText });
    wx.showModal({
      title: '已加入求职进度',
      content: '后续可以补充截止时间、面试时间和备注。',
      cancelText: '继续看',
      confirmText: '去编辑',
      success: (res) => {
        if (res.confirm) {
          navigation.safeNavigateTo('/package-user/pages/job-progress/job-progress');
        }
      }
    });
  },

  runJdMatch: function() {
    const job = this.data.job;
    if (!job) return;
    const resume = wx.getStorageSync('onlineResume') || {};
    const hasResume = !!(resume.basicInfo && (resume.basicInfo.name || resume.basicInfo.email)) ||
      (resume.skills && resume.skills.length) ||
      (resume.projects && resume.projects.length) ||
      (resume.workExp && resume.workExp.length);
    if (!hasResume) {
      wx.showModal({
        title: '先完善简历',
        content: '匹配评分需要读取你的在线简历。先补充基本信息、技能或项目经历后，报告会更准确。',
        cancelText: '稍后',
        confirmText: '去完善',
        success: (res) => {
          if (res.confirm) wx.navigateTo({ url: '/package-career/pages/resume/resume' });
        }
      });
      return;
    }
    const report = jdMatch.saveReport(jdMatch.buildReport(resume, job));
    analytics.track('jd_match_generate', {
      jobId: job.id,
      company: job.company,
      title: job.title,
      score: report.score
    });
    this.setData({ matchReport: report, showMatchPanel: true });
  },

  closeMatchPanel: function() {
    this.setData({ showMatchPanel: false });
  },

  goResumeOptimize: function() {
    this.closeMatchPanel();
    wx.navigateTo({ url: '/package-career/pages/resume/resume' });
  },

  // 跳转 AI 面试
  startAiInterview: function() {
    if (!this.data.job) return;
    wx.navigateTo({
      url: `/package-ai/pages/interview-dialog/interview-dialog?jobId=${encodeURIComponent(this.data.job.id)}`
    });
  },

  // 打开一键投递弹窗
  applyJob: function() {
    const job = this.data.job;
    if (!job) return;
    const resume = wx.getStorageSync('onlineResume') || {};
    const b = resume.basicInfo || {};
    const snap = {
      name:  b.name  || '',
      title: b.title || '',
      phone: b.phone || '',
      email: b.email || '',
      skills: (resume.skills || []).slice(0, 5).join(' · '),
      hasData: !!(b.name || b.email)
    };
    this.setData({ showApplyModal: true, resumeSnap: snap });
  },

  hideApplyModal: function() {
    this.setData({ showApplyModal: false });
  },

  // 一键投递：复制简历摘要 + 加入看板 + 打开外链
  doOneClickApply: function() {
    const job  = this.data.job;
    const snap = this.data.resumeSnap;
    if (!job) return;

    // 1. 构建简历摘要文本
    const lines = [];
    if (snap.name)  lines.push('姓名：' + snap.name);
    if (snap.title) lines.push('求职意向：' + snap.title);
    if (snap.phone) lines.push('电话：' + snap.phone);
    if (snap.email) lines.push('邮箱：' + snap.email);
    if (snap.skills) lines.push('技能：' + snap.skills);
    const text = lines.length ? lines.join('\n') : '（请先完善简历信息）';

    // 2. 复制到剪贴板
    wx.setClipboardData({
      data: job.applyLink ? ('投递链接：' + job.applyLink + '\n\n' + text) : text
    });

    // 3. 加入投递看板
    this.addToBoard();

    // 4. 关闭弹窗并提示用户到浏览器完成官方投递
    this.hideApplyModal();
    wx.showModal({
      title: job.applyLink ? '投递链接已复制' : '投递记录已保存',
      content: job.applyLink
        ? '岗位已加入投递看板。请在浏览器中粘贴链接，进入官方招聘页完成申请。'
        : '岗位已加入投递看板。当前职位暂无官方投递链接，可在看板中继续跟进。',
      showCancel: false
    });
  },

  // 加入投递看板（同时请求订阅授权 + 同步后端）
  addToBoard: function() {
    const job = this.data.job;
    if (!job) return;
    const jobIdStr = String(job.id);
    progress.upsertFromJob(job, {
      status: 'applied',
      appliedAt: progress.getToday(),
      jobLink: job.applyLink || '',
      salary: job.salary || 'Negotiable',
      city: job.city || ''
    });
    analytics.track('application_save', {
      jobId: jobIdStr,
      company: job.company,
      title: job.title,
      source: 'job_detail'
    });
    this.refreshProgressState(jobIdStr);
    wx.showToast({ title: '已加入投递看板', icon: 'success' });

    // 2. 请求订阅消息授权（模板 ID 由后端配置优先返回）
    reminders.requestSubscribe('application');
  },


  // 跳转求职路线规划器（预填岗位和公司）
  viewCareerPath: function() {
    const job = this.data.job;
    if (!job) return;
    let url = '/package-career/pages/career-planner/career-planner?position=' + encodeURIComponent(job.title)
            + '&company=' + encodeURIComponent(job.company);
    if (job.city && job.city !== 'Remote') {
      url += '&location=' + encodeURIComponent(job.city);
    }
    wx.navigateTo({ url });
  },

  onShareAppMessage: function() {
    return {
      title: `招聘：${this.data.job?.title} - ${this.data.job?.company}`,
      path: `/package-user/pages/job-detail/job-detail?id=${this.data.jobId}`
    };
  },

  onLogoError() {
    this.setData({ 'job.logoFailed': true });
  }
});
