const jdMatch = require('../../../utils/jd-match.js');
const progress = require('../../../utils/job-progress.js');
const navigation = require('../../../utils/navigation.js');
const resumeVersions = require('../../../utils/resume-versions.js');

function readStorage(key, fallback) {
  try {
    const value = wx.getStorageSync(key);
    return value || fallback;
  } catch (e) {
    return fallback;
  }
}

function buildResumeFromText(text) {
  return {
    basicInfo: { name: '粘贴简历' },
    summary: text || '',
    skills: [],
    workExp: [],
    projects: [],
    education: []
  };
}

function scoreTone(score) {
  if (score >= 82) return 'good';
  if (score >= 68) return 'ok';
  return 'risk';
}

function recommendation(score, missingCount) {
  if (score >= 82 && missingCount <= 3) return '建议投递，同时把命中关键词放到简历靠前位置。';
  if (score >= 68) return '可以投递，但建议先补齐缺失关键词和项目量化结果。';
  return '先优化简历版本再投递，避免 ATS 初筛损失。';
}

function defaultInterviewPrep() {
  return [
    '准备一个与岗位关键词最相关的项目案例。',
    '把缺失关键词转成可讲述的学习或项目计划。',
    '面试前复盘 JD 中出现频率最高的 3 个能力点。'
  ];
}

const JOB_TITLE_KEYWORDS = [
  '工程师', '开发', '算法', '数据', '分析师', '产品', '运营', '市场', '销售', '设计', '测试', '管培', '顾问', '研究员', '实习',
  'engineer', 'developer', 'analyst', 'scientist', 'manager', 'designer', 'consultant', 'intern', 'graduate', 'trainee', 'product', 'data', 'marketing', 'operation'
];

const COMPANY_DOMAIN_MAP = {
  tiktok: 'TikTok',
  bytedance: '字节跳动',
  alibaba: '阿里巴巴',
  tencent: '腾讯',
  meituan: '美团',
  jd: '京东',
  pinduoduo: '拼多多',
  pdd: '拼多多',
  kuaishou: '快手',
  baidu: '百度',
  xiaohongshu: '小红书',
  shein: 'SHEIN',
  google: 'Google',
  apple: 'Apple',
  microsoft: 'Microsoft',
  amazon: 'Amazon',
  meta: 'Meta',
  nvidia: 'NVIDIA',
  tesla: 'Tesla',
  oracle: 'Oracle'
};

