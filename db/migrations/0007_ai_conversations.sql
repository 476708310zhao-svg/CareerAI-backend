-- Durable expert conversations shared by authenticated clients. No existing data is rewritten.
-- @require-table users:id
-- @require-table applications:id,user_id
CREATE TABLE IF NOT EXISTS ai_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_owner ON ai_conversations(user_id, id DESC);
CREATE TABLE IF NOT EXISTS ai_conversation_turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN ('pending','completed','failed','cancelled')),
  error_code TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'web' CHECK(source IN ('web','miniprogram')),
  resume_version_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT NOT NULL DEFAULT '',
  UNIQUE(conversation_id, request_id)
);
CREATE INDEX IF NOT EXISTS idx_ai_turns_conversation ON ai_conversation_turns(conversation_id, id DESC);
