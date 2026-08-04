const EMPTY_VALUES = new Set(['', 'null', 'undefined', 'n/a', 'na', 'none', '--']);

const SKILL_DICTIONARY = [
  ['Python', /\bpython\b/i],
  ['SQL', /\bsql\b/i],
  ['JavaScript', /\bjavascript\b|\bjs\b/i],
  ['TypeScript', /\btypescript\b/i],
  ['Java', /\bjava\b/i],
  ['C++', /\bc\+\+\b/i],
  ['React', /\breact\b/i],
  ['Node.js', /\bnode(?:\.js)?\b/i],
  ['AWS', /\baws\b/i],
  ['Excel', /\bexcel\b/i],
  ['Tableau', /\btableau\b/i],
  ['Power BI', /\bpower\s*bi\b/i],
  ['机器学习', /机器学习|machine learning/i],
  ['数据分析', /数据分析|data analys/i],
  ['产品设计', /产品设计|product design/i],
  ['大模型', /大模型|\bllm\b|generative ai/i]
];

function clean(value) {
  if (value === null || value === undefined) return '';
  const text = String(value).replace(/\s+/g, ' ').trim();
  return EMPTY_VALUES.has(text.toLowerCase()) ? '' : text;
}

function first(source, keys) {
  for (const key of keys) {
    const value = source && source[key];
    if (value !== null && value !== undefined && clean(value)) return value;
  }
  return '';
}

function list(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === 'string') {
    return value.split(/[|｜,，;；\n]/).map(clean).filter(Boolean);
  }
  return [];
}

function unique(values) {
  const result = [];
  values.map(clean).filter(Boolean).forEach(value => {
    if (!result.some(saved => saved.toLowerCase() === value.toLowerCase())) result.push(value);
  });
  return result;
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/p\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n• ')
    .replace(/<\s*\/li\s*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function contentBlocks(value) {
  const text = stripHtml(value);
  if (!text) return [];
  let lines = text.split(/\n+/).map(clean).filter(Boolean);
  if (lines.length === 1 && lines[0].length > 220) {
    lines = lines[0].replace(/([。！？.!?])\s+/g, '$1\n').split('\n').map(clean).filter(Boolean);
  }
  return lines.map(line => {
    const bullet = /^[•·\-*]\s*/.test(line);
    return { text: line.replace(/^[•·\-*]\s*/, ''), bullet };
  });
}

function salaryText(source) {
  const direct = clean(first(source, ['salary', 'salaryText', 'salaryRange']));
  if (direct && !/negotiable|面议|暂无/i.test(direct)) {
    const parts = direct.split(/\s*[-–—~至]\s*/).filter(Boolean);
    if (parts.length === 2 && parts[0].replace(/\s/g, '').toLowerCase() === parts[1].replace(/\s/g, '').toLowerCase()) {
      return parts[0];
    }
    return direct;
  }
  const min = Number(first(source, ['salaryMin', 'job_min_salary', 'minSalary']));
  const max = Number(first(source, ['salaryMax', 'job_max_salary', 'maxSalary']));
  if (min > 0 && max > 0) {
    const symbol = clean(first(source, ['salaryCurrency', 'currency'])) === 'CNY' ? '¥' : '$';
    const compact = value => value >= 1000 ? `${Math.round(value / 1000)}k` : String(Math.round(value));
    const rawUnit = clean(first(source, ['salaryUnit', 'payPeriod', 'salaryPeriod'])).toLowerCase();
    const unitMap = { hour: '/小时', hourly: '/小时', day: '/天', daily: '/天', month: '/月', monthly: '/月', year: '/年', yearly: '/年', annual: '/年' };
    const suffix = unitMap[rawUnit] || '';
    return `${min === max ? `${symbol}${compact(min)}` : `${symbol}${compact(min)}–${symbol}${compact(max)}`}${suffix}`;
  }
  return '薪资面议';
}

function postedText(source) {
  const raw = clean(first(source, ['updatedAt', 'updateTime', 'postedAt', 'publishTime', 'job_posted_at_datetime_utc']));
  if (!raw) return '近期更新';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime()) || !/(?:T|\d{4}-\d{1,2}-\d{1,2})/.test(raw)) return raw;
  const elapsed = Date.now() - date.getTime();
  if (elapsed < 0) return raw.slice(0, 10);
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 60) return minutes <= 1 ? '刚刚更新' : `${minutes}分钟前更新`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前更新`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}天前更新`;
  return `${raw.slice(0, 10)}更新`;
}

