import { z } from 'zod'

export const UNITS = [
  'oz',
  'lb',
  'g',
  'kg',
  'fl_oz',
  'gal',
  'ml',
  'l',
  'each',
] as const

export const ingredientCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  sku: z.string().trim().max(100).optional().nullable(),
  unit: z.enum(UNITS, { error: () => ({ message: 'Invalid unit' }) }),
  category: z.string().trim().max(100).optional().nullable(),
  low_stock_threshold: z.number().nonnegative().optional().nullable(),
  cost_per_unit: z.number().positive().optional().nullable(),
  bulk_unit: z.string().trim().max(50).optional().nullable(),
  bulk_to_unit_factor: z.number().positive().optional().nullable(),
  cost_per_bulk_unit: z.number().positive().optional().nullable(),
  default_supplier: z.string().trim().max(200).optional().nullable(),
  storage_notes: z.string().trim().max(1000).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
})

export const ingredientUpdateSchema = ingredientCreateSchema.partial()

export type IngredientCreateInput = z.infer<typeof ingredientCreateSchema>
export type IngredientUpdateInput = z.infer<typeof ingredientUpdateSchema>

export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock'

export function computeStockStatus(
  currentStock: number,
  lowStockThreshold: number | null
): StockStatus {
  if (currentStock <= 0) return 'out_of_stock'
  if (lowStockThreshold != null && currentStock < lowStockThreshold) {
    return 'low_stock'
  }
  return 'in_stock'
}
