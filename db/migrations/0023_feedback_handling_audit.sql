-- @require-table feedbacks:id,type,content,status,admin_note,created_at,updated_at
ALTER TABLE feedbacks ADD COLUMN review_version INTEGER NOT NULL DEFAULT 0;

CREATE TABLE feedback_handling_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feedback_id INTEGER NOT NULL REFERENCES feedbacks(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  from_note TEXT NOT NULL,
  to_note TEXT NOT NULL,
  actor_id INTEGER NOT NULL,
  actor_name TEXT NOT NULL,
  acted_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_feedback_handling_events_version
  ON feedback_handling_events(feedback_id, version);
CREATE INDEX idx_feedback_handling_events_feedback
  ON feedback_handling_events(feedback_id, id);
