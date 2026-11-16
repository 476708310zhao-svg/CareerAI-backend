-- Private originals are never exposed by a public route. Rights and scanning default to denial.
CREATE TABLE question_asset_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  client_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(created_by,client_key)
);

CREATE TABLE question_pdf_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256)=64),
  byte_size INTEGER NOT NULL CHECK(byte_size > 0),
  mime_type TEXT NOT NULL DEFAULT 'application/pdf' CHECK(mime_type='application/pdf'),
  storage_key TEXT NOT NULL UNIQUE,
  validation_status TEXT NOT NULL DEFAULT 'pending' CHECK(validation_status IN ('pending','valid','invalid')),
  scan_status TEXT NOT NULL DEFAULT 'pending' CHECK(scan_status IN ('pending','clean','infected','failed')),
  processing_right INTEGER NOT NULL DEFAULT 0 CHECK(processing_right IN (0,1)),
  display_right INTEGER NOT NULL DEFAULT 0 CHECK(display_right IN (0,1)),
  publish_status TEXT NOT NULL DEFAULT 'blocked' CHECK(publish_status IN ('blocked','published')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK(publish_status='blocked' OR (validation_status='valid' AND scan_status='clean' AND processing_right=1 AND display_right=1))
);

CREATE TABLE question_asset_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL REFERENCES question_asset_batches(id),
  client_key TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_reference TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  asset_id INTEGER REFERENCES question_pdf_assets(id),
  status TEXT NOT NULL DEFAULT 'awaiting_upload' CHECK(status IN ('awaiting_upload','failed','quarantined')),
  error_code TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(batch_id,client_key)
);
CREATE INDEX idx_question_asset_sources_batch ON question_asset_sources(batch_id,id);
CREATE INDEX idx_question_asset_sources_asset ON question_asset_sources(asset_id);

CREATE TABLE question_asset_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL REFERENCES question_asset_batches(id),
  source_id INTEGER REFERENCES question_asset_sources(id),
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
