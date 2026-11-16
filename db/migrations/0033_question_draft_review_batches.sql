-- Bind a bulk human-review idempotency key to its complete reviewed payload.
CREATE TABLE qp_draft_review_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES qp_jobs(id),
  actor TEXT NOT NULL,
  client_key TEXT NOT NULL,
  request_json TEXT NOT NULL CHECK(json_valid(request_json)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(job_id,actor,client_key)
);
CREATE TRIGGER qp_draft_review_batches_no_update BEFORE UPDATE ON qp_draft_review_batches BEGIN
  SELECT RAISE(ABORT,'DRAFT_REVIEW_BATCH_IMMUTABLE');
END;
CREATE TRIGGER qp_draft_review_batches_no_delete BEFORE DELETE ON qp_draft_review_batches BEGIN
  SELECT RAISE(ABORT,'DRAFT_REVIEW_BATCH_IMMUTABLE');
END;
