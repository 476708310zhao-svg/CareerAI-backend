const STATUS_OPTIONS = [
  { value: 'student', label: '在读学生' },
  { value: 'fresh', label: '应届毕业' },
  { value: 'working', label: '已工作' },
  { value: 'switching', label: '转行/换岗' }
];

const DEGREE_OPTIONS = [
  { value: 'associate', label: '专科' },
  { value: 'bachelor', label: '本科' },
  { value: 'master', label: '硕士' },
  { value: 'phd', label: '博士' },
  { value: 'mba', label: 'MBA' },
  { value: 'other', label: '其他' }
];

const ROLE_OPTIONS = [
  '软件工程师', '前端工程师', '后端工程师', '全栈工程师', 'AI/机器学习',
  '数据分析师', '数据科学家', '产品经理', '商业分析师', 'UX/UI 设计师',
  '运营', '市场营销', '咨询顾问', '金融分析师', '量化研究员'
];

const LOCATION_OPTIONS = ['国内', '美国', '加拿大', '英国', '新加坡', '澳大利亚', '香港', '欧洲', '远程'];
const INDUSTRY_OPTIONS = ['互联网/科技', '金融/投行', '咨询', '快消/零售', '新能源/汽车', '医疗/生物', '教育', '游戏/文娱', '制造业'];

const JOB_TYPE_OPTIONS = [
  { value: 'internship', label: '实习' },
  { value: 'campus', label: '校招/Graduate' },
  { value: 'fulltime', label: '全职' },
  { value: 'parttime', label: '兼职' },
  { value: 'remote', label: '远程' }
];

const WORK_AUTH_OPTIONS = [
  { value: 'no_limit', label: '无特殊要求' },
  { value: 'cpt', label: 'CPT' },
  { value: 'opt', label: 'OPT' },
  { value: 'h1b', label: '需要 H-1B 支持' },
  { value: 'sponsor', label: '需要雇主担保' },
  { value: 'local_work_right', label: '已有当地工作权利' }
];

const SKILL_OPTIONS = [
  'Python', 'Java', 'JavaScript', 'TypeScript', 'C++', 'Go',
  'React', 'Vue', 'Node.js', 'SQL', '机器学习', '数据分析',
  'AWS', 'Docker', 'Git', '产品管理'
];

const GRAD_YEAR_OPTIONS = ['2024', '2025', '2026', '2027', '2028', '2029', '2030'];

const USER_PROFILE_SCHEMA = {
  version: 'user_profile_standard_v1',
  options: {
    statusOptions: STATUS_OPTIONS,
    degreeOptions: DEGREE_OPTIONS,
    gradYearOptions: GRAD_YEAR_OPTIONS,
    roleOptions: ROLE_OPTIONS,
    locationOptions: LOCATION_OPTIONS,
    industryOptions: INDUSTRY_OPTIONS,
    jobTypeOptions: JOB_TYPE_OPTIONS,
    workAuthOptions: WORK_AUTH_OPTIONS,
    skillOptions: SKILL_OPTIONS
  },
  fields: [
    { key: 'nickName', label: '昵称', group: 'basic', type: 'text', maxLength: 20 },
    { key: 'school', label: '学校', group: 'education', type: 'text', maxLength: 60 },
    { key: 'major', label: '专业', group: 'education', type: 'text', maxLength: 60 },
    { key: 'degree', label: '学历', group: 'education', type: 'single', optionsKey: 'degreeOptions' },
    { key: 'gradYear', label: '毕业年份', group: 'education', type: 'single', optionsKey: 'gradYearOptions' },
    { key: 'status', label: '求职状态', group: 'career', type: 'single', optionsKey: 'statusOptions' },
    { key: 'targetRoles', label: '目标岗位', group: 'career', type: 'multi', optionsKey: 'roleOptions', maxItems: 5 },
    { key: 'targetLocation', label: '目标地区', group: 'career', type: 'multi', optionsKey: 'locationOptions', maxItems: 6 },
    { key: 'targetIndustries', label: '目标行业', group: 'career', type: 'multi', optionsKey: 'industryOptions', maxItems: 6 },
    { key: 'jobTypes', label: '求职类型', group: 'career', type: 'multi', optionsKey: 'jobTypeOptions', maxItems: 4 },
    { key: 'workAuthorization', label: '工作授权', group: 'career', type: 'single', optionsKey: 'workAuthOptions' },
    { key: 'skills', label: '技能标签', group: 'skills', type: 'multi', optionsKey: 'skillOptions', maxItems: 20 }
  ]
};

