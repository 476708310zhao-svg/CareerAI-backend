-- Assessment products intentionally contain no seeded commercial content.
-- @require-table companies:id,display_name,logo_url
CREATE TABLE assessment_products (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL, cover_url TEXT NOT NULL, summary TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '', catalog_text TEXT NOT NULL DEFAULT '',
 sample_images TEXT NOT NULL DEFAULT '[]', season_label TEXT NOT NULL DEFAULT '',
 price_cents INTEGER NOT NULL CHECK(price_cents > 0),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','inactive')),
 sort_order INTEGER NOT NULL DEFAULT 0, drive_name TEXT NOT NULL DEFAULT '',
 drive_url TEXT NOT NULL DEFAULT '', extraction_code TEXT NOT NULL DEFAULT '',
 usage_instructions TEXT NOT NULL DEFAULT '', claim_instructions TEXT NOT NULL DEFAULT '',
 update_instructions TEXT NOT NULL DEFAULT '', after_sales_instructions TEXT NOT NULL DEFAULT '',
 source_description TEXT NOT NULL DEFAULT '', claim_days INTEGER,
 virtual_product_id TEXT NOT NULL DEFAULT '', updated_by TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE assessment_product_companies (
 product_id INTEGER NOT NULL REFERENCES assessment_products(id),
 company_id INTEGER NOT NULL REFERENCES companies(id), PRIMARY KEY(product_id,company_id)
);
CREATE TABLE assessment_home_config (
 id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL DEFAULT 0,
 items TEXT NOT NULL DEFAULT '[]', updated_by TEXT NOT NULL DEFAULT '',
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE assessment_order_details (
 order_no TEXT PRIMARY KEY REFERENCES orders(order_no),
 product_id INTEGER NOT NULL REFERENCES assessment_products(id),
 -- Retain historical accounting owner ids after account deletion, like orders.user_id.
 user_id INTEGER NOT NULL, snapshot TEXT NOT NULL,
 idempotency_key TEXT NOT NULL, source TEXT NOT NULL DEFAULT '', source_company_id INTEGER,
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 UNIQUE(user_id,idempotency_key)
);
CREATE INDEX assessment_orders_owner_product ON assessment_order_details(user_id,product_id);
CREATE TABLE assessment_deliveries (
 order_no TEXT PRIMARY KEY REFERENCES orders(order_no),
 status TEXT NOT NULL CHECK(status IN ('ready','revoked')),
 expires_at TEXT, delivered_at TEXT NOT NULL DEFAULT (datetime('now')),
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE assessment_product_audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL,
 actor_id TEXT NOT NULL, action TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
