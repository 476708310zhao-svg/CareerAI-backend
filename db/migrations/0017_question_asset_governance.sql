-- Rights belong to a provenance source, not to a SHA-256 blob: identical
-- bytes may arrive with different licenses. Unknown rights never imply use.
CREATE TABLE question_asset_right_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES question_asset_sources(id),
  client_key TEXT NOT NULL,
  evidence_reference TEXT NOT NULL,
  rights_json TEXT NOT NULL CHECK(json_valid(rights_json)),
  territories_json TEXT NOT NULL CHECK(json_valid(territories_json)),
  valid_from TEXT NOT NULL,
  valid_until TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','revoked')),
  submitted_by TEXT NOT NULL,
  decided_by TEXT,
  decision_reason TEXT,
  decided_at TEXT,
  revoked_by TEXT,
  revocation_reason TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_id,client_key),
  CHECK(valid_from <= valid_until)
);
CREATE INDEX idx_question_asset_right_claims_source ON question_asset_right_claims(source_id,id);
CREATE INDEX idx_question_asset_right_claims_active ON question_asset_right_claims(source_id,status,valid_from,valid_until);

-- Every decision is an immutable audit event. The newest decision is the
-- current content review; rights decisions remain on their individual claim.
CREATE TABLE question_asset_content_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES question_asset_sources(id),
  client_key TEXT NOT NULL,
  expected_latest_review_id INTEGER CHECK(expected_latest_review_id IS NULL OR expected_latest_review_id > 0),
  decision TEXT NOT NULL CHECK(decision IN ('approved','rejected')),
  reason TEXT NOT NULL,
  reviewer TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_id,client_key)
);
CREATE INDEX idx_question_asset_content_reviews_source ON question_asset_content_reviews(source_id,id);
