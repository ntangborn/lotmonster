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
          recipe_id: string | null
          sales_order_id: string
          sku_id: string
          unit: string
          unit_price: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          lot_numbers_allocated?: string[] | null
          org_id: string
          quantity: number
          recipe_id?: string | null
          sales_order_id: string
          sku_id: string
          unit?: string
          unit_price?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          lot_numbers_allocated?: string[] | null
          org_id?: string
          quantity?: number
          recipe_id?: string | null
          sales_order_id?: string
          sku_id?: string
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
      execute_ai_query: {
        Args: { p_function_name: string; p_params: Json }
        Returns: Json
      }
      get_cogs_summary: {
        Args: {
          p_end_date: string
          p_granularity?: string
          p_org_id: string
          p_start_date: string
        }
        Returns: Json
      }
      get_expiring_lots: {
        Args: {
          p_days_ahead?: number
          p_include_expired?: boolean
          p_kind?: string
          p_org_id: string
        }
        Returns: {
          days_until_expiry: number
          expiry_date: string
          ingredient_id: string
          item_name: string
          kind: string
          lot_id: string
          lot_number: string
          quantity_remaining: number
          sku_id: string
          unit: string
        }[]
      }
      get_finished_goods_status: {
        Args: {
          p_only_in_stock?: boolean
          p_org_id: string
          p_sku_name?: string
        }
        Returns: {
          earliest_expiry: string
          fill_quantity: number
          fill_unit: string
          lot_count: number
          on_hand: number
          retail_price: number
          sku_id: string
          sku_name: string
          weighted_avg_unit_cost: number
        }[]
      }
      get_ingredient_cost_history: {
        Args: {
          p_ingredient_name: string
          p_months_back?: number
          p_org_id: string
        }
        Returns: {
          ingredient_name: string
          landed_cost: number
          po_number: string
          quantity_received: number
          received_date: string
          supplier: string
          unit: string
          unit_cost: number
        }[]
      }
      get_inventory_valuation: {
        Args: { p_kind?: string; p_org_id: string; p_top_n?: number }
        Returns: Json
      }
      get_lot_traceability: {
        Args: { p_direction?: string; p_lot_number: string; p_org_id: string }
        Returns: Json
      }
      get_low_stock_ingredients: {
        Args: {
          p_include_no_threshold?: boolean
          p_kind?: string
          p_org_id: string
        }
        Returns: {
          current_stock: number
          default_supplier: string
          ingredient_id: string
          ingredient_name: string
          kind: string
          low_stock_threshold: number
          out_of_stock: boolean
          unit: string
        }[]
      }
      get_production_run_detail: {
        Args: { p_org_id: string; p_run_number: string }
        Returns: Json
      }
      get_recipe_cost_estimate: {
        Args: {
          p_batch_multiplier?: number
          p_org_id: string
          p_recipe_name: string
        }
        Returns: Json
      }
      get_sales_summary: {
        Args: {
          p_end_date: string
          p_org_id: string
          p_sku_name?: string
          p_start_date: string
          p_status?: string
        }
        Returns: Json
      }
      get_supplier_spend: {
        Args: { p_end_date: string; p_org_id: string; p_start_date: string }
        Returns: {
          po_count: number
          supplier: string
          top_ingredient: string
          top_ingredient_spend: number
          total_spend: number
        }[]
      }
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
