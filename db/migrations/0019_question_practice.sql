-- Stage 4: owner-scoped free web practice. Answer rows are formal submissions.
-- Internal ready sets remain private until an explicit free web opt-in.
CREATE TABLE qb_free_web_publications (
  set_id INTEGER PRIMARY KEY REFERENCES qb_sets(id),
  enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
  version INTEGER NOT NULL CHECK(version>0),
  changed_by TEXT NOT NULL,
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE qb_free_web_publication_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  set_id INTEGER NOT NULL REFERENCES qb_sets(id),
  client_key TEXT NOT NULL,
  expected_version INTEGER NOT NULL CHECK(expected_version>=0),
  enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(set_id,client_key)
);
CREATE TRIGGER qb_free_web_events_no_update BEFORE UPDATE ON qb_free_web_publication_events BEGIN
  SELECT RAISE(ABORT,'WEB_PUBLICATION_AUDIT_IMMUTABLE');
END;
CREATE TRIGGER qb_free_web_events_no_delete BEFORE DELETE ON qb_free_web_publication_events BEGIN
  SELECT RAISE(ABORT,'WEB_PUBLICATION_AUDIT_IMMUTABLE');
END;

CREATE TABLE qb_practice_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  set_id INTEGER NOT NULL REFERENCES qb_sets(id),
  client_key TEXT NOT NULL,
  set_title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','finished')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  UNIQUE(user_id,client_key),
  UNIQUE(id,user_id)
);
CREATE UNIQUE INDEX idx_qb_practice_one_active ON qb_practice_sessions(user_id,set_id) WHERE status='active';
CREATE INDEX idx_qb_practice_sessions_owner ON qb_practice_sessions(user_id,id);

CREATE TABLE qb_practice_items (
  session_id INTEGER NOT NULL REFERENCES qb_practice_sessions(id),
  position INTEGER NOT NULL CHECK(position>0),
  revision_id INTEGER NOT NULL REFERENCES qb_revisions(id),
  PRIMARY KEY(session_id,position),
  UNIQUE(session_id,revision_id)
);
CREATE TABLE qb_practice_snapshot_permits (session_id INTEGER PRIMARY KEY REFERENCES qb_practice_sessions(id));
CREATE TRIGGER qb_practice_items_insert_guard BEFORE INSERT ON qb_practice_items
  WHEN NOT EXISTS(SELECT 1 FROM qb_practice_snapshot_permits WHERE session_id=NEW.session_id) BEGIN
  SELECT RAISE(ABORT,'PRACTICE_SNAPSHOT_SEALED');
END;
CREATE TRIGGER qb_practice_items_no_update BEFORE UPDATE ON qb_practice_items BEGIN
  SELECT RAISE(ABORT,'PRACTICE_SNAPSHOT_IMMUTABLE');
END;
CREATE TRIGGER qb_practice_items_no_delete BEFORE DELETE ON qb_practice_items BEGIN
  SELECT RAISE(ABORT,'PRACTICE_SNAPSHOT_IMMUTABLE');
END;

CREATE TABLE qb_practice_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  request_id TEXT NOT NULL,
  selected_json TEXT NOT NULL CHECK(json_valid(selected_json)),
  is_correct INTEGER NOT NULL CHECK(is_correct IN (0,1)),
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(session_id,position) REFERENCES qb_practice_items(session_id,position),
  UNIQUE(session_id,position),
  UNIQUE(session_id,request_id)
);
CREATE INDEX idx_qb_practice_answers_session ON qb_practice_answers(session_id,position);
CREATE TRIGGER qb_practice_answers_no_update BEFORE UPDATE ON qb_practice_answers BEGIN
  SELECT RAISE(ABORT,'PRACTICE_ANSWER_IMMUTABLE');
END;
CREATE TRIGGER qb_practice_answers_no_delete BEFORE DELETE ON qb_practice_answers BEGIN
  SELECT RAISE(ABORT,'PRACTICE_ANSWER_IMMUTABLE');
END;

CREATE TABLE qb_practice_favorites (
  user_id INTEGER NOT NULL REFERENCES users(id),
  session_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(user_id,session_id,position),
  FOREIGN KEY(session_id,position) REFERENCES qb_practice_items(session_id,position),
  FOREIGN KEY(session_id,user_id) REFERENCES qb_practice_sessions(id,user_id)
);
CREATE INDEX idx_qb_practice_favorites_owner ON qb_practice_favorites(user_id,created_at,session_id,position);
