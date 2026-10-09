-- Durable idempotency ledger for user-confirmed AI writeback actions.
-- @require-table users:id
-- @require-table applications:id,user_id
CREATE TABLE IF NOT EXISTS ai_assistant_confirmations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_id TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  conversation_id INTEGER NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  turn_id INTEGER NOT NULL REFERENCES ai_conversation_turns(id) ON DELETE CASCADE,
  source_scope TEXT NOT NULL CHECK(source_scope IN ('general','application')),
  action_target TEXT NOT NULL CHECK(action_target IN ('note','task')),
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, action_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_assistant_confirmations_application
  ON ai_assistant_confirmations(user_id, application_id, id DESC);
