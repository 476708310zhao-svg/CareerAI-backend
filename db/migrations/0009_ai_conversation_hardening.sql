-- Preserve the request identity and application context used to produce each
-- AI response. Existing turns remain valid with explicit empty snapshots.
ALTER TABLE ai_conversation_turns
  ADD COLUMN request_fingerprint TEXT NOT NULL DEFAULT '';

ALTER TABLE ai_conversation_turns
  ADD COLUMN context_snapshot TEXT NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_ai_conversations_owner_application
  ON ai_conversations(user_id, application_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_ai_turns_conversation_status
  ON ai_conversation_turns(conversation_id, status, id DESC);
