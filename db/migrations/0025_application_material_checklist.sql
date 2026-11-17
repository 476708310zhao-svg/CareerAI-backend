-- @require-table applications:id,user_id,resume_id,resume_version_id,archived_at
-- @require-table users:id
ALTER TABLE applications ADD COLUMN resume_selection_version INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX idx_applications_id_owner_for_checklist
  ON applications(id, user_id);

CREATE TABLE application_material_checklist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK(length(trim(label)) BETWEEN 1 AND 120),
  state TEXT NOT NULL DEFAULT 'needed' CHECK(state IN ('needed','ready','not_applicable')),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  client_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (application_id, user_id) REFERENCES applications(id, user_id) ON DELETE CASCADE,
  UNIQUE (user_id, application_id, client_key)
);

CREATE INDEX idx_application_material_checklist_owner
  ON application_material_checklist_items(user_id, application_id, deleted_at, id);
