import { z } from 'zod'

export const productionCreateSchema = z.object({
  recipe_id: z.uuid('Invalid recipe'),
  batch_multiplier: z
    .number()
    .positive('Batch multiplier must be greater than 0')
    .default(1),
  notes: z.string().trim().max(1000).optional().nullable(),
  // If true: create + start in one action. If false: create as draft (planned).
  start_immediately: z.boolean().default(false),
})

export const productionOutputSchema = z.object({
  skuId: z.uuid('Invalid sku id'),
  quantity: z.number().positive('quantity must be > 0'),
  expiryDate: z.string().trim().min(1).optional().nullable(),
  liquidPctOverride: z
    .number()
    .min(0, 'liquidPctOverride must be >= 0')
    .max(1, 'liquidPctOverride must be <= 1')
    .optional()
    .nullable(),
  overrideNote: z.string().trim().max(500).optional().nullable(),
})

export const productionCompleteSchema = z.object({
  outputs: z
    .array(productionOutputSchema)
    .min(1, 'At least one output SKU is required'),
  notes: z.string().trim().max(1000).optional().nullable(),
})

export type ProductionCreateInput = z.infer<typeof productionCreateSchema>
export type ProductionCompleteInput = z.infer<typeof productionCompleteSchema>
export type ProductionOutputInput = z.infer<typeof productionOutputSchema>

export type RunStatus =
  | 'planned'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
