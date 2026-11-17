-- Resumable private PDF uploads are local-only until production storage and scanning exist.
CREATE TABLE question_pdf_upload_sessions (
  id TEXT PRIMARY KEY,
  source_id INTEGER NOT NULL UNIQUE REFERENCES question_asset_sources(id),
  batch_id INTEGER NOT NULL REFERENCES question_asset_batches(id),
  actor TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  fingerprint TEXT NOT NULL CHECK(length(fingerprint)=64),
  byte_size INTEGER NOT NULL CHECK(byte_size BETWEEN 16 AND 268435456),
  received_bytes INTEGER NOT NULL DEFAULT 0 CHECK(received_bytes >= 0 AND received_bytes <= byte_size),
  state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','finalizing')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_question_pdf_upload_sessions_updated ON question_pdf_upload_sessions(updated_at);
