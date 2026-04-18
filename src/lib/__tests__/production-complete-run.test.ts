import { describe, it, expect } from 'vitest'
import {
  planCompleteRun,
  assertCostInvariant,
  RunStateError,
  type ResolvedOutput,
  type SkuSpec,
} from '@/lib/production/complete-run-math'
import { InsufficientStockError, type LotAllocation } from '@/lib/fefo'

function expectClose(actual: number, expected: number, tol = 1e-6) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol)
}

// ─── Shared fixture ─────────────────────────────────────────────────────
//
// 10-gal batch of hot sauce, liquid_total = $120.
// Two output SKUs:
//   16oz  — fill_quantity = 16
//   32oz  — fill_quantity = 32
// Packaging BOMs per unit:
//   16oz: bottle $0.30 + cap $0.05 + label $0.05 = $0.40 / bottle
//   32oz: bottle $0.45 + cap $0.05 + label $0.05 = $0.55 / bottle
// Outputs: 40 × 16oz + 20 × 32oz
//   volume weights: 16*40 = 640, 32*20 = 640 → liquid splits 50 / 50
//   liquid_cogs      = $60 / $60
//   packaging_cogs   = $16 / $11   (0.40*40 / 0.55*20)
//   allocated_total  = $76 / $71
//   unit_cogs        = $1.90 / $3.55
// ────────────────────────────────────────────────────────────────────────

const SKU_16: SkuSpec = {
  id: 'sku-16',
  name: '16oz Hot Sauce',
  kind: 'unit',
  fill_quantity: 16,
  fill_unit: 'fl_oz',
  shelf_life_days: 365,
  lot_prefix: 'HS16',
}
const SKU_32: SkuSpec = {
  id: 'sku-32',
  name: '32oz Hot Sauce',
  kind: 'unit',
  fill_quantity: 32,
  fill_unit: 'fl_oz',
  shelf_life_days: 365,
  lot_prefix: 'HS32',
}

function oneLot(
  lotId: string,
  qty: number,
  unitCost: number
): LotAllocation[] {
  return [
    {
      lotId,
      lotNumber: `${lotId}-LN`,
      quantityUsed: qty,
      unitCost,
      expiryDate: null,
    },
  ]
}

