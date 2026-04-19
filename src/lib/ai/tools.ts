/**
 * Anthropic tool_use schemas for the /dashboard/ai assistant.
 *
 * These are the TOOL DEFINITIONS the model sees — shape matches what
 * the Anthropic Messages API expects under `tools`. Each tool's actual
 * handler lives elsewhere and receives the parsed `input` plus an
 * `orgId` that the server derives from the authenticated session.
 *
 * IMPORTANT: `org_id` MUST NOT appear in any `input_schema.properties`.
 * If the model could pass org_id it could pivot into another tenant —
 * the server always injects the caller's orgId, never trusts one from
 * the model. Every schema below enforces this by omission.
 *
 * Post-migration-007 reality encoded in descriptions:
 *   - lots are polymorphic: `kind='raw'` (ingredient_id set) or
 *     `kind='finished'` (sku_id + production_run_id set)
 *   - ingredients have `kind='raw'` or `kind='packaging'`
 *   - production runs produce one or more SKUs via production_run_outputs,
 *     with split liquid + packaging COGS
 *   - sales orders reference skus (sku_id) not recipes directly
 */

export interface AITool {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
    additionalProperties?: boolean
  }
}

export const AI_TOOL_NAMES = [
  'get_cogs_summary',
  'get_expiring_lots',
  'get_low_stock_ingredients',
  'get_ingredient_cost_history',
  'get_production_run_detail',
  'get_recipe_cost_estimate',
  'get_sales_summary',
  'get_lot_traceability',
  'get_inventory_valuation',
  'get_supplier_spend',
  'get_finished_goods_status',
] as const

export type AIToolName = (typeof AI_TOOL_NAMES)[number]

// Reused subschemas ----------------------------------------------------------

const ISO_DATE = {
  type: 'string',
  format: 'date',
  description: 'Date in YYYY-MM-DD (calendar, UTC).',
} as const

// 1. get_cogs_summary --------------------------------------------------------

const getCogsSummary: AITool = {
  name: 'get_cogs_summary',
  description:
    'Summarize cost of goods sold for a date range, broken out into liquid (raw-ingredient) and packaging components. ' +
    'Returns total_cogs, liquid_cogs, packaging_cogs, and a list of completed production runs in the range with per-run totals. ' +
    'Use this for questions like "how much did we spend on ingredients last month?" or "what was our COGS in Q1?".',
  input_schema: {
    type: 'object',
    properties: {
      start_date: ISO_DATE,
      end_date: ISO_DATE,
      granularity: {
        type: 'string',
        enum: ['daily', 'weekly', 'monthly', 'ytd', 'range'],
        description:
          'Time bucketing. "range" (default) returns a single aggregate. ' +
          '"monthly"/"weekly"/"daily" return an array of buckets. "ytd" ignores ' +
          'start_date and returns year-to-date from Jan 1.',
      },
    },
    required: ['start_date', 'end_date'],
    additionalProperties: false,
  },
}

// 2. get_expiring_lots -------------------------------------------------------

const getExpiringLots: AITool = {
  name: 'get_expiring_lots',
  description:
    'List lots that will expire within a window. Spans both raw-ingredient lots and finished-goods lots ' +
    '(sku_id is set on finished lots, ingredient_id on raw). Each row includes lot_number, kind (raw|finished), ' +
    'the referenced item name (ingredient or SKU), days_until_expiry, quantity_remaining, and unit. ' +
    'Use this for "what\'s expiring this week?" or "show me finished inventory expiring in 30 days".',
  input_schema: {
    type: 'object',
    properties: {
      days_ahead: {
        type: 'integer',
        minimum: 0,
        maximum: 365,
        description:
          'Only return lots expiring within this many days from today. Defaults to 30.',
      },
      kind: {
        type: 'string',
        enum: ['raw', 'finished', 'all'],
        description:
          'Filter to raw lots only, finished-goods lots only, or both. Defaults to "all".',
      },
      include_expired: {
        type: 'boolean',
        description:
          'If true, also include lots whose expiry is already in the past. Defaults to false.',
      },
    },
    additionalProperties: false,
  },
}

// 3. get_low_stock_ingredients ----------------------------------------------

const getLowStockIngredients: AITool = {
  name: 'get_low_stock_ingredients',
  description:
    'List ingredients whose current stock is below their low_stock_threshold. Includes both raw ingredients ' +
    '(kind="raw") and packaging components (kind="packaging"). Each row has ingredient_name, kind, ' +
    'current_stock, low_stock_threshold, unit, and out_of_stock flag. ' +
    'Use this for reorder planning — e.g. "what do I need to buy?".',
  input_schema: {
    type: 'object',
    properties: {
      kind: {
        type: 'string',
        enum: ['raw', 'packaging', 'all'],
        description:
          'Filter by ingredient kind. Defaults to "all" (shows both raw and packaging).',
      },
      include_no_threshold: {
        type: 'boolean',
        description:
          'If true, also include ingredients with no low_stock_threshold set ' +
          '(they are out_of_stock only if current_stock <= 0). Defaults to false.',
      },
    },
    additionalProperties: false,
  },
}

