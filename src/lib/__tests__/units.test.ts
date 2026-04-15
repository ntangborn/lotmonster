import { describe, it, expect } from 'vitest'
import {
  canConvert,
  convert,
  getConversionFactor,
  formatConversion,
  getUnitCategory,
  getCompatibleUnits,
  type Unit,
} from '@/lib/units'

// ── Precision helper ──────────────────────────────────────────────────────────
// Allow floating-point results within 0.001% of expected value.
function expectClose(actual: number, expected: number, tolerancePct = 0.001) {
  const diff = Math.abs(actual - expected)
  const tol = Math.abs(expected) * (tolerancePct / 100)
  expect(diff).toBeLessThanOrEqual(tol === 0 ? 1e-12 : tol)
}

// ── getUnitCategory ───────────────────────────────────────────────────────────

describe('getUnitCategory', () => {
  it('classifies weight units', () => {
    expect(getUnitCategory('oz')).toBe('weight')
    expect(getUnitCategory('lb')).toBe('weight')
    expect(getUnitCategory('g')).toBe('weight')
    expect(getUnitCategory('kg')).toBe('weight')
  })

  it('classifies volume units', () => {
    expect(getUnitCategory('fl_oz')).toBe('volume')
    expect(getUnitCategory('gal')).toBe('volume')
    expect(getUnitCategory('ml')).toBe('volume')
    expect(getUnitCategory('l')).toBe('volume')
  })

  it('classifies each', () => {
    expect(getUnitCategory('each')).toBe('each')
  })
})

// ── canConvert ────────────────────────────────────────────────────────────────

describe('canConvert', () => {
  it('same unit always returns true', () => {
    const units: Unit[] = ['oz', 'lb', 'g', 'kg', 'fl_oz', 'gal', 'ml', 'l', 'each']
    for (const u of units) {
      expect(canConvert(u, u)).toBe(true)
    }
  })

  // Weight pairs
  it('allows all weight pairs', () => {
    const weights: Unit[] = ['oz', 'lb', 'g', 'kg']
    for (const a of weights) {
      for (const b of weights) {
        expect(canConvert(a, b)).toBe(true)
      }
    }
  })

  // Volume pairs
  it('allows all volume pairs', () => {
    const volumes: Unit[] = ['fl_oz', 'gal', 'ml', 'l']
    for (const a of volumes) {
      for (const b of volumes) {
        expect(canConvert(a, b)).toBe(true)
      }
    }
  })

  // Weight <-> Volume must fail
  it('rejects weight to volume', () => {
    const weights: Unit[] = ['oz', 'lb', 'g', 'kg']
    const volumes: Unit[] = ['fl_oz', 'gal', 'ml', 'l']
    for (const w of weights) {
      for (const v of volumes) {
        expect(canConvert(w, v)).toBe(false)
        expect(canConvert(v, w)).toBe(false)
      }
    }
  })

  // each cannot convert to anything except itself
  it('rejects each to any other unit', () => {
    const others: Unit[] = ['oz', 'lb', 'g', 'kg', 'fl_oz', 'gal', 'ml', 'l']
    for (const u of others) {
      expect(canConvert('each', u)).toBe(false)
      expect(canConvert(u, 'each')).toBe(false)
    }
  })
})

// ── getConversionFactor ───────────────────────────────────────────────────────

describe('getConversionFactor', () => {
  it('returns 1 for same unit', () => {
    expect(getConversionFactor('oz', 'oz')).toBe(1)
    expect(getConversionFactor('gal', 'gal')).toBe(1)
    expect(getConversionFactor('each', 'each')).toBe(1)
  })

  it('returns null for incompatible units', () => {
    expect(getConversionFactor('oz', 'fl_oz')).toBeNull()
    expect(getConversionFactor('kg', 'l')).toBeNull()
    expect(getConversionFactor('each', 'oz')).toBeNull()
    expect(getConversionFactor('lb', 'each')).toBeNull()
  })

  // Spot-check known factors
  it('lb → oz = 16', () => {
    expect(getConversionFactor('lb', 'oz')).toBe(16)
  })

  it('oz → lb = 1/16', () => {
    expectClose(getConversionFactor('oz', 'lb')!, 1 / 16)
  })

  it('kg → g = 1000', () => {
    expect(getConversionFactor('kg', 'g')).toBe(1000)
  })

  it('g → kg = 0.001', () => {
    expectClose(getConversionFactor('g', 'kg')!, 0.001)
  })

  it('lb → kg = 0.453592', () => {
    expectClose(getConversionFactor('lb', 'kg')!, 0.453592)
  })

  it('oz → g = 28.3495', () => {
    expectClose(getConversionFactor('oz', 'g')!, 28.3495)
  })

  it('gal → fl_oz = 128', () => {
    expect(getConversionFactor('gal', 'fl_oz')).toBe(128)
  })

  it('fl_oz → gal = 1/128', () => {
    expectClose(getConversionFactor('fl_oz', 'gal')!, 1 / 128)
  })

  it('l → ml = 1000', () => {
    expect(getConversionFactor('l', 'ml')).toBe(1000)
  })

  it('gal → l = 3.78541', () => {
    expectClose(getConversionFactor('gal', 'l')!, 3.78541)
  })
})

