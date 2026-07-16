const crypto = require('node:crypto');

const SKILL_ALIASES = {
  python: ['python'],
  java: ['java'],
  javascript: ['javascript', 'typescript', 'node.js', 'react'],
  sql: ['sql', 'mysql', 'postgresql'],
  ai: ['artificial intelligence', '生成式 ai', 'ai '],
  ml: ['machine learning', '机器学习', ' ml '],
  data: ['data', '数据分析', '数据科学'],
  cloud: ['cloud', 'aws', 'gcp', 'azure'],
  cplusplus: ['c++'],
  product: ['product', '产品经理', '产品设计']
};

function cleanText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function cleanList(value, limit = 30) {
  const list = Array.isArray(value) ? value : [];
  const seen = new Set();
  return list.map(item => String(item || '').trim()).filter(item => {
    const key = item.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

function hasAny(text, values) {
  return values.some(value => text.includes(String(value).toLowerCase()));
}

function detectedSkills(text) {
  return Object.entries(SKILL_ALIASES)
    .filter(([, aliases]) => aliases.some(alias => text.includes(alias)))
    .map(([key]) => key);
}

function normalizeSkill(value) {
  const text = cleanText(value);
  const entry = Object.entries(SKILL_ALIASES).find(([key, aliases]) => key === text || aliases.includes(text));
  return entry ? entry[0] : text;
}

function fingerprintJob(job) {
  const source = JSON.stringify({
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    description: job.description,
    requirements: job.requirements,
    visaSponsored: job.visaSponsored,
    citizenRequired: job.citizenRequired
  });
  return crypto.createHash('sha256').update(source).digest('hex').slice(0, 24);
}

function degreeRank(value) {
  const text = cleanText(value);
  if (/phd|doctor|博士/.test(text)) return 3;
  if (/master|硕士|研究生/.test(text)) return 2;
  if (/bachelor|本科|学士/.test(text)) return 1;
  return 0;
}

function requiredDegree(text) {
  if (/phd required|博士.{0,8}(必需|要求)|仅限博士/.test(text)) return 3;
  if (/master'?s? required|硕士.{0,8}(必需|要求)|研究生学历/.test(text)) return 2;
  if (/bachelor'?s?|本科|学士/.test(text)) return 1;
  return 0;
}

function buildJobMatch(job, profile, sponsorProfile = {}) {
  const text = cleanText([
    job.title, job.company, job.location, job.region, job.industry,
    job.description, ...(job.requirements || [])
  ].join(' '));
  const reasons = [];
  let qualificationScore = 100;

  const citizenRequired = Boolean(sponsorProfile.citizenRequired) || Boolean(job.citizenRequired) || /citizen(ship)? required|us citizens only|美国公民/.test(text);
  const authorization = cleanText(profile.workAuthorization || profile.visaStatus);
  if (citizenRequired && !/citizen|公民/.test(authorization)) {
    qualificationScore = 0;
    reasons.push('职位要求公民身份，当前工作授权不满足硬性要求');
  } else if (profile.sponsorNeeded && sponsorProfile.h1bSponsor === false) {
    qualificationScore = 45;
    reasons.push('你需要 Sponsor，但该岗位资料显示不提供 H1B Sponsor');
  } else if (profile.sponsorNeeded && (sponsorProfile.h1bSponsor === true || job.visaSponsored)) {
    reasons.push('岗位标注支持签证，与 Sponsor 需求相符');
  } else {
    reasons.push('未发现明确的工作授权冲突');
  }

  const minimumDegree = requiredDegree(text);
  const userDegree = degreeRank(profile.degree);
  if (minimumDegree && userDegree && userDegree < minimumDegree) {
    qualificationScore = Math.max(0, qualificationScore - 35);
    reasons.push('当前学位低于 JD 明确要求的最低学位');
  } else if (minimumDegree && userDegree >= minimumDegree) {
    reasons.push('学历满足 JD 最低要求');
  }

  const gradYears = /new grad|graduate|应届|毕业/.test(text)
    ? [...text.matchAll(/20\d{2}/g)].map(match => match[0])
    : [];
  if (gradYears.length && profile.graduationYear) {
    if (gradYears.includes(String(profile.graduationYear))) {
      reasons.push('毕业年份符合校招范围');
    } else {
      qualificationScore = Math.max(0, qualificationScore - 20);
      reasons.push('毕业年份可能不在 JD 标注的校招范围内');
    }
  }

  const major = cleanText(profile.major);
  const csRequired = /computer science|计算机|software engineering|软件工程/.test(text);
  if (csRequired && major) {
    if (/computer|计算机|software|软件|data|数据|electrical|电子/.test(major)) {
      reasons.push('专业背景与 JD 要求相关');
    } else {
      qualificationScore = Math.max(0, qualificationScore - 10);
      reasons.push('专业背景与 JD 要求存在一定偏差');
    }
  }

  const targetCities = cleanList(profile.targetCities);
  const locationMatch = !targetCities.length || hasAny(text, targetCities);
  if (!locationMatch) {
    qualificationScore = Math.max(0, qualificationScore - 15);
    reasons.push('岗位地点不在当前目标城市范围内');
  } else if (targetCities.length) {
    reasons.push('岗位地点符合求职目标');
  }

  const userSkills = cleanList(profile.skills).map(normalizeSkill);
  const requiredSkills = detectedSkills(text);
  const matchedSkills = requiredSkills.filter(skill => userSkills.includes(skill));
  const missingSkills = requiredSkills.filter(skill => !userSkills.includes(skill));
  const skillsScore = requiredSkills.length
    ? Math.round(matchedSkills.length / requiredSkills.length * 100)
    : Math.min(85, 45 + userSkills.length * 5);

  const targetRoles = cleanList(profile.targetRoles);
  const roleMatch = !targetRoles.length || hasAny(cleanText(job.title), targetRoles) || targetRoles.some(role => cleanText(role).includes(cleanText(job.title)));
  const targetIndustries = cleanList(profile.targetIndustries);
  const industryMatch = !targetIndustries.length || hasAny(text, targetIndustries);
  const projectText = cleanText(cleanList(profile.projects).join(' '));
  const projectHits = requiredSkills.filter(skill => projectText.includes(skill)).length;
  const fitScore = Math.min(100, (roleMatch ? 55 : 25) + (industryMatch ? 20 : 5) + Math.min(25, projectHits * 8));

  let score = Math.round(qualificationScore * 0.4 + skillsScore * 0.35 + fitScore * 0.25);
  if (qualificationScore === 0) score = Math.min(score, 35);
  const qualificationStatus = qualificationScore >= 80 ? 'eligible' : qualificationScore >= 40 ? 'partial' : 'ineligible';
  const recommendation = qualificationStatus === 'ineligible'
    ? 'not_recommended'
    : score >= 80 ? 'priority' : score >= 60 ? 'recommended' : 'cautious';

  const strengths = [];
  if (roleMatch) strengths.push('目标岗位方向匹配');
  if (locationMatch) strengths.push('工作地点匹配');
  matchedSkills.slice(0, 4).forEach(skill => strengths.push(`${skill} 技能匹配`));
  if (!strengths.length) strengths.push('具备可迁移的基础能力');

  const gaps = missingSkills.slice(0, 3).map(skill => `缺少 ${skill} 关键词或相关经历`);
  if (!roleMatch) gaps.push('岗位方向与当前目标岗位存在偏差');
  if (!gaps.length) gaps.push('项目成果的量化表达仍可加强');

  const actions = [
    matchedSkills[0] ? `在简历前半部分突出 ${matchedSkills[0]} 相关成果` : '补充与 JD 直接相关的项目成果',
    missingSkills[0] ? `补充 ${missingSkills[0]} 关键词或证明可迁移经验` : '用数字量化项目影响力'
  ];
  if (qualificationStatus !== 'eligible') actions.unshift('投递前确认招聘方的工作授权要求');

  return {
    score,
    qualificationStatus,
    qualificationReasons: reasons,
    recommendation,
    dimensions: { qualification: qualificationScore, skills: skillsScore, roleAndProjects: fitScore },
    strengths: strengths.slice(0, 5),
    gaps: gaps.slice(0, 4),
    actions: actions.slice(0, 3),
    matchedSkills,
    missingSkills,
    jobFingerprint: fingerprintJob(job)
  };
}

module.exports = { buildJobMatch, fingerprintJob };