function employmentText(value) {
  const raw = clean(value);
  if (!raw) return '';
  const upper = raw.toUpperCase().replace(/[ _-]/g, '');
  const map = {
    FULLTIME: '全职',
    PARTTIME: '兼职',
    CONTRACTOR: '合同工',
    CONTRACT: '合同工',
    INTERN: '实习',
    INTERNSHIP: '实习',
    TEMPORARY: '短期'
  };
  return map[upper] || raw.replace('FULLTIME', '全职').replace('Full-time', '全职');
}

function locationText(source) {
  const direct = clean(first(source, ['location', 'jobLocation']));
  if (direct) return direct;
  const city = clean(first(source, ['city', 'job_city']));
  const state = clean(first(source, ['state', 'job_state']));
  return unique([city, state]).join(', ');
}

function dateValue(value) {
  const raw = clean(value);
  if (!raw) return null;
  const date = new Date(raw.length <= 10 ? `${raw.slice(0, 10)}T23:59:59` : raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function deadlineMeta(value) {
  const raw = clean(value);
  if (!raw) return { text: '长期招聘', tone: 'open', closed: false, dateText: '' };
  const date = dateValue(raw);
  if (!date) return { text: raw, tone: 'open', closed: false, dateText: raw };
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((target - today) / 86400000);
  if (days < 0) return { text: '已截止', tone: 'closed', closed: true, dateText: raw.slice(0, 10) };
  if (days === 0) return { text: '今日截止', tone: 'urgent', closed: false, dateText: raw.slice(0, 10) };
  if (days === 1) return { text: '明日截止', tone: 'urgent', closed: false, dateText: raw.slice(0, 10) };
  if (days <= 3) return { text: `${days}天后截止`, tone: 'urgent', closed: false, dateText: raw.slice(0, 10) };
  return {
    text: `${date.getMonth() + 1}月${date.getDate()}日截止`,
    tone: 'open',
    closed: false,
    dateText: raw.slice(0, 10)
  };
}

function skillTexts(source) {
  const declared = [
    ...list(first(source, ['skills', 'skillTags', 'skillKeywords'])),
    ...list(first(source, ['matchedSkills']))
  ].map(item => clean(item && typeof item === 'object' ? (item.label || item.name) : item));
  const requirements = list(first(source, ['requirements', 'jobRequirements']));
  const haystack = [
    clean(first(source, ['title', 'jobTitle', 'job_title'])),
    stripHtml(first(source, ['description', 'rawDescription', 'jobDescription', 'job_description'])),
    requirements.join(' ')
  ].join(' ');
  SKILL_DICTIONARY.forEach(([label, pattern]) => {
    if (pattern.test(haystack)) declared.push(label);
  });
  return unique(declared).slice(0, 3);
}

function attributeTexts(source) {
  const sponsor = source.sponsor || {};
  const values = [
    first(source, ['graduationYear', 'graduateYear', 'targetGraduation']),
    first(source, ['recruitmentType', 'campusType']),
    employmentText(first(source, ['type', 'jobType', 'employmentType', 'job_employment_type'])),
    source.conversionOpportunity || source.canConvert ? '可转正' : '',
    first(source, ['education', 'educationRequirement', 'degree']),
    source.remoteType || source.isRemote ? (clean(source.remoteType) || '支持远程') : '',
    source.visaSponsored || source.visaSupport || source.optFriendly || sponsor.optFriendly ? 'OPT友好' : '',
    source.h1bSponsor || sponsor.h1bSponsor ? 'Visa Sponsorship' : '',
    source.internationalStudentFriendly || sponsor.internationalStudentFriendly ? '留学生友好' : '',
    source.newGradFriendly ? '接受应届生' : ''
  ];
  list(first(source, ['tags', 'attributeTags'])).forEach(value => values.push(value));
  return unique(values);
}

function basicInfo(source, presentation) {
  const sponsor = source.sponsor || {};
  const items = [
    ['工作地点', presentation.location],
    ['招聘类型', presentation.employmentType],
    ['工作方式', first(source, ['remoteType', 'workMode'])],
    ['招聘届别', first(source, ['graduationYear', 'graduateYear'])],
    ['学历要求', first(source, ['education', 'educationRequirement', 'degree'])],
    ['经验要求', first(source, ['experience', 'experienceRequirement'])],
    ['实习周期', first(source, ['internshipDuration', 'duration'])],
    ['每周天数', first(source, ['daysPerWeek', 'workDays'])],
    ['语言要求', first(source, ['language', 'languageRequirement'])],
    ['签证支持', source.visaSponsored || source.visaSupport || sponsor.h1bSponsor ? '支持或可申请' : '']
  ];
  return items.map(([label, value]) => ({ label, value: clean(value) })).filter(item => item.value);
}

function requirementValues(source) {
  const highlights = source.jobHighlights || source.job_highlights || {};
  const values = [
    ...list(first(source, ['requirements', 'jobRequirements', 'qualifications'])),
    ...list(highlights.Qualifications),
    ...list(highlights.qualifications)
  ];
  return unique(values).slice(0, 12).map(text => ({ text, bullet: true }));
}

function presentJob(source) {
  const job = source || {};
  const deadline = deadlineMeta(first(job, ['deadline', 'deadlineDate', 'job_offer_expiration_datetime_utc', 'valid_through']));
  const attributes = attributeTexts(job);
  const percentageScore = first(job, ['matchScore100', 'matchScore', 'score']);
  const score = Math.round(Number(percentageScore) || 0);
  const progressStatus = clean(first(job, ['applyStatus', 'applicationStatus', 'progressStatus']));
  const applied = job.isApplied === true || /applied|投递|网申|interview|面试|offer/i.test(progressStatus);
  const employmentType = employmentText(first(job, ['type', 'jobType', 'employmentType', 'job_employment_type']));
  const presentation = {
    id: first(job, ['id', 'jobId', 'job_id']),
    title: clean(first(job, ['title', 'jobTitle', 'job_title'])) || '职位名称待确认',
    company: clean(first(job, ['company', 'companyName', 'employer_name'])) || '公司待确认',
    logo: first(job, ['logo', 'companyLogo', 'employer_logo']),
    companyInitial: clean(first(job, ['companyInitial'])) || (clean(first(job, ['company', 'companyName', 'employer_name'])) || 'C').slice(0, 1).toUpperCase(),
    salary: salaryText(job),
    location: locationText(job),
    industry: clean(first(job, ['industry', 'companyIndustry'])),
    companySize: clean(first(job, ['companySize', 'size'])),
    employmentType,
    attributeTags: attributes.slice(0, 4),
    extraAttributeCount: Math.max(0, attributes.length - 4),
    skills: skillTexts(job),
    matchScore: score > 0 ? Math.min(100, score) : 0,
    matchReason: clean(first(job, ['matchReason', 'matchReasons', 'recommendationText', 'recommendation'])),
    hasMatch: score > 0 || !!clean(first(job, ['matchReason', 'matchReasons', 'recommendationText', 'recommendation'])),
    deadlineText: deadline.text,
    deadlineTone: deadline.tone,
    deadlineClosed: deadline.closed,
    deadlineDate: deadline.dateText,
    postedText: postedText(job),
    applyCountText: Number(first(job, ['applyCount', 'applicationCount'])) > 0 ? `${Number(first(job, ['applyCount', 'applicationCount']))}人已投` : '',
    isSaved: job.isSaved === true || job.favoriteStatus === true,
    isApplied: applied,
    appliedText: applied ? (progressStatus || '已投递') : '',
    hasApplyLink: !!clean(first(job, ['applyLink', 'applyUrl', 'officialApplyUrl', 'sourceUrl'])),
    descriptionBlocks: contentBlocks(first(job, ['description', 'rawDescription', 'jobDescription', 'job_description'])),
    requirementBlocks: requirementValues(job)
  };
  presentation.basicInfo = basicInfo(job, presentation);
  presentation.applyButtonText = presentation.deadlineClosed
    ? '已截止'
    : (presentation.isApplied ? '已投递' : (presentation.hasApplyLink ? '前往投递' : '保存投递'));
  return presentation;
}

module.exports = {
  clean,
  stripHtml,
  contentBlocks,
  deadlineMeta,
  presentJob
};
