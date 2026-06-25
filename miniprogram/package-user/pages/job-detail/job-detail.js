// pages/job-detail/job-detail.js
const { getJobDetail, post, normalizeCompanyLogo } = require('../../../utils/api.js');
const favUtil = require('../../../utils/favorites.js');
const { fromNow, formatSalaryRange } = require('../../../utils/util.js');
const config = require('../../../utils/app-config.js');
const demoData = require('../../../utils/demo-data.js');
const { extractSkillTags } = require('../../utils/skill-icons.js');
const browseHistory = require('../../../utils/browse-history.js');
const featureFlags = require('../../../utils/feature-flags.js');
const API_BASE = config.API_BASE_URL;
const ALLOW_DEMO_FALLBACK = demoData.enabled();

Page({
  data: {
    jobId: '',
    job: null,
    loading: true,
    isSaved: false,
    // 一键投递弹窗
    showApplyModal: false,
    resumeSnap: null
  },

  onLoad: function(options) {
    if (!featureFlags.guardRecruitmentPage()) return;
    const jobId = options.id;
    const isSaved = jobId ? favUtil.isFavorited('job', jobId) : false;
    this.setData({ jobId, isSaved });
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
    wx.showToast({
      title: isSaved ? '已收藏' : '已取消收藏',
      icon: 'none'
    });
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
    const localApps = wx.getStorageSync('localApplications') || [];
    const jobIdStr = String(job.id);
    if (localApps.some(a => String(a.id) === jobIdStr || a.sourceJobId === jobIdStr)) {
      wx.showToast({ title: '已在投递看板中', icon: 'none' });
      return;
    }

    // 1. 写本地看板
    localApps.unshift({
      id: 'local_' + Date.now(),
      sourceJobId: jobIdStr,
      company: job.company || '',
      job_title: job.title || '',
      city: job.city || '',
      salary: job.salary || 'Negotiable',
      status: 'pending',
      applied_at: new Date().toISOString().slice(0, 10)
    });
    wx.setStorageSync('localApplications', localApps);
    wx.showToast({ title: '已加入投递看板', icon: 'success' });

    // 2. 请求订阅消息授权（模板 ID 未配置时跳过）
    const tmplId = config.WX_TPL_APPLICATION;
    if (!tmplId) return;
    wx.requestSubscribeMessage({
      tmplIds: [tmplId],
      success: (subRes) => {
        if (subRes[tmplId] === 'accept') {
          // 告知后端用户已授权，后端可在状态变更时推送
          const token = wx.getStorageSync('token');
          if (token) {
            wx.request({
              url: API_BASE + '/api/notify/subscribe',
              method: 'POST',
              header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
              data: { templateIds: [tmplId] },
              fail: () => {}
            });
          }
        }
      },
      fail: () => {} // 用户未授权不影响主流程
    });

    // 3. 同步投递记录到后端（有 token 时）
    const token = wx.getStorageSync('token');
    if (token) {
      wx.request({
        url: API_BASE + '/api/applications',
        method: 'POST',
        header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        data: {
          jobId: jobIdStr,
          jobSnapshot: { title: job.title, company: job.company, location: job.city, salary: job.salary }
        },
        fail: () => {}
      });
    }
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
