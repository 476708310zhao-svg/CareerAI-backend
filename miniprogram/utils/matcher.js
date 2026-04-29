// utils/matcher.js — 个性化匹配引擎
// 根据用户 profile 匹配岗位关键词、题目分类、面试预设

// ── 专业 → 岗位关键词 ──────────────────────────────────────────────────────
const MAJOR_JOB_MAP = [
  { pattern: /计算机|软件|CS|computer science|information technology|信息技术/i,
    keywords: ['Software Engineer', 'SWE', 'Developer', 'Backend', 'Frontend', 'Full Stack', '开发工程师'] },
  { pattern: /数据|统计|data science|analytics|信息管理/i,
    keywords: ['Data Analyst', 'Data Scientist', 'Analytics', '数据分析', 'Business Intelligence'] },
  { pattern: /人工智能|机器学习|AI|深度学习|computer vision|NLP/i,
    keywords: ['Machine Learning', 'ML Engineer', 'AI Engineer', '算法工程师', 'Research Scientist'] },
  { pattern: /前端|frontend|web design|HCI|交互/i,
    keywords: ['Frontend', 'UI Developer', 'Web Developer', '前端工程师', 'React', 'Vue'] },
  { pattern: /金融|finance|经济|accounting|会计|金工|quant/i,
    keywords: ['Financial Analyst', 'Quant', 'Investment', '金融分析', 'Risk', '量化'] },
  { pattern: /产品|product management|商业分析|business analytics/i,
    keywords: ['Product Manager', 'PM', '产品经理', 'Business Analyst', '产品运营'] },
  { pattern: /市场|marketing|广告|传播|公关/i,
    keywords: ['Marketing', 'Growth', 'Brand', '市场营销', 'Content', '运营'] },
  { pattern: /咨询|consulting|管理|MBA/i,
    keywords: ['Consultant', 'Strategy', 'Management', '咨询', 'Operations'] },
  { pattern: /设计|design|视觉|UX|UI/i,
    keywords: ['UX Designer', 'UI Designer', '设计师', 'Product Design'] },
  { pattern: /运营|operation|供应链|logistics/i,
    keywords: ['Operations', 'Supply Chain', '运营', '项目管理'] },
];

// ── 专业 → 题目分类 ──────────────────────────────────────────────────────
const MAJOR_QUESTION_MAP = [
  { pattern: /计算机|软件|CS|information technology/i,
    categories: ['algorithm', 'system', 'backend'] },
  { pattern: /数据|统计|data science|analytics/i,
    categories: ['python', 'database', 'algorithm'] },
  { pattern: /人工智能|机器学习|AI|深度学习/i,
    categories: ['python', 'algorithm', 'system'] },
  { pattern: /前端|frontend|HCI|交互|design/i,
    categories: ['frontend', 'javascript', 'algorithm'] },
  { pattern: /金融|finance|经济|quant/i,
    categories: ['behavior', 'python', 'database'] },
  { pattern: /产品|product|商业/i,
    categories: ['behavior', 'system'] },
  { pattern: /市场|marketing|咨询|管理/i,
    categories: ['behavior'] },
];

// ── 专业 + 目标岗位 → 面试类型 ──────────────────────────────────────────
const MAJOR_INTERVIEW_MAP = [
  { pattern: /计算机|软件|CS|数据|AI|机器学习|frontend|前端|backend/i, type: 'technical' },
  { pattern: /产品|product/i,                                           type: 'product' },
  { pattern: /金融|finance|咨询|consulting|MBA/i,                       type: 'case' },
];

const ROLE_INTERVIEW_MAP = [
  { pattern: /software|engineer|developer|SWE|算法|数据|ML|AI|backend|frontend/i, type: 'technical' },
  { pattern: /product|PM|产品/i,                                                   type: 'product' },
  { pattern: /consult|analyst|finance|quant|investment/i,                          type: 'case' },
  { pattern: /marketing|运营|operation/i,                                          type: 'behavior' },
];

// ── 状态 → 难度 ───────────────────────────────────────────────────────────
const STATUS_DIFFICULTY_MAP = {
  student: 'easy',
  fresh:   'easy',
  working: 'medium',
};

// ═══════════════════════════════════════════════════════════════════════════
// 对外 API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 从 profile 提取岗位关键词数组
 */
