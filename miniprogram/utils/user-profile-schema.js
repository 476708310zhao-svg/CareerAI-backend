const PROFILE_SCHEMA = {
  version: 'user_profile_standard_v1',
  options: {
    statusOptions: [
      { value: 'student', label: '在读学生' },
      { value: 'fresh', label: '应届毕业' },
      { value: 'working', label: '已工作' },
      { value: 'switching', label: '转行/换岗' }
    ],
    degreeOptions: [
      { value: 'associate', label: '专科' },
      { value: 'bachelor', label: '本科' },
      { value: 'master', label: '硕士' },
      { value: 'phd', label: '博士' },
      { value: 'mba', label: 'MBA' },
      { value: 'other', label: '其他' }
    ],
    gradYearOptions: ['2024', '2025', '2026', '2027', '2028', '2029', '2030'],
    roleOptions: [
      '软件工程师', '前端工程师', '后端工程师', '全栈工程师', 'AI/机器学习',
      '数据分析师', '数据科学家', '产品经理', '商业分析师', 'UX/UI 设计师',
      '运营', '市场营销', '咨询顾问', '金融分析师', '量化研究员'
    ],
    locationOptions: ['国内', '美国', '加拿大', '英国', '新加坡', '澳大利亚', '香港', '欧洲', '远程'],
    industryOptions: ['互联网/科技', '金融/投行', '咨询', '快消/零售', '新能源/汽车', '医疗/生物', '教育', '游戏/文娱', '制造业'],
    jobTypeOptions: [
      { value: 'internship', label: '实习' },
      { value: 'campus', label: '校招/Graduate' },
      { value: 'fulltime', label: '全职' },
      { value: 'parttime', label: '兼职' },
      { value: 'remote', label: '远程' }
    ],
    workAuthOptions: [
      { value: 'no_limit', label: '无特殊要求' },
      { value: 'cpt', label: 'CPT' },
      { value: 'opt', label: 'OPT' },
      { value: 'h1b', label: '需要 H-1B 支持' },
      { value: 'sponsor', label: '需要雇主担保' },
      { value: 'local_work_right', label: '已有当地工作权利' }
    ],
    skillOptions: [
      'Python', 'Java', 'JavaScript', 'TypeScript', 'C++', 'Go',
      'React', 'Vue', 'Node.js', 'SQL', '机器学习',
      '数据分析', 'AWS', 'Docker', 'Git', '产品管理'
    ]
  }
};

function normalizeMultiValue(value) {
  if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value.split(/[,，、\s]+/).map(item => item.trim()).filter(Boolean);
  }
  return [];
}

function normalizeProfileStorage(profile) {
  const source = profile || {};
  const education = source.education || {};
  const jobPreference = source.jobPreference || {};
  return Object.assign({}, source, {
    nickName: source.nickName || source.nickname || '',
    avatarUrl: source.avatarUrl || source.avatar || '/images/default-avatar.png',
    school: source.school || education.school || '',
    major: source.major || education.major || '',
    degree: source.degree || education.degree || '',
    gradYear: source.gradYear || education.gradYear || '',
    status: source.status || jobPreference.status || '',
    targetRoles: normalizeMultiValue(source.targetRoles || jobPreference.targetRoles),
    targetLocation: normalizeMultiValue(source.targetLocation || jobPreference.targetLocation || jobPreference.targetLocations),
    targetIndustries: normalizeMultiValue(source.targetIndustries || jobPreference.targetIndustries),
    jobTypes: normalizeMultiValue(source.jobTypes || jobPreference.jobTypes),
    workAuthorization: source.workAuthorization || jobPreference.workAuthorization || '',
    expectedSalaryRange: source.expectedSalaryRange || jobPreference.expectedSalaryRange || '',
    skills: normalizeMultiValue(source.skills || jobPreference.skills)
  });
}

function buildProfilePayload(profile) {
  const u = normalizeProfileStorage(profile);
  return {
    nickname: u.nickName,
    avatar: u.avatarUrl,
    education: {
      school: u.school,
      major: u.major,
      degree: u.degree,
      gradYear: u.gradYear
    },
    jobPreference: {
      status: u.status,
      targetRoles: normalizeMultiValue(u.targetRoles).slice(0, 5),
      targetLocation: normalizeMultiValue(u.targetLocation).slice(0, 6),
      targetIndustries: normalizeMultiValue(u.targetIndustries).slice(0, 6),
      jobTypes: normalizeMultiValue(u.jobTypes).slice(0, 4),
      workAuthorization: u.workAuthorization,
      expectedSalaryRange: u.expectedSalaryRange,
      skills: normalizeMultiValue(u.skills).slice(0, 20)
    }
  };
}

function optionLabels(options) {
  return (options || []).map(item => typeof item === 'string' ? item : item.label);
}

module.exports = {
  PROFILE_SCHEMA,
  normalizeMultiValue,
  normalizeProfileStorage,
  buildProfilePayload,
  optionLabels
};
