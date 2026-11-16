'use strict';

const db = require('../db/database');
const reminderSync = require('./reminderSync');
const { toV4Status } = require('../utils/applicationStatus');

function cleanText(value, max) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanList(value, maxItems = 5, maxLength = 220) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxItems).map(item => cleanText(item, maxLength)).filter(Boolean);
}

function cleanActions(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 5).map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const title = cleanText(item.title, 100);
    const summary = cleanText(item.summary || item.description, 180);
    return title ? { title, summary } : null;
  }).filter(Boolean);
}

function normalizeReport(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Object.assign(new Error('报告内容无效'), { status: 400 });
  const clientKey = String(input.clientKey || '');
  const summary = cleanText(input.summary, 1200);
  const totalScore = Number(input.totalScore);
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(clientKey)) throw Object.assign(new Error('报告幂等键无效'), { status: 400 });
  if (!summary || !Number.isSafeInteger(totalScore) || totalScore < 0 || totalScore > 100) throw Object.assign(new Error('报告摘要或评分无效'), { status: 400 });
  return {
    clientKey, summary, totalScore,
    company: cleanText(input.company, 200), jobTitle: cleanText(input.jobTitle, 200),
    interviewType: cleanText(input.interviewType, 80),
    strengths: cleanList(input.strengths), weaknesses: cleanList(input.weaknesses),
    actions: cleanActions(input.actions), sourceCreatedAt: cleanText(input.sourceCreatedAt, 50)
  };
}

function view(row) {
  return {
    id: row.id, applicationId: row.application_id, company: row.company, jobTitle: row.job_title,
    interviewType: row.interview_type, totalScore: row.total_score, summary: row.summary,
    strengths: JSON.parse(row.strengths_json || '[]'), weaknesses: JSON.parse(row.weaknesses_json || '[]'),
    actions: JSON.parse(row.actions_json || '[]'), createdAt: row.created_at,
    convertedAt: row.converted_at, taskId: row.task_id, converted: Boolean(row.task_id)
  };
}

function ensureApplication(userId, applicationId, writable = true) {
  const sql = writable
    ? "SELECT * FROM applications WHERE id=? AND user_id=? AND COALESCE(archived_at,'')=''"
    : 'SELECT * FROM applications WHERE id=? AND user_id=?';
  return db.prepare(sql).get(applicationId, userId);
}

function available() {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get()
    && db.prepare("SELECT 1 FROM schema_migrations WHERE version='0027'").get()
    && db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='application_interview_reports'").get());
}

function list(userId, applicationId) {
  if (!ensureApplication(userId, applicationId, false)) throw Object.assign(new Error('申请记录不存在'), { status: 404 });
  if (!available()) return { available: false, reports: [] };
  return { available: true, reports: db.prepare(`SELECT * FROM application_interview_reports WHERE user_id=? AND application_id=?
    ORDER BY id DESC LIMIT 50`).all(userId, applicationId).map(view) };
}

function save(userId, applicationId, input) {
  const report = normalizeReport(input);
  if (!available()) throw Object.assign(new Error('面试摘要关联功能尚未启用'), { status: 503 });
  return db.transaction(() => {
    if (!ensureApplication(userId, applicationId, true)) throw Object.assign(new Error('申请记录不存在或已归档'), { status: 404 });
    let row = db.prepare(`SELECT * FROM application_interview_reports WHERE user_id=? AND application_id=? AND client_key=?`)
      .get(userId, applicationId, report.clientKey);
    if (row) return { report: view(row), changed: false };
    const result = db.prepare(`INSERT INTO application_interview_reports
      (user_id,application_id,client_key,company,job_title,interview_type,total_score,summary,
       strengths_json,weaknesses_json,actions_json,source_created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(userId, applicationId, report.clientKey, report.company,
      report.jobTitle, report.interviewType, report.totalScore, report.summary,
      JSON.stringify(report.strengths), JSON.stringify(report.weaknesses), JSON.stringify(report.actions), report.sourceCreatedAt || null);
    row = db.prepare('SELECT * FROM application_interview_reports WHERE id=?').get(Number(result.lastInsertRowid));
    return { report: view(row), changed: true };
  }).immediate();
}

function convertToTask(userId, applicationId, reportId, input = {}) {
  if (!available()) throw Object.assign(new Error('面试摘要关联功能尚未启用'), { status: 503 });
  const clientKey = String(input.clientKey || '');
  const expectedState = input.expectedState;
  const title = cleanText(input.title, 200);
  const dueAt = cleanText(input.dueAt, 40);
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(clientKey)) throw Object.assign(new Error('任务幂等键无效'), { status: 400 });
  if (!title) throw Object.assign(new Error('请确认任务标题'), { status: 400 });
  if (!expectedState || typeof expectedState !== 'object' || !Number.isSafeInteger(expectedState.historyId)) {
    throw Object.assign(new Error('请刷新申请后确认创建任务'), { status: 428 });
  }
  return db.transaction(() => {
    const application = ensureApplication(userId, applicationId, true);
    if (!application) throw Object.assign(new Error('申请记录不存在或已归档'), { status: 404 });
    const report = db.prepare('SELECT * FROM application_interview_reports WHERE id=? AND application_id=? AND user_id=?')
      .get(reportId, applicationId, userId);
    if (!report) throw Object.assign(new Error('面试摘要不存在'), { status: 404 });
    // An idempotent replay only returns the prior result; it does not mutate
    // status or task state, so a later status revision must not break retry.
    if (report.convert_client_key && report.convert_client_key !== clientKey) {
      throw Object.assign(new Error('该摘要已用于创建任务'), { status: 409 });
    }
    if (report.task_id) return { taskId: report.task_id, changed: false };
    const currentStatus = toV4Status(application);
    const historyId = db.prepare('SELECT COALESCE(MAX(id),0) AS id FROM application_history WHERE application_id=? AND user_id=?')
      .get(applicationId, userId).id;
    if (expectedState.status !== currentStatus || expectedState.historyId !== historyId) {
      throw Object.assign(new Error('申请状态已变化，请刷新后重新确认'), { status: 409, details: { currentStatus, historyId } });
    }
    const task = db.prepare(`SELECT id FROM application_tasks WHERE user_id=? AND application_id=? AND id=(
      SELECT task_id FROM application_interview_reports WHERE user_id=? AND application_id=? AND id=?
    )`).get(userId, applicationId, userId, applicationId, reportId);
    if (task) return { taskId: task.id, changed: false };
    db.prepare(`UPDATE application_interview_reports SET convert_client_key=? WHERE id=? AND user_id=? AND application_id=?`)
      .run(clientKey, reportId, userId, applicationId);
    const inserted = db.prepare(`INSERT INTO application_tasks
      (application_id,user_id,title,due_at,priority) VALUES (?,?,?,?,?)`).run(applicationId, userId, title, dueAt, 'medium');
    const taskId = Number(inserted.lastInsertRowid);
    db.prepare(`UPDATE application_interview_reports SET task_id=?,converted_at=datetime('now') WHERE id=? AND user_id=? AND application_id=?`)
      .run(taskId, reportId, userId, applicationId);
    reminderSync.syncApplicationTask(userId, taskId, dueAt, false);
    return { taskId, changed: true };
  }).immediate();
}

module.exports = { available, list, save, convertToTask };
