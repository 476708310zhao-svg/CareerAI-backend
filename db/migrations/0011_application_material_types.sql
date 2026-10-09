-- Expand the application-material draft types through the formal migration
-- runner. SQLite cannot alter a CHECK constraint in place, so preserve every
-- row while rebuilding the table inside the runner's transaction.
-- @require-table ai_application_material_drafts:id,user_id,application_id,resume_id,resume_version_id,material_type,status,content,ai_model,prompt_version,prompt_snapshot,quota_feature,quota_cost,saved_material_id,created_at,confirmed_at
-- @require-table application_materials:id,user_id,ai_draft_id
-- @require-table resume_versions_v4:id,resume_id,user_id
-- @require-table interview_notebook:id,user_id,question_id,title,answer,category,difficulty,status,created_at,updated_at

CREATE TEMP TABLE migration_0011_sequence_snapshot (
  table_name TEXT PRIMARY KEY,
  old_seq INTEGER NOT NULL
);

INSERT INTO migration_0011_sequence_snapshot (table_name, old_seq) VALUES
  ('interview_notebook', COALESCE((SELECT MAX(seq) FROM sqlite_sequence WHERE name='interview_notebook'), 0)),
  ('ai_application_material_drafts', COALESCE((SELECT MAX(seq) FROM sqlite_sequence WHERE name='ai_application_material_drafts'), 0));

ALTER TABLE interview_notebook RENAME TO interview_notebook_0011_legacy;

CREATE TABLE interview_notebook (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id    TEXT NOT NULL,
  title          TEXT NOT NULL,
  answer         TEXT DEFAULT '',
  category       TEXT DEFAULT '',
  difficulty     TEXT DEFAULT '',
  status         TEXT DEFAULT 'unknown',
  application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
  company        TEXT DEFAULT '',
  position       TEXT DEFAULT '',
  created_at     TEXT DEFAULT (datetime('now')),
  updated_at     TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, question_id)
);

INSERT INTO interview_notebook
  (id,user_id,question_id,title,answer,category,difficulty,status,created_at,updated_at)
SELECT id,user_id,question_id,title,answer,category,difficulty,status,created_at,updated_at
FROM interview_notebook_0011_legacy;

DROP TABLE interview_notebook_0011_legacy;

CREATE INDEX idx_interview_notebook_user
  ON interview_notebook(user_id, status, updated_at);
CREATE INDEX idx_interview_notebook_application
  ON interview_notebook(user_id, application_id, updated_at DESC);

ALTER TABLE ai_application_material_drafts RENAME TO ai_application_material_drafts_0011_legacy;

CREATE TABLE ai_application_material_drafts (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_id    INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  resume_id         INTEGER REFERENCES resumes(id) ON DELETE SET NULL,
  resume_version_id INTEGER REFERENCES resume_versions_v4(id) ON DELETE SET NULL,
  material_type     TEXT NOT NULL CHECK(material_type IN ('tailored_resume','cover_letter','why_company','why_role','recruiter_message','follow_up_email')),
  status            TEXT NOT NULL DEFAULT 'pending',
  content           TEXT NOT NULL,
  ai_model          TEXT NOT NULL,
  prompt_version    TEXT NOT NULL,
  prompt_snapshot   TEXT DEFAULT '',
  quota_feature     TEXT DEFAULT 'application_assistant',
  quota_cost        INTEGER DEFAULT 1,
  saved_material_id INTEGER REFERENCES application_materials(id) ON DELETE SET NULL,
  created_at        TEXT DEFAULT (datetime('now')),
  confirmed_at      TEXT DEFAULT ''
);

INSERT INTO ai_application_material_drafts
  (id, user_id, application_id, resume_id, resume_version_id, material_type, status,
   content, ai_model, prompt_version, prompt_snapshot, quota_feature, quota_cost,
   saved_material_id, created_at, confirmed_at)
SELECT
  id, user_id, application_id, resume_id, resume_version_id, material_type, status,
  content, ai_model, prompt_version, prompt_snapshot, quota_feature, quota_cost,
  saved_material_id, created_at, confirmed_at
FROM ai_application_material_drafts_0011_legacy;

DROP TABLE ai_application_material_drafts_0011_legacy;

CREATE INDEX IF NOT EXISTS idx_ai_material_drafts_application
  ON ai_application_material_drafts(user_id, application_id, status, created_at DESC);

-- Older runtime code could save the same confirmed draft more than once.
-- Point confirmed drafts at the oldest canonical material before clearing the
-- duplicate links. This keeps a repeated confirmation idempotent after upgrade.
UPDATE ai_application_material_drafts
SET saved_material_id = (
  SELECT MIN(material.id)
  FROM application_materials AS material
  WHERE material.user_id = ai_application_material_drafts.user_id
    AND material.ai_draft_id = ai_application_material_drafts.id
)
WHERE status = 'confirmed'
  AND EXISTS (
    SELECT 1
    FROM application_materials AS material
    WHERE material.user_id = ai_application_material_drafts.user_id
      AND material.ai_draft_id = ai_application_material_drafts.id
  );

-- Preserve every material row, but keep only the oldest canonical draft link.
UPDATE application_materials
SET ai_draft_id = NULL
WHERE ai_draft_id IS NOT NULL
  AND id NOT IN (
    SELECT MIN(id) FROM application_materials
    WHERE ai_draft_id IS NOT NULL
    GROUP BY user_id, ai_draft_id
  );

CREATE UNIQUE INDEX idx_application_materials_ai_draft_owner
  ON application_materials(user_id, ai_draft_id)
  WHERE ai_draft_id IS NOT NULL;

-- Rebuilding AUTOINCREMENT tables removes their legacy sqlite_sequence rows.
-- Never move a sequence backwards, even when high historical ids were deleted.
DELETE FROM sqlite_sequence
WHERE name IN ('interview_notebook', 'ai_application_material_drafts');

INSERT INTO sqlite_sequence(name, seq)
SELECT 'interview_notebook',
  MAX(old_seq, COALESCE((SELECT MAX(id) FROM interview_notebook), 0))
FROM migration_0011_sequence_snapshot
WHERE table_name='interview_notebook';

INSERT INTO sqlite_sequence(name, seq)
SELECT 'ai_application_material_drafts',
  MAX(old_seq, COALESCE((SELECT MAX(id) FROM ai_application_material_drafts), 0))
FROM migration_0011_sequence_snapshot
WHERE table_name='ai_application_material_drafts';

DROP TABLE migration_0011_sequence_snapshot;
