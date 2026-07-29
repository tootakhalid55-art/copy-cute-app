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
      account_determinations: {
        Row: {
          account_code: string
          branch_id: string | null
          created_at: string
          description: string | null
          doc_kind: string | null
          id: string
          is_active: boolean
          key: string
          meta: Json
          org_id: string
          updated_at: string
        }
        Insert: {
          account_code: string
          branch_id?: string | null
          created_at?: string
          description?: string | null
          doc_kind?: string | null
          id?: string
          is_active?: boolean
          key: string
          meta?: Json
          org_id: string
          updated_at?: string
        }
        Update: {
          account_code?: string
          branch_id?: string | null
          created_at?: string
          description?: string | null
          doc_kind?: string | null
          id?: string
          is_active?: boolean
          key?: string
          meta?: Json
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_determinations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_determinations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_periods: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          end_date: string
          fa_locked_at: string | null
          fa_locked_by: string | null
          fiscal_year_id: string
          id: string
          name: string
          org_id: string
          period_number: number
          reopened_at: string | null
          reopened_by: string | null
          start_date: string
          status: Database["public"]["Enums"]["period_status"]
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          end_date: string
          fa_locked_at?: string | null
          fa_locked_by?: string | null
          fiscal_year_id: string
          id?: string
          name: string
          org_id: string
          period_number: number
          reopened_at?: string | null
          reopened_by?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["period_status"]
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          end_date?: string
          fa_locked_at?: string | null
          fa_locked_by?: string | null
          fiscal_year_id?: string
          id?: string
          name?: string
          org_id?: string
          period_number?: number
          reopened_at?: string | null
          reopened_by?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["period_status"]
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
            foreignKeyName: "accounting_periods_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_copilot_conversations: {
        Row: {
          created_at: string
          id: string
          language: string
          last_message_at: string
          meta: Json
          module: string | null
          org_id: string
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          language?: string
          last_message_at?: string
          meta?: Json
          module?: string | null
          org_id: string
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          language?: string
          last_message_at?: string
          meta?: Json
          module?: string | null
          org_id?: string
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_copilot_conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_copilot_decisions: {
        Row: {
          answer: string
          citations: Json
          confidence: number | null
          conversation_id: string | null
          created_at: string
          document_id: string | null
          evidence: Json
          explainability: Json
          follow_ups: Json
          id: string
          input: Json
          intake_id: string | null
          kind: string
          language: string
          meta: Json
          model: string | null
          module: string | null
          org_id: string
          question: string | null
          recommendation: string | null
          user_id: string | null
        }
        Insert: {
          answer: string
          citations?: Json
          confidence?: number | null
          conversation_id?: string | null
          created_at?: string
          document_id?: string | null
          evidence?: Json
          explainability?: Json
          follow_ups?: Json
          id?: string
          input?: Json
          intake_id?: string | null
          kind: string
          language?: string
          meta?: Json
          model?: string | null
          module?: string | null
          org_id: string
          question?: string | null
          recommendation?: string | null
          user_id?: string | null
        }
        Update: {
          answer?: string
          citations?: Json
          confidence?: number | null
          conversation_id?: string | null
          created_at?: string
          document_id?: string | null
          evidence?: Json
          explainability?: Json
          follow_ups?: Json
          id?: string
          input?: Json
          intake_id?: string | null
          kind?: string
          language?: string
          meta?: Json
          model?: string | null
          module?: string | null
          org_id?: string
          question?: string | null
          recommendation?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_copilot_decisions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_copilot_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_copilot_decisions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document_open_balances"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "ai_copilot_decisions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_copilot_decisions_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "ap_intake_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_copilot_decisions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ap_approval_thresholds: {
        Row: {
          active: boolean
          auto_post: boolean
          branch_id: string | null
          created_at: string
          id: string
          max_amount: number | null
          min_amount: number
          name: string
          org_id: string
          party_id: string | null
          priority: number
          required_levels: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          auto_post?: boolean
          branch_id?: string | null
          created_at?: string
          id?: string
          max_amount?: number | null
          min_amount?: number
          name: string
          org_id: string
          party_id?: string | null
          priority?: number
          required_levels?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          auto_post?: boolean
          branch_id?: string | null
          created_at?: string
          id?: string
          max_amount?: number | null
          min_amount?: number
          name?: string
          org_id?: string
          party_id?: string | null
          priority?: number
          required_levels?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ap_approval_thresholds_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ap_approval_thresholds_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ap_approval_thresholds_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      ap_intake_approvals: {
        Row: {
          actor_id: string | null
          comment: string | null
          created_at: string
          decision: string
          id: string
          intake_id: string
          level: number
          org_id: string
        }
        Insert: {
          actor_id?: string | null
          comment?: string | null
          created_at?: string
          decision: string
          id?: string
          intake_id: string
          level?: number
          org_id: string
        }
        Update: {
          actor_id?: string | null
          comment?: string | null
          created_at?: string
          decision?: string
          id?: string
          intake_id?: string
          level?: number
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ap_intake_approvals_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "ap_intake_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ap_intake_approvals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ap_intake_corrections: {
        Row: {
          actor_id: string | null
          corrected_value: Json | null
          created_at: string
          extracted_value: Json | null
          field_path: string
          id: string
          intake_id: string
          org_id: string
          party_id: string | null
        }
        Insert: {
          actor_id?: string | null
          corrected_value?: Json | null
          created_at?: string
          extracted_value?: Json | null
          field_path: string
          id?: string
          intake_id: string
          org_id: string
          party_id?: string | null
        }
        Update: {
          actor_id?: string | null
          corrected_value?: Json | null
          created_at?: string
          extracted_value?: Json | null
          field_path?: string
          id?: string
          intake_id?: string
          org_id?: string
          party_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ap_intake_corrections_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "ap_intake_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ap_intake_corrections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ap_intake_corrections_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      ap_intake_documents: {
        Row: {
          assigned_to: string | null
          attachment_id: string | null
          channel: string
          confidence: number | null
          created_at: string
          duplicate_of: string | null
          error_message: string | null
          extraction: Json | null
          extraction_completed_at: string | null
          extraction_model: string | null
          extraction_started_at: string | null
          grn_document_id: string | null
          id: string
          match_confidence: number | null
          matched_bill_id: string | null
          matched_party_id: string | null
          ocr_language: string | null
          org_id: string
          page_count: number | null
          po_document_id: string | null
          processing_time_ms: number | null
          raw_payload: Json | null
          received_at: string
          sender: string | null
          source_ref: string | null
          status: string
          subject: string | null
          updated_at: string
          validation: Json | null
        }
        Insert: {
          assigned_to?: string | null
          attachment_id?: string | null
          channel: string
          confidence?: number | null
          created_at?: string
          duplicate_of?: string | null
          error_message?: string | null
          extraction?: Json | null
          extraction_completed_at?: string | null
          extraction_model?: string | null
          extraction_started_at?: string | null
          grn_document_id?: string | null
          id?: string
          match_confidence?: number | null
          matched_bill_id?: string | null
          matched_party_id?: string | null
          ocr_language?: string | null
          org_id: string
          page_count?: number | null
          po_document_id?: string | null
          processing_time_ms?: number | null
          raw_payload?: Json | null
          received_at?: string
          sender?: string | null
          source_ref?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
          validation?: Json | null
        }
        Update: {
          assigned_to?: string | null
          attachment_id?: string | null
          channel?: string
          confidence?: number | null
          created_at?: string
          duplicate_of?: string | null
          error_message?: string | null
          extraction?: Json | null
          extraction_completed_at?: string | null
          extraction_model?: string | null
          extraction_started_at?: string | null
          grn_document_id?: string | null
          id?: string
          match_confidence?: number | null
          matched_bill_id?: string | null
          matched_party_id?: string | null
          ocr_language?: string | null
          org_id?: string
          page_count?: number | null
          po_document_id?: string | null
          processing_time_ms?: number | null
          raw_payload?: Json | null
          received_at?: string
          sender?: string | null
          source_ref?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
          validation?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ap_intake_documents_attachment_id_fkey"
            columns: ["attachment_id"]
            isOneToOne: false
            referencedRelation: "attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ap_intake_documents_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "ap_intake_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ap_intake_documents_grn_document_id_fkey"
            columns: ["grn_document_id"]
            isOneToOne: false
            referencedRelation: "document_open_balances"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "ap_intake_documents_grn_document_id_fkey"
            columns: ["grn_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ap_intake_documents_matched_bill_id_fkey"
            columns: ["matched_bill_id"]
            isOneToOne: false
            referencedRelation: "document_open_balances"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "ap_intake_documents_matched_bill_id_fkey"
            columns: ["matched_bill_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ap_intake_documents_matched_party_id_fkey"
            columns: ["matched_party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ap_intake_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ap_intake_documents_po_document_id_fkey"
            columns: ["po_document_id"]
            isOneToOne: false
            referencedRelation: "document_open_balances"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "ap_intake_documents_po_document_id_fkey"
            columns: ["po_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      ap_intake_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          intake_id: string
          org_id: string
          payload: Json | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          intake_id: string
          org_id: string
          payload?: Json | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          intake_id?: string
          org_id?: string
          payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ap_intake_events_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "ap_intake_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ap_intake_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ap_intake_queue: {
        Row: {
          attempts: number
          created_at: string
          id: string
          intake_id: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          next_run_at: string
          org_id: string
          payload: Json
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          intake_id: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_run_at?: string
          org_id: string
          payload?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          intake_id?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_run_at?: string
          org_id?: string
          payload?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ap_intake_queue_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "ap_intake_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ap_intake_queue_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ap_supplier_layouts: {
        Row: {
          created_at: string
          hints: Json
          id: string
          last_seen_at: string | null
          org_id: string
          party_id: string
          sample_count: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          hints?: Json
          id?: string
          last_seen_at?: string | null
          org_id: string
          party_id: string
          sample_count?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          hints?: Json
          id?: string
          last_seen_at?: string | null
          org_id?: string
          party_id?: string
          sample_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ap_supplier_layouts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ap_supplier_layouts_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_actions: {
        Row: {
          action: string
          actor_id: string | null
          comment: string | null
          created_at: string
          id: string
          meta: Json
          org_id: string
          request_id: string
          step_id: string | null
          step_order: number
        }
        Insert: {
          action: string
          actor_id?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          meta?: Json
          org_id: string
          request_id: string
          step_id?: string | null
          step_order: number
        }
        Update: {
          action?: string
          actor_id?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          meta?: Json
          org_id?: string
          request_id?: string
          step_id?: string | null
          step_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "approval_actions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_actions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "approval_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_actions_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "approval_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_requests: {
        Row: {
          completed_at: string | null
          created_at: string
          current_step: number
          document_id: string | null
          entity_id: string
          entity_type: string
          id: string
          meta: Json
          org_id: string
          requested_by: string | null
          status: string
          updated_at: string
          workflow_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_step?: number
          document_id?: string | null
          entity_id: string
          entity_type?: string
          id?: string
          meta?: Json
          org_id: string
          requested_by?: string | null
          status?: string
          updated_at?: string
          workflow_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_step?: number
          document_id?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          meta?: Json
          org_id?: string
          requested_by?: string | null
          status?: string
          updated_at?: string
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document_open_balances"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "approval_requests_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "approval_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_steps: {
        Row: {
          approver_role: Database["public"]["Enums"]["app_role"] | null
          approver_user_id: string | null
          created_at: string
          id: string
          meta: Json
          name: string
          org_id: string
          required: boolean
          step_order: number
          workflow_id: string
        }
        Insert: {
          approver_role?: Database["public"]["Enums"]["app_role"] | null
          approver_user_id?: string | null
          created_at?: string
          id?: string
          meta?: Json
          name: string
          org_id: string
          required?: boolean
          step_order: number
          workflow_id: string
        }
        Update: {
          approver_role?: Database["public"]["Enums"]["app_role"] | null
          approver_user_id?: string | null
          created_at?: string
          id?: string
          meta?: Json
          name?: string
          org_id?: string
          required?: boolean
          step_order?: number
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_steps_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_steps_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "approval_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_workflows: {
        Row: {
          auto_post_on_final: boolean
          created_at: string
          doc_kind: Database["public"]["Enums"]["doc_kind"] | null
          entity_type: string
          id: string
          is_active: boolean
          max_amount: number | null
          meta: Json
          min_amount: number | null
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          auto_post_on_final?: boolean
          created_at?: string
          doc_kind?: Database["public"]["Enums"]["doc_kind"] | null
          entity_type?: string
          id?: string
          is_active?: boolean
          max_amount?: number | null
          meta?: Json
          min_amount?: number | null
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          auto_post_on_final?: boolean
          created_at?: string
          doc_kind?: Database["public"]["Enums"]["doc_kind"] | null
          entity_type?: string
          id?: string
          is_active?: boolean
          max_amount?: number | null
          meta?: Json
          min_amount?: number | null
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_workflows_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      attachment_versions: {
        Row: {
          attachment_id: string
          bucket: string
          checksum: string | null
          created_at: string
          filename: string
          id: string
          mime_type: string | null
          org_id: string
          size_bytes: number | null
          storage_path: string
          uploaded_by: string | null
          version: number
        }
        Insert: {
          attachment_id: string
          bucket: string
          checksum?: string | null
          created_at?: string
          filename: string
          id?: string
          mime_type?: string | null
          org_id: string
          size_bytes?: number | null
          storage_path: string
          uploaded_by?: string | null
          version: number
        }
        Update: {
          attachment_id?: string
          bucket?: string
          checksum?: string | null
          created_at?: string
          filename?: string
          id?: string
          mime_type?: string | null
          org_id?: string
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "attachment_versions_attachment_id_fkey"
            columns: ["attachment_id"]
            isOneToOne: false
            referencedRelation: "attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachment_versions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          bucket: string
          checksum: string | null
          confidence: number | null
          created_at: string
          entity_id: string
          entity_type: string
          extracted_json: Json | null
          filename: string
          height: number | null
          id: string
          is_current: boolean
          medium_path: string | null
          meta: Json
          mime_type: string | null
          ocr_provider: string | null
          ocr_status: string | null
          org_id: string
          page_count: number | null
          searchable_text: string | null
          size_bytes: number | null
          storage_path: string
          thumb_path: string | null
          uploaded_by: string
          version: number
          width: number | null
        }
        Insert: {
          bucket: string
          checksum?: string | null
          confidence?: number | null
          created_at?: string
          entity_id: string
          entity_type: string
          extracted_json?: Json | null
          filename: string
          height?: number | null
          id?: string
          is_current?: boolean
          medium_path?: string | null
          meta?: Json
          mime_type?: string | null
          ocr_provider?: string | null
          ocr_status?: string | null
          org_id: string
          page_count?: number | null
          searchable_text?: string | null
          size_bytes?: number | null
          storage_path: string
          thumb_path?: string | null
          uploaded_by: string
          version?: number
          width?: number | null
        }
        Update: {
          bucket?: string
          checksum?: string | null
          confidence?: number | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          extracted_json?: Json | null
          filename?: string
          height?: number | null
          id?: string
          is_current?: boolean
          medium_path?: string | null
          meta?: Json
          mime_type?: string | null
          ocr_provider?: string | null
          ocr_status?: string | null
          org_id?: string
          page_count?: number | null
          searchable_text?: string | null
          size_bytes?: number | null
          storage_path?: string
          thumb_path?: string | null
          uploaded_by?: string
          version?: number
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: number
          ip: unknown
          new_value: Json | null
          old_value: Json | null
          org_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: number
          ip?: unknown
          new_value?: Json | null
          old_value?: Json | null
          org_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: number
          ip?: unknown
          new_value?: Json | null
          old_value?: Json | null
          org_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: Json
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          meta: Json
          name: string
          name_en: string | null
          org_id: string
          updated_at: string
        }
        Insert: {
          address?: Json
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          meta?: Json
          name: string
          name_en?: string | null
          org_id: string
          updated_at?: string
        }
        Update: {
          address?: Json
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          meta?: Json
          name?: string
          name_en?: string | null
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_bank_accounts: {
        Row: {
          account_number: string | null
          bank_name: string | null
          branch_id: string | null
          created_at: string
          currency: string
          gl_account_code: string
          iban: string | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["cash_account_kind"]
          meta: Json
          name: string
          name_en: string | null
          opening_balance: number
          opening_date: string | null
          org_id: string
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          bank_name?: string | null
          branch_id?: string | null
          created_at?: string
          currency?: string
          gl_account_code: string
          iban?: string | null
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["cash_account_kind"]
          meta?: Json
          name: string
          name_en?: string | null
          opening_balance?: number
          opening_date?: string | null
          org_id: string
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          bank_name?: string | null
          branch_id?: string | null
          created_at?: string
          currency?: string
          gl_account_code?: string
          iban?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["cash_account_kind"]
          meta?: Json
          name?: string
          name_en?: string | null
          opening_balance?: number
          opening_date?: string | null
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_bank_accounts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_bank_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_bank_transactions: {
        Row: {
          account_id: string
          amount: number
          branch_id: string | null
          counter_account_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          exchange_rate: number
          id: string
          journal_entry_id: string | null
          kind: Database["public"]["Enums"]["cash_txn_kind"]
          memo: string | null
          meta: Json
          org_id: string
          party_id: string | null
          reconciled: boolean
          reconciled_at: string | null
          reconciled_by: string | null
          reference: string | null
          source_document_id: string | null
          txn_date: string
          updated_at: string
        }
        Insert: {
          account_id: string
          amount: number
          branch_id?: string | null
          counter_account_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          exchange_rate?: number
          id?: string
          journal_entry_id?: string | null
          kind: Database["public"]["Enums"]["cash_txn_kind"]
          memo?: string | null
          meta?: Json
          org_id: string
          party_id?: string | null
          reconciled?: boolean
          reconciled_at?: string | null
          reconciled_by?: string | null
          reference?: string | null
          source_document_id?: string | null
          txn_date?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          amount?: number
          branch_id?: string | null
          counter_account_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          exchange_rate?: number
          id?: string
          journal_entry_id?: string | null
          kind?: Database["public"]["Enums"]["cash_txn_kind"]
          memo?: string | null
          meta?: Json
          org_id?: string
          party_id?: string | null
          reconciled?: boolean
          reconciled_at?: string | null
          reconciled_by?: string | null
          reference?: string | null
          source_document_id?: string | null
          txn_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_bank_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "cash_bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_bank_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "cash_bank_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "cash_bank_transactions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_bank_transactions_counter_account_id_fkey"
            columns: ["counter_account_id"]
            isOneToOne: false
            referencedRelation: "cash_bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_bank_transactions_counter_account_id_fkey"
            columns: ["counter_account_id"]
            isOneToOne: false
            referencedRelation: "cash_bank_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "cash_bank_transactions_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_bank_transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_bank_transactions_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_bank_transactions_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "document_open_balances"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "cash_bank_transactions_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_of_accounts: {
        Row: {
          allow_branch: boolean
          allow_cost_center: boolean
          category: string | null
          code: string
          created_at: string
          currency: string
          description: string | null
          id: string
          is_active: boolean
          is_header: boolean
          meta: Json
          name: string
          name_en: string | null
          number: string | null
          opening_balance: number
          org_id: string
          parent_id: string | null
          type: Database["public"]["Enums"]["account_type"]
          updated_at: string
        }
        Insert: {
          allow_branch?: boolean
          allow_cost_center?: boolean
          category?: string | null
          code: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_header?: boolean
          meta?: Json
          name: string
          name_en?: string | null
          number?: string | null
          opening_balance?: number
          org_id: string
          parent_id?: string | null
          type: Database["public"]["Enums"]["account_type"]
          updated_at?: string
        }
        Update: {
          allow_branch?: boolean
          allow_cost_center?: boolean
          category?: string | null
          code?: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_header?: boolean
          meta?: Json
          name?: string
          name_en?: string | null
          number?: string | null
          opening_balance?: number
          org_id?: string
          parent_id?: string | null
          type?: Database["public"]["Enums"]["account_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_of_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_action_proposals: {
        Row: {
          action_kind: string
          confirmed_by: string | null
          conversation_id: string | null
          created_at: string
          decision_id: string | null
          error: string | null
          executed_at: string | null
          expires_at: string | null
          id: string
          language: string
          module: string | null
          org_id: string
          payload: Json
          preview: Json
          proposed_by: string | null
          requires_approval: boolean
          result_entity_id: string | null
          result_entity_type: string | null
          risk_level: string
          status: Database["public"]["Enums"]["copilot_action_status"]
          summary: string | null
          title: string
          updated_at: string
          user_note: string | null
        }
        Insert: {
          action_kind: string
          confirmed_by?: string | null
          conversation_id?: string | null
          created_at?: string
          decision_id?: string | null
          error?: string | null
          executed_at?: string | null
          expires_at?: string | null
          id?: string
          language?: string
          module?: string | null
          org_id: string
          payload?: Json
          preview?: Json
          proposed_by?: string | null
          requires_approval?: boolean
          result_entity_id?: string | null
          result_entity_type?: string | null
          risk_level?: string
          status?: Database["public"]["Enums"]["copilot_action_status"]
          summary?: string | null
          title: string
          updated_at?: string
          user_note?: string | null
        }
        Update: {
          action_kind?: string
          confirmed_by?: string | null
          conversation_id?: string | null
          created_at?: string
          decision_id?: string | null
          error?: string | null
          executed_at?: string | null
          expires_at?: string | null
          id?: string
          language?: string
          module?: string | null
          org_id?: string
          payload?: Json
          preview?: Json
          proposed_by?: string | null
          requires_approval?: boolean
          result_entity_id?: string | null
          result_entity_type?: string | null
          risk_level?: string
          status?: Database["public"]["Enums"]["copilot_action_status"]
          summary?: string | null
          title?: string
          updated_at?: string
          user_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "copilot_action_proposals_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_copilot_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_action_proposals_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "ai_copilot_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_action_proposals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_followup_tasks: {
        Row: {
          assignee: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          org_id: string
          priority: string
          proposal_id: string | null
          related_id: string | null
          related_kind: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          org_id: string
          priority?: string
          proposal_id?: string | null
          related_id?: string | null
          related_kind?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          org_id?: string
          priority?: string
          proposal_id?: string | null
          related_id?: string | null
          related_kind?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "copilot_followup_tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_followup_tasks_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "copilot_action_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_centers: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          meta: Json
          name: string
          name_en: string | null
          org_id: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          meta?: Json
          name: string
          name_en?: string | null
          org_id: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          meta?: Json
          name?: string
          name_en?: string | null
          org_id?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_centers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_centers_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      document_lines: {
        Row: {
          description: string
          description_en: string | null
          discount: number
          document_id: string
          id: string
          is_reverse_charge: boolean
          is_tax_inclusive: boolean
          item_id: string | null
          line_total: number
          meta: Json
          position: number
          price: number
          qty: number
          tax_amount: number
          tax_code_id: string | null
          tax_rate: number
          taxable_amount: number
          unit: string | null
        }
        Insert: {
          description: string
          description_en?: string | null
          discount?: number
          document_id: string
          id?: string
          is_reverse_charge?: boolean
          is_tax_inclusive?: boolean
          item_id?: string | null
          line_total?: number
          meta?: Json
          position?: number
          price?: number
          qty?: number
          tax_amount?: number
          tax_code_id?: string | null
          tax_rate?: number
          taxable_amount?: number
          unit?: string | null
        }
        Update: {
          description?: string
          description_en?: string | null
          discount?: number
          document_id?: string
          id?: string
          is_reverse_charge?: boolean
          is_tax_inclusive?: boolean
          item_id?: string | null
          line_total?: number
          meta?: Json
          position?: number
          price?: number
          qty?: number
          tax_amount?: number
          tax_code_id?: string | null
          tax_rate?: number
          taxable_amount?: number
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_lines_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document_open_balances"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "document_lines_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_lines_tax_code_id_fkey"
            columns: ["tax_code_id"]
            isOneToOne: false
            referencedRelation: "tax_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      document_relations: {
        Row: {
          created_at: string
          created_by: string | null
          from_document_id: string
          id: string
          meta: Json
          org_id: string
          relation_type: string
          to_document_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          from_document_id: string
          id?: string
          meta?: Json
          org_id: string
          relation_type: string
          to_document_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          from_document_id?: string
          id?: string
          meta?: Json
          org_id?: string
          relation_type?: string
          to_document_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_relations_from_document_id_fkey"
            columns: ["from_document_id"]
            isOneToOne: false
            referencedRelation: "document_open_balances"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "document_relations_from_document_id_fkey"
            columns: ["from_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_relations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_relations_to_document_id_fkey"
            columns: ["to_document_id"]
            isOneToOne: false
            referencedRelation: "document_open_balances"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "document_relations_to_document_id_fkey"
            columns: ["to_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_tags: {
        Row: {
          created_at: string
          document_id: string
          org_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          document_id: string
          org_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          document_id?: string
          org_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_tags_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document_open_balances"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "document_tags_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_tags_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          created_at: string
          created_by: string | null
          document_id: string
          id: string
          org_id: string
          reason: string | null
          snapshot: Json
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          document_id: string
          id?: string
          org_id: string
          reason?: string | null
          snapshot: Json
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          document_id?: string
          id?: string
          org_id?: string
          reason?: string | null
          snapshot?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document_open_balances"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          branch_id: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string
          cryptographic_stamp: string | null
          currency: string
          discount_total: number
          doc_number: string
          due_date: string | null
          exchange_rate: number
          financial_state: Database["public"]["Enums"]["financial_state"]
          fiscal_year_id: string | null
          grand_total: number
          id: string
          invoice_hash: string | null
          issue_date: string
          kind: Database["public"]["Enums"]["doc_kind"]
          meta: Json
          notes: string | null
          org_id: string
          other_charges: number
          party_id: string | null
          party_snapshot: Json
          po_number: string | null
          posted_at: string | null
          previous_invoice_hash: string | null
          project: string | null
          qr_payload: string | null
          search_text: string | null
          shipping: number
          status: Database["public"]["Enums"]["doc_status"]
          subtotal: number
          tax_inclusive: boolean
          template_id: string | null
          terms: string | null
          updated_at: string
          updated_by: string | null
          uuid_v4: string
          vat_total: number
          xml_payload: string | null
          zatca_clearance_status: string | null
          zatca_reported_at: string | null
          zatca_uuid: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by: string
          cryptographic_stamp?: string | null
          currency?: string
          discount_total?: number
          doc_number: string
          due_date?: string | null
          exchange_rate?: number
          financial_state?: Database["public"]["Enums"]["financial_state"]
          fiscal_year_id?: string | null
          grand_total?: number
          id?: string
          invoice_hash?: string | null
          issue_date?: string
          kind: Database["public"]["Enums"]["doc_kind"]
          meta?: Json
          notes?: string | null
          org_id: string
          other_charges?: number
          party_id?: string | null
          party_snapshot?: Json
          po_number?: string | null
          posted_at?: string | null
          previous_invoice_hash?: string | null
          project?: string | null
          qr_payload?: string | null
          search_text?: string | null
          shipping?: number
          status?: Database["public"]["Enums"]["doc_status"]
          subtotal?: number
          tax_inclusive?: boolean
          template_id?: string | null
          terms?: string | null
          updated_at?: string
          updated_by?: string | null
          uuid_v4?: string
          vat_total?: number
          xml_payload?: string | null
          zatca_clearance_status?: string | null
          zatca_reported_at?: string | null
          zatca_uuid?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string
          cryptographic_stamp?: string | null
          currency?: string
          discount_total?: number
          doc_number?: string
          due_date?: string | null
          exchange_rate?: number
          financial_state?: Database["public"]["Enums"]["financial_state"]
          fiscal_year_id?: string | null
          grand_total?: number
          id?: string
          invoice_hash?: string | null
          issue_date?: string
          kind?: Database["public"]["Enums"]["doc_kind"]
          meta?: Json
          notes?: string | null
          org_id?: string
          other_charges?: number
          party_id?: string | null
          party_snapshot?: Json
          po_number?: string | null
          posted_at?: string | null
          previous_invoice_hash?: string | null
          project?: string | null
          qr_payload?: string | null
          search_text?: string | null
          shipping?: number
          status?: Database["public"]["Enums"]["doc_status"]
          subtotal?: number
          tax_inclusive?: boolean
          template_id?: string | null
          terms?: string | null
          updated_at?: string
          updated_by?: string | null
          uuid_v4?: string
          vat_total?: number
          xml_payload?: string | null
          zatca_clearance_status?: string | null
          zatca_reported_at?: string | null
          zatca_uuid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_fiscal_year_id_fkey"
            columns: ["fiscal_year_id"]
            isOneToOne: false
            referencedRelation: "fiscal_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_health_snapshots: {
        Row: {
          check_name: string
          details: Json
          id: string
          issue_count: number
          org_id: string
          ran_at: string
          severity: string
        }
        Insert: {
          check_name: string
          details?: Json
          id?: string
          issue_count?: number
          org_id: string
          ran_at?: string
          severity: string
        }
        Update: {
          check_name?: string
          details?: Json
          id?: string
          issue_count?: number
          org_id?: string
          ran_at?: string
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_health_snapshots_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_audit_log: {
        Row: {
          actor_id: string | null
          after_state: Json | null
          allocation_id: string | null
          amount: number | null
          before_state: Json | null
          created_at: string
          currency: string | null
          event_kind: Database["public"]["Enums"]["financial_audit_kind"]
          id: string
          org_id: string
          party_id: string | null
          posting_event_id: string | null
          reason: string | null
          source_document_id: string | null
          target_document_id: string | null
        }
        Insert: {
          actor_id?: string | null
          after_state?: Json | null
          allocation_id?: string | null
          amount?: number | null
          before_state?: Json | null
          created_at?: string
          currency?: string | null
          event_kind: Database["public"]["Enums"]["financial_audit_kind"]
          id?: string
          org_id: string
          party_id?: string | null
          posting_event_id?: string | null
          reason?: string | null
          source_document_id?: string | null
          target_document_id?: string | null
        }
        Update: {
          actor_id?: string | null
          after_state?: Json | null
          allocation_id?: string | null
          amount?: number | null
          before_state?: Json | null
          created_at?: string
          currency?: string | null
          event_kind?: Database["public"]["Enums"]["financial_audit_kind"]
          id?: string
          org_id?: string
          party_id?: string | null
          posting_event_id?: string | null
          reason?: string | null
          source_document_id?: string | null
          target_document_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          is_closed: boolean
          is_current: boolean
          is_locked: boolean
          name: string
          org_id: string
          reopened_at: string | null
          reopened_by: string | null
          start_date: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          end_date: string
          id?: string
          is_closed?: boolean
          is_current?: boolean
          is_locked?: boolean
          name: string
          org_id: string
          reopened_at?: string | null
          reopened_by?: string | null
          start_date: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          end_date?: string
          id?: string
          is_closed?: boolean
          is_current?: boolean
          is_locked?: boolean
          name?: string
          org_id?: string
          reopened_at?: string | null
          reopened_by?: string | null
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_years_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_asset_categories: {
        Row: {
          code: string
          created_at: string
          default_method:
            | Database["public"]["Enums"]["fa_depreciation_method"]
            | null
          default_salvage_pct: number | null
          default_useful_life_months: number | null
          id: string
          is_active: boolean
          meta: Json
          name: string
          name_en: string | null
          org_id: string
          parent_id: string | null
          revaluation_model: Database["public"]["Enums"]["fa_revaluation_model"]
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          default_method?:
            | Database["public"]["Enums"]["fa_depreciation_method"]
            | null
          default_salvage_pct?: number | null
          default_useful_life_months?: number | null
          id?: string
          is_active?: boolean
          meta?: Json
          name: string
          name_en?: string | null
          org_id: string
          parent_id?: string | null
          revaluation_model?: Database["public"]["Enums"]["fa_revaluation_model"]
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          default_method?:
            | Database["public"]["Enums"]["fa_depreciation_method"]
            | null
          default_salvage_pct?: number | null
          default_useful_life_months?: number | null
          id?: string
          is_active?: boolean
          meta?: Json
          name?: string
          name_en?: string | null
          org_id?: string
          parent_id?: string | null
          revaluation_model?: Database["public"]["Enums"]["fa_revaluation_model"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixed_asset_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_asset_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "fixed_asset_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_asset_components: {
        Row: {
          component_asset_id: string
          cost_share_amount: number | null
          cost_share_pct: number | null
          created_at: string
          id: string
          notes: string | null
          org_id: string
          parent_asset_id: string
          updated_at: string
        }
        Insert: {
          component_asset_id: string
          cost_share_amount?: number | null
          cost_share_pct?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          org_id: string
          parent_asset_id: string
          updated_at?: string
        }
        Update: {
          component_asset_id?: string
          cost_share_amount?: number | null
          cost_share_pct?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          org_id?: string
          parent_asset_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixed_asset_components_component_asset_id_fkey"
            columns: ["component_asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_asset_components_component_asset_id_fkey"
            columns: ["component_asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_asset_components_component_asset_id_fkey"
            columns: ["component_asset_id"]
            isOneToOne: false
            referencedRelation: "v_fixed_asset_exceptions"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "fixed_asset_components_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_asset_components_parent_asset_id_fkey"
            columns: ["parent_asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_asset_components_parent_asset_id_fkey"
            columns: ["parent_asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_asset_components_parent_asset_id_fkey"
            columns: ["parent_asset_id"]
            isOneToOne: false
            referencedRelation: "v_fixed_asset_exceptions"
            referencedColumns: ["asset_id"]
          },
        ]
      }
      fixed_asset_events: {
        Row: {
          after_state: Json | null
          amount: number
          asset_id: string
          before_state: Json | null
          created_at: string
          created_by: string | null
          effective_date: string
          event_type: Database["public"]["Enums"]["fa_event_type"]
          id: string
          journal_id: string | null
          notes: string | null
          org_id: string
          payload: Json
          reversed_by: string | null
          reverses_event_id: string | null
          status: Database["public"]["Enums"]["fa_event_status"]
        }
        Insert: {
          after_state?: Json | null
          amount?: number
          asset_id: string
          before_state?: Json | null
          created_at?: string
          created_by?: string | null
          effective_date: string
          event_type: Database["public"]["Enums"]["fa_event_type"]
          id?: string
          journal_id?: string | null
          notes?: string | null
          org_id: string
          payload?: Json
          reversed_by?: string | null
          reverses_event_id?: string | null
          status?: Database["public"]["Enums"]["fa_event_status"]
        }
        Update: {
          after_state?: Json | null
          amount?: number
          asset_id?: string
          before_state?: Json | null
          created_at?: string
          created_by?: string | null
          effective_date?: string
          event_type?: Database["public"]["Enums"]["fa_event_type"]
          id?: string
          journal_id?: string | null
          notes?: string | null
          org_id?: string
          payload?: Json
          reversed_by?: string | null
          reverses_event_id?: string | null
          status?: Database["public"]["Enums"]["fa_event_status"]
        }
        Relationships: [
          {
            foreignKeyName: "fixed_asset_events_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_asset_events_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_asset_events_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "v_fixed_asset_exceptions"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "fixed_asset_events_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_asset_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_asset_events_reversed_by_fkey"
            columns: ["reversed_by"]
            isOneToOne: false
            referencedRelation: "fixed_asset_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_asset_events_reverses_event_id_fkey"
            columns: ["reverses_event_id"]
            isOneToOne: false
            referencedRelation: "fixed_asset_events"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_asset_groups: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          name_en: string | null
          org_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          name_en?: string | null
          org_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          name_en?: string | null
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixed_asset_groups_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_asset_method_params: {
        Row: {
          asset_id: string
          created_at: string
          ddb_factor: number | null
          id: string
          manual_monthly_amount: number | null
          meta: Json
          org_id: string
          total_units: number | null
          units_this_period: number | null
          updated_at: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          ddb_factor?: number | null
          id?: string
          manual_monthly_amount?: number | null
          meta?: Json
          org_id: string
          total_units?: number | null
          units_this_period?: number | null
          updated_at?: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          ddb_factor?: number | null
          id?: string
          manual_monthly_amount?: number | null
          meta?: Json
          org_id?: string
          total_units?: number | null
          units_this_period?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixed_asset_method_params_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: true
            referencedRelation: "fixed_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_asset_method_params_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: true
            referencedRelation: "fixed_assets_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_asset_method_params_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: true
            referencedRelation: "v_fixed_asset_exceptions"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "fixed_asset_method_params_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_asset_runs: {
        Row: {
          asset_count: number
          created_at: string
          created_by: string | null
          id: string
          journal_id: string | null
          memo: string | null
          meta: Json
          org_id: string
          period_end: string
          period_start: string
          reversed_at: string | null
          reversed_by: string | null
          status: string
          total_depreciation: number
          updated_at: string
        }
        Insert: {
          asset_count?: number
          created_at?: string
          created_by?: string | null
          id?: string
          journal_id?: string | null
          memo?: string | null
          meta?: Json
          org_id: string
          period_end: string
          period_start: string
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
          total_depreciation?: number
          updated_at?: string
        }
        Update: {
          asset_count?: number
          created_at?: string
          created_by?: string | null
          id?: string
          journal_id?: string | null
          memo?: string | null
          meta?: Json
          org_id?: string
          period_end?: string
          period_start?: string
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
          total_depreciation?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixed_asset_runs_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_asset_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_asset_schedules: {
        Row: {
          accumulated: number
          asset_id: string
          closing_nbv: number
          computation: Json
          created_at: string
          days: number
          depreciation: number
          id: string
          locked: boolean
          method: Database["public"]["Enums"]["fa_depreciation_method"]
          notes: string | null
          opening_nbv: number
          org_id: string
          period_end: string
          period_start: string
          run_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          accumulated?: number
          asset_id: string
          closing_nbv?: number
          computation?: Json
          created_at?: string
          days?: number
          depreciation?: number
          id?: string
          locked?: boolean
          method: Database["public"]["Enums"]["fa_depreciation_method"]
          notes?: string | null
          opening_nbv?: number
          org_id: string
          period_end: string
          period_start: string
          run_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          accumulated?: number
          asset_id?: string
          closing_nbv?: number
          computation?: Json
          created_at?: string
          days?: number
          depreciation?: number
          id?: string
          locked?: boolean
          method?: Database["public"]["Enums"]["fa_depreciation_method"]
          notes?: string | null
          opening_nbv?: number
          org_id?: string
          period_end?: string
          period_start?: string
          run_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixed_asset_schedules_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_asset_schedules_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_asset_schedules_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "v_fixed_asset_exceptions"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "fixed_asset_schedules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_asset_schedules_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "fixed_asset_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_asset_settings: {
        Row: {
          capitalization_threshold: number
          created_at: string
          default_convention: string
          default_currency: string
          default_method: Database["public"]["Enums"]["fa_depreciation_method"]
          default_useful_life_months: number
          meta: Json
          org_id: string
          updated_at: string
        }
        Insert: {
          capitalization_threshold?: number
          created_at?: string
          default_convention?: string
          default_currency?: string
          default_method?: Database["public"]["Enums"]["fa_depreciation_method"]
          default_useful_life_months?: number
          meta?: Json
          org_id: string
          updated_at?: string
        }
        Update: {
          capitalization_threshold?: number
          created_at?: string
          default_convention?: string
          default_currency?: string
          default_method?: Database["public"]["Enums"]["fa_depreciation_method"]
          default_useful_life_months?: number
          meta?: Json
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixed_asset_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_asset_templates: {
        Row: {
          category_id: string | null
          created_at: string
          defaults: Json
          id: string
          is_active: boolean
          name: string
          name_en: string | null
          org_id: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          defaults?: Json
          id?: string
          is_active?: boolean
          name: string
          name_en?: string | null
          org_id: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          defaults?: Json
          id?: string
          is_active?: boolean
          name?: string
          name_en?: string | null
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixed_asset_templates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "fixed_asset_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_asset_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_assets: {
        Row: {
          accumulated_depreciation: number
          acquisition_cost: number
          acquisition_date: string | null
          ap_intake_document_id: string | null
          barcode: string | null
          bill_document_id: string | null
          bill_line_id: string | null
          branch_id: string | null
          category_id: string | null
          code: string
          cost_center_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          custodian_name: string | null
          custodian_user_id: string | null
          custom: Json
          department: string | null
          description: string | null
          disposal_method: string | null
          disposed_at: string | null
          gps_lat: number | null
          gps_lng: number | null
          group_id: string | null
          health_score: number | null
          health_tier: string | null
          id: string
          impairment_loss: number
          in_service_date: string | null
          is_cip: boolean
          is_component: boolean
          last_depreciation_date: string | null
          last_used_at: string | null
          location_text: string | null
          manufacturer: string | null
          method: Database["public"]["Enums"]["fa_depreciation_method"]
          model: string | null
          name: string
          name_en: string | null
          notes: string | null
          org_id: string
          parent_asset_id: string | null
          project: string | null
          purchase_order_id: string | null
          qr_payload: string | null
          residual_value: number
          revaluation_surplus: number
          rfid_tag: string | null
          serial_number: string | null
          status: Database["public"]["Enums"]["fa_status"]
          supplier_party_id: string | null
          updated_at: string
          useful_life_months: number | null
          warranty_from: string | null
          warranty_to: string | null
        }
        Insert: {
          accumulated_depreciation?: number
          acquisition_cost?: number
          acquisition_date?: string | null
          ap_intake_document_id?: string | null
          barcode?: string | null
          bill_document_id?: string | null
          bill_line_id?: string | null
          branch_id?: string | null
          category_id?: string | null
          code: string
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          custodian_name?: string | null
          custodian_user_id?: string | null
          custom?: Json
          department?: string | null
          description?: string | null
          disposal_method?: string | null
          disposed_at?: string | null
          gps_lat?: number | null
          gps_lng?: number | null
          group_id?: string | null
          health_score?: number | null
          health_tier?: string | null
          id?: string
          impairment_loss?: number
          in_service_date?: string | null
          is_cip?: boolean
          is_component?: boolean
          last_depreciation_date?: string | null
          last_used_at?: string | null
          location_text?: string | null
          manufacturer?: string | null
          method?: Database["public"]["Enums"]["fa_depreciation_method"]
          model?: string | null
          name: string
          name_en?: string | null
          notes?: string | null
          org_id: string
          parent_asset_id?: string | null
          project?: string | null
          purchase_order_id?: string | null
          qr_payload?: string | null
          residual_value?: number
          revaluation_surplus?: number
          rfid_tag?: string | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["fa_status"]
          supplier_party_id?: string | null
          updated_at?: string
          useful_life_months?: number | null
          warranty_from?: string | null
          warranty_to?: string | null
        }
        Update: {
          accumulated_depreciation?: number
          acquisition_cost?: number
          acquisition_date?: string | null
          ap_intake_document_id?: string | null
          barcode?: string | null
          bill_document_id?: string | null
          bill_line_id?: string | null
          branch_id?: string | null
          category_id?: string | null
          code?: string
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          custodian_name?: string | null
          custodian_user_id?: string | null
          custom?: Json
          department?: string | null
          description?: string | null
          disposal_method?: string | null
          disposed_at?: string | null
          gps_lat?: number | null
          gps_lng?: number | null
          group_id?: string | null
          health_score?: number | null
          health_tier?: string | null
          id?: string
          impairment_loss?: number
          in_service_date?: string | null
          is_cip?: boolean
          is_component?: boolean
          last_depreciation_date?: string | null
          last_used_at?: string | null
          location_text?: string | null
          manufacturer?: string | null
          method?: Database["public"]["Enums"]["fa_depreciation_method"]
          model?: string | null
          name?: string
          name_en?: string | null
          notes?: string | null
          org_id?: string
          parent_asset_id?: string | null
          project?: string | null
          purchase_order_id?: string | null
          qr_payload?: string | null
          residual_value?: number
          revaluation_surplus?: number
          rfid_tag?: string | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["fa_status"]
          supplier_party_id?: string | null
          updated_at?: string
          useful_life_months?: number | null
          warranty_from?: string | null
          warranty_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fixed_assets_ap_intake_document_id_fkey"
            columns: ["ap_intake_document_id"]
            isOneToOne: false
            referencedRelation: "ap_intake_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_bill_document_id_fkey"
            columns: ["bill_document_id"]
            isOneToOne: false
            referencedRelation: "document_open_balances"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "fixed_assets_bill_document_id_fkey"
            columns: ["bill_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_bill_line_id_fkey"
            columns: ["bill_line_id"]
            isOneToOne: false
            referencedRelation: "document_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "fixed_asset_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "fixed_asset_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_parent_asset_id_fkey"
            columns: ["parent_asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_parent_asset_id_fkey"
            columns: ["parent_asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_parent_asset_id_fkey"
            columns: ["parent_asset_id"]
            isOneToOne: false
            referencedRelation: "v_fixed_asset_exceptions"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "fixed_assets_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "document_open_balances"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "fixed_assets_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_supplier_party_id_fkey"
            columns: ["supplier_party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_documents: {
        Row: {
          created_at: string
          created_by: string | null
          filename: string
          id: string
          linked_document_id: string | null
          ocr_json: Json | null
          org_id: string
          source: string
          status: string
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          filename: string
          id?: string
          linked_document_id?: string | null
          ocr_json?: Json | null
          org_id: string
          source?: string
          status?: string
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          filename?: string
          id?: string
          linked_document_id?: string | null
          ocr_json?: Json | null
          org_id?: string
          source?: string
          status?: string
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbox_documents_linked_document_id_fkey"
            columns: ["linked_document_id"]
            isOneToOne: false
            referencedRelation: "document_open_balances"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "inbox_documents_linked_document_id_fkey"
            columns: ["linked_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          cost: number
          created_at: string
          id: string
          kind: string
          meta: Json
          name: string
          name_en: string | null
          org_id: string
          price: number
          sku: string | null
          stock: number
          tax_rate: number
          unit: string | null
          updated_at: string
        }
        Insert: {
          cost?: number
          created_at?: string
          id?: string
          kind?: string
          meta?: Json
          name: string
          name_en?: string | null
          org_id: string
          price?: number
          sku?: string | null
          stock?: number
          tax_rate?: number
          unit?: string | null
          updated_at?: string
        }
        Update: {
          cost?: number
          created_at?: string
          id?: string
          kind?: string
          meta?: Json
          name?: string
          name_en?: string | null
          org_id?: string
          price?: number
          sku?: string | null
          stock?: number
          tax_rate?: number
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          branch_id: string | null
          created_at: string
          created_by: string
          currency: string
          entry_date: string
          entry_number: string
          event_id: string | null
          event_type: Database["public"]["Enums"]["posting_event_type"] | null
          exchange_rate: number
          fiscal_year_id: string | null
          id: string
          memo: string | null
          meta: Json
          org_id: string
          period_id: string | null
          posted_at: string | null
          posted_by: string | null
          reversed_at: string | null
          reversed_by: string | null
          reversed_by_entry_id: string | null
          reverses_entry_id: string | null
          source_document_id: string | null
          source_document_type: string | null
          source_module: string | null
          status: Database["public"]["Enums"]["journal_status"]
          total_credit: number
          total_debit: number
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          created_by: string
          currency?: string
          entry_date?: string
          entry_number: string
          event_id?: string | null
          event_type?: Database["public"]["Enums"]["posting_event_type"] | null
          exchange_rate?: number
          fiscal_year_id?: string | null
          id?: string
          memo?: string | null
          meta?: Json
          org_id: string
          period_id?: string | null
          posted_at?: string | null
          posted_by?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          reversed_by_entry_id?: string | null
          reverses_entry_id?: string | null
          source_document_id?: string | null
          source_document_type?: string | null
          source_module?: string | null
          status?: Database["public"]["Enums"]["journal_status"]
          total_credit?: number
          total_debit?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          entry_date?: string
          entry_number?: string
          event_id?: string | null
          event_type?: Database["public"]["Enums"]["posting_event_type"] | null
          exchange_rate?: number
          fiscal_year_id?: string | null
          id?: string
          memo?: string | null
          meta?: Json
          org_id?: string
          period_id?: string | null
          posted_at?: string | null
          posted_by?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          reversed_by_entry_id?: string | null
          reverses_entry_id?: string | null
          source_document_id?: string | null
          source_document_type?: string | null
          source_module?: string | null
          status?: Database["public"]["Enums"]["journal_status"]
          total_credit?: number
          total_debit?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
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
            foreignKeyName: "journal_entries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
            foreignKeyName: "journal_entries_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "v_fa_calendar"
            referencedColumns: ["period_id"]
          },
          {
            foreignKeyName: "journal_entries_reversed_by_entry_id_fkey"
            columns: ["reversed_by_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_reverses_entry_id_fkey"
            columns: ["reverses_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          account_id: string
          branch_id: string | null
          cost_center_id: string | null
          created_at: string
          credit: number
          credit_fc: number
          currency: string
          debit: number
          debit_fc: number
          description: string | null
          entry_id: string
          exchange_rate: number
          id: string
          line_no: number
          meta: Json
          org_id: string
          party_id: string | null
        }
        Insert: {
          account_id: string
          branch_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          credit?: number
          credit_fc?: number
          currency?: string
          debit?: number
          debit_fc?: number
          description?: string | null
          entry_id: string
          exchange_rate?: number
          id?: string
          line_no: number
          meta?: Json
          org_id: string
          party_id?: string | null
        }
        Update: {
          account_id?: string
          branch_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          credit?: number
          credit_fc?: number
          currency?: string
          debit?: number
          debit_fc?: number
          description?: string | null
          entry_id?: string
          exchange_rate?: number
          id?: string
          line_no?: number
          meta?: Json
          org_id?: string
          party_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      migration_reports: {
        Row: {
          created_at: string
          details: Json
          duplicate: number
          failed: number
          id: string
          imported: number
          org_id: string
          scope: string
          skipped: number
          user_id: string
        }
        Insert: {
          created_at?: string
          details?: Json
          duplicate?: number
          failed?: number
          id?: string
          imported?: number
          org_id: string
          scope: string
          skipped?: number
          user_id: string
        }
        Update: {
          created_at?: string
          details?: Json
          duplicate?: number
          failed?: number
          id?: string
          imported?: number
          org_id?: string
          scope?: string
          skipped?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "migration_reports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          channel: string
          created_at: string
          document_id: string | null
          entity_id: string | null
          entity_type: string | null
          event_type: string
          id: string
          org_id: string
          payload: Json
          read_at: string | null
          status: string
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          channel?: string
          created_at?: string
          document_id?: string | null
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          id?: string
          org_id: string
          payload?: Json
          read_at?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          channel?: string
          created_at?: string
          document_id?: string | null
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          id?: string
          org_id?: string
          payload?: Json
          read_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document_open_balances"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "notifications_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      numbering_sequences: {
        Row: {
          branch_id: string | null
          created_at: string
          doc_type: string
          fiscal_year_id: string | null
          id: string
          is_active: boolean
          last_reset_at: string | null
          meta: Json
          next_number: number
          org_id: string
          padding: number
          prefix: string
          reset_policy: Database["public"]["Enums"]["numbering_reset"]
          suffix: string
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          doc_type: string
          fiscal_year_id?: string | null
          id?: string
          is_active?: boolean
          last_reset_at?: string | null
          meta?: Json
          next_number?: number
          org_id: string
          padding?: number
          prefix?: string
          reset_policy?: Database["public"]["Enums"]["numbering_reset"]
          suffix?: string
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          doc_type?: string
          fiscal_year_id?: string | null
          id?: string
          is_active?: boolean
          last_reset_at?: string | null
          meta?: Json
          next_number?: number
          org_id?: string
          padding?: number
          prefix?: string
          reset_policy?: Database["public"]["Enums"]["numbering_reset"]
          suffix?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "numbering_sequences_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "numbering_sequences_fiscal_year_id_fkey"
            columns: ["fiscal_year_id"]
            isOneToOne: false
            referencedRelation: "fiscal_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "numbering_sequences_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ocr_jobs: {
        Row: {
          attachment_id: string
          attempts: number
          created_at: string
          id: string
          last_error: string | null
          org_id: string
          provider: string | null
          result: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          attachment_id: string
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          org_id: string
          provider?: string | null
          result?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          attachment_id?: string
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          org_id?: string
          provider?: string | null
          result?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ocr_jobs_attachment_id_fkey"
            columns: ["attachment_id"]
            isOneToOne: false
            referencedRelation: "attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocr_jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: Json
          cr_number: string | null
          created_at: string
          created_by: string
          currency: string
          default_credit_policy: Database["public"]["Enums"]["credit_limit_policy"]
          email: string | null
          id: string
          logo_url: string | null
          name: string
          name_en: string | null
          phone: string | null
          settings: Json
          stamp_url: string | null
          updated_at: string
          vat_number: string | null
        }
        Insert: {
          address?: Json
          cr_number?: string | null
          created_at?: string
          created_by: string
          currency?: string
          default_credit_policy?: Database["public"]["Enums"]["credit_limit_policy"]
          email?: string | null
          id?: string
          logo_url?: string | null
          name: string
          name_en?: string | null
          phone?: string | null
          settings?: Json
          stamp_url?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Update: {
          address?: Json
          cr_number?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          default_credit_policy?: Database["public"]["Enums"]["credit_limit_policy"]
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          name_en?: string | null
          phone?: string | null
          settings?: Json
          stamp_url?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Relationships: []
      }
      parties: {
        Row: {
          address: Json
          code: string | null
          cr_number: string | null
          created_at: string
          credit_hold: boolean
          credit_hold_at: string | null
          credit_hold_by: string | null
          credit_hold_reason: string | null
          credit_limit: number | null
          credit_policy:
            | Database["public"]["Enums"]["credit_limit_policy"]
            | null
          currency: string
          email: string | null
          id: string
          meta: Json
          name: string
          name_en: string | null
          notes: string | null
          opening_balance: number
          org_id: string
          payment_terms_days: number
          phone: string | null
          type: Database["public"]["Enums"]["party_type"]
          updated_at: string
          vat_number: string | null
        }
        Insert: {
          address?: Json
          code?: string | null
          cr_number?: string | null
          created_at?: string
          credit_hold?: boolean
          credit_hold_at?: string | null
          credit_hold_by?: string | null
          credit_hold_reason?: string | null
          credit_limit?: number | null
          credit_policy?:
            | Database["public"]["Enums"]["credit_limit_policy"]
            | null
          currency?: string
          email?: string | null
          id?: string
          meta?: Json
          name: string
          name_en?: string | null
          notes?: string | null
          opening_balance?: number
          org_id: string
          payment_terms_days?: number
          phone?: string | null
          type?: Database["public"]["Enums"]["party_type"]
          updated_at?: string
          vat_number?: string | null
        }
        Update: {
          address?: Json
          code?: string | null
          cr_number?: string | null
          created_at?: string
          credit_hold?: boolean
          credit_hold_at?: string | null
          credit_hold_by?: string | null
          credit_hold_reason?: string | null
          credit_limit?: number | null
          credit_policy?:
            | Database["public"]["Enums"]["credit_limit_policy"]
            | null
          currency?: string
          email?: string | null
          id?: string
          meta?: Json
          name?: string
          name_en?: string | null
          notes?: string | null
          opening_balance?: number
          org_id?: string
          payment_terms_days?: number
          phone?: string | null
          type?: Database["public"]["Enums"]["party_type"]
          updated_at?: string
          vat_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parties_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_allocations: {
        Row: {
          allocation_date: string
          amount: number
          branch_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          exchange_rate: number
          id: string
          journal_entry_id: string | null
          memo: string | null
          meta: Json
          org_id: string
          party_id: string | null
          source_document_id: string | null
          source_kind: Database["public"]["Enums"]["allocation_source_kind"]
          target_document_id: string
          target_kind: Database["public"]["Enums"]["allocation_target_kind"]
          updated_at: string
        }
        Insert: {
          allocation_date?: string
          amount: number
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          exchange_rate?: number
          id?: string
          journal_entry_id?: string | null
          memo?: string | null
          meta?: Json
          org_id: string
          party_id?: string | null
          source_document_id?: string | null
          source_kind: Database["public"]["Enums"]["allocation_source_kind"]
          target_document_id: string
          target_kind: Database["public"]["Enums"]["allocation_target_kind"]
          updated_at?: string
        }
        Update: {
          allocation_date?: string
          amount?: number
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          exchange_rate?: number
          id?: string
          journal_entry_id?: string | null
          memo?: string | null
          meta?: Json
          org_id?: string
          party_id?: string | null
          source_document_id?: string | null
          source_kind?: Database["public"]["Enums"]["allocation_source_kind"]
          target_document_id?: string
          target_kind?: Database["public"]["Enums"]["allocation_target_kind"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "document_open_balances"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "payment_allocations_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_target_document_id_fkey"
            columns: ["target_document_id"]
            isOneToOne: false
            referencedRelation: "document_open_balances"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "payment_allocations_target_document_id_fkey"
            columns: ["target_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admin_audit_log: {
        Row: {
          action: string
          actor_user_id: string
          created_at: string
          id: string
          metadata: Json
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_user_id: string
          created_at?: string
          id?: string
          metadata?: Json
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          target_user_id?: string | null
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          active: boolean
          granted_at: string
          granted_by: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          granted_at?: string
          granted_by?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          granted_at?: string
          granted_by?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      posting_events: {
        Row: {
          created_at: string
          created_by: string | null
          error: string | null
          event_key: string
          event_type: Database["public"]["Enums"]["posting_event_type"]
          id: string
          journal_entry_id: string | null
          org_id: string
          payload: Json
          processed_at: string | null
          source_document_id: string | null
          source_module: string | null
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          event_key: string
          event_type: Database["public"]["Enums"]["posting_event_type"]
          id?: string
          journal_entry_id?: string | null
          org_id: string
          payload?: Json
          processed_at?: string | null
          source_document_id?: string | null
          source_module?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          event_key?: string
          event_type?: Database["public"]["Enums"]["posting_event_type"]
          id?: string
          journal_entry_id?: string | null
          org_id?: string
          payload?: Json
          processed_at?: string | null
          source_document_id?: string | null
          source_module?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "posting_events_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posting_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      posting_rules: {
        Row: {
          config: Json
          created_at: string
          description: string | null
          event_type: Database["public"]["Enums"]["posting_event_type"]
          id: string
          is_active: boolean
          name: string
          org_id: string
          priority: number
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          description?: string | null
          event_type: Database["public"]["Enums"]["posting_event_type"]
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          priority?: number
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          description?: string | null
          event_type?: Database["public"]["Enums"]["posting_event_type"]
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          priority?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "posting_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      supplier_aliases: {
        Row: {
          alias_type: string
          alias_value: string
          confidence: number | null
          created_at: string
          id: string
          normalized: string
          org_id: string
          party_id: string
          source: string | null
        }
        Insert: {
          alias_type: string
          alias_value: string
          confidence?: number | null
          created_at?: string
          id?: string
          normalized: string
          org_id: string
          party_id: string
          source?: string | null
        }
        Update: {
          alias_type?: string
          alias_value?: string
          confidence?: number | null
          created_at?: string
          id?: string
          normalized?: string
          org_id?: string
          party_id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_aliases_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_aliases_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          org_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          org_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_codes: {
        Row: {
          code: string
          created_at: string
          description: string
          description_en: string | null
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean
          is_payable: boolean
          is_recoverable: boolean
          meta: Json
          org_id: string
          payable_key: string
          rate: number
          recoverable_key: string
          tax_type: Database["public"]["Enums"]["tax_type"]
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description: string
          description_en?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          is_payable?: boolean
          is_recoverable?: boolean
          meta?: Json
          org_id: string
          payable_key?: string
          rate?: number
          recoverable_key?: string
          tax_type: Database["public"]["Enums"]["tax_type"]
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          description_en?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          is_payable?: boolean
          is_recoverable?: boolean
          meta?: Json
          org_id?: string
          payable_key?: string
          rate?: number
          recoverable_key?: string
          tax_type?: Database["public"]["Enums"]["tax_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_codes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      ap_intake_metrics: {
        Row: {
          auto_drafted: number | null
          avg_confidence: number | null
          avg_processing_ms: number | null
          duplicates: number | null
          failed: number | null
          org_id: string | null
          posted: number | null
          review_queue: number | null
          total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ap_intake_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_bank_balances: {
        Row: {
          account_id: string | null
          balance: number | null
          currency: string | null
          kind: Database["public"]["Enums"]["cash_account_kind"] | null
          name: string | null
          org_id: string | null
          reconciled_balance: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_bank_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_open_balances: {
        Row: {
          allocated_amount: number | null
          branch_id: string | null
          consumed_amount: number | null
          currency: string | null
          doc_number: string | null
          document_id: string | null
          due_date: string | null
          issue_date: string | null
          kind: string | null
          open_as_target: number | null
          org_id: string | null
          original_amount: number | null
          party_id: string | null
          status: string | null
          unapplied_as_source: number | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      fa_asset_rollforward: {
        Row: {
          accumulated: number | null
          asset_id: string | null
          closing_nbv: number | null
          code: string | null
          depreciation: number | null
          name: string | null
          opening_nbv: number | null
          org_id: string | null
          period_end: string | null
          run_id: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fixed_asset_schedules_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_asset_schedules_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_asset_schedules_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "v_fixed_asset_exceptions"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "fixed_asset_schedules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_asset_schedules_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "fixed_asset_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_health_latest: {
        Row: {
          check_name: string | null
          details: Json | null
          issue_count: number | null
          org_id: string | null
          ran_at: string | null
          severity: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_health_snapshots_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_assets_overview: {
        Row: {
          accumulated_depreciation: number | null
          acquisition_cost: number | null
          acquisition_date: string | null
          bill_document_id: string | null
          branch_id: string | null
          category_id: string | null
          category_name: string | null
          code: string | null
          cost_center_id: string | null
          created_at: string | null
          currency: string | null
          custodian_name: string | null
          custodian_user_id: string | null
          group_id: string | null
          group_name: string | null
          id: string | null
          in_service_date: string | null
          is_cip: boolean | null
          location_text: string | null
          method: Database["public"]["Enums"]["fa_depreciation_method"] | null
          name: string | null
          name_en: string | null
          net_book_value: number | null
          org_id: string | null
          residual_value: number | null
          serial_number: string | null
          status: Database["public"]["Enums"]["fa_status"] | null
          supplier_name: string | null
          supplier_party_id: string | null
          updated_at: string | null
          useful_life_months: number | null
          warranty_to: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fixed_assets_bill_document_id_fkey"
            columns: ["bill_document_id"]
            isOneToOne: false
            referencedRelation: "document_open_balances"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "fixed_assets_bill_document_id_fkey"
            columns: ["bill_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "fixed_asset_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "fixed_asset_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_supplier_party_id_fkey"
            columns: ["supplier_party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      party_balances: {
        Row: {
          balance: number | null
          org_id: string | null
          party_id: string | null
          party_type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      v_asset_timeline: {
        Row: {
          amount: number | null
          asset_id: string | null
          event_date: string | null
          event_id: string | null
          event_kind: string | null
          journal_id: string | null
          org_id: string | null
          payload: Json | null
          title: string | null
        }
        Relationships: []
      }
      v_fa_calendar: {
        Row: {
          end_date: string | null
          fa_locked: boolean | null
          org_id: string | null
          period_id: string | null
          period_name: string | null
          period_status: string | null
          posted_run_id: string | null
          posted_runs: number | null
          posted_total: number | null
          reversed_runs: number | null
          start_date: string | null
        }
        Insert: {
          end_date?: string | null
          fa_locked?: never
          org_id?: string | null
          period_id?: string | null
          period_name?: string | null
          period_status?: never
          posted_run_id?: never
          posted_runs?: never
          posted_total?: never
          reversed_runs?: never
          start_date?: string | null
        }
        Update: {
          end_date?: string | null
          fa_locked?: never
          org_id?: string | null
          period_id?: string | null
          period_name?: string | null
          period_status?: never
          posted_run_id?: never
          posted_runs?: never
          posted_total?: never
          reversed_runs?: never
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounting_periods_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_fixed_asset_exceptions: {
        Row: {
          accumulated_depreciation: number | null
          acquisition_cost: number | null
          asset_id: string | null
          code: string | null
          exception_type: string | null
          in_service_date: string | null
          is_cip: boolean | null
          last_depreciation_date: string | null
          method: Database["public"]["Enums"]["fa_depreciation_method"] | null
          name: string | null
          org_id: string | null
          residual_value: number | null
          status: Database["public"]["Enums"]["fa_status"] | null
          useful_life_months: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fixed_assets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _create_settlement_doc: {
        Args: {
          _kind: Database["public"]["Enums"]["doc_kind"]
          _org: string
          _payload: Json
        }
        Returns: string
      }
      allocate_payment: {
        Args: { _org: string; _payload: Json }
        Returns: string[]
      }
      ap_intake_queue_pick: {
        Args: { _limit?: number }
        Returns: {
          attempts: number
          created_at: string
          id: string
          intake_id: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          next_run_at: string
          org_id: string
          payload: Json
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "ap_intake_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      capitalize_asset_from_bill: {
        Args: { _bill: string; _org: string; _payload: Json }
        Returns: string
      }
      check_credit: {
        Args: { _new_amount?: number; _org: string; _party: string }
        Returns: Json
      }
      close_accounting_period: {
        Args: { _org: string; _period_id: string }
        Returns: undefined
      }
      create_payment: {
        Args: { _org: string; _payload: Json }
        Returns: string
      }
      create_receipt: {
        Args: { _org: string; _payload: Json }
        Returns: string
      }
      create_refund: { Args: { _org: string; _payload: Json }; Returns: string }
      create_writeoff: {
        Args: { _org: string; _payload: Json }
        Returns: string
      }
      cron_run_finance_health_all: { Args: never; Returns: number }
      fa_compute_month_depreciation: {
        Args: {
          _asset: Database["public"]["Tables"]["fixed_assets"]["Row"]
          _params: Database["public"]["Tables"]["fixed_asset_method_params"]["Row"]
          _period_end: string
        }
        Returns: number
      }
      fa_depreciation_forecast: {
        Args: { _asset_id: string; _months?: number }
        Returns: {
          accumulated: number
          closing_nbv: number
          depreciation: number
          opening_nbv: number
          period_end: string
        }[]
      }
      fa_dispose: {
        Args: {
          _asset_id: string
          _date: string
          _method: string
          _notes?: string
          _proceeds: number
        }
        Returns: Json
      }
      fa_explain_schedule: { Args: { _schedule_id: string }; Returns: Json }
      fa_impair: {
        Args: {
          _asset_id: string
          _date: string
          _reason?: string
          _recoverable_amount: number
        }
        Returns: Json
      }
      fa_improve: {
        Args: {
          _amount: number
          _asset_id: string
          _date: string
          _extend_life_months: number
          _notes?: string
        }
        Returns: Json
      }
      fa_post_depreciation_run: {
        Args: { _memo?: string; _org: string; _period_end: string }
        Returns: string
      }
      fa_preview_depreciation: {
        Args: {
          _branch_id?: string
          _category_id?: string
          _org: string
          _period_end: string
        }
        Returns: {
          already_posted: boolean
          asset_id: string
          category_id: string
          category_name: string
          closing_nbv: number
          code: string
          cost_center_id: string
          depreciation: number
          method: Database["public"]["Enums"]["fa_depreciation_method"]
          name: string
          opening_nbv: number
          reason: string
        }[]
      }
      fa_reactivate: {
        Args: { _asset_id: string; _date: string; _notes?: string }
        Returns: Json
      }
      fa_reopen_period: {
        Args: { _org: string; _period_end: string; _reason: string }
        Returns: Json
      }
      fa_require_account: {
        Args: { _branch: string; _key: string; _org: string }
        Returns: string
      }
      fa_retire: {
        Args: { _asset_id: string; _date: string; _notes?: string }
        Returns: Json
      }
      fa_revalue: {
        Args: {
          _asset_id: string
          _date: string
          _new_fair_value: number
          _notes?: string
        }
        Returns: Json
      }
      fa_reverse_depreciation_run: {
        Args: { _memo?: string; _run_id: string }
        Returns: string
      }
      fa_reverse_event: {
        Args: { _event_id: string; _reason: string }
        Returns: Json
      }
      fa_simulate_run: {
        Args: { _category_id?: string; _org: string; _period_end: string }
        Returns: Json
      }
      fa_transfer: {
        Args: {
          _asset_id: string
          _custodian_name: string
          _custodian_user: string
          _date: string
          _location: string
          _notes?: string
          _to_branch: string
          _to_cost_center: string
        }
        Returns: Json
      }
      find_open_period: {
        Args: { _date: string; _org: string }
        Returns: {
          fiscal_year_id: string
          period_id: string
          status: Database["public"]["Enums"]["period_status"]
        }[]
      }
      get_aging_buckets: {
        Args: { _asof?: string; _org: string; _party_type?: string }
        Returns: {
          current_amt: number
          d1_30: number
          d31_60: number
          d61_90: number
          d91_plus: number
          party_id: string
          total: number
        }[]
      }
      get_document_open_balance: {
        Args: { _doc: string; _org: string }
        Returns: number
      }
      get_party_balance: {
        Args: { _org: string; _party: string }
        Returns: number
      }
      get_statement: {
        Args: {
          _account_id: string
          _account_kind: string
          _from?: string
          _org: string
          _to?: string
        }
        Returns: {
          balance: number
          credit: number
          currency: string
          debit: number
          description: string
          doc_id: string
          doc_kind: string
          doc_number: string
          is_opening: boolean
          txn_date: string
        }[]
      }
      has_org_role: {
        Args: {
          _org: string
          _role: Database["public"]["Enums"]["app_role"]
          _user: string
        }
        Returns: boolean
      }
      hc_duplicate_allocations: {
        Args: { _org: string }
        Returns: {
          allocation_date: string
          amount: number
          occurrences: number
          source_document_id: string
          target_document_id: string
        }[]
      }
      hc_duplicate_journal_refs: {
        Args: { _org: string }
        Returns: {
          event_id: string
          occurrences: number
        }[]
      }
      hc_failed_posting_events: {
        Args: { _org: string }
        Returns: {
          created_at: string
          error: string
          event_type: string
          id: string
          source_document_id: string
        }[]
      }
      hc_invalid_posting_sequences: {
        Args: { _org: string }
        Returns: {
          doc_number: string
          document_id: string
          kind: string
          reason: string
        }[]
      }
      hc_negative_open_balances: {
        Args: { _org: string }
        Returns: {
          allocated_amount: number
          document_id: string
          kind: string
          open_as_target: number
          original_amount: number
        }[]
      }
      hc_orphan_allocations: {
        Args: { _org: string }
        Returns: {
          allocation_id: string
          reason: string
          source_document_id: string
          target_document_id: string
        }[]
      }
      hc_settlement_mismatch: {
        Args: { _org: string }
        Returns: {
          delta: number
          party_balance: number
          party_id: string
          sum_open: number
        }[]
      }
      hc_unbalanced_journals: {
        Args: { _org: string }
        Returns: {
          entry_id: string
          entry_number: string
          total_credit: number
          total_debit: number
        }[]
      }
      is_org_member: { Args: { _org: string; _user: string }; Returns: boolean }
      is_platform_admin: { Args: { _user_id?: string }; Returns: boolean }
      next_document_number: {
        Args: { _branch: string; _doc_type: string; _fy: string; _org: string }
        Returns: string
      }
      override_credit_limit: {
        Args: {
          _amount: number
          _document: string
          _org: string
          _party: string
          _reason: string
        }
        Returns: undefined
      }
      post_journal: { Args: { _org: string; _payload: Json }; Returns: string }
      recompute_document_financial_state: {
        Args: { _doc: string; _org: string }
        Returns: undefined
      }
      release_credit_hold: {
        Args: { _org: string; _party: string; _reason?: string }
        Returns: undefined
      }
      reopen_accounting_period: {
        Args: { _org: string; _period_id: string }
        Returns: undefined
      }
      resolve_account: {
        Args: { _branch: string; _doc_kind: string; _key: string; _org: string }
        Returns: string
      }
      reverse_allocation: {
        Args: { _alloc: string; _org: string; _reason?: string }
        Returns: undefined
      }
      reverse_journal: {
        Args: {
          _date?: string
          _entry_id: string
          _memo?: string
          _org: string
        }
        Returns: string
      }
      run_finance_health_check: {
        Args: { _org: string }
        Returns: {
          check_name: string
          details: Json
          issue_count: number
          severity: string
        }[]
      }
      set_credit_hold: {
        Args: { _org: string; _party: string; _reason: string }
        Returns: undefined
      }
      validate_posting: {
        Args: { _org: string; _payload: Json }
        Returns: Json
      }
      validate_tax_code: {
        Args: { _code: string; _date: string; _org: string }
        Returns: {
          code: string
          created_at: string
          description: string
          description_en: string | null
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean
          is_payable: boolean
          is_recoverable: boolean
          meta: Json
          org_id: string
          payable_key: string
          rate: number
          recoverable_key: string
          tax_type: Database["public"]["Enums"]["tax_type"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tax_codes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      account_type:
        | "asset"
        | "liability"
        | "equity"
        | "revenue"
        | "cost_of_sales"
        | "expense"
        | "other_income"
        | "other_expense"
      allocation_source_kind:
        | "customer_payment"
        | "supplier_payment"
        | "receipt"
        | "credit_note"
        | "debit_note"
        | "advance"
        | "writeoff"
        | "refund"
      allocation_target_kind:
        | "invoice"
        | "bill"
        | "credit_note"
        | "debit_note"
        | "advance"
      app_role: "owner" | "admin" | "accountant" | "user" | "viewer"
      cash_account_kind: "cash" | "bank"
      cash_txn_kind:
        | "deposit"
        | "withdrawal"
        | "transfer_in"
        | "transfer_out"
        | "bank_charge"
        | "interest"
        | "adjustment"
        | "payment_out"
        | "receipt_in"
      copilot_action_status:
        | "pending"
        | "confirmed"
        | "executed"
        | "rejected"
        | "failed"
        | "cancelled"
      credit_limit_policy:
        | "warn_only"
        | "block"
        | "require_approval"
        | "allow_override"
      doc_kind:
        | "sales_invoice"
        | "simplified_tax_invoice"
        | "standard_tax_invoice"
        | "sales_quotation"
        | "delivery_note"
        | "credit_note"
        | "purchase_invoice"
        | "purchase_order"
        | "purchase_quotation"
        | "grn"
        | "debit_note"
        | "payment_voucher"
        | "receipt_voucher"
        | "journal_voucher"
        | "expense_voucher"
        | "sales_order"
        | "goods_receipt"
      doc_status:
        | "draft"
        | "issued"
        | "paid"
        | "partially_paid"
        | "cancelled"
        | "archived"
        | "pending_approval"
        | "approved"
        | "posted"
      fa_depreciation_method:
        | "straight_line"
        | "declining_balance"
        | "double_declining"
        | "units_of_production"
        | "manual"
        | "none"
      fa_event_status: "draft" | "posted" | "reversed"
      fa_event_type:
        | "acquisition"
        | "capitalization"
        | "improvement_capital"
        | "improvement_expense"
        | "partial_disposal"
        | "full_disposal"
        | "sale"
        | "transfer"
        | "revaluation_up"
        | "revaluation_down"
        | "impairment"
        | "impairment_reversal"
        | "restoration"
        | "split"
        | "merge"
        | "write_off"
        | "retirement"
        | "reactivation"
      fa_revaluation_model: "cost" | "revaluation"
      fa_status:
        | "draft"
        | "cip"
        | "active"
        | "held_for_sale"
        | "disposed"
        | "retired"
        | "written_off"
      financial_audit_kind:
        | "receipt_created"
        | "payment_created"
        | "allocation_created"
        | "allocation_reversed"
        | "advance_created"
        | "refund_created"
        | "writeoff_created"
        | "credit_hold_set"
        | "credit_hold_released"
        | "credit_limit_overridden"
        | "credit_policy_changed"
      financial_state:
        | "open"
        | "partially_settled"
        | "fully_settled"
        | "overpaid"
        | "advance_available"
        | "refunded"
        | "written_off"
      journal_status: "draft" | "posted" | "reversed"
      numbering_reset: "never" | "yearly" | "monthly"
      party_type: "customer" | "supplier" | "both"
      period_status: "open" | "closed" | "locked"
      posting_event_type:
        | "invoice_posted"
        | "payment_created"
        | "payment_applied"
        | "credit_note_posted"
        | "debit_note_posted"
        | "inventory_posted"
        | "expense_posted"
        | "manual_journal"
        | "receipt_created"
        | "payment_allocated"
        | "bank_transfer"
        | "bank_charge"
        | "bank_interest"
        | "cash_adjustment"
        | "writeoff_created"
        | "refund_created"
        | "advance_created"
      tax_type:
        | "standard"
        | "zero_rated"
        | "exempt"
        | "out_of_scope"
        | "reverse_charge"
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
      account_type: [
        "asset",
        "liability",
        "equity",
        "revenue",
        "cost_of_sales",
        "expense",
        "other_income",
        "other_expense",
      ],
      allocation_source_kind: [
        "customer_payment",
        "supplier_payment",
        "receipt",
        "credit_note",
        "debit_note",
        "advance",
        "writeoff",
        "refund",
      ],
      allocation_target_kind: [
        "invoice",
        "bill",
        "credit_note",
        "debit_note",
        "advance",
      ],
      app_role: ["owner", "admin", "accountant", "user", "viewer"],
      cash_account_kind: ["cash", "bank"],
      cash_txn_kind: [
        "deposit",
        "withdrawal",
        "transfer_in",
        "transfer_out",
        "bank_charge",
        "interest",
        "adjustment",
        "payment_out",
        "receipt_in",
      ],
      copilot_action_status: [
        "pending",
        "confirmed",
        "executed",
        "rejected",
        "failed",
        "cancelled",
      ],
      credit_limit_policy: [
        "warn_only",
        "block",
        "require_approval",
        "allow_override",
      ],
      doc_kind: [
        "sales_invoice",
        "simplified_tax_invoice",
        "standard_tax_invoice",
        "sales_quotation",
        "delivery_note",
        "credit_note",
        "purchase_invoice",
        "purchase_order",
        "purchase_quotation",
        "grn",
        "debit_note",
        "payment_voucher",
        "receipt_voucher",
        "journal_voucher",
        "expense_voucher",
        "sales_order",
        "goods_receipt",
      ],
      doc_status: [
        "draft",
        "issued",
        "paid",
        "partially_paid",
        "cancelled",
        "archived",
        "pending_approval",
        "approved",
        "posted",
      ],
      fa_depreciation_method: [
        "straight_line",
        "declining_balance",
        "double_declining",
        "units_of_production",
        "manual",
        "none",
      ],
      fa_event_status: ["draft", "posted", "reversed"],
      fa_event_type: [
        "acquisition",
        "capitalization",
        "improvement_capital",
        "improvement_expense",
        "partial_disposal",
        "full_disposal",
        "sale",
        "transfer",
        "revaluation_up",
        "revaluation_down",
        "impairment",
        "impairment_reversal",
        "restoration",
        "split",
        "merge",
        "write_off",
        "retirement",
        "reactivation",
      ],
      fa_revaluation_model: ["cost", "revaluation"],
      fa_status: [
        "draft",
        "cip",
        "active",
        "held_for_sale",
        "disposed",
        "retired",
        "written_off",
      ],
      financial_audit_kind: [
        "receipt_created",
        "payment_created",
        "allocation_created",
        "allocation_reversed",
        "advance_created",
        "refund_created",
        "writeoff_created",
        "credit_hold_set",
        "credit_hold_released",
        "credit_limit_overridden",
        "credit_policy_changed",
      ],
      financial_state: [
        "open",
        "partially_settled",
        "fully_settled",
        "overpaid",
        "advance_available",
        "refunded",
        "written_off",
      ],
      journal_status: ["draft", "posted", "reversed"],
      numbering_reset: ["never", "yearly", "monthly"],
      party_type: ["customer", "supplier", "both"],
      period_status: ["open", "closed", "locked"],
      posting_event_type: [
        "invoice_posted",
        "payment_created",
        "payment_applied",
        "credit_note_posted",
        "debit_note_posted",
        "inventory_posted",
        "expense_posted",
        "manual_journal",
        "receipt_created",
        "payment_allocated",
        "bank_transfer",
        "bank_charge",
        "bank_interest",
        "cash_adjustment",
        "writeoff_created",
        "refund_created",
        "advance_created",
      ],
      tax_type: [
        "standard",
        "zero_rated",
        "exempt",
        "out_of_scope",
        "reverse_charge",
      ],
    },
  },
} as const
