-- Sprint 6 additive persistence for OA practice, evidence-based projects and job trust observations.
-- @require-table users:id
-- @require-table applications:id,user_id

CREATE TABLE IF NOT EXISTS oa_training_plans_v4 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
  job_id TEXT DEFAULT '',
  company TEXT NOT NULL,
  role TEXT DEFAULT '',
  target_date TEXT DEFAULT '',
  weekly_minutes INTEGER DEFAULT 180,
  focus_types TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','archived')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oa_practice_sessions_v4 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id INTEGER NOT NULL REFERENCES oa_training_plans_v4(id) ON DELETE CASCADE,
  question_type TEXT NOT NULL,
  planned_seconds INTEGER DEFAULT 1800,
  elapsed_seconds INTEGER DEFAULT 0,
  total_questions INTEGER DEFAULT 0,
  correct_count INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress','completed','abandoned')),
  started_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oa_mistakes_v4 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id INTEGER NOT NULL REFERENCES oa_training_plans_v4(id) ON DELETE CASCADE,
  session_id INTEGER REFERENCES oa_practice_sessions_v4(id) ON DELETE SET NULL,
  question_key TEXT NOT NULL,
  question_type TEXT NOT NULL,
  prompt TEXT NOT NULL,
  user_answer TEXT DEFAULT '',
  correct_answer TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'learning' CHECK(status IN ('learning','mastered')),
  last_practiced_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, plan_id, question_key)
);

CREATE TABLE IF NOT EXISTS career_projects_v4 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
  job_id TEXT DEFAULT '',
  track TEXT NOT NULL,
  title TEXT NOT NULL,
  target_role TEXT DEFAULT '',
  gap_summary TEXT NOT NULL DEFAULT '[]',
  problem_statement TEXT DEFAULT '',
  data_sources TEXT NOT NULL DEFAULT '[]',
  deliverables TEXT NOT NULL DEFAULT '[]',
  acceptance_criteria TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','in_progress','completed','archived')),
  progress INTEGER DEFAULT 0,
  verified_completion INTEGER DEFAULT 0,
  completion_evidence TEXT NOT NULL DEFAULT '{}',
  resume_experience_id INTEGER REFERENCES career_experience_library(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'rules',
  started_at TEXT DEFAULT '',
  completed_at TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS career_project_milestones_v4 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES career_projects_v4(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','doing','completed')),
  evidence_note TEXT DEFAULT '',
  completed_at TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS job_trust_observations_v4 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL,
  observed_status TEXT NOT NULL CHECK(observed_status IN ('active','closed','redirected','unavailable','unknown')),
  official_url TEXT DEFAULT '',
  checked_official INTEGER DEFAULT 0,
  note TEXT DEFAULT '',
  observed_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_oa_plans_user_status
  ON oa_training_plans_v4(user_id, status, target_date);
CREATE INDEX IF NOT EXISTS idx_oa_sessions_plan_time
  ON oa_practice_sessions_v4(user_id, plan_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_oa_mistakes_user_status
  ON oa_mistakes_v4(user_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_career_projects_user_status
  ON career_projects_v4(user_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_career_project_milestones_project
  ON career_project_milestones_v4(user_id, project_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_job_trust_observations_job
  ON job_trust_observations_v4(user_id, job_id, observed_at DESC);
