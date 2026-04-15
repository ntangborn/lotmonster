import { describe, it, expect } from 'vitest'
import {
  computeRunCOGS,
  computeRecipeEstimatedCOGS,
  aggregateMonthlyCOGS,
  aggregateYTDCOGS,
  type ConsumedLot,
  type RecipeLineInput,
  type AvailableLot,
  type MonthlyRunSummary,
} from '@/lib/cogs'

function expectClose(actual: number, expected: number, tol = 1e-9) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol)
}

// ─── computeRunCOGS ──────────────────────────────────────────────────────────

describe('computeRunCOGS', () => {
  const consumed: ConsumedLot[] = [
    {
      ingredient_id: 'i1',
      ingredient_name: 'Cayenne',
      lot_id: 'L1',
      lot_number: 'CAY-001',
      quantity_used: 2,
      unit: 'oz',
      unit_cost_at_use: 0.5,
    },
    {
      ingredient_id: 'i1',
      ingredient_name: 'Cayenne',
      lot_id: 'L2',
      lot_number: 'CAY-002',
      quantity_used: 1,
      unit: 'oz',
      unit_cost_at_use: 0.6,
    },
    {
      ingredient_id: 'i2',
      ingredient_name: 'Vinegar',
      lot_id: 'L3',
      lot_number: 'VIN-001',
      quantity_used: 4,
      unit: 'fl_oz',
      unit_cost_at_use: 0.25,
    },
  ]

  it('multiplies each lot quantity by its snapshot unit cost', () => {
    const r = computeRunCOGS(consumed, 24)
    expect(r.lines).toHaveLength(3)
    expectClose(r.lines[0].line_cost, 1.0)
    expectClose(r.lines[1].line_cost, 0.6)
    expectClose(r.lines[2].line_cost, 1.0)
  })

  it('sums total COGS across all consumed lots', () => {
    const r = computeRunCOGS(consumed, 24)
    expectClose(r.total_cogs, 2.6)
  })

  it('divides total by actual yield for cogs_per_unit', () => {
    const r = computeRunCOGS(consumed, 13)
    expectClose(r.cogs_per_unit!, 2.6 / 13)
  })

  it('returns null cogs_per_unit when actual yield is null', () => {
    const r = computeRunCOGS(consumed, null)
    expect(r.cogs_per_unit).toBeNull()
  })

  it('returns null cogs_per_unit when actual yield is 0', () => {
    const r = computeRunCOGS(consumed, 0)
    expect(r.cogs_per_unit).toBeNull()
  })

  it('handles empty consumption', () => {
    const r = computeRunCOGS([], 10)
    expect(r.total_cogs).toBe(0)
    expect(r.lines).toEqual([])
    expectClose(r.cogs_per_unit!, 0)
  })

  it('uses the snapshot unit_cost_at_use, not any current lot price', () => {
    // The whole point: completed runs should not change cost when lot
    // prices change later. The snapshot is the source of truth.
    const r = computeRunCOGS(
      [
        {
          ingredient_id: 'i1',
          ingredient_name: 'X',
          lot_id: 'L1',
          lot_number: '1',
          quantity_used: 10,
          unit: 'oz',
          unit_cost_at_use: 1.23,
        },
      ],
      10
    )
    expectClose(r.total_cogs, 12.3)
    expectClose(r.cogs_per_unit!, 1.23)
  })
})

// ─── computeRecipeEstimatedCOGS ──────────────────────────────────────────────

describe('computeRecipeEstimatedCOGS', () => {
  const lines: RecipeLineInput[] = [
    {
      ingredient_id: 'i1',
      ingredient_name: 'Cayenne',
      quantity: 2,
      unit: 'oz',
    },
    {
      ingredient_id: 'i2',
      ingredient_name: 'Vinegar',
      quantity: 4,
      unit: 'fl_oz',
    },
  ]

  it('uses weighted average across available lots', () => {
    // i1: 10 @ $0.50, 5 @ $0.80 → weighted avg = (5+4)/15 = 0.60
    // i2: 20 @ $0.25 → 0.25
    const lots: AvailableLot[] = [
      { ingredient_id: 'i1', quantity_remaining: 10, unit_cost: 0.5 },
      { ingredient_id: 'i1', quantity_remaining: 5, unit_cost: 0.8 },
      { ingredient_id: 'i2', quantity_remaining: 20, unit_cost: 0.25 },
    ]
    const r = computeRecipeEstimatedCOGS(lines, lots, 24)
    expectClose(r.lines[0].avg_unit_cost!, 0.6)
    expectClose(r.lines[1].avg_unit_cost!, 0.25)
    expectClose(r.lines[0].line_cost!, 1.2)
    expectClose(r.lines[1].line_cost!, 1.0)
    expectClose(r.estimated_cogs, 2.2)
    expectClose(r.cogs_per_unit!, 2.2 / 24)
    expect(r.cost_known).toBe(true)
    expect(r.warnings).toEqual([])
  })

  it('warns and marks partial when an ingredient has no lots', () => {
    const lots: AvailableLot[] = [
      { ingredient_id: 'i1', quantity_remaining: 10, unit_cost: 0.5 },
      // i2 missing
    ]
    const r = computeRecipeEstimatedCOGS(lines, lots, 24)
    expect(r.lines[1].avg_unit_cost).toBeNull()
    expect(r.lines[1].line_cost).toBeNull()
    expect(r.cost_known).toBe(false)
    expect(r.cogs_per_unit).toBeNull()
    expect(r.warnings).toContain('Vinegar: no available lots — cost unknown')
    // Known portion is still summed (so the UI can show "partial: $1.00")
    expectClose(r.estimated_cogs, 1.0)
  })

  it('ignores lots with zero/negative remaining', () => {
    const lots: AvailableLot[] = [
      { ingredient_id: 'i1', quantity_remaining: 0, unit_cost: 99 },
      { ingredient_id: 'i1', quantity_remaining: 5, unit_cost: 1 },
      { ingredient_id: 'i2', quantity_remaining: 5, unit_cost: 1 },
    ]
    const r = computeRecipeEstimatedCOGS(lines, lots, 1)
    expectClose(r.lines[0].avg_unit_cost!, 1)
    expect(r.cost_known).toBe(true)
  })

  it('returns null cogs_per_unit when target yield is 0', () => {
    const lots: AvailableLot[] = [
      { ingredient_id: 'i1', quantity_remaining: 10, unit_cost: 1 },
      { ingredient_id: 'i2', quantity_remaining: 10, unit_cost: 1 },
    ]
    const r = computeRecipeEstimatedCOGS(lines, lots, 0)
    expect(r.cogs_per_unit).toBeNull()
  })

  it('handles empty recipe', () => {
    const r = computeRecipeEstimatedCOGS([], [], 10)
    expect(r.estimated_cogs).toBe(0)
    expect(r.lines).toEqual([])
    // empty recipe is "known" — nothing unknown to flag
    expect(r.cost_known).toBe(true)
  })
})

