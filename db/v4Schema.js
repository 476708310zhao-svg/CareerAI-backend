const db = require('./database');

function ensureV4Schema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id             INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      school              TEXT DEFAULT '',
      major               TEXT DEFAULT '',
      degree              TEXT DEFAULT '',
      graduation_year     TEXT DEFAULT '',
      country             TEXT DEFAULT '',
      city                TEXT DEFAULT '',
      visa_status         TEXT DEFAULT '',
      work_authorization  TEXT DEFAULT '',
      sponsor_needed      INTEGER DEFAULT 0,
      target_roles        TEXT DEFAULT '[]',
      target_industries   TEXT DEFAULT '[]',
      target_cities       TEXT DEFAULT '[]',
      employment_types    TEXT DEFAULT '[]',
      skills              TEXT DEFAULT '[]',
      projects            TEXT DEFAULT '[]',
      field_sources       TEXT DEFAULT '{}',
      completion          INTEGER DEFAULT 0,
      profile_version     INTEGER DEFAULT 1,
      created_at          TEXT DEFAULT (datetime('now')),
      updated_at          TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS job_matches (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id               TEXT NOT NULL,
      profile_version      INTEGER DEFAULT 1,
      job_fingerprint      TEXT DEFAULT '',
      qualification_status TEXT NOT NULL,
      qualification_reasons TEXT DEFAULT '[]',
      score                INTEGER NOT NULL,
      dimensions           TEXT DEFAULT '{}',
      strengths            TEXT DEFAULT '[]',
      gaps                 TEXT DEFAULT '[]',
      actions              TEXT DEFAULT '[]',
      recommendation       TEXT DEFAULT '',
      created_at           TEXT DEFAULT (datetime('now')),
      updated_at           TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, job_id, profile_version, job_fingerprint)
    );

    CREATE TABLE IF NOT EXISTS application_history (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      from_status    TEXT DEFAULT '',
      to_status      TEXT NOT NULL,
      note           TEXT DEFAULT '',
      actor_type     TEXT DEFAULT 'user',
      created_at     TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS job_sponsor_profiles (
      job_id                         TEXT PRIMARY KEY,
      opt_friendly                   INTEGER,
      stem_friendly                  INTEGER,
      h1b_sponsor                    INTEGER,
      international_student_friendly INTEGER,
      citizen_required               INTEGER DEFAULT 0,
      source                         TEXT DEFAULT 'legacy_inference',
      source_url                     TEXT DEFAULT '',
      confidence                     REAL DEFAULT 0,
      evidence                       TEXT DEFAULT '[]',
      verified_at                    TEXT DEFAULT '',
      created_at                     TEXT DEFAULT (datetime('now')),
      updated_at                     TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS job_sponsor_history (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id      TEXT NOT NULL,
      before_data TEXT DEFAULT '{}',
      after_data  TEXT DEFAULT '{}',
      actor       TEXT DEFAULT '',
      note        TEXT DEFAULT '',
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS application_contacts (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name           TEXT NOT NULL,
      role           TEXT DEFAULT '',
      email          TEXT DEFAULT '',
      linkedin       TEXT DEFAULT '',
      notes          TEXT DEFAULT '',
      created_at     TEXT DEFAULT (datetime('now')),
      updated_at     TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS application_tasks (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title          TEXT NOT NULL,
      due_at         TEXT DEFAULT '',
      priority       TEXT DEFAULT 'medium',
      completed      INTEGER DEFAULT 0,
      created_at     TEXT DEFAULT (datetime('now')),
      updated_at     TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS career_experience_library (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type        TEXT NOT NULL CHECK(type IN ('education','experience','project','skill','award')),
      title       TEXT NOT NULL,
      organization TEXT DEFAULT '',
      start_date  TEXT DEFAULT '',
      end_date    TEXT DEFAULT '',
      content     TEXT DEFAULT '{}',
      verified    INTEGER DEFAULT 1,
      archived_at TEXT DEFAULT '',
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS resume_versions_v4 (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      resume_id      INTEGER NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      version_no     INTEGER NOT NULL,
      name           TEXT NOT NULL,
      resume_type    TEXT NOT NULL DEFAULT 'general',
      content        TEXT NOT NULL DEFAULT '{}',
      source_version_id INTEGER REFERENCES resume_versions_v4(id),
      change_set_id  INTEGER,
      change_summary TEXT DEFAULT '',
      created_by     TEXT DEFAULT 'user',
      created_at     TEXT DEFAULT (datetime('now')),
      UNIQUE(resume_id, version_no)
    );

    CREATE TABLE IF NOT EXISTS resume_job_links (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      resume_id      INTEGER NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id         TEXT DEFAULT '',
      application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE,
      created_at     TEXT DEFAULT (datetime('now')),
      UNIQUE(resume_id, job_id, application_id)
    );

    CREATE TABLE IF NOT EXISTS resume_ai_change_sets (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      resume_id         INTEGER NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
      source_version_id INTEGER NOT NULL REFERENCES resume_versions_v4(id),
      job_id            TEXT DEFAULT '',
      application_id    INTEGER REFERENCES applications(id) ON DELETE SET NULL,
      status            TEXT NOT NULL DEFAULT 'pending',
      suggestions       TEXT NOT NULL DEFAULT '[]',
      decisions         TEXT NOT NULL DEFAULT '{}',
      manual_content    TEXT DEFAULT '',
      ai_model          TEXT NOT NULL,
      prompt_version    TEXT NOT NULL,
      prompt_snapshot   TEXT DEFAULT '',
      quota_feature     TEXT DEFAULT 'resume_optimize',
      quota_cost        INTEGER DEFAULT 1,
      result_version_id INTEGER REFERENCES resume_versions_v4(id),
      created_at        TEXT DEFAULT (datetime('now')),
      confirmed_at      TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS ai_application_material_drafts (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      application_id    INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
      resume_id         INTEGER REFERENCES resumes(id) ON DELETE SET NULL,
      resume_version_id INTEGER REFERENCES resume_versions_v4(id) ON DELETE SET NULL,
      material_type     TEXT NOT NULL CHECK(material_type IN ('tailored_resume','cover_letter','recruiter_message','follow_up_email')),
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

    CREATE TABLE IF NOT EXISTS interview_spaces_v4 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
      company TEXT DEFAULT '', job_title TEXT DEFAULT '', interview_time TEXT DEFAULT '',
      round TEXT DEFAULT 'interview_1', preparation_completion INTEGER DEFAULT 0,
      company_experiences TEXT DEFAULT '[]', frequent_questions TEXT DEFAULT '[]',
      algorithm_questions TEXT DEFAULT '[]', behavior_questions TEXT DEFAULT '[]', role_questions TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, application_id)
    );

    CREATE TABLE IF NOT EXISTS interview_sessions_v4 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      space_id INTEGER NOT NULL REFERENCES interview_spaces_v4(id) ON DELETE CASCADE,
      session_type TEXT DEFAULT 'mock', status TEXT DEFAULT 'active',
      ai_model TEXT DEFAULT '', prompt_version TEXT DEFAULT '', started_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT DEFAULT '', cancelled_at TEXT DEFAULT '', quota_cost INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS interview_answers_v4 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES interview_sessions_v4(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      question_type TEXT DEFAULT 'role', question TEXT NOT NULL, answer TEXT DEFAULT '', feedback TEXT DEFAULT '',
      content_score INTEGER DEFAULT 0, structure_score INTEGER DEFAULT 0,
      expression_score INTEGER DEFAULT 0, job_match_score INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS interview_reports_v4 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL UNIQUE REFERENCES interview_sessions_v4(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      space_id INTEGER NOT NULL REFERENCES interview_spaces_v4(id) ON DELETE CASCADE,
      overall_score INTEGER DEFAULT 0, dimensions TEXT DEFAULT '{}', strengths TEXT DEFAULT '[]',
      weaknesses TEXT DEFAULT '[]', question_feedback TEXT DEFAULT '[]', summary TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS today_tasks_v4 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source_type TEXT DEFAULT '', source_id INTEGER, title TEXT NOT NULL, detail TEXT DEFAULT '',
      priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'pending', task_date TEXT DEFAULT (date('now')),
      completed_at TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, source_type, source_id, title)
    );

    CREATE TABLE IF NOT EXISTS reminder_deliveries_v4 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reminder_id INTEGER NOT NULL REFERENCES job_reminders(id) ON DELETE CASCADE,
      delivery_key TEXT NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed')),
      attempts INTEGER NOT NULL DEFAULT 0, lease_until TEXT DEFAULT '', in_app_message_id INTEGER,
      wx_status TEXT DEFAULT '', last_error TEXT DEFAULT '', sent_at TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(reminder_id, delivery_key)
    );

    CREATE TABLE IF NOT EXISTS favorite_sync_v4 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL, target_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','deleted')),
      title TEXT DEFAULT '', subtitle TEXT DEFAULT '', payload TEXT NOT NULL DEFAULT '{}',
      client_updated_at TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, type, target_id)
    );

    CREATE TABLE IF NOT EXISTS favorite_operations_v4 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      operation_id TEXT NOT NULL, type TEXT NOT NULL, target_id TEXT NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('upsert','delete')),
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, operation_id)
    );

    CREATE TABLE IF NOT EXISTS career_diagnostics_v4 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      snapshot_date TEXT NOT NULL DEFAULT (date('now')),
      profile_version INTEGER DEFAULT 1,
      overall_score INTEGER DEFAULT 0,
      dimensions TEXT NOT NULL DEFAULT '[]',
      evidence_notice TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, snapshot_date)
    );

    CREATE TABLE IF NOT EXISTS career_weekly_reports_v4 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      week_start TEXT NOT NULL,
      week_end TEXT NOT NULL,
      report TEXT NOT NULL DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, week_start)
    );

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

    CREATE TABLE IF NOT EXISTS oa_training_plans_v4 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
      job_id TEXT DEFAULT '', company TEXT NOT NULL, role TEXT DEFAULT '', target_date TEXT DEFAULT '',
      weekly_minutes INTEGER DEFAULT 180, focus_types TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','archived')),
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS oa_practice_sessions_v4 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan_id INTEGER NOT NULL REFERENCES oa_training_plans_v4(id) ON DELETE CASCADE,
      question_type TEXT NOT NULL, planned_seconds INTEGER DEFAULT 1800, elapsed_seconds INTEGER DEFAULT 0,
      total_questions INTEGER DEFAULT 0, correct_count INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress','completed','abandoned')),
      started_at TEXT DEFAULT (datetime('now')), completed_at TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS oa_mistakes_v4 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan_id INTEGER NOT NULL REFERENCES oa_training_plans_v4(id) ON DELETE CASCADE,
      session_id INTEGER REFERENCES oa_practice_sessions_v4(id) ON DELETE SET NULL,
      question_key TEXT NOT NULL, question_type TEXT NOT NULL, prompt TEXT NOT NULL,
      user_answer TEXT DEFAULT '', correct_answer TEXT DEFAULT '', notes TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'learning' CHECK(status IN ('learning','mastered')),
      last_practiced_at TEXT DEFAULT (datetime('now')), created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')), UNIQUE(user_id, plan_id, question_key)
    );

    CREATE TABLE IF NOT EXISTS career_projects_v4 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
      job_id TEXT DEFAULT '', track TEXT NOT NULL, title TEXT NOT NULL, target_role TEXT DEFAULT '',
      gap_summary TEXT NOT NULL DEFAULT '[]', problem_statement TEXT DEFAULT '', data_sources TEXT NOT NULL DEFAULT '[]',
      deliverables TEXT NOT NULL DEFAULT '[]', acceptance_criteria TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','in_progress','completed','archived')),
      progress INTEGER DEFAULT 0, verified_completion INTEGER DEFAULT 0,
      completion_evidence TEXT NOT NULL DEFAULT '{}',
      resume_experience_id INTEGER REFERENCES career_experience_library(id) ON DELETE SET NULL,
      source TEXT NOT NULL DEFAULT 'rules', started_at TEXT DEFAULT '', completed_at TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS career_project_milestones_v4 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES career_projects_v4(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL, description TEXT DEFAULT '', sort_order INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','doing','completed')),
      evidence_note TEXT DEFAULT '', completed_at TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS job_trust_observations_v4 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id TEXT NOT NULL,
      observed_status TEXT NOT NULL CHECK(observed_status IN ('active','closed','redirected','unavailable','unknown')),
      official_url TEXT DEFAULT '', checked_official INTEGER DEFAULT 0, note TEXT DEFAULT '',
      observed_at TEXT DEFAULT (datetime('now')), created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_agent_tasks_v4 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      agent_type TEXT NOT NULL, application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
      status TEXT DEFAULT 'queued', input TEXT DEFAULT '{}', context_snapshot TEXT DEFAULT '{}',
      output TEXT DEFAULT '{}', error_code TEXT DEFAULT '', error_message TEXT DEFAULT '', retry_count INTEGER DEFAULT 0,
      write_action TEXT DEFAULT '', confirmation_token TEXT DEFAULT '', confirmed_at TEXT DEFAULT '',
      ai_model TEXT DEFAULT '', prompt_version TEXT DEFAULT '', timeout_ms INTEGER DEFAULT 20000,
      created_at TEXT DEFAULT (datetime('now')), started_at TEXT DEFAULT '', finished_at TEXT DEFAULT '', cancelled_at TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS membership_plans_v4 (
      id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      price_cents INTEGER DEFAULT 0, duration_days INTEGER DEFAULT 30, entitlements TEXT DEFAULT '{}',
      enabled INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_subscriptions_v4 (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan_code TEXT NOT NULL, status TEXT DEFAULT 'inactive', starts_at TEXT DEFAULT '', expires_at TEXT DEFAULT '',
      order_no TEXT DEFAULT '', auto_renew INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quota_usage_v4 (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      quota_key TEXT NOT NULL, period_key TEXT NOT NULL, used INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now')), UNIQUE(user_id, quota_key, period_key)
    );

    CREATE TABLE IF NOT EXISTS payment_refunds_v4 (
      id INTEGER PRIMARY KEY AUTOINCREMENT, order_no TEXT NOT NULL, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      refund_no TEXT UNIQUE NOT NULL, amount INTEGER DEFAULT 0, status TEXT DEFAULT 'requested', reason TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rollout_config_v4 (
      feature TEXT PRIMARY KEY, percentage INTEGER DEFAULT 0, status TEXT DEFAULT 'paused',
      updated_by TEXT DEFAULT '', updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS commerce_ledger_v4 (
      id INTEGER PRIMARY KEY AUTOINCREMENT, idempotency_key TEXT UNIQUE NOT NULL, event_type TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, order_no TEXT DEFAULT '', refund_no TEXT DEFAULT '',
      plan_code TEXT DEFAULT '', amount_delta INTEGER DEFAULT 0, currency TEXT DEFAULT 'CNY', quota_key TEXT DEFAULT '',
      quota_delta INTEGER DEFAULT 0, entitlement_snapshot TEXT NOT NULL DEFAULT '{}', metadata TEXT NOT NULL DEFAULT '{}',
      actor_type TEXT DEFAULT 'system', actor_id TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS entitlement_grants_v4 (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan_code TEXT NOT NULL, order_no TEXT NOT NULL, grant_type TEXT NOT NULL CHECK(grant_type IN ('subscription','scenario')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','expired','revoked')), starts_at TEXT NOT NULL,
      expires_at TEXT NOT NULL, entitlements TEXT NOT NULL DEFAULT '{}', source TEXT DEFAULT 'payment', revoked_at TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), UNIQUE(order_no, plan_code)
    );

    CREATE TABLE IF NOT EXISTS commerce_alerts_v4 (
      id INTEGER PRIMARY KEY AUTOINCREMENT, fingerprint TEXT UNIQUE NOT NULL, category TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'warning', status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','acknowledged','resolved')),
      message TEXT NOT NULL, evidence TEXT NOT NULL DEFAULT '{}', occurrences INTEGER DEFAULT 1,
      first_seen_at TEXT DEFAULT (datetime('now')), last_seen_at TEXT DEFAULT (datetime('now')),
      acknowledged_by TEXT DEFAULT '', acknowledged_at TEXT DEFAULT '', resolved_at TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS error_events_v4 (
      id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT DEFAULT '', severity TEXT DEFAULT 'error', code TEXT DEFAULT '',
      message TEXT DEFAULT '', route TEXT DEFAULT '', user_id INTEGER, context TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS api_performance_v4 (
      id INTEGER PRIMARY KEY AUTOINCREMENT, route TEXT NOT NULL, method TEXT DEFAULT 'GET', duration_ms INTEGER DEFAULT 0,
      status_code INTEGER DEFAULT 200, slow INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_user_profiles_completion
      ON user_profiles(completion, updated_at);
    CREATE INDEX IF NOT EXISTS idx_job_matches_user_score
      ON job_matches(user_id, score DESC, updated_at);
    CREATE INDEX IF NOT EXISTS idx_application_history_application_time
      ON application_history(application_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_job_sponsor_profiles_filter
      ON job_sponsor_profiles(h1b_sponsor, opt_friendly, citizen_required);
    CREATE INDEX IF NOT EXISTS idx_job_sponsor_history_job_time
      ON job_sponsor_history(job_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_application_contacts_application
      ON application_contacts(application_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_application_tasks_due
      ON application_tasks(user_id, completed, due_at);
    CREATE INDEX IF NOT EXISTS idx_career_experience_user_type
      ON career_experience_library(user_id, type, archived_at, updated_at);
    CREATE INDEX IF NOT EXISTS idx_resume_versions_resume_no
      ON resume_versions_v4(resume_id, version_no DESC);
    CREATE INDEX IF NOT EXISTS idx_resume_links_application
      ON resume_job_links(user_id, application_id, job_id);
    CREATE INDEX IF NOT EXISTS idx_resume_change_sets_user_status
      ON resume_ai_change_sets(user_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_material_drafts_application
      ON ai_application_material_drafts(user_id, application_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_interview_spaces_user_time ON interview_spaces_v4(user_id, interview_time, updated_at);
    CREATE INDEX IF NOT EXISTS idx_interview_sessions_space ON interview_sessions_v4(space_id, status, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_interview_reports_user ON interview_reports_v4(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_today_tasks_user_date ON today_tasks_v4(user_id, task_date, status);
    CREATE INDEX IF NOT EXISTS idx_reminder_deliveries_status_lease ON reminder_deliveries_v4(status, lease_until, updated_at);
    CREATE INDEX IF NOT EXISTS idx_reminder_deliveries_reminder ON reminder_deliveries_v4(reminder_id, status);
    CREATE INDEX IF NOT EXISTS idx_favorite_sync_user_status ON favorite_sync_v4(user_id, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_favorite_operations_user_time ON favorite_operations_v4(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_career_diagnostics_user_date ON career_diagnostics_v4(user_id, snapshot_date DESC);
    CREATE INDEX IF NOT EXISTS idx_career_weekly_reports_user_week ON career_weekly_reports_v4(user_id, week_start DESC);
    CREATE INDEX IF NOT EXISTS idx_networking_contacts_user_status ON networking_contacts_v4(user_id, status, next_follow_up_at);
    CREATE INDEX IF NOT EXISTS idx_networking_contacts_application ON networking_contacts_v4(user_id, application_id);
    CREATE INDEX IF NOT EXISTS idx_networking_drafts_contact ON networking_drafts_v4(user_id, contact_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_networking_events_contact ON networking_events_v4(user_id, contact_id, event_at DESC);
    CREATE INDEX IF NOT EXISTS idx_oa_plans_user_status ON oa_training_plans_v4(user_id, status, target_date);
    CREATE INDEX IF NOT EXISTS idx_oa_sessions_plan_time ON oa_practice_sessions_v4(user_id, plan_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_oa_mistakes_user_status ON oa_mistakes_v4(user_id, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_career_projects_user_status ON career_projects_v4(user_id, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_career_project_milestones_project ON career_project_milestones_v4(user_id, project_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_job_trust_observations_job ON job_trust_observations_v4(user_id, job_id, observed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_tasks_user_status ON ai_agent_tasks_v4(user_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status ON user_subscriptions_v4(user_id, status, expires_at);
    CREATE INDEX IF NOT EXISTS idx_quota_usage_user_period ON quota_usage_v4(user_id, period_key);
    CREATE INDEX IF NOT EXISTS idx_performance_slow_time ON api_performance_v4(slow, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_commerce_ledger_user_time ON commerce_ledger_v4(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_commerce_ledger_order ON commerce_ledger_v4(order_no, event_type);
    CREATE INDEX IF NOT EXISTS idx_entitlement_grants_user_status ON entitlement_grants_v4(user_id, status, expires_at);
    CREATE INDEX IF NOT EXISTS idx_commerce_alerts_status_severity ON commerce_alerts_v4(status, severity, last_seen_at DESC);
  `);

  db.prepare(`INSERT OR IGNORE INTO rollout_config_v4 (feature, percentage, status) VALUES ('v4', 0, 'paused')`).run();
  db.prepare(`INSERT OR IGNORE INTO rollout_config_v4 (feature, percentage, status) VALUES ('commerce', 0, 'paused')`).run();
  const insertPlan = db.prepare(`INSERT OR IGNORE INTO membership_plans_v4 (code, name, price_cents, duration_days, entitlements, sort_order) VALUES (?, ?, ?, ?, ?, ?)`);
  insertPlan.run('free', '免费版', 0, 0, JSON.stringify({ ai_daily: 3, resume_versions: 3, interview_monthly: 2, advanced_match: false }), 0);
  insertPlan.run('pro_month', '求职 Pro 月卡', 4000, 30, JSON.stringify({ ai_daily: 100, resume_versions: 50, interview_monthly: 30, advanced_match: true }), 1);
  insertPlan.run('pro_quarter', '求职 Pro 季卡', 10000, 90, JSON.stringify({ ai_daily: 100, resume_versions: 60, interview_monthly: 90, advanced_match: true }), 2);
  insertPlan.run('pro_year', '求职 Pro 年卡', 29900, 365, JSON.stringify({ ai_daily: 100, resume_versions: 100, interview_monthly: 365, advanced_match: true }), 3);
  insertPlan.run('pro_trial_7d', '体验会员', 1000, 7, JSON.stringify({ ai_daily: 20, resume_versions: 10, interview_monthly: 5, advanced_match: true }), 4);
  insertPlan.run('jd_resume_pack', 'JD 简历包', 1990, 30, JSON.stringify({ resume_versions: 5, application_assistant: 10 }), 5);
  insertPlan.run('interview_sprint_7d', '7 天面试冲刺包', 2990, 7, JSON.stringify({ interview_monthly: 20, ai_daily: 20 }), 6);
  insertPlan.run('autumn_recruit_quarter', '秋招季度包', 9900, 90, JSON.stringify({ ai_daily: 30, resume_versions: 25, interview_monthly: 30, application_assistant: 30, advanced_match: true }), 7);

  const resumeColumns = db.pragma('table_info(resumes)').map(column => column.name);
  [
    ['resume_type', 'TEXT DEFAULT "general"'],
    ['current_version_id', 'INTEGER'],
    ['archived_at', 'TEXT DEFAULT ""']
  ].forEach(([name, ddl]) => {
    if (!resumeColumns.includes(name)) db.exec(`ALTER TABLE resumes ADD COLUMN ${name} ${ddl}`);
  });

  const applicationColumns = db.pragma('table_info(applications)').map(column => column.name);
  [
    ['next_action', 'TEXT DEFAULT ""'],
    ['cover_letter', 'TEXT DEFAULT ""'],
    ['archived_at', 'TEXT DEFAULT ""'],
    ['v4_status', 'TEXT DEFAULT ""']
  ].forEach(([name, ddl]) => {
    if (!applicationColumns.includes(name)) db.exec(`ALTER TABLE applications ADD COLUMN ${name} ${ddl}`);
  });

  const materialColumns = db.pragma('table_info(application_materials)').map(column => column.name);
  [
    ['application_id', 'INTEGER'],
    ['status', 'TEXT DEFAULT "saved"'],
    ['ai_draft_id', 'INTEGER'],
    ['ai_model', 'TEXT DEFAULT ""'],
    ['prompt_version', 'TEXT DEFAULT ""']
  ].forEach(([name, ddl]) => {
    if (!materialColumns.includes(name)) db.exec(`ALTER TABLE application_materials ADD COLUMN ${name} ${ddl}`);
  });

  const todayTaskColumns = db.pragma('table_info(today_tasks_v4)').map(column => column.name);
  [
    ['local_key', 'TEXT DEFAULT ""'],
    ['task_type', 'TEXT DEFAULT "general"'],
    ['url', 'TEXT DEFAULT ""'],
    ['updated_at', 'TEXT DEFAULT ""']
  ].forEach(([name, ddl]) => {
    if (!todayTaskColumns.includes(name)) db.exec(`ALTER TABLE today_tasks_v4 ADD COLUMN ${name} ${ddl}`);
  });
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_today_tasks_local_key ON today_tasks_v4(user_id, task_date, local_key) WHERE local_key != ''");

  const networkingContactColumns = db.pragma('table_info(networking_contacts_v4)').map(column => column.name);
  if (!networkingContactColumns.includes('contact_value')) {
    db.exec('ALTER TABLE networking_contacts_v4 ADD COLUMN contact_value TEXT DEFAULT ""');
  }
}

module.exports = { ensureV4Schema };
