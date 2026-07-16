const db = require('../db/database');

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
    completed: raw.completed === true || raw.done === true
  };
}

function view(row) {
  if (!row) return null;
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
    taskDate: row.task_date,
    completedAt: row.completed_at || '',
    updatedAt: row.updated_at || row.created_at || '',
    createdAt: row.created_at || ''
  };
}

function list(userId) {
  return db.prepare(`SELECT * FROM today_tasks_v4
    WHERE user_id=? AND task_date=date('now')
    ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END,
      CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, id DESC`)
    .all(userId).map(view);
}

function syncLocal(userId, tasks) {
  const normalized = (Array.isArray(tasks) ? tasks : [])
    .slice(0, 20)
    .map(normalizeLocalTask)
    .filter(Boolean);
  const incomingKeys = new Set(normalized.map(item => item.localKey));

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
        updated_at=datetime('now')
      WHERE id=? AND user_id=?`);

    normalized.forEach(item => {
      const current = byKey.get(item.localKey);
      const nextStatus = item.completed ? 'completed' : 'pending';
      const completedAt = item.completed ? new Date().toISOString() : '';
      if (current) {
        update.run(item.taskType, item.title, item.detail, item.url, item.priority,
          item.doneKnown ? 1 : 0, nextStatus, item.doneKnown ? 1 : 0, completedAt, current.id, userId);
      } else {
        insert.run(userId, item.sourceId, item.localKey, item.taskType, item.title, item.detail, item.url,
          item.priority, item.completed ? 'completed' : 'pending', completedAt);
      }
    });

    existing.forEach(row => {
      if (!incomingKeys.has(row.local_key)) {
        db.prepare("DELETE FROM today_tasks_v4 WHERE id=? AND user_id=? AND source_type='home_local'").run(row.id, userId);
      }
    });
  })();

  return list(userId);
}

function updateStatus(userId, id, completed) {
  const result = db.prepare(`UPDATE today_tasks_v4
    SET status=?, completed_at=CASE WHEN ? THEN datetime('now') ELSE '' END, updated_at=datetime('now')
    WHERE id=? AND user_id=?`)
    .run(completed ? 'completed' : 'pending', completed ? 1 : 0, Number(id), userId);
  if (!result.changes) return null;
  return view(db.prepare('SELECT * FROM today_tasks_v4 WHERE id=? AND user_id=?').get(Number(id), userId));
}

module.exports = { list, syncLocal, updateStatus, view, normalizeLocalTask };
