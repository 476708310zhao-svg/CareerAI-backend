// Evidence shown beside the existing match score. It never infers experience
// from a name, school or job title and does not send resume text to a model.
const SKILLS = [
  ['Python', /\bpython\b/i], ['JavaScript', /\bjavascript\b/i],
  ['TypeScript', /\btypescript\b/i], ['React', /\breact(?:\.js)?\b/i],
  ['Node.js', /\bnode(?:\.js)?\b/i], ['SQL', /\bsql\b/i],
  ['Excel', /\bexcel\b/i], ['Tableau', /\btableau\b/i],
  ['Power BI', /\bpower\s*bi\b/i], ['AWS', /\baws\b/i],
  ['Docker', /\bdocker\b/i], ['Kubernetes', /\bkubernetes\b/i],
  ['数据分析', /数据分析|\bdata\s+analys(?:is|t)\b/i],
  ['机器学习', /机器学习|\bmachine\s+learning\b/i],
  ['A/B 测试', /\ba\s*\/\s*b\s+test(?:ing)?\b/i]
];

function clean(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}

function excerpt(value, pattern) {
  const text = clean(value);
  const match = pattern.exec(text);
  if (!match) return '';
  const start = Math.max(0, match.index - 65);
  const end = Math.min(text.length, match.index + match[0].length + 95);
  return (start ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

function resumeSections(resume) {
  const r = resume || {};
  const sections = [];
  const skills = Array.isArray(r.skills) ? r.skills.map(item => typeof item === 'string' ? item : item && (item.name || item.label)).filter(Boolean) : [];
  if (skills.length) sections.push({ source: '简历技能', text: skills.join('、') });
  for (const project of (Array.isArray(r.projects) ? r.projects : []).slice(0, 20)) {
    if (!project || typeof project !== 'object') continue;
    sections.push({ source: '项目经历' + (project.name ? '「' + clean(project.name).slice(0, 30) + '」' : ''),
      text: [project.role, project.desc, project.description].filter(Boolean).join(' ') });
  }
  for (const work of (Array.isArray(r.workExp) ? r.workExp : []).slice(0, 20)) {
    if (!work || typeof work !== 'object') continue;
    sections.push({ source: '工作经历' + (work.role || work.title ? '「' + clean(work.role || work.title).slice(0, 30) + '」' : ''),
      text: [work.role, work.title, work.desc, work.description].filter(Boolean).join(' ') });
  }
  return sections.filter(section => clean(section.text));
}

function buildEvidence(resume, job) {
  const jd = [job && (job.descriptionText || job.description),
    ...(Array.isArray(job && job.requirements) ? job.requirements : [])].filter(Boolean).join(' ');
  if (!clean(jd)) return {
    status: 'insufficient_jd', matches: [], gaps: [],
    nextActions: ['岗位描述尚未提供可核对的要求，请先查看职位原文。']
  };
  const sections = resumeSections(resume);
  if (!sections.length) return {
    status: 'insufficient_resume', matches: [], gaps: [],
    nextActions: ['在线简历尚无技能、项目或工作经历，补充真实内容后再比较。']
  };

  const matches = [];
  const gaps = [];
  for (const [label, pattern] of SKILLS) {
    const jobQuote = excerpt(jd, pattern);
    if (!jobQuote) continue;
    const found = sections.find(section => pattern.test(section.text));
    if (found) matches.push({ label, jobQuote, resumeSource: found.source,
      resumeQuote: excerpt(found.text, pattern) });
    else gaps.push({ label, jobQuote,
      note: '当前在线简历的技能、项目及工作经历中未找到对应表述；不代表你不具备该能力。' });
  }

  const nextActions = gaps.length
    ? [`核实是否具备“${gaps[0].label}”相关经历；如具备，在简历中补充真实项目依据。`]
    : matches.length ? [`优先展示“${matches[0].label}”的真实成果，并对照岗位原文调整简历顺序。`]
      : ['岗位描述中未识别到可核对的技能要求，请人工阅读原文后再判断。'];
  return { status: matches.length || gaps.length ? 'supported' : 'no_skill_evidence',
    matches: matches.slice(0, 4), gaps: gaps.slice(0, 4), nextActions };
}

module.exports = { buildEvidence };
