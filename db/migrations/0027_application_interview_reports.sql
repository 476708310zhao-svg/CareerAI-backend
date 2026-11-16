-- Save bounded interview practice summaries against an owned application.
-- @require-table applications:id,user_id
-- @require-table users:id

CREATE TABLE IF NOT EXISTS application_interview_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_id INTEGER NOT NULL,
  client_key TEXT NOT NULL CHECK(length(client_key) BETWEEN 8 AND 80),
  company TEXT NOT NULL DEFAULT '' CHECK(length(company) <= 200),
  job_title TEXT NOT NULL DEFAULT '' CHECK(length(job_title) <= 200),
  interview_type TEXT NOT NULL DEFAULT '' CHECK(length(interview_type) <= 80),
  total_score INTEGER NOT NULL CHECK(total_score BETWEEN 0 AND 100),
  summary TEXT NOT NULL CHECK(length(summary) BETWEEN 1 AND 1200),
  strengths_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(strengths_json)),
  weaknesses_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(weaknesses_json)),
  actions_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(actions_json)),
  source_created_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  convert_client_key TEXT CHECK(convert_client_key IS NULL OR length(convert_client_key) BETWEEN 8 AND 80),
  task_id INTEGER,
  converted_at TEXT,
  FOREIGN KEY (application_id, user_id) REFERENCES applications(id, user_id) ON DELETE CASCADE,
  UNIQUE (user_id, application_id, client_key),
  UNIQUE (user_id, application_id, convert_client_key)
);

CREATE INDEX IF NOT EXISTS idx_application_interview_reports_owner_app
  ON application_interview_reports(user_id, application_id, id DESC);
