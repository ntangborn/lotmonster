-- =============================================================================
-- 004_qbo_account_mapping.sql
--
-- QBO chart-of-accounts mappings (per-org) and synced-document IDs
-- on the local entities they represent.
--
-- Account refs are TEXT because QBO IDs are returned as strings.
-- Each org configures these once during onboarding (settings page TBD).
-- =============================================================================

ALTER TABLE orgs
  ADD COLUMN IF NOT EXISTS qbo_cogs_account_id TEXT,           -- e.g. "80" Cost of Goods Sold
  ADD COLUMN IF NOT EXISTS qbo_inventory_account_id TEXT,      -- e.g. "81" Raw Materials Inventory
  ADD COLUMN IF NOT EXISTS qbo_ar_account_id TEXT,             -- Accounts Receivable (invoices)
  ADD COLUMN IF NOT EXISTS qbo_ap_account_id TEXT;             -- Accounts Payable (bills)

ALTER TABLE production_runs
  ADD COLUMN IF NOT EXISTS qbo_journal_entry_id TEXT;

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS qbo_bill_id TEXT;
