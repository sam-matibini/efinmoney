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
      admin_notifications: {
        Row: {
          admin_id: string
          created_at: string
          id: string
          is_read: boolean
          payload: Json
          type: string
        }
        Insert: {
          admin_id: string
          created_at?: string
          id?: string
          is_read?: boolean
          payload?: Json
          type: string
        }
        Update: {
          admin_id?: string
          created_at?: string
          id?: string
          is_read?: boolean
          payload?: Json
          type?: string
        }
        Relationships: []
      }
      admin_users: {
        Row: {
          created_at: string
          department: string | null
          email: string | null
          full_name: string | null
          id: string
          last_login_at: string | null
          permissions: Json
          phone: string | null
          position: string | null
          role: Database["public"]["Enums"]["admin_user_role"]
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          department?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          last_login_at?: string | null
          permissions?: Json
          phone?: string | null
          position?: string | null
          role?: Database["public"]["Enums"]["admin_user_role"]
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          department?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          last_login_at?: string | null
          permissions?: Json
          phone?: string | null
          position?: string | null
          role?: Database["public"]["Enums"]["admin_user_role"]
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      adyen_pay_by_link: {
        Row: {
          amount_minor: number
          created_at: string
          currency: string
          customer_email: string | null
          description: string | null
          expires_at: string | null
          id: string
          link_id: string | null
          owner_user_id: string
          psp_reference: string | null
          purpose: string
          raw: Json | null
          reference: string
          sales_invoice_id: string | null
          short_code: string | null
          status: string
          updated_at: string
          url: string | null
        }
        Insert: {
          amount_minor: number
          created_at?: string
          currency: string
          customer_email?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          link_id?: string | null
          owner_user_id: string
          psp_reference?: string | null
          purpose: string
          raw?: Json | null
          reference: string
          sales_invoice_id?: string | null
          short_code?: string | null
          status?: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          amount_minor?: number
          created_at?: string
          currency?: string
          customer_email?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          link_id?: string | null
          owner_user_id?: string
          psp_reference?: string | null
          purpose?: string
          raw?: Json | null
          reference?: string
          sales_invoice_id?: string | null
          short_code?: string | null
          status?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "adyen_pay_by_link_sales_invoice_id_fkey"
            columns: ["sales_invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      adyen_payment_sessions: {
        Row: {
          amount_minor: number
          created_at: string
          currency: string
          id: string
          last_event: Json | null
          payment_method: string | null
          psp_reference: string | null
          purpose: string
          raw_session: Json | null
          reference: string
          related_invoice_id: string | null
          related_transfer_id: string | null
          return_url: string | null
          status: string
          target_currency: string | null
          target_wallet_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_minor: number
          created_at?: string
          currency: string
          id?: string
          last_event?: Json | null
          payment_method?: string | null
          psp_reference?: string | null
          purpose: string
          raw_session?: Json | null
          reference: string
          related_invoice_id?: string | null
          related_transfer_id?: string | null
          return_url?: string | null
          status?: string
          target_currency?: string | null
          target_wallet_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_minor?: number
          created_at?: string
          currency?: string
          id?: string
          last_event?: Json | null
          payment_method?: string | null
          psp_reference?: string | null
          purpose?: string
          raw_session?: Json | null
          reference?: string
          related_invoice_id?: string | null
          related_transfer_id?: string | null
          return_url?: string | null
          status?: string
          target_currency?: string | null
          target_wallet_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "adyen_payment_sessions_target_wallet_id_fkey"
            columns: ["target_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      adyen_webhook_events: {
        Row: {
          amount_minor: number | null
          created_at: string
          currency: string | null
          event_code: string
          hmac_valid: boolean
          id: string
          merchant_reference: string | null
          payment_method: string | null
          processed_at: string | null
          psp_reference: string | null
          raw: Json
          success: boolean | null
        }
        Insert: {
          amount_minor?: number | null
          created_at?: string
          currency?: string | null
          event_code: string
          hmac_valid?: boolean
          id?: string
          merchant_reference?: string | null
          payment_method?: string | null
          processed_at?: string | null
          psp_reference?: string | null
          raw: Json
          success?: boolean | null
        }
        Update: {
          amount_minor?: number | null
          created_at?: string
          currency?: string | null
          event_code?: string
          hmac_valid?: boolean
          id?: string
          merchant_reference?: string | null
          payment_method?: string | null
          processed_at?: string | null
          psp_reference?: string | null
          raw?: Json
          success?: boolean | null
        }
        Relationships: []
      }
      aml_matches: {
        Row: {
          created_at: string
          disposition: Database["public"]["Enums"]["aml_match_disposition"]
          id: string
          match_type: string
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          score: number
          screening_id: string
          watchlist_id: string
        }
        Insert: {
          created_at?: string
          disposition?: Database["public"]["Enums"]["aml_match_disposition"]
          id?: string
          match_type: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          score: number
          screening_id: string
          watchlist_id: string
        }
        Update: {
          created_at?: string
          disposition?: Database["public"]["Enums"]["aml_match_disposition"]
          id?: string
          match_type?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          score?: number
          screening_id?: string
          watchlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aml_matches_screening_id_fkey"
            columns: ["screening_id"]
            isOneToOne: false
            referencedRelation: "aml_screenings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aml_matches_watchlist_id_fkey"
            columns: ["watchlist_id"]
            isOneToOne: false
            referencedRelation: "aml_watchlist"
            referencedColumns: ["id"]
          },
        ]
      }
      aml_screenings: {
        Row: {
          id: string
          match_count: number
          screened_at: string
          screened_by: string | null
          status: Database["public"]["Enums"]["aml_screening_status"]
          subject_country: string | null
          subject_dob: string | null
          subject_name: string
          trigger: Database["public"]["Enums"]["aml_screening_trigger"]
          trigger_ref: string | null
          user_id: string
        }
        Insert: {
          id?: string
          match_count?: number
          screened_at?: string
          screened_by?: string | null
          status?: Database["public"]["Enums"]["aml_screening_status"]
          subject_country?: string | null
          subject_dob?: string | null
          subject_name: string
          trigger: Database["public"]["Enums"]["aml_screening_trigger"]
          trigger_ref?: string | null
          user_id: string
        }
        Update: {
          id?: string
          match_count?: number
          screened_at?: string
          screened_by?: string | null
          status?: Database["public"]["Enums"]["aml_screening_status"]
          subject_country?: string | null
          subject_dob?: string | null
          subject_name?: string
          trigger?: Database["public"]["Enums"]["aml_screening_trigger"]
          trigger_ref?: string | null
          user_id?: string
        }
        Relationships: []
      }
      aml_watchlist: {
        Row: {
          aliases: string[]
          countries: string[]
          dob: string | null
          dob_year: number | null
          entity_type: Database["public"]["Enums"]["aml_entity_type"]
          id: string
          ingested_at: string
          list_published_at: string | null
          name: string
          name_normalized: string
          nationalities: string[]
          programs: string[]
          raw: Json | null
          remarks: string | null
          source: Database["public"]["Enums"]["aml_source"]
          source_id: string
          source_url: string | null
        }
        Insert: {
          aliases?: string[]
          countries?: string[]
          dob?: string | null
          dob_year?: number | null
          entity_type?: Database["public"]["Enums"]["aml_entity_type"]
          id?: string
          ingested_at?: string
          list_published_at?: string | null
          name: string
          name_normalized: string
          nationalities?: string[]
          programs?: string[]
          raw?: Json | null
          remarks?: string | null
          source: Database["public"]["Enums"]["aml_source"]
          source_id: string
          source_url?: string | null
        }
        Update: {
          aliases?: string[]
          countries?: string[]
          dob?: string | null
          dob_year?: number | null
          entity_type?: Database["public"]["Enums"]["aml_entity_type"]
          id?: string
          ingested_at?: string
          list_published_at?: string | null
          name?: string
          name_normalized?: string
          nationalities?: string[]
          programs?: string[]
          raw?: Json | null
          remarks?: string | null
          source?: Database["public"]["Enums"]["aml_source"]
          source_id?: string
          source_url?: string | null
        }
        Relationships: []
      }
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
          category: string
          country_code: string | null
          created_at: string
          currency_code: string | null
          eft_account: string | null
          eft_account_holder: string | null
          eft_institution: string | null
          eft_transit: string | null
          email: string | null
          id: string
          interac_email: string | null
          last_sent_at: string | null
          name: string
          network: string | null
          nickname: string | null
          notes: string | null
          payout_method: string | null
          phone: string | null
          tags: string[]
          transfer_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_initials?: string | null
          bank_account?: string | null
          bank_name?: string | null
          category?: string
          country_code?: string | null
          created_at?: string
          currency_code?: string | null
          eft_account?: string | null
          eft_account_holder?: string | null
          eft_institution?: string | null
          eft_transit?: string | null
          email?: string | null
          id?: string
          interac_email?: string | null
          last_sent_at?: string | null
          name: string
          network?: string | null
          nickname?: string | null
          notes?: string | null
          payout_method?: string | null
          phone?: string | null
          tags?: string[]
          transfer_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_initials?: string | null
          bank_account?: string | null
          bank_name?: string | null
          category?: string
          country_code?: string | null
          created_at?: string
          currency_code?: string | null
          eft_account?: string | null
          eft_account_holder?: string | null
          eft_institution?: string | null
          eft_transit?: string | null
          email?: string | null
          id?: string
          interac_email?: string | null
          last_sent_at?: string | null
          name?: string
          network?: string | null
          nickname?: string | null
          notes?: string | null
          payout_method?: string | null
          phone?: string | null
          tags?: string[]
          transfer_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bill_payments: {
        Row: {
          amount: number
          biller_code: string
          biller_name: string | null
          category: string
          created_at: string
          currency: string
          customer_identifier: string
          failure_reason: string | null
          fee: number
          flw_reference: string | null
          flw_response: Json | null
          id: string
          reference: string
          status: string
          token: string | null
          units: string | null
          updated_at: string
          user_id: string
          wallet_id: string | null
        }
        Insert: {
          amount: number
          biller_code: string
          biller_name?: string | null
          category: string
          created_at?: string
          currency: string
          customer_identifier: string
          failure_reason?: string | null
          fee?: number
          flw_reference?: string | null
          flw_response?: Json | null
          id?: string
          reference: string
          status?: string
          token?: string | null
          units?: string | null
          updated_at?: string
          user_id: string
          wallet_id?: string | null
        }
        Update: {
          amount?: number
          biller_code?: string
          biller_name?: string | null
          category?: string
          created_at?: string
          currency?: string
          customer_identifier?: string
          failure_reason?: string | null
          fee?: number
          flw_reference?: string | null
          flw_response?: Json | null
          id?: string
          reference?: string
          status?: string
          token?: string | null
          units?: string | null
          updated_at?: string
          user_id?: string
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bill_payments_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      business_card_members: {
        Row: {
          department: string | null
          id: string
          invited_at: string
          is_active: boolean
          joined_at: string | null
          per_member_monthly_cap: number | null
          program_id: string
          role: Database["public"]["Enums"]["business_card_role"]
          user_id: string
        }
        Insert: {
          department?: string | null
          id?: string
          invited_at?: string
          is_active?: boolean
          joined_at?: string | null
          per_member_monthly_cap?: number | null
          program_id: string
          role?: Database["public"]["Enums"]["business_card_role"]
          user_id: string
        }
        Update: {
          department?: string | null
          id?: string
          invited_at?: string
          is_active?: boolean
          joined_at?: string | null
          per_member_monthly_cap?: number | null
          program_id?: string
          role?: Database["public"]["Enums"]["business_card_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_card_members_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "business_card_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      business_card_programs: {
        Row: {
          created_at: string
          default_currency: string
          description: string | null
          funding_wallet_id: string | null
          id: string
          is_active: boolean
          name: string
          owner_user_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_currency?: string
          description?: string | null
          funding_wallet_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          owner_user_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_currency?: string
          description?: string | null
          funding_wallet_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          owner_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_card_programs_funding_wallet_id_fkey"
            columns: ["funding_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      card_authorizations: {
        Row: {
          amount: number
          approved_at: string | null
          card_id: string
          created_at: string
          currency: string
          decline_reason: string | null
          declined_at: string | null
          id: string
          merchant_category: string | null
          merchant_country: string | null
          merchant_name: string | null
          raw_payload: Json | null
          status: Database["public"]["Enums"]["card_authorization_status"]
          stripe_authorization_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          card_id: string
          created_at?: string
          currency: string
          decline_reason?: string | null
          declined_at?: string | null
          id?: string
          merchant_category?: string | null
          merchant_country?: string | null
          merchant_name?: string | null
          raw_payload?: Json | null
          status?: Database["public"]["Enums"]["card_authorization_status"]
          stripe_authorization_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          card_id?: string
          created_at?: string
          currency?: string
          decline_reason?: string | null
          declined_at?: string | null
          id?: string
          merchant_category?: string | null
          merchant_country?: string | null
          merchant_name?: string | null
          raw_payload?: Json | null
          status?: Database["public"]["Enums"]["card_authorization_status"]
          stripe_authorization_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_authorizations_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "issued_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      card_fraud_signals: {
        Row: {
          authorization_id: string | null
          card_id: string
          created_at: string
          details: Json | null
          id: string
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          score: number | null
          severity: Database["public"]["Enums"]["card_fraud_severity"]
          signal_type: string
          user_id: string
        }
        Insert: {
          authorization_id?: string | null
          card_id: string
          created_at?: string
          details?: Json | null
          id?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          score?: number | null
          severity?: Database["public"]["Enums"]["card_fraud_severity"]
          signal_type: string
          user_id: string
        }
        Update: {
          authorization_id?: string | null
          card_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          score?: number | null
          severity?: Database["public"]["Enums"]["card_fraud_severity"]
          signal_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_fraud_signals_authorization_id_fkey"
            columns: ["authorization_id"]
            isOneToOne: false
            referencedRelation: "card_authorizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_fraud_signals_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "issued_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      card_funding_events: {
        Row: {
          amount: number
          card_id: string
          completed_at: string | null
          created_at: string
          currency: string
          failure_reason: string | null
          id: string
          ledger_journal_id: string | null
          source: Database["public"]["Enums"]["card_funding_source"]
          source_wallet_id: string | null
          status: Database["public"]["Enums"]["card_funding_status"]
          user_id: string
        }
        Insert: {
          amount: number
          card_id: string
          completed_at?: string | null
          created_at?: string
          currency: string
          failure_reason?: string | null
          id?: string
          ledger_journal_id?: string | null
          source?: Database["public"]["Enums"]["card_funding_source"]
          source_wallet_id?: string | null
          status?: Database["public"]["Enums"]["card_funding_status"]
          user_id: string
        }
        Update: {
          amount?: number
          card_id?: string
          completed_at?: string | null
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          ledger_journal_id?: string | null
          source?: Database["public"]["Enums"]["card_funding_source"]
          source_wallet_id?: string | null
          status?: Database["public"]["Enums"]["card_funding_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_funding_events_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "issued_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_funding_events_source_wallet_id_fkey"
            columns: ["source_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      card_spending_controls: {
        Row: {
          allowed_categories: string[] | null
          allowed_countries: string[] | null
          blocked_categories: string[] | null
          blocked_countries: string[] | null
          card_id: string
          created_at: string
          daily_limit: number | null
          id: string
          monthly_limit: number | null
          per_authorization_limit: number | null
          single_use: boolean
          subscription_lock_merchant: string | null
          updated_at: string
          weekly_limit: number | null
        }
        Insert: {
          allowed_categories?: string[] | null
          allowed_countries?: string[] | null
          blocked_categories?: string[] | null
          blocked_countries?: string[] | null
          card_id: string
          created_at?: string
          daily_limit?: number | null
          id?: string
          monthly_limit?: number | null
          per_authorization_limit?: number | null
          single_use?: boolean
          subscription_lock_merchant?: string | null
          updated_at?: string
          weekly_limit?: number | null
        }
        Update: {
          allowed_categories?: string[] | null
          allowed_countries?: string[] | null
          blocked_categories?: string[] | null
          blocked_countries?: string[] | null
          card_id?: string
          created_at?: string
          daily_limit?: number | null
          id?: string
          monthly_limit?: number | null
          per_authorization_limit?: number | null
          single_use?: boolean
          subscription_lock_merchant?: string | null
          updated_at?: string
          weekly_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "card_spending_controls_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: true
            referencedRelation: "issued_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      card_transactions: {
        Row: {
          amount: number
          authorization_id: string | null
          card_id: string
          created_at: string
          currency: string
          id: string
          mcc: string | null
          merchant_category: string | null
          merchant_name: string | null
          posted_at: string
          raw_payload: Json | null
          stripe_transaction_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          authorization_id?: string | null
          card_id: string
          created_at?: string
          currency: string
          id?: string
          mcc?: string | null
          merchant_category?: string | null
          merchant_name?: string | null
          posted_at?: string
          raw_payload?: Json | null
          stripe_transaction_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          authorization_id?: string | null
          card_id?: string
          created_at?: string
          currency?: string
          id?: string
          mcc?: string | null
          merchant_category?: string | null
          merchant_name?: string | null
          posted_at?: string
          raw_payload?: Json | null
          stripe_transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_transactions_authorization_id_fkey"
            columns: ["authorization_id"]
            isOneToOne: false
            referencedRelation: "card_authorizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_transactions_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "issued_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      cardholders: {
        Row: {
          billing_city: string
          billing_country: string
          billing_line1: string
          billing_line2: string | null
          billing_postal_code: string
          billing_state: string
          created_at: string
          email: string
          id: string
          kyc_verified_at: string | null
          legal_name: string
          metadata: Json | null
          phone: string | null
          status: Database["public"]["Enums"]["cardholder_status"]
          stripe_cardholder_id: string | null
          type: Database["public"]["Enums"]["cardholder_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_city: string
          billing_country?: string
          billing_line1: string
          billing_line2?: string | null
          billing_postal_code: string
          billing_state: string
          created_at?: string
          email: string
          id?: string
          kyc_verified_at?: string | null
          legal_name: string
          metadata?: Json | null
          phone?: string | null
          status?: Database["public"]["Enums"]["cardholder_status"]
          stripe_cardholder_id?: string | null
          type?: Database["public"]["Enums"]["cardholder_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_city?: string
          billing_country?: string
          billing_line1?: string
          billing_line2?: string | null
          billing_postal_code?: string
          billing_state?: string
          created_at?: string
          email?: string
          id?: string
          kyc_verified_at?: string | null
          legal_name?: string
          metadata?: Json | null
          phone?: string | null
          status?: Database["public"]["Enums"]["cardholder_status"]
          stripe_cardholder_id?: string | null
          type?: Database["public"]["Enums"]["cardholder_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cards: {
        Row: {
          balance: number
          card_network: string
          card_type: string
          cardholder_name: string
          created_at: string
          credit_limit: number | null
          currency_code: string | null
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
          balance?: number
          card_network?: string
          card_type?: string
          cardholder_name: string
          created_at?: string
          credit_limit?: number | null
          currency_code?: string | null
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
          balance?: number
          card_network?: string
          card_type?: string
          cardholder_name?: string
          created_at?: string
          credit_limit?: number | null
          currency_code?: string | null
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
      circle_webhook_events: {
        Row: {
          circle_event_id: string
          created_at: string
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
        }
        Insert: {
          circle_event_id: string
          created_at?: string
          event_type: string
          id?: string
          payload: Json
          processed_at?: string | null
        }
        Update: {
          circle_event_id?: string
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
        }
        Relationships: []
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
      cpn_corridors: {
        Row: {
          created_at: string
          dest_country: string
          dest_currency: string
          enabled: boolean
          est_minutes: number
          id: string
          markup_bps: number
          max_amount: number
          min_amount: number
          payout_method: string
          source_currency: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dest_country: string
          dest_currency: string
          enabled?: boolean
          est_minutes?: number
          id?: string
          markup_bps?: number
          max_amount?: number
          min_amount?: number
          payout_method?: string
          source_currency: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dest_country?: string
          dest_currency?: string
          enabled?: boolean
          est_minutes?: number
          id?: string
          markup_bps?: number
          max_amount?: number
          min_amount?: number
          payout_method?: string
          source_currency?: string
          updated_at?: string
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
      crossmint_wallets: {
        Row: {
          address: string
          chain: string
          created_at: string
          env: string
          id: string
          locator: string
          raw: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address: string
          chain: string
          created_at?: string
          env?: string
          id?: string
          locator: string
          raw?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string
          chain?: string
          created_at?: string
          env?: string
          id?: string
          locator?: string
          raw?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      crossmint_yellowcard_transfers: {
        Row: {
          created_at: string
          crossmint_checkout_url: string | null
          crossmint_order_id: string | null
          crossmint_raw: Json | null
          destination_amount: number | null
          destination_country: string
          destination_currency: string
          failure_reason: string | null
          fee_amount: number | null
          fx_rate: number | null
          id: string
          payout_tx_hash: string | null
          recipient_account_number: string
          recipient_bank_code: string | null
          recipient_bank_name: string | null
          recipient_email: string | null
          recipient_name: string
          recipient_phone: string | null
          smart_wallet_address: string | null
          source_amount: number
          source_currency: string
          status: string
          stellar_tx_hash: string | null
          updated_at: string
          user_id: string
          yellowcard_payment_id: string | null
          yellowcard_raw: Json | null
        }
        Insert: {
          created_at?: string
          crossmint_checkout_url?: string | null
          crossmint_order_id?: string | null
          crossmint_raw?: Json | null
          destination_amount?: number | null
          destination_country: string
          destination_currency: string
          failure_reason?: string | null
          fee_amount?: number | null
          fx_rate?: number | null
          id?: string
          payout_tx_hash?: string | null
          recipient_account_number: string
          recipient_bank_code?: string | null
          recipient_bank_name?: string | null
          recipient_email?: string | null
          recipient_name: string
          recipient_phone?: string | null
          smart_wallet_address?: string | null
          source_amount: number
          source_currency: string
          status?: string
          stellar_tx_hash?: string | null
          updated_at?: string
          user_id: string
          yellowcard_payment_id?: string | null
          yellowcard_raw?: Json | null
        }
        Update: {
          created_at?: string
          crossmint_checkout_url?: string | null
          crossmint_order_id?: string | null
          crossmint_raw?: Json | null
          destination_amount?: number | null
          destination_country?: string
          destination_currency?: string
          failure_reason?: string | null
          fee_amount?: number | null
          fx_rate?: number | null
          id?: string
          payout_tx_hash?: string | null
          recipient_account_number?: string
          recipient_bank_code?: string | null
          recipient_bank_name?: string | null
          recipient_email?: string | null
          recipient_name?: string
          recipient_phone?: string | null
          smart_wallet_address?: string | null
          source_amount?: number
          source_currency?: string
          status?: string
          stellar_tx_hash?: string | null
          updated_at?: string
          user_id?: string
          yellowcard_payment_id?: string | null
          yellowcard_raw?: Json | null
        }
        Relationships: []
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
      flw_banks_cache: {
        Row: {
          banks: Json
          country: string
          fetched_at: string
        }
        Insert: {
          banks: Json
          country: string
          fetched_at?: string
        }
        Update: {
          banks?: Json
          country?: string
          fetched_at?: string
        }
        Relationships: []
      }
      flw_billers_cache: {
        Row: {
          billers: Json
          category: string | null
          country: string
          fetched_at: string
          id: string
        }
        Insert: {
          billers: Json
          category?: string | null
          country: string
          fetched_at?: string
          id?: string
        }
        Update: {
          billers?: Json
          category?: string | null
          country?: string
          fetched_at?: string
          id?: string
        }
        Relationships: []
      }
      flw_webhook_logs: {
        Row: {
          error: string | null
          event: string | null
          id: string
          payload: Json | null
          processed: boolean
          received_at: string
        }
        Insert: {
          error?: string | null
          event?: string | null
          id?: string
          payload?: Json | null
          processed?: boolean
          received_at?: string
        }
        Update: {
          error?: string | null
          event?: string | null
          id?: string
          payload?: Json | null
          processed?: boolean
          received_at?: string
        }
        Relationships: []
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
      interac_sessions: {
        Row: {
          code_verifier: string
          created_at: string
          expires_at: string
          nonce: string
          redirect_uri: string
          state: string
          user_id: string
        }
        Insert: {
          code_verifier: string
          created_at?: string
          expires_at: string
          nonce: string
          redirect_uri: string
          state: string
          user_id: string
        }
        Update: {
          code_verifier?: string
          created_at?: string
          expires_at?: string
          nonce?: string
          redirect_uri?: string
          state?: string
          user_id?: string
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
      issued_cards: {
        Row: {
          brand: string
          cancelled_reason: string | null
          card_type: Database["public"]["Enums"]["issued_card_type"]
          cardholder_id: string
          created_at: string
          currency: string
          exp_month: number | null
          exp_year: number | null
          funding_wallet_id: string | null
          id: string
          last4: string | null
          metadata: Json | null
          nickname: string | null
          purpose: Database["public"]["Enums"]["issued_card_purpose"]
          status: Database["public"]["Enums"]["issued_card_status"]
          stripe_card_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          brand?: string
          cancelled_reason?: string | null
          card_type?: Database["public"]["Enums"]["issued_card_type"]
          cardholder_id: string
          created_at?: string
          currency?: string
          exp_month?: number | null
          exp_year?: number | null
          funding_wallet_id?: string | null
          id?: string
          last4?: string | null
          metadata?: Json | null
          nickname?: string | null
          purpose?: Database["public"]["Enums"]["issued_card_purpose"]
          status?: Database["public"]["Enums"]["issued_card_status"]
          stripe_card_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          brand?: string
          cancelled_reason?: string | null
          card_type?: Database["public"]["Enums"]["issued_card_type"]
          cardholder_id?: string
          created_at?: string
          currency?: string
          exp_month?: number | null
          exp_year?: number | null
          funding_wallet_id?: string | null
          id?: string
          last4?: string | null
          metadata?: Json | null
          nickname?: string | null
          purpose?: Database["public"]["Enums"]["issued_card_purpose"]
          status?: Database["public"]["Enums"]["issued_card_status"]
          stripe_card_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "issued_cards_cardholder_id_fkey"
            columns: ["cardholder_id"]
            isOneToOne: false
            referencedRelation: "cardholders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issued_cards_funding_wallet_id_fkey"
            columns: ["funding_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      kyc_audit_log: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string
          id: string
          kyc_verification_id: string
          new_status: string | null
          notes: string | null
          previous_status: string | null
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string
          id?: string
          kyc_verification_id: string
          new_status?: string | null
          notes?: string | null
          previous_status?: string | null
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string
          id?: string
          kyc_verification_id?: string
          new_status?: string | null
          notes?: string | null
          previous_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kyc_audit_log_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kyc_audit_log_kyc_verification_id_fkey"
            columns: ["kyc_verification_id"]
            isOneToOne: false
            referencedRelation: "kyc_verifications"
            referencedColumns: ["id"]
          },
        ]
      }
      kyc_verifications: {
        Row: {
          address_document_type:
            | Database["public"]["Enums"]["kyc_address_doc_type"]
            | null
          address_document_url: string | null
          address_proof_url: string | null
          address_rejection_reason: string | null
          address_verification_status: Database["public"]["Enums"]["kyc_doc_review_status"]
          created_at: string
          current_step: Database["public"]["Enums"]["kyc_current_step"]
          escalated: boolean
          escalated_at: string | null
          id: string
          id_document_country: string | null
          id_document_type:
            | Database["public"]["Enums"]["kyc_id_doc_type"]
            | null
          id_document_url: string | null
          id_rejection_reason: string | null
          id_verification_status: Database["public"]["Enums"]["kyc_doc_review_status"]
          interac_claims: Json | null
          interac_completed_at: string | null
          interac_session_id: string | null
          interac_sub: string | null
          interac_verification_status: string | null
          internal_notes: string | null
          liveness_check_status: Database["public"]["Enums"]["kyc_doc_review_status"]
          persona_decision: string | null
          persona_decision_reason: string | null
          persona_inquiry_id: string | null
          persona_inquiry_status: string | null
          persona_session_token: string | null
          persona_verification_data: Json | null
          reviewed_at: string | null
          reviewed_by: string | null
          selfie_url: string | null
          source_of_funds_status: string
          source_of_funds_type: string | null
          source_of_funds_url: string | null
          submitted_at: string | null
          tier_target: Database["public"]["Enums"]["user_risk_tier"] | null
          updated_at: string
          user_id: string
          verification_provider: string | null
          verification_status: Database["public"]["Enums"]["kyc_verification_status"]
        }
        Insert: {
          address_document_type?:
            | Database["public"]["Enums"]["kyc_address_doc_type"]
            | null
          address_document_url?: string | null
          address_proof_url?: string | null
          address_rejection_reason?: string | null
          address_verification_status?: Database["public"]["Enums"]["kyc_doc_review_status"]
          created_at?: string
          current_step?: Database["public"]["Enums"]["kyc_current_step"]
          escalated?: boolean
          escalated_at?: string | null
          id?: string
          id_document_country?: string | null
          id_document_type?:
            | Database["public"]["Enums"]["kyc_id_doc_type"]
            | null
          id_document_url?: string | null
          id_rejection_reason?: string | null
          id_verification_status?: Database["public"]["Enums"]["kyc_doc_review_status"]
          interac_claims?: Json | null
          interac_completed_at?: string | null
          interac_session_id?: string | null
          interac_sub?: string | null
          interac_verification_status?: string | null
          internal_notes?: string | null
          liveness_check_status?: Database["public"]["Enums"]["kyc_doc_review_status"]
          persona_decision?: string | null
          persona_decision_reason?: string | null
          persona_inquiry_id?: string | null
          persona_inquiry_status?: string | null
          persona_session_token?: string | null
          persona_verification_data?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          selfie_url?: string | null
          source_of_funds_status?: string
          source_of_funds_type?: string | null
          source_of_funds_url?: string | null
          submitted_at?: string | null
          tier_target?: Database["public"]["Enums"]["user_risk_tier"] | null
          updated_at?: string
          user_id: string
          verification_provider?: string | null
          verification_status?: Database["public"]["Enums"]["kyc_verification_status"]
        }
        Update: {
          address_document_type?:
            | Database["public"]["Enums"]["kyc_address_doc_type"]
            | null
          address_document_url?: string | null
          address_proof_url?: string | null
          address_rejection_reason?: string | null
          address_verification_status?: Database["public"]["Enums"]["kyc_doc_review_status"]
          created_at?: string
          current_step?: Database["public"]["Enums"]["kyc_current_step"]
          escalated?: boolean
          escalated_at?: string | null
          id?: string
          id_document_country?: string | null
          id_document_type?:
            | Database["public"]["Enums"]["kyc_id_doc_type"]
            | null
          id_document_url?: string | null
          id_rejection_reason?: string | null
          id_verification_status?: Database["public"]["Enums"]["kyc_doc_review_status"]
          interac_claims?: Json | null
          interac_completed_at?: string | null
          interac_session_id?: string | null
          interac_sub?: string | null
          interac_verification_status?: string | null
          internal_notes?: string | null
          liveness_check_status?: Database["public"]["Enums"]["kyc_doc_review_status"]
          persona_decision?: string | null
          persona_decision_reason?: string | null
          persona_inquiry_id?: string | null
          persona_inquiry_status?: string | null
          persona_session_token?: string | null
          persona_verification_data?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          selfie_url?: string | null
          source_of_funds_status?: string
          source_of_funds_type?: string | null
          source_of_funds_url?: string | null
          submitted_at?: string | null
          tier_target?: Database["public"]["Enums"]["user_risk_tier"] | null
          updated_at?: string
          user_id?: string
          verification_provider?: string | null
          verification_status?: Database["public"]["Enums"]["kyc_verification_status"]
        }
        Relationships: []
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
          external_reference: string | null
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
          external_reference?: string | null
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
          external_reference?: string | null
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
      payment_link_payouts: {
        Row: {
          amount: number
          auto_claim: boolean
          claimed_at: string | null
          claimed_ip: string | null
          claimed_method:
            | Database["public"]["Enums"]["payment_link_claim_method"]
            | null
          claimed_payload: Json | null
          created_at: string
          currency: string
          escrow_journal_id: string | null
          expires_at: string
          failure_reason: string | null
          id: string
          preset_method: string | null
          preset_payload: Json | null
          recipient_name: string | null
          recipient_note: string | null
          release_journal_id: string | null
          reversal_journal_id: string | null
          sender_id: string
          sender_wallet_id: string | null
          short_code: string
          short_url: string | null
          source: Database["public"]["Enums"]["payment_link_source"]
          source_ref: string | null
          status: Database["public"]["Enums"]["payment_link_status"]
          transfer_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          auto_claim?: boolean
          claimed_at?: string | null
          claimed_ip?: string | null
          claimed_method?:
            | Database["public"]["Enums"]["payment_link_claim_method"]
            | null
          claimed_payload?: Json | null
          created_at?: string
          currency: string
          escrow_journal_id?: string | null
          expires_at?: string
          failure_reason?: string | null
          id?: string
          preset_method?: string | null
          preset_payload?: Json | null
          recipient_name?: string | null
          recipient_note?: string | null
          release_journal_id?: string | null
          reversal_journal_id?: string | null
          sender_id: string
          sender_wallet_id?: string | null
          short_code: string
          short_url?: string | null
          source?: Database["public"]["Enums"]["payment_link_source"]
          source_ref?: string | null
          status?: Database["public"]["Enums"]["payment_link_status"]
          transfer_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          auto_claim?: boolean
          claimed_at?: string | null
          claimed_ip?: string | null
          claimed_method?:
            | Database["public"]["Enums"]["payment_link_claim_method"]
            | null
          claimed_payload?: Json | null
          created_at?: string
          currency?: string
          escrow_journal_id?: string | null
          expires_at?: string
          failure_reason?: string | null
          id?: string
          preset_method?: string | null
          preset_payload?: Json | null
          recipient_name?: string | null
          recipient_note?: string | null
          release_journal_id?: string | null
          reversal_journal_id?: string | null
          sender_id?: string
          sender_wallet_id?: string | null
          short_code?: string
          short_url?: string | null
          source?: Database["public"]["Enums"]["payment_link_source"]
          source_ref?: string | null
          status?: Database["public"]["Enums"]["payment_link_status"]
          transfer_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      paysafe_webhook_logs: {
        Row: {
          account_id: string | null
          amount: number | null
          created_at: string
          currency_code: string | null
          event_id: string | null
          event_type: string | null
          id: string
          merchant_ref_num: string | null
          payment_handle_token: string | null
          payment_id: string | null
          processed: boolean
          processing_error: string | null
          raw_payload: Json
          status: string | null
        }
        Insert: {
          account_id?: string | null
          amount?: number | null
          created_at?: string
          currency_code?: string | null
          event_id?: string | null
          event_type?: string | null
          id?: string
          merchant_ref_num?: string | null
          payment_handle_token?: string | null
          payment_id?: string | null
          processed?: boolean
          processing_error?: string | null
          raw_payload?: Json
          status?: string | null
        }
        Update: {
          account_id?: string | null
          amount?: number | null
          created_at?: string
          currency_code?: string | null
          event_id?: string | null
          event_type?: string | null
          id?: string
          merchant_ref_num?: string | null
          payment_handle_token?: string | null
          payment_id?: string | null
          processed?: boolean
          processing_error?: string | null
          raw_payload?: Json
          status?: string | null
        }
        Relationships: []
      }
      persona_webhook_logs: {
        Row: {
          error: string | null
          event_type: string | null
          id: string
          inquiry_id: string | null
          payload: Json | null
          processed: boolean
          received_at: string
        }
        Insert: {
          error?: string | null
          event_type?: string | null
          id?: string
          inquiry_id?: string | null
          payload?: Json | null
          processed?: boolean
          received_at?: string
        }
        Update: {
          error?: string | null
          event_type?: string | null
          id?: string
          inquiry_id?: string | null
          payload?: Json | null
          processed?: boolean
          received_at?: string
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
          account_number: string | null
          account_status: Database["public"]["Enums"]["account_status_enum"]
          address_country: string | null
          aml_last_screened_at: string | null
          aml_status: Database["public"]["Enums"]["aml_profile_status"]
          avatar_url: string | null
          city: string | null
          country_code: string | null
          created_at: string
          default_currency: string | null
          efin_tag: string | null
          email: string | null
          full_name: string | null
          id: string
          kyc_completed_at: string | null
          kyc_framework_version: number
          kyc_status: Database["public"]["Enums"]["kyc_status"]
          kyc_tier: Database["public"]["Enums"]["kyc_tier"]
          phone_number: string | null
          postal_code: string | null
          risk_score: number | null
          state_province: string | null
          stellar_public_key: string | null
          stellar_seed_encrypted: string | null
          street_address: string | null
          stripe_customer_id: string | null
          transaction_pin_failed_attempts: number
          transaction_pin_hash: string | null
          transaction_pin_locked_until: string | null
          transaction_pin_set_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_number?: string | null
          account_status?: Database["public"]["Enums"]["account_status_enum"]
          address_country?: string | null
          aml_last_screened_at?: string | null
          aml_status?: Database["public"]["Enums"]["aml_profile_status"]
          avatar_url?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string
          default_currency?: string | null
          efin_tag?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          kyc_completed_at?: string | null
          kyc_framework_version?: number
          kyc_status?: Database["public"]["Enums"]["kyc_status"]
          kyc_tier?: Database["public"]["Enums"]["kyc_tier"]
          phone_number?: string | null
          postal_code?: string | null
          risk_score?: number | null
          state_province?: string | null
          stellar_public_key?: string | null
          stellar_seed_encrypted?: string | null
          street_address?: string | null
          stripe_customer_id?: string | null
          transaction_pin_failed_attempts?: number
          transaction_pin_hash?: string | null
          transaction_pin_locked_until?: string | null
          transaction_pin_set_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_number?: string | null
          account_status?: Database["public"]["Enums"]["account_status_enum"]
          address_country?: string | null
          aml_last_screened_at?: string | null
          aml_status?: Database["public"]["Enums"]["aml_profile_status"]
          avatar_url?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string
          default_currency?: string | null
          efin_tag?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          kyc_completed_at?: string | null
          kyc_framework_version?: number
          kyc_status?: Database["public"]["Enums"]["kyc_status"]
          kyc_tier?: Database["public"]["Enums"]["kyc_tier"]
          phone_number?: string | null
          postal_code?: string | null
          risk_score?: number | null
          state_province?: string | null
          stellar_public_key?: string | null
          stellar_seed_encrypted?: string | null
          street_address?: string | null
          stripe_customer_id?: string | null
          transaction_pin_failed_attempts?: number
          transaction_pin_hash?: string | null
          transaction_pin_locked_until?: string | null
          transaction_pin_set_at?: string | null
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
      saved_payment_methods: {
        Row: {
          card_brand: string | null
          cardholder_name: string | null
          country_code: string | null
          created_at: string
          currency_code: string | null
          exp_month: number | null
          exp_year: number | null
          id: string
          is_default: boolean
          last_four: string | null
          stripe_customer_id: string
          stripe_payment_method_id: string
          user_id: string
        }
        Insert: {
          card_brand?: string | null
          cardholder_name?: string | null
          country_code?: string | null
          created_at?: string
          currency_code?: string | null
          exp_month?: number | null
          exp_year?: number | null
          id?: string
          is_default?: boolean
          last_four?: string | null
          stripe_customer_id: string
          stripe_payment_method_id: string
          user_id: string
        }
        Update: {
          card_brand?: string | null
          cardholder_name?: string | null
          country_code?: string | null
          created_at?: string
          currency_code?: string | null
          exp_month?: number | null
          exp_year?: number | null
          id?: string
          is_default?: boolean
          last_four?: string | null
          stripe_customer_id?: string
          stripe_payment_method_id?: string
          user_id?: string
        }
        Relationships: []
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
      short_links: {
        Row: {
          code: string
          created_at: string
          expires_at: string | null
          max_uses: number | null
          owner_id: string | null
          params: Json
          revoked_at: string | null
          target_path: string
          use_count: number
        }
        Insert: {
          code: string
          created_at?: string
          expires_at?: string | null
          max_uses?: number | null
          owner_id?: string | null
          params?: Json
          revoked_at?: string | null
          target_path: string
          use_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string | null
          max_uses?: number | null
          owner_id?: string | null
          params?: Json
          revoked_at?: string | null
          target_path?: string
          use_count?: number
        }
        Relationships: []
      }
      stripe_connected_accounts: {
        Row: {
          capabilities: Json
          contact_email: string | null
          country: string
          created_at: string
          dashboard: string
          display_name: string | null
          id: string
          raw: Json | null
          requirements: Json
          status: string
          stripe_account_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          capabilities?: Json
          contact_email?: string | null
          country: string
          created_at?: string
          dashboard?: string
          display_name?: string | null
          id?: string
          raw?: Json | null
          requirements?: Json
          status?: string
          stripe_account_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          capabilities?: Json
          contact_email?: string | null
          country?: string
          created_at?: string
          dashboard?: string
          display_name?: string | null
          id?: string
          raw?: Json | null
          requirements?: Json
          status?: string
          stripe_account_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stripe_payin_sessions: {
        Row: {
          amount_minor: number
          created_at: string
          credit_amount: number
          credit_currency: string
          currency_code: string
          failure_reason: string | null
          id: string
          metadata: Json
          platform_fee_minor: number
          status: string
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          updated_at: string
          user_id: string
          wallet_id: string
        }
        Insert: {
          amount_minor: number
          created_at?: string
          credit_amount: number
          credit_currency: string
          currency_code: string
          failure_reason?: string | null
          id?: string
          metadata?: Json
          platform_fee_minor?: number
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          updated_at?: string
          user_id: string
          wallet_id: string
        }
        Update: {
          amount_minor?: number
          created_at?: string
          credit_amount?: number
          credit_currency?: string
          currency_code?: string
          failure_reason?: string | null
          id?: string
          metadata?: Json
          platform_fee_minor?: number
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          updated_at?: string
          user_id?: string
          wallet_id?: string
        }
        Relationships: []
      }
      stripe_payout_recipients: {
        Row: {
          brand: string | null
          created_at: string
          id: string
          last4: string | null
          recipient_email: string | null
          recipient_name: string
          stripe_account_id: string
          stripe_external_account_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          brand?: string | null
          created_at?: string
          id?: string
          last4?: string | null
          recipient_email?: string | null
          recipient_name: string
          stripe_account_id: string
          stripe_external_account_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          brand?: string | null
          created_at?: string
          id?: string
          last4?: string | null
          recipient_email?: string | null
          recipient_name?: string
          stripe_account_id?: string
          stripe_external_account_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sumsub_verifications: {
        Row: {
          applicant_id: string
          client_comment: string | null
          created_at: string
          id: string
          level_name: string
          moderation_comment: string | null
          raw_payload: Json | null
          requested_by_admin_id: string | null
          review_answer: string | null
          review_reject_type: string | null
          review_status: string | null
          risk_labels: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          applicant_id: string
          client_comment?: string | null
          created_at?: string
          id?: string
          level_name: string
          moderation_comment?: string | null
          raw_payload?: Json | null
          requested_by_admin_id?: string | null
          review_answer?: string | null
          review_reject_type?: string | null
          review_status?: string | null
          risk_labels?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          applicant_id?: string
          client_comment?: string | null
          created_at?: string
          id?: string
          level_name?: string
          moderation_comment?: string | null
          raw_payload?: Json | null
          requested_by_admin_id?: string | null
          review_answer?: string | null
          review_reject_type?: string | null
          review_status?: string | null
          risk_labels?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sumsub_webhook_logs: {
        Row: {
          applicant_id: string | null
          created_at: string
          event_type: string | null
          id: string
          payload: Json
          signature_valid: boolean
        }
        Insert: {
          applicant_id?: string | null
          created_at?: string
          event_type?: string | null
          id?: string
          payload: Json
          signature_valid?: boolean
        }
        Update: {
          applicant_id?: string | null
          created_at?: string
          event_type?: string | null
          id?: string
          payload?: Json
          signature_valid?: boolean
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
      tier_limits: {
        Row: {
          created_at: string
          daily_limit: number
          features_enabled: Json
          label: string
          max_balance: number
          monthly_limit: number
          single_limit: number
          tier: Database["public"]["Enums"]["user_risk_tier"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          daily_limit: number
          features_enabled?: Json
          label: string
          max_balance: number
          monthly_limit: number
          single_limit: number
          tier: Database["public"]["Enums"]["user_risk_tier"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          daily_limit?: number
          features_enabled?: Json
          label?: string
          max_balance?: number
          monthly_limit?: number
          single_limit?: number
          tier?: Database["public"]["Enums"]["user_risk_tier"]
          updated_at?: string
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
          circle_idempotency_key: string | null
          circle_payload: Json | null
          circle_quote_id: string | null
          circle_status: string | null
          circle_transfer_id: string | null
          completed_at: string | null
          created_at: string
          exchange_rate: number
          failure_reason: string | null
          fee_amount: number
          funding_source: string
          id: string
          interac_security_answer: string | null
          interac_security_question: string | null
          payout_method: string | null
          paysafe_payment_id: string | null
          provider_charge_id: string | null
          provider_reference: string | null
          recipient_account: string | null
          recipient_bank_code: string | null
          recipient_bank_name: string | null
          recipient_country: string
          recipient_name: string
          recipient_phone: string | null
          sender_id: string | null
          sender_wallet_id: string
          source_amount: number
          source_currency: string
          status: Database["public"]["Enums"]["transfer_status"]
          stellar_tx_hash: string | null
          stripe_payout_id: string | null
          target_amount: number
          target_currency: string
          transfer_type: Database["public"]["Enums"]["transfer_type"]
          updated_at: string
        }
        Insert: {
          circle_idempotency_key?: string | null
          circle_payload?: Json | null
          circle_quote_id?: string | null
          circle_status?: string | null
          circle_transfer_id?: string | null
          completed_at?: string | null
          created_at?: string
          exchange_rate?: number
          failure_reason?: string | null
          fee_amount?: number
          funding_source?: string
          id?: string
          interac_security_answer?: string | null
          interac_security_question?: string | null
          payout_method?: string | null
          paysafe_payment_id?: string | null
          provider_charge_id?: string | null
          provider_reference?: string | null
          recipient_account?: string | null
          recipient_bank_code?: string | null
          recipient_bank_name?: string | null
          recipient_country: string
          recipient_name: string
          recipient_phone?: string | null
          sender_id?: string | null
          sender_wallet_id: string
          source_amount: number
          source_currency: string
          status?: Database["public"]["Enums"]["transfer_status"]
          stellar_tx_hash?: string | null
          stripe_payout_id?: string | null
          target_amount: number
          target_currency: string
          transfer_type: Database["public"]["Enums"]["transfer_type"]
          updated_at?: string
        }
        Update: {
          circle_idempotency_key?: string | null
          circle_payload?: Json | null
          circle_quote_id?: string | null
          circle_status?: string | null
          circle_transfer_id?: string | null
          completed_at?: string | null
          created_at?: string
          exchange_rate?: number
          failure_reason?: string | null
          fee_amount?: number
          funding_source?: string
          id?: string
          interac_security_answer?: string | null
          interac_security_question?: string | null
          payout_method?: string | null
          paysafe_payment_id?: string | null
          provider_charge_id?: string | null
          provider_reference?: string | null
          recipient_account?: string | null
          recipient_bank_code?: string | null
          recipient_bank_name?: string | null
          recipient_country?: string
          recipient_name?: string
          recipient_phone?: string | null
          sender_id?: string | null
          sender_wallet_id?: string
          source_amount?: number
          source_currency?: string
          status?: Database["public"]["Enums"]["transfer_status"]
          stellar_tx_hash?: string | null
          stripe_payout_id?: string | null
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
      treasury_financial_accounts: {
        Row: {
          aba_routing: string | null
          account_number_last4: string | null
          balance_available: number
          balance_pending: number
          connected_account_id: string | null
          created_at: string
          currency: string
          features: Json
          id: string
          metadata: Json
          owner_kind: string
          status: string
          stripe_fa_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          aba_routing?: string | null
          account_number_last4?: string | null
          balance_available?: number
          balance_pending?: number
          connected_account_id?: string | null
          created_at?: string
          currency?: string
          features?: Json
          id?: string
          metadata?: Json
          owner_kind: string
          status?: string
          stripe_fa_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          aba_routing?: string | null
          account_number_last4?: string | null
          balance_available?: number
          balance_pending?: number
          connected_account_id?: string | null
          created_at?: string
          currency?: string
          features?: Json
          id?: string
          metadata?: Json
          owner_kind?: string
          status?: string
          stripe_fa_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      treasury_received_entries: {
        Row: {
          amount: number
          counterparty: Json
          created_at: string
          currency: string
          description: string | null
          fa_id: string
          id: string
          journal_id: string | null
          kind: string
          network: string | null
          status: string
          stripe_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount: number
          counterparty?: Json
          created_at?: string
          currency?: string
          description?: string | null
          fa_id: string
          id?: string
          journal_id?: string | null
          kind: string
          network?: string | null
          status?: string
          stripe_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          counterparty?: Json
          created_at?: string
          currency?: string
          description?: string | null
          fa_id?: string
          id?: string
          journal_id?: string | null
          kind?: string
          network?: string | null
          status?: string
          stripe_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "treasury_received_entries_fa_id_fkey"
            columns: ["fa_id"]
            isOneToOne: false
            referencedRelation: "treasury_financial_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      treasury_transfers: {
        Row: {
          amount: number
          counterparty: Json
          created_at: string
          currency: string
          description: string | null
          direction: string
          fa_id: string
          failure_reason: string | null
          id: string
          journal_id: string | null
          kind: string
          metadata: Json
          network: string | null
          status: string
          stripe_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount: number
          counterparty?: Json
          created_at?: string
          currency?: string
          description?: string | null
          direction: string
          fa_id: string
          failure_reason?: string | null
          id?: string
          journal_id?: string | null
          kind: string
          metadata?: Json
          network?: string | null
          status?: string
          stripe_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          counterparty?: Json
          created_at?: string
          currency?: string
          description?: string | null
          direction?: string
          fa_id?: string
          failure_reason?: string | null
          id?: string
          journal_id?: string | null
          kind?: string
          metadata?: Json
          network?: string | null
          status?: string
          stripe_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "treasury_transfers_fa_id_fkey"
            columns: ["fa_id"]
            isOneToOne: false
            referencedRelation: "treasury_financial_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      treasury_webhook_events: {
        Row: {
          created_at: string
          error: string | null
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
          stripe_event_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          event_type: string
          id?: string
          payload: Json
          processed_at?: string | null
          stripe_event_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          stripe_event_id?: string
        }
        Relationships: []
      }
      user_risk_tiers: {
        Row: {
          created_at: string
          current_tier: Database["public"]["Enums"]["user_risk_tier"]
          daily_transaction_limit: number
          features_enabled: Json
          id: string
          monthly_transaction_limit: number
          single_transaction_limit: number
          updated_at: string
          upgraded_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          current_tier?: Database["public"]["Enums"]["user_risk_tier"]
          daily_transaction_limit?: number
          features_enabled?: Json
          id?: string
          monthly_transaction_limit?: number
          single_transaction_limit?: number
          updated_at?: string
          upgraded_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          current_tier?: Database["public"]["Enums"]["user_risk_tier"]
          daily_transaction_limit?: number
          features_enabled?: Json
          id?: string
          monthly_transaction_limit?: number
          single_transaction_limit?: number
          updated_at?: string
          upgraded_at?: string | null
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
      virtual_accounts: {
        Row: {
          account_name: string
          account_number: string
          bank_name: string
          created_at: string
          currency_code: string
          expires_at: string | null
          flw_order_ref: string | null
          flw_response: Json | null
          id: string
          is_permanent: boolean
          status: Database["public"]["Enums"]["virtual_account_status"]
          updated_at: string
          user_id: string
          wallet_id: string | null
        }
        Insert: {
          account_name: string
          account_number: string
          bank_name: string
          created_at?: string
          currency_code: string
          expires_at?: string | null
          flw_order_ref?: string | null
          flw_response?: Json | null
          id?: string
          is_permanent?: boolean
          status?: Database["public"]["Enums"]["virtual_account_status"]
          updated_at?: string
          user_id: string
          wallet_id?: string | null
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_name?: string
          created_at?: string
          currency_code?: string
          expires_at?: string | null
          flw_order_ref?: string | null
          flw_response?: Json | null
          id?: string
          is_permanent?: boolean
          status?: Database["public"]["Enums"]["virtual_account_status"]
          updated_at?: string
          user_id?: string
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "virtual_accounts_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
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
          stellar_address: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency_code: string
          id?: string
          is_default?: boolean
          status?: Database["public"]["Enums"]["wallet_status"]
          stellar_address?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency_code?: string
          id?: string
          is_default?: boolean
          status?: Database["public"]["Enums"]["wallet_status"]
          stellar_address?: string | null
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
      webhook_events: {
        Row: {
          created_at: string
          event_type: string | null
          id: string
          payload: Json | null
          provider: string
        }
        Insert: {
          created_at?: string
          event_type?: string | null
          id?: string
          payload?: Json | null
          provider: string
        }
        Update: {
          created_at?: string
          event_type?: string | null
          id?: string
          payload?: Json | null
          provider?: string
        }
        Relationships: []
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
      _gen_short_code: { Args: { p_len?: number }; Returns: string }
      aml_normalize_name: { Args: { p_name: string }; Returns: string }
      check_rate_limit: {
        Args: {
          p_key: string
          p_max_requests: number
          p_window_seconds: number
        }
        Returns: boolean
      }
      create_short_link: {
        Args: {
          p_expires_at?: string
          p_max_uses?: number
          p_params?: Json
          p_target_path: string
        }
        Returns: string
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
      generate_account_number: { Args: never; Returns: string }
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
      has_transaction_pin: { Args: never; Returns: boolean }
      invoke_aml_screen: {
        Args: { p_trigger: string; p_trigger_ref: string; p_user_id: string }
        Returns: undefined
      }
      invoke_generate_receipt: {
        Args: { p_transfer_id: string }
        Returns: undefined
      }
      invoke_send_email: {
        Args: { p_data: Json; p_to: string; p_type: string }
        Returns: undefined
      }
      is_admin_user: { Args: { _uid: string }; Returns: boolean }
      is_business_program_owner: {
        Args: { _program_id: string; _user_id: string }
        Returns: boolean
      }
      is_kyc_reviewer: { Args: { _uid: string }; Returns: boolean }
      is_super_admin: { Args: { _uid: string }; Returns: boolean }
      lookup_efin_recipient: {
        Args: { p_query: string }
        Returns: {
          account_number: string
          avatar_url: string
          efin_tag: string
          email: string
          full_name: string
          user_id: string
        }[]
      }
      resolve_short_link: {
        Args: { p_code: string }
        Returns: {
          params: Json
          target_path: string
        }[]
      }
      run_compliance_checks: {
        Args: { p_transfer_id: string }
        Returns: number
      }
      set_transaction_pin: { Args: { p_pin: string }; Returns: boolean }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      validate_compliance_parameters: {
        Args: { p_parameters: Json; p_rule_type: string }
        Returns: boolean
      }
      verify_transaction_pin: { Args: { p_pin: string }; Returns: Json }
    }
    Enums: {
      account_status_enum:
        | "pending_verification"
        | "active"
        | "suspended"
        | "closed"
      account_type: "asset" | "liability" | "income" | "expense" | "equity"
      admin_user_role:
        | "super_admin"
        | "compliance_officer"
        | "support_agent"
        | "viewer"
      alert_severity: "low" | "medium" | "high" | "critical"
      alert_status:
        | "open"
        | "investigating"
        | "escalated"
        | "resolved"
        | "false_positive"
      aml_entity_type:
        | "individual"
        | "entity"
        | "vessel"
        | "aircraft"
        | "unknown"
      aml_match_disposition:
        | "pending"
        | "true_match"
        | "false_positive"
        | "escalated"
      aml_profile_status: "unscreened" | "clear" | "hit" | "review"
      aml_screening_status: "clear" | "hit" | "error"
      aml_screening_trigger: "kyc" | "transfer" | "p2p" | "manual" | "rescreen"
      aml_source: "ofac" | "un" | "eu" | "uk" | "ca" | "pep"
      app_role: "user" | "admin" | "compliance" | "support" | "finance"
      business_card_role: "owner" | "admin" | "member"
      card_authorization_status:
        | "pending"
        | "approved"
        | "declined"
        | "reversed"
        | "expired"
      card_fraud_severity: "low" | "medium" | "high" | "critical"
      card_funding_source: "wallet" | "eft"
      card_funding_status: "pending" | "completed" | "failed" | "reversed"
      cardholder_status: "active" | "inactive" | "blocked"
      cardholder_type: "individual" | "company"
      currency_type: "fiat" | "crypto"
      invoice_status:
        | "draft"
        | "sent"
        | "paid"
        | "partial"
        | "overdue"
        | "cancelled"
      issued_card_purpose:
        | "personal"
        | "business"
        | "single_use"
        | "subscription"
      issued_card_status: "active" | "frozen" | "cancelled" | "pending"
      issued_card_type: "virtual" | "physical"
      kyc_address_doc_type:
        | "utility_bill"
        | "bank_statement"
        | "tax_document"
        | "lease_agreement"
      kyc_current_step: "identity" | "address" | "liveness" | "completed"
      kyc_doc_review_status: "pending" | "approved" | "rejected"
      kyc_id_doc_type: "passport" | "drivers_license" | "national_id"
      kyc_status: "pending" | "submitted" | "verified" | "rejected" | "expired"
      kyc_tier: "tier_0" | "tier_1" | "tier_2" | "tier_3"
      kyc_verification_status:
        | "not_started"
        | "in_progress"
        | "pending_review"
        | "approved"
        | "rejected"
        | "expired"
      payment_link_claim_method: "interac" | "card_push" | "eft"
      payment_link_source: "send" | "invoice"
      payment_link_status:
        | "pending"
        | "claimed"
        | "expired"
        | "revoked"
        | "failed"
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
      user_risk_tier: "tier_1" | "tier_2" | "tier_3" | "tier_4"
      virtual_account_status: "active" | "inactive" | "expired"
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
      account_status_enum: [
        "pending_verification",
        "active",
        "suspended",
        "closed",
      ],
      account_type: ["asset", "liability", "income", "expense", "equity"],
      admin_user_role: [
        "super_admin",
        "compliance_officer",
        "support_agent",
        "viewer",
      ],
      alert_severity: ["low", "medium", "high", "critical"],
      alert_status: [
        "open",
        "investigating",
        "escalated",
        "resolved",
        "false_positive",
      ],
      aml_entity_type: [
        "individual",
        "entity",
        "vessel",
        "aircraft",
        "unknown",
      ],
      aml_match_disposition: [
        "pending",
        "true_match",
        "false_positive",
        "escalated",
      ],
      aml_profile_status: ["unscreened", "clear", "hit", "review"],
      aml_screening_status: ["clear", "hit", "error"],
      aml_screening_trigger: ["kyc", "transfer", "p2p", "manual", "rescreen"],
      aml_source: ["ofac", "un", "eu", "uk", "ca", "pep"],
      app_role: ["user", "admin", "compliance", "support", "finance"],
      business_card_role: ["owner", "admin", "member"],
      card_authorization_status: [
        "pending",
        "approved",
        "declined",
        "reversed",
        "expired",
      ],
      card_fraud_severity: ["low", "medium", "high", "critical"],
      card_funding_source: ["wallet", "eft"],
      card_funding_status: ["pending", "completed", "failed", "reversed"],
      cardholder_status: ["active", "inactive", "blocked"],
      cardholder_type: ["individual", "company"],
      currency_type: ["fiat", "crypto"],
      invoice_status: [
        "draft",
        "sent",
        "paid",
        "partial",
        "overdue",
        "cancelled",
      ],
      issued_card_purpose: [
        "personal",
        "business",
        "single_use",
        "subscription",
      ],
      issued_card_status: ["active", "frozen", "cancelled", "pending"],
      issued_card_type: ["virtual", "physical"],
      kyc_address_doc_type: [
        "utility_bill",
        "bank_statement",
        "tax_document",
        "lease_agreement",
      ],
      kyc_current_step: ["identity", "address", "liveness", "completed"],
      kyc_doc_review_status: ["pending", "approved", "rejected"],
      kyc_id_doc_type: ["passport", "drivers_license", "national_id"],
      kyc_status: ["pending", "submitted", "verified", "rejected", "expired"],
      kyc_tier: ["tier_0", "tier_1", "tier_2", "tier_3"],
      kyc_verification_status: [
        "not_started",
        "in_progress",
        "pending_review",
        "approved",
        "rejected",
        "expired",
      ],
      payment_link_claim_method: ["interac", "card_push", "eft"],
      payment_link_source: ["send", "invoice"],
      payment_link_status: [
        "pending",
        "claimed",
        "expired",
        "revoked",
        "failed",
      ],
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
      user_risk_tier: ["tier_1", "tier_2", "tier_3", "tier_4"],
      virtual_account_status: ["active", "inactive", "expired"],
      wallet_status: ["active", "frozen", "suspended", "closed"],
    },
  },
} as const
