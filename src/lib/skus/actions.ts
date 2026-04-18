'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOrgId } from '@/lib/ingredients/queries'
import {
  skuCreateSchema,
  skuUpdateSchema,
  bomSchema,
  buildLotPrefix,
  type SkuCreateInput,
  type SkuUpdateInput,
  type BomEntry,
} from './schema'
import { getSkuDeletionBlockers } from './queries'
import type { Database } from '@/types/database'

type SkuUpdate = Database['public']['Tables']['skus']['Update']

function blockerMessage(b: NonNullable<Awaited<ReturnType<typeof getSkuDeletionBlockers>>>): string {
  const parts: string[] = []
  if (b.lots) parts.push(`${b.lots} finished lot${b.lots === 1 ? '' : 's'}`)
  if (b.outputs) parts.push(`${b.outputs} production run output${b.outputs === 1 ? '' : 's'}`)
  if (b.salesOrderLines) parts.push(`${b.salesOrderLines} sales order line${b.salesOrderLines === 1 ? '' : 's'}`)
  if (b.children) parts.push(`${b.children} child SKU${b.children === 1 ? '' : 's'}`)
  if (b.packaging) parts.push(`${b.packaging} packaging BOM row${b.packaging === 1 ? '' : 's'}`)
  return `Cannot delete: referenced by ${parts.join(', ')}`
}