// ── convert ───────────────────────────────────────────────────────────────────

describe('convert', () => {
  it('same unit returns value unchanged', () => {
    expect(convert(5, 'lb', 'lb')).toBe(5)
    expect(convert(0, 'ml', 'ml')).toBe(0)
  })

  // Weight conversions
  it('converts lb → oz correctly', () => {
    expect(convert(1, 'lb', 'oz')).toBe(16)
    expect(convert(2.5, 'lb', 'oz')).toBe(40)
  })

  it('converts oz → lb correctly', () => {
    expectClose(convert(16, 'oz', 'lb'), 1)
    expectClose(convert(8, 'oz', 'lb'), 0.5)
  })

  it('converts kg → g correctly', () => {
    expect(convert(1, 'kg', 'g')).toBe(1000)
    expect(convert(0.5, 'kg', 'g')).toBe(500)
  })

  it('converts g → kg correctly', () => {
    expectClose(convert(1000, 'g', 'kg'), 1)
    expectClose(convert(250, 'g', 'kg'), 0.25)
  })

  it('converts lb → kg correctly', () => {
    expectClose(convert(1, 'lb', 'kg'), 0.453592)
    expectClose(convert(10, 'lb', 'kg'), 4.53592)
  })

  it('converts kg → lb correctly', () => {
    expectClose(convert(1, 'kg', 'lb'), 1 / 0.453592)
    expectClose(convert(0.453592, 'kg', 'lb'), 1)
  })

  it('converts oz → g correctly', () => {
    expectClose(convert(1, 'oz', 'g'), 28.3495)
    expectClose(convert(4, 'oz', 'g'), 113.398)
  })

  it('converts g → oz correctly', () => {
    expectClose(convert(28.3495, 'g', 'oz'), 1)
    expectClose(convert(100, 'g', 'oz'), 100 / 28.3495)
  })

  it('converts lb → g correctly', () => {
    expectClose(convert(1, 'lb', 'g'), 453.592)
    expectClose(convert(2, 'lb', 'g'), 907.184)
  })

  it('converts oz → kg correctly', () => {
    expectClose(convert(1, 'oz', 'kg'), 0.0283495)
    expectClose(convert(100, 'oz', 'kg'), 2.83495)
  })

  // Volume conversions
  it('converts gal → fl_oz correctly', () => {
    expect(convert(1, 'gal', 'fl_oz')).toBe(128)
    expect(convert(2, 'gal', 'fl_oz')).toBe(256)
  })

  it('converts fl_oz → gal correctly', () => {
    expectClose(convert(128, 'fl_oz', 'gal'), 1)
    expectClose(convert(64, 'fl_oz', 'gal'), 0.5)
  })

  it('converts l → ml correctly', () => {
    expect(convert(1, 'l', 'ml')).toBe(1000)
    expect(convert(0.25, 'l', 'ml')).toBe(250)
  })

  it('converts ml → l correctly', () => {
    expectClose(convert(1000, 'ml', 'l'), 1)
    expectClose(convert(500, 'ml', 'l'), 0.5)
  })

  it('converts gal → l correctly', () => {
    expectClose(convert(1, 'gal', 'l'), 3.78541)
    expectClose(convert(2, 'gal', 'l'), 7.57082)
  })

  it('converts l → gal correctly', () => {
    expectClose(convert(3.78541, 'l', 'gal'), 1)
    expectClose(convert(1, 'l', 'gal'), 1 / 3.78541)
  })

  it('converts gal → ml correctly', () => {
    expectClose(convert(1, 'gal', 'ml'), 3785.41)
  })

  it('converts fl_oz → ml correctly', () => {
    expectClose(convert(1, 'fl_oz', 'ml'), 29.5735)
    expectClose(convert(8, 'fl_oz', 'ml'), 236.588)
  })

  it('converts ml → fl_oz correctly', () => {
    expectClose(convert(29.5735, 'ml', 'fl_oz'), 1)
  })

  it('converts fl_oz → l correctly', () => {
    expectClose(convert(1, 'fl_oz', 'l'), 0.0295735)
    expectClose(convert(33.814, 'fl_oz', 'l'), 1, 0.01)
  })

  // Error cases
  it('throws on weight → volume', () => {
    expect(() => convert(1, 'oz', 'fl_oz')).toThrow()
    expect(() => convert(1, 'lb', 'l')).toThrow()
    expect(() => convert(1, 'kg', 'gal')).toThrow()
    expect(() => convert(1, 'g', 'ml')).toThrow()
  })

  it('throws on volume → weight', () => {
    expect(() => convert(1, 'fl_oz', 'oz')).toThrow()
    expect(() => convert(1, 'l', 'kg')).toThrow()
    expect(() => convert(1, 'gal', 'lb')).toThrow()
    expect(() => convert(1, 'ml', 'g')).toThrow()
  })

  it('throws on each → any other unit', () => {
    expect(() => convert(1, 'each', 'oz')).toThrow()
    expect(() => convert(1, 'each', 'ml')).toThrow()
    expect(() => convert(1, 'lb', 'each')).toThrow()
  })

  it('error message includes both unit names', () => {
    expect(() => convert(1, 'oz', 'fl_oz')).toThrow(/oz.*fl_oz/)
    expect(() => convert(1, 'each', 'lb')).toThrow(/each.*lb/)
  })

  // Edge cases
  it('handles zero value', () => {
    expect(convert(0, 'lb', 'oz')).toBe(0)
    expect(convert(0, 'gal', 'l')).toBe(0)
  })

  it('handles negative value', () => {
    expectClose(convert(-1, 'lb', 'oz'), -16)
    expectClose(convert(-500, 'ml', 'l'), -0.5)
  })

  it('handles very large value', () => {
    expectClose(convert(1_000_000, 'lb', 'oz'), 16_000_000)
  })

  it('handles very small value', () => {
    expectClose(convert(0.0001, 'kg', 'g'), 0.1)
  })
})

