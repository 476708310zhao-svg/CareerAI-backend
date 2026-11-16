'use strict';

const db = require('../db/database');

function invalidatePending(userId, reminderId) {
  if (!reminderId) return;
  db.prepare(`UPDATE reminder_deliveries_v4 SET status='failed',lease_until='',last_error='reminder_changed',
    updated_at=datetime('now') WHERE user_id=? AND reminder_id=? AND status='pending'`)
    .run(userId, reminderId);
}

function syncOwnedReminder(userId, sourceType, targetId, reminderType, date, enabled) {
  const existing = db.prepare(`SELECT id,reminder_date FROM job_reminders
    WHERE user_id=? AND source_type=? AND target_id=? AND reminder_type=?`)
    .get(userId, sourceType, String(targetId), reminderType);
  if (!existing) return false;
  const nextDate = String(date || '').trim();
  if (existing.reminder_date !== nextDate || !enabled) invalidatePending(userId, existing.id);
  db.prepare(`UPDATE job_reminders SET reminder_date=?,enabled=?,updated_at=datetime('now') WHERE id=? AND user_id=?`)
    .run(nextDate, enabled && nextDate ? 1 : 0, existing.id, userId);
  return true;
}

function syncApplicationDeadline(userId, applicationId, deadline) {
  return syncOwnedReminder(userId, 'application', applicationId, 'deadline', deadline, Boolean(deadline));
}

function syncApplicationTask(userId, taskId, dueAt, completed) {
  return syncOwnedReminder(userId, 'application_task', taskId, 'task_due', dueAt, !completed && Boolean(dueAt));
}

module.exports = { syncApplicationDeadline, syncApplicationTask };
