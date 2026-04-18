import { InsufficientStockError, type LotAllocation } from '@/lib/fefo'

/**
 * Pure cost-math for completeRun.
 *
 * This module isolates the arithmetic side of the completeRun flow so
 * it's unit-testable without a live Supabase client. The caller
 * (src/lib/production/actions.ts) is responsible for fetching the run,
 * the SKUs, the BOM rows, and pre-resolving each packaging allocation
 * via previewAllocation. The results land here as ResolvedOutput[],
 * this function validates + computes, and returns a PlanCompleteRunResult
 * the caller uses to drive the DB writes.
 *
 * See docs/plans/2026-04-16-skus-and-finished-goods.md Q4 / Q8 / Q10.
 */

export class RunStateError extends Error {
  constructor(msg: string) {
    super(msg)
    this.name = 'RunStateError'
  }
}

export interface CompleteRunOutput {
  skuId: string
  quantity: number
  expiryDate?: string | null
  liquidPctOverride?: number | null
  overrideNote?: string | null
}

export interface SkuSpec {
  id: string
  name: string
  kind: string
  fill_quantity: number | null
  fill_unit?: string | null
  shelf_life_days?: number | null
  lot_prefix?: string | null
}

export interface ResolvedBom {
  ingredientId: string
  ingredientName: string
  quantityPerUnit: number
  allocation:
    | { ok: true; allocations: LotAllocation[] }
    | { ok: false; needed: number; available: number }
}

export interface ResolvedOutput {
  input: CompleteRunOutput
  sku: SkuSpec
  boms: ResolvedBom[]
}

export interface PlannedBom {
  ingredientId: string
  ingredientName: string
  allocations: LotAllocation[]
  lineCost: number
}

export interface PlannedOutput {
  input: CompleteRunOutput
  sku: SkuSpec
  defaultPct: number
  pct: number
  liquidCogs: number
  packagingCogs: number
  allocatedTotal: number
  unitCogs: number
  boms: PlannedBom[]
  overrideNote: string | null
}

export interface PlanCompleteRunInput {
  liquidTotal: number
  resolved: ResolvedOutput[]
  /** $0.01 by default; larger tolerances let accumulated float error slip. */
  invariantTolerance?: number
}

export interface PlanCompleteRunResult {
  planned: PlannedOutput[]
  packagingTotal: number
  totalCogs: number
}

/**
 * Invariant check: sum of per-output allocatedTotal must equal the run's
 * liquid + packaging total within the given tolerance. Exported so the
 * unit tests can exercise the throw path directly.
 */
export function assertCostInvariant(
  allocatedSum: number,
  totalCogs: number,
  tolerance = 0.01
): void {
  if (Math.abs(allocatedSum - totalCogs) > tolerance) {
    throw new RunStateError(
      `Cost invariant failed: sum(allocated_cogs_total) = ${allocatedSum.toFixed(
        4
      )} but run total_cogs = ${totalCogs.toFixed(
        4
      )} (delta > $${tolerance})`
    )
  }
}

