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
      account_payments: {
        Row: {
          amount: number
          amount_in_base: number
          created_at: string
          currency: string
          direction: string
          exchange_rate: number
          id: string
          method: string
          notes: string | null
          party_id: string
          party_type: string
          performed_by: string | null
          reference_id: string | null
          reference_type: string | null
          tenant_id: string
        }
        Insert: {
          amount: number
          amount_in_base: number
          created_at?: string
          currency?: string
          direction: string
          exchange_rate?: number
          id?: string
          method?: string
          notes?: string | null
          party_id: string
          party_type: string
          performed_by?: string | null
          reference_id?: string | null
          reference_type?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number
          amount_in_base?: number
          created_at?: string
          currency?: string
          direction?: string
          exchange_rate?: number
          id?: string
          method?: string
          notes?: string | null
          party_id?: string
          party_type?: string
          performed_by?: string | null
          reference_id?: string | null
          reference_type?: string | null
          tenant_id?: string
        }
        Relationships: []
      }
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
      coupon_redemptions: {
        Row: {
          coupon_id: string
          created_at: string
          customer_id: string | null
          discount_applied: number
          id: string
          sale_id: string | null
          tenant_id: string
        }
        Insert: {
          coupon_id: string
          created_at?: string
          customer_id?: string | null
          discount_applied?: number
          id?: string
          sale_id?: string | null
          tenant_id: string
        }
        Update: {
          coupon_id?: string
          created_at?: string
          customer_id?: string | null
          discount_applied?: number
          id?: string
          sale_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          description: string | null
          discount_type: string
          discount_value: number
          id: string
          is_active: boolean
          max_uses: number | null
          max_uses_per_customer: number | null
          min_amount: number
          tenant_id: string
          updated_at: string
          uses_count: number
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          max_uses_per_customer?: number | null
          min_amount?: number
          tenant_id: string
          updated_at?: string
          uses_count?: number
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          max_uses_per_customer?: number | null
          min_amount?: number
          tenant_id?: string
          updated_at?: string
          uses_count?: number
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupons_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          loyalty_points: number
          loyalty_tier: string
          name: string
          notes: string | null
          phone: string | null
          rfc: string | null
          tenant_id: string | null
          total_spent: number
          updated_at: string
          visits_count: number
        }
        Insert: {
          address?: string | null
          balance?: number
          created_at?: string
          credit_limit?: number
          email?: string | null
          id?: string
          loyalty_points?: number
          loyalty_tier?: string
          name: string
          notes?: string | null
          phone?: string | null
          rfc?: string | null
          tenant_id?: string | null
          total_spent?: number
          updated_at?: string
          visits_count?: number
        }
        Update: {
          address?: string | null
          balance?: number
          created_at?: string
          credit_limit?: number
          email?: string | null
          id?: string
          loyalty_points?: number
          loyalty_tier?: string
          name?: string
          notes?: string | null
          phone?: string | null
          rfc?: string | null
          tenant_id?: string | null
          total_spent?: number
          updated_at?: string
          visits_count?: number
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
      delivery_assignments: {
        Row: {
          assigned_at: string
          delivered_at: string | null
          id: string
          notes: string | null
          online_order_id: string
          picked_up_at: string | null
          rider_id: string | null
          status: string
          tenant_id: string
          zone_id: string | null
        }
        Insert: {
          assigned_at?: string
          delivered_at?: string | null
          id?: string
          notes?: string | null
          online_order_id: string
          picked_up_at?: string | null
          rider_id?: string | null
          status?: string
          tenant_id: string
          zone_id?: string | null
        }
        Update: {
          assigned_at?: string
          delivered_at?: string | null
          id?: string
          notes?: string | null
          online_order_id?: string
          picked_up_at?: string | null
          rider_id?: string | null
          status?: string
          tenant_id?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_assignments_online_order_id_fkey"
            columns: ["online_order_id"]
            isOneToOne: false
            referencedRelation: "online_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_assignments_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "delivery_riders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_assignments_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "delivery_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_riders: {
        Row: {
          created_at: string
          employee_id: string | null
          id: string
          is_active: boolean
          is_available: boolean
          name: string
          phone: string | null
          tenant_id: string
          vehicle: string | null
        }
        Insert: {
          created_at?: string
          employee_id?: string | null
          id?: string
          is_active?: boolean
          is_available?: boolean
          name: string
          phone?: string | null
          tenant_id: string
          vehicle?: string | null
        }
        Update: {
          created_at?: string
          employee_id?: string | null
          id?: string
          is_active?: boolean
          is_available?: boolean
          name?: string
          phone?: string | null
          tenant_id?: string
          vehicle?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_riders_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_riders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_zones: {
        Row: {
          created_at: string
          estimated_minutes: number
          fee: number
          id: string
          is_active: boolean
          name: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          estimated_minutes?: number
          fee?: number
          id?: string
          is_active?: boolean
          name: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          estimated_minutes?: number
          fee?: number
          id?: string
          is_active?: boolean
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_zones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_attendance: {
        Row: {
          check_in: string
          check_out: string | null
          created_at: string
          employee_id: string
          hours_worked: number | null
          id: string
          notes: string | null
          tenant_id: string
        }
        Insert: {
          check_in?: string
          check_out?: string | null
          created_at?: string
          employee_id: string
          hours_worked?: number | null
          id?: string
          notes?: string | null
          tenant_id: string
        }
        Update: {
          check_in?: string
          check_out?: string | null
          created_at?: string
          employee_id?: string
          hours_worked?: number | null
          id?: string
          notes?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_attendance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_attendance_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          balance: number
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
          balance?: number
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
          balance?: number
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
          location_id: string | null
          location_type: string | null
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
          location_id?: string | null
          location_type?: string | null
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
          location_id?: string | null
          location_type?: string | null
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
      invoice_series: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          next_number: number
          prefix: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          next_number?: number
          prefix?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          next_number?: number
          prefix?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_series_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_reason: string | null
          created_at: string
          created_by: string | null
          currency: string
          customer_address: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          customer_tax_id: string | null
          email_sent_at: string | null
          email_sent_to: string | null
          id: string
          invoice_number: string
          issue_date: string
          issuer_address: string | null
          issuer_email: string | null
          issuer_name: string
          issuer_phone: string | null
          issuer_tax_id: string | null
          items: Json
          notes: string | null
          pdf_url: string | null
          sale_id: string | null
          series_code: string
          status: string
          subtotal: number
          tax: number
          tenant_id: string
          total: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_address?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name: string
          customer_phone?: string | null
          customer_tax_id?: string | null
          email_sent_at?: string | null
          email_sent_to?: string | null
          id?: string
          invoice_number: string
          issue_date?: string
          issuer_address?: string | null
          issuer_email?: string | null
          issuer_name: string
          issuer_phone?: string | null
          issuer_tax_id?: string | null
          items?: Json
          notes?: string | null
          pdf_url?: string | null
          sale_id?: string | null
          series_code: string
          status?: string
          subtotal?: number
          tax?: number
          tenant_id: string
          total?: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_address?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          customer_tax_id?: string | null
          email_sent_at?: string | null
          email_sent_to?: string | null
          id?: string
          invoice_number?: string
          issue_date?: string
          issuer_address?: string | null
          issuer_email?: string | null
          issuer_name?: string
          issuer_phone?: string | null
          issuer_tax_id?: string | null
          items?: Json
          notes?: string | null
          pdf_url?: string | null
          sale_id?: string | null
          series_code?: string
          status?: string
          subtotal?: number
          tax?: number
          tenant_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
      loyalty_movements: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          movement_type: string
          notes: string | null
          performed_by: string | null
          points: number
          reference_id: string | null
          reference_type: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          movement_type: string
          notes?: string | null
          performed_by?: string | null
          points: number
          reference_id?: string | null
          reference_type?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          movement_type?: string
          notes?: string | null
          performed_by?: string | null
          points?: number
          reference_id?: string | null
          reference_type?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_settings: {
        Row: {
          created_at: string
          enabled: boolean
          gold_threshold: number
          id: string
          platinum_threshold: number
          points_per_unit: number
          silver_threshold: number
          tenant_id: string
          updated_at: string
          value_per_point: number
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          gold_threshold?: number
          id?: string
          platinum_threshold?: number
          points_per_unit?: number
          silver_threshold?: number
          tenant_id: string
          updated_at?: string
          value_per_point?: number
        }
        Update: {
          created_at?: string
          enabled?: boolean
          gold_threshold?: number
          id?: string
          platinum_threshold?: number
          points_per_unit?: number
          silver_threshold?: number
          tenant_id?: string
          updated_at?: string
          value_per_point?: number
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          category: string
          created_at: string
          id: string
          message: string | null
          metadata: Json | null
          read_at: string | null
          severity: string
          tenant_id: string
          title: string
          user_id: string | null
        }
        Insert: {
          action_url?: string | null
          category: string
          created_at?: string
          id?: string
          message?: string | null
          metadata?: Json | null
          read_at?: string | null
          severity?: string
          tenant_id: string
          title: string
          user_id?: string | null
        }
        Update: {
          action_url?: string | null
          category?: string
          created_at?: string
          id?: string
          message?: string | null
          metadata?: Json | null
          read_at?: string | null
          severity?: string
          tenant_id?: string
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      online_order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          price: number
          product_id: string | null
          product_name: string
          qty: number
          total: number
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          price?: number
          product_id?: string | null
          product_name: string
          qty?: number
          total?: number
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          price?: number
          product_id?: string | null
          product_name?: string
          qty?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "online_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "online_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      online_orders: {
        Row: {
          created_at: string
          customer_email: string | null
          customer_name: string
          customer_phone: string
          delivery_address: string | null
          delivery_type: string
          id: string
          notes: string | null
          status: string
          subtotal: number
          tax: number
          tenant_id: string | null
          total: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          customer_email?: string | null
          customer_name: string
          customer_phone: string
          delivery_address?: string | null
          delivery_type?: string
          id?: string
          notes?: string | null
          status?: string
          subtotal?: number
          tax?: number
          tenant_id?: string | null
          total?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string
          delivery_address?: string | null
          delivery_type?: string
          id?: string
          notes?: string | null
          status?: string
          subtotal?: number
          tax?: number
          tenant_id?: string | null
          total?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "online_orders_tenant_id_fkey"
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
      payroll_runs: {
        Row: {
          base_salary: number
          bonus: number
          created_at: string
          deductions: number
          employee_id: string
          hours_worked: number
          id: string
          net_pay: number
          notes: string | null
          paid_at: string | null
          period_end: string
          period_start: string
          status: string
          tenant_id: string
        }
        Insert: {
          base_salary?: number
          bonus?: number
          created_at?: string
          deductions?: number
          employee_id: string
          hours_worked?: number
          id?: string
          net_pay?: number
          notes?: string | null
          paid_at?: string | null
          period_end: string
          period_start: string
          status?: string
          tenant_id: string
        }
        Update: {
          base_salary?: number
          bonus?: number
          created_at?: string
          deductions?: number
          employee_id?: string
          hours_worked?: number
          id?: string
          net_pay?: number
          notes?: string | null
          paid_at?: string | null
          period_end?: string
          period_start?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_runs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_tenant_id_fkey"
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
      product_stock: {
        Row: {
          created_at: string
          id: string
          location_id: string
          location_type: string
          min_stock: number
          product_id: string
          reserved: number
          stock: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_id: string
          location_type: string
          min_stock?: number
          product_id: string
          reserved?: number
          stock?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string
          location_type?: string
          min_stock?: number
          product_id?: string
          reserved?: number
          stock?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          category: string | null
          cost: number
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          is_online: boolean
          min_stock: number
          name: string
          online_stock: number
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
          image_url?: string | null
          is_active?: boolean
          is_online?: boolean
          min_stock?: number
          name: string
          online_stock?: number
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
          image_url?: string | null
          is_active?: boolean
          is_online?: boolean
          min_stock?: number
          name?: string
          online_stock?: number
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
      promotions: {
        Row: {
          created_at: string
          description: string | null
          discount_value: number
          id: string
          is_active: boolean
          min_qty: number
          name: string
          promo_type: string
          scope: string
          scope_id: string | null
          scope_value: string | null
          tenant_id: string
          updated_at: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          discount_value?: number
          id?: string
          is_active?: boolean
          min_qty?: number
          name: string
          promo_type?: string
          scope?: string
          scope_id?: string | null
          scope_value?: string | null
          tenant_id: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          discount_value?: number
          id?: string
          is_active?: boolean
          min_qty?: number
          name?: string
          promo_type?: string
          scope?: string
          scope_id?: string | null
          scope_value?: string | null
          tenant_id?: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promotions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_items: {
        Row: {
          cost: number
          created_at: string
          id: string
          product_id: string | null
          product_name: string
          purchase_id: string
          qty: number
          qty_received: number
          sku: string | null
          total: number
        }
        Insert: {
          cost?: number
          created_at?: string
          id?: string
          product_id?: string | null
          product_name: string
          purchase_id: string
          qty?: number
          qty_received?: number
          sku?: string | null
          total?: number
        }
        Update: {
          cost?: number
          created_at?: string
          id?: string
          product_id?: string | null
          product_name?: string
          purchase_id?: string
          qty?: number
          qty_received?: number
          sku?: string | null
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          amount_paid: number
          created_at: string
          created_by: string | null
          destination_id: string | null
          destination_type: string
          id: string
          invoice_number: string | null
          notes: string | null
          purchase_number: string | null
          received_at: string | null
          received_by: string | null
          status: string
          subtotal: number
          supplier_id: string | null
          tax: number
          tenant_id: string | null
          total: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          created_at?: string
          created_by?: string | null
          destination_id?: string | null
          destination_type?: string
          id?: string
          invoice_number?: string | null
          notes?: string | null
          purchase_number?: string | null
          received_at?: string | null
          received_by?: string | null
          status?: string
          subtotal?: number
          supplier_id?: string | null
          tax?: number
          tenant_id?: string | null
          total?: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          created_at?: string
          created_by?: string | null
          destination_id?: string | null
          destination_type?: string
          id?: string
          invoice_number?: string | null
          notes?: string | null
          purchase_number?: string | null
          received_at?: string | null
          received_by?: string | null
          status?: string
          subtotal?: number
          supplier_id?: string | null
          tax?: number
          tenant_id?: string | null
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
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
          notes: string | null
          price: number
          product_id: string | null
          product_name: string
          qty: number
          sale_id: string
          sku: string | null
          total: number
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          price: number
          product_id?: string | null
          product_name: string
          qty?: number
          sale_id: string
          sku?: string | null
          total?: number
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          price?: number
          product_id?: string | null
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
      sale_return_items: {
        Row: {
          created_at: string
          id: string
          price: number
          product_id: string | null
          product_name: string
          qty: number
          return_id: string
          sale_item_id: string | null
          total: number
        }
        Insert: {
          created_at?: string
          id?: string
          price?: number
          product_id?: string | null
          product_name: string
          qty: number
          return_id: string
          sale_item_id?: string | null
          total?: number
        }
        Update: {
          created_at?: string
          id?: string
          price?: number
          product_id?: string | null
          product_name?: string
          qty?: number
          return_id?: string
          sale_item_id?: string | null
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "sale_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_returns: {
        Row: {
          created_at: string
          id: string
          performed_by: string | null
          reason: string | null
          refund_method: string
          restock: boolean
          return_number: string | null
          sale_id: string | null
          status: string
          tenant_id: string | null
          total: number
        }
        Insert: {
          created_at?: string
          id?: string
          performed_by?: string | null
          reason?: string | null
          refund_method?: string
          restock?: boolean
          return_number?: string | null
          sale_id?: string | null
          status?: string
          tenant_id?: string | null
          total?: number
        }
        Update: {
          created_at?: string
          id?: string
          performed_by?: string | null
          reason?: string | null
          refund_method?: string
          restock?: boolean
          return_number?: string | null
          sale_id?: string | null
          status?: string
          tenant_id?: string | null
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_returns_sale_id_fkey"
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
          store_id: string | null
          subtotal: number
          tax: number
          tenant_id: string | null
          ticket_number: string | null
          ticket_series: string | null
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
          store_id?: string | null
          subtotal?: number
          tax?: number
          tenant_id?: string | null
          ticket_number?: string | null
          ticket_series?: string | null
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
          store_id?: string | null
          subtotal?: number
          tax?: number
          tenant_id?: string | null
          ticket_number?: string | null
          ticket_series?: string | null
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
          cash_difference: number | null
          cash_in_total: number | null
          cash_out_total: number | null
          closed_at: string | null
          closing_cash: number | null
          created_at: string
          declared_cash: number | null
          employee_id: string | null
          expected_cash: number | null
          id: string
          notes: string | null
          opened_at: string
          opening_cash: number
          returns_total: number | null
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
          cash_difference?: number | null
          cash_in_total?: number | null
          cash_out_total?: number | null
          closed_at?: string | null
          closing_cash?: number | null
          created_at?: string
          declared_cash?: number | null
          employee_id?: string | null
          expected_cash?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opening_cash?: number
          returns_total?: number | null
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
          cash_difference?: number | null
          cash_in_total?: number | null
          cash_out_total?: number | null
          closed_at?: string | null
          closing_cash?: number | null
          created_at?: string
          declared_cash?: number | null
          employee_id?: string | null
          expected_cash?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opening_cash?: number
          returns_total?: number | null
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
      shift_cash_movements: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          movement_type: string
          performed_by: string | null
          reason: string | null
          shift_id: string
          tenant_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          movement_type: string
          performed_by?: string | null
          reason?: string | null
          shift_id: string
          tenant_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          movement_type?: string
          performed_by?: string | null
          reason?: string | null
          shift_id?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_cash_movements_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "sales_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfer_items: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          product_id: string
          product_name: string
          quantity_received: number
          quantity_requested: number
          quantity_shipped: number
          sku: string | null
          transfer_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          product_id: string
          product_name: string
          quantity_received?: number
          quantity_requested?: number
          quantity_shipped?: number
          sku?: string | null
          transfer_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          product_id?: string
          product_name?: string
          quantity_received?: number
          quantity_requested?: number
          quantity_shipped?: number
          sku?: string | null
          transfer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfer_items_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "stock_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfers: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          cancelled_at: string | null
          created_at: string
          destination_id: string
          destination_type: string
          id: string
          notes: string | null
          origin_id: string
          origin_type: string
          received_at: string | null
          received_by: string | null
          requested_at: string
          requested_by: string | null
          shipped_at: string | null
          shipped_by: string | null
          status: string
          tenant_id: string
          transfer_number: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          cancelled_at?: string | null
          created_at?: string
          destination_id: string
          destination_type: string
          id?: string
          notes?: string | null
          origin_id: string
          origin_type: string
          received_at?: string | null
          received_by?: string | null
          requested_at?: string
          requested_by?: string | null
          shipped_at?: string | null
          shipped_by?: string | null
          status?: string
          tenant_id: string
          transfer_number: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          cancelled_at?: string | null
          created_at?: string
          destination_id?: string
          destination_type?: string
          id?: string
          notes?: string | null
          origin_id?: string
          origin_type?: string
          received_at?: string | null
          received_by?: string | null
          requested_at?: string
          requested_by?: string | null
          shipped_at?: string | null
          shipped_by?: string | null
          status?: string
          tenant_id?: string
          transfer_number?: string
          updated_at?: string
        }
        Relationships: []
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
      suppliers: {
        Row: {
          address: string | null
          balance: number
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
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
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
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
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          rfc?: string | null
          tenant_id?: string | null
          updated_at?: string
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
      ticket_counters: {
        Row: {
          last_number: number
          series: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          last_number?: number
          series?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          last_number?: number
          series?: string
          tenant_id?: string
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
      work_schedules: {
        Row: {
          created_at: string
          day_of_week: number
          employee_id: string
          end_time: string
          id: string
          is_active: boolean
          start_time: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          employee_id: string
          end_time: string
          id?: string
          is_active?: boolean
          start_time: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          employee_id?: string
          end_time?: string
          id?: string
          is_active?: boolean
          start_time?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_schedules_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_schedules_tenant_id_fkey"
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
      apply_coupon_to_sale: {
        Args: { p_coupon_id: string; p_discount: number; p_sale_id: string }
        Returns: undefined
      }
      award_loyalty_points: { Args: { p_sale_id: string }; Returns: number }
      calculate_shift_summary: { Args: { p_shift_id: string }; Returns: Json }
      close_shift_with_summary: {
        Args: { p_declared_cash: number; p_notes?: string; p_shift_id: string }
        Returns: Json
      }
      compute_payroll: {
        Args: { _employee_id: string; _end: string; _start: string }
        Returns: {
          base: number
          hours_worked: number
        }[]
      }
      create_notification: {
        Args: {
          p_action_url?: string
          p_category: string
          p_message?: string
          p_metadata?: Json
          p_severity?: string
          p_tenant_id: string
          p_title: string
          p_user_id?: string
        }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_superadmin: { Args: { _user_id: string }; Returns: boolean }
      issue_invoice: {
        Args: { p_sale_id: string; p_series_code?: string }
        Returns: string
      }
      process_sale_return: {
        Args: {
          p_location_id: string
          p_location_type: string
          p_return_id: string
        }
        Returns: undefined
      }
      process_sale_stock: {
        Args: {
          p_location_id: string
          p_location_type: string
          p_sale_id: string
        }
        Returns: undefined
      }
      receive_purchase: { Args: { p_purchase_id: string }; Returns: undefined }
      receive_stock_transfer: {
        Args: { p_transfer_id: string }
        Returns: undefined
      }
      redeem_loyalty_points: {
        Args: { p_customer_id: string; p_points: number; p_sale_id?: string }
        Returns: number
      }
      register_account_payment: {
        Args: {
          p_amount: number
          p_currency?: string
          p_exchange_rate?: number
          p_method?: string
          p_notes?: string
          p_party_id: string
          p_party_type: string
          p_reference_id?: string
          p_reference_type?: string
        }
        Returns: string
      }
      revert_sale_stock: { Args: { p_sale_id: string }; Returns: undefined }
      validate_coupon: {
        Args: {
          p_amount: number
          p_code: string
          p_customer_id?: string
          p_tenant_id: string
        }
        Returns: Json
      }
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