// ─── aggregateMonthlyCOGS ────────────────────────────────────────────────────

describe('aggregateMonthlyCOGS', () => {
  const runs: MonthlyRunSummary[] = [
    {
      run_id: 'r1',
      run_number: 'PR-2026-001',
      recipe_name: 'Hot Sauce',
      total_cogs: 25.5,
      completed_at: '2026-04-05T10:00:00Z',
    },
    {
      run_id: 'r2',
      run_number: 'PR-2026-002',
      recipe_name: 'Bbq Sauce',
      total_cogs: 40,
      completed_at: '2026-04-12T10:00:00Z',
    },
  ]

  it('sums total COGS for the month', () => {
    const r = aggregateMonthlyCOGS(runs, 2026, 4)
    expectClose(r.total_cogs, 65.5)
    expect(r.run_count).toBe(2)
  })

  it('preserves the breakdown', () => {
    const r = aggregateMonthlyCOGS(runs, 2026, 4)
    expect(r.breakdown).toEqual(runs)
  })

  it('handles empty input', () => {
    const r = aggregateMonthlyCOGS([], 2026, 4)
    expect(r.total_cogs).toBe(0)
    expect(r.run_count).toBe(0)
    expect(r.breakdown).toEqual([])
  })
})

// ─── aggregateYTDCOGS ────────────────────────────────────────────────────────

describe('aggregateYTDCOGS', () => {
  it('buckets runs into 12 months by completed_at', () => {
    const runs = [
      { total_cogs: 100, completed_at: '2026-01-15T00:00:00Z' },
      { total_cogs: 200, completed_at: '2026-01-20T00:00:00Z' },
      { total_cogs: 50, completed_at: '2026-04-10T00:00:00Z' },
      { total_cogs: 25, completed_at: '2026-12-31T23:59:00Z' },
    ]
    const r = aggregateYTDCOGS(runs, 2026)
    expect(r.year).toBe(2026)
    expect(r.run_count).toBe(4)
    expectClose(r.total_cogs, 375)
    expect(r.monthly).toHaveLength(12)
    expectClose(r.monthly[0].total_cogs, 300)
    expect(r.monthly[0].run_count).toBe(2)
    expectClose(r.monthly[3].total_cogs, 50)
    expect(r.monthly[3].run_count).toBe(1)
    expectClose(r.monthly[11].total_cogs, 25)
    expect(r.monthly[11].run_count).toBe(1)
  })

  it('excludes runs from other years', () => {
    const runs = [
      { total_cogs: 100, completed_at: '2025-12-31T00:00:00Z' },
      { total_cogs: 200, completed_at: '2026-01-01T00:00:00Z' },
      { total_cogs: 300, completed_at: '2027-01-01T00:00:00Z' },
    ]
    const r = aggregateYTDCOGS(runs, 2026)
    expectClose(r.total_cogs, 200)
    expect(r.run_count).toBe(1)
  })

  it('skips invalid dates', () => {
    const runs = [
      { total_cogs: 100, completed_at: 'not-a-date' },
      { total_cogs: 200, completed_at: '2026-06-01T00:00:00Z' },
    ]
    const r = aggregateYTDCOGS(runs, 2026)
    expectClose(r.total_cogs, 200)
    expect(r.run_count).toBe(1)
  })

  it('returns 12 zero buckets when no runs', () => {
    const r = aggregateYTDCOGS([], 2026)
    expect(r.monthly).toHaveLength(12)
    expect(r.monthly.every((m) => m.total_cogs === 0 && m.run_count === 0))
      .toBe(true)
    expect(r.total_cogs).toBe(0)
  })
})
