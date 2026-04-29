const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'jobapp.db');
const db = new Database(DB_PATH);

// WAL 模式提升并发读性能
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── 建表（不存在才创建）────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    openid      TEXT    UNIQUE NOT NULL,
    nickname    TEXT    DEFAULT '新用户',
    avatar      TEXT    DEFAULT '/images/default-avatar.png',
    email       TEXT    DEFAULT '',
    phone       TEXT    DEFAULT '',
    education   TEXT    DEFAULT '{}',
    job_preference TEXT DEFAULT '{}',
    vip_level   INTEGER DEFAULT 0,
    vip_expires_at TEXT,
    created_at  TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS resumes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    name        TEXT    DEFAULT '我的简历',
    language    TEXT    DEFAULT 'zh',
    education   TEXT    DEFAULT '[]',
    experience  TEXT    DEFAULT '[]',
    skills      TEXT    DEFAULT '[]',
    created_at  TEXT    DEFAULT (datetime('now')),
    updated_at  TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS applications (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    job_id      TEXT    NOT NULL,
    job_snapshot TEXT   DEFAULT '{}',
    resume_id   INTEGER,
    status      TEXT    DEFAULT 'applied',
    status_text TEXT    DEFAULT '已投递',
    applied_at  TEXT    DEFAULT (datetime('now')),
    viewed_at   TEXT
  );

  CREATE TABLE IF NOT EXISTS experiences (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER,
    user_name     TEXT    DEFAULT '匿名用户',
    user_avatar   TEXT    DEFAULT '',
    company       TEXT    NOT NULL,
    position      TEXT    NOT NULL,
    type          TEXT    DEFAULT '面试',
    round         TEXT    DEFAULT '一面',
    title         TEXT    NOT NULL,
    content       TEXT    NOT NULL,
    tags          TEXT    DEFAULT '[]',
    likes_count   INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    is_anonymous  INTEGER DEFAULT 0,
    created_at    TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS salaries (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    company            TEXT NOT NULL,
    position           TEXT NOT NULL,
    location           TEXT DEFAULT '',
    years_of_experience INTEGER DEFAULT 0,
    base_salary        REAL DEFAULT 0,
    bonus              REAL DEFAULT 0,
    stock              REAL DEFAULT 0,
    total_compensation REAL DEFAULT 0,
    currency           TEXT DEFAULT 'CNY',
    created_at         TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    title        TEXT NOT NULL,
    company      TEXT NOT NULL,
    company_logo TEXT DEFAULT '',
    location     TEXT DEFAULT '',
    region       TEXT DEFAULT '',
    salary       TEXT DEFAULT '',
    job_type     TEXT DEFAULT '全职',
    industry     TEXT DEFAULT '',
    description  TEXT DEFAULT '',
    requirements TEXT DEFAULT '[]',
    visa_sponsored INTEGER DEFAULT 0,
    posted_at    TEXT DEFAULT (datetime('now')),
    view_count   INTEGER DEFAULT 0,
    apply_count  INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS favorites (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    type       TEXT    NOT NULL,
    target_id  TEXT    NOT NULL,
    title      TEXT    DEFAULT '',
    subtitle   TEXT    DEFAULT '',
    created_at TEXT    DEFAULT (datetime('now')),
    UNIQUE(user_id, type, target_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    type       TEXT    DEFAULT 'system',
    title      TEXT    NOT NULL,
    content    TEXT    NOT NULL,
    is_read    INTEGER DEFAULT 0,
    created_at TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS feedbacks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER,
    type       TEXT    DEFAULT '其他',
    content    TEXT    NOT NULL,
    contact    TEXT    DEFAULT '',
    created_at TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS comments (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    experience_id INTEGER NOT NULL,
    user_id       INTEGER NOT NULL,
    user_name     TEXT    DEFAULT '匿名用户',
    user_avatar   TEXT    DEFAULT '',
    content       TEXT    NOT NULL,
    likes_count   INTEGER DEFAULT 0,
    created_at    TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS comment_replies (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL,
    user_name  TEXT    DEFAULT '匿名用户',
    content    TEXT    NOT NULL,
    created_at TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS comment_likes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL,
    created_at TEXT    DEFAULT (datetime('now')),
    UNIQUE(comment_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS experience_likes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    experience_id INTEGER NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
    user_id       INTEGER NOT NULL,
    created_at    TEXT    DEFAULT (datetime('now')),
    UNIQUE(experience_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS agencies (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL,
    type         TEXT    DEFAULT '综合',
    description  TEXT    DEFAULT '',
    services     TEXT    DEFAULT '[]',
    price_range  TEXT    DEFAULT '{}',
    specialties  TEXT    DEFAULT '[]',
    website      TEXT    DEFAULT '',
    phone        TEXT    DEFAULT '',
    city         TEXT    DEFAULT '',
    logo         TEXT    DEFAULT '',
    is_verified  INTEGER DEFAULT 0,
    rating_avg   REAL    DEFAULT 0,
    review_count INTEGER DEFAULT 0,
    ai_eval      TEXT    DEFAULT NULL,
    ai_eval_at   TEXT    DEFAULT NULL,
    created_at   TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS agency_reviews (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    agency_id      INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    user_id        INTEGER NOT NULL REFERENCES users(id),
    rating_overall REAL    NOT NULL CHECK(rating_overall BETWEEN 1 AND 5),
    rating_effect  REAL    DEFAULT 0,
    rating_value   REAL    DEFAULT 0,
    rating_service REAL    DEFAULT 0,
    title          TEXT    DEFAULT '',
    content        TEXT    NOT NULL,
    pros           TEXT    DEFAULT '',
    cons           TEXT    DEFAULT '',
    is_anonymous   INTEGER DEFAULT 0,
    likes_count    INTEGER DEFAULT 0,
    created_at     TEXT    DEFAULT (datetime('now')),
    UNIQUE(user_id, agency_id)
  );

  CREATE TABLE IF NOT EXISTS announcements (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    title        TEXT    NOT NULL,
    content      TEXT    NOT NULL,
    category     TEXT    DEFAULT '公告',
    cover_url    TEXT    DEFAULT '',
    is_pinned    INTEGER DEFAULT 0,
    is_published INTEGER DEFAULT 1,
    created_at   TEXT    DEFAULT (datetime('now')),
    updated_at   TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS banners (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT    NOT NULL,
    subtitle   TEXT    DEFAULT '',
    icon       TEXT    DEFAULT '🎯',
    gradient   TEXT    DEFAULT 'linear-gradient(135deg,#1C3578 0%,#2B5CE6 100%)',
    image_url  TEXT    DEFAULT '',
    url        TEXT    DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    is_active  INTEGER DEFAULT 1,
    created_at TEXT    DEFAULT (datetime('now')),
    updated_at TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS campus_schedules (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    company        TEXT    NOT NULL,
    company_logo   TEXT    DEFAULT '',
    region         TEXT    NOT NULL DEFAULT '北美',
    position_type  TEXT    DEFAULT '技术',
    recruit_year   INTEGER DEFAULT 2025,
    timeline       TEXT    DEFAULT '[]',
    app_open_month INTEGER DEFAULT NULL,
    deadline_month INTEGER DEFAULT NULL,
    offer_month    INTEGER DEFAULT NULL,
    notes          TEXT    DEFAULT '',
    source         TEXT    DEFAULT '综合公开信息',
    is_verified    INTEGER DEFAULT 0,
    view_count     INTEGER DEFAULT 0,
    created_at     TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS companies (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    slug            TEXT    UNIQUE NOT NULL,
    display_name    TEXT    NOT NULL,
    name_zh         TEXT    DEFAULT '',
    name_en         TEXT    DEFAULT '',
    legal_name      TEXT    DEFAULT '',
    official_domain TEXT    DEFAULT '',
    website_url     TEXT    DEFAULT '',
    logo_url        TEXT    DEFAULT '',
    logo_source     TEXT    DEFAULT '',
    logo_status     TEXT    DEFAULT 'pending',
    brand_color     TEXT    DEFAULT '',
    industry_l1     TEXT    DEFAULT '',
    industry_l2     TEXT    DEFAULT '',
    hq_country      TEXT    DEFAULT '',
    hq_city         TEXT    DEFAULT '',
    founded_year    INTEGER DEFAULT NULL,
    employee_count  INTEGER DEFAULT NULL,
    employee_range  TEXT    DEFAULT '',
    market          TEXT    DEFAULT '',
    ticker          TEXT    DEFAULT '',
    exchange_name   TEXT    DEFAULT '',
    is_public       INTEGER DEFAULT 0,
    description_zh  TEXT    DEFAULT '',
    description_en  TEXT    DEFAULT '',
    tags            TEXT    DEFAULT '[]',
    source_primary  TEXT    DEFAULT 'seed',
    source_payload  TEXT    DEFAULT '{}',
    data_status     TEXT    DEFAULT 'published',
    last_synced_at  TEXT    DEFAULT NULL,
    created_at      TEXT    DEFAULT (datetime('now')),
    updated_at      TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS company_aliases (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    alias      TEXT    NOT NULL,
    alias_type TEXT    DEFAULT 'name',
    lang       TEXT    DEFAULT 'auto',
    is_primary INTEGER DEFAULT 0,
    created_at TEXT    DEFAULT (datetime('now')),
    UNIQUE(company_id, alias)
  );

  CREATE TABLE IF NOT EXISTS company_sync_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    provider   TEXT    NOT NULL,
    sync_type  TEXT    NOT NULL,
    status     TEXT    NOT NULL,
    message    TEXT    DEFAULT '',
    payload    TEXT    DEFAULT '{}',
    created_at TEXT    DEFAULT (datetime('now'))
  );
`);

// ─── 性能索引（幂等，不存在才创建）────────────────────────────────────────────
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_users_openid ON users(openid);
  CREATE INDEX IF NOT EXISTS idx_applications_user_id ON applications(user_id);
  CREATE INDEX IF NOT EXISTS idx_applications_job_id ON applications(job_id);
  CREATE INDEX IF NOT EXISTS idx_experiences_user_id ON experiences(user_id);
  CREATE INDEX IF NOT EXISTS idx_comments_experience_id ON comments(experience_id);
  CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);
  CREATE INDEX IF NOT EXISTS idx_messages_user_id_read ON messages(user_id, is_read);
  CREATE INDEX IF NOT EXISTS idx_favorites_user_type_target ON favorites(user_id, type, target_id);
  CREATE INDEX IF NOT EXISTS idx_agency_reviews_agency_id ON agency_reviews(agency_id);
  CREATE INDEX IF NOT EXISTS idx_comment_replies_comment_id ON comment_replies(comment_id);
  CREATE INDEX IF NOT EXISTS idx_experience_likes_exp_id ON experience_likes(experience_id);
  CREATE INDEX IF NOT EXISTS idx_campus_region_year ON campus_schedules(region, recruit_year);
  CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug);
  CREATE INDEX IF NOT EXISTS idx_companies_domain ON companies(official_domain);
  CREATE INDEX IF NOT EXISTS idx_companies_industry_country ON companies(industry_l1, hq_country);
  CREATE INDEX IF NOT EXISTS idx_company_aliases_alias ON company_aliases(alias);
`);

// 兼容旧库：为 campus_schedules 补齐后续迭代新增字段
const campusColumns = db.prepare("PRAGMA table_info(campus_schedules)").all().map((col) => col.name);
[
  ['industry', 'TEXT DEFAULT ""'],
  ['recruit_type', 'TEXT DEFAULT "春招"'],
  ['locations', 'TEXT DEFAULT "[]"'],
  ['start_date', 'TEXT DEFAULT ""'],
  ['deadline_date', 'TEXT DEFAULT ""'],
  ['written_test', 'TEXT DEFAULT "需要笔试"'],
  ['position_name', 'TEXT DEFAULT ""'],
  ['apply_url', 'TEXT DEFAULT ""'],
  ['announce_url', 'TEXT DEFAULT ""'],
  ['grad_year', 'INTEGER DEFAULT 2026'],
  ['is_hot', 'INTEGER DEFAULT 0']
].forEach(([name, ddl]) => {
  if (!campusColumns.includes(name)) {
    db.exec(`ALTER TABLE campus_schedules ADD COLUMN ${name} ${ddl}`);
  }
});

// ─── 网页端登录兼容：给 users 表补 password 字段（幂等）─────────────────────
const userCols = db.pragma('table_info(users)').map(c => c.name);
if (!userCols.includes('password')) {
  db.exec(`ALTER TABLE users ADD COLUMN password TEXT DEFAULT ''`);
}

// ─── T-5修复：给 resumes 表补 data 字段，用于存储完整前端简历 JSON（幂等）──
const resumeCols = db.pragma('table_info(resumes)').map(c => c.name);
if (!resumeCols.includes('data')) {
  db.exec(`ALTER TABLE resumes ADD COLUMN data TEXT DEFAULT ''`);
}

// ─── 给 banners 表补 image_url 字段（幂等）────────────────────────────────────
const bannerCols = db.pragma('table_info(banners)').map(c => c.name);
if (bannerCols.length > 0 && !bannerCols.includes('image_url')) {
  db.exec(`ALTER TABLE banners ADD COLUMN image_url TEXT DEFAULT ''`);
}

module.exports = db;
