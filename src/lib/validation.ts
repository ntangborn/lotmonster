// ── Cost validation ───────────────────────────────────────────────────────────

export interface CostValidationResult {
  /** True if the value is acceptable (including empty/null, which is optional). */
  valid: boolean
  /** Present when valid is false — a user-facing error message. */
  error?: string
  /**
   * True when the value is empty/null/undefined. The cost is optional at
   * ingredient creation time, but COGS tracking will be unavailable until a
   * cost is added. Callers can show a non-blocking warning in this case.
   */
  warn?: boolean
}

/**
 * Validates a unit cost value for an ingredient or lot.
 *
 * Rules:
 *  - null / undefined / '' → valid, warn: true (cost is optional but missing)
 *  - 0                     → invalid ("Unit cost cannot be $0.00")
 *  - < 0                   → invalid ("Unit cost cannot be negative")
 *  - > 0                   → valid
 */
export function validateIngredientCost(
  unitCost: number | string | null | undefined
): CostValidationResult {
  // Empty / absent — valid but caller should warn
  if (unitCost === null || unitCost === undefined || unitCost === '') {
    return { valid: true, warn: true }
  }

  const n = typeof unitCost === 'string' ? Number(unitCost) : unitCost

  // Non-numeric strings (e.g. "abc")
  if (isNaN(n)) {
    return { valid: true, warn: true }
  }

  if (n === 0) {
    return { valid: false, error: 'Unit cost cannot be $0.00' }
  }

  if (n < 0) {
    return { valid: false, error: 'Unit cost cannot be negative' }
  }

  return { valid: true }
}

/**
 * Zod-compatible refine predicate — returns true for valid or warn (empty) values.
 * Pass as the first argument to `.refine()`.
 */
export function costRefine(v: string): boolean {
  return validateIngredientCost(v).valid
}

/**
 * Returns the user-facing error message for a given cost string.
 * Returns undefined when the value is valid or empty.
 */
export function costRefineMessage(v: string): string | undefined {
  const result = validateIngredientCost(v)
  return result.valid ? undefined : result.error
}
