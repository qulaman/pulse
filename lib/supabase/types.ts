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
      ai_logs: {
        Row: {
          cache_read_tokens: number | null
          client_request_id: string | null
          company_id: string
          confirmed_entities: Json | null
          created_at: string
          edit_fields: string[] | null
          id: string
          input_tokens: number | null
          kind: Database["public"]["Enums"]["ai_log_kind"]
          latency_ms: number | null
          model: string
          output_tokens: number | null
          parse_ms: number | null
          parsed_entities: Json | null
          provider: string
          raw_response: Json | null
          request_id: string | null
          source: Database["public"]["Enums"]["ai_source"] | null
          status: string
          stt_ms: number | null
          tool_calls: Json | null
          transcript: string | null
          user_id: string
          was_edited: boolean | null
        }
        Insert: {
          cache_read_tokens?: number | null
          client_request_id?: string | null
          company_id: string
          confirmed_entities?: Json | null
          created_at?: string
          edit_fields?: string[] | null
          id?: string
          input_tokens?: number | null
          kind: Database["public"]["Enums"]["ai_log_kind"]
          latency_ms?: number | null
          model: string
          output_tokens?: number | null
          parse_ms?: number | null
          parsed_entities?: Json | null
          provider: string
          raw_response?: Json | null
          request_id?: string | null
          source?: Database["public"]["Enums"]["ai_source"] | null
          status: string
          stt_ms?: number | null
          tool_calls?: Json | null
          transcript?: string | null
          user_id: string
          was_edited?: boolean | null
        }
        Update: {
          cache_read_tokens?: number | null
          client_request_id?: string | null
          company_id?: string
          confirmed_entities?: Json | null
          created_at?: string
          edit_fields?: string[] | null
          id?: string
          input_tokens?: number | null
          kind?: Database["public"]["Enums"]["ai_log_kind"]
          latency_ms?: number | null
          model?: string
          output_tokens?: number | null
          parse_ms?: number | null
          parsed_entities?: Json | null
          provider?: string
          raw_response?: Json | null
          request_id?: string | null
          source?: Database["public"]["Enums"]["ai_source"] | null
          status?: string
          stt_ms?: number | null
          tool_calls?: Json | null
          transcript?: string | null
          user_id?: string
          was_edited?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_acks: {
        Row: {
          announcement_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_acks_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_acks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          audio_path: string | null
          author_id: string
          company_id: string
          created_at: string
          id: string
          transcript: string
        }
        Insert: {
          audio_path?: string | null
          author_id: string
          company_id: string
          created_at?: string
          id?: string
          transcript: string
        }
        Update: {
          audio_path?: string | null
          author_id?: string
          company_id?: string
          created_at?: string
          id?: string
          transcript?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          id: string
          name: string
          settings: Json
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          settings?: Json
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          settings?: Json
        }
        Relationships: []
      }
      inbox_items: {
        Row: {
          audio_path: string | null
          client_request_id: string | null
          company_id: string
          created_at: string
          entities: Json | null
          id: string
          status: Database["public"]["Enums"]["inbox_status"]
          transcript: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          audio_path?: string | null
          client_request_id?: string | null
          company_id: string
          created_at?: string
          entities?: Json | null
          id?: string
          status?: Database["public"]["Enums"]["inbox_status"]
          transcript?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          audio_path?: string | null
          client_request_id?: string | null
          company_id?: string
          created_at?: string
          entities?: Json | null
          id?: string
          status?: Database["public"]["Enums"]["inbox_status"]
          transcript?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbox_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ingest_batches: {
        Row: {
          client_request_id: string
          company_id: string
          created_at: string
          id: string
          result: Json
          user_id: string
        }
        Insert: {
          client_request_id: string
          company_id: string
          created_at?: string
          id?: string
          result?: Json
          user_id: string
        }
        Update: {
          client_request_id?: string
          company_id?: string
          created_at?: string
          id?: string
          result?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingest_batches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingest_batches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          acted_at: string | null
          attempts: number
          channel: Database["public"]["Enums"]["delivery_channel"]
          company_id: string
          created_at: string
          deliver_after: string
          event_kind: string
          id: string
          last_error: string | null
          meta: Json
          seen_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["delivery_status"]
          task_id: string | null
          tier: number
          user_id: string
        }
        Insert: {
          acted_at?: string | null
          attempts?: number
          channel?: Database["public"]["Enums"]["delivery_channel"]
          company_id: string
          created_at?: string
          deliver_after?: string
          event_kind: string
          id?: string
          last_error?: string | null
          meta?: Json
          seen_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          task_id?: string | null
          tier?: number
          user_id: string
        }
        Update: {
          acted_at?: string | null
          attempts?: number
          channel?: Database["public"]["Enums"]["delivery_channel"]
          company_id?: string
          created_at?: string
          deliver_after?: string
          event_kind?: string
          id?: string
          last_error?: string | null
          meta?: Json
          seen_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          task_id?: string | null
          tier?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_deliveries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_deliveries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          approved_at: string | null
          company_id: string
          created_at: string
          delivered_at: string | null
          id: string
          item_id: string
          price: number
          status: Database["public"]["Enums"]["order_status"]
          stock_reserved: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          company_id: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          item_id: string
          price: number
          status?: Database["public"]["Enums"]["order_status"]
          stock_reserved?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          company_id?: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          item_id?: string
          price?: number
          status?: Database["public"]["Enums"]["order_status"]
          stock_reserved?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "shop_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      point_transactions: {
        Row: {
          actor_id: string | null
          amount: number
          company_id: string
          created_at: string
          id: string
          order_id: string | null
          reason: string
          rule_code: string | null
          source: Database["public"]["Enums"]["point_source"]
          task_id: string | null
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          amount: number
          company_id: string
          created_at?: string
          id?: string
          order_id?: string | null
          reason: string
          rule_code?: string | null
          source: Database["public"]["Enums"]["point_source"]
          task_id?: string | null
          user_id: string
        }
        Update: {
          actor_id?: string | null
          amount?: number
          company_id?: string
          created_at?: string
          id?: string
          order_id?: string | null
          reason?: string
          rule_code?: string | null
          source?: Database["public"]["Enums"]["point_source"]
          task_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "point_transactions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_transactions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          aliases: string[]
          availability: Database["public"]["Enums"]["availability_t"]
          avatar_url: string | null
          company_id: string
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          manager_id: string | null
          position: string | null
          role: Database["public"]["Enums"]["user_role"]
          settings: Json
          streak_count: number
          streak_updated_at: string | null
          telegram_chat_id: number | null
        }
        Insert: {
          aliases?: string[]
          availability?: Database["public"]["Enums"]["availability_t"]
          avatar_url?: string | null
          company_id: string
          created_at?: string
          full_name: string
          id: string
          is_active?: boolean
          manager_id?: string | null
          position?: string | null
          role: Database["public"]["Enums"]["user_role"]
          settings?: Json
          streak_count?: number
          streak_updated_at?: string | null
          telegram_chat_id?: number | null
        }
        Update: {
          aliases?: string[]
          availability?: Database["public"]["Enums"]["availability_t"]
          avatar_url?: string | null
          company_id?: string
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          manager_id?: string | null
          position?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          settings?: Json
          streak_count?: number
          streak_updated_at?: string | null
          telegram_chat_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          company_id: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          company_id: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          company_id?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recurrence_rules: {
        Row: {
          assignee_id: string
          author_id: string
          body: string | null
          company_id: string
          id: string
          is_active: boolean
          next_run_at: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          rrule: string
          title: string
        }
        Insert: {
          assignee_id: string
          author_id: string
          body?: string | null
          company_id: string
          id?: string
          is_active?: boolean
          next_run_at?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          rrule: string
          title: string
        }
        Update: {
          assignee_id?: string
          author_id?: string
          body?: string | null
          company_id?: string
          id?: string
          is_active?: boolean
          next_run_at?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          rrule?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurrence_rules_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurrence_rules_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurrence_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      reminders: {
        Row: {
          company_id: string
          created_at: string
          id: string
          remind_at: string | null
          sent: boolean
          text: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          remind_at?: string | null
          sent?: boolean
          text: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          remind_at?: string | null
          sent?: boolean
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_items: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          photo_path: string | null
          price: number
          sort: number
          stock: number | null
          title: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          photo_path?: string | null
          price: number
          sort?: number
          stock?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          photo_path?: string | null
          price?: number
          sort?: number
          stock?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      task_messages: {
        Row: {
          company_id: string
          content: string | null
          created_at: string
          file_path: string | null
          id: string
          meta: Json
          sender_id: string
          seq: number
          task_id: string
          type: Database["public"]["Enums"]["message_type"]
        }
        Insert: {
          company_id: string
          content?: string | null
          created_at?: string
          file_path?: string | null
          id?: string
          meta?: Json
          sender_id: string
          seq?: number
          task_id: string
          type: Database["public"]["Enums"]["message_type"]
        }
        Update: {
          company_id?: string
          content?: string | null
          created_at?: string
          file_path?: string | null
          id?: string
          meta?: Json
          sender_id?: string
          seq?: number
          task_id?: string
          type?: Database["public"]["Enums"]["message_type"]
        }
        Relationships: [
          {
            foreignKeyName: "task_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_messages_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_reads: {
        Row: {
          company_id: string
          last_seq: number
          seen_at: string
          task_id: string
          user_id: string
        }
        Insert: {
          company_id: string
          last_seq?: number
          seen_at?: string
          task_id: string
          user_id: string
        }
        Update: {
          company_id?: string
          last_seq?: number
          seen_at?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_reads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_reads_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          accepted_at: string | null
          assignee_id: string
          author_id: string
          body: string | null
          closed_at: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          deadline: string | null
          group_id: string | null
          id: string
          parent_task_id: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          recurrence_rule_id: string | null
          scheduled_send_at: string | null
          source: Database["public"]["Enums"]["ai_source"] | null
          source_audio_path: string | null
          source_transcript: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          assignee_id: string
          author_id: string
          body?: string | null
          closed_at?: string | null
          company_id: string
          completed_at?: string | null
          created_at?: string
          deadline?: string | null
          group_id?: string | null
          id?: string
          parent_task_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          recurrence_rule_id?: string | null
          scheduled_send_at?: string | null
          source?: Database["public"]["Enums"]["ai_source"] | null
          source_audio_path?: string | null
          source_transcript?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          assignee_id?: string
          author_id?: string
          body?: string | null
          closed_at?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          deadline?: string | null
          group_id?: string | null
          id?: string
          parent_task_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          recurrence_rule_id?: string | null
          scheduled_send_at?: string | null
          source?: Database["public"]["Enums"]["ai_source"] | null
          source_audio_path?: string | null
          source_transcript?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_recurrence_rule_fk"
            columns: ["recurrence_rule_id"]
            isOneToOne: false
            referencedRelation: "recurrence_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      tv_events: {
        Row: {
          actor_id: string | null
          company_id: string
          created_at: string
          id: string
          kind: string
          payload: Json
          payload_guest: Json
          task_id: string | null
        }
        Insert: {
          actor_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          kind: string
          payload?: Json
          payload_guest?: Json
          task_id?: string | null
        }
        Update: {
          actor_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          payload_guest?: Json
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tv_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tv_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tv_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auth_company_id: { Args: never; Returns: string }
      auth_role: { Args: never; Returns: string }
      award_points: {
        Args: {
          client_request_id?: string
          p_amount: number
          p_reason: string
          p_user_id: string
        }
        Returns: Json
      }
      cancel_shop_order: {
        Args: { client_request_id?: string; p_order_id: string }
        Returns: Json
      }
      confirm_voice_batch: {
        Args: { client_request_id: string; p_now?: string; payload: Json }
        Returns: Json
      }
      create_shop_order: {
        Args: { client_request_id?: string; p_item_id: string }
        Returns: Json
      }
      delete_task: { Args: { task_id: string }; Returns: Json }
      extend_task_deadline: {
        Args: {
          client_request_id?: string
          new_deadline: string
          task_id: string
        }
        Returns: Json
      }
      fn_rating: {
        Args: { p_from: string; p_to: string }
        Returns: {
          delta_vs_prev: number
          display_name: string
          is_me: boolean
          on_time_pct: number
          points: number
          rank: number
          user_id: string
        }[]
      }
      mark_thread_read: {
        Args: { seq: number; task_id: string }
        Returns: number
      }
      next_delivery_slot: {
        Args: { p_company: string; p_now?: string }
        Returns: string
      }
      purge_closed_tasks: { Args: never; Returns: Json }
      reassign_task: {
        Args: {
          client_request_id?: string
          new_assignee_id: string
          task_id: string
        }
        Returns: Json
      }
      revoke_task: {
        Args: { client_request_id?: string; task_id: string }
        Returns: Json
      }
      set_shop_order_status: {
        Args: {
          client_request_id?: string
          p_order_id: string
          p_status: Database["public"]["Enums"]["order_status"]
        }
        Returns: Json
      }
      subordinates: { Args: { mgr: string }; Returns: string[] }
      transition_task: {
        Args: {
          client_request_id?: string
          payload?: Json
          task_id: string
          to_status: Database["public"]["Enums"]["task_status"]
        }
        Returns: Json
      }
      tv_emit: {
        Args: {
          p_actor: string
          p_amount: number
          p_company: string
          p_kind: string
          p_task: string
          p_title: string
          p_title_guest?: string
        }
        Returns: undefined
      }
      tv_events_prune: { Args: { p_days?: number }; Returns: number }
      tv_summary: { Args: { p_guest?: boolean }; Returns: Json }
      update_company_profile: { Args: { p_name: string }; Returns: Json }
      update_company_settings: { Args: { patch: Json }; Returns: Json }
    }
    Enums: {
      absence_kind: "vacation" | "sick" | "other"
      ai_log_kind: "stt" | "parse" | "query"
      ai_source: "voice" | "typed" | "shared"
      availability_t: "active" | "vacation" | "sick"
      delivery_channel: "push" | "telegram" | "sms"
      delivery_status: "queued" | "sent" | "failed"
      inbox_status:
        | "recorded"
        | "transcribed"
        | "parsed"
        | "confirmed"
        | "discarded"
      message_type: "text" | "voice" | "photo" | "status_change" | "system"
      order_status: "pending" | "approved" | "delivered" | "cancelled"
      point_source:
        | "manual"
        | "auto_rule"
        | "reaction"
        | "shop_hold"
        | "shop_release"
      task_priority: "low" | "normal" | "high"
      task_status:
        | "scheduled"
        | "sent"
        | "accepted"
        | "in_progress"
        | "pending_review"
        | "done"
        | "rework"
        | "declined"
        | "revoked"
      user_role: "director" | "manager" | "employee" | "shopkeeper" | "tv"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      absence_kind: ["vacation", "sick", "other"],
      ai_log_kind: ["stt", "parse", "query"],
      ai_source: ["voice", "typed", "shared"],
      availability_t: ["active", "vacation", "sick"],
      delivery_channel: ["push", "telegram", "sms"],
      delivery_status: ["queued", "sent", "failed"],
      inbox_status: [
        "recorded",
        "transcribed",
        "parsed",
        "confirmed",
        "discarded",
      ],
      message_type: ["text", "voice", "photo", "status_change", "system"],
      order_status: ["pending", "approved", "delivered", "cancelled"],
      point_source: [
        "manual",
        "auto_rule",
        "reaction",
        "shop_hold",
        "shop_release",
      ],
      task_priority: ["low", "normal", "high"],
      task_status: [
        "scheduled",
        "sent",
        "accepted",
        "in_progress",
        "pending_review",
        "done",
        "rework",
        "declined",
        "revoked",
      ],
      user_role: ["director", "manager", "employee", "shopkeeper", "tv"],
    },
  },
} as const