function getJobKeywords(profile) {
  const keywords = new Set();
  const text = [(profile.major || ''), ...(profile.targetRoles || [])].join(' ');

  // 专业匹配
  for (const m of MAJOR_JOB_MAP) {
    if (m.pattern.test(text)) {
      m.keywords.forEach(k => keywords.add(k));
    }
  }

  // 直接加入 targetRoles
  (profile.targetRoles || []).forEach(r => keywords.add(r));

  // 加入技能关键词
  (profile.skills || []).forEach(s => keywords.add(s));

  return [...keywords];
}

/**
 * 对 jobs 列表按 profile 打分排序，返回附带 matchScore + matchReason 的列表
 * @param {Object} profile  userProfile
 * @param {Array}  jobs     原始 job 列表
 * @returns {Array} 排序后的 jobs
 */
function matchJobs(profile, jobs) {
  if (!profile || !jobs || !jobs.length) return jobs;
  const keywords = getJobKeywords(profile);
  if (!keywords.length) return jobs;

  return jobs.map(job => {
    const haystack = [job.title, job.company, job.description || ''].join(' ').toLowerCase();
    let score = 0;
    const matched = [];

    for (const kw of keywords) {
      if (haystack.includes(kw.toLowerCase())) {
        score += (job.title || '').toLowerCase().includes(kw.toLowerCase()) ? 3 : 1;
        if (matched.length < 2) matched.push(kw);
      }
    }

    return {
      ...job,
      matchScore:  score,
      isMatch:     score > 0,
      matchReason: matched.length ? '匹配' + matched.slice(0, 2).join('/') : '',
    };
  }).sort((a, b) => b.matchScore - a.matchScore);
}

/**
 * 返回推荐的题目分类数组（按优先级）
 */
function getRecommendedCategories(profile) {
  const text = [(profile.major || ''), ...(profile.targetRoles || [])].join(' ');

  for (const m of MAJOR_QUESTION_MAP) {
    if (m.pattern.test(text)) return m.categories;
  }
  return ['behavior']; // 通用兜底
}

/**
 * 返回 AI 面试预设配置
 * @returns {{ type, position, difficulty }}
 */
function getInterviewPreset(profile) {
  const text = [(profile.major || ''), ...(profile.targetRoles || [])].join(' ');

  // 面试类型
  let type = 'behavior'; // 兜底
  for (const m of ROLE_INTERVIEW_MAP) {
    if (m.pattern.test(text)) { type = m.type; break; }
  }
  if (type === 'behavior') {
    for (const m of MAJOR_INTERVIEW_MAP) {
      if (m.pattern.test(text)) { type = m.type; break; }
    }
  }

  // 目标岗位
  const position = (profile.targetRoles && profile.targetRoles[0]) || _inferPosition(profile.major) || '';

  // 难度
  const difficulty = STATUS_DIFFICULTY_MAP[profile.status] || 'easy';

  return { type, position, difficulty };
}

/**
 * 计算资料完整度（0-100）
 */
function getProfileCompleteness(profile) {
  if (!profile) return 0;
  const checks = [
    { field: profile.nickName,                              weight: 10 },
    { field: profile.school,                               weight: 15 },
    { field: profile.major,                                weight: 15 },
    { field: profile.status,                               weight: 10 },
    { field: profile.gradYear,                             weight: 10 },
    { field: (profile.targetRoles || []).length > 0,       weight: 20 },
    { field: (profile.targetLocation || []).length > 0,    weight: 10 },
    { field: (profile.skills || []).length > 0,            weight: 10 },
  ];
  return checks.reduce((sum, c) => sum + (c.field ? c.weight : 0), 0);
}

/**
 * 返回缺失字段提示文字（给 profile 完善引导使用）
 */
function getMissingHints(profile) {
  const hints = [];
  if (!profile || !profile.major)                                hints.push('填写专业');
  if (!profile || !(profile.targetRoles || []).length)           hints.push('选择目标岗位');
  if (!profile || !(profile.skills || []).length)                hints.push('添加技能标签');
  if (!profile || !profile.status)                               hints.push('设置求职状态');
  return hints;
}

// ── 内部辅助 ───────────────────────────────────────────────────────────────
function _inferPosition(major) {
  if (!major) return '';
  for (const m of MAJOR_JOB_MAP) {
    if (m.pattern.test(major)) return m.keywords[0];
  }
  return '';
}

module.exports = {
  getJobKeywords,
  matchJobs,
  getRecommendedCategories,
  getInterviewPreset,
  getProfileCompleteness,
  getMissingHints,
};
