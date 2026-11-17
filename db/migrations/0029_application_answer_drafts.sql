-- @require-table applications:id,user_id,resume_version_id
CREATE TABLE IF NOT EXISTS application_answer_drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_id INTEGER NOT NULL,
  resume_version_id INTEGER NOT NULL,
  question TEXT NOT NULL CHECK(length(question) BETWEEN 1 AND 1000),
  content TEXT NOT NULL CHECK(length(content) BETWEEN 1 AND 12000),
  evidence_refs_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(evidence_refs_json)),
  evidence_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(evidence_json)),
  unsupported_claims_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(unsupported_claims_json)),
  max_chars INTEGER NOT NULL CHECK(max_chars BETWEEN 20 AND 2000),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(application_id,user_id) REFERENCES applications(id,user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_application_answer_drafts_owner_app
  ON application_answer_drafts(user_id,application_id,status,updated_at DESC,id DESC);