function baseResolved(): ResolvedOutput[] {
  return [
    {
      input: { skuId: 'sku-16', quantity: 40 },
      sku: SKU_16,
      boms: [
        {
          ingredientId: 'bot16',
          ingredientName: '16oz bottle',
          quantityPerUnit: 1,
          allocation: { ok: true, allocations: oneLot('L-B16', 40, 0.3) },
        },
        {
          ingredientId: 'cap',
          ingredientName: 'cap',
          quantityPerUnit: 1,
          allocation: { ok: true, allocations: oneLot('L-CAP', 40, 0.05) },
        },
        {
          ingredientId: 'lbl16',
          ingredientName: '16oz label',
          quantityPerUnit: 1,
          allocation: { ok: true, allocations: oneLot('L-L16', 40, 0.05) },
        },
      ],
    },
    {
      input: { skuId: 'sku-32', quantity: 20 },
      sku: SKU_32,
      boms: [
        {
          ingredientId: 'bot32',
          ingredientName: '32oz bottle',
          quantityPerUnit: 1,
          allocation: { ok: true, allocations: oneLot('L-B32', 20, 0.45) },
        },
        {
          ingredientId: 'cap',
          ingredientName: 'cap',
          quantityPerUnit: 1,
          allocation: { ok: true, allocations: oneLot('L-CAP2', 20, 0.05) },
        },
        {
          ingredientId: 'lbl32',
          ingredientName: '32oz label',
          quantityPerUnit: 1,
          allocation: { ok: true, allocations: oneLot('L-L32', 20, 0.05) },
        },
      ],
    },
  ]
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe('planCompleteRun — happy path', () => {
  const result = planCompleteRun({
    liquidTotal: 120,
    resolved: baseResolved(),
  })

  it('splits liquid 50/50 by volume share', () => {
    expectClose(result.planned[0].pct, 0.5)
    expectClose(result.planned[1].pct, 0.5)
    expectClose(result.planned[0].liquidCogs, 60)
    expectClose(result.planned[1].liquidCogs, 60)
  })

  it('computes per-SKU packaging COGS from allocated lots', () => {
    expectClose(result.planned[0].packagingCogs, 16)
    expectClose(result.planned[1].packagingCogs, 11)
  })

  it('computes unit_cogs ≈ $1.90 for 16oz and $3.55 for 32oz', () => {
    expectClose(result.planned[0].unitCogs, 1.9)
    expectClose(result.planned[1].unitCogs, 3.55)
  })

  it('invariant holds — sum(allocated_cogs_total) = totalCogs', () => {
    const sum = result.planned.reduce((s, p) => s + p.allocatedTotal, 0)
    expectClose(sum, result.totalCogs)
    expectClose(result.totalCogs, 147) // 120 liquid + 27 packaging
    expectClose(result.packagingTotal, 27)
  })
})

describe('planCompleteRun — packaging shortfall', () => {
  it('throws InsufficientStockError naming the SKU and component', () => {
    const resolved = baseResolved()
    // 16oz bottle: need 40, only 35 available.
    resolved[0].boms[0].allocation = {
      ok: false,
      needed: 40,
      available: 35,
    }

    let caught: unknown
    try {
      planCompleteRun({ liquidTotal: 120, resolved })
    } catch (e) {
      caught = e
    }

    expect(caught).toBeInstanceOf(InsufficientStockError)
    const err = caught as InsufficientStockError
    expect(err.message).toContain('16oz Hot Sauce') // SKU name
    expect(err.message).toContain('16oz bottle') // component name
    expect(err.needed).toBe(40)
    expect(err.available).toBe(35)
  })
})

describe('planCompleteRun — invariant failure', () => {
  it('assertCostInvariant throws when allocated sum diverges beyond tolerance', () => {
    // allocated = 146.50, totalCogs = 147.00 → delta 0.50 > 0.01 tolerance
    expect(() => assertCostInvariant(146.5, 147, 0.01)).toThrowError(
      RunStateError
    )
    expect(() => assertCostInvariant(146.5, 147, 0.01)).toThrowError(
      /Cost invariant failed/
    )
  })

  it('assertCostInvariant passes within tolerance (float drift safety)', () => {
    // 0.1 + 0.2 = 0.30000000000000004 — classic float nit; well under $0.01
    expect(() => assertCostInvariant(0.1 + 0.2, 0.3, 0.01)).not.toThrow()
  })
})

describe('planCompleteRun — operator liquid-pct override', () => {
  it('honors override values when all outputs specify one', () => {
    const resolved = baseResolved()
    resolved[0].input.liquidPctOverride = 0.4
    resolved[1].input.liquidPctOverride = 0.6

    const result = planCompleteRun({ liquidTotal: 120, resolved })

    // liquid_cogs: $120 * 0.4 = $48 / $120 * 0.6 = $72
    expectClose(result.planned[0].liquidCogs, 48)
    expectClose(result.planned[1].liquidCogs, 72)
    // packaging unchanged
    expectClose(result.planned[0].packagingCogs, 16)
    expectClose(result.planned[1].packagingCogs, 11)
    // unit_cogs: (48+16)/40 = $1.60, (72+11)/20 = $4.15
    expectClose(result.planned[0].unitCogs, 1.6)
    expectClose(result.planned[1].unitCogs, 4.15)
    // override_note auto-populated (default → override) when no note provided
    expect(result.planned[0].overrideNote).toMatch(/override/)
    expect(result.planned[1].overrideNote).toMatch(/override/)
  })

  it('throws if override is partial (some set, some not)', () => {
    const resolved = baseResolved()
    resolved[0].input.liquidPctOverride = 0.4 // only one override
    expect(() =>
      planCompleteRun({ liquidTotal: 120, resolved })
    ).toThrowError(/every output or none/)
  })

  it('throws if overrides do not sum to 1', () => {
    const resolved = baseResolved()
    resolved[0].input.liquidPctOverride = 0.4
    resolved[1].input.liquidPctOverride = 0.5 // sums to 0.9
    expect(() =>
      planCompleteRun({ liquidTotal: 120, resolved })
    ).toThrowError(/sum to 1/)
  })
})
