-- =============================================================================
-- 012_qbo_sync_log_retry.sql
--
-- Adds the canonical retry columns the Part 11 cron dispatcher will read +
-- write. Migration 001 already shipped `error_message`, but not
-- `attempt_count` or `last_attempted_at`. The original `retry_count` +
-- `synced_at` columns stay in place for backward compat; the dispatcher
-- will populate the new columns going forward and the UI/reports can
-- migrate to reading them in subsequent deploys.
--
-- All adds use IF NOT EXISTS so this migration is safe to re-run.
-- =============================================================================

ALTER TABLE public.qbo_sync_log
  ADD COLUMN IF NOT EXISTS attempt_count     int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_message     text;

-- NOTE: the old `qbo_sync_log_retry_idx` on (org_id, status, retry_count)
-- from migration 001 is intentionally left in place. The Part 11 cron
-- dispatcher will either (a) continue to read retry_count for ordering
-- while writing attempt_count, or (b) add a new partial index on
-- attempt_count / last_attempted_at when it's ready. Either way, that
-- decision lives with Part 11 — not here.
