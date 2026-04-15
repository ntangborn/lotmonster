import { z } from 'zod'

export type SOStatus =
  | 'draft'
  | 'confirmed'
  | 'allocated'
  | 'shipped'
  | 'invoiced'
  | 'closed'
  | 'cancelled'

export const soLineSchema = z.object({
  recipe_id: z.uuid('Invalid recipe'),
  quantity: z.number().positive('Quantity must be greater than 0'),
  unit: z.string().trim().min(1).max(50).default('unit'),
  unit_price: z
    .number()
    .nonnegative('Unit price must be 0 or greater')
    .nullable()
    .optional(),
})

export const soCreateSchema = z.object({
  order_number: z.string().trim().max(100).optional(),
  customer_name: z.string().trim().min(1, 'Customer is required').max(200),
  customer_email: z
    .string()
    .trim()
    .max(200)
    .optional()
    .nullable()
    .refine(
      (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      'Invalid email'
    ),
  expected_ship_date: z.string().optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  lines: z.array(soLineSchema).min(1, 'Add at least one line item'),
  confirm_now: z.boolean().default(false),
})

export const shipLineSchema = z.object({
  line_id: z.uuid(),
  lot_numbers: z.array(z.string().trim().min(1).max(100)).default([]),
})

export const shipSOSchema = z.object({
  shipped_at: z.string().optional(),
  lines: z.array(shipLineSchema).default([]),
  notes: z.string().trim().max(1000).optional().nullable(),
})

export type SOCreateInput = z.infer<typeof soCreateSchema>
export type ShipSOInput = z.infer<typeof shipSOSchema>
export type ShipLineInput = z.infer<typeof shipLineSchema>