export async function createSku(
  input: SkuCreateInput
): Promise<{ id: string }> {
  const parsed = skuCreateSchema.parse(input)
  const { orgId } = await resolveOrgId()
  const admin = createAdminClient()

  // Verify referenced recipe + parent belong to the same org.
  if (parsed.recipe_id) {
    const { data: r } = await admin
      .from('recipes')
      .select('id')
      .eq('org_id', orgId)
      .eq('id', parsed.recipe_id)
      .maybeSingle()
    if (!r) throw new Error('recipe_id not found in this organization')
  }
  if (parsed.parent_sku_id) {
    const { data: p } = await admin
      .from('skus')
      .select('id')
      .eq('org_id', orgId)
      .eq('id', parsed.parent_sku_id)
      .maybeSingle()
    if (!p) throw new Error('parent_sku_id not found in this organization')
  }

  const lotPrefix = parsed.lot_prefix ?? buildLotPrefix(parsed.name)

  const { data, error } = await admin
    .from('skus')
    .insert({
      org_id: orgId,
      recipe_id: parsed.recipe_id ?? null,
      parent_sku_id: parsed.parent_sku_id ?? null,
      units_per_parent: parsed.units_per_parent ?? null,
      kind: parsed.kind,
      name: parsed.name,
      upc: parsed.upc ?? null,
      fill_quantity: parsed.fill_quantity ?? null,
      fill_unit: parsed.fill_unit ?? null,
      shelf_life_days: parsed.shelf_life_days ?? null,
      retail_price: parsed.retail_price ?? null,
      qbo_item_id: parsed.qbo_item_id ?? null,
      lot_prefix: lotPrefix,
      active: parsed.active ?? true,
      notes: parsed.notes ?? null,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  return { id: data.id }
}

export async function updateSku(
  id: string,
  input: SkuUpdateInput
): Promise<{ ok: true }> {
  const parsed = skuUpdateSchema.parse(input)
  const { orgId } = await resolveOrgId()
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('skus')
    .select('id')
    .eq('org_id', orgId)
    .eq('id', id)
    .maybeSingle()
  if (!existing) throw new Error('SKU not found')

  const patch: SkuUpdate = {}
  for (const [k, v] of Object.entries(parsed)) {
    if (v !== undefined) (patch as Record<string, unknown>)[k] = v
  }
  if (Object.keys(patch).length === 0) return { ok: true }

  const { error } = await admin
    .from('skus')
    .update(patch)
    .eq('org_id', orgId)
    .eq('id', id)
  if (error) throw new Error(error.message)

  return { ok: true }
}

export async function deleteSku(id: string): Promise<{ ok: true }> {
  const { orgId } = await resolveOrgId()
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('skus')
    .select('id')
    .eq('org_id', orgId)
    .eq('id', id)
    .maybeSingle()
  if (!existing) throw new Error('SKU not found')

  const blockers = await getSkuDeletionBlockers(orgId, id)
  if (blockers) throw new Error(blockerMessage(blockers))

  const { error } = await admin
    .from('skus')
    .delete()
    .eq('org_id', orgId)
    .eq('id', id)
  if (error) throw new Error(error.message)

  return { ok: true }
}

/**
 * Replaces the packaging BOM for a SKU.
 *
 * Rejects any ingredient where `kind != 'packaging'` with a clear error —
 * the FK constraint alone cannot enforce this (both raw and packaging
 * ingredients share the same table).
 *
 * Delete-and-replace is wrapped in best-effort sequencing: we insert the
 * new rows first, then delete the old ones matched by the prior ingredient
 * set. On INSERT failure, nothing is deleted.
 */
export async function setPackagingBOM(
  skuId: string,
  entries: BomEntry[]
): Promise<{ ok: true; count: number }> {
  const parsed = bomSchema.parse(entries)
  const { orgId } = await resolveOrgId()
  const admin = createAdminClient()

  const { data: sku } = await admin
    .from('skus')
    .select('id')
    .eq('org_id', orgId)
    .eq('id', skuId)
    .maybeSingle()
  if (!sku) throw new Error('SKU not found')

  // Deduplicate entries by ingredient_id; last wins.
  const dedup = new Map<string, BomEntry>()
  for (const e of parsed) dedup.set(e.ingredient_id, e)
  const unique = Array.from(dedup.values())

  if (unique.length > 0) {
    const ids = unique.map((e) => e.ingredient_id)
    const { data: ingredients } = await admin
      .from('ingredients')
      .select('id, name, kind')
      .eq('org_id', orgId)
      .in('id', ids)

    const found = new Map((ingredients ?? []).map((r) => [r.id, r]))
    const missing = ids.filter((id) => !found.has(id))
    if (missing.length > 0) {
      throw new Error(
        `Ingredient(s) not found in this organization: ${missing.join(', ')}`
      )
    }

    const badRaw = (ingredients ?? []).filter((r) => r.kind !== 'packaging')
    if (badRaw.length > 0) {
      const names = badRaw.map((r) => r.name).join(', ')
      throw new Error(
        `Cannot add raw ingredients to a packaging BOM (expected kind='packaging'): ${names}`
      )
    }
  }

  // Replace: insert new rows, then delete anything that wasn't refreshed.
  // sku_packaging has UNIQUE (sku_id, ingredient_id) so we UPSERT by that key.
  if (unique.length > 0) {
    const payload = unique.map((e) => ({
      org_id: orgId,
      sku_id: skuId,
      ingredient_id: e.ingredient_id,
      quantity: e.quantity,
      unit: e.unit ?? null,
      notes: e.notes ?? null,
    }))
    const { error: upErr } = await admin
      .from('sku_packaging')
      .upsert(payload, { onConflict: 'sku_id,ingredient_id' })
    if (upErr) throw new Error(upErr.message)
  }

  // Drop rows whose ingredient_id isn't in the new set.
  const keepIds = unique.map((e) => e.ingredient_id)
  let delQ = admin
    .from('sku_packaging')
    .delete()
    .eq('org_id', orgId)
    .eq('sku_id', skuId)
  if (keepIds.length > 0) {
    delQ = delQ.not(
      'ingredient_id',
      'in',
      `(${keepIds.map((id) => `"${id}"`).join(',')})`
    )
  }
  const { error: delErr } = await delQ
  if (delErr) throw new Error(delErr.message)

  return { ok: true, count: unique.length }
}
