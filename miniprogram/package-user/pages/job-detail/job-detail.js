// pages/job-detail/job-detail.js
const { getJobDetail, post, normalizeCompanyLogo } = require('../../../utils/api.js');
const v4Api = require('../../../utils/api-v4.js');
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
const { presentJob, clean } = require('../../../utils/job-presenter.js');
const { markCachedDataMeta } = require('../../../utils/data-provenance.js');
const ALLOW_DEMO_FALLBACK = demoData.enabled();

Page({
  data: {
    jobId: '',
    job: null,
    jobView: null,
    loading: true,
    loadError: false,
    isSaved: false,
    isApplied: false,
    isApplying: false,
    inProgress: false,
    progressStatusText: '',
    showMatchPanel: false,
    matchReport: null,
    inlineMatch: null,
    sponsorProfile: null,
    companyProfile: null,
    companyView: null,
    companyExpanded: false,
    similarJobs: [],
    v4Application: null,
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
      this.loadV4Detail(jobId);
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
      city: snapshot.city || '',
      state: snapshot.state,
      type: snapshot.type || '',
      postedAt: snapshot.postedAt || 'Recently posted',
      deadline: snapshot.deadline || '',
      applyLink: snapshot.applyLink || '',
      description: this.formatDescription(desc) || '暂无职位详情，请通过原始招聘链接查看完整 JD。',
      salary: snapshot.salary || 'Negotiable',
      visaSponsored: !!snapshot.optFriendly,
      optFriendly: !!snapshot.optFriendly,
      stemFriendly: !!snapshot.stemFriendly,
      h1bSponsor: !!snapshot.h1bSponsor,
      citizenRequired: !!snapshot.citizenRequired,
      industry: snapshot.industry || '',
      requirements: snapshot.requirements || [],
      tags: snapshot.tags || [],
      graduationYear: snapshot.graduationYear || '',
      recruitmentType: snapshot.recruitmentType || '',
      education: snapshot.education || '',
      remoteType: snapshot.remoteType || '',
      conversionOpportunity: !!snapshot.conversionOpportunity,
      applyCount: Number(snapshot.applyCount || 0),
      matchScore100: Number(snapshot.matchScore100 || 0),
      matchReason: snapshot.matchReason || '',
      postedAtRaw: snapshot.postedAtRaw || '',
      source: 'cache',
      dataMeta: markCachedDataMeta(snapshot.dataMeta, {
        domain: 'job', source: snapshot.source || snapshot._source,
        publishedAt: snapshot.postedAtRaw || snapshot.postedAt
      }),
      skillTags: extractSkillTags(desc || `${snapshot.title || ''} ${snapshot.company || ''}`)
    };
  },

  buildInlineMatch: function(match) {
    if (!match || !Number(match.score)) return null;
    const statusText = match.qualificationStatus === 'eligible'
      ? '资格条件符合，建议优先投递'
      : (match.qualificationStatus === 'partial' ? '部分条件需要投递前核实' : '存在明确资格限制，请谨慎判断');
    return {
      score: Math.round(Number(match.score)),
      statusText,
      strengths: (match.strengths || []).slice(0, 4),
      gaps: (match.gaps || match.missingSkills || []).slice(0, 2),
      actions: (match.actions || []).slice(0, 2)
    };
  },

  buildCompanyView: function(company, job) {
    const source = company || {};
    const current = job || {};
    const name = clean(source.displayName || source.name || current.company);
    if (!name) return null;
    return {
      id: source.id || source.companyId || '',
      name,
      logo: source.logo || source.logoUrl || current.logo || '',
      industry: clean(source.industry || current.industry),
      size: clean(source.size || source.companySize || current.companySize),
      stage: clean(source.financingStage || source.stage),
      location: clean(source.location || source.city || current.city),
      description: clean(source.description || source.summary || current.companyDescription),
      website: clean(source.website || source.officialWebsite),
      canExpand: clean(source.description || source.summary || current.companyDescription).length > 150
    };
  },

  buildSimilarJobs: function(job) {
    const cached = wx.getStorageSync('cachedJobsList');
    const items = Array.isArray(cached) ? cached : (cached && cached.items);
    if (!Array.isArray(items) || !job) return [];
    const currentId = String(job.id || '');
    const titleWords = String(job.title || '').toLowerCase().split(/[^a-z0-9\u4e00-\u9fa5]+/).filter(word => word.length > 2);
    return items
      .filter(item => String(item.id) !== currentId)
      .map(item => {
        let score = 0;
        if (item.type && job.type && String(item.type).toLowerCase() === String(job.type).toLowerCase()) score += 3;
        if (item.city && job.city && String(item.city).toLowerCase() === String(job.city).toLowerCase()) score += 2;
        const candidateTitle = String(item.title || '').toLowerCase();
        if (titleWords.some(word => candidateTitle.includes(word))) score += 4;
        return Object.assign({}, item, {
          _similarScore: score,
          isSaved: favUtil.isFavorited('job', String(item.id)),
          isApplied: !!progress.getByJobId(item.id)
        });
      })
      .filter(item => item._similarScore > 0)
      .sort((a, b) => b._similarScore - a._similarScore)
      .slice(0, 4);
  },

  commitJob: function(job, patch) {
    if (!job) return;
    const record = progress.getByJobId(job.id);
    const application = patch && Object.prototype.hasOwnProperty.call(patch, 'v4Application')
      ? patch.v4Application
      : this.data.v4Application;
    const isApplied = !!(record && record.status !== 'collected') || !!application;
    const displaySource = Object.assign({}, job, {
      isSaved: this.data.isSaved,
      isApplied,
      applyStatus: record ? record.statusText : (application && application.statusText) || ''
    });
    const companyProfile = patch && Object.prototype.hasOwnProperty.call(patch, 'companyProfile')
      ? patch.companyProfile
      : this.data.companyProfile;
    this.setData(Object.assign({
      job,
      jobView: presentJob(displaySource),
      companyView: this.buildCompanyView(companyProfile, job),
      similarJobs: this.buildSimilarJobs(job),
      isApplied,
      inProgress: !!record || !!application,
      progressStatusText: record ? record.statusText : (application && application.statusText) || '',
      loading: false,
      loadError: false
    }, patch || {}));
  },

  useFallbackDetail: function(id, snapshotDetail) {
    if (snapshotDetail) {
      this.commitJob(snapshotDetail);
      this._saveBrowseHistory(snapshotDetail);
      return;
    }
    if (ALLOW_DEMO_FALLBACK) {
      this.loadMockDetail(id);
      return;
    }
    this.setData({ job: null, jobView: null, loading: false, loadError: true });
    wx.showToast({ title: '职位信息暂不可用', icon: 'none' });
  },

  fetchJobDetail: function(id) {
    this.setData({ loading: true, loadError: false });
    const snapshot = this.getJobSnapshot(id);
    const snapshotDetail = this.buildSnapshotDetail(snapshot);

    // 模拟数据判断
    if (String(id).startsWith('mock') || String(id).startsWith('default')) {
      if (ALLOW_DEMO_FALLBACK) {
        this.loadMockDetail(id);
      } else {
        this.setData({ job: null, jobView: null, loading: false, loadError: true });
        wx.showToast({ title: '职位信息暂不可用', icon: 'none' });
      }
      return;
    }

    if (snapshotDetail) {
      this.commitJob(snapshotDetail);
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
        city: rawData.job_city || '',
        state: rawData.job_state,
        type: rawData.job_employment_type || '',
        postedAt: rawData.job_posted_at_datetime_utc ? fromNow(rawData.job_posted_at_datetime_utc) : 'Recently posted',
        deadline: rawData.job_offer_expiration_datetime_utc || rawData.job_offer_expiration_date || rawData.valid_through || '',
        applyLink: rawData.job_apply_link,
        description: rawData.job_description || '',
        salary: formatSalaryRange(rawData.job_min_salary, rawData.job_max_salary) || (snapshot && snapshot.salary) || 'Negotiable',
        visaSponsored,
        remoteType: rawData.job_is_remote ? '支持远程' : '',
        education: rawData.job_required_education && (rawData.job_required_education.postgraduate_degree
          ? '研究生及以上'
          : (rawData.job_required_education.bachelors_degree ? '本科及以上' : '')),
        experience: rawData.job_required_experience && rawData.job_required_experience.required_experience_in_months
          ? `${Math.ceil(rawData.job_required_experience.required_experience_in_months / 12)}年以上`
          : '',
        requirements: rawData.job_highlights && (rawData.job_highlights.Qualifications || rawData.job_highlights.qualifications) || [],
        jobHighlights: rawData.job_highlights || {},
        industry: rawData.employer_company_type || '',
        postedAtRaw: rawData.job_posted_at_datetime_utc || '',
        source: rawData._source || '',
        dataMeta: rawData.dataMeta,
        skillTags: extractSkillTags(desc)
      };

      this.commitJob(jobDetail);
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
    this.commitJob(mockJob);
    this._saveBrowseHistory(mockJob);
  },

  loadV4Detail: function(id) {
    if (!wx.getStorageSync('token')) return;
    v4Api.getJobDetail(id).then(res => {
      const data = res && res.code === 0 ? res.data : null;
      if (!data || !data.job) return;
      const raw = data.job;
      const current = this.data.job || {};
      const description = raw.description || raw.jobDescription || current.description || '';
      const job = {
        ...current,
        id: raw.id || id,
        title: raw.title || current.title,
        company: raw.company || current.company,
        city: raw.location || raw.city || current.city || '',
        type: raw.employmentType || raw.type || current.type || '',
        salary: raw.salary || current.salary || 'Negotiable',
        deadline: raw.deadline || current.deadline || '',
        applyLink: raw.officialApplyUrl || raw.applyUrl || raw.sourceUrl || current.applyLink || '',
        description: description || current.description,
        logo: current.logo || this.buildCompanyLogo(raw.company),
        companyInitial: current.companyInitial || this.getCompanyInitial(raw.company),
        visaSponsored: !!(data.sponsor && (data.sponsor.h1bSponsor || data.sponsor.optFriendly)),
        optFriendly: !!(data.sponsor && data.sponsor.optFriendly),
        stemFriendly: !!(data.sponsor && data.sponsor.stemFriendly),
        h1bSponsor: !!(data.sponsor && data.sponsor.h1bSponsor),
        citizenRequired: !!(data.sponsor && data.sponsor.citizenRequired),
        industry: raw.industry || current.industry || '',
        requirements: raw.requirements || current.requirements || [],
        tags: raw.tags || current.tags || [],
        graduationYear: raw.graduationYear || current.graduationYear || '',
        recruitmentType: raw.recruitmentType || current.recruitmentType || '',
        education: raw.education || current.education || '',
        experience: raw.experience || current.experience || '',
        remoteType: raw.remoteType || current.remoteType || '',
        conversionOpportunity: !!(raw.conversionOpportunity || current.conversionOpportunity),
        applyCount: Number(raw.applyCount || current.applyCount || 0),
        matchScore100: Number(data.match && data.match.score || current.matchScore100 || 0),
        matchReason: data.match ? (data.match.qualificationStatus === 'eligible'
          ? '资格条件符合，建议优先投递'
          : (data.match.qualificationStatus === 'partial' ? '部分条件需要核实' : '存在资格限制')) : current.matchReason,
        skillTags: current.skillTags || extractSkillTags(description),
      };
      this.commitJob(job, {
        sponsorProfile: data.sponsor || null,
        companyProfile: data.company || null,
        inlineMatch: this.buildInlineMatch(data.match),
        v4Application: data.application || null
      });
      this._saveBrowseHistory(job);
    }).catch(() => {});
  },

  // --- 交互功能 ---

  goBack: function() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
    } else {
      navigation.safeReLaunch('/pages/campus/campus');
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
      type: this.data.job.type,
      deadline: this.data.job.deadline || ''
    };
    const isSaved = favUtil.toggle('job', jobData);
    this.setData({ isSaved, 'jobView.isSaved': isSaved });
    analytics.track(isSaved ? 'favorite_job' : 'unfavorite_job', {
      jobId: jobData.targetId,
      company: jobData.company,
      title: jobData.title
    });
    if (isSaved) {
      const savedProgress = progress.upsertFromJob(this.data.job, { status: 'collected' });
      this.setData({ inProgress: true, progressStatusText: savedProgress.statusText });
    }
    wx.showToast({
      title: isSaved ? '已收藏' : '已取消收藏',
      icon: 'none'
    });
  },

  refreshProgressState: function(jobId) {
    const record = progress.getByJobId(jobId || this.data.jobId);
    const patch = {
      inProgress: !!record,
      isApplied: !!(record && record.status !== 'collected'),
      progressStatusText: record ? record.statusText : ''
    };
    if (this.data.jobView) {
      patch['jobView.isApplied'] = !!(record && record.status !== 'collected');
      patch['jobView.appliedText'] = record && record.status !== 'collected' ? record.statusText : '';
      patch['jobView.applyButtonText'] = record && record.status !== 'collected'
        ? '已投递'
        : (this.data.jobView.deadlineClosed ? '已截止' : (this.data.jobView.hasApplyLink ? '前往投递' : '保存投递'));
    }
    this.setData(patch);
  },

  retryLoad: function() {
    if (!this.data.jobId) return this.goBack();
    this.fetchJobDetail(this.data.jobId);
    this.loadV4Detail(this.data.jobId);
  },

  goToCompanyDetail: function() {
    const company = this.data.companyView;
    if (!company || !company.id) return;
    wx.navigateTo({
      url: `/package-user/pages/company-detail/company-detail?id=${encodeURIComponent(company.id)}&name=${encodeURIComponent(company.name)}`
    });
  },

  toggleCompanyDescription: function() {
    this.setData({ companyExpanded: !this.data.companyExpanded });
  },

  openSimilarJob: function(e) {
    const id = e.detail && e.detail.id;
    if (!id) return;
    const job = this.data.similarJobs.find(item => String(item.id) === String(id));
    if (job) wx.setStorageSync('jobDetailSnapshot_' + String(id), job);
    wx.navigateTo({ url: `/package-user/pages/job-detail/job-detail?id=${encodeURIComponent(id)}` });
  },

  toggleSimilarFavorite: function(e) {
    const index = e.detail && Number.isInteger(e.detail.index) ? e.detail.index : -1;
    const job = this.data.similarJobs[index];
    if (!job) return;
    const isSaved = favUtil.toggle('job', {
      targetId: String(job.id), title: job.title, subtitle: job.company,
      logo: job.logo, salary: job.salary, type: job.type, deadline: job.deadline || ''
    });
    this.setData({
      similarJobs: this.data.similarJobs.map((item, itemIndex) => itemIndex === index
        ? Object.assign({}, item, { isSaved })
        : item)
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

  runJdMatch: async function() {
    const job = this.data.job;
    if (!job) return;
    if (wx.getStorageSync('token')) {
      wx.showLoading({ title: '计算匹配度...', mask: true });
      try {
        const res = await v4Api.calculateJobMatch(job.id);
        const match = res && res.code === 0 ? res.data : null;
        if (match) {
          const report = {
            score: match.score,
            company: job.company,
            jobTitle: job.title,
            atsRisk: match.qualificationStatus === 'eligible' ? '低' : (match.qualificationStatus === 'partial' ? '中' : '高'),
            missingKeywords: match.missingSkills || match.gaps || [],
            projectSuggestion: (match.strengths || []).join('；') || '补充能证明岗位能力的量化项目成果。',
            suggestions: match.actions || [],
            dimensions: match.dimensions || {},
            qualificationReasons: match.qualificationReasons || [],
            tier: match.tier || '',
            tierLabel: match.tierLabel || '',
            tierNote: match.tierNote || '',
            decision: match.decision || null,
            sponsorAssessment: match.sponsorAssessment || null,
          };
          this.setData({
            matchReport: report,
            inlineMatch: this.buildInlineMatch(match),
            showMatchPanel: true,
            'job.matchScore100': Number(match.score || 0),
            'jobView.matchScore': Number(match.score || 0),
            'jobView.hasMatch': true
          });
          wx.hideLoading();
          return;
        }
      } catch (err) {
        wx.hideLoading();
        if (err && err.statusCode === 422) {
          wx.showModal({
            title: '先完善求职画像',
            content: 'V4 匹配需要档案完整度达到 40%，完善签证、目标岗位和技能后即可计算。',
            cancelText: '稍后',
            confirmText: '去完善',
            success: res => { if (res.confirm) wx.navigateTo({ url: '/package-user/pages/profile-edit/profile-edit' }); }
          });
          return;
        }
      }
    }
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
    const job = this.data.job || {};
    const application = this.data.v4Application || this.data.application || {};
    wx.setStorageSync('pendingResumeOptimization', {
      jobId: String(job.id || ''),
      applicationId: application.id || null,
      company: job.company || '',
      jobTitle: job.title || '',
      jdText: job.descriptionText || job.description || ''
    });
    this.closeMatchPanel();
    wx.navigateTo({ url: '/package-career/pages/resume-center/resume-center?targeted=1' });
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
    if (this.data.jobView && this.data.jobView.deadlineClosed) {
      wx.showToast({ title: '该职位已截止，可先收藏关注', icon: 'none' });
      return;
    }
    if (this.data.isApplied) {
      wx.showToast({ title: '该职位已在投递看板中', icon: 'none' });
      return;
    }
    if (this.data.isApplying) return;
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
    if (!job || this.data.isApplying) return;
    this.setData({ isApplying: true });

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
      showCancel: false,
      complete: () => this.setData({ isApplying: false })
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

    if (wx.getStorageSync('token')) {
      v4Api.createApplication({
        jobId: jobIdStr,
        status: 'preparing',
        sourceType: 'job_detail',
        jobSnapshot: {
          id: jobIdStr,
          title: job.title,
          company: job.company,
          location: job.city,
          salary: job.salary,
          applyUrl: job.applyLink || '',
        },
        nextAction: '前往官方招聘页完成申请并更新状态',
      }).then(res => {
        if (res && res.code === 0) this.setData({ v4Application: res.data });
      }).catch(err => {
        if (err && err.statusCode === 409 && err.body && err.body.data) {
          this.setData({ v4Application: { id: err.body.data.applicationId } });
        }
      });
    }

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
