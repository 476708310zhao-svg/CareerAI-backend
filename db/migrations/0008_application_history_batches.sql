-- Identify every history row produced by one bulk status operation so undo can
-- verify that the client supplied the complete batch before restoring anything.
-- Existing history remains unbatched.
-- @require-table application_history:id,application_id,user_id
ALTER TABLE application_history ADD COLUMN batch_id TEXT;
ALTER TABLE application_history ADD COLUMN batch_size INTEGER CHECK(batch_size IS NULL OR batch_size > 0);

CREATE INDEX IF NOT EXISTS idx_application_history_owner_batch
  ON application_history(user_id, batch_id, id);