export function planCompleteRun(
  input: PlanCompleteRunInput
): PlanCompleteRunResult {
  const { liquidTotal, resolved } = input
  const tolerance = input.invariantTolerance ?? 0.01

  if (resolved.length === 0) {
    throw new RunStateError('At least one output SKU is required')
  }

  // ── Per-output validation ───────────────────────────────────────────
  const seenSkuIds = new Set<string>()
  for (const r of resolved) {
    if (seenSkuIds.has(r.sku.id)) {
      throw new RunStateError(
        `Output SKU ${r.sku.id} appears more than once — one row per SKU per run`
      )
    }
    seenSkuIds.add(r.sku.id)

    if (!(Number(r.input.quantity) > 0)) {
      throw new RunStateError('Every output quantity must be > 0')
    }
    if (r.sku.kind !== 'unit') {
      throw new RunStateError(
        `SKU "${r.sku.name}" has kind "${r.sku.kind}" — phase 1 only supports unit SKUs as run outputs`
      )
    }
    if (r.sku.fill_quantity == null || Number(r.sku.fill_quantity) <= 0) {
      throw new RunStateError(
        `SKU "${r.sku.name}" has no fill_quantity declared — required for liquid-COGS allocation`
      )
    }
  }

  // ── Packaging shortage — fail fast before any math ─────────────────
  for (const r of resolved) {
    for (const bom of r.boms) {
      if (!bom.allocation.ok) {
        const err = new InsufficientStockError(
          bom.allocation.needed,
          bom.allocation.available
        )
        err.message = `Insufficient stock for packaging: SKU "${r.sku.name}" needs ${bom.allocation.needed} ${bom.ingredientName}, only ${bom.allocation.available} available`
        throw err
      }
    }
  }

  // ── Liquid split: volume-share default or per-output override ──────
  const weights = resolved.map(
    (r) => Number(r.sku.fill_quantity) * Number(r.input.quantity)
  )
  const weightSum = weights.reduce((a, b) => a + b, 0)
  if (weightSum <= 0) {
    throw new RunStateError(
      'Total volume weight is zero — at least one output must have fill_quantity * quantity > 0'
    )
  }
  const defaultPcts = weights.map((w) => w / weightSum)

  const overrides = resolved.map((r) => r.input.liquidPctOverride)
  const anyOverride = overrides.some((v) => v != null)
  const allOverride = overrides.every((v) => v != null)
  if (anyOverride && !allOverride) {
    throw new RunStateError(
      'liquidPctOverride must be provided for every output or none'
    )
  }

  let effectivePcts: number[]
  if (allOverride) {
    effectivePcts = overrides.map((v) => Number(v))
    const sum = effectivePcts.reduce((a, b) => a + b, 0)
    if (Math.abs(sum - 1) > 1e-6) {
      throw new RunStateError(
        `liquidPctOverride values must sum to 1.0 (got ${sum.toFixed(6)})`
      )
    }
  } else {
    effectivePcts = defaultPcts
  }

  // ── Per-output cost math ────────────────────────────────────────────
  const planned: PlannedOutput[] = resolved.map((r, i) => {
    const pct = effectivePcts[i]
    const defaultPct = defaultPcts[i]
    const liquidCogs = liquidTotal * pct

    const bomDetails: PlannedBom[] = r.boms.map((b) => {
      const allocations = b.allocation.ok ? b.allocation.allocations : []
      const lineCost = allocations.reduce(
        (s, a) => s + a.quantityUsed * a.unitCost,
        0
      )
      return {
        ingredientId: b.ingredientId,
        ingredientName: b.ingredientName,
        allocations,
        lineCost,
      }
    })
    const packagingCogs = bomDetails.reduce((s, b) => s + b.lineCost, 0)
    const allocatedTotal = liquidCogs + packagingCogs
    const unitCogs = allocatedTotal / Number(r.input.quantity)

    let overrideNote: string | null = null
    if (allOverride) {
      overrideNote =
        r.input.overrideNote?.trim() ||
        `default pct ${defaultPct.toFixed(6)} → override ${pct.toFixed(6)}`
    } else if (r.input.overrideNote?.trim()) {
      overrideNote = r.input.overrideNote.trim()
    }

    return {
      input: r.input,
      sku: r.sku,
      defaultPct,
      pct,
      liquidCogs,
      packagingCogs,
      allocatedTotal,
      unitCogs,
      boms: bomDetails,
      overrideNote,
    }
  })

  const packagingTotal = planned.reduce((s, p) => s + p.packagingCogs, 0)
  const totalCogs = liquidTotal + packagingTotal
  const allocatedSum = planned.reduce((s, p) => s + p.allocatedTotal, 0)
  assertCostInvariant(allocatedSum, totalCogs, tolerance)

  return { planned, packagingTotal, totalCogs }
}