function cleanExtractedValue(value, maxLen) {
  return String(value || '')
    .replace(/^[\s#>*\-•·●\d.、）)]+/, '')
    .replace(/[，。；;｜|]+$/, '')
    .trim()
    .slice(0, maxLen || 120);
}

function getCleanLines(text, limit) {
  return String(text || '')
    .split(/\r?\n/)
    .map(line => cleanExtractedValue(line, 160))
    .filter(Boolean)
    .slice(0, limit || 80);
}

function hasJobKeyword(text) {
  const value = String(text || '').toLowerCase();
  return JOB_TITLE_KEYWORDS.some(keyword => value.indexOf(String(keyword).toLowerCase()) >= 0);
}

function isSectionHeading(line) {
  return /^(岗位职责|职位描述|职位信息|任职要求|职位要求|岗位要求|工作职责|工作内容|加分项|福利待遇|薪资福利|公司介绍|关于我们|工作地点|投递方式|responsibilities|requirements|qualifications|about us|benefits)$/i.test(String(line || '').trim());
}

function extractUrl(text) {
  const match = String(text || '').match(/https?:\/\/[^\s"'<>，。；、)）]+/i);
  return match ? match[0] : '';
}

function companyFromUrl(url) {
  if (!url) return '';
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    const parts = host.split('.').filter(Boolean);
    const key = parts.find(part => COMPANY_DOMAIN_MAP[part] && !['jobs', 'career', 'careers', 'campus'].includes(part));
    if (key) return COMPANY_DOMAIN_MAP[key];
    const fallback = parts.find(part => !['jobs', 'job', 'career', 'careers', 'campus', 'apply', 'www', 'com', 'cn', 'net', 'org'].includes(part));
    return fallback ? fallback.charAt(0).toUpperCase() + fallback.slice(1) : '';
  } catch (e) {
    return '';
  }
}

function readLabeledFields(text) {
  const result = {};
  getCleanLines(text, 50).forEach(line => {
    const match = line.match(/^([^:：]{2,24})[:：]\s*(.+)$/);
    if (!match) return;
    const label = String(match[1] || '').trim();
    const value = cleanExtractedValue(match[2], 120);
    if (!value) return;
    if (!result.jobTitle && /(岗位名称|职位名称|招聘职位|招聘岗位|目标岗位|投递岗位|job\s*title|position|role|title)/i.test(label) && !/(职责|描述|要求|介绍)/.test(label)) {
      result.jobTitle = cleanExtractedValue(value, 80);
    }
    if (!result.company && (/(公司名称|企业名称|雇主|company|employer)$/i.test(label) || label === '公司')) {
      result.company = cleanExtractedValue(value, 80);
    }
    if (!result.jobLink && /(岗位链接|职位链接|投递链接|申请链接|网申链接|job\s*link|apply\s*link|url)/i.test(label)) {
      result.jobLink = extractUrl(value) || cleanExtractedValue(value, 300);
    }
  });
  return result;
}

function splitHeaderPair(text) {
  const lines = getCleanLines(text, 10);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (isSectionHeading(line) || line.length > 120) continue;
    const parts = line
      .split(/\s+(?:@|at)\s+|[｜|]|(?:\s[-–—－]\s)/i)
      .map(item => cleanExtractedValue(item, 80))
      .filter(Boolean);
    if (parts.length !== 2) continue;
    const firstLooksJob = hasJobKeyword(parts[0]);
    const secondLooksJob = hasJobKeyword(parts[1]);
    if (firstLooksJob && !secondLooksJob) return { jobTitle: parts[0], company: parts[1] };
    if (secondLooksJob && !firstLooksJob) return { jobTitle: parts[1], company: parts[0] };
  }
  return {};
}

function extractCompanyFromText(text) {
  const lines = getCleanLines(text, 30);
  const suffixPattern = /([\u4e00-\u9fa5A-Za-z0-9&.·\-]{2,40}(?:有限公司|集团|银行|证券|基金|科技|技术|咨询|控股|股份|传媒|教育|能源|汽车|物流|医药|生物|电子|通信|半导体))/;
  for (let i = 0; i < lines.length; i += 1) {
    if (/公司介绍|关于我们/.test(lines[i])) continue;
    const match = lines[i].match(suffixPattern);
    if (match) return cleanExtractedValue(match[1], 80);
  }
  return '';
}

function extractJobTitleFromText(text, company) {
  const lines = getCleanLines(text, 20);
  for (let i = 0; i < lines.length; i += 1) {
    let line = lines[i];
    if (isSectionHeading(line) || /^https?:\/\//i.test(line) || line.length > 90) continue;
    if (company) {
      line = line.replace(new RegExp('^' + String(company).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[-–—－｜|@]*\\s*', 'i'), '');
    }
    line = cleanExtractedValue(line, 80);
    if (line && hasJobKeyword(line) && !/(职责|要求|描述|福利|介绍|地点)/.test(line)) return line;
  }
  return '';
}

function extractJdInfo(text) {
  const jdText = String(text || '').trim();
  if (!jdText) return { jobTitle: '', company: '', jobLink: '', fields: [] };
  const labeled = readLabeledFields(jdText);
  const header = splitHeaderPair(jdText);
  const jobLink = labeled.jobLink || extractUrl(jdText);
  const company = labeled.company || header.company || extractCompanyFromText(jdText) || companyFromUrl(jobLink);
  const jobTitle = labeled.jobTitle || header.jobTitle || extractJobTitleFromText(jdText, company);
  const fields = [];
  if (jobTitle) fields.push('岗位');
  if (company) fields.push('公司');
  if (jobLink) fields.push('链接');
  return { jobTitle, company, jobLink, fields };
}

Page({
  data: {
    step: 'input',
    form: {
      jobTitle: '',
      company: '',
      jobLink: '',
      jdText: '',
      resumeText: ''
    },
    autoFilledFields: {
      jobTitle: false,
      company: false,
      jobLink: false
    },
    jdLen: 0,
    jdParseTip: '',
    jdParsedFields: [],
    resumeLen: 0,
    useOnlineResume: true,
    hasOnlineResume: false,
    onlineResumeName: '',
    onlineResumeTargetRole: '',
    onlineResumeLoading: false,
    selectedResumeId: '',
    selectedResumeIndex: 0,
    selectedResume: null,
    resumeVersionList: [],
    resumeVersionLabels: [],
    report: null,
    savedReport: false,
    savedProgress: false,
    recentReports: [],
    historyLoading: false,
    historyLoaded: false
  },

  onLoad() {
    this.loadOnlineResume();
    this.loadJobPreset();
    this.loadReportHistory();
  },

  onShow() {
    this.loadOnlineResume();
    this.loadReportHistory();
  },

  loadOnlineResume() {
    this.setData({ onlineResumeLoading: true });
    resumeVersions.fetchResumeVersions().then(selection => {
      this.applyResumeSelection(selection);
    }).catch(() => {
      this.applyResumeSelection(resumeVersions.localSelection());
    });
  },

  applyResumeSelection(selection) {
    const item = selection || resumeVersions.localSelection();
    const hasOnlineResume = !!item.hasResume;
    this.setData({
      hasOnlineResume,
      onlineResumeName: hasOnlineResume ? (item.currentName || '当前在线简历') : '',
      onlineResumeTargetRole: item.currentTargetRole || '',
      onlineResumeLoading: false,
      selectedResumeId: item.currentId || '',
      selectedResumeIndex: item.currentIndex || 0,
      selectedResume: item.currentResume || null,
      resumeVersionList: item.list || [],
      resumeVersionLabels: item.labels || [],
      useOnlineResume: hasOnlineResume ? this.data.useOnlineResume : false
    });
  },

  onResumeVersionChange(e) {
    const index = Number(e.detail.value || 0);
    const target = (this.data.resumeVersionList || [])[index];
    if (!target || String(target.id) === String(this.data.selectedResumeId)) return;
    this.setData({ onlineResumeLoading: true, report: null, savedReport: false, savedProgress: false });
    resumeVersions.loadResumeVersion(target.id, this.data.resumeVersionList).then(selection => {
      this.applyResumeSelection(selection);
    }).catch(() => {
      this.setData({ onlineResumeLoading: false });
      wx.showToast({ title: '简历加载失败', icon: 'none' });
    });
  },

  loadJobPreset() {
    const job = readStorage('tempJobDetail', {});
    if (!job || (!job.title && !job.description)) return;
    const form = Object.assign({}, this.data.form, {
      jobTitle: job.title || '',
      company: job.company || '',
      jobLink: job.applyLink || job.jobLink || '',
      jdText: job.description || ''
    });
    const parsed = extractJdInfo(form.jdText);
    const patch = Object.assign({
      form,
      jdLen: form.jdText.length
    }, this.buildJdParsePatch(parsed, form, false));
    this.setData(patch);
  },

  onFieldInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value || '';
    if (!field) return;
    const patch = {
      [`form.${field}`]: value,
      jdLen: field === 'jdText' ? value.length : this.data.jdLen,
      resumeLen: field === 'resumeText' ? value.length : this.data.resumeLen,
      report: null,
      savedReport: false,
      savedProgress: false
    };
    if (field === 'jdText') {
      Object.assign(patch, this.buildJdParsePatch(extractJdInfo(value), Object.assign({}, this.data.form, { jdText: value }), false));
    } else if (field === 'jobTitle' || field === 'company' || field === 'jobLink') {
      patch[`autoFilledFields.${field}`] = false;
    }
    this.setData(patch);
  },

  buildJdParsePatch(parsed, form, overwrite) {
    const info = parsed || {};
    const currentForm = form || this.data.form || {};
    const autoFilled = this.data.autoFilledFields || {};
    const patch = {
      jdParsedFields: info.fields || [],
      jdParseTip: ''
    };
    const filled = [];
    [
      { key: 'jobTitle', label: '岗位', value: info.jobTitle },
      { key: 'company', label: '公司', value: info.company },
      { key: 'jobLink', label: '链接', value: info.jobLink }
    ].forEach(item => {
      const value = String(item.value || '').trim();
      if (!value) return;
      const currentValue = String(currentForm[item.key] || '').trim();
      if (overwrite || !currentValue || autoFilled[item.key]) {
        patch[`form.${item.key}`] = value;
        patch[`autoFilledFields.${item.key}`] = true;
        filled.push(item.label);
      }
    });
    const fields = info.fields || [];
    if (filled.length) {
      patch.jdParseTip = `已自动回填：${filled.join('、')}`;
    } else if (fields.length) {
      patch.jdParseTip = `已识别：${fields.join('、')}，未覆盖已填写内容`;
    } else if (String(currentForm.jdText || '').trim().length >= 40) {
      patch.jdParseTip = '暂未识别出岗位信息，可把岗位名称/公司名称放在 JD 开头';
    } else {
      patch.jdParseTip = '粘贴 JD 后将自动识别岗位、公司和链接';
    }
    return patch;
  },

  recognizeJdInfo() {
    const jdText = String(this.data.form.jdText || '').trim();
    if (jdText.length < 20) {
      wx.showToast({ title: '请先粘贴 JD', icon: 'none' });
      return;
    }
    const parsed = extractJdInfo(jdText);
    const patch = this.buildJdParsePatch(parsed, this.data.form, true);
    this.setData(patch);
    wx.showToast({
      title: (parsed.fields || []).length ? '已识别岗位信息' : '暂未识别到字段',
      icon: 'none'
    });
  },

  pasteJdFromClipboard() {
    wx.getClipboardData({
      success: (res) => {
        const jdText = String(res.data || '').trim().slice(0, 5000);
        if (jdText.length < 20) {
          wx.showToast({ title: '剪贴板里没有完整 JD', icon: 'none' });
          return;
        }
        const nextForm = Object.assign({}, this.data.form, { jdText });
        const patch = Object.assign({
          'form.jdText': jdText,
          jdLen: jdText.length,
          report: null,
          savedReport: false,
          savedProgress: false
        }, this.buildJdParsePatch(extractJdInfo(jdText), nextForm, false));
        this.setData(patch);
        wx.showToast({ title: '已粘贴并识别', icon: 'none' });
      },
      fail: () => {
        wx.showToast({ title: '读取剪贴板失败', icon: 'none' });
      }
    });
  },

  decorateReport(report) {
    const item = report || {};
    const missingKeywords = Array.isArray(item.missingKeywords) ? item.missingKeywords : [];
    const matchedKeywords = Array.isArray(item.matchedKeywords) ? item.matchedKeywords : [];
    const suggestions = Array.isArray(item.suggestions) ? item.suggestions : [];
    const score = Number(item.score || 0);
    return Object.assign({}, item, {
      score,
      matchedKeywords,
      missingKeywords,
      suggestions,
      scoreTone: item.scoreTone || scoreTone(score),
      recommendText: item.recommendText || recommendation(score, missingKeywords.length),
      interviewPrep: Array.isArray(item.interviewPrep) && item.interviewPrep.length ? item.interviewPrep : defaultInterviewPrep(),
      missingPreviewText: missingKeywords.slice(0, 3).join(' / '),
      createdDate: item.createdAt ? String(item.createdAt).slice(0, 10) : ''
    });
  },

  loadReportHistory() {
    if (this.data.historyLoading) return;
    this.setData({ historyLoading: true });
    jdMatch.fetchRemoteReports().then(list => {
      const recentReports = (list || []).map(item => this.decorateReport(item)).slice(0, 5);
      this.setData({
        recentReports,
        historyLoading: false,
        historyLoaded: true
      });
    }).catch(() => {
      const recentReports = jdMatch.getReports().map(item => this.decorateReport(item)).slice(0, 5);
      this.setData({
        recentReports,
        historyLoading: false,
        historyLoaded: true
      });
    });
  },

  openHistoryReport(e) {
    const id = e.currentTarget.dataset.id;
    const report = jdMatch.getReportById(id);
    if (!report) {
      wx.showToast({ title: '报告暂不可用', icon: 'none' });
      return;
    }
    this.setData({
      step: 'result',
      report: this.decorateReport(report),
      savedReport: true,
      savedProgress: false
    });
  },

  switchResumeSource(e) {
    const source = e.currentTarget.dataset.source;
    if (source === 'online' && !this.data.hasOnlineResume) {
      wx.showToast({ title: '暂无历史简历，请粘贴简历', icon: 'none' });
      return;
    }
    this.setData({ useOnlineResume: source === 'online' });
  },

  startMatch() {
    const form = this.data.form;
    const jdText = String(form.jdText || '').trim();
    const resumeText = String(form.resumeText || '').trim();
    const onlineResume = this.data.selectedResume || readStorage('onlineResume', {});
    const useOnline = this.data.useOnlineResume && this.data.hasOnlineResume;
    const selectedResumeName = this.data.onlineResumeName || resumeVersions.getResumeDisplayName(onlineResume, '当前在线简历');

    if (jdText.length < 40) {
      wx.showToast({ title: '请粘贴更完整的 JD', icon: 'none' });
      return;
    }
    if (!useOnline && resumeText.length < 40) {
      wx.showToast({ title: '请选择历史简历或粘贴简历', icon: 'none' });
      return;
    }

    const parsed = extractJdInfo(jdText);
    const job = {
      id: '',
      title: form.jobTitle || parsed.jobTitle || '目标岗位',
      company: form.company || parsed.company || '',
      description: jdText,
      skillTags: []
    };
    const resume = useOnline ? onlineResume : buildResumeFromText(resumeText);
    const baseReport = jdMatch.buildReport(resume, job);
    const report = this.decorateReport(Object.assign({}, baseReport, {
      resumeName: useOnline ? selectedResumeName : '粘贴简历',
      resumeVersionId: useOnline ? (this.data.selectedResumeId || '') : '',
      jobLink: form.jobLink || parsed.jobLink || '',
      jdText,
      resumeText: useOnline ? '' : resumeText,
      useOnlineResume: useOnline,
      recommendText: recommendation(baseReport.score, baseReport.missingKeywords.length),
      interviewPrep: defaultInterviewPrep()
    }));
    const saved = jdMatch.saveReport(report);
    this.setData({ step: 'result', report: this.decorateReport(saved), savedReport: true, savedProgress: false });
    this.loadReportHistory();
  },

  saveToProgress() {
    const report = this.data.report;
    if (!report) return;
    const saved = progress.upsert({
      id: 'local_' + Date.now(),
      company: report.company || '目标公司',
      jobTitle: report.jobTitle || '目标岗位',
      jobLink: report.jobLink || '',
      status: 'collected',
      aiReportId: report.id,
      resumeVersionId: report.resumeVersionId || '',
      matchScore: report.score,
      matchedKeywords: report.matchedKeywords || [],
      missingKeywords: report.missingKeywords || [],
      aiSuggestion: report.recommendText || '',
      nextAction: report.score >= 68 ? '补齐缺失关键词后投递' : '先优化简历版本再投递',
      notes: [
        `JD 匹配分：${report.score}`,
        report.missingKeywords && report.missingKeywords.length ? `缺失关键词：${report.missingKeywords.join('、')}` : '',
        report.recommendText || ''
      ].filter(Boolean).join('\n')
    });
    this.setData({ savedProgress: true });
    wx.showToast({ title: saved ? '已加入投递追踪' : '已保存', icon: 'success' });
  },

  goAtsOptimize() {
    const report = this.data.report;
    if (report) {
      try {
        wx.setStorageSync('pendingAtsJob', {
          jobTitle: report.jobTitle || '',
          jobDescription: report.jdText || '',
          source: 'jd-match'
        });
      } catch (e) {}
    }
    navigation.safeNavigateTo('/package-career/pages/ats-optimize/ats-optimize');
  },

  goProgress() {
    navigation.safeNavigateTo('/package-user/pages/job-progress/job-progress');
  },

  goResume() {
    navigation.safeNavigateTo('/package-career/pages/resume/resume');
  },

  resetMatch() {
    this.setData({ step: 'input', report: null, savedReport: false, savedProgress: false });
  }
});
