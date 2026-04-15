// Hand-written types matching 001_initial_schema.sql
// Replace with generated output once Supabase CLI is wired up:
//   npx supabase gen types typescript --project-id <id> > src/types/database.ts
//
// supabase-js v2.103+ requires Relationships: [] on every table definition.

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export type OrgPlan = 'free' | 'starter' | 'growth' | 'scale'
export type OrgMemberRole = 'owner' | 'admin' | 'member'
export type LotStatus = 'available' | 'depleted' | 'expired' | 'quarantined'
export type ProductionRunStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled'
export type PurchaseOrderStatus = 'draft' | 'sent' | 'partially_received' | 'received' | 'closed' | 'cancelled'
export type SalesOrderStatus = 'draft' | 'confirmed' | 'allocated' | 'shipped' | 'invoiced' | 'closed' | 'cancelled'
export type QboEntityType = 'bill' | 'invoice' | 'journal_entry' | 'vendor' | 'customer' | 'item'
export type QboSyncStatus = 'pending' | 'success' | 'failed' | 'retrying'

export interface Database {
  public: {
    Tables: {
      // -----------------------------------------------------------------------
      orgs: {
        Row: {
          id: string
          name: string
          slug: string
          plan: OrgPlan
          stripe_customer_id: string | null
          qbo_realm_id: string | null
          qbo_refresh_token_encrypted: string | null
          qbo_refresh_token_expires_at: string | null
          qbo_environment: 'sandbox' | 'production' | null
          qbo_connected_at: string | null
          qbo_cogs_account_id: string | null
          qbo_inventory_account_id: string | null
          qbo_ar_account_id: string | null
          qbo_ap_account_id: string | null
          qbo_default_item_id: string | null
          qbo_income_account_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          plan?: OrgPlan
          stripe_customer_id?: string | null
          qbo_realm_id?: string | null
          qbo_refresh_token_encrypted?: string | null
          qbo_refresh_token_expires_at?: string | null
          qbo_environment?: 'sandbox' | 'production' | null
          qbo_connected_at?: string | null
          qbo_cogs_account_id?: string | null
          qbo_inventory_account_id?: string | null
          qbo_ar_account_id?: string | null
          qbo_ap_account_id?: string | null
          qbo_default_item_id?: string | null
          qbo_income_account_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          plan?: OrgPlan
          stripe_customer_id?: string | null
          qbo_realm_id?: string | null
          qbo_refresh_token_encrypted?: string | null
          qbo_refresh_token_expires_at?: string | null
          qbo_environment?: 'sandbox' | 'production' | null
          qbo_connected_at?: string | null
          qbo_cogs_account_id?: string | null
          qbo_inventory_account_id?: string | null
          qbo_ar_account_id?: string | null
          qbo_ap_account_id?: string | null
          qbo_default_item_id?: string | null
          qbo_income_account_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      // -----------------------------------------------------------------------
      org_members: {
        Row: {
          id: string
          org_id: string
          user_id: string
          role: OrgMemberRole
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          user_id: string
          role?: OrgMemberRole
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          user_id?: string
          role?: OrgMemberRole
        }
        Relationships: []
      }
      // -----------------------------------------------------------------------
      ingredients: {
        Row: {
          id: string
          org_id: string
          name: string
          sku: string | null
          unit: string
          bulk_unit: string | null
          bulk_to_unit_factor: number | null
          cost_per_unit: number | null
          cost_per_bulk_unit: number | null
          category: string | null
          allergens: string[] | null
          low_stock_threshold: number | null
          default_supplier: string | null
          storage_notes: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          name: string
          sku?: string | null
          unit: string
          bulk_unit?: string | null
          bulk_to_unit_factor?: number | null
          cost_per_unit?: number | null
          cost_per_bulk_unit?: number | null
          category?: string | null
          allergens?: string[] | null
          low_stock_threshold?: number | null
          default_supplier?: string | null
          storage_notes?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          name?: string
          sku?: string | null
          unit?: string
          bulk_unit?: string | null
          bulk_to_unit_factor?: number | null
          cost_per_unit?: number | null
          cost_per_bulk_unit?: number | null
          category?: string | null
          allergens?: string[] | null
          low_stock_threshold?: number | null
          default_supplier?: string | null
          storage_notes?: string | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      // -----------------------------------------------------------------------
      lots: {
        Row: {
          id: string
          org_id: string
          ingredient_id: string
          po_id: string | null
          lot_number: string
          supplier_lot_number: string | null
          quantity_received: number
          quantity_remaining: number
          unit: string
          unit_cost: number
          expiry_date: string | null
          received_date: string
          status: LotStatus
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          ingredient_id: string
          po_id?: string | null
          lot_number: string
          supplier_lot_number?: string | null
          quantity_received: number
          quantity_remaining: number
          unit: string
          unit_cost: number
          expiry_date?: string | null
          received_date?: string
          status?: LotStatus
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          ingredient_id?: string
          po_id?: string | null
          lot_number?: string
          supplier_lot_number?: string | null
          quantity_received?: number
          quantity_remaining?: number
          unit?: string
          unit_cost?: number
          expiry_date?: string | null
          received_date?: string
          status?: LotStatus
          notes?: string | null
        }
        Relationships: []
      }
      // -----------------------------------------------------------------------
      recipes: {
        Row: {
          id: string
          org_id: string
          name: string
          target_yield: number
          target_yield_unit: string
          version: number
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          name: string
          target_yield: number
          target_yield_unit: string
          version?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          name?: string
          target_yield?: number
          target_yield_unit?: string
          version?: number
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      // -----------------------------------------------------------------------
      recipe_lines: {
        Row: {
          id: string
          org_id: string
          recipe_id: string
          ingredient_id: string
          quantity: number
          unit: string
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          recipe_id: string
          ingredient_id: string
          quantity: number
          unit: string
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          recipe_id?: string
          ingredient_id?: string
          quantity?: number
          unit?: string
          sort_order?: number
        }
        Relationships: []
      }
      // -----------------------------------------------------------------------
      purchase_orders: {
        Row: {
          id: string
          org_id: string
          po_number: string
          supplier: string
          status: PurchaseOrderStatus
          expected_delivery_date: string | null
          total_amount: number | null
          notes: string | null
          qbo_bill_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          po_number: string
          supplier: string
          status?: PurchaseOrderStatus
          expected_delivery_date?: string | null
          total_amount?: number | null
          notes?: string | null
          qbo_bill_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          po_number?: string
          supplier?: string
          status?: PurchaseOrderStatus
          expected_delivery_date?: string | null
          total_amount?: number | null
          notes?: string | null
          qbo_bill_id?: string | null
        }
        Relationships: []
      }
      // -----------------------------------------------------------------------
      purchase_order_lines: {
        Row: {
          id: string
          org_id: string
          po_id: string
          ingredient_id: string
          qty_ordered: number
          qty_received: number
          unit: string
          unit_cost: number
          landed_cost: number | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          po_id: string
          ingredient_id: string
          qty_ordered: number
          qty_received?: number
          unit: string
          unit_cost: number
          landed_cost?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          po_id?: string
          ingredient_id?: string
          qty_ordered?: number
          qty_received?: number
          unit?: string
          unit_cost?: number
          landed_cost?: number | null
        }
        Relationships: []
      }
      // -----------------------------------------------------------------------
      production_runs: {
        Row: {
          id: string
          org_id: string
          recipe_id: string
          recipe_version: number
          run_number: string
          status: ProductionRunStatus
          batch_multiplier: number
          expected_yield: number | null
          actual_yield: number | null
          yield_unit: string | null
          total_cogs: number | null
          cost_per_unit: number | null
          waste_pct: number | null
          notes: string | null
          started_at: string | null
          completed_at: string | null
          qbo_journal_entry_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          recipe_id: string
          recipe_version: number
          run_number: string
          status?: ProductionRunStatus
          batch_multiplier?: number
          expected_yield?: number | null
          actual_yield?: number | null
          yield_unit?: string | null
          total_cogs?: number | null
          cost_per_unit?: number | null
          waste_pct?: number | null
          notes?: string | null
          started_at?: string | null
          completed_at?: string | null
          qbo_journal_entry_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          recipe_id?: string
          recipe_version?: number
          run_number?: string
          status?: ProductionRunStatus
          batch_multiplier?: number
          expected_yield?: number | null
          actual_yield?: number | null
          yield_unit?: string | null
          total_cogs?: number | null
          cost_per_unit?: number | null
          waste_pct?: number | null
          notes?: string | null
          started_at?: string | null
          completed_at?: string | null
          qbo_journal_entry_id?: string | null
        }
        Relationships: []
      }
      // -----------------------------------------------------------------------
      production_run_lots: {
        Row: {
          id: string
          org_id: string
          production_run_id: string
          lot_id: string
          ingredient_id: string
          quantity_used: number
          unit: string
          unit_cost_at_use: number
          line_cost: number
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          production_run_id: string
          lot_id: string
          ingredient_id: string
          quantity_used: number
          unit: string
          unit_cost_at_use: number
          line_cost: number
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          production_run_id?: string
          lot_id?: string
          ingredient_id?: string
          quantity_used?: number
          unit?: string
          unit_cost_at_use?: number
          line_cost?: number
        }
        Relationships: []
      }
      // -----------------------------------------------------------------------
      sales_orders: {
        Row: {
          id: string
          org_id: string
          order_number: string
          customer_name: string
          customer_email: string | null
          status: SalesOrderStatus
          expected_ship_date: string | null
          shipped_at: string | null
          qbo_invoice_id: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          order_number: string
          customer_name: string
          customer_email?: string | null
          status?: SalesOrderStatus
          expected_ship_date?: string | null
          shipped_at?: string | null
          qbo_invoice_id?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          order_number?: string
          customer_name?: string
          customer_email?: string | null
          status?: SalesOrderStatus
          expected_ship_date?: string | null
          shipped_at?: string | null
          qbo_invoice_id?: string | null
          notes?: string | null
        }
        Relationships: []
      }
      // -----------------------------------------------------------------------
      sales_order_lines: {
        Row: {
          id: string
          org_id: string
          sales_order_id: string
          recipe_id: string
          quantity: number
          unit: string
          unit_price: number | null
          lot_numbers_allocated: string[] | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          sales_order_id: string
          recipe_id: string
          quantity: number
          unit?: string
          unit_price?: number | null
          lot_numbers_allocated?: string[] | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          sales_order_id?: string
          recipe_id?: string
          quantity?: number
          unit?: string
          unit_price?: number | null
          lot_numbers_allocated?: string[] | null
        }
        Relationships: []
      }
      // -----------------------------------------------------------------------
      qbo_sync_log: {
        Row: {
          id: string
          org_id: string
          entity_type: QboEntityType
          entity_id: string
          qbo_doc_id: string | null
          status: QboSyncStatus
          error_message: string | null
          retry_count: number
          synced_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          entity_type: QboEntityType
          entity_id: string
          qbo_doc_id?: string | null
          status?: QboSyncStatus
          error_message?: string | null
          retry_count?: number
          synced_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          entity_type?: QboEntityType
          entity_id?: string
          qbo_doc_id?: string | null
          status?: QboSyncStatus
          error_message?: string | null
          retry_count?: number
          synced_at?: string | null
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      current_org_id: {
        Args: Record<string, never>
        Returns: string
      }
    }
    Enums: Record<string, never>
  }
}
