-- Sprint 5 additive persistence for Networking Copilot CRM, editable drafts and stage history.
-- @require-table users:id
-- @require-table applications:id,user_id
-- @require-table resumes:id,user_id
-- @require-table resume_versions_v4:id

CREATE TABLE IF NOT EXISTS networking_contacts_v4 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
  resume_id INTEGER REFERENCES resumes(id) ON DELETE SET NULL,
  resume_version_id INTEGER REFERENCES resume_versions_v4(id) ON DELETE SET NULL,
  job_id TEXT DEFAULT '',
  name TEXT NOT NULL,
  company TEXT DEFAULT '',
  role TEXT DEFAULT '',
  channel TEXT DEFAULT 'linkedin' CHECK(channel IN ('linkedin','email','alumni','event','other')),
  contact_value TEXT DEFAULT '',
  relationship_context TEXT DEFAULT '',
  context_verified INTEGER DEFAULT 0,
  status TEXT DEFAULT 'prospect' CHECK(status IN ('prospect','contacted','replied','coffee_chat','referral','closed')),
  referral_outcome TEXT DEFAULT 'none' CHECK(referral_outcome IN ('none','requested','pending','referred','declined')),
  last_contacted_at TEXT DEFAULT '',
  next_follow_up_at TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  archived_at TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS networking_drafts_v4 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL REFERENCES networking_contacts_v4(id) ON DELETE CASCADE,
  application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
  draft_type TEXT NOT NULL CHECK(draft_type IN ('connect_note','cold_message','coffee_chat','follow_up','referral_request')),
  language TEXT DEFAULT 'zh' CHECK(language IN ('zh','en')),
  tone TEXT DEFAULT 'formal' CHECK(tone IN ('formal','casual')),
  subject TEXT DEFAULT '',
  content TEXT NOT NULL,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft','copied','user_sent')),
  source TEXT DEFAULT 'rules',
  evidence_snapshot TEXT DEFAULT '{}',
  sent_at TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS networking_events_v4 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL REFERENCES networking_contacts_v4(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK(stage IN ('prospect','contacted','replied','coffee_chat','referral','closed')),
  note TEXT DEFAULT '',
  event_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_networking_contacts_user_status
  ON networking_contacts_v4(user_id, status, next_follow_up_at);
CREATE INDEX IF NOT EXISTS idx_networking_contacts_application
  ON networking_contacts_v4(user_id, application_id);
CREATE INDEX IF NOT EXISTS idx_networking_drafts_contact
  ON networking_drafts_v4(user_id, contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_networking_events_contact
  ON networking_events_v4(user_id, contact_id, event_at DESC);
