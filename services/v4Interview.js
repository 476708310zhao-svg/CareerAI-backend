const db = require('../db/database');
const membership = require('./v4Membership');
const aiRuntime = require('./v4AiRuntime');
const { applicationRefs, mergeCoreRefs } = require('../utils/coreEntityRefs');

function parseJson(value, fallback) { try { return JSON.parse(value); } catch (e) { return fallback; } }
function text(value, max = 1000) { return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max); }

const CAPABILITY_KEYWORDS = [
  ['数据分析', /data analysis|analytics|数据分析/i],
  ['Python', /python/i],
  ['SQL', /\bsql\b|mysql|postgres/i],
  ['JavaScript / TypeScript', /javascript|typescript|node\.js|react/i],
  ['机器学习', /machine learning|机器学习|\bml\b/i],
  ['系统设计', /system design|distributed systems|系统设计|分布式/i],
  ['产品与用户洞察', /product|user research|产品|用户研究/i],
  ['沟通协作', /communication|stakeholder|cross-functional|沟通|协作/i]
];

function roundFocus(round) {
  const value = text(round, 80).toLowerCase();
  if (/hr|人事/.test(value)) return ['求职动机与稳定性', '薪资和入职时间', '身份与工作授权的准确表达'];
  if (/final|终面/.test(value)) return ['业务判断与影响力', '复杂取舍和复盘', '对团队与岗位的长期理解'];
  if (/second|二面|interview_2/.test(value)) return ['技术深挖与方案权衡', '项目细节和个人贡献', '追问下的证据一致性'];
  if (/phone|screen|电面/.test(value)) return ['60 秒自我介绍', '核心经历与岗位匹配', '工作授权和基本求职条件'];
  return ['核心能力与 JD 对齐', 'STAR 行为题证据', '项目细节与个人贡献'];
}

function collectContentText(value, output = []) {
  if (typeof value === 'string' && value.trim()) output.push(text(value, 500));
  else if (Array.isArray(value)) value.forEach(item => collectContentText(item, output));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => collectContentText(item, output));
  return output;
}

function buildInterviewBrief({ space, application = {}, companyExperiences = [], starMaterials = [] }) {
  const snapshot = parseJson(application.job_snapshot, {});
  const jdText = text([
    snapshot.description, snapshot.jd, snapshot.requirements,
    application.notes, space.job_title
  ].filter(Boolean).join(' '), 12000);
  const capabilities = CAPABILITY_KEYWORDS.filter(([, pattern]) => pattern.test(jdText)).map(([label]) => label).slice(0, 6);
  if (!capabilities.length) capabilities.push(`围绕「${space.job_title || '目标岗位'}」准备可核验的项目证据`);
  const historicalPatterns = companyExperiences.slice(0, 5).map(item => ({
    title: text(item.title, 160),
    round: text(item.round || '轮次未标注', 80),
    evidence: text(item.content, 220)
  }));
  const materials = starMaterials.slice(0, 5).map(item => ({
    id: item.id,
    title: text(item.title, 160),
    organization: text(item.organization, 160),
    evidence: collectContentText(parseJson(item.content, {})).slice(0, 2).join('；')
  })).filter(item => item.title && item.evidence);
  return {
    company: space.company,
    jobTitle: space.job_title,
    round: space.round,
    companyFocus: [
      `用真实信息说明为什么选择 ${space.company || '该公司'}`,
      '核对官网业务、团队和岗位职责，不把第三方信息当成公司结论',
      '准备一项与岗位最相关的真实成果和一项失败复盘'
    ],
    jdCapabilities: capabilities,
    roundFocus: roundFocus(space.round),
    historicalPatterns,
    starMaterials: materials,
    reverseQuestions: [
      '这个岗位入职前 90 天最重要的成功标准是什么？',
      '团队目前最希望新成员解决的具体问题是什么？',
      '该轮面试之后的流程和评估重点是什么？',
      '团队如何支持新成员学习业务与获得反馈？'
    ],
    evidenceNotice: 'Brief 只整理已保存的 JD、公开面经和已核验经历；缺失信息会保留为空，不由 AI 补造。'
  };
}

