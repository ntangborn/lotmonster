import { describe, it, expect } from 'vitest'
import {
  skuCreateSchema,
  skuUpdateSchema,
  bomEntrySchema,
  bomSchema,
  buildLotPrefix,
  SKU_KINDS,
} from '@/lib/skus/schema'

const UUID = '550e8400-e29b-41d4-a716-446655440000'
const UUID_2 = '550e8400-e29b-41d4-a716-446655440001'

// ─── buildLotPrefix ──────────────────────────────────────────────────────────

describe('buildLotPrefix', () => {
  it('strips non-word chars, uppercases, takes first 6', () => {
    expect(buildLotPrefix('Jalapeño Hot Sauce')).toBe('JALAPE')
    expect(buildLotPrefix('16oz Bottle')).toBe('16OZBO')
    expect(buildLotPrefix("Shep's Sauce!")).toBe('SHEPSS')
  })

  it('returns null for names with no word characters', () => {
    expect(buildLotPrefix('')).toBeNull()
    expect(buildLotPrefix('!!!')).toBeNull()
    expect(buildLotPrefix('   ')).toBeNull()
  })

  it('handles names shorter than 6 chars', () => {
    expect(buildLotPrefix('ABC')).toBe('ABC')
    expect(buildLotPrefix('A-B')).toBe('AB')
  })
})

// ─── skuCreateSchema ─────────────────────────────────────────────────────────

describe('skuCreateSchema', () => {
  it('accepts a minimal unit SKU', () => {
    const r = skuCreateSchema.safeParse({ name: 'Hot Sauce 16oz', kind: 'unit' })
    expect(r.success).toBe(true)
  })

  it('requires name', () => {
    const r = skuCreateSchema.safeParse({ name: '', kind: 'unit' })
    expect(r.success).toBe(false)
  })

  it('enforces kind enum', () => {
    const r = skuCreateSchema.safeParse({ name: 'X', kind: 'gallon' })
    expect(r.success).toBe(false)
  })

  it('rejects case SKUs that have no parent', () => {
    const r = skuCreateSchema.safeParse({ name: '12-pack', kind: 'case' })
    expect(r.success).toBe(false)
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('parent_sku_id')
    }
  })

  it('accepts case SKUs with parent + units_per_parent paired', () => {
    const r = skuCreateSchema.safeParse({
      name: '12-pack',
      kind: 'case',
      parent_sku_id: UUID,
      units_per_parent: 12,
    })
    expect(r.success).toBe(true)
  })

  it('rejects parent without units_per_parent', () => {
    const r = skuCreateSchema.safeParse({
      name: '12-pack',
      kind: 'case',
      parent_sku_id: UUID,
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('units_per_parent')
    }
  })

  it('rejects units_per_parent without parent', () => {
    const r = skuCreateSchema.safeParse({
      name: '12-pack',
      kind: 'unit',
      units_per_parent: 12,
    })
    expect(r.success).toBe(false)
  })

  it('rejects negative units_per_parent', () => {
    const r = skuCreateSchema.safeParse({
      name: '12-pack',
      kind: 'case',
      parent_sku_id: UUID,
      units_per_parent: -1,
    })
    expect(r.success).toBe(false)
  })

  it('covers all declared SKU kinds', () => {
    for (const kind of SKU_KINDS) {
      const input =
        kind === 'unit'
          ? { name: 'X', kind }
          : { name: 'X', kind, parent_sku_id: UUID, units_per_parent: 12 }
      expect(skuCreateSchema.safeParse(input).success).toBe(true)
    }
  })
})

// ─── skuUpdateSchema ─────────────────────────────────────────────────────────

describe('skuUpdateSchema', () => {
  it('accepts an empty patch', () => {
    expect(skuUpdateSchema.safeParse({}).success).toBe(true)
  })

  it('accepts a name-only patch', () => {
    expect(skuUpdateSchema.safeParse({ name: 'New name' }).success).toBe(true)
  })

  it('does NOT enforce the parent/units refine on partial updates', () => {
    // Intentional: partial update shouldn't block a simple kind change.
    // Transition validation happens elsewhere if ever added.
    expect(skuUpdateSchema.safeParse({ kind: 'case' }).success).toBe(true)
  })
})

// ─── bomEntrySchema / bomSchema ──────────────────────────────────────────────

describe('bomEntrySchema', () => {
  it('accepts a minimal entry', () => {
    const r = bomEntrySchema.safeParse({
      ingredient_id: UUID,
      quantity: 1,
    })
    expect(r.success).toBe(true)
  })

  it('requires positive quantity', () => {
    expect(
      bomEntrySchema.safeParse({ ingredient_id: UUID, quantity: 0 }).success
    ).toBe(false)
    expect(
      bomEntrySchema.safeParse({ ingredient_id: UUID, quantity: -1 }).success
    ).toBe(false)
  })

  it('rejects non-UUID ingredient_id', () => {
    expect(
      bomEntrySchema.safeParse({ ingredient_id: 'not-a-uuid', quantity: 1 })
        .success
    ).toBe(false)
  })
})

describe('bomSchema', () => {
  it('accepts an empty array (BOM clear)', () => {
    expect(bomSchema.safeParse([]).success).toBe(true)
  })

  it('accepts multiple valid entries', () => {
    const r = bomSchema.safeParse([
      { ingredient_id: UUID, quantity: 1 },
      { ingredient_id: UUID_2, quantity: 2, unit: 'each' },
    ])
    expect(r.success).toBe(true)
  })

  it('rejects when any entry is invalid', () => {
    const r = bomSchema.safeParse([
      { ingredient_id: UUID, quantity: 1 },
      { ingredient_id: UUID_2, quantity: -5 },
    ])
    expect(r.success).toBe(false)
  })
})