// 4. get_ingredient_cost_history --------------------------------------------

const getIngredientCostHistory: AITool = {
  name: 'get_ingredient_cost_history',
  description:
    'Return the unit-cost history for an ingredient across purchase orders and received lots, ordered ' +
    'chronologically. Each row has received_date, po_number, supplier, unit_cost, quantity_received, ' +
    'and landed_cost if recorded. Useful for "has the price of X gone up?" or supplier-change audits.',
  input_schema: {
    type: 'object',
    properties: {
      ingredient_name: {
        type: 'string',
        description:
          'Human-readable ingredient name. Server does a case-insensitive exact match first, then prefix.',
      },
      months_back: {
        type: 'integer',
        minimum: 1,
        maximum: 60,
        description: 'Look-back window in months from today. Defaults to 12.',
      },
    },
    required: ['ingredient_name'],
    additionalProperties: false,
  },
}

// 5. get_production_run_detail ----------------------------------------------

const getProductionRunDetail: AITool = {
  name: 'get_production_run_detail',
  description:
    'Full detail for one production run: recipe, status, timestamps, total_cogs, and — critically — the ' +
    'production_run_outputs (one row per finished SKU) with per-SKU quantity, allocated_cogs_liquid, ' +
    'allocated_cogs_packaging, allocated_cogs_total, unit_cogs, and the finished-goods lot number(s). ' +
    'Also returns the consumed-lots list (raw + packaging). ' +
    'Use this for questions like "what did run PR-2026-014 cost and yield?".',
  input_schema: {
    type: 'object',
    properties: {
      run_number: {
        type: 'string',
        description:
          'Human-readable run number, e.g. "PR-2026-014". Case-sensitive exact match.',
      },
    },
    required: ['run_number'],
    additionalProperties: false,
  },
}

// 6. get_recipe_cost_estimate -----------------------------------------------

const getRecipeCostEstimate: AITool = {
  name: 'get_recipe_cost_estimate',
  description:
    'Estimate the COGS of running a recipe at a given batch multiplier — BEFORE the run happens. ' +
    'Returns estimated_liquid_cogs (from recipe_lines × current weighted-avg raw unit costs) and, per linked ' +
    'SKU with a declared fill_quantity, the expected yield (expected_liquid / fill_quantity), packaging_cogs_per_unit ' +
    'from the SKU\'s sku_packaging BOM × current packaging unit costs, liquid_cogs_per_unit, and unit_cogs. ' +
    'Use this for "how much would a 2× batch of Jalapeño Sauce cost to make?" or pricing discussions.',
  input_schema: {
    type: 'object',
    properties: {
      recipe_name: {
        type: 'string',
        description: 'Recipe name (case-insensitive exact, then prefix match).',
      },
      batch_multiplier: {
        type: 'number',
        exclusiveMinimum: 0,
        description: 'Multiplier on recipe.target_yield. Defaults to 1.',
      },
    },
    required: ['recipe_name'],
    additionalProperties: false,
  },
}

// 7. get_sales_summary ------------------------------------------------------

const getSalesSummary: AITool = {
  name: 'get_sales_summary',
  description:
    'Summarize sales for a date range. Groups by SKU (the sku.name is the label; recipe is no longer the ' +
    'unit of sale post-migration-007). Each row has sku_name, units_sold, revenue, cogs (from finished-lot ' +
    'unit_cost × quantity), and gross_profit. Also returns totals. Use this for "what are my top sellers?" ' +
    'or "what was Q1 revenue?".',
  input_schema: {
    type: 'object',
    properties: {
      start_date: ISO_DATE,
      end_date: ISO_DATE,
      sku_name: {
        type: 'string',
        description:
          'Optional filter — restrict to a single SKU by name (case-insensitive exact, then prefix).',
      },
      status: {
        type: 'string',
        enum: ['shipped', 'invoiced', 'closed', 'any_post_ship'],
        description:
          'Which SO statuses to include. "any_post_ship" (default) = shipped|invoiced|closed.',
      },
    },
    required: ['start_date', 'end_date'],
    additionalProperties: false,
  },
}

// 8. get_lot_traceability ---------------------------------------------------

