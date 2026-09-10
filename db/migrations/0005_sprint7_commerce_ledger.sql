-- Sprint 7 additive persistence for auditable commerce, entitlement grants and operational alerts.
-- @require-table users:id
-- @require-table orders:id,user_id,order_no,status

CREATE TABLE IF NOT EXISTS commerce_ledger_v4 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  idempotency_key TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  order_no TEXT DEFAULT '',
  refund_no TEXT DEFAULT '',
  plan_code TEXT DEFAULT '',
  amount_delta INTEGER DEFAULT 0,
  currency TEXT DEFAULT 'CNY',
  quota_key TEXT DEFAULT '',
  quota_delta INTEGER DEFAULT 0,
  entitlement_snapshot TEXT NOT NULL DEFAULT '{}',
  metadata TEXT NOT NULL DEFAULT '{}',
  actor_type TEXT DEFAULT 'system',
  actor_id TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS entitlement_grants_v4 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL,
  order_no TEXT NOT NULL,
  grant_type TEXT NOT NULL CHECK(grant_type IN ('subscription','scenario')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','expired','revoked')),
  starts_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  entitlements TEXT NOT NULL DEFAULT '{}',
  source TEXT DEFAULT 'payment',
  revoked_at TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(order_no, plan_code)
);

CREATE TABLE IF NOT EXISTS commerce_alerts_v4 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','acknowledged','resolved')),
  message TEXT NOT NULL,
  evidence TEXT NOT NULL DEFAULT '{}',
  occurrences INTEGER DEFAULT 1,
  first_seen_at TEXT DEFAULT (datetime('now')),
  last_seen_at TEXT DEFAULT (datetime('now')),
  acknowledged_by TEXT DEFAULT '',
  acknowledged_at TEXT DEFAULT '',
  resolved_at TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_commerce_ledger_user_time
  ON commerce_ledger_v4(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commerce_ledger_order
  ON commerce_ledger_v4(order_no, event_type);
CREATE INDEX IF NOT EXISTS idx_entitlement_grants_user_status
  ON entitlement_grants_v4(user_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_commerce_alerts_status_severity
  ON commerce_alerts_v4(status, severity, last_seen_at DESC);
