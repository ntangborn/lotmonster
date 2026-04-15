import { z } from 'zod'
import { UNITS } from '@/lib/ingredients/schema'

export type POStatus =
  | 'draft'
  | 'sent'
  | 'partially_received'
  | 'received'
  | 'closed'
  | 'cancelled'

export const poLineSchema = z.object({
  ingredient_id: z.uuid('Invalid ingredient'),
  qty_ordered: z.number().positive('Quantity must be greater than 0'),
  unit: z.enum(UNITS, { error: () => ({ message: 'Invalid unit' }) }),
  unit_cost: z.number().positive('Unit cost must be greater than 0'),
})

export const poCreateSchema = z.object({
  po_number: z.string().trim().max(100).optional(),
  supplier: z.string().trim().min(1, 'Supplier is required').max(200),
  expected_delivery_date: z.string().optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  lines: z.array(poLineSchema).min(1, 'Add at least one line item'),
  mark_sent: z.boolean().default(false),
})

export const poUpdateSchema = z.object({
  supplier: z.string().trim().min(1).max(200).optional(),
  expected_delivery_date: z.string().optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  lines: z.array(poLineSchema).optional(),
})

export const receiveLineSchema = z.object({
  line_id: z.uuid(),
  quantity_received: z
    .number()
    .nonnegative('Received qty must be 0 or greater'),
  lot_number: z.string().trim().min(1).max(100).optional(),
  supplier_lot_number: z.string().trim().max(100).optional().nullable(),
  expiry_date: z.string().optional().nullable(),
  received_date: z.string().optional(),
})

export const receivePOSchema = z.object({
  lines: z.array(receiveLineSchema).min(1),
  notes: z.string().trim().max(1000).optional().nullable(),
})

export type POCreateInput = z.infer<typeof poCreateSchema>
export type POUpdateInput = z.infer<typeof poUpdateSchema>
export type ReceivePOInput = z.infer<typeof receivePOSchema>
export type ReceiveLineInput = z.infer<typeof receiveLineSchema>