// ── Round-trip accuracy ───────────────────────────────────────────────────────

describe('round-trip accuracy', () => {
  const weightPairs: [Unit, Unit][] = [
    ['lb', 'oz'], ['lb', 'kg'], ['lb', 'g'],
    ['oz', 'g'], ['oz', 'kg'],
    ['kg', 'g'],
  ]

  const volumePairs: [Unit, Unit][] = [
    ['gal', 'fl_oz'], ['gal', 'l'], ['gal', 'ml'],
    ['l', 'ml'], ['fl_oz', 'l'], ['fl_oz', 'ml'],
  ]

  for (const [a, b] of [...weightPairs, ...volumePairs]) {
    it(`${a} → ${b} → ${a} round-trips within 0.001%`, () => {
      const original = 42
      const there = convert(original, a, b)
      const back = convert(there, b, a)
      expectClose(back, original)
    })
  }

  it('each → each round-trips', () => {
    expect(convert(convert(7, 'each', 'each'), 'each', 'each')).toBe(7)
  })
})

// ── formatConversion ──────────────────────────────────────────────────────────

describe('formatConversion', () => {
  it('formats a simple weight conversion', () => {
    expect(formatConversion(1, 'lb', 'oz')).toBe('1 lb = 16 oz')
  })

  it('formats a simple volume conversion', () => {
    expect(formatConversion(1, 'gal', 'fl_oz')).toBe('1 gal = 128 fl_oz')
  })

  it('formats same-unit trivially', () => {
    expect(formatConversion(5, 'kg', 'kg')).toBe('5 kg = 5 kg')
  })

  it('returns null for incompatible units', () => {
    expect(formatConversion(1, 'oz', 'fl_oz')).toBeNull()
    expect(formatConversion(1, 'each', 'lb')).toBeNull()
    expect(formatConversion(1, 'gal', 'g')).toBeNull()
  })

  it('formats fractional results without trailing zeros', () => {
    const result = formatConversion(1, 'oz', 'lb')
    expect(result).not.toBeNull()
    expect(result).not.toMatch(/0+$/)
  })
})

// ── getCompatibleUnits ────────────────────────────────────────────────────────

describe('getCompatibleUnits', () => {
  it('returns all weight units for a weight unit', () => {
    const compatible = getCompatibleUnits('oz')
    expect(compatible).toContain('oz')
    expect(compatible).toContain('lb')
    expect(compatible).toContain('g')
    expect(compatible).toContain('kg')
    expect(compatible).not.toContain('fl_oz')
    expect(compatible).not.toContain('gal')
    expect(compatible).not.toContain('ml')
    expect(compatible).not.toContain('l')
    expect(compatible).not.toContain('each')
  })

  it('returns all volume units for a volume unit', () => {
    const compatible = getCompatibleUnits('l')
    expect(compatible).toContain('fl_oz')
    expect(compatible).toContain('gal')
    expect(compatible).toContain('ml')
    expect(compatible).toContain('l')
    expect(compatible).not.toContain('oz')
    expect(compatible).not.toContain('lb')
    expect(compatible).not.toContain('g')
    expect(compatible).not.toContain('kg')
    expect(compatible).not.toContain('each')
  })

  it('returns only itself for each', () => {
    const compatible = getCompatibleUnits('each')
    expect(compatible).toEqual(['each'])
  })

  it('result always includes the unit itself', () => {
    const units: Unit[] = ['oz', 'lb', 'g', 'kg', 'fl_oz', 'gal', 'ml', 'l', 'each']
    for (const u of units) {
      expect(getCompatibleUnits(u)).toContain(u)
    }
  })

  it('compatible units count: weight units have 4', () => {
    for (const u of ['oz', 'lb', 'g', 'kg'] as Unit[]) {
      expect(getCompatibleUnits(u)).toHaveLength(4)
    }
  })

  it('compatible units count: volume units have 4', () => {
    for (const u of ['fl_oz', 'gal', 'ml', 'l'] as Unit[]) {
      expect(getCompatibleUnits(u)).toHaveLength(4)
    }
  })
})