const STATUS_ALIASES = {
  fresh_grad: 'fresh',
  graduate: 'fresh',
  new_grad: 'fresh',
  employed: 'working',
  work: 'working',
  career_switch: 'switching'
};

const DEGREE_ALIASES = {
  本科: 'bachelor',
  学士: 'bachelor',
  bachelor: 'bachelor',
  硕士: 'master',
  master: 'master',
  研究生: 'master',
  博士: 'phd',
  doctor: 'phd',
  phd: 'phd'
};

function safeJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (e) {
    return fallback;
  }
}

function cleanText(value, maxLength = 80) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function cleanArray(value, maxItems, maxLength = 40) {
  let list = [];
  if (Array.isArray(value)) {
    list = value;
  } else if (typeof value === 'string') {
    list = value.split(/[,，、;；\n\r]+/);
  }
  const seen = new Set();
  const result = [];
  list.forEach(item => {
    const text = cleanText(item, maxLength);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) return;
    seen.add(key);
    result.push(text);
  });
  return result.slice(0, maxItems);
}

function optionValues(options) {
  return options.map(item => typeof item === 'string' ? item : item.value);
}

function normalizeOption(value, options, aliases = {}) {
  const raw = cleanText(value, 40);
  if (!raw) return '';
  const aliased = aliases[raw] || aliases[raw.toLowerCase()] || raw;
  const values = optionValues(options);
  if (values.includes(aliased)) return aliased;
  const byLabel = options.find(item => typeof item === 'object' && item.label === raw);
  return byLabel ? byLabel.value : '';
}

function normalizeOptionArray(value, options, maxItems) {
  const values = optionValues(options);
  return cleanArray(value, maxItems, 40)
    .map(item => {
      if (values.includes(item)) return item;
      const byLabel = options.find(option => typeof option === 'object' && option.label === item);
      return byLabel ? byLabel.value : '';
    })
    .filter(Boolean);
}

function normalizeGradYear(value) {
  const year = cleanText(value, 4);
  return /^\d{4}$/.test(year) ? year : '';
}

function normalizeEducation(input = {}) {
  const source = input || {};
  return {
    school: cleanText(source.school || source.university || source.college, 60),
    major: cleanText(source.major || source.majorName || source.fieldOfStudy, 60),
    degree: normalizeOption(source.degree || source.educationLevel, DEGREE_OPTIONS, DEGREE_ALIASES),
    gradYear: normalizeGradYear(source.gradYear || source.graduationYear || source.graduateYear)
  };
}

function normalizeJobPreference(input = {}) {
  const source = input || {};
  const targetLocation = source.targetLocation !== undefined ? source.targetLocation : source.targetLocations;
  return {
    status: normalizeOption(source.status || source.jobSeekingStatus || source.currentStatus, STATUS_OPTIONS, STATUS_ALIASES),
    targetRoles: cleanArray(source.targetRoles || source.roles || source.targetPositions, 5, 40),
    targetLocation: cleanArray(targetLocation || source.locations, 6, 30),
    targetIndustries: cleanArray(source.targetIndustries || source.industries, 6, 30),
    jobTypes: normalizeOptionArray(source.jobTypes || source.jobType, JOB_TYPE_OPTIONS, 4),
    workAuthorization: normalizeOption(source.workAuthorization || source.workAuth || source.visaStatus, WORK_AUTH_OPTIONS),
    expectedSalaryRange: cleanText(source.expectedSalaryRange || source.salaryRange, 40),
    skills: cleanArray(source.skills || source.skillTags, 20, 30)
  };
}

