export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ingredients: {
        Row: {
          allergens: string[] | null
          bulk_to_unit_factor: number | null
          bulk_unit: string | null
          category: string | null
          cost_per_bulk_unit: number | null
          cost_per_unit: number | null
          created_at: string
          default_supplier: string | null
          id: string
          kind: string
          low_stock_threshold: number | null
          name: string
          notes: string | null
          org_id: string
          sku: string | null
          storage_notes: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          allergens?: string[] | null
          bulk_to_unit_factor?: number | null
          bulk_unit?: string | null
          category?: string | null
          cost_per_bulk_unit?: number | null
          cost_per_unit?: number | null
          created_at?: string
          default_supplier?: string | null
          id?: string
          kind?: string
          low_stock_threshold?: number | null
          name: string
          notes?: string | null
          org_id: string
          sku?: string | null
          storage_notes?: string | null
          unit: string
          updated_at?: string
        }
        Update: {
          allergens?: string[] | null
          bulk_to_unit_factor?: number | null
          bulk_unit?: string | null
          category?: string | null
          cost_per_bulk_unit?: number | null
          cost_per_unit?: number | null
          created_at?: string
          default_supplier?: string | null
          id?: string
          kind?: string
          low_stock_threshold?: number | null
          name?: string
          notes?: string | null
          org_id?: string
          sku?: string | null
          storage_notes?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredients_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      lots: {
        Row: {
          created_at: string
          expiry_date: string | null
          id: string
          ingredient_id: string | null
          lot_number: string
          notes: string | null
          org_id: string
          po_id: string | null
          production_run_id: string | null
          quantity_received: number
          quantity_remaining: number
          received_date: string
          sku_id: string | null
          status: string
          supplier_lot_number: string | null
          unit: string
          unit_cost: number
        }
        Insert: {
          created_at?: string
          expiry_date?: string | null
          id?: string
          ingredient_id?: string | null
          lot_number: string
          notes?: string | null
          org_id: string
          po_id?: string | null
          production_run_id?: string | null
          quantity_received: number
          quantity_remaining: number
          received_date?: string
          sku_id?: string | null
          status?: string
          supplier_lot_number?: string | null
          unit: string
          unit_cost: number
        }
        Update: {
          created_at?: string
          expiry_date?: string | null
          id?: string
          ingredient_id?: string | null
          lot_number?: string
          notes?: string | null
          org_id?: string
          po_id?: string | null
          production_run_id?: string | null
          quantity_received?: number
          quantity_remaining?: number
          received_date?: string
          sku_id?: string | null
          status?: string
          supplier_lot_number?: string | null
          unit?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "lots_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_production_run_id_fkey"
            columns: ["production_run_id"]
            isOneToOne: false
            referencedRelation: "production_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      orgs: {
        Row: {
          created_at: string
          id: string
          name: string
          plan: string
          qbo_ap_account_id: string | null
          qbo_ar_account_id: string | null
          qbo_cogs_account_id: string | null
          qbo_connected_at: string | null
          qbo_default_item_id: string | null
          qbo_environment: string | null
          qbo_income_account_id: string | null
          qbo_inventory_account_id: string | null
          qbo_realm_id: string | null
          qbo_refresh_token_encrypted: string | null
          qbo_refresh_token_expires_at: string | null
          slug: string
          stripe_customer_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          plan?: string
          qbo_ap_account_id?: string | null
          qbo_ar_account_id?: string | null
          qbo_cogs_account_id?: string | null
          qbo_connected_at?: string | null
          qbo_default_item_id?: string | null
          qbo_environment?: string | null
          qbo_income_account_id?: string | null
          qbo_inventory_account_id?: string | null
          qbo_realm_id?: string | null
          qbo_refresh_token_encrypted?: string | null
          qbo_refresh_token_expires_at?: string | null
          slug: string
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          plan?: string
          qbo_ap_account_id?: string | null
          qbo_ar_account_id?: string | null
          qbo_cogs_account_id?: string | null
          qbo_connected_at?: string | null
          qbo_default_item_id?: string | null
          qbo_environment?: string | null
          qbo_income_account_id?: string | null
          qbo_inventory_account_id?: string | null
          qbo_realm_id?: string | null
          qbo_refresh_token_encrypted?: string | null
          qbo_refresh_token_expires_at?: string | null
          slug?: string
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      production_run_lots: {
        Row: {
          created_at: string
          id: string
          ingredient_id: string
          line_cost: number
          lot_id: string
          org_id: string
          production_run_id: string
          quantity_used: number
          unit: string
          unit_cost_at_use: number
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_id: string
          line_cost: number
          lot_id: string
          org_id: string
          production_run_id: string
          quantity_used: number
          unit: string
          unit_cost_at_use: number
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_id?: string
          line_cost?: number
          lot_id?: string
          org_id?: string
          production_run_id?: string
          quantity_used?: number
          unit?: string
          unit_cost_at_use?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_run_lots_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_run_lots_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_run_lots_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_run_lots_production_run_id_fkey"
            columns: ["production_run_id"]
            isOneToOne: false
            referencedRelation: "production_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      production_run_outputs: {
        Row: {
          allocated_cogs_liquid: number
          allocated_cogs_packaging: number
          allocated_cogs_total: number
          cost_allocation_pct: number
          created_at: string
          id: string
          lot_id: string
          org_id: string
          override_note: string | null
          production_run_id: string
          quantity: number
          sku_id: string
          unit_cogs: number
        }
        Insert: {
          allocated_cogs_liquid: number
          allocated_cogs_packaging: number
          allocated_cogs_total: number
          cost_allocation_pct: number
          created_at?: string
          id?: string
          lot_id: string
          org_id: string
          override_note?: string | null
          production_run_id: string
          quantity: number
          sku_id: string
          unit_cogs: number
        }
        Update: {
          allocated_cogs_liquid?: number
          allocated_cogs_packaging?: number
          allocated_cogs_total?: number
          cost_allocation_pct?: number
          created_at?: string
          id?: string
          lot_id?: string
          org_id?: string
          override_note?: string | null
          production_run_id?: string
          quantity?: number
          sku_id?: string
          unit_cogs?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_run_outputs_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_run_outputs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_run_outputs_production_run_id_fkey"
            columns: ["production_run_id"]
            isOneToOne: false
            referencedRelation: "production_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_run_outputs_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id"]
          },
        ]
      }
      production_runs: {
        Row: {
          actual_yield: number | null
          batch_multiplier: number
          completed_at: string | null
          cost_per_unit: number | null
          created_at: string
          expected_yield: number | null
          id: string
          notes: string | null
          org_id: string
          qbo_journal_entry_id: string | null
          recipe_id: string
          recipe_version: number
          run_number: string
          started_at: string | null
          status: string
          total_cogs: number | null
          waste_pct: number | null
          yield_unit: string | null
        }
        Insert: {
          actual_yield?: number | null
          batch_multiplier?: number
          completed_at?: string | null
          cost_per_unit?: number | null
          created_at?: string
          expected_yield?: number | null
          id?: string
          notes?: string | null
          org_id: string
          qbo_journal_entry_id?: string | null
          recipe_id: string
          recipe_version: number
          run_number: string
          started_at?: string | null
          status?: string
          total_cogs?: number | null
          waste_pct?: number | null
          yield_unit?: string | null
        }
        Update: {
          actual_yield?: number | null
          batch_multiplier?: number
          completed_at?: string | null
          cost_per_unit?: number | null
          created_at?: string
          expected_yield?: number | null
          id?: string
          notes?: string | null
          org_id?: string
          qbo_journal_entry_id?: string | null
          recipe_id?: string
          recipe_version?: number
          run_number?: string
          started_at?: string | null
          status?: string
          total_cogs?: number | null
          waste_pct?: number | null
          yield_unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_runs_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_lines: {
        Row: {
          created_at: string
          id: string
          ingredient_id: string
          landed_cost: number | null
          org_id: string
          po_id: string
          qty_ordered: number
          qty_received: number
          unit: string
          unit_cost: number
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_id: string
          landed_cost?: number | null
          org_id: string
          po_id: string
          qty_ordered: number
          qty_received?: number
          unit: string
          unit_cost: number
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_id?: string
          landed_cost?: number | null
          org_id?: string
          po_id?: string
          qty_ordered?: number
          qty_received?: number
          unit?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_lines_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          expected_delivery_date: string | null
          id: string
          notes: string | null
          org_id: string
          po_number: string
          qbo_bill_id: string | null
          status: string
          supplier: string
          total_amount: number | null
        }
        Insert: {
          created_at?: string
          expected_delivery_date?: string | null
          id?: string
          notes?: string | null
          org_id: string
          po_number: string
          qbo_bill_id?: string | null
          status?: string
          supplier: string
          total_amount?: number | null
        }
        Update: {
          created_at?: string
          expected_delivery_date?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          po_number?: string
          qbo_bill_id?: string | null
          status?: string
          supplier?: string
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      qbo_sync_log: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          error_message: string | null
          id: string
          org_id: string
          qbo_doc_id: string | null
          retry_count: number
          status: string
          synced_at: string | null
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          error_message?: string | null
          id?: string
          org_id: string
          qbo_doc_id?: string | null
          retry_count?: number
          status?: string
          synced_at?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          error_message?: string | null
          id?: string
          org_id?: string
          qbo_doc_id?: string | null
          retry_count?: number
          status?: string
          synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qbo_sync_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_lines: {
        Row: {
          created_at: string
          id: string
          ingredient_id: string
          org_id: string
          quantity: number
          recipe_id: string
          sort_order: number
          unit: string
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_id: string
          org_id: string
          quantity: number
          recipe_id: string
          sort_order?: number
          unit: string
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_id?: string
          org_id?: string
          quantity?: number
          recipe_id?: string
          sort_order?: number
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_lines_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_lines_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_lines_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          org_id: string
          target_yield: number
          target_yield_unit: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          org_id: string
          target_yield: number
          target_yield_unit: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          org_id?: string
          target_yield?: number
          target_yield_unit?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "recipes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_lines: {
        Row: {
          created_at: string
          id: string
          lot_numbers_allocated: string[] | null
          org_id: string
          quantity: number
          recipe_id: string
          sales_order_id: string
          sku_id: string | null
          unit: string
          unit_price: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          lot_numbers_allocated?: string[] | null
          org_id: string
          quantity: number
          recipe_id: string
          sales_order_id: string
          sku_id?: string | null
          unit?: string
          unit_price?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          lot_numbers_allocated?: string[] | null
          org_id?: string
          quantity?: number
          recipe_id?: string
          sales_order_id?: string
          sku_id?: string | null
          unit?: string
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_lines_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_lines_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_lines_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_lines_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          created_at: string
          customer_email: string | null
          customer_name: string
          expected_ship_date: string | null
          id: string
          notes: string | null
          order_number: string
          org_id: string
          qbo_invoice_id: string | null
          shipped_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          customer_email?: string | null
          customer_name: string
          expected_ship_date?: string | null
          id?: string
          notes?: string | null
          order_number: string
          org_id: string
          qbo_invoice_id?: string | null
          shipped_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          customer_email?: string | null
          customer_name?: string
          expected_ship_date?: string | null
          id?: string
          notes?: string | null
          order_number?: string
          org_id?: string
          qbo_invoice_id?: string | null
          shipped_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      sku_packaging: {
        Row: {
          created_at: string
          id: string
          ingredient_id: string
          notes: string | null
          org_id: string
          quantity: number
          sku_id: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_id: string
          notes?: string | null
          org_id: string
          quantity: number
          sku_id: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_id?: string
          notes?: string | null
          org_id?: string
          quantity?: number
          sku_id?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sku_packaging_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sku_packaging_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sku_packaging_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id"]
          },
        ]
      }
      skus: {
        Row: {
          active: boolean
          created_at: string
          fill_quantity: number | null
          fill_unit: string | null
          id: string
          kind: string
          lot_prefix: string | null
          name: string
          notes: string | null
          org_id: string
          parent_sku_id: string | null
          qbo_item_id: string | null
          recipe_id: string | null
          retail_price: number | null
          shelf_life_days: number | null
          units_per_parent: number | null
          upc: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          fill_quantity?: number | null
          fill_unit?: string | null
          id?: string
          kind: string
          lot_prefix?: string | null
          name: string
          notes?: string | null
          org_id: string
          parent_sku_id?: string | null
          qbo_item_id?: string | null
          recipe_id?: string | null
          retail_price?: number | null
          shelf_life_days?: number | null
          units_per_parent?: number | null
          upc?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          fill_quantity?: number | null
          fill_unit?: string | null
          id?: string
          kind?: string
          lot_prefix?: string | null
          name?: string
          notes?: string | null
          org_id?: string
          parent_sku_id?: string | null
          qbo_item_id?: string | null
          recipe_id?: string | null
          retail_price?: number | null
          shelf_life_days?: number | null
          units_per_parent?: number | null
          upc?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "skus_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skus_parent_sku_id_fkey"
            columns: ["parent_sku_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skus_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_org_id: { Args: never; Returns: string }
      ensure_org_for_user: { Args: { p_user_id: string }; Returns: string }
      slugify: { Args: { input: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
