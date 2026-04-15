import { z } from 'zod'
import { UNITS } from '@/lib/ingredients/schema'

export const recipeLineSchema = z.object({
  ingredient_id: z.uuid('Invalid ingredient'),
  quantity: z.number().positive('Quantity must be greater than 0'),
  unit: z.enum(UNITS, { error: () => ({ message: 'Invalid unit' }) }),
})

export const recipeCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  target_yield: z.number().positive('Target yield must be greater than 0'),
  target_yield_unit: z.string().trim().min(1).max(50),
  notes: z.string().trim().max(1000).optional().nullable(),
  lines: z.array(recipeLineSchema).min(1, 'Add at least one ingredient'),
})

export const recipeUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  target_yield: z.number().positive().optional(),
  target_yield_unit: z.string().trim().min(1).max(50).optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
  lines: z.array(recipeLineSchema).optional(),
})

export type RecipeLineInput = z.infer<typeof recipeLineSchema>
export type RecipeCreateInput = z.infer<typeof recipeCreateSchema>
export type RecipeUpdateInput = z.infer<typeof recipeUpdateSchema>
