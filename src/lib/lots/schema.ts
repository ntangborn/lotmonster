import { z } from 'zod'
import { UNITS } from '@/lib/ingredients/schema'

export const lotCreateSchema = z.object({
  ingredient_id: z.uuid('Invalid ingredient'),
  lot_number: z.string().trim().min(1, 'Lot number is required').max(100),
  supplier_lot_number: z.string().trim().max(100).optional().nullable(),
  quantity_received: z
    .number()
    .positive('Quantity must be greater than 0'),
  unit: z.enum(UNITS, { error: () => ({ message: 'Invalid unit' }) }),
  unit_cost: z
    .number()
    .positive('Unit cost must be greater than 0'),
  received_date: z.string().optional(),
  expiry_date: z.string().optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
})

export type LotCreateInput = z.infer<typeof lotCreateSchema>

export type DisplayStatus = 'active' | 'expiring_soon' | 'expiring_week' | 'expired' | 'depleted' | 'quarantined'

export function computeDisplayStatus(
  quantityRemaining: number,
  expiryDate: string | null,
  dbStatus: string
): DisplayStatus {
  if (dbStatus === 'quarantined') return 'quarantined'
  if (dbStatus === 'depleted' || quantityRemaining <= 0) return 'depleted'

  if (expiryDate) {
    const now = new Date()
    const exp = new Date(expiryDate)
    const days = Math.floor((exp.getTime() - now.getTime()) / 86_400_000)
    if (days < 0 || dbStatus === 'expired') return 'expired'
    if (days <= 7) return 'expiring_week'
    if (days <= 30) return 'expiring_soon'
  }
  return 'active'
}