function questionGroups(jobTitle) {
  const rows = db.prepare('SELECT question_id, title, answer, category, difficulty, tags FROM interview_questions WHERE is_published=1 ORDER BY is_featured DESC, sort_order, id LIMIT 60').all();
  const normalized = rows.map(row => ({ id: row.question_id, title: row.title, answer: row.answer, category: row.category, difficulty: row.difficulty, tags: parseJson(row.tags, []) }));
  const behavior = normalized.filter(item => item.category === 'behavior').slice(0, 10);
  const algorithm = normalized.filter(item => ['algorithm', 'technical', 'coding'].includes(item.category)).slice(0, 10);
  const frequent = normalized.slice(0, 12);
  const role = normalized.filter(item => `${item.title} ${item.tags.join(' ')}`.toLowerCase().includes(String(jobTitle || '').split(' ')[0].toLowerCase())).slice(0, 10);
  return { frequent, behavior, algorithm, role: role.length ? role : normalized.filter(item => !behavior.includes(item)).slice(0, 10) };
}

function ensureSpace(userId, applicationId) {
  const application = db.prepare('SELECT * FROM applications WHERE id=? AND user_id=?').get(applicationId, userId);
  if (!application) return null;
  const snapshot = parseJson(application.job_snapshot, {});
  const company = application.company || snapshot.company || '';
  const jobTitle = application.job_title || snapshot.title || '';
  const groups = questionGroups(jobTitle);
  const histories = db.prepare('SELECT id, title, content, round, created_at AS createdAt FROM experiences WHERE company LIKE ? ORDER BY id DESC LIMIT 8').all(`%${company}%`);
  db.prepare(`INSERT INTO interview_spaces_v4
    (user_id, application_id, company, job_title, interview_time, round, company_experiences, frequent_questions, algorithm_questions, behavior_questions, role_questions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, application_id) DO UPDATE SET company=excluded.company, job_title=excluded.job_title,
      interview_time=CASE WHEN excluded.interview_time!='' THEN excluded.interview_time ELSE interview_spaces_v4.interview_time END,
      round=excluded.round, company_experiences=excluded.company_experiences, updated_at=datetime('now')`)
    .run(userId, application.id, company, jobTitle, application.interview_time || '', application.progress_status || 'interview_1',
      JSON.stringify(histories), JSON.stringify(groups.frequent), JSON.stringify(groups.algorithm), JSON.stringify(groups.behavior), JSON.stringify(groups.role));
  return db.prepare('SELECT * FROM interview_spaces_v4 WHERE user_id=? AND application_id=?').get(userId, application.id);
}

function spaceView(row) {
  if (!row) return null;
  const refs = refsForSpace(row);
  const application = row.application_id
    ? db.prepare('SELECT * FROM applications WHERE id=? AND user_id=?').get(row.application_id, row.user_id) || {}
    : {};
  const companyExperiences = parseJson(row.company_experiences, []);
  const starMaterials = db.prepare("SELECT id, title, organization, content FROM career_experience_library WHERE user_id=? AND verified=1 AND archived_at='' AND type IN ('experience','project') ORDER BY updated_at DESC,id DESC LIMIT 8")
    .all(row.user_id);
  const brief = buildInterviewBrief({ space: row, application, companyExperiences, starMaterials });
  return { id: row.id, applicationId: row.application_id, jobId: refs.jobId, company: row.company, jobTitle: row.job_title,
    interviewTime: row.interview_time, round: row.round, preparationCompletion: row.preparation_completion,
    brief, companyExperiences, frequentQuestions: parseJson(row.frequent_questions, []),
    algorithmQuestions: parseJson(row.algorithm_questions, []), behaviorQuestions: parseJson(row.behavior_questions, []),
    roleQuestions: parseJson(row.role_questions, []), createdAt: row.created_at, updatedAt: row.updated_at, refs };
}

function refsForSpace(row, extra = {}) {
  if (!row) return mergeCoreRefs(extra);
  const application = row.application_id
    ? db.prepare('SELECT * FROM applications WHERE id=? AND user_id=?').get(row.application_id, row.user_id)
    : null;
  return mergeCoreRefs(applicationRefs(application || {}), {
    userId: row.user_id,
    applicationId: row.application_id,
    interviewSpaceId: row.id
  }, extra);
}

function sessionView(row) {
  if (!row) return null;
  const space = db.prepare('SELECT * FROM interview_spaces_v4 WHERE id=? AND user_id=?').get(row.space_id, row.user_id);
  const refs = refsForSpace(space, { interviewSessionId: row.id });
  return {
    id: row.id,
    spaceId: row.space_id,
    sessionType: row.session_type,
    status: row.status,
    aiModel: row.ai_model,
    promptVersion: row.prompt_version,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    refs
  };
}