const getLotTraceability: AITool = {
  name: 'get_lot_traceability',
  description:
    'Walk the traceability graph for a lot. Handles both raw lots and finished-goods lots. ' +
    'Forward: raw lot → production runs that consumed it → finished-goods lots those runs produced → ' +
    'sales orders that shipped those finished lots. Reverse: finished lot → parent run → raw lots consumed ' +
    '→ suppliers. If a finished lot number is passed, the chain starts mid-way at the finished-goods stage. ' +
    'Use this for recall / QA questions: "which customers got lot JAL16-20260425-001?" or "where did the ' +
    'cayenne in PR-2026-014 come from?".',
  input_schema: {
    type: 'object',
    properties: {
      lot_number: {
        type: 'string',
        description:
          'Lot number — raw (e.g. "CAY-20260301-002") or finished (e.g. "JAL16-20260425-001").',
      },
      direction: {
        type: 'string',
        enum: ['forward', 'reverse'],
        description:
          '"forward" (default) walks lot → customer. "reverse" walks lot → supplier.',
      },
    },
    required: ['lot_number'],
    additionalProperties: false,
  },
}

// 9. get_inventory_valuation ------------------------------------------------

const getInventoryValuation: AITool = {
  name: 'get_inventory_valuation',
  description:
    'Total dollar value of current inventory. Polymorphic: raw lots (kind="raw") valued at lot.unit_cost × ' +
    'quantity_remaining; finished-goods lots (kind="finished") valued the same way but drawn from SKU-linked ' +
    'lots. Returns totals by kind plus a top-N list of highest-value items. ' +
    'Use this for "how much inventory is on the books right now?" or balance-sheet prep.',
  input_schema: {
    type: 'object',
    properties: {
      kind: {
        type: 'string',
        enum: ['raw', 'packaging', 'finished', 'all'],
        description:
          'Filter by lot kind — raw ingredients, packaging components, finished goods, or all (default).',
      },
      top_n: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        description: 'Number of top-value items to include in the breakdown. Defaults to 10.',
      },
    },
    additionalProperties: false,
  },
}

// 10. get_supplier_spend ----------------------------------------------------

const getSupplierSpend: AITool = {
  name: 'get_supplier_spend',
  description:
    'Group purchase-order line costs by supplier across a date range. Each row has supplier, po_count, ' +
    'total_spend, and top_ingredient (the ingredient consuming the most $ with that supplier). ' +
    'Use this for "who are my biggest vendors this quarter?" or supplier-consolidation analysis.',
  input_schema: {
    type: 'object',
    properties: {
      start_date: ISO_DATE,
      end_date: ISO_DATE,
    },
    required: ['start_date', 'end_date'],
    additionalProperties: false,
  },
}

// 11. get_finished_goods_status (NEW) ---------------------------------------

const getFinishedGoodsStatus: AITool = {
  name: 'get_finished_goods_status',
  description:
    'What can I sell today? Per active unit SKU, returns on_hand (sum of quantity_remaining across ' +
    'available finished-goods lots), lot_count, earliest_expiry, weighted_avg_unit_cost, and retail_price. ' +
    'Results are ordered by on_hand descending by default. ' +
    'Use this for "what\'s in finished inventory right now?" or sales conversations ("how many 16oz do ' +
    'we have to ship this week?").',
  input_schema: {
    type: 'object',
    properties: {
      sku_name: {
        type: 'string',
        description:
          'Optional filter — restrict to a single SKU by name (case-insensitive exact, then prefix). Omit for all.',
      },
      only_in_stock: {
        type: 'boolean',
        description:
          'If true, hide SKUs with on_hand = 0. Defaults to false so the response surfaces ' +
          'zero-stock SKUs too (useful for "what do I need to make?").',
      },
    },
    additionalProperties: false,
  },
}

// Aggregate ------------------------------------------------------------------

export const AI_TOOLS: AITool[] = [
  getCogsSummary,
  getExpiringLots,
  getLowStockIngredients,
  getIngredientCostHistory,
  getProductionRunDetail,
  getRecipeCostEstimate,
  getSalesSummary,
  getLotTraceability,
  getInventoryValuation,
  getSupplierSpend,
  getFinishedGoodsStatus,
]

export const AI_TOOLS_BY_NAME: Record<AIToolName, AITool> = {
  get_cogs_summary: getCogsSummary,
  get_expiring_lots: getExpiringLots,
  get_low_stock_ingredients: getLowStockIngredients,
  get_ingredient_cost_history: getIngredientCostHistory,
  get_production_run_detail: getProductionRunDetail,
  get_recipe_cost_estimate: getRecipeCostEstimate,
  get_sales_summary: getSalesSummary,
  get_lot_traceability: getLotTraceability,
  get_inventory_valuation: getInventoryValuation,
  get_supplier_spend: getSupplierSpend,
  get_finished_goods_status: getFinishedGoodsStatus,
}
