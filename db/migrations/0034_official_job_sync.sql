CREATE TABLE IF NOT EXISTS official_job_postings (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  company TEXT NOT NULL,
  country TEXT NOT NULL,
  title TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  job_type TEXT NOT NULL DEFAULT '',
  apply_url TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_reference TEXT NOT NULL,
  published_at TEXT NOT NULL DEFAULT '',
  source_updated_at TEXT NOT NULL DEFAULT '',
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  missing_successes INTEGER NOT NULL DEFAULT 0 CHECK (missing_successes >= 0),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  closed_at TEXT NOT NULL DEFAULT '',
  UNIQUE(board_id,source_reference)
);
CREATE INDEX IF NOT EXISTS idx_official_jobs_country_status ON official_job_postings(country,status,last_seen_at);
CREATE INDEX IF NOT EXISTS idx_official_jobs_board_status ON official_job_postings(board_id,status);

CREATE TABLE IF NOT EXISTS official_job_sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok','empty','anomalous','error')),
  raw_count INTEGER NOT NULL DEFAULT 0,
  accepted_count INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  missing_count INTEGER NOT NULL DEFAULT 0,
  closed_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_official_sync_board_run ON official_job_sync_runs(board_id,id DESC);
