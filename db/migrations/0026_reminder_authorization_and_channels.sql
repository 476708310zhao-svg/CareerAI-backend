-- Persist one-time, template-specific WeChat consent and explicit reminder channels.
-- @require-table users:id
-- @require-table job_reminders:id,user_id

ALTER TABLE job_reminders ADD COLUMN delivery_channel TEXT NOT NULL DEFAULT 'in_app'
  CHECK(delivery_channel IN ('in_app','wechat','both'));

CREATE TABLE IF NOT EXISTS notify_template_authorizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('accepted','rejected','revoked')),
  remaining INTEGER NOT NULL DEFAULT 0 CHECK(remaining >= 0),
  source TEXT NOT NULL DEFAULT 'miniprogram',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, template_id)
);

CREATE TABLE IF NOT EXISTS notify_template_authorization_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('accepted','rejected','revoked','consumed')),
  source TEXT NOT NULL DEFAULT 'miniprogram',
  delivery_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notify_template_auth_events_user_time
  ON notify_template_authorization_events(user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_reminder_deliveries_user_time
  ON reminder_deliveries_v4(user_id, created_at DESC, id DESC);