function scoreAnswerFallback(answer, question, jobTitle) {
  const value = text(answer, 12000);
  const lengthScore = Math.min(100, 35 + Math.round(value.length / 4));
  const starHits = ['情况', '任务', '行动', '结果', 'situation', 'task', 'action', 'result'].filter(key => value.toLowerCase().includes(key)).length;
  const structure = Math.min(100, 55 + starHits * 8 + (/[。.!?]\s*/.test(value) ? 8 : 0));
  const expression = Math.min(100, 50 + Math.round(Math.min(value.length, 500) / 12));
  const roleTerms = String(jobTitle || '').toLowerCase().split(/\s+/).filter(term => term.length > 2);
  const matchHits = roleTerms.filter(term => value.toLowerCase().includes(term)).length;
  const jobMatch = Math.min(100, 58 + matchHits * 10 + (value.includes('%') || /\d/.test(value) ? 8 : 0));
  const content = Math.max(35, lengthScore);
  const average = Math.round((content + structure + expression + jobMatch) / 4);
  return { content, structure, expression, jobMatch, average,
    feedback: average >= 80 ? '内容较完整，继续保留具体行动和结果。' : '建议补充具体情境、个人行动与可核验结果，并回应岗位关键词。' };
}

function validScore(value) {
  return Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100;
}

async function scoreAnswer(answer, question, jobTitle) {
  const fallback = () => scoreAnswerFallback(answer, question, jobTitle);
  const generated = await aiRuntime.generate({
    systemPrompt: '你是 AI 面试教练。只评价用户本次回答，不得补写或虚构用户经历。按内容、STAR/逻辑结构、表达清晰度、岗位匹配四项各给 0-100 分，并给出一条可执行反馈。只输出 JSON：{"content":80,"structure":75,"expression":78,"jobMatch":72,"feedback":"建议"}。',
    userPrompt: JSON.stringify({
      jobTitle: text(jobTitle, 200),
      question: text(question, 1000),
      answer: text(answer, 12000)
    }),
    temperature: 0.2,
    maxTokens: 900,
    fallback,
    validate: value => !!(value && validScore(value.content) && validScore(value.structure)
      && validScore(value.expression) && validScore(value.jobMatch)
      && typeof value.feedback === 'string' && value.feedback.trim())
  });
  const value = generated.value;
  const scores = {
    content: Math.round(Number(value.content)),
    structure: Math.round(Number(value.structure)),
    expression: Math.round(Number(value.expression)),
    jobMatch: Math.round(Number(value.jobMatch))
  };
  return {
    ...scores,
    average: Math.round((scores.content + scores.structure + scores.expression + scores.jobMatch) / 4),
    feedback: text(value.feedback, 1000),
    generation: aiRuntime.safeMetadata(generated)
  };
}

function startSession(userId, spaceId, type) {
  const space = db.prepare('SELECT * FROM interview_spaces_v4 WHERE id=? AND user_id=?').get(spaceId, userId);
  if (!space) { const error = new Error('面试空间不存在'); error.status = 404; throw error; }
  membership.consumeQuota(userId, 'interview_monthly', 1, 'month');
  const result = db.prepare(`INSERT INTO interview_sessions_v4 (user_id, space_id, session_type, ai_model, prompt_version) VALUES (?, ?, ?, ?, ?)`)
    .run(userId, spaceId, ['mock', 'star'].includes(type) ? type : 'mock', process.env.INTERVIEW_AI_MODEL || aiRuntime.getStatus().model, 'interview-v4.0-s4-2');
  return db.prepare('SELECT * FROM interview_sessions_v4 WHERE id=?').get(result.lastInsertRowid);
}

