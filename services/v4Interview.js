const db = require('../db/database');
const membership = require('./v4Membership');

function parseJson(value, fallback) { try { return JSON.parse(value); } catch (e) { return fallback; } }
function text(value, max = 1000) { return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max); }

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
  return { id: row.id, applicationId: row.application_id, company: row.company, jobTitle: row.job_title,
    interviewTime: row.interview_time, round: row.round, preparationCompletion: row.preparation_completion,
    companyExperiences: parseJson(row.company_experiences, []), frequentQuestions: parseJson(row.frequent_questions, []),
    algorithmQuestions: parseJson(row.algorithm_questions, []), behaviorQuestions: parseJson(row.behavior_questions, []),
    roleQuestions: parseJson(row.role_questions, []), createdAt: row.created_at, updatedAt: row.updated_at };
}

function scoreAnswer(answer, question, jobTitle) {
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

function startSession(userId, spaceId, type) {
  const space = db.prepare('SELECT * FROM interview_spaces_v4 WHERE id=? AND user_id=?').get(spaceId, userId);
  if (!space) { const error = new Error('面试空间不存在'); error.status = 404; throw error; }
  membership.consumeQuota(userId, 'interview_monthly', 1, 'month');
  const result = db.prepare(`INSERT INTO interview_sessions_v4 (user_id, space_id, session_type, ai_model, prompt_version) VALUES (?, ?, ?, ?, ?)`)
    .run(userId, spaceId, ['mock', 'star'].includes(type) ? type : 'mock', process.env.INTERVIEW_AI_MODEL || 'deepseek-chat', 'interview-v4.0-s4-1');
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
      (user_id, source_type, source_id, title, detail, priority) VALUES (?, 'interview_report', ?, ?, ?, 'high')`)
      .run(userId, inserted.lastInsertRowid, `补强面试${item.name}`, `当前 ${item.score} 分，完成一次针对性复练。`));
    return db.prepare('SELECT * FROM interview_reports_v4 WHERE session_id=?').get(session.id);
  })();
  return result;
}

function reportView(row) { return row ? { id: row.id, sessionId: row.session_id, spaceId: row.space_id, overallScore: row.overall_score,
  dimensions: parseJson(row.dimensions, {}), strengths: parseJson(row.strengths, []), weaknesses: parseJson(row.weaknesses, []),
  questionFeedback: parseJson(row.question_feedback, []), summary: row.summary, createdAt: row.created_at } : null; }

module.exports = { ensureSpace, spaceView, scoreAnswer, startSession, completeSession, reportView };
