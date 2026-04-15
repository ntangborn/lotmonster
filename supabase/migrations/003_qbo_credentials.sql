-- =============================================================================
-- 003_qbo_credentials.sql
--
-- Adds columns to orgs for storing the QBO connection:
--   - qbo_refresh_token_encrypted: AES-256-GCM ciphertext of the refresh token
--     (encrypted at the app layer with QBO_TOKEN_ENCRYPTION_KEY env var)
--   - qbo_refresh_token_expires_at: from the x_refresh_token_expires_in field
--   - qbo_environment: 'sandbox' or 'production' (drives base URL)
--   - qbo_connected_at: timestamp of the most recent successful connect/refresh
--
-- realm_id is already on orgs as `qbo_realm_id` from migration 001.
-- =============================================================================

ALTER TABLE orgs
  ADD COLUMN IF NOT EXISTS qbo_refresh_token_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS qbo_refresh_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS qbo_environment TEXT
    CHECK (qbo_environment IS NULL OR qbo_environment IN ('sandbox', 'production')),
  ADD COLUMN IF NOT EXISTS qbo_connected_at TIMESTAMPTZ;
