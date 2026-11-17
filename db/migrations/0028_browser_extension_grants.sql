-- Short-lived, single-use browser extension grants scoped to one owned application.
-- @require-table applications:id,user_id
-- @require-table users:id

CREATE TABLE IF NOT EXISTS browser_extension_grants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),
  board_host TEXT NOT NULL CHECK(board_host IN ('boards.greenhouse.io','job-boards.greenhouse.io','jobs.lever.co')),
  field_scope TEXT NOT NULL CHECK(json_valid(field_scope)),
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  FOREIGN KEY(application_id,user_id) REFERENCES applications(id,user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_browser_extension_grants_owner_app
  ON browser_extension_grants(user_id,application_id,created_at DESC);
