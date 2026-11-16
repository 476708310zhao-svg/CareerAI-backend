-- @require-table applications:id,user_id,v4_status
-- @require-table users:id
CREATE TABLE application_submission_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK(action IN ('confirmed','revoked')),
  supersedes_id INTEGER REFERENCES application_submission_events(id) ON DELETE SET NULL,
  client_key TEXT NOT NULL,
  channel TEXT NOT NULL CHECK(channel IN ('web','miniprogram')),
  created_at TEXT NOT NULL,
  UNIQUE(user_id, application_id, client_key)
);
CREATE INDEX idx_application_submission_events_owner
  ON application_submission_events(user_id, application_id, id DESC);
