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

export const productionCompleteSchema = z.object({
  actual_yield: z
    .number()
    .nonnegative('Actual yield must be 0 or greater'),
  notes: z.string().trim().max(1000).optional().nullable(),
})

export type ProductionCreateInput = z.infer<typeof productionCreateSchema>
export type ProductionCompleteInput = z.infer<typeof productionCompleteSchema>

export type RunStatus =
  | 'planned'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
