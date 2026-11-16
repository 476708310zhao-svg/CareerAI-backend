-- Stage 3: private manual question bank. Nothing here grants public access.
CREATE TABLE qb_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_key TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(created_by, client_key)
);
CREATE TRIGGER qb_questions_no_update BEFORE UPDATE ON qb_questions BEGIN
  SELECT RAISE(ABORT,'QUESTION_ID_IMMUTABLE');
END;
CREATE TRIGGER qb_questions_no_delete BEFORE DELETE ON qb_questions BEGIN
  SELECT RAISE(ABORT,'QUESTION_ID_IMMUTABLE');
END;

CREATE TABLE qb_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL REFERENCES qb_questions(id),
  revision_no INTEGER NOT NULL CHECK(revision_no > 0),
  expected_revision_id INTEGER REFERENCES qb_revisions(id),
  client_key TEXT NOT NULL,
  content_json TEXT NOT NULL CHECK(json_valid(content_json)),
  provenance_json TEXT NOT NULL CHECK(json_valid(provenance_json)),
  media_json TEXT NOT NULL CHECK(json_valid(media_json)),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(question_id,revision_no),
  UNIQUE(question_id,client_key)
);
CREATE INDEX idx_qb_revisions_question ON qb_revisions(question_id,id);
CREATE TRIGGER qb_revisions_no_update BEFORE UPDATE ON qb_revisions BEGIN
  SELECT RAISE(ABORT,'QUESTION_REVISION_IMMUTABLE');
END;
CREATE TRIGGER qb_revisions_no_delete BEFORE DELETE ON qb_revisions BEGIN
  SELECT RAISE(ABORT,'QUESTION_REVISION_IMMUTABLE');
END;

CREATE TABLE qb_content_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  revision_id INTEGER NOT NULL REFERENCES qb_revisions(id),
  client_key TEXT NOT NULL,
  expected_latest_review_id INTEGER CHECK(expected_latest_review_id IS NULL OR expected_latest_review_id > 0),
  decision TEXT NOT NULL CHECK(decision IN ('approved','rejected')),
  reason TEXT NOT NULL,
  reviewer TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(revision_id,client_key)
);
CREATE INDEX idx_qb_content_reviews_revision ON qb_content_reviews(revision_id,id);
CREATE TRIGGER qb_content_reviews_no_update BEFORE UPDATE ON qb_content_reviews BEGIN
  SELECT RAISE(ABORT,'QUESTION_REVIEW_IMMUTABLE');
END;
CREATE TRIGGER qb_content_reviews_no_delete BEFORE DELETE ON qb_content_reviews BEGIN
  SELECT RAISE(ABORT,'QUESTION_REVIEW_IMMUTABLE');
END;

CREATE TABLE qb_right_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  revision_id INTEGER NOT NULL REFERENCES qb_revisions(id),
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
  UNIQUE(revision_id,client_key),
  CHECK(valid_from <= valid_until)
);
CREATE INDEX idx_qb_right_claims_revision ON qb_right_claims(revision_id,id);
CREATE TRIGGER qb_right_claims_protect BEFORE UPDATE ON qb_right_claims
  WHEN NEW.revision_id IS NOT OLD.revision_id OR NEW.client_key IS NOT OLD.client_key
    OR NEW.evidence_reference IS NOT OLD.evidence_reference OR NEW.rights_json IS NOT OLD.rights_json
    OR NEW.territories_json IS NOT OLD.territories_json OR NEW.valid_from IS NOT OLD.valid_from
    OR NEW.valid_until IS NOT OLD.valid_until OR NEW.submitted_by IS NOT OLD.submitted_by
    OR NEW.created_at IS NOT OLD.created_at
    OR NOT ((OLD.status='pending' AND NEW.status IN ('approved','rejected'))
      OR (OLD.status='approved' AND NEW.status='revoked')) BEGIN
  SELECT RAISE(ABORT,'QUESTION_CLAIM_IMMUTABLE');
END;
CREATE TRIGGER qb_right_claims_no_delete BEFORE DELETE ON qb_right_claims BEGIN
  SELECT RAISE(ABORT,'QUESTION_CLAIM_IMMUTABLE');
END;

CREATE TABLE qb_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_key TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','ready')),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  publish_key TEXT,
  publish_territory TEXT,
  publish_commercial INTEGER CHECK(publish_commercial IN (0,1)),
  published_by TEXT,
  published_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(created_by,client_key)
);
-- A one-transaction service permit is required before draft -> ready. Direct
-- SQL writers with database privileges remain part of the trusted boundary.
CREATE TABLE qb_set_publication_checks (
  set_id INTEGER PRIMARY KEY REFERENCES qb_sets(id),
  expected_version INTEGER NOT NULL,
  territory TEXT NOT NULL,
  commercial INTEGER NOT NULL CHECK(commercial IN (0,1))
);
CREATE TRIGGER qb_sets_no_ready_insert BEFORE INSERT ON qb_sets WHEN NEW.status='ready' BEGIN
  SELECT RAISE(ABORT,'SET_PUBLISH_SERVICE_REQUIRED');
END;
CREATE TRIGGER qb_sets_ready_guard BEFORE UPDATE ON qb_sets
  WHEN OLD.status='draft' AND NEW.status='ready' AND
    (NOT EXISTS(SELECT 1 FROM qb_set_publication_checks permit WHERE permit.set_id=OLD.id
      AND permit.expected_version=OLD.version AND permit.territory=NEW.publish_territory
      AND permit.commercial=NEW.publish_commercial)
    OR NOT EXISTS(SELECT 1 FROM qb_set_items WHERE set_id=OLD.id)) BEGIN
  SELECT RAISE(ABORT,'SET_PUBLISH_SERVICE_REQUIRED');
END;
CREATE TRIGGER qb_sets_ready_no_update BEFORE UPDATE ON qb_sets WHEN OLD.status='ready' BEGIN
  SELECT RAISE(ABORT,'READY_SET_IMMUTABLE');
END;
CREATE TRIGGER qb_sets_ready_no_delete BEFORE DELETE ON qb_sets WHEN OLD.status='ready' BEGIN
  SELECT RAISE(ABORT,'READY_SET_IMMUTABLE');
END;

CREATE TABLE qb_set_items (
  set_id INTEGER NOT NULL REFERENCES qb_sets(id),
  position INTEGER NOT NULL CHECK(position > 0),
  revision_id INTEGER NOT NULL REFERENCES qb_revisions(id),
  PRIMARY KEY(set_id,position),
  UNIQUE(set_id,revision_id)
);
CREATE TRIGGER qb_set_items_ready_no_insert BEFORE INSERT ON qb_set_items
  WHEN (SELECT status FROM qb_sets WHERE id=NEW.set_id)='ready' BEGIN
  SELECT RAISE(ABORT,'READY_SET_ITEMS_IMMUTABLE');
END;
CREATE TRIGGER qb_set_items_ready_no_update BEFORE UPDATE ON qb_set_items
  WHEN (SELECT status FROM qb_sets WHERE id=OLD.set_id)='ready'
    OR (SELECT status FROM qb_sets WHERE id=NEW.set_id)='ready' BEGIN
  SELECT RAISE(ABORT,'READY_SET_ITEMS_IMMUTABLE');
END;
CREATE TRIGGER qb_set_items_ready_no_delete BEFORE DELETE ON qb_set_items
  WHEN (SELECT status FROM qb_sets WHERE id=OLD.set_id)='ready' BEGIN
  SELECT RAISE(ABORT,'READY_SET_ITEMS_IMMUTABLE');
END;