function completeSession(userId, sessionId) {
  const session = db.prepare('SELECT s.*, p.job_title FROM interview_sessions_v4 s JOIN interview_spaces_v4 p ON p.id=s.space_id WHERE s.id=? AND s.user_id=?').get(sessionId, userId);
  if (!session) { const error = new Error('训练会话不存在'); error.status = 404; throw error; }
  if (session.status === 'completed') return db.prepare('SELECT * FROM interview_reports_v4 WHERE session_id=?').get(session.id);
  const answers = db.prepare('SELECT * FROM interview_answers_v4 WHERE session_id=? AND user_id=? ORDER BY id').all(session.id, userId);
  if (!answers.length) { const error = new Error('至少完成一道题后才能生成报告'); error.status = 400; throw error; }
  const avg = key => Math.round(answers.reduce((sum, item) => sum + Number(item[key] || 0), 0) / answers.length);
  const dimensions = { content: avg('content_score'), structure: avg('structure_score'), expression: avg('expression_score'), jobMatch: avg('job_match_score') };
  const overall = Math.round(Object.values(dimensions).reduce((a, b) => a + b, 0) / 4);
  const labels = { content: '内容', structure: '结构', expression: '表达', jobMatch: '岗位匹配' };
  const sorted = Object.entries(dimensions).sort((a, b) => a[1] - b[1]);
  const weaknesses = sorted.slice(0, 2).map(([key, score]) => ({ key, name: labels[key], score }));
  const strengths = sorted.slice(-2).reverse().map(([key, score]) => ({ key, name: labels[key], score }));
  const feedback = answers.map(item => ({ answerId: item.id, question: item.question, feedback: item.feedback,
    scores: { content: item.content_score, structure: item.structure_score, expression: item.expression_score, jobMatch: item.job_match_score } }));
  const result = db.transaction(() => {
    const inserted = db.prepare(`INSERT OR REPLACE INTO interview_reports_v4
      (session_id, user_id, space_id, overall_score, dimensions, strengths, weaknesses, question_feedback, summary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(session.id, userId, session.space_id, overall, JSON.stringify(dimensions), JSON.stringify(strengths), JSON.stringify(weaknesses), JSON.stringify(feedback),
        `本次完成 ${answers.length} 道题，综合评分 ${overall}。优先提升${weaknesses.map(item => item.name).join('、')}。`);
    db.prepare("UPDATE interview_sessions_v4 SET status='completed', completed_at=datetime('now') WHERE id=?").run(session.id);
    db.prepare('UPDATE interview_spaces_v4 SET preparation_completion=MIN(100, preparation_completion+20), updated_at=datetime(\'now\') WHERE id=?').run(session.space_id);
    weaknesses.forEach(item => db.prepare(`INSERT OR IGNORE INTO today_tasks_v4
      (user_id, source_type, source_id, local_key, task_type, title, detail, priority, url, updated_at)
      VALUES (?, 'interview_report', ?, ?, 'interview_repractice', ?, ?, 'high', ?, datetime('now'))`)
      .run(userId, inserted.lastInsertRowid, `interview_repractice_${inserted.lastInsertRowid}_${item.key}`,
        `复练面试${item.name}`, `当前 ${item.score} 分；重新回答一题，并根据报告反馈检查证据、结构和岗位关联。`,
        `/package-ai/pages/interview-space/interview-space?id=${session.space_id}&focus=${item.key}`));
    const nextAction = `复练面试${weaknesses.map(item => item.name).join('、')}`;
    db.prepare(`UPDATE applications SET next_action=CASE
      WHEN TRIM(COALESCE(next_action,''))='' OR next_action LIKE '复练面试%' THEN ? ELSE next_action END,
      updated_at=datetime('now')
      WHERE id=(SELECT application_id FROM interview_spaces_v4 WHERE id=? AND user_id=?) AND user_id=?`)
      .run(nextAction, session.space_id, userId, userId);
    return db.prepare('SELECT * FROM interview_reports_v4 WHERE session_id=?').get(session.id);
  })();
  return result;
}

function reportView(row) {
  if (!row) return null;
  const space = db.prepare('SELECT * FROM interview_spaces_v4 WHERE id=? AND user_id=?').get(row.space_id, row.user_id);
  const refs = refsForSpace(space, {
    interviewSessionId: row.session_id,
    interviewReportId: row.id
  });
  const weaknesses = parseJson(row.weaknesses, []);
  return { id: row.id, sessionId: row.session_id, spaceId: row.space_id, overallScore: row.overall_score,
    dimensions: parseJson(row.dimensions, {}), strengths: parseJson(row.strengths, []), weaknesses,
    practicePlan: weaknesses.map(item => ({
      dimension: item.key, label: item.name, currentScore: item.score,
      task: `重新完成一道${item.name}专项题，并用报告反馈自检后再提交`,
      url: `/package-ai/pages/interview-space/interview-space?id=${row.space_id}&focus=${item.key}`
    })),
    questionFeedback: parseJson(row.question_feedback, []), summary: row.summary, createdAt: row.created_at, refs };
}

module.exports = { buildInterviewBrief, ensureSpace, spaceView, refsForSpace, sessionView, scoreAnswer, startSession, completeSession, reportView };
