function scoreResumeContent(content = {}) {
  const text = value => typeof value === 'string' ? value.trim() : '';
  const list = value => Array.isArray(value) ? value : [];
  const basic = content.basicInfo || {};
  const experiences = list(content.workExp).concat(list(content.experience), list(content.projects));
  const descriptions = experiences.map(item => typeof item === 'string' ? text(item)
    : text(item && (item.desc || item.description || item.summary)));
  const skills = list(content.skills).filter(item => text(item) || text(item && (item.name || item.title)));
  const education = list(content.education);
  const roles = list(content.jobPreference && content.jobPreference.targetRoles);
  const checks = [
    { label: '基本信息', max: 15, points: (text(basic.name) ? 7 : 0) + (text(basic.phone) || text(basic.email) ? 8 : 0) },
    { label: '个人概述', max: 15, points: text(content.summary).length >= 40 ? 15 : text(content.summary).length >= 15 ? 8 : 0 },
    { label: '工作或项目经历', max: 30, points: (experiences.length ? 15 : 0) + (descriptions.some(item => item.length >= 40) ? 15 : 0) },
    { label: '教育经历', max: 15, points: (education.some(item => text(item && item.school)) ? 8 : 0)
      + (education.some(item => text(item && item.degree)) ? 7 : 0) },
    { label: '技能', max: 15, points: (skills.length ? 8 : 0) + (skills.length >= 3 ? 7 : 0) },
    { label: '求职方向', max: 10, points: roles.some(text) ? 10 : 0 }
  ];
  return { score: checks.reduce((total, check) => total + check.points, 0), checks };
}

module.exports = { scoreResumeContent };
