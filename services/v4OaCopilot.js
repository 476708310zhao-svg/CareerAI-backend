'use strict';

const crypto = require('node:crypto');
const db = require('../db/database');

const QUESTION_TYPES = Object.freeze({
  algorithm: '算法与编程',
  numerical: '数理与图表',
  verbal: '言语理解',
  logical: '逻辑推理',
  situational: '情景判断',
  case: 'Case Study',
  technical: '专业知识'
});
const PLAN_STATUSES = new Set(['active', 'completed', 'archived']);
const MISTAKE_STATUSES = new Set(['learning', 'mastered']);

function clean(value, max = 1000) {
  return String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanMultiline(value, max = 4000) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim().slice(0, max);
}

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch (problem) { return fallback; }
}

function problem(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function dateOnly(value) {
  const text = clean(value, 40);
  if (!text) return '';
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  const parsed = match ? new Date(`${match[1]}T00:00:00Z`) : null;
  if (!match || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== match[1]) {
    throw problem('INVALID_DATE', '日期格式必须为 YYYY-MM-DD');
  }
  return match[1];
}

function ownedApplication(userId, id) {
  if (!id) return null;
  const row = db.prepare('SELECT * FROM applications WHERE id=? AND user_id=?').get(Number(id), userId);
  if (!row) throw problem('APPLICATION_NOT_FOUND', '关联申请不存在', 404);
  return row;
}

function ownedPlan(userId, id) {
  const row = db.prepare('SELECT * FROM oa_training_plans_v4 WHERE id=? AND user_id=?').get(Number(id), userId);
  if (!row) throw problem('OA_PLAN_NOT_FOUND', 'OA 训练计划不存在', 404);
  return row;
}

function ownedSession(userId, id) {
  const row = db.prepare('SELECT * FROM oa_practice_sessions_v4 WHERE id=? AND user_id=?').get(Number(id), userId);
  if (!row) throw problem('OA_SESSION_NOT_FOUND', 'OA 练习记录不存在', 404);
  return row;
}

function planView(row) {
  const progress = db.prepare(`SELECT COALESCE(SUM(elapsed_seconds),0) AS seconds, COUNT(*) AS sessions
    FROM oa_practice_sessions_v4 WHERE user_id=? AND plan_id=? AND status='completed'
      AND started_at >= datetime('now','-6 days')`).get(row.user_id, row.id);
  return {
    id: row.id,
    applicationId: row.application_id || null,
    jobId: row.job_id || '',
    company: row.company,
    role: row.role || '',
    targetDate: row.target_date || '',
    weeklyMinutes: row.weekly_minutes,
    weeklyCompletedMinutes: Math.round(Number(progress.seconds || 0) / 60),
    weeklySessions: Number(progress.sessions || 0),
    focusTypes: parseJson(row.focus_types, []),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function sessionView(row) {
  return {
    id: row.id,
    planId: row.plan_id,
    questionType: row.question_type,
    questionTypeLabel: QUESTION_TYPES[row.question_type] || row.question_type,
    plannedSeconds: row.planned_seconds,
    elapsedSeconds: row.elapsed_seconds,
    totalQuestions: row.total_questions,
    correctCount: row.correct_count,
    accuracy: row.total_questions > 0 ? Math.round(row.correct_count / row.total_questions * 100) : null,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at || '',
    resultSource: row.status === 'completed' ? 'user_reported' : ''
  };
}

function mistakeView(row) {
  return {
    id: row.id,
    planId: row.plan_id,
    sessionId: row.session_id || null,
    questionKey: row.question_key,
    questionType: row.question_type,
    questionTypeLabel: QUESTION_TYPES[row.question_type] || row.question_type,
    prompt: row.prompt,
    userAnswer: row.user_answer || '',
    correctAnswer: row.correct_answer || '',
    notes: row.notes || '',
    status: row.status,
    lastPracticedAt: row.last_practiced_at,
    updatedAt: row.updated_at
  };
}

function createPlan(userId, payload = {}) {
  const application = ownedApplication(userId, payload.applicationId);
  const company = clean(payload.company || (application && application.company), 160);
  if (!company) throw problem('COMPANY_REQUIRED', '请填写 OA 对应公司');
  const focusTypes = [...new Set((Array.isArray(payload.focusTypes) ? payload.focusTypes : [])
    .map(value => clean(value, 40)).filter(value => QUESTION_TYPES[value]))];
  if (!focusTypes.length) throw problem('FOCUS_TYPES_REQUIRED', '请至少选择一种训练题型');
  const weeklyMinutes = Math.max(30, Math.min(1200, Number(payload.weeklyMinutes) || 180));
  const targetDate = dateOnly(payload.targetDate);
  const result = db.prepare(`INSERT INTO oa_training_plans_v4
    (user_id, application_id, job_id, company, role, target_date, weekly_minutes, focus_types)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(userId, application && application.id,
      clean(payload.jobId || (application && (application.source_job_id || application.job_id)), 160),
      company, clean(payload.role || (application && application.job_title), 160), targetDate,
      weeklyMinutes, JSON.stringify(focusTypes));
  return planView(ownedPlan(userId, result.lastInsertRowid));
}

function updatePlan(userId, id, payload = {}) {
  const current = ownedPlan(userId, id);
  const status = payload.status === undefined ? current.status : clean(payload.status, 30);
  if (!PLAN_STATUSES.has(status)) throw problem('INVALID_PLAN_STATUS', 'OA 计划状态无效');
  const focusTypes = payload.focusTypes === undefined ? parseJson(current.focus_types, [])
    : [...new Set((Array.isArray(payload.focusTypes) ? payload.focusTypes : [])
      .map(value => clean(value, 40)).filter(value => QUESTION_TYPES[value]))];
  if (!focusTypes.length) throw problem('FOCUS_TYPES_REQUIRED', '请至少保留一种训练题型');
  const company = payload.company === undefined ? current.company : clean(payload.company, 160);
  if (!company) throw problem('COMPANY_REQUIRED', '请填写 OA 对应公司');
  db.prepare(`UPDATE oa_training_plans_v4 SET company=?, role=?, target_date=?, weekly_minutes=?,
    focus_types=?, status=?, updated_at=datetime('now') WHERE id=? AND user_id=?`).run(
    company,
    payload.role === undefined ? current.role : clean(payload.role, 160),
    payload.targetDate === undefined ? current.target_date : dateOnly(payload.targetDate),
    payload.weeklyMinutes === undefined ? current.weekly_minutes : Math.max(30, Math.min(1200, Number(payload.weeklyMinutes) || 180)),
    JSON.stringify(focusTypes), status, current.id, userId);
  return planView(ownedPlan(userId, current.id));
}

function startSession(userId, planId, payload = {}) {
  const plan = ownedPlan(userId, planId);
  if (plan.status !== 'active') throw problem('OA_PLAN_INACTIVE', '只有进行中的 OA 计划可以开始练习', 409);
  const type = clean(payload.questionType, 40);
  const focusTypes = parseJson(plan.focus_types, []);
  if (!QUESTION_TYPES[type] || !focusTypes.includes(type)) throw problem('INVALID_QUESTION_TYPE', '请选择计划内的训练题型');
  const active = db.prepare("SELECT id FROM oa_practice_sessions_v4 WHERE user_id=? AND status='in_progress' ORDER BY id DESC LIMIT 1")
    .get(userId);
  if (active) throw problem('OA_SESSION_ACTIVE', '已有进行中的计时练习，请先完成或放弃', 409);
  const plannedMinutes = Math.max(5, Math.min(180, Number(payload.plannedMinutes) || 30));
  const result = db.prepare(`INSERT INTO oa_practice_sessions_v4
    (user_id, plan_id, question_type, planned_seconds) VALUES (?, ?, ?, ?)`)
    .run(userId, plan.id, type, plannedMinutes * 60);
  return sessionView(ownedSession(userId, result.lastInsertRowid));
}

function normalizeWrongItems(items, questionType) {
  return (Array.isArray(items) ? items : []).slice(0, 50).map((item, index) => {
    const prompt = cleanMultiline(item && item.prompt, 1200);
    if (!prompt) throw problem('MISTAKE_PROMPT_REQUIRED', `第 ${index + 1} 条错题缺少题目`);
    const key = clean(item.questionKey, 120) || crypto.createHash('sha256')
      .update(`${questionType}\n${prompt}`).digest('hex').slice(0, 24);
    return {
      key,
      prompt,
      userAnswer: cleanMultiline(item.userAnswer, 2000),
      correctAnswer: cleanMultiline(item.correctAnswer, 2000),
      notes: cleanMultiline(item.notes, 2000)
    };
  });
}

function completeSession(userId, id, payload = {}) {
  if (payload.confirmSelfReported !== true) {
    throw problem('RESULT_CONFIRMATION_REQUIRED', '请确认正确数、耗时和错题均由你本人记录');
  }
  const session = ownedSession(userId, id);
  if (session.status !== 'in_progress') throw problem('OA_SESSION_FINISHED', '该练习已结束', 409);
  ownedPlan(userId, session.plan_id);
  const wrongItems = normalizeWrongItems(payload.wrongItems, session.question_type);
  const correctCount = Math.max(0, Math.min(500, Number(payload.correctCount) || 0));
  const totalQuestions = Math.max(correctCount + wrongItems.length,
    Math.min(500, Math.max(0, Number(payload.totalQuestions) || 0)));
  if (!totalQuestions) throw problem('SESSION_RESULT_REQUIRED', '请至少记录一道练习题');
  if (correctCount > totalQuestions) throw problem('INVALID_CORRECT_COUNT', '答对数量不能超过总题数');
  const elapsedSeconds = Math.max(1, Math.min(21600, Number(payload.elapsedSeconds) || session.planned_seconds));
  const transaction = db.transaction(() => {
    db.prepare(`UPDATE oa_practice_sessions_v4 SET elapsed_seconds=?, total_questions=?, correct_count=?,
      status='completed', completed_at=datetime('now') WHERE id=? AND user_id=?`)
      .run(elapsedSeconds, totalQuestions, correctCount, session.id, userId);
    const upsert = db.prepare(`INSERT INTO oa_mistakes_v4
      (user_id, plan_id, session_id, question_key, question_type, prompt, user_answer, correct_answer, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, plan_id, question_key) DO UPDATE SET
        session_id=excluded.session_id, question_type=excluded.question_type, prompt=excluded.prompt,
        user_answer=excluded.user_answer, correct_answer=excluded.correct_answer, notes=excluded.notes,
        status='learning', last_practiced_at=datetime('now'), updated_at=datetime('now')`);
    wrongItems.forEach(item => upsert.run(userId, session.plan_id, session.id, item.key,
      session.question_type, item.prompt, item.userAnswer, item.correctAnswer, item.notes));
  });
  transaction();
  return sessionView(ownedSession(userId, session.id));
}

function abandonSession(userId, id) {
  const session = ownedSession(userId, id);
  if (session.status !== 'in_progress') throw problem('OA_SESSION_FINISHED', '该练习已结束', 409);
  db.prepare("UPDATE oa_practice_sessions_v4 SET status='abandoned', completed_at=datetime('now') WHERE id=? AND user_id=?")
    .run(session.id, userId);
  return sessionView(ownedSession(userId, session.id));
}

function updateMistake(userId, id, payload = {}) {
  const current = db.prepare('SELECT * FROM oa_mistakes_v4 WHERE id=? AND user_id=?').get(Number(id), userId);
  if (!current) throw problem('OA_MISTAKE_NOT_FOUND', '错题记录不存在', 404);
  const status = payload.status === undefined ? current.status : clean(payload.status, 30);
  if (!MISTAKE_STATUSES.has(status)) throw problem('INVALID_MISTAKE_STATUS', '错题状态无效');
  if (status === 'mastered' && payload.confirmReviewed !== true) {
    throw problem('REVIEW_CONFIRMATION_REQUIRED', '请确认你已重新练习并掌握该题');
  }
  db.prepare(`UPDATE oa_mistakes_v4 SET status=?, notes=?, last_practiced_at=datetime('now'),
    updated_at=datetime('now') WHERE id=? AND user_id=?`).run(
    status, payload.notes === undefined ? current.notes : cleanMultiline(payload.notes, 2000), current.id, userId);
  return mistakeView(db.prepare('SELECT * FROM oa_mistakes_v4 WHERE id=?').get(current.id));
}

function capabilityStats(userId) {
  const rows = db.prepare(`SELECT question_type, COUNT(*) AS sessions,
      SUM(total_questions) AS total_questions, SUM(correct_count) AS correct_count,
      SUM(elapsed_seconds) AS elapsed_seconds
    FROM oa_practice_sessions_v4 WHERE user_id=? AND status='completed' GROUP BY question_type`)
    .all(userId);
  return Object.keys(QUESTION_TYPES).map(type => {
    const row = rows.find(item => item.question_type === type);
    const total = Number(row && row.total_questions || 0);
    const elapsed = Number(row && row.elapsed_seconds || 0);
    return {
      type,
      label: QUESTION_TYPES[type],
      sessions: Number(row && row.sessions || 0),
      totalQuestions: total,
      correctCount: Number(row && row.correct_count || 0),
      accuracy: total > 0 ? Math.round(Number(row.correct_count || 0) / total * 100) : null,
      averageSecondsPerQuestion: total > 0 ? Math.round(elapsed / total) : null,
      sampleNotice: total > 0 ? `基于 ${total} 道本人记录题目` : '尚无练习样本'
    };
  });
}

function dashboard(userId) {
  const plans = db.prepare("SELECT * FROM oa_training_plans_v4 WHERE user_id=? AND status!='archived' ORDER BY status='active' DESC, target_date='', target_date, updated_at DESC")
    .all(userId).map(planView);
  const activeSession = db.prepare("SELECT * FROM oa_practice_sessions_v4 WHERE user_id=? AND status='in_progress' ORDER BY id DESC LIMIT 1")
    .get(userId);
  const mistakes = db.prepare("SELECT * FROM oa_mistakes_v4 WHERE user_id=? ORDER BY status='learning' DESC, updated_at DESC LIMIT 100")
    .all(userId).map(mistakeView);
  const completed = db.prepare("SELECT COUNT(*) AS count FROM oa_practice_sessions_v4 WHERE user_id=? AND status='completed'").get(userId).count;
  return {
    plans,
    activeSession: activeSession ? sessionView(activeSession) : null,
    mistakes,
    capabilities: capabilityStats(userId),
    summary: {
      completedSessions: Number(completed || 0),
      learningMistakes: mistakes.filter(item => item.status === 'learning').length,
      masteredMistakes: mistakes.filter(item => item.status === 'mastered').length
    },
    questionTypes: Object.entries(QUESTION_TYPES).map(([value, label]) => ({ value, label })),
    notice: '正确率和耗时仅基于你本人确认的练习记录；样本不足时不推断能力。'
  };
}

module.exports = {
  QUESTION_TYPES,
  createPlan,
  updatePlan,
  startSession,
  completeSession,
  abandonSession,
  updateMistake,
  capabilityStats,
  dashboard
};
