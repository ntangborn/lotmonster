-- =============================================================================
-- Migration 002: Add CHECK constraint to enforce unit_cost > 0 on lots
--
-- The lots table already has unit_cost NUMERIC(12,6) NOT NULL.
-- This constraint prevents $0.00 and negative landed costs from being stored,
-- matching the zero-cost guard enforced in the application layer.
-- =============================================================================

ALTER TABLE lots
  ADD CONSTRAINT lots_unit_cost_positive CHECK (unit_cost > 0);
