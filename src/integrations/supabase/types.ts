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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      accounting_accounts: {
        Row: {
          balance: number
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          parent_id: string | null
          tenant_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          balance?: number
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          parent_id?: string | null
          tenant_id?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          balance?: number
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          parent_id?: string | null
          tenant_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_log: {
        Row: {
          action: string
          created_at: string
          description: string | null
          entity_id: string
          entity_type: string
          id: string
          metadata: Json | null
          performed_by: string | null
          tenant_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          description?: string | null
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json | null
          performed_by?: string | null
          tenant_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          description?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json | null
          performed_by?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      app_modules: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      currencies: {
        Row: {
          code: string
          created_at: string
          exchange_rate: number
          id: string
          is_active: boolean
          is_base: boolean
          name: string
          symbol: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          exchange_rate?: number
          id?: string
          is_active?: boolean
          is_base?: boolean
          name: string
          symbol?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          exchange_rate?: number
          id?: string
          is_active?: boolean
          is_base?: boolean
          name?: string
          symbol?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "currencies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          balance: number
          created_at: string
          credit_limit: number
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          rfc: string | null
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          balance?: number
          created_at?: string
          credit_limit?: number
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          rfc?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          balance?: number
          created_at?: string
          credit_limit?: number
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          rfc?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          created_at: string
          email: string | null
          hire_date: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          position: string | null
          salary: number | null
          tenant_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          hire_date?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          position?: string | null
          salary?: number | null
          tenant_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          hire_date?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          position?: string | null
          salary?: number | null
          tenant_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          created_at: string
          id: string
          movement_type: string
          new_stock: number
          performed_by: string | null
          previous_stock: number
          product_id: string
          quantity: number
          reason: string | null
          reference_id: string | null
          reference_type: string | null
          tenant_id: string | null
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          movement_type?: string
          new_stock?: number
          performed_by?: string | null
          previous_stock?: number
          product_id: string
          quantity: number
          reason?: string | null
          reference_id?: string | null
          reference_type?: string | null
          tenant_id?: string | null
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          movement_type?: string
          new_stock?: number
          performed_by?: string | null
          previous_stock?: number
          product_id?: string
          quantity?: number
          reason?: string | null
          reference_id?: string | null
          reference_type?: string | null
          tenant_id?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          description: string | null
          entry_number: string
          id: string
          reference_id: string | null
          reference_type: string | null
          status: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string | null
          entry_number: string
          id?: string
          reference_id?: string | null
          reference_type?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string | null
          entry_number?: string
          id?: string
          reference_id?: string | null
          reference_type?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entry_lines: {
        Row: {
          account_id: string
          created_at: string
          credit: number
          debit: number
          description: string | null
          entry_id: string
          id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          entry_id: string
          id?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          entry_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      kitchen_order_items: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          order_id: string
          product_name: string
          quantity: number
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          order_id: string
          product_name: string
          quantity?: number
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string
          product_name?: string
          quantity?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "kitchen_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "kitchen_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      kitchen_orders: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          notes: string | null
          priority: string
          started_at: string | null
          status: string
          table_id: string | null
          table_name: string
          tenant_id: string | null
          updated_at: string
          waiter_name: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          priority?: string
          started_at?: string | null
          status?: string
          table_id?: string | null
          table_name?: string
          tenant_id?: string | null
          updated_at?: string
          waiter_name?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          priority?: string
          started_at?: string | null
          status?: string
          table_id?: string | null
          table_name?: string
          tenant_id?: string | null
          updated_at?: string
          waiter_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kitchen_orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kitchen_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          requires_card_info: boolean
          tenant_id: string | null
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          requires_card_info?: boolean
          tenant_id?: string | null
          type?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          requires_card_info?: boolean
          tenant_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          parent_id: string | null
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          parent_id?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          parent_id?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_recipes: {
        Row: {
          created_at: string
          id: string
          ingredient_id: string
          product_id: string
          quantity: number
          tenant_id: string | null
          unit: string
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_id: string
          product_id: string
          quantity?: number
          tenant_id?: string | null
          unit?: string
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_id?: string
          product_id?: string
          quantity?: number
          tenant_id?: string | null
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_recipes_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_recipes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_recipes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string | null
          cost: number
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          min_stock: number
          name: string
          price: number
          sku: string
          stock: number
          tenant_id: string | null
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          category?: string | null
          cost?: number
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          min_stock?: number
          name: string
          price?: number
          sku: string
          stock?: number
          tenant_id?: string | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          category?: string | null
          cost?: number
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          min_stock?: number
          name?: string
          price?: number
          sku?: string
          stock?: number
          tenant_id?: string | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      restaurant_tables: {
        Row: {
          capacity: number
          created_at: string
          current_order_id: string | null
          id: string
          name: string
          occupied_at: string | null
          position_x: number
          position_y: number
          shape: string
          status: string
          tenant_id: string | null
          updated_at: string
          waiter_id: string | null
        }
        Insert: {
          capacity?: number
          created_at?: string
          current_order_id?: string | null
          id?: string
          name: string
          occupied_at?: string | null
          position_x?: number
          position_y?: number
          shape?: string
          status?: string
          tenant_id?: string | null
          updated_at?: string
          waiter_id?: string | null
        }
        Update: {
          capacity?: number
          created_at?: string
          current_order_id?: string | null
          id?: string
          name?: string
          occupied_at?: string | null
          position_x?: number
          position_y?: number
          shape?: string
          status?: string
          tenant_id?: string | null
          updated_at?: string
          waiter_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_tables_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_tables_waiter_id_fkey"
            columns: ["waiter_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_view: boolean
          created_at: string
          id: string
          module_id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          module_id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          module_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "app_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          created_at: string
          id: string
          price: number
          product_name: string
          qty: number
          sale_id: string
          sku: string | null
          total: number
        }
        Insert: {
          created_at?: string
          id?: string
          price: number
          product_name: string
          qty?: number
          sale_id: string
          sku?: string | null
          total?: number
        }
        Update: {
          created_at?: string
          id?: string
          price?: number
          product_name?: string
          qty?: number
          sale_id?: string
          sku?: string | null
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_payments: {
        Row: {
          amount: number
          amount_in_base: number
          card_description: string | null
          card_holder: string | null
          card_last_four: string | null
          created_at: string
          currency: string
          exchange_rate: number
          id: string
          method: string
          sale_id: string
        }
        Insert: {
          amount: number
          amount_in_base: number
          card_description?: string | null
          card_holder?: string | null
          card_last_four?: string | null
          created_at?: string
          currency?: string
          exchange_rate?: number
          id?: string
          method?: string
          sale_id: string
        }
        Update: {
          amount?: number
          amount_in_base?: number
          card_description?: string | null
          card_holder?: string | null
          card_last_four?: string | null
          created_at?: string
          currency?: string
          exchange_rate?: number
          id?: string
          method?: string
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          amount_paid: number
          created_at: string
          customer_id: string | null
          employee_id: string | null
          id: string
          notes: string | null
          shift_id: string | null
          status: string
          subtotal: number
          tax: number
          tenant_id: string | null
          total: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          created_at?: string
          customer_id?: string | null
          employee_id?: string | null
          id?: string
          notes?: string | null
          shift_id?: string | null
          status?: string
          subtotal?: number
          tax?: number
          tenant_id?: string | null
          total?: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          created_at?: string
          customer_id?: string | null
          employee_id?: string | null
          id?: string
          notes?: string | null
          shift_id?: string | null
          status?: string
          subtotal?: number
          tax?: number
          tenant_id?: string | null
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "sales_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_shifts: {
        Row: {
          closed_at: string | null
          closing_cash: number | null
          created_at: string
          employee_id: string | null
          id: string
          notes: string | null
          opened_at: string
          opening_cash: number
          status: string
          store_id: string | null
          store_name: string
          tenant_id: string | null
          total_sales: number | null
          total_transactions: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          closing_cash?: number | null
          created_at?: string
          employee_id?: string | null
          id?: string
          notes?: string | null
          opened_at?: string
          opening_cash?: number
          status?: string
          store_id?: string | null
          store_name: string
          tenant_id?: string | null
          total_sales?: number | null
          total_transactions?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          closed_at?: string | null
          closing_cash?: number | null
          created_at?: string
          employee_id?: string | null
          id?: string
          notes?: string | null
          opened_at?: string
          opening_cash?: number
          status?: string
          store_id?: string | null
          store_name?: string
          tenant_id?: string | null
          total_sales?: number | null
          total_transactions?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_shifts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_shifts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_shifts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          manager_id: string | null
          name: string
          phone: string | null
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          manager_id?: string | null
          name: string
          phone?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          manager_id?: string | null
          name?: string
          phone?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stores_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stores_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      superadmins: {
        Row: {
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          category: string
          id: string
          key: string
          tenant_id: string | null
          updated_at: string
          value: string | null
        }
        Insert: {
          category?: string
          id?: string
          key: string
          tenant_id?: string | null
          updated_at?: string
          value?: string | null
        }
        Update: {
          category?: string
          id?: string
          key?: string
          tenant_id?: string | null
          updated_at?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_rates: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          rate: number
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          rate?: number
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          rate?: number
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_rates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_users: {
        Row: {
          created_at: string
          id: string
          is_owner: boolean
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_owner?: boolean
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_owner?: boolean
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          address: string | null
          business_type: string
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          phone: string | null
          rfc: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_type?: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          phone?: string | null
          rfc?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_type?: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          phone?: string | null
          rfc?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      warehouses: {
        Row: {
          capacity: number | null
          created_at: string
          id: string
          is_active: boolean
          location: string | null
          name: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          location?: string | null
          name: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          capacity?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          location?: string | null
          name?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_superadmin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "gerente" | "supervisor" | "cajero" | "inventarista"
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
    Enums: {
      app_role: ["admin", "gerente", "supervisor", "cajero", "inventarista"],
    },
  },
} as const
