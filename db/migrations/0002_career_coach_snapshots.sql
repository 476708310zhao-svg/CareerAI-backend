-- Sprint 4 additive persistence for daily competitiveness diagnostics and weekly reports.
-- @require-table users:id

CREATE TABLE IF NOT EXISTS career_diagnostics_v4 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snapshot_date TEXT NOT NULL DEFAULT (date('now')),
  profile_version INTEGER DEFAULT 1,
  overall_score INTEGER DEFAULT 0,
  dimensions TEXT NOT NULL DEFAULT '[]',
  evidence_notice TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, snapshot_date)
);

CREATE TABLE IF NOT EXISTS career_weekly_reports_v4 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start TEXT NOT NULL,
  week_end TEXT NOT NULL,
  report TEXT NOT NULL DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_career_diagnostics_user_date
  ON career_diagnostics_v4(user_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_career_weekly_reports_user_week
  ON career_weekly_reports_v4(user_id, week_start DESC);
