// ── Unit types ────────────────────────────────────────────────────────────────

export type WeightUnit = 'oz' | 'lb' | 'g' | 'kg'
export type VolumeUnit = 'fl_oz' | 'gal' | 'ml' | 'l'
export type EachUnit = 'each'
export type Unit = WeightUnit | VolumeUnit | EachUnit

export type UnitCategory = 'weight' | 'volume' | 'each'

// ── Category map ──────────────────────────────────────────────────────────────

const WEIGHT_UNITS = new Set<Unit>(['oz', 'lb', 'g', 'kg'])
const VOLUME_UNITS = new Set<Unit>(['fl_oz', 'gal', 'ml', 'l'])

export function getUnitCategory(unit: Unit): UnitCategory {
  if (WEIGHT_UNITS.has(unit)) return 'weight'
  if (VOLUME_UNITS.has(unit)) return 'volume'
  return 'each'
}

// ── Conversion factors ────────────────────────────────────────────────────────
// All factors are defined as: 1 `from` = N `to`
// The table is built symmetrically so both directions are present.

type Pair = `${Unit}->${Unit}`

const FACTORS = new Map<Pair, number>()

function addConversion(a: Unit, b: Unit, aToB: number): void {
  FACTORS.set(`${a}->${b}`, aToB)
  FACTORS.set(`${b}->${a}`, 1 / aToB)
}

// Weight
addConversion('lb',  'oz',  16)
addConversion('kg',  'g',   1000)
addConversion('lb',  'kg',  0.453592)
addConversion('oz',  'g',   28.3495)

// Derived weight pairs (computed transitively to avoid accumulated rounding)
addConversion('lb', 'g',   453.592)   // lb→g = lb→kg * kg→g = 0.453592 * 1000
addConversion('oz', 'kg',  0.0283495) // oz→kg = oz→g / 1000 = 28.3495 / 1000

// Volume
addConversion('gal', 'fl_oz', 128)
addConversion('l',   'ml',    1000)
addConversion('gal', 'l',     3.78541)

// Derived volume pairs
addConversion('gal', 'ml',   3785.41)  // gal→ml = gal→l * l→ml = 3.78541 * 1000
addConversion('fl_oz', 'l',  0.0295735) // fl_oz→l = fl_oz→gal * gal→l = (1/128) * 3.78541
addConversion('fl_oz', 'ml', 29.5735)   // fl_oz→ml = fl_oz→l * 1000

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the conversion factor from `from` to `to` (1 `from` = N `to`),
 * or null if no direct conversion exists.
 */
export function getConversionFactor(from: Unit, to: Unit): number | null {
  if (from === to) return 1
  return FACTORS.get(`${from}->${to}`) ?? null
}

/**
 * Returns true if `from` can be converted to `to`.
 * Same unit always returns true. 'each' cannot convert to anything else.
 */
export function canConvert(from: Unit, to: Unit): boolean {
  if (from === to) return true
  return FACTORS.has(`${from}->${to}`)
}

/**
 * Converts a value from one unit to another.
 * Throws if the conversion is not possible.
 */
export function convert(value: number, from: Unit, to: Unit): number {
  if (from === to) return value
  const factor = getConversionFactor(from, to)
  if (factor === null) {
    throw new Error(`Cannot convert from "${from}" to "${to}"`)
  }
  return value * factor
}

/**
 * Returns a human-readable string describing the conversion.
 * e.g. formatConversion(2, 'lb', 'oz') → "2 lb = 32 oz"
 * Returns null if the conversion is not possible.
 */
export function formatConversion(value: number, from: Unit, to: Unit): string | null {
  if (!canConvert(from, to)) return null
  const result = convert(value, from, to)
  const fmt = (n: number) =>
    Number.isInteger(n) ? n.toString() : parseFloat(n.toPrecision(7)).toString()
  return `${fmt(value)} ${from} = ${fmt(result)} ${to}`
}

/**
 * Returns all units that `unit` can be converted to (including itself).
 */
export function getCompatibleUnits(unit: Unit): Unit[] {
  const all: Unit[] = ['oz', 'lb', 'g', 'kg', 'fl_oz', 'gal', 'ml', 'l', 'each']
  return all.filter((u) => canConvert(unit, u))
}
