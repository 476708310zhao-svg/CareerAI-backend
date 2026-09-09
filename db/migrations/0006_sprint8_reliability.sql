-- Sprint 8 additive persistence for reminder delivery leases and favorite sync tombstones.
-- @require-table users:id
-- @require-table job_reminders:id,user_id
-- @require-table favorites:id,user_id,type,target_id

CREATE TABLE IF NOT EXISTS reminder_deliveries_v4 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reminder_id INTEGER NOT NULL REFERENCES job_reminders(id) ON DELETE CASCADE,
  delivery_key TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_until TEXT DEFAULT '',
  in_app_message_id INTEGER,
  wx_status TEXT DEFAULT '',
  last_error TEXT DEFAULT '',
  sent_at TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(reminder_id, delivery_key)
);

CREATE TABLE IF NOT EXISTS favorite_sync_v4 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','deleted')),
  title TEXT DEFAULT '',
  subtitle TEXT DEFAULT '',
  payload TEXT NOT NULL DEFAULT '{}',
  client_updated_at TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, type, target_id)
);

CREATE TABLE IF NOT EXISTS favorite_operations_v4 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation_id TEXT NOT NULL,
  type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('upsert','delete')),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, operation_id)
);

CREATE INDEX IF NOT EXISTS idx_reminder_deliveries_status_lease
  ON reminder_deliveries_v4(status, lease_until, updated_at);
CREATE INDEX IF NOT EXISTS idx_reminder_deliveries_reminder
  ON reminder_deliveries_v4(reminder_id, status);
CREATE INDEX IF NOT EXISTS idx_favorite_sync_user_status
  ON favorite_sync_v4(user_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_favorite_operations_user_time
  ON favorite_operations_v4(user_id, created_at DESC);