function normalizeProfilePayload(payload = {}, currentRow = {}) {
  const currentEducation = normalizeEducation(safeJson(currentRow.education, {}));
  const currentPreference = normalizeJobPreference(safeJson(currentRow.job_preference, {}));
  const payloadEducation = payload.education || {};
  const payloadPreference = payload.jobPreference || payload.job_preference || {};

  const education = normalizeEducation({
    ...currentEducation,
    ...payloadEducation,
    school: payload.school !== undefined ? payload.school : payloadEducation.school ?? currentEducation.school,
    major: payload.major !== undefined ? payload.major : payloadEducation.major ?? currentEducation.major,
    degree: payload.degree !== undefined ? payload.degree : payloadEducation.degree ?? currentEducation.degree,
    gradYear: payload.gradYear !== undefined ? payload.gradYear : payloadEducation.gradYear ?? currentEducation.gradYear
  });

  const jobPreference = normalizeJobPreference({
    ...currentPreference,
    ...payloadPreference,
    status: payload.status !== undefined ? payload.status : payloadPreference.status ?? currentPreference.status,
    targetRoles: payload.targetRoles !== undefined ? payload.targetRoles : payloadPreference.targetRoles ?? currentPreference.targetRoles,
    targetLocation: payload.targetLocation !== undefined ? payload.targetLocation : payloadPreference.targetLocation ?? currentPreference.targetLocation,
    targetIndustries: payload.targetIndustries !== undefined ? payload.targetIndustries : payloadPreference.targetIndustries ?? currentPreference.targetIndustries,
    jobTypes: payload.jobTypes !== undefined ? payload.jobTypes : payloadPreference.jobTypes ?? currentPreference.jobTypes,
    workAuthorization: payload.workAuthorization !== undefined ? payload.workAuthorization : payloadPreference.workAuthorization ?? currentPreference.workAuthorization,
    expectedSalaryRange: payload.expectedSalaryRange !== undefined ? payload.expectedSalaryRange : payloadPreference.expectedSalaryRange ?? currentPreference.expectedSalaryRange,
    skills: payload.skills !== undefined ? payload.skills : payloadPreference.skills ?? currentPreference.skills
  });

  const user = {
    nickname: payload.nickname !== undefined ? cleanText(payload.nickname, 30) : undefined,
    avatar: payload.avatar !== undefined ? cleanText(payload.avatar, 300) : undefined,
    email: payload.email !== undefined ? cleanText(payload.email, 120) : undefined,
    phone: payload.phone !== undefined ? cleanText(payload.phone, 40) : undefined
  };

  if (payload.nickName !== undefined && user.nickname === undefined) {
    user.nickname = cleanText(payload.nickName, 30);
  }
  if (payload.avatarUrl !== undefined && user.avatar === undefined) {
    user.avatar = cleanText(payload.avatarUrl, 300);
  }

  return { user, education, jobPreference };
}

function buildUserProfile(row = {}) {
  const education = normalizeEducation(safeJson(row.education, {}));
  const jobPreference = normalizeJobPreference(safeJson(row.job_preference, {}));
  const flat = {
    nickName: row.nickname || '',
    avatarUrl: row.avatar || '/images/default-avatar.png',
    school: education.school,
    major: education.major,
    degree: education.degree,
    gradYear: education.gradYear,
    status: jobPreference.status,
    targetRoles: jobPreference.targetRoles,
    targetLocation: jobPreference.targetLocation,
    targetIndustries: jobPreference.targetIndustries,
    jobTypes: jobPreference.jobTypes,
    workAuthorization: jobPreference.workAuthorization,
    expectedSalaryRange: jobPreference.expectedSalaryRange,
    skills: jobPreference.skills,
    userId: row.id,
    openid: row.openid,
    education,
    jobPreference
  };
  flat.completeness = getProfileCompleteness(flat);
  return flat;
}

function getProfileCompleteness(profile = {}) {
  const checks = [
    profile.nickName,
    profile.school,
    profile.major,
    profile.degree,
    profile.gradYear,
    profile.status,
    (profile.targetRoles || []).length > 0,
    (profile.targetLocation || []).length > 0,
    (profile.targetIndustries || []).length > 0 || (profile.jobTypes || []).length > 0,
    (profile.skills || []).length > 0
  ];
  return checks.reduce((sum, item) => sum + (item ? 10 : 0), 0);
}

module.exports = {
  USER_PROFILE_SCHEMA,
  normalizeEducation,
  normalizeJobPreference,
  normalizeProfilePayload,
  buildUserProfile,
  getProfileCompleteness
};
