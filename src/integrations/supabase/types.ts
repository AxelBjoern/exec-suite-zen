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
      agent_knowledge: {
        Row: {
          agent_id: string
          created_at: string
          extracted_text: string | null
          file_name: string
          file_size: number
          id: string
          mime_type: string
          owner_id: string
          storage_path: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          extracted_text?: string | null
          file_name: string
          file_size?: number
          id?: string
          mime_type: string
          owner_id: string
          storage_path: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          extracted_text?: string | null
          file_name?: string
          file_size?: number
          id?: string
          mime_type?: string
          owner_id?: string
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_knowledge_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_types"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_types: {
        Row: {
          created_at: string
          description: string
          id: string
          industry: string
          is_public: boolean
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
          is_public?: boolean
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
          is_public?: boolean
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
          archived_at: string | null
          created_at: string
          decided_at: string | null
          id: string
          kind: string
          notes: string | null
          payload: Json | null
          ref_id: string | null
          ref_table: string | null
          requester_id: string | null
          reviewer: string | null
          status: string
          task_id: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          decided_at?: string | null
          id?: string
          kind?: string
          notes?: string | null
          payload?: Json | null
          ref_id?: string | null
          ref_table?: string | null
          requester_id?: string | null
          reviewer?: string | null
          status?: string
          task_id?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          decided_at?: string | null
          id?: string
          kind?: string
          notes?: string | null
          payload?: Json | null
          ref_id?: string | null
          ref_table?: string | null
          requester_id?: string | null
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
      auto_approve_rules: {
        Row: {
          agent_slug: string | null
          created_at: string
          enabled: boolean
          id: string
          kind: string
          match: Json
          owner_id: string
        }
        Insert: {
          agent_slug?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          kind: string
          match?: Json
          owner_id: string
        }
        Update: {
          agent_slug?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          kind?: string
          match?: Json
          owner_id?: string
        }
        Relationships: []
      }
      base_models: {
        Row: {
          created_at: string
          description: string
          id: string
          is_public: boolean
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
          is_public?: boolean
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
          is_public?: boolean
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
          model_used: string | null
          role: string
        }
        Insert: {
          artifact_json?: Json | null
          content: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          model_used?: string | null
          role: string
        }
        Update: {
          artifact_json?: Json | null
          content?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          model_used?: string | null
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
      content_drafts: {
        Row: {
          agent_id: string | null
          approval_id: string | null
          body_md: string
          created_at: string
          id: string
          kind: string
          metadata: Json
          owner_id: string | null
          status: string
        }
        Insert: {
          agent_id?: string | null
          approval_id?: string | null
          body_md: string
          created_at?: string
          id?: string
          kind: string
          metadata?: Json
          owner_id?: string | null
          status?: string
        }
        Update: {
          agent_id?: string | null
          approval_id?: string | null
          body_md?: string
          created_at?: string
          id?: string
          kind?: string
          metadata?: Json
          owner_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_drafts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_drafts_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "approvals"
            referencedColumns: ["id"]
          },
        ]
      }
      cowork_sessions: {
        Row: {
          applied_content: string | null
          created_at: string
          github_target: Json | null
          id: string
          messages: Json
          preview_content: string
          preview_type: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_content?: string | null
          created_at?: string
          github_target?: Json | null
          id?: string
          messages?: Json
          preview_content?: string
          preview_type?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          applied_content?: string | null
          created_at?: string
          github_target?: Json | null
          id?: string
          messages?: Json
          preview_content?: string
          preview_type?: string
          title?: string
          updated_at?: string
          user_id?: string
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
          model_used: string | null
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
          model_used?: string | null
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
          model_used?: string | null
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
      swarm_bench_runs: {
        Row: {
          cost_credits: number
          created_at: string
          drafter_models: string[]
          final_answer: string | null
          id: string
          label: string | null
          latency_ms: number
          notes: string | null
          per_model: Json
          prompt: string
          quality_score: number | null
          synth_model: string
          tokens_in: number
          tokens_out: number
          user_id: string
        }
        Insert: {
          cost_credits?: number
          created_at?: string
          drafter_models?: string[]
          final_answer?: string | null
          id?: string
          label?: string | null
          latency_ms?: number
          notes?: string | null
          per_model?: Json
          prompt: string
          quality_score?: number | null
          synth_model: string
          tokens_in?: number
          tokens_out?: number
          user_id: string
        }
        Update: {
          cost_credits?: number
          created_at?: string
          drafter_models?: string[]
          final_answer?: string | null
          id?: string
          label?: string | null
          latency_ms?: number
          notes?: string | null
          per_model?: Json
          prompt?: string
          quality_score?: number | null
          synth_model?: string
          tokens_in?: number
          tokens_out?: number
          user_id?: string
        }
        Relationships: []
      }
      swarm_drafts: {
        Row: {
          content: string | null
          created_at: string
          error: string | null
          id: string
          latency_ms: number | null
          model_label: string | null
          model_slug: string
          role: string | null
          role_label: string | null
          run_id: string
          status: string
          tokens_in: number | null
          tokens_out: number | null
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          error?: string | null
          id?: string
          latency_ms?: number | null
          model_label?: string | null
          model_slug: string
          role?: string | null
          role_label?: string | null
          run_id: string
          status?: string
          tokens_in?: number | null
          tokens_out?: number | null
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          error?: string | null
          id?: string
          latency_ms?: number | null
          model_label?: string | null
          model_slug?: string
          role?: string | null
          role_label?: string | null
          run_id?: string
          status?: string
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "swarm_drafts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "swarm_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      swarm_runs: {
        Row: {
          conversation_id: string | null
          created_at: string
          drafter_models: string[]
          id: string
          latency_ms: number | null
          message_id: string | null
          status: string
          synth_model: string
          user_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          drafter_models: string[]
          id?: string
          latency_ms?: number | null
          message_id?: string | null
          status?: string
          synth_model: string
          user_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          drafter_models?: string[]
          id?: string
          latency_ms?: number | null
          message_id?: string | null
          status?: string
          synth_model?: string
          user_id?: string
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
      user_connections: {
        Row: {
          connected_at: string
          connection_id: string
          id: string
          provider: string
          provider_email: string | null
          provider_name: string | null
          user_id: string
        }
        Insert: {
          connected_at?: string
          connection_id: string
          id?: string
          provider: string
          provider_email?: string | null
          provider_name?: string | null
          user_id: string
        }
        Update: {
          connected_at?: string
          connection_id?: string
          id?: string
          provider?: string
          provider_email?: string | null
          provider_name?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_github_tokens: {
        Row: {
          created_at: string
          login: string | null
          scopes: string[]
          token_ciphertext: string
          token_hint: string
          token_iv: string
          token_tag: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          login?: string | null
          scopes?: string[]
          token_ciphertext: string
          token_hint: string
          token_iv: string
          token_tag: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          login?: string | null
          scopes?: string[]
          token_ciphertext?: string
          token_hint?: string
          token_iv?: string
          token_tag?: string
          updated_at?: string
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
      user_settings: {
        Row: {
          auto_send_email: boolean
          auto_send_linkedin: boolean
          chat_model_allowlist: string[] | null
          design_rules: string | null
          swarm_agents: Json | null
          swarm_max_parallel: number | null
          swarm_models: string[] | null
          swarm_synth_model: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_send_email?: boolean
          auto_send_linkedin?: boolean
          chat_model_allowlist?: string[] | null
          design_rules?: string | null
          swarm_agents?: Json | null
          swarm_max_parallel?: number | null
          swarm_models?: string[] | null
          swarm_synth_model?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_send_email?: boolean
          auto_send_linkedin?: boolean
          chat_model_allowlist?: string[] | null
          design_rules?: string | null
          swarm_agents?: Json | null
          swarm_max_parallel?: number | null
          swarm_models?: string[] | null
          swarm_synth_model?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vdnx_probe_reports: {
        Row: {
          agent_id: string
          console_errors: Json
          created_at: string
          created_by: string | null
          id: string
          latency_ms: number | null
          network_failures: Json
          route: string | null
          screenshot_url: string | null
          status: string | null
          target_email: string
          verb: string | null
        }
        Insert: {
          agent_id: string
          console_errors?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          latency_ms?: number | null
          network_failures?: Json
          route?: string | null
          screenshot_url?: string | null
          status?: string | null
          target_email: string
          verb?: string | null
        }
        Update: {
          agent_id?: string
          console_errors?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          latency_ms?: number | null
          network_failures?: Json
          route?: string | null
          screenshot_url?: string | null
          status?: string | null
          target_email?: string
          verb?: string | null
        }
        Relationships: []
      }
      vdnx_route_probe_results: {
        Row: {
          created_at: string
          error: string | null
          html_length: number | null
          http_status: number | null
          id: string
          latency_ms: number | null
          marker_checked: string | null
          route: string
          run_id: string
          status: string
          wizard_loaded: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          html_length?: number | null
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          marker_checked?: string | null
          route: string
          run_id: string
          status: string
          wizard_loaded?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          html_length?: number | null
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          marker_checked?: string | null
          route?: string
          run_id?: string
          status?: string
          wizard_loaded?: string
        }
        Relationships: [
          {
            foreignKeyName: "vdnx_route_probe_results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      vdnx_session_cache: {
        Row: {
          access_token: string
          email: string
          expires_at: string
          refresh_token: string
          updated_at: string
        }
        Insert: {
          access_token: string
          email: string
          expires_at: string
          refresh_token: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          email?: string
          expires_at?: string
          refresh_token?: string
          updated_at?: string
        }
        Relationships: []
      }
      workflow_runs: {
        Row: {
          approval_id: string | null
          created_at: string
          current_node_id: string | null
          finished_at: string | null
          id: string
          log: Json
          started_at: string
          status: string
          user_id: string
          workflow_id: string
        }
        Insert: {
          approval_id?: string | null
          created_at?: string
          current_node_id?: string | null
          finished_at?: string | null
          id?: string
          log?: Json
          started_at?: string
          status?: string
          user_id: string
          workflow_id: string
        }
        Update: {
          approval_id?: string | null
          created_at?: string
          current_node_id?: string | null
          finished_at?: string | null
          id?: string
          log?: Json
          started_at?: string
          status?: string
          user_id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          nodes: Json
          schedule_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          nodes?: Json
          schedule_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          nodes?: Json
          schedule_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflows_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
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
      is_owner: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user" | "owner"
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
      app_role: ["admin", "user", "owner"],
    },
  },
} as const
