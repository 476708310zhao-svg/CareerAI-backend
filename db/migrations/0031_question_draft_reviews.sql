-- Human decisions are separate from OCR candidate answers and draft edits.
CREATE TABLE qp_draft_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  draft_id INTEGER NOT NULL REFERENCES qp_drafts(id),
  draft_version INTEGER NOT NULL CHECK(draft_version > 0),
  decision TEXT NOT NULL CHECK(decision IN ('confirmed','needs_repair','excluded')),
  review_note TEXT NOT NULL,
  actor TEXT NOT NULL,
  client_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(draft_id,actor,client_key)
);
CREATE INDEX idx_qp_draft_reviews_current ON qp_draft_reviews(draft_id,draft_version,id);
CREATE TRIGGER qp_draft_reviews_no_update BEFORE UPDATE ON qp_draft_reviews BEGIN
  SELECT RAISE(ABORT,'DRAFT_REVIEW_IMMUTABLE');
END;
CREATE TRIGGER qp_draft_reviews_no_delete BEFORE DELETE ON qp_draft_reviews BEGIN
  SELECT RAISE(ABORT,'DRAFT_REVIEW_IMMUTABLE');
END;
