-- @require-table users:id
-- @require-table applications:id,user_id
-- @require-table resumes:id,user_id
CREATE TABLE IF NOT EXISTS manual_service_requests_v4 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  client_request_key TEXT NOT NULL CHECK (length(client_request_key) BETWEEN 8 AND 80),
  service_type TEXT NOT NULL CHECK (service_type IN ('resume_optimization','manual_job_screening','application_assistance')),
  application_id INTEGER,
  resume_id INTEGER,
  request_summary TEXT NOT NULL DEFAULT '' CHECK (length(request_summary) <= 1000),
  scope_json TEXT NOT NULL DEFAULT '[]',
  consent_version INTEGER NOT NULL CHECK (consent_version > 0),
  consented_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','accepted','in_progress','delivered','rejected','cancelled','revoked','expired','closed')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  order_no TEXT NOT NULL DEFAULT '',
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (id,user_id),
  UNIQUE (user_id,client_request_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (application_id,user_id) REFERENCES applications(id,user_id) ON DELETE CASCADE,
  FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_manual_service_user ON manual_service_requests_v4(user_id,id DESC);
CREATE INDEX IF NOT EXISTS idx_manual_service_status ON manual_service_requests_v4(status,updated_at);

CREATE TABLE IF NOT EXISTS manual_service_request_events_v4 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user','admin','system')),
  actor_id TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL CHECK (event_type IN ('created','status_changed','consent_revoked','consent_expired','delivery_added')),
  from_status TEXT NOT NULL DEFAULT '',
  to_status TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (request_id,user_id) REFERENCES manual_service_requests_v4(id,user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_manual_service_events ON manual_service_request_events_v4(request_id,id DESC);

CREATE TABLE IF NOT EXISTS manual_service_deliveries_v4 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  admin_id TEXT NOT NULL,
  summary TEXT NOT NULL CHECK (length(summary) BETWEEN 1 AND 2000),
  artifact_refs_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (request_id,user_id) REFERENCES manual_service_requests_v4(id,user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_manual_service_deliveries ON manual_service_deliveries_v4(request_id,id DESC);
