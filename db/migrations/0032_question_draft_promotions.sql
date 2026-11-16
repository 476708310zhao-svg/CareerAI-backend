-- A reviewed OCR draft may create one private question draft. No publication or rights approval is implied.
CREATE TABLE qp_draft_promotion_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES qp_jobs(id),
  actor TEXT NOT NULL,
  client_key TEXT NOT NULL,
  draft_ids_json TEXT NOT NULL CHECK(json_valid(draft_ids_json)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(job_id,actor,client_key)
);
CREATE TABLE qp_draft_promotions (
  draft_id INTEGER PRIMARY KEY REFERENCES qp_drafts(id),
  draft_version INTEGER NOT NULL CHECK(draft_version > 0),
  question_id INTEGER NOT NULL UNIQUE REFERENCES qb_questions(id),
  revision_id INTEGER NOT NULL UNIQUE REFERENCES qb_revisions(id),
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TRIGGER qp_draft_promotions_no_update BEFORE UPDATE ON qp_draft_promotions BEGIN
  SELECT RAISE(ABORT,'DRAFT_PROMOTION_IMMUTABLE');
END;
CREATE TRIGGER qp_draft_promotions_no_delete BEFORE DELETE ON qp_draft_promotions BEGIN
  SELECT RAISE(ABORT,'DRAFT_PROMOTION_IMMUTABLE');
END;
