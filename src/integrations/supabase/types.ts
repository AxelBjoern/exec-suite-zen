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
      agents: {
        Row: {
          consult_with: string[]
          created_at: string
          id: string
          mandate: string
          name: string
          role: string
          slug: string
          sort_order: number
          system_prompt: string
          tone: string
        }
        Insert: {
          consult_with?: string[]
          created_at?: string
          id?: string
          mandate: string
          name: string
          role: string
          slug: string
          sort_order?: number
          system_prompt: string
          tone: string
        }
        Update: {
          consult_with?: string[]
          created_at?: string
          id?: string
          mandate?: string
          name?: string
          role?: string
          slug?: string
          sort_order?: number
          system_prompt?: string
          tone?: string
        }
        Relationships: []
      }
      approvals: {
        Row: {
          created_at: string
          decided_at: string | null
          id: string
          notes: string | null
          reviewer: string | null
          status: string
          task_id: string | null
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          id?: string
          notes?: string | null
          reviewer?: string | null
          status?: string
          task_id?: string | null
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          id?: string
          notes?: string | null
          reviewer?: string | null
          status?: string
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "approvals_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor: string
          agent_slug: string | null
          created_at: string
          hash_self: string
          id: number
          payload: Json
          prev_hash: string | null
          target: string | null
        }
        Insert: {
          action: string
          actor?: string
          agent_slug?: string | null
          created_at?: string
          hash_self: string
          id?: number
          payload?: Json
          prev_hash?: string | null
          target?: string | null
        }
        Update: {
          action?: string
          actor?: string
          agent_slug?: string | null
          created_at?: string
          hash_self?: string
          id?: number
          payload?: Json
          prev_hash?: string | null
          target?: string | null
        }
        Relationships: []
      }
      directives: {
        Row: {
          active: boolean
          agent_id: string
          body: string
          created_at: string
          id: string
        }
        Insert: {
          active?: boolean
          agent_id: string
          body: string
          created_at?: string
          id?: string
        }
        Update: {
          active?: boolean
          agent_id?: string
          body?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "directives_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      icps: {
        Row: {
          created_at: string
          criteria: Json
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          criteria?: Json
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          criteria?: Json
          id?: string
          name?: string
        }
        Relationships: []
      }
      lead_replies: {
        Row: {
          body: string
          classification: string | null
          created_at: string
          draft_response: string | null
          id: string
          lead_id: string | null
        }
        Insert: {
          body: string
          classification?: string | null
          created_at?: string
          draft_response?: string | null
          id?: string
          lead_id?: string | null
        }
        Update: {
          body?: string
          classification?: string | null
          created_at?: string
          draft_response?: string | null
          id?: string
          lead_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_replies_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          company: string | null
          created_at: string
          email: string | null
          enrichment: Json | null
          full_name: string | null
          icp_id: string | null
          id: string
          linkedin_url: string | null
          status: string
          title: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string
          email?: string | null
          enrichment?: Json | null
          full_name?: string | null
          icp_id?: string | null
          id?: string
          linkedin_url?: string | null
          status?: string
          title?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string | null
          enrichment?: Json | null
          full_name?: string | null
          icp_id?: string | null
          id?: string
          linkedin_url?: string | null
          status?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_icp_id_fkey"
            columns: ["icp_id"]
            isOneToOne: false
            referencedRelation: "icps"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          agent_id: string | null
          artifact_json: Json | null
          content: string
          created_at: string
          id: string
          role: string
          thread_id: string
        }
        Insert: {
          agent_id?: string | null
          artifact_json?: Json | null
          content: string
          created_at?: string
          id?: string
          role: string
          thread_id: string
        }
        Update: {
          agent_id?: string | null
          artifact_json?: Json | null
          content?: string
          created_at?: string
          id?: string
          role?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      sequences: {
        Row: {
          created_at: string
          current_step: number
          id: string
          lead_id: string | null
          steps: Json
        }
        Insert: {
          created_at?: string
          current_step?: number
          id?: string
          lead_id?: string | null
          steps?: Json
        }
        Update: {
          created_at?: string
          current_step?: number
          id?: string
          lead_id?: string | null
          steps?: Json
        }
        Relationships: [
          {
            foreignKeyName: "sequences_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          agent_id: string | null
          approved_at: string | null
          approved_by: string | null
          auto_dispatched: boolean
          body: string | null
          completed_at: string | null
          created_at: string
          id: string
          owner_agent: string | null
          parent_task_id: string | null
          requires_approval: boolean
          status: string
          thread_id: string | null
          title: string
        }
        Insert: {
          agent_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          auto_dispatched?: boolean
          body?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          owner_agent?: string | null
          parent_task_id?: string | null
          requires_approval?: boolean
          status?: string
          thread_id?: string | null
          title: string
        }
        Update: {
          agent_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          auto_dispatched?: boolean
          body?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          owner_agent?: string | null
          parent_task_id?: string | null
          requires_approval?: boolean
          status?: string
          thread_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          agent_id: string | null
          created_at: string
          id: string
          name: string
          prompt: string
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          id?: string
          name: string
          prompt: string
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          id?: string
          name?: string
          prompt?: string
        }
        Relationships: [
          {
            foreignKeyName: "templates_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      threads: {
        Row: {
          agent_id: string | null
          created_at: string
          id: string
          mode: string
          title: string | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          id?: string
          mode?: string
          title?: string | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          id?: string
          mode?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "threads_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
