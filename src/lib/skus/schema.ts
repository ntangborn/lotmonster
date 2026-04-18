import { z } from 'zod'

export const SKU_KINDS = ['unit', 'case', 'pallet'] as const
export type SkuKind = (typeof SKU_KINDS)[number]

const skuBaseShape = {
  name: z.string().trim().min(1, 'Name is required').max(200),
  kind: z.enum(SKU_KINDS, { error: () => ({ message: 'Invalid kind' }) }),
  recipe_id: z.string().uuid().optional().nullable(),
  parent_sku_id: z.string().uuid().optional().nullable(),
  units_per_parent: z.number().int().positive().optional().nullable(),
  upc: z.string().trim().max(64).optional().nullable(),
  fill_quantity: z.number().positive().optional().nullable(),
  fill_unit: z.string().trim().max(20).optional().nullable(),
  shelf_life_days: z.number().int().positive().optional().nullable(),
  retail_price: z.number().nonnegative().optional().nullable(),
  qbo_item_id: z.string().trim().max(100).optional().nullable(),
  lot_prefix: z.string().trim().max(20).optional().nullable(),
  active: z.boolean().optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
}

const skuObject = z.object(skuBaseShape)

export const skuCreateSchema = skuObject
  .refine(
    (v) => v.kind === 'unit' || v.parent_sku_id != null,
    {
      message: 'case/pallet SKUs must specify a parent_sku_id',
      path: ['parent_sku_id'],
    }
  )
  .refine(
    (v) => (v.parent_sku_id == null) === (v.units_per_parent == null),
    {
      message: 'parent_sku_id and units_per_parent must be set together',
      path: ['units_per_parent'],
    }
  )

export const skuUpdateSchema = skuObject.partial()

export type SkuCreateInput = z.infer<typeof skuCreateSchema>
export type SkuUpdateInput = z.infer<typeof skuUpdateSchema>

export const bomEntrySchema = z.object({
  ingredient_id: z.string().uuid('Invalid ingredient id'),
  quantity: z.number().positive('quantity must be > 0'),
  unit: z.string().trim().max(20).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
})

export const bomSchema = z.array(bomEntrySchema)

export type BomEntry = z.infer<typeof bomEntrySchema>

/**
 * Derive a lot number prefix from a SKU/recipe name. Strips every
 * non-word character, uppercases, takes the first 6 chars. Returns null
 * when the name has no word characters. Mirrors the SQL backfill in
 * migration 007.
 */
export function buildLotPrefix(name: string): string | null {
  const stripped = name.replace(/\W/g, '')
  if (!stripped) return null
  return stripped.slice(0, 6).toUpperCase()
}
