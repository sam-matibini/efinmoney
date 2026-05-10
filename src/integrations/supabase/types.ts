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
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: unknown
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          account_name: string
          account_number: string
          account_type: string
          bank_name: string
          created_at: string
          currency_code: string
          id: string
          is_active: boolean
          last_reconciled_at: string | null
          ledger_account_id: string | null
          routing_number: string | null
          swift_code: string | null
        }
        Insert: {
          account_name: string
          account_number: string
          account_type?: string
          bank_name: string
          created_at?: string
          currency_code: string
          id?: string
          is_active?: boolean
          last_reconciled_at?: string | null
          ledger_account_id?: string | null
          routing_number?: string | null
          swift_code?: string | null
        }
        Update: {
          account_name?: string
          account_number?: string
          account_type?: string
          bank_name?: string
          created_at?: string
          currency_code?: string
          id?: string
          is_active?: boolean
          last_reconciled_at?: string | null
          ledger_account_id?: string | null
          routing_number?: string | null
          swift_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "bank_accounts_ledger_account_id_fkey"
            columns: ["ledger_account_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          ai_confidence: number | null
          balance: number | null
          bank_account_id: string
          categorized_at: string | null
          category: string | null
          credit_account_id: string | null
          credit_amount: number | null
          debit_account_id: string | null
          debit_amount: number | null
          description: string
          id: string
          import_batch_id: string | null
          imported_at: string
          is_categorized: boolean
          is_posted: boolean
          journal_id: string | null
          post_date: string | null
          posted_at: string | null
          raw_data: Json | null
          reference: string | null
          rule_id: string | null
          transaction_date: string
        }
        Insert: {
          ai_confidence?: number | null
          balance?: number | null
          bank_account_id: string
          categorized_at?: string | null
          category?: string | null
          credit_account_id?: string | null
          credit_amount?: number | null
          debit_account_id?: string | null
          debit_amount?: number | null
          description: string
          id?: string
          import_batch_id?: string | null
          imported_at?: string
          is_categorized?: boolean
          is_posted?: boolean
          journal_id?: string | null
          post_date?: string | null
          posted_at?: string | null
          raw_data?: Json | null
          reference?: string | null
          rule_id?: string | null
          transaction_date: string
        }
        Update: {
          ai_confidence?: number | null
          balance?: number | null
          bank_account_id?: string
          categorized_at?: string | null
          category?: string | null
          credit_account_id?: string | null
          credit_amount?: number | null
          debit_account_id?: string | null
          debit_amount?: number | null
          description?: string
          id?: string
          import_batch_id?: string | null
          imported_at?: string
          is_categorized?: boolean
          is_posted?: boolean
          journal_id?: string | null
          post_date?: string | null
          posted_at?: string | null
          raw_data?: Json | null
          reference?: string | null
          rule_id?: string | null
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
            foreignKeyName: "bank_transactions_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_debit_account_id_fkey"
            columns: ["debit_account_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "transaction_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      beneficiaries: {
        Row: {
          avatar_initials: string | null
          bank_account: string | null
          bank_name: string | null
          country_code: string | null
          created_at: string
          currency_code: string | null
          id: string
          last_sent_at: string | null
          name: string
          network: string | null
          nickname: string | null
          payout_method: string | null
          phone: string | null
          transfer_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_initials?: string | null
          bank_account?: string | null
          bank_name?: string | null
          country_code?: string | null
          created_at?: string
          currency_code?: string | null
          id?: string
          last_sent_at?: string | null
          name: string
          network?: string | null
          nickname?: string | null
          payout_method?: string | null
          phone?: string | null
          transfer_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_initials?: string | null
          bank_account?: string | null
          bank_name?: string | null
          country_code?: string | null
          created_at?: string
          currency_code?: string | null
          id?: string
          last_sent_at?: string | null
          name?: string
          network?: string | null
          nickname?: string | null
          payout_method?: string | null
          phone?: string | null
          transfer_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cards: {
        Row: {
          card_network: string
          card_number: string | null
          card_type: string
          cardholder_name: string
          created_at: string
          credit_limit: number | null
          cvv: string | null
          expires_at: string
          expiry_month: number | null
          expiry_year: number | null
          funding_source: string
          id: string
          last_four: string
          spending_limit: number
          status: string
          updated_at: string
          user_id: string
          wallet_id: string | null
        }
        Insert: {
          card_network?: string
          card_number?: string | null
          card_type?: string
          cardholder_name: string
          created_at?: string
          credit_limit?: number | null
          cvv?: string | null
          expires_at?: string
          expiry_month?: number | null
          expiry_year?: number | null
          funding_source?: string
          id?: string
          last_four: string
          spending_limit?: number
          status?: string
          updated_at?: string
          user_id: string
          wallet_id?: string | null
        }
        Update: {
          card_network?: string
          card_number?: string | null
          card_type?: string
          cardholder_name?: string
          created_at?: string
          credit_limit?: number | null
          cvv?: string | null
          expires_at?: string
          expiry_month?: number | null
          expiry_year?: number | null
          funding_source?: string
          id?: string
          last_four?: string
          spending_limit?: number
          status?: string
          updated_at?: string
          user_id?: string
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cards_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_alerts: {
        Row: {
          alert_data: Json
          assigned_to: string | null
          created_at: string
          id: string
          notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          rule_id: string
          severity: Database["public"]["Enums"]["alert_severity"]
          status: Database["public"]["Enums"]["alert_status"]
          transfer_id: string | null
          user_id: string | null
        }
        Insert: {
          alert_data?: Json
          assigned_to?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rule_id: string
          severity: Database["public"]["Enums"]["alert_severity"]
          status?: Database["public"]["Enums"]["alert_status"]
          transfer_id?: string | null
          user_id?: string | null
        }
        Update: {
          alert_data?: Json
          assigned_to?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rule_id?: string
          severity?: Database["public"]["Enums"]["alert_severity"]
          status?: Database["public"]["Enums"]["alert_status"]
          transfer_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_alerts_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "compliance_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_alerts_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_reports: {
        Row: {
          created_at: string
          filed_at: string | null
          filed_by: string | null
          id: string
          jurisdiction: string
          report_data: Json
          report_type: string
          reporting_period_end: string
          reporting_period_start: string
          status: string
        }
        Insert: {
          created_at?: string
          filed_at?: string | null
          filed_by?: string | null
          id?: string
          jurisdiction: string
          report_data?: Json
          report_type: string
          reporting_period_end: string
          reporting_period_start: string
          status?: string
        }
        Update: {
          created_at?: string
          filed_at?: string | null
          filed_by?: string | null
          id?: string
          jurisdiction?: string
          report_data?: Json
          report_type?: string
          reporting_period_end?: string
          reporting_period_start?: string
          status?: string
        }
        Relationships: []
      }
      compliance_rules: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          parameters: Json
          rule_code: string
          rule_name: string
          rule_type: string
          severity: Database["public"]["Enums"]["alert_severity"]
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          parameters?: Json
          rule_code: string
          rule_name: string
          rule_type: string
          severity?: Database["public"]["Enums"]["alert_severity"]
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          parameters?: Json
          rule_code?: string
          rule_name?: string
          rule_type?: string
          severity?: Database["public"]["Enums"]["alert_severity"]
        }
        Relationships: []
      }
      crm_activities: {
        Row: {
          activity_type: string
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          description: string | null
          due_date: string | null
          id: string
          subject: string
          updated_at: string
        }
        Insert: {
          activity_type: string
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          description?: string | null
          due_date?: string | null
          id?: string
          subject: string
          updated_at?: string
        }
        Update: {
          activity_type?: string
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          description?: string | null
          due_date?: string | null
          id?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_activities_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      crypto_pairs: {
        Row: {
          base_currency: string
          created_at: string
          id: string
          is_active: boolean
          max_trade_amount: number | null
          min_trade_amount: number
          quote_currency: string
          trading_fee_percent: number
        }
        Insert: {
          base_currency: string
          created_at?: string
          id?: string
          is_active?: boolean
          max_trade_amount?: number | null
          min_trade_amount?: number
          quote_currency: string
          trading_fee_percent?: number
        }
        Update: {
          base_currency?: string
          created_at?: string
          id?: string
          is_active?: boolean
          max_trade_amount?: number | null
          min_trade_amount?: number
          quote_currency?: string
          trading_fee_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "crypto_pairs_base_currency_fkey"
            columns: ["base_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "crypto_pairs_quote_currency_fkey"
            columns: ["quote_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      crypto_trades: {
        Row: {
          base_amount: number
          base_wallet_id: string | null
          created_at: string
          executed_at: string | null
          fee_amount: number
          fee_currency: string | null
          id: string
          journal_id: string | null
          pair_id: string
          price: number
          quote_amount: number
          quote_wallet_id: string | null
          side: Database["public"]["Enums"]["trade_side"]
          status: Database["public"]["Enums"]["trade_status"]
          user_id: string | null
        }
        Insert: {
          base_amount: number
          base_wallet_id?: string | null
          created_at?: string
          executed_at?: string | null
          fee_amount?: number
          fee_currency?: string | null
          id?: string
          journal_id?: string | null
          pair_id: string
          price: number
          quote_amount: number
          quote_wallet_id?: string | null
          side: Database["public"]["Enums"]["trade_side"]
          status?: Database["public"]["Enums"]["trade_status"]
          user_id?: string | null
        }
        Update: {
          base_amount?: number
          base_wallet_id?: string | null
          created_at?: string
          executed_at?: string | null
          fee_amount?: number
          fee_currency?: string | null
          id?: string
          journal_id?: string | null
          pair_id?: string
          price?: number
          quote_amount?: number
          quote_wallet_id?: string | null
          side?: Database["public"]["Enums"]["trade_side"]
          status?: Database["public"]["Enums"]["trade_status"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crypto_trades_base_wallet_id_fkey"
            columns: ["base_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crypto_trades_fee_currency_fkey"
            columns: ["fee_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "crypto_trades_pair_id_fkey"
            columns: ["pair_id"]
            isOneToOne: false
            referencedRelation: "crypto_pairs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crypto_trades_quote_wallet_id_fkey"
            columns: ["quote_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      currencies: {
        Row: {
          code: string
          created_at: string
          currency_type: Database["public"]["Enums"]["currency_type"]
          decimal_places: number
          flag_emoji: string | null
          is_active: boolean
          name: string
          symbol: string
        }
        Insert: {
          code: string
          created_at?: string
          currency_type?: Database["public"]["Enums"]["currency_type"]
          decimal_places?: number
          flag_emoji?: string | null
          is_active?: boolean
          name: string
          symbol: string
        }
        Update: {
          code?: string
          created_at?: string
          currency_type?: Database["public"]["Enums"]["currency_type"]
          decimal_places?: number
          flag_emoji?: string | null
          is_active?: boolean
          name?: string
          symbol?: string
        }
        Relationships: []
      }
      customer_communications: {
        Row: {
          channel: string
          content: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          direction: string
          id: string
          metadata: Json | null
          read_at: string | null
          sent_at: string | null
          status: string
          subject: string | null
          template_id: string | null
          user_id: string | null
        }
        Insert: {
          channel: string
          content: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          direction: string
          id?: string
          metadata?: Json | null
          read_at?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_id?: string | null
          user_id?: string | null
        }
        Update: {
          channel?: string
          content?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          direction?: string
          id?: string
          metadata?: Json | null
          read_at?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_communications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_documents: {
        Row: {
          customer_id: string
          document_type: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          onboarding_id: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          uploaded_at: string
        }
        Insert: {
          customer_id: string
          document_type: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          onboarding_id?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          uploaded_at?: string
        }
        Update: {
          customer_id?: string
          document_type?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          onboarding_id?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_documents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_documents_onboarding_id_fkey"
            columns: ["onboarding_id"]
            isOneToOne: false
            referencedRelation: "customer_onboarding"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_onboarding: {
        Row: {
          completed_at: string | null
          created_at: string
          customer_id: string
          id: string
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          step_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          customer_id: string
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          step_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          step_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_onboarding_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_onboarding_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "onboarding_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_portal_access: {
        Row: {
          access_token: string | null
          created_at: string
          customer_id: string
          id: string
          is_active: boolean
          last_login_at: string | null
          token_expires_at: string | null
          user_id: string | null
        }
        Insert: {
          access_token?: string | null
          created_at?: string
          customer_id: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          token_expires_at?: string | null
          user_id?: string | null
        }
        Update: {
          access_token?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          token_expires_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_portal_access_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          company_type: string | null
          created_at: string
          credit_limit: number | null
          currency_code: string | null
          date_of_incorporation: string | null
          email: string | null
          id: string
          industry: string | null
          is_active: boolean
          kyc_status: string | null
          kyc_verified_at: string | null
          kyc_verified_by: string | null
          name: string
          notes: string | null
          onboarding_completed_at: string | null
          onboarding_started_at: string | null
          payment_terms: number | null
          phone: string | null
          registration_number: string | null
          risk_level: string | null
          tax_id: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          company_type?: string | null
          created_at?: string
          credit_limit?: number | null
          currency_code?: string | null
          date_of_incorporation?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          is_active?: boolean
          kyc_status?: string | null
          kyc_verified_at?: string | null
          kyc_verified_by?: string | null
          name: string
          notes?: string | null
          onboarding_completed_at?: string | null
          onboarding_started_at?: string | null
          payment_terms?: number | null
          phone?: string | null
          registration_number?: string | null
          risk_level?: string | null
          tax_id?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          company_type?: string | null
          created_at?: string
          credit_limit?: number | null
          currency_code?: string | null
          date_of_incorporation?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          is_active?: boolean
          kyc_status?: string | null
          kyc_verified_at?: string | null
          kyc_verified_by?: string | null
          name?: string
          notes?: string | null
          onboarding_completed_at?: string | null
          onboarding_started_at?: string | null
          payment_terms?: number | null
          phone?: string | null
          registration_number?: string | null
          risk_level?: string | null
          tax_id?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      disputes: {
        Row: {
          amount: number | null
          assigned_to: string | null
          created_at: string
          created_by: string | null
          currency_code: string | null
          customer_id: string | null
          customer_statement: string | null
          dispute_type: string
          evidence_urls: string[] | null
          id: string
          priority: string
          reason: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          transaction_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount?: number | null
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          currency_code?: string | null
          customer_id?: string | null
          customer_statement?: string | null
          dispute_type: string
          evidence_urls?: string[] | null
          id?: string
          priority?: string
          reason: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number | null
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          currency_code?: string | null
          customer_id?: string | null
          customer_statement?: string | null
          dispute_type?: string
          evidence_urls?: string[] | null
          id?: string
          priority?: string
          reason?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "disputes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      fx_rates: {
        Row: {
          created_at: string
          effective_rate: number
          from_currency: string
          id: string
          markup_rate: number
          rate: number
          source: string | null
          to_currency: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          effective_rate: number
          from_currency: string
          id?: string
          markup_rate?: number
          rate: number
          source?: string | null
          to_currency: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          effective_rate?: number
          from_currency?: string
          id?: string
          markup_rate?: number
          rate?: number
          source?: string | null
          to_currency?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fx_rates_from_currency_fkey"
            columns: ["from_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "fx_rates_to_currency_fkey"
            columns: ["to_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      fx_transactions: {
        Row: {
          created_at: string
          effective_rate: number
          executed_at: string | null
          fee_amount: number
          from_amount: number
          from_currency: string
          from_wallet_id: string
          id: string
          journal_id: string | null
          market_rate: number
          markup_rate: number
          rate_expires_at: string
          rate_locked_at: string
          status: Database["public"]["Enums"]["trade_status"]
          to_amount: number
          to_currency: string
          to_wallet_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          effective_rate: number
          executed_at?: string | null
          fee_amount?: number
          from_amount: number
          from_currency: string
          from_wallet_id: string
          id?: string
          journal_id?: string | null
          market_rate: number
          markup_rate?: number
          rate_expires_at: string
          rate_locked_at?: string
          status?: Database["public"]["Enums"]["trade_status"]
          to_amount: number
          to_currency: string
          to_wallet_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          effective_rate?: number
          executed_at?: string | null
          fee_amount?: number
          from_amount?: number
          from_currency?: string
          from_wallet_id?: string
          id?: string
          journal_id?: string | null
          market_rate?: number
          markup_rate?: number
          rate_expires_at?: string
          rate_locked_at?: string
          status?: Database["public"]["Enums"]["trade_status"]
          to_amount?: number
          to_currency?: string
          to_wallet_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fx_transactions_from_currency_fkey"
            columns: ["from_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "fx_transactions_from_wallet_id_fkey"
            columns: ["from_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fx_transactions_to_currency_fkey"
            columns: ["to_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "fx_transactions_to_wallet_id_fkey"
            columns: ["to_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      input_tax_credits: {
        Row: {
          claimed_in_filing_id: string | null
          created_at: string
          created_by: string | null
          expense_amount: number
          expense_date: string
          expense_description: string
          id: string
          invoice_reference: string | null
          is_claimed: boolean
          tax_amount: number
          tax_type: Database["public"]["Enums"]["tax_type"]
          vendor_id: string | null
        }
        Insert: {
          claimed_in_filing_id?: string | null
          created_at?: string
          created_by?: string | null
          expense_amount: number
          expense_date: string
          expense_description: string
          id?: string
          invoice_reference?: string | null
          is_claimed?: boolean
          tax_amount: number
          tax_type: Database["public"]["Enums"]["tax_type"]
          vendor_id?: string | null
        }
        Update: {
          claimed_in_filing_id?: string | null
          created_at?: string
          created_by?: string | null
          expense_amount?: number
          expense_date?: string
          expense_description?: string
          id?: string
          invoice_reference?: string | null
          is_claimed?: boolean
          tax_amount?: number
          tax_type?: Database["public"]["Enums"]["tax_type"]
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "input_tax_credits_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_settings: {
        Row: {
          config: Json
          id: string
          is_enabled: boolean
          key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config?: Json
          id?: string
          is_enabled?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config?: Json
          id?: string
          is_enabled?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      intra_ca_transfers: {
        Row: {
          amount_cad: number
          created_at: string
          description: string | null
          destination_wallet_id: string | null
          failure_reason: string | null
          id: string
          plaid_account_id: string | null
          reference: string
          status: string
          stripe_payment_intent_id: string | null
          stripe_status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cad: number
          created_at?: string
          description?: string | null
          destination_wallet_id?: string | null
          failure_reason?: string | null
          id?: string
          plaid_account_id?: string | null
          reference?: string
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cad?: number
          created_at?: string
          description?: string | null
          destination_wallet_id?: string | null
          failure_reason?: string | null
          id?: string
          plaid_account_id?: string | null
          reference?: string
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intra_ca_transfers_destination_wallet_id_fkey"
            columns: ["destination_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intra_ca_transfers_plaid_account_id_fkey"
            columns: ["plaid_account_id"]
            isOneToOne: false
            referencedRelation: "plaid_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_accounts: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          code: string
          created_at: string
          currency_code: string | null
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          parent_id: string | null
        }
        Insert: {
          account_type: Database["public"]["Enums"]["account_type"]
          code: string
          created_at?: string
          currency_code?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          parent_id?: string | null
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          code?: string
          created_at?: string
          currency_code?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_accounts_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "ledger_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          account_id: string
          created_at: string
          created_by: string | null
          credit_amount: number
          currency_code: string
          debit_amount: number
          description: string | null
          id: string
          journal_id: string
          reference_id: string | null
          reference_type: string | null
          wallet_id: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          created_by?: string | null
          credit_amount?: number
          currency_code: string
          debit_amount?: number
          description?: string | null
          id?: string
          journal_id: string
          reference_id?: string | null
          reference_type?: string | null
          wallet_id?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          created_by?: string | null
          credit_amount?: number
          currency_code?: string
          debit_amount?: number
          description?: string | null
          id?: string
          journal_id?: string
          reference_id?: string | null
          reference_type?: string | null
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "ledger_entries_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      linked_funding_sources: {
        Row: {
          created_at: string
          currency_code: string
          display_name: string
          id: string
          institution: string | null
          is_active: boolean
          last_four: string
          source_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency_code?: string
          display_name: string
          id?: string
          institution?: string | null
          is_active?: boolean
          last_four: string
          source_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency_code?: string
          display_name?: string
          id?: string
          institution?: string | null
          is_active?: boolean
          last_four?: string
          source_type?: string
          user_id?: string
        }
        Relationships: []
      }
      maker_checker_requests: {
        Row: {
          action: string
          checked_at: string | null
          checker_id: string | null
          checker_notes: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          expires_at: string | null
          id: string
          maker_id: string
          reason: string | null
          request_data: Json
          request_type: string
          status: string
        }
        Insert: {
          action: string
          checked_at?: string | null
          checker_id?: string | null
          checker_notes?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          expires_at?: string | null
          id?: string
          maker_id: string
          reason?: string | null
          request_data: Json
          request_type: string
          status?: string
        }
        Update: {
          action?: string
          checked_at?: string | null
          checker_id?: string | null
          checker_notes?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          expires_at?: string | null
          id?: string
          maker_id?: string
          reason?: string | null
          request_data?: Json
          request_type?: string
          status?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      onboarding_steps: {
        Row: {
          created_at: string
          description: string | null
          document_type: string | null
          id: string
          is_active: boolean
          is_required: boolean
          name: string
          requires_document: boolean
          step_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          document_type?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          name: string
          requires_document?: boolean
          step_order: number
        }
        Update: {
          created_at?: string
          description?: string | null
          document_type?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          name?: string
          requires_document?: boolean
          step_order?: number
        }
        Relationships: []
      }
      operations_kpis: {
        Row: {
          calculated_at: string
          dimensions: Json | null
          id: string
          metric_name: string
          metric_unit: string | null
          metric_value: number
          period_end: string
          period_start: string
        }
        Insert: {
          calculated_at?: string
          dimensions?: Json | null
          id?: string
          metric_name: string
          metric_unit?: string | null
          metric_value: number
          period_end: string
          period_start: string
        }
        Update: {
          calculated_at?: string
          dimensions?: Json | null
          id?: string
          metric_name?: string
          metric_unit?: string | null
          metric_value?: number
          period_end?: string
          period_start?: string
        }
        Relationships: []
      }
      plaid_accounts: {
        Row: {
          account_number: string | null
          branch_number: string | null
          created_at: string
          currency_code: string | null
          id: string
          institution_number: string | null
          item_id: string
          mask: string | null
          name: string
          official_name: string | null
          plaid_account_id: string
          subtype: string | null
          type: string | null
          user_id: string
        }
        Insert: {
          account_number?: string | null
          branch_number?: string | null
          created_at?: string
          currency_code?: string | null
          id?: string
          institution_number?: string | null
          item_id: string
          mask?: string | null
          name: string
          official_name?: string | null
          plaid_account_id: string
          subtype?: string | null
          type?: string | null
          user_id: string
        }
        Update: {
          account_number?: string | null
          branch_number?: string | null
          created_at?: string
          currency_code?: string | null
          id?: string
          institution_number?: string | null
          item_id?: string
          mask?: string | null
          name?: string
          official_name?: string | null
          plaid_account_id?: string
          subtype?: string | null
          type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plaid_accounts_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "plaid_items"
            referencedColumns: ["id"]
          },
        ]
      }
      plaid_items: {
        Row: {
          access_token: string
          created_at: string
          id: string
          institution_id: string | null
          institution_name: string | null
          item_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          id?: string
          institution_id?: string | null
          institution_name?: string | null
          item_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          id?: string
          institution_id?: string | null
          institution_name?: string | null
          item_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pricing_config: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: number
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value: number
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          country_code: string | null
          created_at: string
          default_currency: string | null
          email: string | null
          full_name: string | null
          id: string
          kyc_status: Database["public"]["Enums"]["kyc_status"]
          kyc_tier: Database["public"]["Enums"]["kyc_tier"]
          phone_number: string | null
          risk_score: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          country_code?: string | null
          created_at?: string
          default_currency?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          kyc_status?: Database["public"]["Enums"]["kyc_status"]
          kyc_tier?: Database["public"]["Enums"]["kyc_tier"]
          phone_number?: string | null
          risk_score?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          country_code?: string | null
          created_at?: string
          default_currency?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          kyc_status?: Database["public"]["Enums"]["kyc_status"]
          kyc_tier?: Database["public"]["Enums"]["kyc_tier"]
          phone_number?: string | null
          risk_score?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_default_currency_fkey"
            columns: ["default_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      purchase_bill_items: {
        Row: {
          account_id: string | null
          amount: number
          bill_id: string
          created_at: string
          description: string
          id: string
          quantity: number
          tax_rate: number | null
          unit_price: number
        }
        Insert: {
          account_id?: string | null
          amount: number
          bill_id: string
          created_at?: string
          description: string
          id?: string
          quantity?: number
          tax_rate?: number | null
          unit_price: number
        }
        Update: {
          account_id?: string | null
          amount?: number
          bill_id?: string
          created_at?: string
          description?: string
          id?: string
          quantity?: number
          tax_rate?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_bill_items_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_bill_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "purchase_bills"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_bills: {
        Row: {
          amount_paid: number
          bill_number: string
          created_at: string
          created_by: string | null
          currency_code: string
          discount_amount: number
          due_date: string
          id: string
          issue_date: string
          journal_id: string | null
          notes: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
          vendor_id: string
          vendor_reference: string | null
        }
        Insert: {
          amount_paid?: number
          bill_number: string
          created_at?: string
          created_by?: string | null
          currency_code?: string
          discount_amount?: number
          due_date: string
          id?: string
          issue_date?: string
          journal_id?: string | null
          notes?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          vendor_id: string
          vendor_reference?: string | null
        }
        Update: {
          amount_paid?: number
          bill_number?: string
          created_at?: string
          created_by?: string | null
          currency_code?: string
          discount_amount?: number
          due_date?: string
          id?: string
          issue_date?: string
          journal_id?: string | null
          notes?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          vendor_id?: string
          vendor_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_bills_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          count: number
          created_at: string
          expires_at: string
          key: string
        }
        Insert: {
          count?: number
          created_at?: string
          expires_at: string
          key: string
        }
        Update: {
          count?: number
          created_at?: string
          expires_at?: string
          key?: string
        }
        Relationships: []
      }
      reconciliation_records: {
        Row: {
          bank_transaction_id: string | null
          created_at: string
          exception_reason: string | null
          id: string
          ledger_entry_id: string | null
          match_confidence: number | null
          match_reason: string | null
          matched_amount: number | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["reconciliation_status"]
          transfer_id: string | null
        }
        Insert: {
          bank_transaction_id?: string | null
          created_at?: string
          exception_reason?: string | null
          id?: string
          ledger_entry_id?: string | null
          match_confidence?: number | null
          match_reason?: string | null
          matched_amount?: number | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["reconciliation_status"]
          transfer_id?: string | null
        }
        Update: {
          bank_transaction_id?: string | null
          created_at?: string
          exception_reason?: string | null
          id?: string
          ledger_entry_id?: string | null
          match_confidence?: number | null
          match_reason?: string | null
          matched_amount?: number | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["reconciliation_status"]
          transfer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_records_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_records_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_records_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      regulatory_reports: {
        Row: {
          created_at: string
          created_by: string | null
          filing_deadline: string | null
          id: string
          jurisdiction: string
          narrative: string | null
          reference_number: string | null
          regulator_acknowledgment: string | null
          related_transfers: string[] | null
          report_data: Json
          report_type: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          subject_customer_id: string | null
          subject_user_id: string | null
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          filing_deadline?: string | null
          id?: string
          jurisdiction: string
          narrative?: string | null
          reference_number?: string | null
          regulator_acknowledgment?: string | null
          related_transfers?: string[] | null
          report_data?: Json
          report_type: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          subject_customer_id?: string | null
          subject_user_id?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          filing_deadline?: string | null
          id?: string
          jurisdiction?: string
          narrative?: string | null
          reference_number?: string | null
          regulator_acknowledgment?: string | null
          related_transfers?: string[] | null
          report_data?: Json
          report_type?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          subject_customer_id?: string | null
          subject_user_id?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "regulatory_reports_subject_customer_id_fkey"
            columns: ["subject_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_invoice_items: {
        Row: {
          account_id: string | null
          amount: number
          created_at: string
          description: string
          id: string
          invoice_id: string
          quantity: number
          tax_rate: number | null
          unit_price: number
        }
        Insert: {
          account_id?: string | null
          amount: number
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          quantity?: number
          tax_rate?: number | null
          unit_price: number
        }
        Update: {
          account_id?: string | null
          amount?: number
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          quantity?: number
          tax_rate?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_invoice_items_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_invoices: {
        Row: {
          amount_paid: number
          created_at: string
          created_by: string | null
          currency_code: string
          customer_id: string
          discount_amount: number
          due_date: string
          id: string
          invoice_number: string
          issue_date: string
          journal_id: string | null
          notes: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          created_at?: string
          created_by?: string | null
          currency_code?: string
          customer_id: string
          discount_amount?: number
          due_date: string
          id?: string
          invoice_number: string
          issue_date?: string
          journal_id?: string | null
          notes?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          created_at?: string
          created_by?: string | null
          currency_code?: string
          customer_id?: string
          discount_amount?: number
          due_date?: string
          id?: string
          invoice_number?: string
          issue_date?: string
          journal_id?: string | null
          notes?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_goals: {
        Row: {
          created_at: string
          currency_code: string
          current_amount: number
          id: string
          name: string
          source_wallet_id: string | null
          status: string
          target_amount: number
          target_date: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency_code?: string
          current_amount?: number
          id?: string
          name: string
          source_wallet_id?: string | null
          status?: string
          target_amount: number
          target_date?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency_code?: string
          current_amount?: number
          id?: string
          name?: string
          source_wallet_id?: string | null
          status?: string
          target_amount?: number
          target_date?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tax_filings: {
        Row: {
          adjustments: number
          approved_at: string | null
          approved_by: string | null
          cra_confirmation: string | null
          created_at: string
          filed_at: string | null
          filing_period_end: string
          filing_period_start: string
          filing_reference: string | null
          id: string
          input_tax_credits: number
          net_tax_payable: number
          notes: string | null
          payment_date: string | null
          payment_reference: string | null
          prepared_at: string | null
          prepared_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["tax_filing_status"]
          tax_collected: number
          tax_type: Database["public"]["Enums"]["tax_type"]
          updated_at: string
        }
        Insert: {
          adjustments?: number
          approved_at?: string | null
          approved_by?: string | null
          cra_confirmation?: string | null
          created_at?: string
          filed_at?: string | null
          filing_period_end: string
          filing_period_start: string
          filing_reference?: string | null
          id?: string
          input_tax_credits?: number
          net_tax_payable?: number
          notes?: string | null
          payment_date?: string | null
          payment_reference?: string | null
          prepared_at?: string | null
          prepared_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["tax_filing_status"]
          tax_collected?: number
          tax_type: Database["public"]["Enums"]["tax_type"]
          updated_at?: string
        }
        Update: {
          adjustments?: number
          approved_at?: string | null
          approved_by?: string | null
          cra_confirmation?: string | null
          created_at?: string
          filed_at?: string | null
          filing_period_end?: string
          filing_period_start?: string
          filing_reference?: string | null
          id?: string
          input_tax_credits?: number
          net_tax_payable?: number
          notes?: string | null
          payment_date?: string | null
          payment_reference?: string | null
          prepared_at?: string | null
          prepared_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["tax_filing_status"]
          tax_collected?: number
          tax_type?: Database["public"]["Enums"]["tax_type"]
          updated_at?: string
        }
        Relationships: []
      }
      tax_rates: {
        Row: {
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean
          province_code: string
          province_name: string
          rate: number
          tax_type: Database["public"]["Enums"]["tax_type"]
        }
        Insert: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          province_code: string
          province_name: string
          rate: number
          tax_type: Database["public"]["Enums"]["tax_type"]
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          province_code?: string
          province_name?: string
          rate?: number
          tax_type?: Database["public"]["Enums"]["tax_type"]
        }
        Relationships: []
      }
      tax_registrations: {
        Row: {
          created_at: string
          effective_from: string
          effective_to: string | null
          filing_frequency: Database["public"]["Enums"]["tax_filing_frequency"]
          id: string
          is_active: boolean
          legal_name: string
          registration_number: string
          tax_type: Database["public"]["Enums"]["tax_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          filing_frequency?: Database["public"]["Enums"]["tax_filing_frequency"]
          id?: string
          is_active?: boolean
          legal_name: string
          registration_number: string
          tax_type: Database["public"]["Enums"]["tax_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          filing_frequency?: Database["public"]["Enums"]["tax_filing_frequency"]
          id?: string
          is_active?: boolean
          legal_name?: string
          registration_number?: string
          tax_type?: Database["public"]["Enums"]["tax_type"]
          updated_at?: string
        }
        Relationships: []
      }
      tax_transactions: {
        Row: {
          created_at: string
          customer_id: string | null
          gst_amount: number | null
          gst_rate: number | null
          hst_amount: number | null
          hst_rate: number | null
          id: string
          invoice_number: string | null
          is_refunded: boolean
          journal_id: string | null
          province_code: string
          pst_amount: number | null
          pst_rate: number | null
          qst_amount: number | null
          qst_rate: number | null
          refunded_at: string | null
          taxable_amount: number
          total_tax: number
          total_with_tax: number
          transaction_id: string
          transaction_type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          gst_amount?: number | null
          gst_rate?: number | null
          hst_amount?: number | null
          hst_rate?: number | null
          id?: string
          invoice_number?: string | null
          is_refunded?: boolean
          journal_id?: string | null
          province_code: string
          pst_amount?: number | null
          pst_rate?: number | null
          qst_amount?: number | null
          qst_rate?: number | null
          refunded_at?: string | null
          taxable_amount: number
          total_tax?: number
          total_with_tax: number
          transaction_id: string
          transaction_type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          gst_amount?: number | null
          gst_rate?: number | null
          hst_amount?: number | null
          hst_rate?: number | null
          id?: string
          invoice_number?: string | null
          is_refunded?: boolean
          journal_id?: string | null
          province_code?: string
          pst_amount?: number | null
          pst_rate?: number | null
          qst_amount?: number | null
          qst_rate?: number | null
          refunded_at?: string | null
          taxable_amount?: number
          total_tax?: number
          total_with_tax?: number
          transaction_id?: string
          transaction_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      taxable_services: {
        Row: {
          created_at: string
          description: string | null
          exemption_reason: string | null
          id: string
          is_taxable: boolean
          service_code: string
          service_name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          exemption_reason?: string | null
          id?: string
          is_taxable?: boolean
          service_code: string
          service_name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          exemption_reason?: string | null
          id?: string
          is_taxable?: boolean
          service_code?: string
          service_name?: string
        }
        Relationships: []
      }
      transaction_interventions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          executed_at: string | null
          id: string
          initiated_by: string
          intervention_type: string
          new_provider: string | null
          old_provider: string | null
          reason: string
          result: string | null
          status: string
          transfer_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          executed_at?: string | null
          id?: string
          initiated_by: string
          intervention_type: string
          new_provider?: string | null
          old_provider?: string | null
          reason: string
          result?: string | null
          status?: string
          transfer_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          executed_at?: string | null
          id?: string
          initiated_by?: string
          intervention_type?: string
          new_provider?: string | null
          old_provider?: string | null
          reason?: string
          result?: string | null
          status?: string
          transfer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_interventions_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_rules: {
        Row: {
          ai_confidence: number | null
          ai_generated: boolean
          auto_post: boolean
          category: string | null
          created_at: string
          created_by: string | null
          credit_account_id: string | null
          debit_account_id: string | null
          description: string | null
          id: string
          is_active: boolean
          match_field: string
          match_type: string
          match_value: string
          name: string
          priority: number
          updated_at: string
        }
        Insert: {
          ai_confidence?: number | null
          ai_generated?: boolean
          auto_post?: boolean
          category?: string | null
          created_at?: string
          created_by?: string | null
          credit_account_id?: string | null
          debit_account_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          match_field?: string
          match_type?: string
          match_value: string
          name: string
          priority?: number
          updated_at?: string
        }
        Update: {
          ai_confidence?: number | null
          ai_generated?: boolean
          auto_post?: boolean
          category?: string | null
          created_at?: string
          created_by?: string | null
          credit_account_id?: string | null
          debit_account_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          match_field?: string
          match_type?: string
          match_value?: string
          name?: string
          priority?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_rules_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_rules_debit_account_id_fkey"
            columns: ["debit_account_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      transfers: {
        Row: {
          completed_at: string | null
          created_at: string
          exchange_rate: number
          failure_reason: string | null
          fee_amount: number
          id: string
          payout_method: string | null
          provider_reference: string | null
          recipient_account: string | null
          recipient_country: string
          recipient_name: string
          recipient_phone: string | null
          sender_id: string | null
          sender_wallet_id: string
          source_amount: number
          source_currency: string
          status: Database["public"]["Enums"]["transfer_status"]
          target_amount: number
          target_currency: string
          transfer_type: Database["public"]["Enums"]["transfer_type"]
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          exchange_rate?: number
          failure_reason?: string | null
          fee_amount?: number
          id?: string
          payout_method?: string | null
          provider_reference?: string | null
          recipient_account?: string | null
          recipient_country: string
          recipient_name: string
          recipient_phone?: string | null
          sender_id?: string | null
          sender_wallet_id: string
          source_amount: number
          source_currency: string
          status?: Database["public"]["Enums"]["transfer_status"]
          target_amount: number
          target_currency: string
          transfer_type: Database["public"]["Enums"]["transfer_type"]
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          exchange_rate?: number
          failure_reason?: string | null
          fee_amount?: number
          id?: string
          payout_method?: string | null
          provider_reference?: string | null
          recipient_account?: string | null
          recipient_country?: string
          recipient_name?: string
          recipient_phone?: string | null
          sender_id?: string | null
          sender_wallet_id?: string
          source_amount?: number
          source_currency?: string
          status?: Database["public"]["Enums"]["transfer_status"]
          target_amount?: number
          target_currency?: string
          transfer_type?: Database["public"]["Enums"]["transfer_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfers_sender_wallet_id_fkey"
            columns: ["sender_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_source_currency_fkey"
            columns: ["source_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "transfers_target_currency_fkey"
            columns: ["target_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
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
      vendors: {
        Row: {
          address: string | null
          bank_account: string | null
          bank_name: string | null
          created_at: string
          currency_code: string | null
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          payment_terms: number | null
          phone: string | null
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          bank_account?: string | null
          bank_name?: string | null
          created_at?: string
          currency_code?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          payment_terms?: number | null
          phone?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          bank_account?: string | null
          bank_name?: string | null
          created_at?: string
          currency_code?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          payment_terms?: number | null
          phone?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      wallet_operations: {
        Row: {
          approval_required: boolean
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          new_status: string | null
          notes: string | null
          operation_type: string
          performed_by: string
          previous_status: string | null
          reason: string
          wallet_id: string
        }
        Insert: {
          approval_required?: boolean
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          new_status?: string | null
          notes?: string | null
          operation_type: string
          performed_by: string
          previous_status?: string | null
          reason: string
          wallet_id: string
        }
        Update: {
          approval_required?: boolean
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          new_status?: string | null
          notes?: string | null
          operation_type?: string
          performed_by?: string
          previous_status?: string | null
          reason?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_operations_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          created_at: string
          currency_code: string
          id: string
          is_default: boolean
          status: Database["public"]["Enums"]["wallet_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency_code: string
          id?: string
          is_default?: boolean
          status?: Database["public"]["Enums"]["wallet_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency_code?: string
          id?: string
          is_default?: boolean
          status?: Database["public"]["Enums"]["wallet_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      webhooks_inbox: {
        Row: {
          event_type: string | null
          external_reference: string | null
          headers: Json | null
          id: string
          payload: Json
          processed_at: string | null
          processing_error: string | null
          provider: string
          received_at: string
          status: string
          transfer_id: string | null
        }
        Insert: {
          event_type?: string | null
          external_reference?: string | null
          headers?: Json | null
          id?: string
          payload: Json
          processed_at?: string | null
          processing_error?: string | null
          provider: string
          received_at?: string
          status?: string
          transfer_id?: string | null
        }
        Update: {
          event_type?: string | null
          external_reference?: string | null
          headers?: Json | null
          id?: string
          payload?: Json
          processed_at?: string | null
          processing_error?: string | null
          provider?: string
          received_at?: string
          status?: string
          transfer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhooks_inbox_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "transfers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_rate_limit: {
        Args: {
          p_key: string
          p_max_requests: number
          p_window_seconds: number
        }
        Returns: boolean
      }
      execute_fx_swap: {
        Args: {
          p_effective_rate: number
          p_fee_amount?: number
          p_from_amount: number
          p_from_wallet_id: string
          p_to_wallet_id: string
          p_user_id: string
        }
        Returns: string
      }
      get_user_wallet_balances: {
        Args: { p_user_id: string }
        Returns: {
          balance: number
          currency_code: string
          currency_name: string
          flag_emoji: string
          is_default: boolean
          status: Database["public"]["Enums"]["wallet_status"]
          symbol: string
          wallet_id: string
        }[]
      }
      get_wallet_balance: { Args: { p_wallet_id: string }; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      invoke_generate_receipt: {
        Args: { p_transfer_id: string }
        Returns: undefined
      }
      invoke_send_email: {
        Args: { p_data: Json; p_to: string; p_type: string }
        Returns: undefined
      }
      run_compliance_checks: {
        Args: { p_transfer_id: string }
        Returns: number
      }
      validate_compliance_parameters: {
        Args: { p_parameters: Json; p_rule_type: string }
        Returns: boolean
      }
    }
    Enums: {
      account_type: "asset" | "liability" | "income" | "expense" | "equity"
      alert_severity: "low" | "medium" | "high" | "critical"
      alert_status:
        | "open"
        | "investigating"
        | "escalated"
        | "resolved"
        | "false_positive"
      app_role: "user" | "admin" | "compliance" | "support" | "finance"
      currency_type: "fiat" | "crypto"
      invoice_status:
        | "draft"
        | "sent"
        | "paid"
        | "partial"
        | "overdue"
        | "cancelled"
      kyc_status: "pending" | "submitted" | "verified" | "rejected" | "expired"
      kyc_tier: "tier_0" | "tier_1" | "tier_2" | "tier_3"
      reconciliation_status:
        | "pending"
        | "matched"
        | "unmatched"
        | "exception"
        | "resolved"
      tax_filing_frequency: "monthly" | "quarterly" | "annually"
      tax_filing_status:
        | "draft"
        | "pending_review"
        | "approved"
        | "filed"
        | "paid"
      tax_type: "GST" | "HST" | "QST" | "PST" | "RST"
      trade_side: "buy" | "sell"
      trade_status: "pending" | "executed" | "cancelled" | "failed"
      transfer_status:
        | "initiated"
        | "funded"
        | "processing"
        | "completed"
        | "failed"
        | "reversed"
        | "expired"
      transfer_type:
        | "internal"
        | "mobile_money"
        | "bank"
        | "crypto"
        | "bill_payment"
        | "domestic_canada"
      wallet_status: "active" | "frozen" | "suspended" | "closed"
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
      account_type: ["asset", "liability", "income", "expense", "equity"],
      alert_severity: ["low", "medium", "high", "critical"],
      alert_status: [
        "open",
        "investigating",
        "escalated",
        "resolved",
        "false_positive",
      ],
      app_role: ["user", "admin", "compliance", "support", "finance"],
      currency_type: ["fiat", "crypto"],
      invoice_status: [
        "draft",
        "sent",
        "paid",
        "partial",
        "overdue",
        "cancelled",
      ],
      kyc_status: ["pending", "submitted", "verified", "rejected", "expired"],
      kyc_tier: ["tier_0", "tier_1", "tier_2", "tier_3"],
      reconciliation_status: [
        "pending",
        "matched",
        "unmatched",
        "exception",
        "resolved",
      ],
      tax_filing_frequency: ["monthly", "quarterly", "annually"],
      tax_filing_status: [
        "draft",
        "pending_review",
        "approved",
        "filed",
        "paid",
      ],
      tax_type: ["GST", "HST", "QST", "PST", "RST"],
      trade_side: ["buy", "sell"],
      trade_status: ["pending", "executed", "cancelled", "failed"],
      transfer_status: [
        "initiated",
        "funded",
        "processing",
        "completed",
        "failed",
        "reversed",
        "expired",
      ],
      transfer_type: [
        "internal",
        "mobile_money",
        "bank",
        "crypto",
        "bill_payment",
        "domestic_canada",
      ],
      wallet_status: ["active", "frozen", "suspended", "closed"],
    },
  },
} as const
