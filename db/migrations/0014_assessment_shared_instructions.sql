-- Shared customer terms start empty: operators must supply and confirm real copy.
CREATE TABLE assessment_shared_instructions (
 id INTEGER PRIMARY KEY CHECK(id=1),
 usage_instructions TEXT NOT NULL DEFAULT '', claim_instructions TEXT NOT NULL DEFAULT '',
 update_instructions TEXT NOT NULL DEFAULT '', after_sales_instructions TEXT NOT NULL DEFAULT '',
 version INTEGER NOT NULL DEFAULT 0 CHECK(version >= 0),
 updated_by TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO assessment_shared_instructions(id) VALUES (1);
-- Pending per-product terms are no longer valid; paid snapshots and receipts stay intact.
UPDATE orders SET status='cancelled' WHERE status='pending'
 AND order_no IN (SELECT order_no FROM assessment_order_details);
