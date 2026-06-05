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
      agent_types: {
        Row: {
          created_at: string
          description: string
          id: string
          industry: string
          is_system: boolean
          name: string
          owner_id: string | null
          system_prompt: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          industry?: string
          is_system?: boolean
          name: string
          owner_id?: string | null
          system_prompt?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          industry?: string
          is_system?: boolean
          name?: string
          owner_id?: string | null
          system_prompt?: string
          updated_at?: string
        }
        Relationships: []
      }
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
          kind: string
          notes: string | null
          payload: Json | null
          reviewer: string | null
          status: string
          task_id: string | null
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          id?: string
          kind?: string
          notes?: string | null
          payload?: Json | null
          reviewer?: string | null
          status?: string
          task_id?: string | null
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          id?: string
          kind?: string
          notes?: string | null
          payload?: Json | null
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
      base_models: {
        Row: {
          created_at: string
          description: string
          id: string
          is_system: boolean
          name: string
          owner_id: string | null
          provider: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          is_system?: boolean
          name: string
          owner_id?: string | null
          provider?: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_system?: boolean
          name?: string
          owner_id?: string | null
          provider?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      budget_scenarios: {
        Row: {
          actuals: Json
          assumptions: Json
          contract_start_date: string | null
          created_at: string
          id: string
          is_base: boolean
          is_locked: boolean
          is_system: boolean
          name: string
          owner_id: string | null
          updated_at: string
        }
        Insert: {
          actuals?: Json
          assumptions?: Json
          contract_start_date?: string | null
          created_at?: string
          id?: string
          is_base?: boolean
          is_locked?: boolean
          is_system?: boolean
          name: string
          owner_id?: string | null
          updated_at?: string
        }
        Update: {
          actuals?: Json
          assumptions?: Json
          contract_start_date?: string | null
          created_at?: string
          id?: string
          is_base?: boolean
          is_locked?: boolean
          is_system?: boolean
          name?: string
          owner_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ceo_chat_attachments: {
        Row: {
          created_at: string
          extracted_text: string | null
          filename: string
          id: string
          message_id: string | null
          mime_type: string
          size_bytes: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          extracted_text?: string | null
          filename: string
          id?: string
          message_id?: string | null
          mime_type: string
          size_bytes: number
          storage_path: string
        }
        Update: {
          created_at?: string
          extracted_text?: string | null
          filename?: string
          id?: string
          message_id?: string | null
          mime_type?: string
          size_bytes?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "ceo_chat_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "ceo_chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      ceo_chat_messages: {
        Row: {
          artifact_json: Json | null
          content: string
          conversation_id: string | null
          created_at: string
          id: string
          role: string
        }
        Insert: {
          artifact_json?: Json | null
          content: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          artifact_json?: Json | null
          content?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "ceo_chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ceo_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ceo_conversations: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_context: {
        Row: {
          current_priorities: string
          icp: string
          id: string
          mission: string
          notes: string
          positioning: string
          principles: string
          singleton: boolean
          updated_at: string
        }
        Insert: {
          current_priorities?: string
          icp?: string
          id?: string
          mission?: string
          notes?: string
          positioning?: string
          principles?: string
          singleton?: boolean
          updated_at?: string
        }
        Update: {
          current_priorities?: string
          icp?: string
          id?: string
          mission?: string
          notes?: string
          positioning?: string
          principles?: string
          singleton?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      decision_log: {
        Row: {
          agent_slug: string | null
          amendments: Json
          created_at: string
          decision: string
          id: string
          rationale: string | null
          thread_id: string | null
          title: string
        }
        Insert: {
          agent_slug?: string | null
          amendments?: Json
          created_at?: string
          decision: string
          id?: string
          rationale?: string | null
          thread_id?: string | null
          title: string
        }
        Update: {
          agent_slug?: string | null
          amendments?: Json
          created_at?: string
          decision?: string
          id?: string
          rationale?: string | null
          thread_id?: string | null
          title?: string
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
      job_queue: {
        Row: {
          attempts: number
          created_at: string
          id: string
          kind: string
          last_error: string | null
          payload: Json
          run_at: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          kind: string
          last_error?: string | null
          payload?: Json
          run_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          kind?: string
          last_error?: string | null
          payload?: Json
          run_at?: string
          status?: string
          updated_at?: string
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
          summary: string | null
          thread_id: string
        }
        Insert: {
          agent_id?: string | null
          artifact_json?: Json | null
          content: string
          created_at?: string
          id?: string
          role: string
          summary?: string | null
          thread_id: string
        }
        Update: {
          agent_id?: string | null
          artifact_json?: Json | null
          content?: string
          created_at?: string
          id?: string
          role?: string
          summary?: string | null
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
      schedules: {
        Row: {
          active: boolean
          agent_slug: string
          args: string | null
          created_at: string
          cron: string
          id: string
          last_run_at: string | null
          mode: string
          name: string
          next_run_at: string
          prompt: string | null
          verb: string | null
        }
        Insert: {
          active?: boolean
          agent_slug: string
          args?: string | null
          created_at?: string
          cron: string
          id?: string
          last_run_at?: string | null
          mode?: string
          name: string
          next_run_at?: string
          prompt?: string | null
          verb?: string | null
        }
        Update: {
          active?: boolean
          agent_slug?: string
          args?: string | null
          created_at?: string
          cron?: string
          id?: string
          last_run_at?: string | null
          mode?: string
          name?: string
          next_run_at?: string
          prompt?: string | null
          verb?: string | null
        }
        Relationships: []
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
      suggestions: {
        Row: {
          agent_slug: string
          body: string
          created_at: string
          decided_at: string | null
          id: string
          status: string
          task_id: string | null
          thread_id: string | null
          title: string
        }
        Insert: {
          agent_slug: string
          body: string
          created_at?: string
          decided_at?: string | null
          id?: string
          status?: string
          task_id?: string | null
          thread_id?: string | null
          title: string
        }
        Update: {
          agent_slug?: string
          body?: string
          created_at?: string
          decided_at?: string | null
          id?: string
          status?: string
          task_id?: string | null
          thread_id?: string | null
          title?: string
        }
        Relationships: []
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
          depth: number
          id: string
          kind: string | null
          owner_agent: string | null
          parent_task_id: string | null
          payload: Json | null
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
          depth?: number
          id?: string
          kind?: string | null
          owner_agent?: string | null
          parent_task_id?: string | null
          payload?: Json | null
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
          depth?: number
          id?: string
          kind?: string | null
          owner_agent?: string | null
          parent_task_id?: string | null
          payload?: Json | null
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
          kind: string
          mode: string
          title: string | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          mode?: string
          title?: string | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          id?: string
          kind?: string
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
      tool_calls: {
        Row: {
          agent_slug: string | null
          created_at: string
          error: string | null
          id: string
          request: Json
          response: Json | null
          status: string
          task_id: string | null
          tool: string
        }
        Insert: {
          agent_slug?: string | null
          created_at?: string
          error?: string | null
          id?: string
          request?: Json
          response?: Json | null
          status?: string
          task_id?: string | null
          tool: string
        }
        Update: {
          agent_slug?: string | null
          created_at?: string
          error?: string | null
          id?: string
          request?: Json
          response?: Json | null
          status?: string
          task_id?: string | null
          tool?: string
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
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
