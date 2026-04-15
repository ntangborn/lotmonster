-- =============================================================================
-- 005_qbo_invoice_mapping.sql
--
-- QBO Invoice posting requires (a) a CustomerRef and (b) a SalesItem
-- ref on each line. To avoid forcing the user to create a QBO Item per
-- recipe, we use a single configurable default Item ("Sales" works
-- well) and put the recipe name in each line's Description.
--
-- qbo_income_account_id is here for future auto-Item creation.
-- =============================================================================

ALTER TABLE orgs
  ADD COLUMN IF NOT EXISTS qbo_default_item_id TEXT,
  ADD COLUMN IF NOT EXISTS qbo_income_account_id TEXT;
