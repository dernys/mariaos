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
          client_uuid: string | null
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
          client_uuid?: string | null
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
          client_uuid?: string | null
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
          account_subtype: string | null
          allows_manual_entry: boolean
          balance: number
          code: string
          control_role: string | null
          created_at: string
          currency: string | null
          description: string | null
          id: string
          is_active: boolean
          is_control_account: boolean
          is_postable: boolean
          is_system: boolean
          level: number
          name: string
          nature: string
          parent_id: string | null
          plan_template: string | null
          requires_reconciliation: boolean
          statement_section: string | null
          tax_category: string | null
          tenant_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          account_subtype?: string | null
          allows_manual_entry?: boolean
          balance?: number
          code: string
          control_role?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_control_account?: boolean
          is_postable?: boolean
          is_system?: boolean
          level?: number
          name: string
          nature?: string
          parent_id?: string | null
          plan_template?: string | null
          requires_reconciliation?: boolean
          statement_section?: string | null
          tax_category?: string | null
          tenant_id?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          account_subtype?: string | null
          allows_manual_entry?: boolean
          balance?: number
          code?: string
          control_role?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_control_account?: boolean
          is_postable?: boolean
          is_system?: boolean
          level?: number
          name?: string
          nature?: string
          parent_id?: string | null
          plan_template?: string | null
          requires_reconciliation?: boolean
          statement_section?: string | null
          tax_category?: string | null
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
            foreignKeyName: "accounting_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "trial_balance_view"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "accounting_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_mappings: {
        Row: {
          account_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          mapping_key: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          mapping_key: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          mapping_key?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_mappings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_mappings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "trial_balance_view"
            referencedColumns: ["account_id"]
          },
        ]
      }
      accounting_periods: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          end_date: string
          fiscal_year_id: string
          id: string
          name: string
          period_number: number
          start_date: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          end_date: string
          fiscal_year_id: string
          id?: string
          name: string
          period_number: number
          start_date: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          end_date?: string
          fiscal_year_id?: string
          id?: string
          name?: string
          period_number?: number
          start_date?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_periods_fiscal_year_id_fkey"
            columns: ["fiscal_year_id"]
            isOneToOne: false
            referencedRelation: "fiscal_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_periods_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_periods_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_profiles: {
        Row: {
          active: boolean
          base_currency: string
          code: string
          costing_method: string
          country_code: string
          created_at: string
          description: string | null
          fiscal_calendar: Json
          functional_currency: string
          name: string
          regime: string
          regulatory_exports: Json
        }
        Insert: {
          active?: boolean
          base_currency?: string
          code: string
          costing_method?: string
          country_code: string
          created_at?: string
          description?: string | null
          fiscal_calendar?: Json
          functional_currency?: string
          name: string
          regime: string
          regulatory_exports?: Json
        }
        Update: {
          active?: boolean
          base_currency?: string
          code?: string
          costing_method?: string
          country_code?: string
          created_at?: string
          description?: string | null
          fiscal_calendar?: Json
          functional_currency?: string
          name?: string
          regime?: string
          regulatory_exports?: Json
        }
        Relationships: []
      }
      accounts_payable: {
        Row: {
          amount: number
          amount_in_base: number | null
          amount_paid: number
          amount_paid_in_base: number
          created_at: string
          currency: string
          description: string
          due_date: string | null
          exchange_rate: number
          id: string
          notes: string | null
          party_id: string
          party_type: string
          source_id: string | null
          source_type: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          amount_in_base?: number | null
          amount_paid?: number
          amount_paid_in_base?: number
          created_at?: string
          currency?: string
          description: string
          due_date?: string | null
          exchange_rate?: number
          id?: string
          notes?: string | null
          party_id: string
          party_type: string
          source_id?: string | null
          source_type: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          amount_in_base?: number | null
          amount_paid?: number
          amount_paid_in_base?: number
          created_at?: string
          currency?: string
          description?: string
          due_date?: string | null
          exchange_rate?: number
          id?: string
          notes?: string | null
          party_id?: string
          party_type?: string
          source_id?: string | null
          source_type?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_payable_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_payable_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
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
          {
            foreignKeyName: "activity_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_actions: {
        Row: {
          action_type: string
          agent_id: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          executed_at: string | null
          id: string
          payload: Json
          requires_approval: boolean
          result: Json | null
          status: Database["public"]["Enums"]["action_status"]
          target_entity_id: string | null
          target_entity_type: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          action_type: string
          agent_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          executed_at?: string | null
          id?: string
          payload?: Json
          requires_approval?: boolean
          result?: Json | null
          status?: Database["public"]["Enums"]["action_status"]
          target_entity_id?: string | null
          target_entity_type?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          agent_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          executed_at?: string | null
          id?: string
          payload?: Json
          requires_approval?: boolean
          result?: Json | null
          status?: Database["public"]["Enums"]["action_status"]
          target_entity_id?: string | null
          target_entity_type?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_actions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agents: {
        Row: {
          autonomy_level: Database["public"]["Enums"]["autonomy_level"]
          config: Json
          created_at: string
          description: string | null
          id: string
          last_run_at: string | null
          metrics: Json
          name: string
          status: Database["public"]["Enums"]["agent_status"]
          tenant_id: string
          type: Database["public"]["Enums"]["agent_type"]
          updated_at: string
        }
        Insert: {
          autonomy_level?: Database["public"]["Enums"]["autonomy_level"]
          config?: Json
          created_at?: string
          description?: string | null
          id?: string
          last_run_at?: string | null
          metrics?: Json
          name: string
          status?: Database["public"]["Enums"]["agent_status"]
          tenant_id: string
          type: Database["public"]["Enums"]["agent_type"]
          updated_at?: string
        }
        Update: {
          autonomy_level?: Database["public"]["Enums"]["autonomy_level"]
          config?: Json
          created_at?: string
          description?: string | null
          id?: string
          last_run_at?: string | null
          metrics?: Json
          name?: string
          status?: Database["public"]["Enums"]["agent_status"]
          tenant_id?: string
          type?: Database["public"]["Enums"]["agent_type"]
          updated_at?: string
        }
        Relationships: []
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
      bank_accounts: {
        Row: {
          account_number: string | null
          accounting_account_id: string | null
          bank_name: string | null
          created_at: string
          currency: string
          current_balance: number
          id: string
          is_active: boolean
          name: string
          notes: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          accounting_account_id?: string | null
          bank_name?: string | null
          created_at?: string
          currency?: string
          current_balance?: number
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          accounting_account_id?: string | null
          bank_name?: string | null
          created_at?: string
          currency?: string
          current_balance?: number
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_accounting_account_id_fkey"
            columns: ["accounting_account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_accounting_account_id_fkey"
            columns: ["accounting_account_id"]
            isOneToOne: false
            referencedRelation: "trial_balance_view"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "bank_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_reconciliations: {
        Row: {
          bank_account_id: string
          bank_balance: number
          book_balance: number
          closed_at: string | null
          closed_by: string | null
          created_at: string
          difference: number
          id: string
          notes: string | null
          period_end: string
          period_start: string
          status: string
          tenant_id: string
        }
        Insert: {
          bank_account_id: string
          bank_balance?: number
          book_balance?: number
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          difference?: number
          id?: string
          notes?: string | null
          period_end: string
          period_start: string
          status?: string
          tenant_id: string
        }
        Update: {
          bank_account_id?: string
          bank_balance?: number
          book_balance?: number
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          difference?: number
          id?: string
          notes?: string | null
          period_end?: string
          period_start?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_reconciliations_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_reconciliations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_reconciliations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_statements: {
        Row: {
          bank_account_id: string
          closing_balance: number
          created_at: string
          file_name: string | null
          id: string
          imported_by: string | null
          opening_balance: number
          statement_date: string
          tenant_id: string
        }
        Insert: {
          bank_account_id: string
          closing_balance?: number
          created_at?: string
          file_name?: string | null
          id?: string
          imported_by?: string | null
          opening_balance?: number
          statement_date: string
          tenant_id: string
        }
        Update: {
          bank_account_id?: string
          closing_balance?: number
          created_at?: string
          file_name?: string | null
          id?: string
          imported_by?: string | null
          opening_balance?: number
          statement_date?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_statements_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          amount: number
          balance_after: number | null
          bank_account_id: string
          created_at: string
          description: string | null
          direction: string
          id: string
          matched_at: string | null
          matched_by: string | null
          matched_payment_id: string | null
          reference: string | null
          statement_id: string | null
          status: string
          tenant_id: string
          transaction_date: string
        }
        Insert: {
          amount: number
          balance_after?: number | null
          bank_account_id: string
          created_at?: string
          description?: string | null
          direction: string
          id?: string
          matched_at?: string | null
          matched_by?: string | null
          matched_payment_id?: string | null
          reference?: string | null
          statement_id?: string | null
          status?: string
          tenant_id: string
          transaction_date: string
        }
        Update: {
          amount?: number
          balance_after?: number | null
          bank_account_id?: string
          created_at?: string
          description?: string | null
          direction?: string
          id?: string
          matched_at?: string | null
          matched_by?: string | null
          matched_payment_id?: string | null
          reference?: string | null
          statement_id?: string | null
          status?: string
          tenant_id?: string
          transaction_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_matched_payment_id_fkey"
            columns: ["matched_payment_id"]
            isOneToOne: false
            referencedRelation: "account_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "bank_statements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      br_esocial_events: {
        Row: {
          accepted_at: string | null
          created_at: string
          created_by: string | null
          employee_id: string | null
          esocial_response: Json
          event_code: string
          id: string
          protocol: string | null
          receipt: string | null
          reference_period: string | null
          reject_reason: string | null
          rejected_at: string | null
          sent_at: string | null
          status: string
          tenant_id: string
          updated_at: string
          xml_payload: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          employee_id?: string | null
          esocial_response?: Json
          event_code: string
          id?: string
          protocol?: string | null
          receipt?: string | null
          reference_period?: string | null
          reject_reason?: string | null
          rejected_at?: string | null
          sent_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          xml_payload?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          employee_id?: string | null
          esocial_response?: Json
          event_code?: string
          id?: string
          protocol?: string | null
          receipt?: string | null
          reference_period?: string | null
          reject_reason?: string | null
          rejected_at?: string | null
          sent_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          xml_payload?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "br_esocial_events_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      br_nfe_documents: {
        Row: {
          authorized_at: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          chave_acesso: string | null
          cnpj_recipient: string | null
          cofins_amount: number
          created_at: string
          created_by: string | null
          danfe_url: string | null
          emitted_at: string | null
          ibge_municipio_recipient: string | null
          icms_amount: number
          id: string
          invoice_id: string | null
          ipi_amount: number
          iss_amount: number
          model: string
          number: number | null
          pis_amount: number
          protocolo_autorizacao: string | null
          sale_id: string | null
          sefaz_response: Json
          series: string
          status: string
          tenant_id: string
          total: number
          uf_emitter: string
          uf_recipient: string | null
          updated_at: string
          xml_payload: string | null
        }
        Insert: {
          authorized_at?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          chave_acesso?: string | null
          cnpj_recipient?: string | null
          cofins_amount?: number
          created_at?: string
          created_by?: string | null
          danfe_url?: string | null
          emitted_at?: string | null
          ibge_municipio_recipient?: string | null
          icms_amount?: number
          id?: string
          invoice_id?: string | null
          ipi_amount?: number
          iss_amount?: number
          model?: string
          number?: number | null
          pis_amount?: number
          protocolo_autorizacao?: string | null
          sale_id?: string | null
          sefaz_response?: Json
          series?: string
          status?: string
          tenant_id: string
          total?: number
          uf_emitter: string
          uf_recipient?: string | null
          updated_at?: string
          xml_payload?: string | null
        }
        Update: {
          authorized_at?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          chave_acesso?: string | null
          cnpj_recipient?: string | null
          cofins_amount?: number
          created_at?: string
          created_by?: string | null
          danfe_url?: string | null
          emitted_at?: string | null
          ibge_municipio_recipient?: string | null
          icms_amount?: number
          id?: string
          invoice_id?: string | null
          ipi_amount?: number
          iss_amount?: number
          model?: string
          number?: number | null
          pis_amount?: number
          protocolo_autorizacao?: string | null
          sale_id?: string | null
          sefaz_response?: Json
          series?: string
          status?: string
          tenant_id?: string
          total?: number
          uf_emitter?: string
          uf_recipient?: string | null
          updated_at?: string
          xml_payload?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "br_nfe_documents_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "br_nfe_documents_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "br_nfe_documents_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_ar_aging"
            referencedColumns: ["sale_id"]
          },
        ]
      }
      br_sped_exports: {
        Row: {
          created_at: string
          created_by: string | null
          file_hash: string | null
          file_url: string | null
          fiscal_year: number
          generated_at: string | null
          id: string
          layout: string
          payload: Json
          period_end: string
          period_start: string
          status: string
          tenant_id: string
          total_records: number
          transmitted_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_hash?: string | null
          file_url?: string | null
          fiscal_year: number
          generated_at?: string | null
          id?: string
          layout: string
          payload?: Json
          period_end: string
          period_start: string
          status?: string
          tenant_id: string
          total_records?: number
          transmitted_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_hash?: string | null
          file_url?: string | null
          fiscal_year?: number
          generated_at?: string | null
          id?: string
          layout?: string
          payload?: Json
          period_end?: string
          period_start?: string
          status?: string
          tenant_id?: string
          total_records?: number
          transmitted_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      br_tax_jurisdictions: {
        Row: {
          created_at: string
          effective_from: string
          effective_to: string | null
          ibge_municipio: string | null
          id: string
          kind: string
          notes: string | null
          rate: number
          reduction_pct: number
          service_code: string | null
          tenant_id: string | null
          uf_from: string | null
          uf_to: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          ibge_municipio?: string | null
          id?: string
          kind: string
          notes?: string | null
          rate?: number
          reduction_pct?: number
          service_code?: string | null
          tenant_id?: string | null
          uf_from?: string | null
          uf_to?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          ibge_municipio?: string | null
          id?: string
          kind?: string
          notes?: string | null
          rate?: number
          reduction_pct?: number
          service_code?: string | null
          tenant_id?: string | null
          uf_from?: string | null
          uf_to?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      budget_lines: {
        Row: {
          account_id: string
          amount: number
          budget_id: string
          cost_center_id: string | null
          created_at: string
          id: string
          notes: string | null
          period_month: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          account_id: string
          amount?: number
          budget_id: string
          cost_center_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          period_month: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          amount?: number
          budget_id?: string
          cost_center_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          period_month?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "trial_balance_view"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "budget_lines_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_lines_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          period_type: string
          status: string
          tenant_id: string
          updated_at: string
          year: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          period_type?: string
          status?: string
          tenant_id: string
          updated_at?: string
          year: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          period_type?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "budgets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      business_decisions: {
        Row: {
          agent_id: string | null
          context: Json
          created_at: string
          effectiveness_score: number | null
          id: string
          outcome: Json | null
          reasoning: string | null
          recommendation: Json
          status: Database["public"]["Enums"]["action_status"]
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          context?: Json
          created_at?: string
          effectiveness_score?: number | null
          id?: string
          outcome?: Json | null
          reasoning?: string | null
          recommendation?: Json
          status?: Database["public"]["Enums"]["action_status"]
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          context?: Json
          created_at?: string
          effectiveness_score?: number | null
          id?: string
          outcome?: Json | null
          reasoning?: string | null
          recommendation?: Json
          status?: Database["public"]["Enums"]["action_status"]
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_decisions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      business_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          payload: Json
          processed: boolean
          source: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          processed?: boolean
          source: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          processed?: boolean
          source?: string
          tenant_id?: string
        }
        Relationships: []
      }
      business_memory: {
        Row: {
          created_at: string
          details: Json
          id: string
          source_decision_id: string | null
          summary: string
          tenant_id: string
          topic: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          details?: Json
          id?: string
          source_decision_id?: string | null
          summary: string
          tenant_id: string
          topic: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          details?: Json
          id?: string
          source_decision_id?: string | null
          summary?: string
          tenant_id?: string
          topic?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_memory_source_decision_id_fkey"
            columns: ["source_decision_id"]
            isOneToOne: false
            referencedRelation: "business_decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_account_templates: {
        Row: {
          code: string
          id: string
          is_header: boolean
          name: string
          nature: string
          parent_code: string | null
          profile_code: string
          sort_order: number
          type: string
        }
        Insert: {
          code: string
          id?: string
          is_header?: boolean
          name: string
          nature: string
          parent_code?: string | null
          profile_code: string
          sort_order?: number
          type: string
        }
        Update: {
          code?: string
          id?: string
          is_header?: boolean
          name?: string
          nature?: string
          parent_code?: string | null
          profile_code?: string
          sort_order?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_account_templates_profile_code_fkey"
            columns: ["profile_code"]
            isOneToOne: false
            referencedRelation: "accounting_profiles"
            referencedColumns: ["code"]
          },
        ]
      }
      checklist_runs: {
        Row: {
          checklist_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          id: string
          location_id: string
          location_type: string
          notes: string | null
          responses: Json
          score: number | null
          started_by: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          checklist_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          location_id: string
          location_type: string
          notes?: string | null
          responses?: Json
          score?: number | null
          started_by?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          checklist_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          location_id?: string
          location_type?: string
          notes?: string | null
          responses?: Json
          score?: number | null
          started_by?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_runs_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "operational_checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      combo_items: {
        Row: {
          child_product_id: string
          combo_product_id: string
          created_at: string
          id: string
          is_optional: boolean
          note: string | null
          quantity: number
          tenant_id: string
        }
        Insert: {
          child_product_id: string
          combo_product_id: string
          created_at?: string
          id?: string
          is_optional?: boolean
          note?: string | null
          quantity?: number
          tenant_id: string
        }
        Update: {
          child_product_id?: string
          combo_product_id?: string
          created_at?: string
          id?: string
          is_optional?: boolean
          note?: string | null
          quantity?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "combo_items_child_product_id_fkey"
            columns: ["child_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "combo_items_child_product_id_fkey"
            columns: ["child_product_id"]
            isOneToOne: false
            referencedRelation: "v_replenishment_suggestions"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "combo_items_combo_product_id_fkey"
            columns: ["combo_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "combo_items_combo_product_id_fkey"
            columns: ["combo_product_id"]
            isOneToOne: false
            referencedRelation: "v_replenishment_suggestions"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "combo_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "combo_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      consignment_lots: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          location_id: string
          location_type: string
          notes: string | null
          product_id: string
          purchase_id: string | null
          quantity_received: number
          quantity_remaining: number | null
          quantity_returned: number
          quantity_sold: number
          received_at: string
          status: string
          supplier_id: string
          tenant_id: string
          unit_cost: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          location_id: string
          location_type: string
          notes?: string | null
          product_id: string
          purchase_id?: string | null
          quantity_received?: number
          quantity_remaining?: number | null
          quantity_returned?: number
          quantity_sold?: number
          received_at?: string
          status?: string
          supplier_id: string
          tenant_id: string
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          location_id?: string
          location_type?: string
          notes?: string | null
          product_id?: string
          purchase_id?: string | null
          quantity_received?: number
          quantity_remaining?: number | null
          quantity_returned?: number
          quantity_sold?: number
          received_at?: string
          status?: string
          supplier_id?: string
          tenant_id?: string
          unit_cost?: number
          updated_at?: string
        }
        Relationships: []
      }
      consignment_settlements: {
        Row: {
          created_at: string
          id: string
          lot_id: string
          payment_id: string | null
          performed_by: string | null
          quantity: number
          sale_id: string | null
          settled_at: string | null
          status: string
          supplier_id: string
          tenant_id: string
          total: number
          unit_cost: number
        }
        Insert: {
          created_at?: string
          id?: string
          lot_id: string
          payment_id?: string | null
          performed_by?: string | null
          quantity: number
          sale_id?: string | null
          settled_at?: string | null
          status?: string
          supplier_id: string
          tenant_id: string
          total: number
          unit_cost: number
        }
        Update: {
          created_at?: string
          id?: string
          lot_id?: string
          payment_id?: string | null
          performed_by?: string | null
          quantity?: number
          sale_id?: string | null
          settled_at?: string | null
          status?: string
          supplier_id?: string
          tenant_id?: string
          total?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "consignment_settlements_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "consignment_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_centers: {
        Row: {
          code: string
          created_at: string
          department: string | null
          id: string
          is_active: boolean
          manager_employee_id: string | null
          name: string
          notes: string | null
          parent_id: string | null
          store_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          department?: string | null
          id?: string
          is_active?: boolean
          manager_employee_id?: string | null
          name: string
          notes?: string | null
          parent_id?: string | null
          store_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          department?: string | null
          id?: string
          is_active?: boolean
          manager_employee_id?: string | null
          name?: string
          notes?: string | null
          parent_id?: string | null
          store_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_centers_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_centers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_centers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "coupon_redemptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
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
          {
            foreignKeyName: "coupons_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      cu_cost_sheet_items: {
        Row: {
          category: string
          cost_sheet_id: string
          created_at: string
          description: string
          id: string
          product_id: string | null
          quantity: number
          tenant_id: string
          total: number
          unit: string | null
          unit_cost: number
          updated_at: string
        }
        Insert: {
          category: string
          cost_sheet_id: string
          created_at?: string
          description: string
          id?: string
          product_id?: string | null
          quantity?: number
          tenant_id: string
          total?: number
          unit?: string | null
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          category?: string
          cost_sheet_id?: string
          created_at?: string
          description?: string
          id?: string
          product_id?: string | null
          quantity?: number
          tenant_id?: string
          total?: number
          unit?: string | null
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cu_cost_sheet_items_cost_sheet_id_fkey"
            columns: ["cost_sheet_id"]
            isOneToOne: false
            referencedRelation: "cu_cost_sheets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cu_cost_sheet_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cu_cost_sheet_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_replenishment_suggestions"
            referencedColumns: ["product_id"]
          },
        ]
      }
      cu_cost_sheets: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          id: string
          indirect_cost: number
          is_active: boolean
          labor_cost: number
          margin_pct: number
          name: string
          notes: string | null
          other_cost: number
          packaging_cost: number
          product_id: string | null
          raw_materials_cost: number
          suggested_price: number
          tenant_id: string
          unit_cost: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          indirect_cost?: number
          is_active?: boolean
          labor_cost?: number
          margin_pct?: number
          name: string
          notes?: string | null
          other_cost?: number
          packaging_cost?: number
          product_id?: string | null
          raw_materials_cost?: number
          suggested_price?: number
          tenant_id: string
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          indirect_cost?: number
          is_active?: boolean
          labor_cost?: number
          margin_pct?: number
          name?: string
          notes?: string | null
          other_cost?: number
          packaging_cost?: number
          product_id?: string | null
          raw_materials_cost?: number
          suggested_price?: number
          tenant_id?: string
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cu_cost_sheets_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cu_cost_sheets_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_replenishment_suggestions"
            referencedColumns: ["product_id"]
          },
        ]
      }
      cu_tax_declarations: {
        Row: {
          created_at: string
          created_by: string | null
          declaration_type: string
          deductible_expenses: number
          file_url: string | null
          fiscal_year: number
          id: string
          notes: string | null
          paid_at: string | null
          payload: Json
          period_id: string | null
          period_label: string
          status: string
          submitted_at: string | null
          tax_due: number
          tax_rate: number
          taxable_base: number
          tenant_id: string
          total_expenses: number
          total_income: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          declaration_type: string
          deductible_expenses?: number
          file_url?: string | null
          fiscal_year: number
          id?: string
          notes?: string | null
          paid_at?: string | null
          payload?: Json
          period_id?: string | null
          period_label: string
          status?: string
          submitted_at?: string | null
          tax_due?: number
          tax_rate?: number
          taxable_base?: number
          tenant_id: string
          total_expenses?: number
          total_income?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          declaration_type?: string
          deductible_expenses?: number
          file_url?: string | null
          fiscal_year?: number
          id?: string
          notes?: string | null
          paid_at?: string | null
          payload?: Json
          period_id?: string | null
          period_label?: string
          status?: string
          submitted_at?: string | null
          tax_due?: number
          tax_rate?: number
          taxable_base?: number
          tenant_id?: string
          total_expenses?: number
          total_income?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cu_tax_declarations_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "accounting_periods"
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
          {
            foreignKeyName: "currencies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_addresses: {
        Row: {
          address: string
          created_at: string
          id: string
          instructions: string | null
          is_default: boolean
          label: string
          latitude: number | null
          longitude: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address: string
          created_at?: string
          id?: string
          instructions?: string | null
          is_default?: boolean
          label?: string
          latitude?: number | null
          longitude?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string
          created_at?: string
          id?: string
          instructions?: string | null
          is_default?: boolean
          label?: string
          latitude?: number | null
          longitude?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          balance: number
          client_uuid: string | null
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
          user_id: string | null
          visits_count: number
        }
        Insert: {
          address?: string | null
          balance?: number
          client_uuid?: string | null
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
          user_id?: string | null
          visits_count?: number
        }
        Update: {
          address?: string | null
          balance?: number
          client_uuid?: string | null
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
          user_id?: string | null
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
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_assignments: {
        Row: {
          accepted_at: string | null
          actual_minutes: number | null
          assigned_at: string
          cancel_reason: string | null
          cancelled_at: string | null
          delivered_at: string | null
          dropoff_address: string | null
          dropoff_lat: number | null
          dropoff_lng: number | null
          estimated_minutes: number | null
          id: string
          instructions: string | null
          notes: string | null
          online_order_id: string
          picked_up_at: string | null
          pickup_address: string | null
          pickup_lat: number | null
          pickup_lng: number | null
          recommendation_reasons: Json | null
          recommendation_score: number | null
          rejected_at: string | null
          requested_at: string | null
          rider_id: string | null
          rider_profile_id: string | null
          status: string
          tenant_id: string
          zone_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          actual_minutes?: number | null
          assigned_at?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          delivered_at?: string | null
          dropoff_address?: string | null
          dropoff_lat?: number | null
          dropoff_lng?: number | null
          estimated_minutes?: number | null
          id?: string
          instructions?: string | null
          notes?: string | null
          online_order_id: string
          picked_up_at?: string | null
          pickup_address?: string | null
          pickup_lat?: number | null
          pickup_lng?: number | null
          recommendation_reasons?: Json | null
          recommendation_score?: number | null
          rejected_at?: string | null
          requested_at?: string | null
          rider_id?: string | null
          rider_profile_id?: string | null
          status?: string
          tenant_id: string
          zone_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          actual_minutes?: number | null
          assigned_at?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          delivered_at?: string | null
          dropoff_address?: string | null
          dropoff_lat?: number | null
          dropoff_lng?: number | null
          estimated_minutes?: number | null
          id?: string
          instructions?: string | null
          notes?: string | null
          online_order_id?: string
          picked_up_at?: string | null
          pickup_address?: string | null
          pickup_lat?: number | null
          pickup_lng?: number | null
          recommendation_reasons?: Json | null
          recommendation_score?: number | null
          rejected_at?: string | null
          requested_at?: string | null
          rider_id?: string | null
          rider_profile_id?: string | null
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
            foreignKeyName: "delivery_assignments_rider_profile_id_fkey"
            columns: ["rider_profile_id"]
            isOneToOne: false
            referencedRelation: "rider_profiles"
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
            foreignKeyName: "delivery_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
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
      delivery_commissions: {
        Row: {
          assignment_id: string | null
          base_amount: number
          commission_amount: number
          commission_pct: number
          created_at: string
          currency: string
          id: string
          online_order_id: string | null
          paid_at: string | null
          rider_id: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          assignment_id?: string | null
          base_amount?: number
          commission_amount?: number
          commission_pct?: number
          created_at?: string
          currency?: string
          id?: string
          online_order_id?: string | null
          paid_at?: string | null
          rider_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          assignment_id?: string | null
          base_amount?: number
          commission_amount?: number
          commission_pct?: number
          created_at?: string
          currency?: string
          id?: string
          online_order_id?: string | null
          paid_at?: string | null
          rider_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_commissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "delivery_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_commissions_online_order_id_fkey"
            columns: ["online_order_id"]
            isOneToOne: false
            referencedRelation: "online_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_commissions_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "delivery_riders"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_ratings: {
        Row: {
          assignment_id: string | null
          comment: string | null
          created_at: string
          criteria: Json
          id: string
          online_order_id: string | null
          ratee_role: string
          rater_role: string
          rater_user_id: string | null
          rider_profile_id: string | null
          stars: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          assignment_id?: string | null
          comment?: string | null
          created_at?: string
          criteria?: Json
          id?: string
          online_order_id?: string | null
          ratee_role: string
          rater_role: string
          rater_user_id?: string | null
          rider_profile_id?: string | null
          stars: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          assignment_id?: string | null
          comment?: string | null
          created_at?: string
          criteria?: Json
          id?: string
          online_order_id?: string | null
          ratee_role?: string
          rater_role?: string
          rater_user_id?: string | null
          rider_profile_id?: string | null
          stars?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_ratings_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "delivery_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_ratings_online_order_id_fkey"
            columns: ["online_order_id"]
            isOneToOne: false
            referencedRelation: "online_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_ratings_rider_profile_id_fkey"
            columns: ["rider_profile_id"]
            isOneToOne: false
            referencedRelation: "rider_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_riders: {
        Row: {
          avatar_url: string | null
          created_at: string
          document_id: string | null
          employee_id: string | null
          id: string
          insurance_expiry: string | null
          insurance_policy: string | null
          insurance_provider: string | null
          is_active: boolean
          is_available: boolean
          license_expiry: string | null
          license_number: string | null
          name: string
          notes: string | null
          phone: string | null
          rating: number
          tenant_id: string
          tier: string
          total_deliveries: number
          user_id: string | null
          vehicle: string | null
          vehicle_brand: string | null
          vehicle_model: string | null
          vehicle_plate: string | null
          vehicle_year: number | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          document_id?: string | null
          employee_id?: string | null
          id?: string
          insurance_expiry?: string | null
          insurance_policy?: string | null
          insurance_provider?: string | null
          is_active?: boolean
          is_available?: boolean
          license_expiry?: string | null
          license_number?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          rating?: number
          tenant_id: string
          tier?: string
          total_deliveries?: number
          user_id?: string | null
          vehicle?: string | null
          vehicle_brand?: string | null
          vehicle_model?: string | null
          vehicle_plate?: string | null
          vehicle_year?: number | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          document_id?: string | null
          employee_id?: string | null
          id?: string
          insurance_expiry?: string | null
          insurance_policy?: string | null
          insurance_provider?: string | null
          is_active?: boolean
          is_available?: boolean
          license_expiry?: string | null
          license_number?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          rating?: number
          tenant_id?: string
          tier?: string
          total_deliveries?: number
          user_id?: string | null
          vehicle?: string | null
          vehicle_brand?: string | null
          vehicle_model?: string | null
          vehicle_plate?: string | null
          vehicle_year?: number | null
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
          {
            foreignKeyName: "delivery_riders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
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
          {
            foreignKeyName: "delivery_zones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_events: {
        Row: {
          aggregate_id: string | null
          aggregate_type: string
          correlation_id: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json
          occurred_at: string
          operation_id: string | null
          payload: Json
          shadow: boolean
          source: string
          tenant_id: string | null
          version: number
        }
        Insert: {
          aggregate_id?: string | null
          aggregate_type: string
          correlation_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          occurred_at?: string
          operation_id?: string | null
          payload?: Json
          shadow?: boolean
          source?: string
          tenant_id?: string | null
          version?: number
        }
        Update: {
          aggregate_id?: string | null
          aggregate_type?: string
          correlation_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          operation_id?: string | null
          payload?: Json
          shadow?: boolean
          source?: string
          tenant_id?: string | null
          version?: number
        }
        Relationships: []
      }
      driver_locations: {
        Row: {
          accuracy: number | null
          assignment_id: string | null
          battery: number | null
          created_at: string
          heading: number | null
          id: string
          latitude: number
          longitude: number
          recorded_at: string
          rider_id: string
          speed: number | null
          tenant_id: string
        }
        Insert: {
          accuracy?: number | null
          assignment_id?: string | null
          battery?: number | null
          created_at?: string
          heading?: number | null
          id?: string
          latitude: number
          longitude: number
          recorded_at?: string
          rider_id: string
          speed?: number | null
          tenant_id: string
        }
        Update: {
          accuracy?: number | null
          assignment_id?: string | null
          battery?: number | null
          created_at?: string
          heading?: number | null
          id?: string
          latitude?: number
          longitude?: number
          recorded_at?: string
          rider_id?: string
          speed?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_locations_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "delivery_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_locations_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "delivery_riders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      einvoice_settings: {
        Row: {
          auto_transmit: boolean
          certificate_url: string | null
          created_at: string
          id: string
          legal_name: string | null
          legal_tax_id: string | null
          mode: string
          provider: string | null
          signature_key: string | null
          tax_regime: string | null
          tenant_id: string
          test_mode: boolean
          updated_at: string
          webhook_secret: string | null
          webhook_url: string | null
        }
        Insert: {
          auto_transmit?: boolean
          certificate_url?: string | null
          created_at?: string
          id?: string
          legal_name?: string | null
          legal_tax_id?: string | null
          mode?: string
          provider?: string | null
          signature_key?: string | null
          tax_regime?: string | null
          tenant_id: string
          test_mode?: boolean
          updated_at?: string
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Update: {
          auto_transmit?: boolean
          certificate_url?: string | null
          created_at?: string
          id?: string
          legal_name?: string | null
          legal_tax_id?: string | null
          mode?: string
          provider?: string | null
          signature_key?: string | null
          tax_regime?: string | null
          tenant_id?: string
          test_mode?: boolean
          updated_at?: string
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      employee_attendance: {
        Row: {
          check_in: string
          check_in_lat: number | null
          check_in_lng: number | null
          check_in_photo: string | null
          check_out: string | null
          check_out_lat: number | null
          check_out_lng: number | null
          check_out_photo: string | null
          created_at: string
          employee_id: string
          hours_worked: number | null
          id: string
          notes: string | null
          source: string
          status: string
          store_id: string | null
          tenant_id: string
        }
        Insert: {
          check_in?: string
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_in_photo?: string | null
          check_out?: string | null
          check_out_lat?: number | null
          check_out_lng?: number | null
          check_out_photo?: string | null
          created_at?: string
          employee_id: string
          hours_worked?: number | null
          id?: string
          notes?: string | null
          source?: string
          status?: string
          store_id?: string | null
          tenant_id: string
        }
        Update: {
          check_in?: string
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_in_photo?: string | null
          check_out?: string | null
          check_out_lat?: number | null
          check_out_lng?: number | null
          check_out_photo?: string | null
          created_at?: string
          employee_id?: string
          hours_worked?: number | null
          id?: string
          notes?: string | null
          source?: string
          status?: string
          store_id?: string | null
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
            foreignKeyName: "employee_attendance_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_attendance_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_attendance_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_attendance_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_contracts: {
        Row: {
          base_salary: number
          clauses: string | null
          contract_type: string
          created_at: string
          document_url: string | null
          employee_id: string
          end_date: string | null
          id: string
          probation_end_date: string | null
          signed_at: string | null
          start_date: string
          status: string
          tenant_id: string
          updated_at: string
          weekly_hours: number
        }
        Insert: {
          base_salary?: number
          clauses?: string | null
          contract_type?: string
          created_at?: string
          document_url?: string | null
          employee_id: string
          end_date?: string | null
          id?: string
          probation_end_date?: string | null
          signed_at?: string | null
          start_date: string
          status?: string
          tenant_id: string
          updated_at?: string
          weekly_hours?: number
        }
        Update: {
          base_salary?: number
          clauses?: string | null
          contract_type?: string
          created_at?: string
          document_url?: string | null
          employee_id?: string
          end_date?: string | null
          id?: string
          probation_end_date?: string | null
          signed_at?: string | null
          start_date?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          weekly_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "employee_contracts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_contracts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_contracts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_documents: {
        Row: {
          created_at: string
          doc_type: string
          employee_id: string
          expires_at: string | null
          file_size: number | null
          file_url: string
          id: string
          mime_type: string | null
          name: string
          tenant_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          doc_type: string
          employee_id: string
          expires_at?: string | null
          file_size?: number | null
          file_url: string
          id?: string
          mime_type?: string | null
          name: string
          tenant_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          doc_type?: string
          employee_id?: string
          expires_at?: string | null
          file_size?: number | null
          file_url?: string
          id?: string
          mime_type?: string | null
          name?: string
          tenant_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          access_pin_hash: string | null
          address: string | null
          balance: number
          bank_name: string | null
          birth_date: string | null
          city: string | null
          country: string | null
          created_at: string
          credit_limit: number
          department: string | null
          document_id: string | null
          document_type: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          hire_date: string | null
          iban: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          photo_url: string | null
          position: string | null
          position_id: string | null
          salary: number | null
          social_security_number: string | null
          store_id: string | null
          tax_id: string | null
          tenant_id: string | null
          termination_date: string | null
          updated_at: string
          user_id: string | null
          vacation_days_per_year: number
        }
        Insert: {
          access_pin_hash?: string | null
          address?: string | null
          balance?: number
          bank_name?: string | null
          birth_date?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          credit_limit?: number
          department?: string | null
          document_id?: string | null
          document_type?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          hire_date?: string | null
          iban?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          position?: string | null
          position_id?: string | null
          salary?: number | null
          social_security_number?: string | null
          store_id?: string | null
          tax_id?: string | null
          tenant_id?: string | null
          termination_date?: string | null
          updated_at?: string
          user_id?: string | null
          vacation_days_per_year?: number
        }
        Update: {
          access_pin_hash?: string | null
          address?: string | null
          balance?: number
          bank_name?: string | null
          birth_date?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          credit_limit?: number
          department?: string | null
          document_id?: string | null
          document_type?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          hire_date?: string | null
          iban?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          position?: string | null
          position_id?: string | null
          salary?: number | null
          social_security_number?: string | null
          store_id?: string | null
          tax_id?: string | null
          tenant_id?: string | null
          termination_date?: string | null
          updated_at?: string
          user_id?: string | null
          vacation_days_per_year?: number
        }
        Relationships: [
          {
            foreignKeyName: "employees_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "job_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rates_history: {
        Row: {
          created_at: string
          currency_code: string
          effective_from: string
          id: string
          rate: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          currency_code: string
          effective_from: string
          id?: string
          rate: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          currency_code?: string
          effective_from?: string
          id?: string
          rate?: number
          tenant_id?: string
        }
        Relationships: []
      }
      financial_events: {
        Row: {
          amount: number
          amount_in_base: number
          created_at: string
          created_by: string | null
          currency: string
          error: string | null
          event_date: string
          event_type: string
          exchange_rate: number
          id: string
          payload: Json
          posted_at: string | null
          posted_journal_id: string | null
          source_id: string
          source_table: string
          status: string
          tenant_id: string
        }
        Insert: {
          amount?: number
          amount_in_base?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          error?: string | null
          event_date?: string
          event_type: string
          exchange_rate?: number
          id?: string
          payload?: Json
          posted_at?: string | null
          posted_journal_id?: string | null
          source_id: string
          source_table: string
          status?: string
          tenant_id: string
        }
        Update: {
          amount?: number
          amount_in_base?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          error?: string | null
          event_date?: string
          event_type?: string
          exchange_rate?: number
          id?: string
          payload?: Json
          posted_at?: string | null
          posted_journal_id?: string | null
          source_id?: string
          source_table?: string
          status?: string
          tenant_id?: string
        }
        Relationships: []
      }
      fiscal_rules: {
        Row: {
          applies_to: string
          base: string
          code: string
          config: Json
          country_code: string
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          rate: number
          rule_type: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          applies_to?: string
          base?: string
          code: string
          config?: Json
          country_code: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          rate?: number
          rule_type: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          applies_to?: string
          base?: string
          code?: string
          config?: Json
          country_code?: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          rate?: number
          rule_type?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_years: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          end_date: string
          id: string
          is_current: boolean
          name: string
          start_date: string
          status: string
          tenant_id: string
          updated_at: string
          year: number
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          end_date: string
          id?: string
          is_current?: boolean
          name: string
          start_date: string
          status?: string
          tenant_id: string
          updated_at?: string
          year: number
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          end_date?: string
          id?: string
          is_current?: boolean
          name?: string
          start_date?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_years_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_years_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      general_ledger: {
        Row: {
          account_id: string
          closing_balance: number
          created_at: string
          credit_total: number
          currency: string
          debit_total: number
          id: string
          opening_balance: number
          period_id: string
          rebuilt_at: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          account_id: string
          closing_balance?: number
          created_at?: string
          credit_total?: number
          currency?: string
          debit_total?: number
          id?: string
          opening_balance?: number
          period_id: string
          rebuilt_at?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          closing_balance?: number
          created_at?: string
          credit_total?: number
          currency?: string
          debit_total?: number
          id?: string
          opening_balance?: number
          period_id?: string
          rebuilt_at?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "general_ledger_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "general_ledger_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "trial_balance_view"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "general_ledger_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "accounting_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movement_history: {
        Row: {
          changed_by: string | null
          created_at: string
          field: string
          id: string
          movement_id: string
          new_value: string | null
          old_value: string | null
          tenant_id: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          field: string
          id?: string
          movement_id: string
          new_value?: string | null
          old_value?: string | null
          tenant_id: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          field?: string
          id?: string
          movement_id?: string
          new_value?: string | null
          old_value?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movement_history_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          client_uuid: string | null
          created_at: string
          edited_at: string | null
          edited_by: string | null
          id: string
          location_id: string | null
          location_type: string | null
          movement_type: string
          new_stock: number
          notes: string | null
          performed_by: string | null
          previous_stock: number
          product_id: string
          quantity: number
          reason: string | null
          reference_id: string | null
          reference_type: string | null
          tenant_id: string | null
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          client_uuid?: string | null
          created_at?: string
          edited_at?: string | null
          edited_by?: string | null
          id?: string
          location_id?: string | null
          location_type?: string | null
          movement_type?: string
          new_stock?: number
          notes?: string | null
          performed_by?: string | null
          previous_stock?: number
          product_id: string
          quantity: number
          reason?: string | null
          reference_id?: string | null
          reference_type?: string | null
          tenant_id?: string | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          client_uuid?: string | null
          created_at?: string
          edited_at?: string | null
          edited_by?: string | null
          id?: string
          location_id?: string | null
          location_type?: string | null
          movement_type?: string
          new_stock?: number
          notes?: string | null
          performed_by?: string | null
          previous_stock?: number
          product_id?: string
          quantity?: number
          reason?: string | null
          reference_id?: string | null
          reference_type?: string | null
          tenant_id?: string | null
          updated_at?: string
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
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_replenishment_suggestions"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "inventory_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
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
          {
            foreignKeyName: "invoice_series_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
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
          cufe: string | null
          currency: string
          customer_address: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          customer_tax_id: string | null
          email_sent_at: string | null
          email_sent_to: string | null
          exchange_rate: number
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
          provider: string | null
          provider_response: Json | null
          sale_id: string | null
          series_code: string
          status: string
          subtotal: number
          tax: number
          tax_rate_id: string | null
          tenant_id: string
          total: number
          total_in_base: number | null
          transmission_status: string
          transmitted_at: string | null
          updated_at: string
          xml_content: string | null
          xml_url: string | null
        }
        Insert: {
          amount_paid?: number
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          created_at?: string
          created_by?: string | null
          cufe?: string | null
          currency?: string
          customer_address?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name: string
          customer_phone?: string | null
          customer_tax_id?: string | null
          email_sent_at?: string | null
          email_sent_to?: string | null
          exchange_rate?: number
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
          provider?: string | null
          provider_response?: Json | null
          sale_id?: string | null
          series_code: string
          status?: string
          subtotal?: number
          tax?: number
          tax_rate_id?: string | null
          tenant_id: string
          total?: number
          total_in_base?: number | null
          transmission_status?: string
          transmitted_at?: string | null
          updated_at?: string
          xml_content?: string | null
          xml_url?: string | null
        }
        Update: {
          amount_paid?: number
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          created_at?: string
          created_by?: string | null
          cufe?: string | null
          currency?: string
          customer_address?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          customer_tax_id?: string | null
          email_sent_at?: string | null
          email_sent_to?: string | null
          exchange_rate?: number
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
          provider?: string | null
          provider_response?: Json | null
          sale_id?: string | null
          series_code?: string
          status?: string
          subtotal?: number
          tax?: number
          tax_rate_id?: string | null
          tenant_id?: string
          total?: number
          total_in_base?: number | null
          transmission_status?: string
          transmitted_at?: string | null
          updated_at?: string
          xml_content?: string | null
          xml_url?: string | null
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
            foreignKeyName: "invoices_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_ar_aging"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "invoices_tax_rate_id_fkey"
            columns: ["tax_rate_id"]
            isOneToOne: false
            referencedRelation: "tax_rates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      job_positions: {
        Row: {
          base_salary: number
          code: string
          created_at: string
          department: string | null
          description: string | null
          id: string
          is_active: boolean
          level: string | null
          max_salary: number
          min_salary: number
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          base_salary?: number
          code: string
          created_at?: string
          department?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          level?: string | null
          max_salary?: number
          min_salary?: number
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          base_salary?: number
          code?: string
          created_at?: string
          department?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          level?: string | null
          max_salary?: number
          min_salary?: number
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_positions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_positions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          correlation_id: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          date: string
          description: string | null
          entry_number: string
          exchange_rate: number
          fiscal_year_id: string | null
          id: string
          metadata: Json
          period_id: string | null
          posted_at: string | null
          posted_by: string | null
          reference_id: string | null
          reference_type: string | null
          reversed_by: string | null
          reverses: string | null
          series: string
          source_module: string | null
          status: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          correlation_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          date?: string
          description?: string | null
          entry_number: string
          exchange_rate?: number
          fiscal_year_id?: string | null
          id?: string
          metadata?: Json
          period_id?: string | null
          posted_at?: string | null
          posted_by?: string | null
          reference_id?: string | null
          reference_type?: string | null
          reversed_by?: string | null
          reverses?: string | null
          series?: string
          source_module?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          correlation_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          date?: string
          description?: string | null
          entry_number?: string
          exchange_rate?: number
          fiscal_year_id?: string | null
          id?: string
          metadata?: Json
          period_id?: string | null
          posted_at?: string | null
          posted_by?: string | null
          reference_id?: string | null
          reference_type?: string | null
          reversed_by?: string | null
          reverses?: string | null
          series?: string
          source_module?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_fiscal_year_id_fkey"
            columns: ["fiscal_year_id"]
            isOneToOne: false
            referencedRelation: "fiscal_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "accounting_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_reversed_by_fkey"
            columns: ["reversed_by"]
            isOneToOne: false
            referencedRelation: "general_ledger_view"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "journal_entries_reversed_by_fkey"
            columns: ["reversed_by"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_reverses_fkey"
            columns: ["reverses"]
            isOneToOne: false
            referencedRelation: "general_ledger_view"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "journal_entries_reverses_fkey"
            columns: ["reverses"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entry_lines: {
        Row: {
          account_id: string
          cost_center_id: string | null
          created_at: string
          credit: number
          currency: string | null
          debit: number
          description: string | null
          entity_id: string | null
          entity_type: string | null
          entry_id: string
          exchange_rate: number
          id: string
          store_id: string | null
          warehouse_id: string | null
        }
        Insert: {
          account_id: string
          cost_center_id?: string | null
          created_at?: string
          credit?: number
          currency?: string | null
          debit?: number
          description?: string | null
          entity_id?: string | null
          entity_type?: string | null
          entry_id: string
          exchange_rate?: number
          id?: string
          store_id?: string | null
          warehouse_id?: string | null
        }
        Update: {
          account_id?: string
          cost_center_id?: string | null
          created_at?: string
          credit?: number
          currency?: string | null
          debit?: number
          description?: string | null
          entity_id?: string | null
          entity_type?: string | null
          entry_id?: string
          exchange_rate?: number
          id?: string
          store_id?: string | null
          warehouse_id?: string | null
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
            foreignKeyName: "journal_entry_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "trial_balance_view"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "journal_entry_lines_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "general_ledger_view"
            referencedColumns: ["entry_id"]
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
      kg_edges: {
        Row: {
          attributes: Json
          created_at: string
          dst_id: string
          id: string
          relation: string
          src_id: string
          tenant_id: string
          updated_at: string
          weight: number
        }
        Insert: {
          attributes?: Json
          created_at?: string
          dst_id: string
          id?: string
          relation: string
          src_id: string
          tenant_id: string
          updated_at?: string
          weight?: number
        }
        Update: {
          attributes?: Json
          created_at?: string
          dst_id?: string
          id?: string
          relation?: string
          src_id?: string
          tenant_id?: string
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "kg_edges_dst_id_fkey"
            columns: ["dst_id"]
            isOneToOne: false
            referencedRelation: "kg_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kg_edges_src_id_fkey"
            columns: ["src_id"]
            isOneToOne: false
            referencedRelation: "kg_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      kg_nodes: {
        Row: {
          attributes: Json
          created_at: string
          id: string
          importance: number
          label: string
          node_key: string
          node_type: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attributes?: Json
          created_at?: string
          id?: string
          importance?: number
          label: string
          node_key: string
          node_type: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attributes?: Json
          created_at?: string
          id?: string
          importance?: number
          label?: string
          node_key?: string
          node_type?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      kitchen_order_items: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          sku: string | null
          status: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          order_id: string
          product_id?: string | null
          product_name: string
          quantity?: number
          sku?: string | null
          status?: string
          unit_price?: number
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          sku?: string | null
          status?: string
          unit_price?: number
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
          customer_id: string | null
          id: string
          notes: string | null
          order_code: string | null
          priority: string
          sale_id: string | null
          shift_id: string | null
          started_at: string | null
          status: string
          store_id: string | null
          table_id: string | null
          table_name: string
          tenant_id: string | null
          updated_at: string
          waiter_name: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          notes?: string | null
          order_code?: string | null
          priority?: string
          sale_id?: string | null
          shift_id?: string | null
          started_at?: string | null
          status?: string
          store_id?: string | null
          table_id?: string | null
          table_name?: string
          tenant_id?: string | null
          updated_at?: string
          waiter_name?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          notes?: string | null
          order_code?: string | null
          priority?: string
          sale_id?: string | null
          shift_id?: string | null
          started_at?: string | null
          status?: string
          store_id?: string | null
          table_id?: string | null
          table_name?: string
          tenant_id?: string | null
          updated_at?: string
          waiter_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kitchen_orders_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kitchen_orders_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_ar_aging"
            referencedColumns: ["sale_id"]
          },
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
          {
            foreignKeyName: "kitchen_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          attachment_url: string | null
          created_at: string
          days: number
          employee_id: string
          end_date: string
          id: string
          leave_type: string
          reason: string | null
          rejection_reason: string | null
          start_date: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          attachment_url?: string | null
          created_at?: string
          days: number
          employee_id: string
          end_date: string
          id?: string
          leave_type: string
          reason?: string | null
          rejection_reason?: string | null
          start_date: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          attachment_url?: string | null
          created_at?: string
          days?: number
          employee_id?: string
          end_date?: string
          id?: string
          leave_type?: string
          reason?: string | null
          rejection_reason?: string | null
          start_date?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
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
          {
            foreignKeyName: "loyalty_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
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
          {
            foreignKeyName: "loyalty_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      module_settings: {
        Row: {
          created_at: string
          id: string
          module: string
          settings: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          module: string
          settings?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          module?: string
          settings?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
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
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      online_order_events: {
        Row: {
          actor_label: string | null
          actor_user_id: string | null
          assignment_id: string | null
          created_at: string
          event_type: string
          from_status: string | null
          id: string
          metadata: Json
          note: string | null
          order_id: string
          tenant_id: string
          to_status: string | null
        }
        Insert: {
          actor_label?: string | null
          actor_user_id?: string | null
          assignment_id?: string | null
          created_at?: string
          event_type: string
          from_status?: string | null
          id?: string
          metadata?: Json
          note?: string | null
          order_id: string
          tenant_id: string
          to_status?: string | null
        }
        Update: {
          actor_label?: string | null
          actor_user_id?: string | null
          assignment_id?: string | null
          created_at?: string
          event_type?: string
          from_status?: string | null
          id?: string
          metadata?: Json
          note?: string | null
          order_id?: string
          tenant_id?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "online_order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "online_orders"
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
          {
            foreignKeyName: "online_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_replenishment_suggestions"
            referencedColumns: ["product_id"]
          },
        ]
      }
      online_orders: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          confirmed_at: string | null
          created_at: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string
          delivered_at: string | null
          delivery_address: string | null
          delivery_fee: number
          delivery_instructions: string | null
          delivery_lat: number | null
          delivery_lng: number | null
          delivery_type: string
          id: string
          notes: string | null
          payment_method: string
          ready_at: string | null
          sale_id: string | null
          status: string
          store_id: string | null
          subtotal: number
          tax: number
          tenant_id: string | null
          total: number
          updated_at: string
          user_id: string
          zone_id: string | null
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name: string
          customer_phone: string
          delivered_at?: string | null
          delivery_address?: string | null
          delivery_fee?: number
          delivery_instructions?: string | null
          delivery_lat?: number | null
          delivery_lng?: number | null
          delivery_type?: string
          id?: string
          notes?: string | null
          payment_method?: string
          ready_at?: string | null
          sale_id?: string | null
          status?: string
          store_id?: string | null
          subtotal?: number
          tax?: number
          tenant_id?: string | null
          total?: number
          updated_at?: string
          user_id: string
          zone_id?: string | null
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string
          delivered_at?: string | null
          delivery_address?: string | null
          delivery_fee?: number
          delivery_instructions?: string | null
          delivery_lat?: number | null
          delivery_lng?: number | null
          delivery_type?: string
          id?: string
          notes?: string | null
          payment_method?: string
          ready_at?: string | null
          sale_id?: string | null
          status?: string
          store_id?: string | null
          subtotal?: number
          tax?: number
          tenant_id?: string | null
          total?: number
          updated_at?: string
          user_id?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "online_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_orders_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_orders_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_ar_aging"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "online_orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_orders_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "delivery_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      operation_idempotency: {
        Row: {
          correlation_id: string | null
          created_at: string
          id: string
          idempotency_key: string
          operation: string
          result_id: string | null
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          correlation_id?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          operation: string
          result_id?: string | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          correlation_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          operation?: string
          result_id?: string | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      operational_checklists: {
        Row: {
          checklist_type: string
          created_at: string
          id: string
          is_active: boolean
          items: Json
          name: string
          scope: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          checklist_type?: string
          created_at?: string
          id?: string
          is_active?: boolean
          items?: Json
          name: string
          scope?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          checklist_type?: string
          created_at?: string
          id?: string
          is_active?: boolean
          items?: Json
          name?: string
          scope?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      overtime_records: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          date: string
          employee_id: string
          hours: number
          id: string
          pay_factor: number
          reason: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          date: string
          employee_id: string
          hours: number
          id?: string
          pay_factor?: number
          reason?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          date?: string
          employee_id?: string
          hours?: number
          id?: string
          pay_factor?: number
          reason?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "overtime_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overtime_records_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overtime_records_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      parked_sales: {
        Row: {
          cart: Json
          created_at: string
          id: string
          name: string
          notes: string | null
          shift_id: string | null
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cart?: Json
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          shift_id?: string | null
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cart?: Json
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          shift_id?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          {
            foreignKeyName: "payment_methods_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_concepts: {
        Row: {
          code: string
          concept_type: string
          contributes_ss: boolean
          created_at: string
          default_amount: number
          id: string
          is_active: boolean
          is_taxable: boolean
          name: string
          tenant_id: string
        }
        Insert: {
          code: string
          concept_type: string
          contributes_ss?: boolean
          created_at?: string
          default_amount?: number
          id?: string
          is_active?: boolean
          is_taxable?: boolean
          name: string
          tenant_id: string
        }
        Update: {
          code?: string
          concept_type?: string
          contributes_ss?: boolean
          created_at?: string
          default_amount?: number
          id?: string
          is_active?: boolean
          is_taxable?: boolean
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_concepts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_concepts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_run_concepts: {
        Row: {
          concept_id: string | null
          concept_type: string
          contributes_ss: boolean
          created_at: string
          description: string
          id: string
          is_taxable: boolean
          payroll_run_id: string
          quantity: number
          tenant_id: string
          total_amount: number
          unit_amount: number
        }
        Insert: {
          concept_id?: string | null
          concept_type: string
          contributes_ss?: boolean
          created_at?: string
          description: string
          id?: string
          is_taxable?: boolean
          payroll_run_id: string
          quantity?: number
          tenant_id: string
          total_amount?: number
          unit_amount?: number
        }
        Update: {
          concept_id?: string | null
          concept_type?: string
          contributes_ss?: boolean
          created_at?: string
          description?: string
          id?: string
          is_taxable?: boolean
          payroll_run_id?: string
          quantity?: number
          tenant_id?: string
          total_amount?: number
          unit_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_run_concepts_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "payroll_concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_run_concepts_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_run_concepts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_run_concepts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          base_salary: number
          bonus: number
          bonuses_amount: number
          created_at: string
          deductions: number
          employee_id: string
          gross_salary: number
          hours_worked: number
          id: string
          irpf_amount: number
          journal_entry_id: string | null
          net_pay: number
          notes: string | null
          other_deductions: number
          overtime_amount: number
          paid_at: string | null
          payment_iban: string | null
          payment_method: string
          payslip_url: string | null
          period_end: string
          period_start: string
          receipt_number: string | null
          sepa_export_id: string | null
          ss_company_amount: number
          ss_worker_amount: number
          status: string
          taxable_base: number
          tenant_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          base_salary?: number
          bonus?: number
          bonuses_amount?: number
          created_at?: string
          deductions?: number
          employee_id: string
          gross_salary?: number
          hours_worked?: number
          id?: string
          irpf_amount?: number
          journal_entry_id?: string | null
          net_pay?: number
          notes?: string | null
          other_deductions?: number
          overtime_amount?: number
          paid_at?: string | null
          payment_iban?: string | null
          payment_method?: string
          payslip_url?: string | null
          period_end: string
          period_start: string
          receipt_number?: string | null
          sepa_export_id?: string | null
          ss_company_amount?: number
          ss_worker_amount?: number
          status?: string
          taxable_base?: number
          tenant_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          base_salary?: number
          bonus?: number
          bonuses_amount?: number
          created_at?: string
          deductions?: number
          employee_id?: string
          gross_salary?: number
          hours_worked?: number
          id?: string
          irpf_amount?: number
          journal_entry_id?: string | null
          net_pay?: number
          notes?: string | null
          other_deductions?: number
          overtime_amount?: number
          paid_at?: string | null
          payment_iban?: string | null
          payment_method?: string
          payslip_url?: string | null
          period_end?: string
          period_start?: string
          receipt_number?: string | null
          sepa_export_id?: string | null
          ss_company_amount?: number
          ss_worker_amount?: number
          status?: string
          taxable_base?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_payroll_sepa"
            columns: ["sepa_export_id"]
            isOneToOne: false
            referencedRelation: "sepa_exports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "general_ledger_view"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "payroll_runs_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_tax_brackets: {
        Row: {
          bracket_type: string
          country_code: string
          created_at: string
          fixed_amount: number
          id: string
          max_base: number | null
          min_base: number
          notes: string | null
          rate_percent: number
          tenant_id: string
          year: number
        }
        Insert: {
          bracket_type: string
          country_code?: string
          created_at?: string
          fixed_amount?: number
          id?: string
          max_base?: number | null
          min_base?: number
          notes?: string | null
          rate_percent?: number
          tenant_id: string
          year: number
        }
        Update: {
          bracket_type?: string
          country_code?: string
          created_at?: string
          fixed_amount?: number
          id?: string
          max_base?: number | null
          min_base?: number
          notes?: string | null
          rate_percent?: number
          tenant_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_tax_brackets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_tax_brackets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      physical_count_items: {
        Row: {
          count_id: string
          counted_qty: number
          created_at: string
          difference: number | null
          expected_qty: number
          id: string
          notes: string | null
          product_id: string
          variant_id: string | null
        }
        Insert: {
          count_id: string
          counted_qty?: number
          created_at?: string
          difference?: number | null
          expected_qty?: number
          id?: string
          notes?: string | null
          product_id: string
          variant_id?: string | null
        }
        Update: {
          count_id?: string
          counted_qty?: number
          created_at?: string
          difference?: number | null
          expected_qty?: number
          id?: string
          notes?: string | null
          product_id?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "physical_count_items_count_id_fkey"
            columns: ["count_id"]
            isOneToOne: false
            referencedRelation: "physical_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "physical_count_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "physical_count_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_replenishment_suggestions"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "physical_count_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      physical_counts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          completed_at: string | null
          count_type: string
          created_at: string
          id: string
          location_id: string | null
          location_type: string | null
          notes: string | null
          performed_by: string | null
          reference: string | null
          started_at: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          count_type?: string
          created_at?: string
          id?: string
          location_id?: string | null
          location_type?: string | null
          notes?: string | null
          performed_by?: string | null
          reference?: string | null
          started_at?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          count_type?: string
          created_at?: string
          id?: string
          location_id?: string | null
          location_type?: string | null
          notes?: string | null
          performed_by?: string | null
          reference?: string | null
          started_at?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      pos_settings: {
        Row: {
          allow_discounts: boolean
          allow_negative_stock: boolean
          auto_print_receipt: boolean
          created_at: string
          default_credit_days: number
          default_currency: string
          default_tax_rate_id: string | null
          id: string
          max_discount_pct: number
          receipt_footer: string | null
          receipt_width: number
          rounding_mode: string
          secondary_currency: string | null
          silent_print: boolean
          tax_included: boolean
          tenant_id: string
          tip_enabled: boolean
          tip_percentages: number[]
          tip_required: boolean
          updated_at: string
        }
        Insert: {
          allow_discounts?: boolean
          allow_negative_stock?: boolean
          auto_print_receipt?: boolean
          created_at?: string
          default_credit_days?: number
          default_currency?: string
          default_tax_rate_id?: string | null
          id?: string
          max_discount_pct?: number
          receipt_footer?: string | null
          receipt_width?: number
          rounding_mode?: string
          secondary_currency?: string | null
          silent_print?: boolean
          tax_included?: boolean
          tenant_id: string
          tip_enabled?: boolean
          tip_percentages?: number[]
          tip_required?: boolean
          updated_at?: string
        }
        Update: {
          allow_discounts?: boolean
          allow_negative_stock?: boolean
          auto_print_receipt?: boolean
          created_at?: string
          default_credit_days?: number
          default_currency?: string
          default_tax_rate_id?: string | null
          id?: string
          max_discount_pct?: number
          receipt_footer?: string | null
          receipt_width?: number
          rounding_mode?: string
          secondary_currency?: string | null
          silent_print?: boolean
          tax_included?: boolean
          tenant_id?: string
          tip_enabled?: boolean
          tip_percentages?: number[]
          tip_required?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      posting_rules: {
        Row: {
          active: boolean
          amount_field: string
          condition_expr: string | null
          created_at: string
          credit_account_code: string
          debit_account_code: string
          description: string
          event_type: string
          id: string
          profile_code: string | null
          sequence: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount_field?: string
          condition_expr?: string | null
          created_at?: string
          credit_account_code: string
          debit_account_code: string
          description: string
          event_type: string
          id?: string
          profile_code?: string | null
          sequence?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount_field?: string
          condition_expr?: string | null
          created_at?: string
          credit_account_code?: string
          debit_account_code?: string
          description?: string
          event_type?: string
          id?: string
          profile_code?: string | null
          sequence?: number
          updated_at?: string
        }
        Relationships: []
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
          {
            foreignKeyName: "product_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      product_lots: {
        Row: {
          created_at: string
          expiration_date: string | null
          id: string
          location_id: string | null
          location_type: string | null
          lot_number: string
          manufacturing_date: string | null
          notes: string | null
          product_id: string
          quantity: number
          status: string
          tenant_id: string
          unit_cost: number
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          expiration_date?: string | null
          id?: string
          location_id?: string | null
          location_type?: string | null
          lot_number: string
          manufacturing_date?: string | null
          notes?: string | null
          product_id: string
          quantity?: number
          status?: string
          tenant_id: string
          unit_cost?: number
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          expiration_date?: string | null
          id?: string
          location_id?: string | null
          location_type?: string | null
          lot_number?: string
          manufacturing_date?: string | null
          notes?: string | null
          product_id?: string
          quantity?: number
          status?: string
          tenant_id?: string
          unit_cost?: number
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_lots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_lots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_replenishment_suggestions"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_lots_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_recipes: {
        Row: {
          created_at: string
          id: string
          ingredient_id: string
          note: string | null
          product_id: string
          quantity: number
          tenant_id: string | null
          unit: string
          waste_pct: number
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_id: string
          note?: string | null
          product_id: string
          quantity?: number
          tenant_id?: string | null
          unit?: string
          waste_pct?: number
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_id?: string
          note?: string | null
          product_id?: string
          quantity?: number
          tenant_id?: string | null
          unit?: string
          waste_pct?: number
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
            foreignKeyName: "product_recipes_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "v_replenishment_suggestions"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_recipes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_recipes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_replenishment_suggestions"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_recipes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_recipes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      product_reviews: {
        Row: {
          comment: string | null
          created_at: string
          customer_id: string | null
          id: string
          is_verified_purchase: boolean
          is_visible: boolean
          product_id: string
          rating: number
          tenant_id: string
          title: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          is_verified_purchase?: boolean
          is_visible?: boolean
          product_id: string
          rating: number
          tenant_id: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          is_verified_purchase?: boolean
          is_visible?: boolean
          product_id?: string
          rating?: number
          tenant_id?: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_replenishment_suggestions"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_reviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      product_serials: {
        Row: {
          created_at: string
          id: string
          location_id: string | null
          location_type: string | null
          notes: string | null
          product_id: string
          sale_id: string | null
          serial_number: string
          status: string
          tenant_id: string
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          location_id?: string | null
          location_type?: string | null
          notes?: string | null
          product_id: string
          sale_id?: string | null
          serial_number: string
          status?: string
          tenant_id: string
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string | null
          location_type?: string | null
          notes?: string | null
          product_id?: string
          sale_id?: string | null
          serial_number?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_serials_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_serials_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_replenishment_suggestions"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_serials_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_stock: {
        Row: {
          committed: number
          created_at: string
          damaged: number
          id: string
          in_transit: number
          location_id: string
          location_type: string
          max_stock: number | null
          min_stock: number
          product_id: string
          reserved: number
          stock: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          committed?: number
          created_at?: string
          damaged?: number
          id?: string
          in_transit?: number
          location_id: string
          location_type: string
          max_stock?: number | null
          min_stock?: number
          product_id: string
          reserved?: number
          stock?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          committed?: number
          created_at?: string
          damaged?: number
          id?: string
          in_transit?: number
          location_id?: string
          location_type?: string
          max_stock?: number | null
          min_stock?: number
          product_id?: string
          reserved?: number
          stock?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_supplier_costs: {
        Row: {
          currency: string
          id: string
          notes: string | null
          product_id: string
          recorded_at: string
          reference_id: string | null
          reference_type: string | null
          supplier_id: string | null
          tenant_id: string
          unit_cost: number
        }
        Insert: {
          currency?: string
          id?: string
          notes?: string | null
          product_id: string
          recorded_at?: string
          reference_id?: string | null
          reference_type?: string | null
          supplier_id?: string | null
          tenant_id: string
          unit_cost: number
        }
        Update: {
          currency?: string
          id?: string
          notes?: string | null
          product_id?: string
          recorded_at?: string
          reference_id?: string | null
          reference_type?: string | null
          supplier_id?: string | null
          tenant_id?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_supplier_costs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_supplier_costs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_replenishment_suggestions"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_variants: {
        Row: {
          attributes: Json
          barcode: string | null
          cost: number
          created_at: string
          id: string
          is_active: boolean
          name: string
          price: number
          product_id: string
          sku: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attributes?: Json
          barcode?: string | null
          cost?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          price?: number
          product_id: string
          sku?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attributes?: Json
          barcode?: string | null
          cost?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          product_id?: string
          sku?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_replenishment_suggestions"
            referencedColumns: ["product_id"]
          },
        ]
      }
      products: {
        Row: {
          barcodes: Json
          brand: string | null
          category: string | null
          cost: number
          created_at: string
          default_tax_rate_id: string | null
          description: string | null
          documents: Json
          expiration_tracking: boolean
          id: string
          image_url: string | null
          images: Json
          is_active: boolean
          is_combo: boolean
          is_deliverable: boolean | null
          is_online: boolean
          is_semi_finished: boolean
          max_stock: number | null
          min_stock: number
          name: string
          online_stock: number
          prep_minutes: number | null
          price: number
          product_type: string
          recipe_notes: string | null
          recipe_yield: number
          sku: string
          stock: number
          store_id: string | null
          tenant_id: string | null
          track_lots: boolean
          track_serials: boolean
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          barcodes?: Json
          brand?: string | null
          category?: string | null
          cost?: number
          created_at?: string
          default_tax_rate_id?: string | null
          description?: string | null
          documents?: Json
          expiration_tracking?: boolean
          id?: string
          image_url?: string | null
          images?: Json
          is_active?: boolean
          is_combo?: boolean
          is_deliverable?: boolean | null
          is_online?: boolean
          is_semi_finished?: boolean
          max_stock?: number | null
          min_stock?: number
          name: string
          online_stock?: number
          prep_minutes?: number | null
          price?: number
          product_type?: string
          recipe_notes?: string | null
          recipe_yield?: number
          sku: string
          stock?: number
          store_id?: string | null
          tenant_id?: string | null
          track_lots?: boolean
          track_serials?: boolean
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          barcodes?: Json
          brand?: string | null
          category?: string | null
          cost?: number
          created_at?: string
          default_tax_rate_id?: string | null
          description?: string | null
          documents?: Json
          expiration_tracking?: boolean
          id?: string
          image_url?: string | null
          images?: Json
          is_active?: boolean
          is_combo?: boolean
          is_deliverable?: boolean | null
          is_online?: boolean
          is_semi_finished?: boolean
          max_stock?: number | null
          min_stock?: number
          name?: string
          online_stock?: number
          prep_minutes?: number | null
          price?: number
          product_type?: string
          recipe_notes?: string | null
          recipe_yield?: number
          sku?: string
          stock?: number
          store_id?: string | null
          tenant_id?: string | null
          track_lots?: boolean
          track_serials?: boolean
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_default_tax_rate_id_fkey"
            columns: ["default_tax_rate_id"]
            isOneToOne: false
            referencedRelation: "tax_rates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
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
          locale: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          locale?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          locale?: string | null
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
          {
            foreignKeyName: "promotions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
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
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "v_ap_aging"
            referencedColumns: ["purchase_id"]
          },
        ]
      }
      purchases: {
        Row: {
          amount_paid: number
          cost_center_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          destination_id: string | null
          destination_type: string
          exchange_rate: number
          id: string
          invoice_number: string | null
          is_consignment: boolean
          notes: string | null
          purchase_number: string | null
          received_at: string | null
          received_by: string | null
          status: string
          subtotal: number
          supplier_id: string | null
          tax: number
          tax_rate_id: string | null
          tenant_id: string | null
          total: number
          total_in_base: number | null
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          destination_id?: string | null
          destination_type?: string
          exchange_rate?: number
          id?: string
          invoice_number?: string | null
          is_consignment?: boolean
          notes?: string | null
          purchase_number?: string | null
          received_at?: string | null
          received_by?: string | null
          status?: string
          subtotal?: number
          supplier_id?: string | null
          tax?: number
          tax_rate_id?: string | null
          tenant_id?: string | null
          total?: number
          total_in_base?: number | null
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          destination_id?: string | null
          destination_type?: string
          exchange_rate?: number
          id?: string
          invoice_number?: string | null
          is_consignment?: boolean
          notes?: string | null
          purchase_number?: string | null
          received_at?: string | null
          received_by?: string | null
          status?: string
          subtotal?: number
          supplier_id?: string | null
          tax?: number
          tax_rate_id?: string | null
          tenant_id?: string | null
          total?: number
          total_in_base?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_tax_rate_id_fkey"
            columns: ["tax_rate_id"]
            isOneToOne: false
            referencedRelation: "tax_rates"
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
            foreignKeyName: "restaurant_tables_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
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
      rider_profiles: {
        Row: {
          availability: string
          avatar_url: string | null
          bio: string | null
          created_at: string
          current_lat: number | null
          current_lng: number | null
          deliveries_cancelled: number
          deliveries_completed: number
          destination_lat: number | null
          destination_lng: number | null
          document_id: string | null
          email: string | null
          experience_years: number
          full_name: string
          id: string
          location_updated_at: string | null
          max_active_deliveries: number
          offers_accepted: number
          offers_received: number
          on_time_deliveries: number
          phone: string
          preferred_zone: string | null
          rating_avg: number
          ratings_count: number
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
          vehicle_details: string | null
          vehicle_plate: string | null
          vehicle_type: string
        }
        Insert: {
          availability?: string
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          current_lat?: number | null
          current_lng?: number | null
          deliveries_cancelled?: number
          deliveries_completed?: number
          destination_lat?: number | null
          destination_lng?: number | null
          document_id?: string | null
          email?: string | null
          experience_years?: number
          full_name: string
          id?: string
          location_updated_at?: string | null
          max_active_deliveries?: number
          offers_accepted?: number
          offers_received?: number
          on_time_deliveries?: number
          phone: string
          preferred_zone?: string | null
          rating_avg?: number
          ratings_count?: number
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
          vehicle_details?: string | null
          vehicle_plate?: string | null
          vehicle_type?: string
        }
        Update: {
          availability?: string
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          current_lat?: number | null
          current_lng?: number | null
          deliveries_cancelled?: number
          deliveries_completed?: number
          destination_lat?: number | null
          destination_lng?: number | null
          document_id?: string | null
          email?: string | null
          experience_years?: number
          full_name?: string
          id?: string
          location_updated_at?: string | null
          max_active_deliveries?: number
          offers_accepted?: number
          offers_received?: number
          on_time_deliveries?: number
          phone?: string
          preferred_zone?: string | null
          rating_avg?: number
          ratings_count?: number
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          vehicle_details?: string | null
          vehicle_plate?: string | null
          vehicle_type?: string
        }
        Relationships: []
      }
      risk_alerts: {
        Row: {
          category: string
          created_at: string
          description: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json
          resolved_at: string | null
          resolved_by: string | null
          severity: Database["public"]["Enums"]["risk_severity"]
          status: string
          tenant_id: string
          title: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["risk_severity"]
          status?: string
          tenant_id: string
          title: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["risk_severity"]
          status?: string
          tenant_id?: string
          title?: string
        }
        Relationships: []
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
          client_uuid: string | null
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
          client_uuid?: string | null
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
          client_uuid?: string | null
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
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_ar_aging"
            referencedColumns: ["sale_id"]
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
          {
            foreignKeyName: "sale_payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_ar_aging"
            referencedColumns: ["sale_id"]
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
          {
            foreignKeyName: "sale_return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "sale_returns_view"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_returns: {
        Row: {
          client_uuid: string | null
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
          client_uuid?: string | null
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
          client_uuid?: string | null
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
          {
            foreignKeyName: "sale_returns_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_ar_aging"
            referencedColumns: ["sale_id"]
          },
        ]
      }
      sales: {
        Row: {
          amount_paid: number
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          channel: string
          client_uuid: string | null
          cost_center_id: string | null
          created_at: string
          currency: string
          customer_id: string | null
          employee_id: string | null
          exchange_rate: number
          fulfillment: string
          id: string
          notes: string | null
          online_order_id: string | null
          shift_id: string | null
          status: string
          store_id: string | null
          subtotal: number
          tax: number
          tax_rate_id: string | null
          tenant_id: string | null
          ticket_number: string | null
          ticket_series: string | null
          total: number
          total_in_base: number | null
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          channel?: string
          client_uuid?: string | null
          cost_center_id?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          employee_id?: string | null
          exchange_rate?: number
          fulfillment?: string
          id?: string
          notes?: string | null
          online_order_id?: string | null
          shift_id?: string | null
          status?: string
          store_id?: string | null
          subtotal?: number
          tax?: number
          tax_rate_id?: string | null
          tenant_id?: string | null
          ticket_number?: string | null
          ticket_series?: string | null
          total?: number
          total_in_base?: number | null
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          channel?: string
          client_uuid?: string | null
          cost_center_id?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          employee_id?: string | null
          exchange_rate?: number
          fulfillment?: string
          id?: string
          notes?: string | null
          online_order_id?: string | null
          shift_id?: string | null
          status?: string
          store_id?: string | null
          subtotal?: number
          tax?: number
          tax_rate_id?: string | null
          tenant_id?: string | null
          ticket_number?: string | null
          ticket_series?: string | null
          total?: number
          total_in_base?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "sales_online_order_id_fkey"
            columns: ["online_order_id"]
            isOneToOne: false
            referencedRelation: "online_orders"
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
            foreignKeyName: "sales_tax_rate_id_fkey"
            columns: ["tax_rate_id"]
            isOneToOne: false
            referencedRelation: "tax_rates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_shifts: {
        Row: {
          cash_difference: number | null
          cash_in_total: number | null
          cash_out_total: number | null
          client_uuid: string | null
          closed_at: string | null
          closing_cash: number | null
          created_at: string
          declared_cash: number | null
          employee_id: string | null
          expected_cash: number | null
          id: string
          locked: boolean
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
          z_closed_at: string | null
          z_journal_entry_id: string | null
          z_summary: Json | null
        }
        Insert: {
          cash_difference?: number | null
          cash_in_total?: number | null
          cash_out_total?: number | null
          client_uuid?: string | null
          closed_at?: string | null
          closing_cash?: number | null
          created_at?: string
          declared_cash?: number | null
          employee_id?: string | null
          expected_cash?: number | null
          id?: string
          locked?: boolean
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
          z_closed_at?: string | null
          z_journal_entry_id?: string | null
          z_summary?: Json | null
        }
        Update: {
          cash_difference?: number | null
          cash_in_total?: number | null
          cash_out_total?: number | null
          client_uuid?: string | null
          closed_at?: string | null
          closing_cash?: number | null
          created_at?: string
          declared_cash?: number | null
          employee_id?: string | null
          expected_cash?: number | null
          id?: string
          locked?: boolean
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
          z_closed_at?: string | null
          z_journal_entry_id?: string | null
          z_summary?: Json | null
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
            foreignKeyName: "sales_shifts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_shifts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_shifts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      sepa_exports: {
        Row: {
          bank_account_id: string | null
          created_at: string
          currency: string
          generated_by: string | null
          id: string
          message_id: string
          payment_count: number
          status: string
          tenant_id: string
          total_amount: number
          xml_content: string | null
        }
        Insert: {
          bank_account_id?: string | null
          created_at?: string
          currency?: string
          generated_by?: string | null
          id?: string
          message_id: string
          payment_count?: number
          status?: string
          tenant_id: string
          total_amount?: number
          xml_content?: string | null
        }
        Update: {
          bank_account_id?: string | null
          created_at?: string
          currency?: string
          generated_by?: string | null
          id?: string
          message_id?: string
          payment_count?: number
          status?: string
          tenant_id?: string
          total_amount?: number
          xml_content?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sepa_exports_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sepa_exports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sepa_exports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_cash_movements: {
        Row: {
          amount: number
          amount_in_base: number | null
          category: string
          client_uuid: string | null
          created_at: string
          currency: string
          exchange_rate: number
          id: string
          journal_entry_id: string | null
          movement_type: string
          performed_by: string | null
          reason: string | null
          shift_id: string
          tenant_id: string | null
        }
        Insert: {
          amount: number
          amount_in_base?: number | null
          category?: string
          client_uuid?: string | null
          created_at?: string
          currency?: string
          exchange_rate?: number
          id?: string
          journal_entry_id?: string | null
          movement_type: string
          performed_by?: string | null
          reason?: string | null
          shift_id: string
          tenant_id?: string | null
        }
        Update: {
          amount?: number
          amount_in_base?: number | null
          category?: string
          client_uuid?: string | null
          created_at?: string
          currency?: string
          exchange_rate?: number
          id?: string
          journal_entry_id?: string | null
          movement_type?: string
          performed_by?: string | null
          reason?: string | null
          shift_id?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_cash_movements_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "general_ledger_view"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "shift_cash_movements_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_cash_movements_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "sales_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfer_events: {
        Row: {
          created_at: string
          id: string
          note: string | null
          performed_by: string | null
          status: string
          tenant_id: string
          transfer_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          performed_by?: string | null
          status: string
          tenant_id: string
          transfer_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          performed_by?: string | null
          status?: string
          tenant_id?: string
          transfer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfer_events_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "stock_transfers"
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
          carrier_driver: string | null
          carrier_name: string | null
          carrier_phone: string | null
          carrier_plate: string | null
          carrier_vehicle: string | null
          created_at: string
          created_by: string | null
          destination_id: string
          destination_type: string
          estimated_arrival: string | null
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
          tracking_code: string | null
          transfer_number: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          cancelled_at?: string | null
          carrier_driver?: string | null
          carrier_name?: string | null
          carrier_phone?: string | null
          carrier_plate?: string | null
          carrier_vehicle?: string | null
          created_at?: string
          created_by?: string | null
          destination_id: string
          destination_type: string
          estimated_arrival?: string | null
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
          tracking_code?: string | null
          transfer_number: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          cancelled_at?: string | null
          carrier_driver?: string | null
          carrier_name?: string | null
          carrier_phone?: string | null
          carrier_plate?: string | null
          carrier_vehicle?: string | null
          created_at?: string
          created_by?: string | null
          destination_id?: string
          destination_type?: string
          estimated_arrival?: string | null
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
          tracking_code?: string | null
          transfer_number?: string
          updated_at?: string
        }
        Relationships: []
      }
      store_incidents: {
        Row: {
          created_at: string
          description: string | null
          id: string
          incident_type: string
          metadata: Json | null
          reported_by: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
          store_id: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          incident_type: string
          metadata?: Json | null
          reported_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          store_id: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          incident_type?: string
          metadata?: Json | null
          reported_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          store_id?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_incidents_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_incidents_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_public"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          accepts_delivery: boolean | null
          accepts_pickup: boolean | null
          address: string | null
          capacity: number | null
          created_at: string
          delivery_radius_km: number | null
          email: string | null
          geo_lat: number | null
          geo_lng: number | null
          id: string
          is_active: boolean
          latitude: number | null
          longitude: number | null
          manager_id: string | null
          name: string
          opened_at: string | null
          operational_status: string | null
          phone: string | null
          schedule: Json | null
          store_type: string | null
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          accepts_delivery?: boolean | null
          accepts_pickup?: boolean | null
          address?: string | null
          capacity?: number | null
          created_at?: string
          delivery_radius_km?: number | null
          email?: string | null
          geo_lat?: number | null
          geo_lng?: number | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          manager_id?: string | null
          name: string
          opened_at?: string | null
          operational_status?: string | null
          phone?: string | null
          schedule?: Json | null
          store_type?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          accepts_delivery?: boolean | null
          accepts_pickup?: boolean | null
          address?: string | null
          capacity?: number | null
          created_at?: string
          delivery_radius_km?: number | null
          email?: string | null
          geo_lat?: number | null
          geo_lng?: number | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          manager_id?: string | null
          name?: string
          opened_at?: string | null
          operational_status?: string | null
          phone?: string | null
          schedule?: Json | null
          store_type?: string | null
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
          {
            foreignKeyName: "stores_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
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
      supplier_products: {
        Row: {
          created_at: string
          currency: string
          id: string
          is_consignment: boolean
          is_preferred: boolean
          last_purchase_at: string | null
          lead_time_days: number
          min_order_qty: number
          notes: string | null
          product_id: string | null
          product_name: string
          sku: string | null
          status: string
          supplier_id: string
          supplier_sku: string | null
          tenant_id: string
          unit_cost: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          is_consignment?: boolean
          is_preferred?: boolean
          last_purchase_at?: string | null
          lead_time_days?: number
          min_order_qty?: number
          notes?: string | null
          product_id?: string | null
          product_name: string
          sku?: string | null
          status?: string
          supplier_id: string
          supplier_sku?: string | null
          tenant_id: string
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          is_consignment?: boolean
          is_preferred?: boolean
          last_purchase_at?: string | null
          lead_time_days?: number
          min_order_qty?: number
          notes?: string | null
          product_id?: string | null
          product_name?: string
          sku?: string | null
          status?: string
          supplier_id?: string
          supplier_sku?: string | null
          tenant_id?: string
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_replenishment_suggestions"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "supplier_products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "system_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_rates: {
        Row: {
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          rate: number
          tenant_id: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          rate?: number
          tenant_id?: string | null
        }
        Update: {
          code?: string | null
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
          {
            foreignKeyName: "tax_rates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_templates: {
        Row: {
          code: string
          id: string
          name: string
          profile_code: string
          rate: number
          type: string
        }
        Insert: {
          code: string
          id?: string
          name: string
          profile_code: string
          rate?: number
          type?: string
        }
        Update: {
          code?: string
          id?: string
          name?: string
          profile_code?: string
          rate?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_templates_profile_code_fkey"
            columns: ["profile_code"]
            isOneToOne: false
            referencedRelation: "accounting_profiles"
            referencedColumns: ["code"]
          },
        ]
      }
      tenant_api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          scopes: string[]
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          scopes?: string[]
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          scopes?: string[]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_api_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_api_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
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
          {
            foreignKeyName: "tenant_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          accounting_profile_code: string | null
          address: string | null
          business_type: string
          country_code: string | null
          created_at: string
          default_locale: string
          email: string | null
          id: string
          is_active: boolean
          is_demo: boolean
          logo_url: string | null
          name: string
          phone: string | null
          rfc: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          accounting_profile_code?: string | null
          address?: string | null
          business_type?: string
          country_code?: string | null
          created_at?: string
          default_locale?: string
          email?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          logo_url?: string | null
          name: string
          phone?: string | null
          rfc?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          accounting_profile_code?: string | null
          address?: string | null
          business_type?: string
          country_code?: string | null
          created_at?: string
          default_locale?: string
          email?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          logo_url?: string | null
          name?: string
          phone?: string | null
          rfc?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_accounting_profile_code_fkey"
            columns: ["accounting_profile_code"]
            isOneToOne: false
            referencedRelation: "accounting_profiles"
            referencedColumns: ["code"]
          },
        ]
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
      treasury_forecast: {
        Row: {
          amount: number
          bank_account_id: string | null
          category: string | null
          created_at: string
          currency: string
          description: string | null
          direction: string
          due_date: string
          id: string
          party_id: string | null
          party_type: string | null
          reference_id: string | null
          reference_type: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          bank_account_id?: string | null
          category?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          direction: string
          due_date: string
          id?: string
          party_id?: string | null
          party_type?: string | null
          reference_id?: string | null
          reference_type?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          category?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          direction?: string
          due_date?: string
          id?: string
          party_id?: string | null
          party_type?: string | null
          reference_id?: string | null
          reference_type?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "treasury_forecast_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treasury_forecast_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treasury_forecast_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      user_pos_favorites: {
        Row: {
          created_at: string
          id: string
          position: number
          product_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          position?: number
          product_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          position?: number
          product_id?: string
          tenant_id?: string
          user_id?: string
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
      warehouse_stores: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          store_id: string
          tenant_id: string
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          store_id: string
          tenant_id: string
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          store_id?: string
          tenant_id?: string
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_stores_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_stores_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_stores_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          capacity: number | null
          created_at: string
          geo_lat: number | null
          geo_lng: number | null
          id: string
          is_active: boolean
          location: string | null
          manager_id: string | null
          name: string
          tenant_id: string | null
          updated_at: string
          warehouse_type: string | null
          zones: Json | null
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          geo_lat?: number | null
          geo_lng?: number | null
          id?: string
          is_active?: boolean
          location?: string | null
          manager_id?: string | null
          name: string
          tenant_id?: string | null
          updated_at?: string
          warehouse_type?: string | null
          zones?: Json | null
        }
        Update: {
          capacity?: number | null
          created_at?: string
          geo_lat?: number | null
          geo_lng?: number | null
          id?: string
          is_active?: boolean
          location?: string | null
          manager_id?: string | null
          name?: string
          tenant_id?: string | null
          updated_at?: string
          warehouse_type?: string | null
          zones?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_deliveries: {
        Row: {
          attempts: number
          created_at: string
          delivered_at: string | null
          event: string
          id: string
          next_attempt_at: string
          payload: Json
          response: string | null
          status: string
          status_code: number | null
          tenant_id: string
          webhook_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          event: string
          id?: string
          next_attempt_at?: string
          payload: Json
          response?: string | null
          status?: string
          status_code?: number | null
          tenant_id: string
          webhook_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          event?: string
          id?: string
          next_attempt_at?: string
          payload?: Json
          response?: string | null
          status?: string
          status_code?: number | null
          tenant_id?: string
          webhook_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      webhooks: {
        Row: {
          created_at: string
          events: string[]
          failure_count: number
          id: string
          is_active: boolean
          last_delivery_at: string | null
          name: string
          secret: string
          tenant_id: string
          url: string
        }
        Insert: {
          created_at?: string
          events?: string[]
          failure_count?: number
          id?: string
          is_active?: boolean
          last_delivery_at?: string | null
          name: string
          secret?: string
          tenant_id: string
          url: string
        }
        Update: {
          created_at?: string
          events?: string[]
          failure_count?: number
          id?: string
          is_active?: boolean
          last_delivery_at?: string | null
          name?: string
          secret?: string
          tenant_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhooks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhooks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
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
          {
            foreignKeyName: "work_schedules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          created_at: string
          definition: Json
          description: string | null
          enabled: boolean
          id: string
          last_run_at: string | null
          name: string
          run_count: number
          tenant_id: string
          trigger: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          definition?: Json
          description?: string | null
          enabled?: boolean
          id?: string
          last_run_at?: string | null
          name: string
          run_count?: number
          tenant_id: string
          trigger?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          definition?: Json
          description?: string | null
          enabled?: boolean
          id?: string
          last_run_at?: string | null
          name?: string
          run_count?: number
          tenant_id?: string
          trigger?: Json
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      budget_execution_view: {
        Row: {
          account_code: string | null
          account_id: string | null
          account_name: string | null
          account_type: string | null
          actual: number | null
          budget_id: string | null
          budget_name: string | null
          budgeted: number | null
          cost_center_code: string | null
          cost_center_id: string | null
          cost_center_name: string | null
          period_month: number | null
          tenant_id: string | null
          variance: number | null
          year: number | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "trial_balance_view"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "budget_lines_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_lines_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_event_divergences: {
        Row: {
          aggregate_id: string | null
          aggregate_type: string | null
          detail: string | null
          detected_for: string | null
          divergence_type: string | null
          event_type: string | null
          tenant_id: string | null
        }
        Relationships: []
      }
      driver_last_location: {
        Row: {
          accuracy: number | null
          assignment_id: string | null
          battery: number | null
          heading: number | null
          latitude: number | null
          longitude: number | null
          recorded_at: string | null
          rider_id: string | null
          speed: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_locations_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "delivery_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_locations_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "delivery_riders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      general_ledger_view: {
        Row: {
          account_code: string | null
          account_id: string | null
          account_name: string | null
          cost_center_code: string | null
          cost_center_id: string | null
          cost_center_name: string | null
          credit: number | null
          date: string | null
          debit: number | null
          entry_description: string | null
          entry_id: string | null
          entry_number: string | null
          fiscal_year_id: string | null
          line_description: string | null
          line_id: string | null
          period_id: string | null
          status: string | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_fiscal_year_id_fkey"
            columns: ["fiscal_year_id"]
            isOneToOne: false
            referencedRelation: "fiscal_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "accounting_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "trial_balance_view"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "journal_entry_lines_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      party_balance_by_currency: {
        Row: {
          currency: string | null
          earliest_due: string | null
          open_balance: number | null
          open_balance_in_base: number | null
          open_documents: number | null
          party_id: string | null
          party_type: string | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_payable_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_payable_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      product_ratings_public: {
        Row: {
          product_id: string | null
          rating_avg: number | null
          reviews_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_replenishment_suggestions"
            referencedColumns: ["product_id"]
          },
        ]
      }
      recipe_costing: {
        Row: {
          margin: number | null
          margin_pct: number | null
          name: string | null
          price: number | null
          product_id: string | null
          tenant_id: string | null
          unit_cost: number | null
        }
        Relationships: []
      }
      sale_returns_view: {
        Row: {
          created_at: string | null
          currency: string | null
          customer_id: string | null
          customer_name: string | null
          id: string | null
          lines_returned: number | null
          performed_by: string | null
          performed_by_name: string | null
          reason: string | null
          refund_method: string | null
          restock: boolean | null
          return_number: string | null
          sale_date: string | null
          sale_id: string | null
          sale_total: number | null
          shift_id: string | null
          status: string | null
          store_id: string | null
          tenant_id: string | null
          ticket_number: string | null
          total: number | null
          units_returned: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_returns_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_returns_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_ar_aging"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "sales_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      stores_public: {
        Row: {
          accepts_delivery: boolean | null
          accepts_pickup: boolean | null
          address: string | null
          delivery_radius_km: number | null
          id: string | null
          latitude: number | null
          longitude: number | null
          name: string | null
          tenant_id: string | null
        }
        Insert: {
          accepts_delivery?: never
          accepts_pickup?: never
          address?: string | null
          delivery_radius_km?: never
          id?: string | null
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          tenant_id?: string | null
        }
        Update: {
          accepts_delivery?: never
          accepts_pickup?: never
          address?: string | null
          delivery_radius_km?: never
          id?: string | null
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stores_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stores_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants_public: {
        Row: {
          business_type: string | null
          id: string | null
          logo_url: string | null
          name: string | null
          slug: string | null
        }
        Insert: {
          business_type?: string | null
          id?: string | null
          logo_url?: string | null
          name?: string | null
          slug?: string | null
        }
        Update: {
          business_type?: string | null
          id?: string | null
          logo_url?: string | null
          name?: string | null
          slug?: string | null
        }
        Relationships: []
      }
      trial_balance_view: {
        Row: {
          account_id: string | null
          balance: number | null
          code: string | null
          fiscal_year_id: string | null
          name: string | null
          nature: string | null
          period_id: string | null
          tenant_id: string | null
          total_credit: number | null
          total_debit: number | null
          type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounting_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_fiscal_year_id_fkey"
            columns: ["fiscal_year_id"]
            isOneToOne: false
            referencedRelation: "fiscal_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "accounting_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      v_ap_aging: {
        Row: {
          balance: number | null
          days_old: number | null
          invoice_date: string | null
          invoice_number: string | null
          purchase_id: string | null
          supplier_id: string | null
          supplier_name: string | null
          tenant_id: string | null
          total: number | null
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
      v_ar_aging: {
        Row: {
          balance: number | null
          customer_id: string | null
          customer_name: string | null
          days_old: number | null
          invoice_date: string | null
          invoice_number: string | null
          sale_id: string | null
          tenant_id: string | null
          total: number | null
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
            foreignKeyName: "sales_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      v_balance_sheet: {
        Row: {
          closing_balance: number | null
          code: string | null
          name: string | null
          period_id: string | null
          presented_balance: number | null
          tenant_id: string | null
          type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "general_ledger_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "accounting_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      v_cash_flow: {
        Row: {
          code: string | null
          credit: number | null
          debit: number | null
          entry_date: string | null
          name: string | null
          net_change: number | null
          period_id: string | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "accounting_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      v_income_statement: {
        Row: {
          amount: number | null
          code: string | null
          name: string | null
          period_id: string | null
          tenant_id: string | null
          type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "general_ledger_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "accounting_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      v_replenishment_suggestions: {
        Row: {
          avg_daily_consumption: number | null
          current_stock: number | null
          min_stock: number | null
          product_id: string | null
          product_name: string | null
          sku: string | null
          suggested_qty: number | null
          tenant_id: string | null
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
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      v_trial_balance: {
        Row: {
          closing_balance: number | null
          code: string | null
          credit_total: number | null
          debit_total: number | null
          name: string | null
          nature: string | null
          opening_balance: number | null
          period_id: string | null
          tenant_id: string | null
          type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "general_ledger_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "accounting_periods"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accounting_audit_summary: {
        Args: { p_tenant_id: string }
        Returns: {
          payments_unposted: number
          payrolls_unposted: number
          purchases_unposted: number
          returns_unposted: number
          sales_unposted: number
          total_credit: number
          total_debit: number
          total_entries: number
          unbalanced_entries: number
        }[]
      }
      accounting_mapping_catalog: {
        Args: never
        Returns: {
          account_type: string
          fallback_codes: string[]
          mapping_key: string
          module: string
          operation: string
          role_alias: string
          side: string
          sort_order: number
        }[]
      }
      accounting_mapping_status: {
        Args: { p_tenant: string }
        Returns: {
          account_code: string
          account_id: string
          account_name: string
          account_type: string
          detail: string
          expected_type: string
          last_used: string
          lines_count: number
          mapping_key: string
          module: string
          operation: string
          remediation: string
          side: string
          source: string
          type_ok: boolean
        }[]
      }
      accounting_operation_reconciliation: {
        Args: { p_from?: string; p_tenant: string; p_to?: string }
        Returns: {
          detail: string
          difference: number
          documents: number
          documents_amount: number
          documents_posted: number
          documents_unposted: number
          explanation: string
          module: string
          posted_amount: number
          reference_type: string
          remediation: string
          sample: Json
          severity: string
          status: string
        }[]
      }
      add_online_order_note: {
        Args: { p_note: string; p_order_id: string }
        Returns: string
      }
      allocate_consignment_for_sale: {
        Args: { p_sale_id: string }
        Returns: undefined
      }
      apply_accounting_profile: {
        Args: { p_profile_code: string; p_tenant_id: string }
        Returns: number
      }
      apply_as_rider: {
        Args: {
          p_avatar_url?: string
          p_bio?: string
          p_document_id?: string
          p_email?: string
          p_experience_years?: number
          p_full_name: string
          p_phone: string
          p_preferred_zone?: string
          p_vehicle_details?: string
          p_vehicle_plate?: string
          p_vehicle_type: string
        }
        Returns: string
      }
      apply_coupon_to_sale: {
        Args: { p_coupon_id: string; p_discount: number; p_sale_id: string }
        Returns: undefined
      }
      approve_leave: {
        Args: { p_approve: boolean; p_leave_id: string; p_reason?: string }
        Returns: undefined
      }
      approve_payroll_run: { Args: { p_payroll_id: string }; Returns: string }
      auto_assign_best_rider: { Args: { p_order_id: string }; Returns: Json }
      auto_match_bank_transaction: {
        Args: { p_tx_id: string }
        Returns: string
      }
      auto_reconcile_bank_account: {
        Args: { p_bank_account_id: string }
        Returns: number
      }
      award_loyalty_points: { Args: { p_sale_id: string }; Returns: number }
      bill_kitchen_order: {
        Args: { p_order_id: string; p_sale_id: string }
        Returns: undefined
      }
      bootstrap_tenant_accounting: { Args: { p_tenant: string }; Returns: Json }
      br_generate_nfe: { Args: { p_sale_id: string }; Returns: string }
      br_generate_sped_ecd: {
        Args: { p_fiscal_year: number; p_tenant_id: string }
        Returns: string
      }
      br_get_icms_rate: {
        Args: { p_uf_from: string; p_uf_to: string }
        Returns: number
      }
      br_get_iss_rate: {
        Args: { p_ibge: string; p_service?: string }
        Returns: number
      }
      calculate_shift_summary: { Args: { p_shift_id: string }; Returns: Json }
      cancel_delivery_assignment: {
        Args: { p_order_id: string; p_reason?: string }
        Returns: undefined
      }
      cancel_sale: {
        Args: { p_reason: string; p_sale_id: string }
        Returns: undefined
      }
      certify_financial_integrity: {
        Args: { p_tenant: string }
        Returns: {
          actual: number
          check_name: string
          detail: string
          expected: number
          status: string
        }[]
      }
      claim_operation: {
        Args: {
          p_correlation_id?: string
          p_idempotency_key: string
          p_operation: string
          p_result_id?: string
          p_tenant_id: string
        }
        Returns: {
          found: boolean
          result_id: string
        }[]
      }
      clock_in: {
        Args: {
          p_employee_id: string
          p_lat?: number
          p_lng?: number
          p_photo?: string
          p_source?: string
          p_store_id?: string
        }
        Returns: string
      }
      clock_out: {
        Args: {
          p_employee_id: string
          p_lat?: number
          p_lng?: number
          p_photo?: string
        }
        Returns: string
      }
      close_accounting_period: { Args: { p_period: string }; Returns: Json }
      close_bank_reconciliation: {
        Args: { p_reconciliation_id: string }
        Returns: boolean
      }
      close_fiscal_year: {
        Args: { p_fiscal_year_id: string }
        Returns: boolean
      }
      close_shift_with_summary: {
        Args: { p_declared_cash: number; p_notes?: string; p_shift_id: string }
        Returns: Json
      }
      close_shift_z: {
        Args: { p_counted_cash?: number; p_shift_id: string }
        Returns: Json
      }
      compute_cu_tax_declaration: {
        Args: {
          p_declaration_type?: string
          p_period_id: string
          p_tax_rate?: number
          p_tenant: string
        }
        Returns: string
      }
      compute_payroll: {
        Args: { _employee_id: string; _end: string; _start: string }
        Returns: {
          base: number
          hours_worked: number
        }[]
      }
      compute_payroll_full: {
        Args: {
          _bonuses?: number
          _employee_id: string
          _other_deductions?: number
          _period_end: string
          _period_start: string
        }
        Returns: {
          base_salary: number
          gross_salary: number
          hours_worked: number
          irpf_amount: number
          net_pay: number
          overtime_amount: number
          ss_company_amount: number
          ss_worker_amount: number
          taxable_base: number
        }[]
      }
      compute_tax_breakdown: {
        Args: {
          p_applies_to?: string
          p_base: number
          p_codes?: string[]
          p_tenant: string
        }
        Returns: {
          amount: number
          code: string
          name: string
          rate: number
          rule_type: string
        }[]
      }
      compute_tax_declaration: {
        Args: {
          p_declaration_type?: string
          p_period_id: string
          p_tax_rate?: number
          p_tenant: string
        }
        Returns: string
      }
      confirm_online_order: {
        Args: { p_order_id: string; p_payments?: Json }
        Returns: string
      }
      create_fiscal_year: {
        Args: { p_start_month?: number; p_tenant_id: string; p_year: number }
        Returns: string
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
      create_quick_sale:
        | {
            Args: {
              p_customer_id: string
              p_employee_id: string
              p_items: Json
              p_notes?: string
              p_payments?: Json
              p_tax_rate?: number
              p_tenant_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_correlation_id?: string
              p_customer_id: string
              p_employee_id: string
              p_idempotency_key: string
              p_items: Json
              p_notes: string
              p_payments: Json
              p_tax_rate: number
              p_tenant_id: string
            }
            Returns: string
          }
      create_sale_return: {
        Args: {
          p_items: Json
          p_location_id?: string
          p_location_type?: string
          p_reason?: string
          p_refund_method?: string
          p_restock?: boolean
          p_sale_id: string
        }
        Returns: string
      }
      cu_calculate_cost_sheet: { Args: { p_sheet_id: string }; Returns: number }
      cu_generate_tax_declaration: {
        Args: {
          p_declaration_type: string
          p_period_id: string
          p_tenant_id: string
        }
        Returns: string
      }
      current_actor_label: { Args: never; Returns: string }
      distance_km: {
        Args: { lat1: number; lat2: number; lon1: number; lon2: number }
        Returns: number
      }
      domain_events_shadow_summary: {
        Args: { p_tenant_id: string }
        Returns: Json
      }
      emit_domain_event: {
        Args: {
          p_aggregate_id: string
          p_aggregate_type: string
          p_event_type: string
          p_metadata?: Json
          p_payload?: Json
          p_source?: string
          p_tenant_id: string
        }
        Returns: string
      }
      employee_vacation_balance: {
        Args: { p_employee_id: string; p_year?: number }
        Returns: {
          entitled: number
          pending: number
          remaining: number
          taken: number
        }[]
      }
      enqueue_webhook_event: {
        Args: { p_event: string; p_payload: Json; p_tenant_id: string }
        Returns: undefined
      }
      ensure_default_accounts: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      ensure_pos_settings: {
        Args: { p_tenant_id: string }
        Returns: {
          allow_discounts: boolean
          allow_negative_stock: boolean
          auto_print_receipt: boolean
          created_at: string
          default_credit_days: number
          default_currency: string
          default_tax_rate_id: string | null
          id: string
          max_discount_pct: number
          receipt_footer: string | null
          receipt_width: number
          rounding_mode: string
          secondary_currency: string | null
          silent_print: boolean
          tax_included: boolean
          tenant_id: string
          tip_enabled: boolean
          tip_percentages: number[]
          tip_required: boolean
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "pos_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      financial_engine_diagnostics: {
        Args: { p_tenant: string }
        Returns: {
          area: string
          check_code: string
          detail: string
          expected: number
          metric: number
          remediation: string
          severity: string
          status: string
        }[]
      }
      financial_health_check: {
        Args: { p_tenant: string }
        Returns: {
          area: string
          check_name: string
          detail: string
          metric: number
          status: string
        }[]
      }
      financial_health_check_tax: {
        Args: { p_tenant: string }
        Returns: {
          area: string
          check_name: string
          detail: string
          metric: number
          status: string
        }[]
      }
      financial_kpi_breakdown: {
        Args: { p_period_id?: string; p_tenant: string }
        Returns: {
          account_code: string
          account_name: string
          account_type: string
          bucket: string
          closing_balance: number
          credit_total: number
          debit_total: number
        }[]
      }
      find_account_by_codes: {
        Args: { p_codes: string[]; p_tenant: string }
        Returns: string
      }
      forecast_cashflow: {
        Args: { p_tenant: string; p_weeks?: number }
        Returns: {
          inflow: number
          is_shortfall: boolean
          net: number
          outflow: number
          running_balance: number
          week_start: string
        }[]
      }
      forecast_demand: {
        Args: { p_horizon?: number; p_tenant: string; p_window?: number }
        Returns: {
          avg_daily: number
          days_of_stock: number
          min_stock: number
          product_id: string
          product_name: string
          projected_demand: number
          sku: string
          stock: number
          suggested_reorder: number
        }[]
      }
      generate_payroll_batch: {
        Args: {
          p_bonus?: number
          p_deductions?: number
          p_period_end: string
          p_period_start: string
          p_tenant_id: string
        }
        Returns: Json
      }
      generate_sepa_xml: {
        Args: { _bank_account_id: string; _payroll_run_ids: string[] }
        Returns: string
      }
      get_exchange_rate: {
        Args: { p_currency: string; p_date?: string; p_tenant: string }
        Returns: number
      }
      get_financial_kpis: {
        Args: { p_period_id?: string; p_tenant: string }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      ignore_bank_transaction: { Args: { p_tx_id: string }; Returns: undefined }
      import_chart_template: {
        Args: { p_template: string; p_tenant_id: string }
        Returns: number
      }
      is_superadmin: { Args: { _user_id: string }; Returns: boolean }
      is_tenant_member:
        | { Args: { _tenant: string }; Returns: boolean }
        | { Args: { _tenant_id: string; _user_id: string }; Returns: boolean }
      is_tenant_owner: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      issue_invoice: {
        Args: { p_sale_id: string; p_series_code?: string }
        Returns: string
      }
      log_online_order_event: {
        Args: {
          p_assignment_id?: string
          p_event_type: string
          p_from?: string
          p_metadata?: Json
          p_note?: string
          p_order_id: string
          p_to?: string
        }
        Returns: string
      }
      mark_invoice_transmitted: {
        Args: {
          p_cufe?: string
          p_invoice_id: string
          p_provider?: string
          p_response?: Json
          p_status: string
          p_xml?: string
          p_xml_url?: string
        }
        Returns: undefined
      }
      match_bank_transaction: {
        Args: { p_payment_id: string; p_tx_id: string }
        Returns: undefined
      }
      my_attendance: {
        Args: { _from?: string; _to?: string }
        Returns: {
          check_in: string
          check_in_lat: number | null
          check_in_lng: number | null
          check_in_photo: string | null
          check_out: string | null
          check_out_lat: number | null
          check_out_lng: number | null
          check_out_photo: string | null
          created_at: string
          employee_id: string
          hours_worked: number | null
          id: string
          notes: string | null
          source: string
          status: string
          store_id: string | null
          tenant_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "employee_attendance"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      my_employee_record: {
        Args: never
        Returns: {
          email: string
          emp_name: string
          id: string
          job_position: string
          salary: number
          tenant_id: string
        }[]
      }
      my_leave_requests: {
        Args: never
        Returns: {
          approved_at: string | null
          approved_by: string | null
          attachment_url: string | null
          created_at: string
          days: number
          employee_id: string
          end_date: string
          id: string
          leave_type: string
          reason: string | null
          rejection_reason: string | null
          start_date: string
          status: string
          tenant_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "leave_requests"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      my_payslips: {
        Args: never
        Returns: {
          approved_at: string | null
          approved_by: string | null
          base_salary: number
          bonus: number
          bonuses_amount: number
          created_at: string
          deductions: number
          employee_id: string
          gross_salary: number
          hours_worked: number
          id: string
          irpf_amount: number
          journal_entry_id: string | null
          net_pay: number
          notes: string | null
          other_deductions: number
          overtime_amount: number
          paid_at: string | null
          payment_iban: string | null
          payment_method: string
          payslip_url: string | null
          period_end: string
          period_start: string
          receipt_number: string | null
          sepa_export_id: string | null
          ss_company_amount: number
          ss_worker_amount: number
          status: string
          taxable_base: number
          tenant_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "payroll_runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      my_permissions: {
        Args: never
        Returns: {
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_view: boolean
          slug: string
        }[]
      }
      my_vacation_balance: {
        Args: never
        Returns: {
          entitled: number
          pending: number
          remaining: number
          taken: number
        }[]
      }
      open_shift: {
        Args: {
          _employee_id: string
          _notes?: string
          _opening_cash: number
          _pin?: string
          _store_id: string
        }
        Returns: string
      }
      pay_payroll: {
        Args: { _method?: string; _notes?: string; _payroll_id: string }
        Returns: string
      }
      place_online_order: {
        Args: {
          p_customer_email?: string
          p_customer_name: string
          p_customer_phone: string
          p_delivery_address?: string
          p_delivery_instructions?: string
          p_delivery_lat?: number
          p_delivery_lng?: number
          p_delivery_type?: string
          p_items: Json
          p_notes?: string
          p_payment_method?: string
          p_store_id?: string
          p_tenant_id: string
          p_zone_id?: string
        }
        Returns: string
      }
      post_financial_event: { Args: { p_event_id: string }; Returns: string }
      post_journal_entry: { Args: { p_entry_id: string }; Returns: undefined }
      post_payment_journal_entry: {
        Args: { p_payment_id: string }
        Returns: string
      }
      post_payroll_journal_entry: {
        Args: { _payroll_id: string }
        Returns: string
      }
      post_purchase_journal_entry: {
        Args: { p_purchase_id: string }
        Returns: string
      }
      post_sale_journal_entry: { Args: { p_sale_id: string }; Returns: string }
      post_sale_return_journal_entry: {
        Args: { p_return_id: string }
        Returns: string
      }
      process_recipe_consumption: {
        Args: {
          p_location_id: string
          p_location_type: string
          p_product_id: string
          p_qty: number
          p_sale_id: string
          p_tenant_id: string
        }
        Returns: undefined
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
      public_demo_stats: { Args: never; Returns: Json }
      rate_delivery: {
        Args: {
          p_comment?: string
          p_criteria?: Json
          p_order_id: string
          p_ratee_role: string
          p_rater_role: string
          p_stars: number
        }
        Returns: string
      }
      reassign_delivery: {
        Args: {
          p_order_id: string
          p_reason?: string
          p_rider_profile_id: string
        }
        Returns: string
      }
      rebuild_general_ledger:
        | { Args: { p_period_id: string }; Returns: number }
        | { Args: { p_period: string; p_tenant: string }; Returns: number }
      rebuild_general_ledger_all: {
        Args: { p_tenant: string }
        Returns: number
      }
      rebuild_knowledge_graph: { Args: { p_tenant_id: string }; Returns: Json }
      receive_purchase:
        | { Args: { p_purchase_id: string }; Returns: undefined }
        | {
            Args: {
              p_correlation_id?: string
              p_idempotency_key: string
              p_purchase_id: string
            }
            Returns: undefined
          }
      receive_purchase_consignment: {
        Args: { p_purchase_id: string }
        Returns: undefined
      }
      receive_stock_transfer: {
        Args: { p_transfer_id: string }
        Returns: undefined
      }
      recommend_orders_for_rider: {
        Args: { p_limit?: number }
        Returns: {
          assignment_id: string
          business_name: string
          delivery_fee: number
          distance_to_pickup: number
          dropoff_address: string
          extra_distance: number
          online_order_id: string
          pickup_address: string
          reasons: Json
          score: number
          tenant_id: string
          total: number
        }[]
      }
      recommend_riders_for_order: {
        Args: { p_limit?: number; p_order_id: string }
        Returns: {
          acceptance_rate: number
          active_deliveries: number
          avatar_url: string
          deliveries_completed: number
          distance_km: number
          full_name: string
          punctuality: number
          rating_avg: number
          reasons: Json
          rider_profile_id: string
          score: number
          vehicle_type: string
        }[]
      }
      recompute_cu_cost_sheet: {
        Args: { p_cost_sheet_id: string }
        Returns: Json
      }
      redeem_loyalty_points: {
        Args: { p_customer_id: string; p_points: number; p_sale_id?: string }
        Returns: number
      }
      refresh_shift_totals: { Args: { p_shift_id: string }; Returns: undefined }
      register_account_payment:
        | {
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
        | {
            Args: {
              p_amount: number
              p_correlation_id?: string
              p_currency: string
              p_exchange_rate: number
              p_idempotency_key: string
              p_method: string
              p_notes: string
              p_party_id: string
              p_party_type: string
              p_reference_id: string
              p_reference_type: string
            }
            Returns: string
          }
      register_shift_cash_movement: {
        Args: {
          p_amount: number
          p_category?: string
          p_currency?: string
          p_exchange_rate?: number
          p_movement_type: string
          p_reason?: string
          p_shift_id: string
        }
        Returns: Json
      }
      register_stock_adjustment: {
        Args: {
          p_kind?: string
          p_location_id: string
          p_location_type: string
          p_photo_url?: string
          p_product_id: string
          p_quantity: number
          p_reason: string
        }
        Returns: string
      }
      relink_chart_parents: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      reopen_accounting_period: {
        Args: { p_period_id: string }
        Returns: undefined
      }
      report_balance_sheet: {
        Args: { p_tenant: string; p_to: string }
        Returns: {
          amount: number
          code: string
          name: string
          section: string
        }[]
      }
      report_general_ledger: {
        Args: { p_from: string; p_tenant: string; p_to: string }
        Returns: {
          code: string
          credit: number
          debit: number
          description: string
          entry_date: string
          entry_number: string
          name: string
          running_balance: number
        }[]
      }
      report_income_statement: {
        Args: { p_from: string; p_tenant: string; p_to: string }
        Returns: {
          amount: number
          code: string
          name: string
          section: string
        }[]
      }
      report_journal: {
        Args: { p_from: string; p_tenant: string; p_to: string }
        Returns: {
          code: string
          credit: number
          debit: number
          entry_date: string
          entry_description: string
          entry_id: string
          entry_number: string
          line_description: string
          name: string
        }[]
      }
      report_trial_balance: {
        Args: { p_from: string; p_tenant: string; p_to: string }
        Returns: {
          balance: number
          code: string
          credit: number
          debit: number
          name: string
          nature: string
          type: string
        }[]
      }
      request_delivery_assignment: {
        Args: {
          p_order_id: string
          p_reasons?: Json
          p_rider_profile_id: string
          p_score?: number
        }
        Returns: string
      }
      request_leave: {
        Args: {
          p_employee_id: string
          p_end: string
          p_reason?: string
          p_start: string
          p_type: string
        }
        Returns: string
      }
      resolve_account_by_pattern: {
        Args: { p_role: string; p_tenant: string }
        Returns: string
      }
      resolve_account_by_role: {
        Args: { p_role: string; p_tenant: string }
        Returns: string
      }
      resolve_account_by_type: {
        Args: { p_codes?: string[]; p_tenant: string; p_type: string }
        Returns: string
      }
      resolve_account_id: {
        Args: { p_code: string; p_tenant_id: string }
        Returns: string
      }
      resolve_cash_counterpart: {
        Args: { p_category: string; p_tenant: string }
        Returns: string
      }
      resolve_fiscal_rules: {
        Args: { p_applies_to?: string; p_tenant: string }
        Returns: {
          applies_to: string
          base: string
          code: string
          config: Json
          is_default: boolean
          name: string
          rate: number
          rule_type: string
          source: string
        }[]
      }
      resolve_fiscal_year_id: {
        Args: { p_date: string; p_tenant: string }
        Returns: string
      }
      resolve_mapped_account: {
        Args: { p_codes?: string[]; p_key: string; p_tenant: string }
        Returns: string
      }
      resolve_period: {
        Args: { p_date: string; p_tenant_id: string }
        Returns: string
      }
      resolve_period_id: {
        Args: { p_date: string; p_tenant: string }
        Returns: string
      }
      reverse_journal_entry: {
        Args: { p_entry_id: string; p_reason: string }
        Returns: string
      }
      revert_sale_stock: { Args: { p_sale_id: string }; Returns: undefined }
      review_rider_application: {
        Args: { p_notes?: string; p_rider_id: string; p_status: string }
        Returns: undefined
      }
      rider_advance_delivery: {
        Args: { p_assignment_id: string; p_status: string }
        Returns: undefined
      }
      rider_respond_assignment: {
        Args: { p_accept: boolean; p_assignment_id: string; p_reason?: string }
        Returns: undefined
      }
      sale_returnable_items: {
        Args: { p_sale_id: string }
        Returns: {
          price: number
          product_id: string
          product_name: string
          qty_available: number
          qty_returned: number
          qty_sold: number
          sale_item_id: string
        }[]
      }
      sales_channel_summary: {
        Args: { p_from?: string; p_tenant_id: string; p_to?: string }
        Returns: {
          amount: number
          avg_ticket: number
          channel: string
          customers: number
          fulfillment: string
          returns_amount: number
          returns_count: number
          sales_count: number
        }[]
      }
      seed_default_tax_brackets: {
        Args: { _tenant: string; _year?: number }
        Returns: undefined
      }
      set_employee_pin: {
        Args: { _employee_id: string; _pin: string }
        Returns: undefined
      }
      set_online_order_status: {
        Args: { p_order_id: string; p_reason?: string; p_status: string }
        Returns: undefined
      }
      set_rider_availability: {
        Args: { p_availability: string }
        Returns: undefined
      }
      settle_consignment_lots: {
        Args: {
          p_method?: string
          p_notes?: string
          p_settlement_ids: string[]
        }
        Returns: string
      }
      smoke_test_financial_core: {
        Args: { p_tenant: string }
        Returns: {
          check_name: string
          detail: string
          status: string
        }[]
      }
      submit_cu_tax_declaration: {
        Args: { p_declaration_id: string }
        Returns: Json
      }
      sync_accounting_mappings: { Args: { p_tenant: string }; Returns: number }
      sync_offline_operation: {
        Args: {
          p_client_uuid: string
          p_payload?: Json
          p_tenant_id: string
          p_type: string
        }
        Returns: Json
      }
      sync_offline_sale: { Args: { p_payload: Json }; Returns: string }
      twin_baseline: {
        Args: { p_days?: number; p_tenant_id: string }
        Returns: Json
      }
      update_online_order: {
        Args: {
          p_customer_name?: string
          p_customer_phone?: string
          p_delivery_address?: string
          p_delivery_fee?: number
          p_delivery_instructions?: string
          p_delivery_type?: string
          p_notes?: string
          p_order_id: string
        }
        Returns: undefined
      }
      update_payroll_run: {
        Args: {
          p_base_salary?: number
          p_bonus?: number
          p_deductions?: number
          p_hours_worked?: number
          p_notes?: string
          p_payment_method?: string
          p_payroll_id: string
        }
        Returns: string
      }
      update_rider_location: {
        Args: {
          p_accuracy?: number
          p_battery?: number
          p_heading?: number
          p_lat: number
          p_lng: number
          p_speed?: number
        }
        Returns: undefined
      }
      update_shift: {
        Args: {
          _employee_id?: string
          _notes?: string
          _opening_cash?: number
          _pin?: string
          _shift_id: string
        }
        Returns: undefined
      }
      validate_coupon: {
        Args: {
          p_amount: number
          p_code: string
          p_customer_id?: string
          p_tenant_id: string
        }
        Returns: Json
      }
      verify_employee_pin: {
        Args: { _employee_id: string; _pin: string }
        Returns: boolean
      }
    }
    Enums: {
      action_status: "pending" | "approved" | "rejected" | "executed" | "failed"
      agent_status: "active" | "paused" | "training" | "error"
      agent_type:
        | "cfo"
        | "inventory"
        | "operations"
        | "marketplace"
        | "compliance"
        | "procurement"
        | "analytics"
      app_role:
        | "admin"
        | "gerente"
        | "supervisor"
        | "cajero"
        | "inventarista"
        | "contador"
        | "empleado"
      autonomy_level: "manual" | "suggest" | "auto_approve" | "autonomous"
      risk_severity: "low" | "medium" | "high" | "critical"
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
      action_status: ["pending", "approved", "rejected", "executed", "failed"],
      agent_status: ["active", "paused", "training", "error"],
      agent_type: [
        "cfo",
        "inventory",
        "operations",
        "marketplace",
        "compliance",
        "procurement",
        "analytics",
      ],
      app_role: [
        "admin",
        "gerente",
        "supervisor",
        "cajero",
        "inventarista",
        "contador",
        "empleado",
      ],
      autonomy_level: ["manual", "suggest", "auto_approve", "autonomous"],
      risk_severity: ["low", "medium", "high", "critical"],
    },
  },
} as const
