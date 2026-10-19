-- Stable private-source ownership; deliberately absent from public product projections.
-- Baseline tables are created by earlier versioned migrations, not at startup here.
CREATE TABLE assessment_import_sources (
 source_namespace TEXT NOT NULL,
 source_record_id TEXT NOT NULL,
 product_id INTEGER NOT NULL UNIQUE REFERENCES assessment_products(id),
 source_fingerprint TEXT NOT NULL,
 managed_fingerprint TEXT NOT NULL,
 content_needs_review INTEGER NOT NULL DEFAULT 1 CHECK(content_needs_review IN (0,1)),
 imported_by TEXT NOT NULL,
 imported_at TEXT NOT NULL DEFAULT (datetime('now')),
 PRIMARY KEY(source_namespace,source_record_id)
);
