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
      attachments: {
        Row: {
          bucket: string
          created_at: string
          entity_id: string
          entity_type: string
          filename: string
          id: string
          meta: Json
          mime_type: string | null
          org_id: string
          size_bytes: number | null
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          bucket: string
          created_at?: string
          entity_id: string
          entity_type: string
          filename: string
          id?: string
          meta?: Json
          mime_type?: string | null
          org_id: string
          size_bytes?: number | null
          storage_path: string
          uploaded_by: string
        }
        Update: {
          bucket?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          filename?: string
          id?: string
          meta?: Json
          mime_type?: string | null
          org_id?: string
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string
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
      document_lines: {
        Row: {
          description: string
          description_en: string | null
          discount: number
          document_id: string
          id: string
          item_id: string | null
          line_total: number
          meta: Json
          position: number
          price: number
          qty: number
          tax_rate: number
          unit: string | null
        }
        Insert: {
          description: string
          description_en?: string | null
          discount?: number
          document_id: string
          id?: string
          item_id?: string | null
          line_total?: number
          meta?: Json
          position?: number
          price?: number
          qty?: number
          tax_rate?: number
          unit?: string | null
        }
        Update: {
          description?: string
          description_en?: string | null
          discount?: number
          document_id?: string
          id?: string
          item_id?: string | null
          line_total?: number
          meta?: Json
          position?: number
          price?: number
          qty?: number
          tax_rate?: number
          unit?: string | null
        }
        Relationships: [
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
        ]
      }
      documents: {
        Row: {
          created_at: string
          created_by: string
          currency: string
          discount_total: number
          doc_number: string
          due_date: string | null
          grand_total: number
          id: string
          issue_date: string
          kind: Database["public"]["Enums"]["doc_kind"]
          meta: Json
          notes: string | null
          org_id: string
          other_charges: number
          party_id: string | null
          party_snapshot: Json
          po_number: string | null
          project: string | null
          qr_payload: string | null
          shipping: number
          status: Database["public"]["Enums"]["doc_status"]
          subtotal: number
          tax_inclusive: boolean
          template_id: string | null
          terms: string | null
          updated_at: string
          uuid_v4: string
          vat_total: number
        }
        Insert: {
          created_at?: string
          created_by: string
          currency?: string
          discount_total?: number
          doc_number: string
          due_date?: string | null
          grand_total?: number
          id?: string
          issue_date?: string
          kind: Database["public"]["Enums"]["doc_kind"]
          meta?: Json
          notes?: string | null
          org_id: string
          other_charges?: number
          party_id?: string | null
          party_snapshot?: Json
          po_number?: string | null
          project?: string | null
          qr_payload?: string | null
          shipping?: number
          status?: Database["public"]["Enums"]["doc_status"]
          subtotal?: number
          tax_inclusive?: boolean
          template_id?: string | null
          terms?: string | null
          updated_at?: string
          uuid_v4?: string
          vat_total?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          currency?: string
          discount_total?: number
          doc_number?: string
          due_date?: string | null
          grand_total?: number
          id?: string
          issue_date?: string
          kind?: Database["public"]["Enums"]["doc_kind"]
          meta?: Json
          notes?: string | null
          org_id?: string
          other_charges?: number
          party_id?: string | null
          party_snapshot?: Json
          po_number?: string | null
          project?: string | null
          qr_payload?: string | null
          shipping?: number
          status?: Database["public"]["Enums"]["doc_status"]
          subtotal?: number
          tax_inclusive?: boolean
          template_id?: string | null
          terms?: string | null
          updated_at?: string
          uuid_v4?: string
          vat_total?: number
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
          cr_number: string | null
          created_at: string
          currency: string
          email: string | null
          id: string
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
          cr_number?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
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
          cr_number?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_org_role: {
        Args: {
          _org: string
          _role: Database["public"]["Enums"]["app_role"]
          _user: string
        }
        Returns: boolean
      }
      is_org_member: { Args: { _org: string; _user: string }; Returns: boolean }
    }
    Enums: {
      app_role: "owner" | "admin" | "accountant" | "user" | "viewer"
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
      doc_status:
        | "draft"
        | "issued"
        | "paid"
        | "partially_paid"
        | "cancelled"
        | "archived"
      party_type: "customer" | "supplier" | "both"
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
      app_role: ["owner", "admin", "accountant", "user", "viewer"],
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
      ],
      doc_status: [
        "draft",
        "issued",
        "paid",
        "partially_paid",
        "cancelled",
        "archived",
      ],
      party_type: ["customer", "supplier", "both"],
    },
  },
} as const
