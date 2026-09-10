const db = require('../db/database');
const { applicationRefs, mergeCoreRefs } = require('../utils/coreEntityRefs');

const PRIORITIES = new Set(['high', 'medium', 'low']);
const SOURCE_URLS = {
  ai_agent: '/package-ai/pages/daily-brief/daily-brief',
  interview_report: '/package-ai/pages/interview-setup/interview-setup'
};

function clean(value, max) {
  return String(value === undefined || value === null ? '' : value).trim().slice(0, max);
}

function hashKey(value) {
  const text = String(value || '');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash | 0) || 1;
}

function normalizeTimestamp(value) {
  const text = clean(value, 40);
  if (!text) return '';
  const timestamp = new Date(text).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
}

function timestampValue(value) {
  if (!value) return 0;
  const normalized = String(value).includes('T') ? String(value) : String(value).replace(' ', 'T') + 'Z';
  const timestamp = new Date(normalized).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizeLocalTask(raw) {
  const localKey = clean(raw && raw.id, 120);
  const title = clean(raw && raw.title, 160);
  if (!localKey || !title) return null;
  const priority = clean(raw.priority, 20);
  const url = clean(raw.url, 500);
  return {
    localKey,
    sourceId: hashKey(localKey),
    taskType: clean(raw.type || 'general', 40),
    title,
    detail: clean(raw.desc || raw.detail, 1000),
    url: url.startsWith('/') ? url : '',
    priority: PRIORITIES.has(priority) ? priority : 'medium',
    doneKnown: raw.doneKnown === true,
    completed: raw.completed === true || raw.done === true,
    clientUpdatedAt: normalizeTimestamp(raw.updatedAt || raw.clientUpdatedAt)
  };
}

function taskRefs(row) {
  if (!row) return mergeCoreRefs();
  const base = { userId: row.user_id, todayTaskId: row.id };
  let application = null;
  let related = {};

  if (row.source_type === 'interview_report' && row.source_id) {
    const report = db.prepare('SELECT id, session_id, space_id FROM interview_reports_v4 WHERE id=? AND user_id=?')
      .get(row.source_id, row.user_id);
    if (report) {
      const space = db.prepare('SELECT application_id FROM interview_spaces_v4 WHERE id=? AND user_id=?')
        .get(report.space_id, row.user_id);
      application = space && space.application_id
        ? db.prepare('SELECT * FROM applications WHERE id=? AND user_id=?').get(space.application_id, row.user_id)
        : null;
      related = {
        applicationId: space && space.application_id,
        interviewSpaceId: report.space_id,
        interviewSessionId: report.session_id,
        interviewReportId: report.id
      };
    }
  } else if (row.source_type === 'ai_agent' && row.source_id) {
    const agentTask = db.prepare('SELECT application_id FROM ai_agent_tasks_v4 WHERE id=? AND user_id=?')
      .get(row.source_id, row.user_id);
    application = agentTask && agentTask.application_id
      ? db.prepare('SELECT * FROM applications WHERE id=? AND user_id=?').get(agentTask.application_id, row.user_id)
      : null;
    related = { applicationId: agentTask && agentTask.application_id };
  } else if (row.source_type === 'application' && row.source_id) {
    application = db.prepare('SELECT * FROM applications WHERE id=? AND user_id=?').get(row.source_id, row.user_id);
    related = { applicationId: row.source_id };
  } else if (row.source_type === 'networking_contact' && row.source_id) {
    const contact = db.prepare('SELECT application_id, resume_id, resume_version_id, job_id FROM networking_contacts_v4 WHERE id=? AND user_id=?')
      .get(row.source_id, row.user_id);
    application = contact && contact.application_id
      ? db.prepare('SELECT * FROM applications WHERE id=? AND user_id=?').get(contact.application_id, row.user_id)
      : null;
    related = {
      applicationId: contact && contact.application_id,
      resumeId: contact && contact.resume_id,
      resumeVersionId: contact && contact.resume_version_id,
      jobId: contact && contact.job_id,
      networkingContactId: row.source_id
    };
  }

  return mergeCoreRefs(applicationRefs(application || {}), base, related);
}

function view(row) {
  if (!row) return null;
  const taskDate = row.task_date || '';
  return {
    id: row.id,
    sourceType: row.source_type || '',
    sourceId: row.source_id || null,
    localKey: row.local_key || '',
    type: row.task_type || row.source_type || 'general',
    title: row.title,
    desc: row.detail || '',
    detail: row.detail || '',
    url: row.url || SOURCE_URLS[row.source_type] || '',
    priority: row.priority || 'medium',
    status: row.status || 'pending',
    completed: row.status === 'completed',
    taskDate,
    reminderAt: row.status === 'pending' && taskDate ? `${taskDate}T09:00:00+08:00` : '',
    completedAt: row.completed_at || '',
    updatedAt: row.updated_at || row.created_at || '',
    createdAt: row.created_at || '',
    refs: taskRefs(row)
  };
}

function list(userId) {
  return db.prepare(`SELECT * FROM today_tasks_v4
    WHERE user_id=? AND task_date=date('now')
    ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END,
      CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, id DESC`)
    .all(userId).map(view);
}

function listScheduled(userId, limit = 10) {
  return db.prepare(`SELECT * FROM today_tasks_v4
    WHERE user_id=? AND status='pending' AND task_date>date('now')
    ORDER BY task_date ASC, CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, id DESC
    LIMIT ?`).all(userId, Math.max(1, Math.min(30, Number(limit) || 10))).map(view);
}

function syncLocal(userId, tasks) {
  const normalized = (Array.isArray(tasks) ? tasks : [])
    .slice(0, 20)
    .map(normalizeLocalTask)
    .filter(Boolean);
  db.transaction(() => {
    const existing = db.prepare("SELECT * FROM today_tasks_v4 WHERE user_id=? AND task_date=date('now') AND source_type='home_local'")
      .all(userId);
    const byKey = new Map(existing.map(row => [row.local_key, row]));
    const insert = db.prepare(`INSERT INTO today_tasks_v4
      (user_id, source_type, source_id, local_key, task_type, title, detail, url, priority, status, task_date, completed_at, updated_at)
      VALUES (?, 'home_local', ?, ?, ?, ?, ?, ?, ?, ?, date('now'), ?, datetime('now'))`);
    const update = db.prepare(`UPDATE today_tasks_v4
      SET task_type=?, title=?, detail=?, url=?, priority=?,
        status=CASE WHEN ? THEN ? ELSE status END,
        completed_at=CASE WHEN ? THEN ? ELSE completed_at END,
        updated_at=?
      WHERE id=? AND user_id=?`);

    normalized.forEach(item => {
      const current = byKey.get(item.localKey);
      const nextStatus = item.completed ? 'completed' : 'pending';
      const completedAt = item.completed ? new Date().toISOString() : '';
      if (current) {
        if (item.clientUpdatedAt && timestampValue(item.clientUpdatedAt) < timestampValue(current.updated_at)) return;
        const nextUpdatedAt = item.clientUpdatedAt || new Date().toISOString();
        update.run(item.taskType, item.title, item.detail, item.url, item.priority,
          item.doneKnown ? 1 : 0, nextStatus, item.doneKnown ? 1 : 0, completedAt,
          nextUpdatedAt, current.id, userId);
      } else {
        insert.run(userId, item.sourceId, item.localKey, item.taskType, item.title, item.detail, item.url,
          item.priority, item.completed ? 'completed' : 'pending', completedAt);
        if (item.clientUpdatedAt) {
          db.prepare(`UPDATE today_tasks_v4 SET updated_at=?
            WHERE user_id=? AND task_date=date('now') AND local_key=?`)
            .run(item.clientUpdatedAt, userId, item.localKey);
        }
      }
    });
  })();

  return list(userId);
}

function updateStatus(userId, id, completed, clientUpdatedAt) {
  const current = db.prepare('SELECT * FROM today_tasks_v4 WHERE id=? AND user_id=?').get(Number(id), userId);
  if (!current) return null;
  const normalizedClientAt = normalizeTimestamp(clientUpdatedAt);
  if (normalizedClientAt && timestampValue(normalizedClientAt) < timestampValue(current.updated_at)) {
    return Object.assign(view(current), { conflict: true });
  }
  const updatedAt = normalizedClientAt || new Date().toISOString();
  const result = db.prepare(`UPDATE today_tasks_v4
    SET status=?, completed_at=CASE WHEN ? THEN ? ELSE '' END, updated_at=?
    WHERE id=? AND user_id=?`)
    .run(completed ? 'completed' : 'pending', completed ? 1 : 0,
      completed ? updatedAt : '', updatedAt, Number(id), userId);
  if (!result.changes) return null;
  if (current.source_type === 'networking_contact' && current.source_id) {
    db.prepare("UPDATE networking_contacts_v4 SET next_follow_up_at=?, updated_at=datetime('now') WHERE id=? AND user_id=?")
      .run(completed ? '' : current.task_date || '', current.source_id, userId);
  }
  return view(db.prepare('SELECT * FROM today_tasks_v4 WHERE id=? AND user_id=?').get(Number(id), userId));
}

function deferTask(userId, id, days) {
  const taskId = Number(id);
  const delay = Math.max(1, Math.min(30, Number(days) || 1));
  const row = db.prepare('SELECT * FROM today_tasks_v4 WHERE id=? AND user_id=?').get(taskId, userId);
  if (!row) return { task: null, conflict: false };
  const target = db.prepare("SELECT date('now', ?) AS value").get(`+${delay} days`).value;
  const duplicate = row.local_key ? db.prepare(`SELECT id FROM today_tasks_v4
    WHERE user_id=? AND task_date=? AND local_key=? AND id!=?`).get(userId, target, row.local_key, row.id) : null;
  if (duplicate) return { task: null, conflict: true, existingTaskId: duplicate.id, taskDate: target };
  db.prepare(`UPDATE today_tasks_v4 SET task_date=?, status='pending', completed_at='', updated_at=datetime('now')
    WHERE id=? AND user_id=?`).run(target, row.id, userId);
  return { task: view(db.prepare('SELECT * FROM today_tasks_v4 WHERE id=? AND user_id=?').get(row.id, userId)), conflict: false };
}

module.exports = {
  list, listScheduled, syncLocal, updateStatus, deferTask, view, taskRefs,
  normalizeLocalTask, normalizeTimestamp, timestampValue
};
