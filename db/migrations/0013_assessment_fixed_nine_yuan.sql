-- Catalogue price is now fixed at nine yuan. Never rewrite paid snapshots or money ledgers.
-- @require-table orders:status,amount
UPDATE assessment_products SET price_cents=900, updated_at=datetime('now') WHERE price_cents<>900;
UPDATE orders SET status='cancelled'
WHERE status='pending' AND amount<>900
  AND order_no IN (SELECT order_no FROM assessment_order_details);
