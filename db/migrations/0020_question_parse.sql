-- Stage 5 digital PDF parsing is an internal review queue only. No FK from these
-- drafts to published question revisions exists by design.
CREATE TABLE qp_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES question_asset_sources(id),
  asset_sha256 TEXT NOT NULL CHECK(length(asset_sha256)=64),
  paper_version TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  territory TEXT NOT NULL,
  commercial INTEGER NOT NULL CHECK(commercial IN (0,1)),
  client_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('WAIT_RIGHTS','WAIT_ASSET_CHECK','WAIT_BUDGET','WAIT_STORAGE','QUEUED','RUNNING','WAIT_REVIEW','WAIT_OCR','NEEDS_MANUAL','FAILED')),
  reason_code TEXT,
  page_count INTEGER CHECK(page_count IS NULL OR page_count >= 0),
  checkpoint_page INTEGER NOT NULL DEFAULT 0 CHECK(checkpoint_page >= 0),
  layout_bytes INTEGER NOT NULL DEFAULT 0 CHECK(layout_bytes BETWEEN 0 AND 20971520),
  lease_owner TEXT,
  lease_until_ms INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_id,asset_sha256,paper_version,parser_version),
  UNIQUE(source_id,created_by,client_key)
);
CREATE INDEX idx_qp_jobs_queue ON qp_jobs(status,lease_until_ms,id);

CREATE TABLE qp_pages (
  job_id INTEGER NOT NULL REFERENCES qp_jobs(id),
  page_number INTEGER NOT NULL CHECK(page_number > 0),
  text_content TEXT NOT NULL CHECK(length(CAST(text_content AS BLOB)) <= 524288),
  layout_json TEXT NOT NULL CHECK(json_valid(layout_json) AND length(CAST(layout_json AS BLOB)) <= 2097152),
  status TEXT NOT NULL CHECK(status IN ('digital','scanned','complex_layout')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(job_id,page_number)
);

CREATE TABLE qp_drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES qp_jobs(id),
  draft_index INTEGER NOT NULL CHECK(draft_index > 0),
  page_number INTEGER NOT NULL CHECK(page_number > 0),
  section_key TEXT NOT NULL,
  section_label TEXT NOT NULL,
  question_number TEXT NOT NULL,
  question_type TEXT NOT NULL CHECK(question_type IN ('single','multiple','boolean','unknown')),
  stem TEXT NOT NULL,
  options_json TEXT NOT NULL CHECK(json_valid(options_json)),
  answer_json TEXT NOT NULL CHECK(json_valid(answer_json)),
  answer_status TEXT NOT NULL CHECK(answer_status IN ('VERIFIED','UNVERIFIED','ANSWER_UNCERTAIN')),
  evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json)),
  answer_evidence_candidates_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(answer_evidence_candidates_json)),
  source_pages_json TEXT NOT NULL CHECK(json_valid(source_pages_json)),
  source_blocks_json TEXT NOT NULL CHECK(json_valid(source_blocks_json)),
  flags_json TEXT NOT NULL CHECK(json_valid(flags_json)),
  explanation TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN ('pending_review','needs_repair')),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(job_id,draft_index)
);
CREATE INDEX idx_qp_drafts_job ON qp_drafts(job_id,id);

CREATE TABLE qp_draft_edits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  draft_id INTEGER NOT NULL REFERENCES qp_drafts(id),
  from_version INTEGER NOT NULL,
  to_version INTEGER NOT NULL,
  before_json TEXT NOT NULL CHECK(json_valid(before_json)),
  after_json TEXT NOT NULL CHECK(json_valid(after_json)),
  review_note TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(draft_id,to_version)
);
CREATE TRIGGER qp_draft_edits_no_update BEFORE UPDATE ON qp_draft_edits BEGIN
  SELECT RAISE(ABORT,'DRAFT_AUDIT_IMMUTABLE');
END;
CREATE TRIGGER qp_draft_edits_no_delete BEFORE DELETE ON qp_draft_edits BEGIN
  SELECT RAISE(ABORT,'DRAFT_AUDIT_IMMUTABLE');
END;
