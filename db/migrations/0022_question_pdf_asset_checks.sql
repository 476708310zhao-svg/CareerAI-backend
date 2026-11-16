-- Each result is tied to the immutable private asset digest. No manual clean/valid override.
CREATE TABLE question_pdf_asset_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL REFERENCES question_pdf_assets(id),
  source_id INTEGER NOT NULL REFERENCES question_asset_sources(id),
  state TEXT NOT NULL CHECK(state IN ('running','completed','blocked')),
  scanner TEXT NOT NULL,
  scan_status TEXT NOT NULL CHECK(scan_status IN ('pending','clean','infected','failed')),
  validation_status TEXT NOT NULL CHECK(validation_status IN ('pending','valid','invalid')),
  page_count INTEGER,
  text_pages INTEGER,
  error_code TEXT,
  started_by TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);
CREATE INDEX idx_question_pdf_asset_checks_asset ON question_pdf_asset_checks(asset_id,id);
