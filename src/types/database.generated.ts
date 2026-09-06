export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_messages: {
        Row: {
          based_on_entry_ids: string[]
          content: string
          created_at: string
          diary_id: string
          dismissed_at: string | null
          id: string
          kind: Database["public"]["Enums"]["ai_message_kind"]
          user_id: string
        }
        Insert: {
          based_on_entry_ids?: string[]
          content: string
          created_at?: string
          diary_id: string
          dismissed_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["ai_message_kind"]
          user_id: string
        }
        Update: {
          based_on_entry_ids?: string[]
          content?: string
          created_at?: string
          diary_id?: string
          dismissed_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["ai_message_kind"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_diary_id_fkey"
            columns: ["diary_id"]
            isOneToOne: false
            referencedRelation: "diaries"
            referencedColumns: ["id"]
          },
        ]
      }
      diaries: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["diary_kind"]
          owner_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["diary_kind"]
          owner_id: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["diary_kind"]
          owner_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      diary_members: {
        Row: {
          diary_id: string
          joined_at: string
          role: Database["public"]["Enums"]["diary_role"]
          user_id: string
        }
        Insert: {
          diary_id: string
          joined_at?: string
          role?: Database["public"]["Enums"]["diary_role"]
          user_id: string
        }
        Update: {
          diary_id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["diary_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "diary_members_diary_id_fkey"
            columns: ["diary_id"]
            isOneToOne: false
            referencedRelation: "diaries"
            referencedColumns: ["id"]
          },
        ]
      }
      emotions: {
        Row: {
          family: string
          id: string
          is_active: boolean
          label: string
          slug: string
          sort_order: number
        }
        Insert: {
          family: string
          id?: string
          is_active?: boolean
          label: string
          slug: string
          sort_order?: number
        }
        Update: {
          family?: string
          id?: string
          is_active?: boolean
          label?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      entry_emotions: {
        Row: {
          diary_id: string
          emotion_id: string
          entry_id: string
        }
        Insert: {
          diary_id: string
          emotion_id: string
          entry_id: string
        }
        Update: {
          diary_id?: string
          emotion_id?: string
          entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entry_emotions_emotion_id_fkey"
            columns: ["emotion_id"]
            isOneToOne: false
            referencedRelation: "emotions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_emotions_entry_same_diary"
            columns: ["entry_id", "diary_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id", "diary_id"]
          },
        ]
      }
      entry_media: {
        Row: {
          created_at: string
          diary_id: string
          duration_ms: number | null
          entry_id: string
          height: number | null
          id: string
          kind: Database["public"]["Enums"]["media_kind"]
          mime_type: string
          position: number
          poster_path: string | null
          size_bytes: number | null
          status: Database["public"]["Enums"]["media_status"]
          storage_path: string
          transcript: string | null
          transcript_status: Database["public"]["Enums"]["transcript_status"]
          width: number | null
        }
        Insert: {
          created_at?: string
          diary_id: string
          duration_ms?: number | null
          entry_id: string
          height?: number | null
          id?: string
          kind: Database["public"]["Enums"]["media_kind"]
          mime_type: string
          position?: number
          poster_path?: string | null
          size_bytes?: number | null
          status?: Database["public"]["Enums"]["media_status"]
          storage_path: string
          transcript?: string | null
          transcript_status?: Database["public"]["Enums"]["transcript_status"]
          width?: number | null
        }
        Update: {
          created_at?: string
          diary_id?: string
          duration_ms?: number | null
          entry_id?: string
          height?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["media_kind"]
          mime_type?: string
          position?: number
          poster_path?: string | null
          size_bytes?: number | null
          status?: Database["public"]["Enums"]["media_status"]
          storage_path?: string
          transcript?: string | null
          transcript_status?: Database["public"]["Enums"]["transcript_status"]
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "entry_media_entry_same_diary"
            columns: ["entry_id", "diary_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id", "diary_id"]
          },
        ]
      }
      entry_tags: {
        Row: {
          diary_id: string
          entry_id: string
          tag_id: string
        }
        Insert: {
          diary_id: string
          entry_id: string
          tag_id: string
        }
        Update: {
          diary_id?: string
          entry_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entry_tags_entry_same_diary"
            columns: ["entry_id", "diary_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id", "diary_id"]
          },
          {
            foreignKeyName: "entry_tags_tag_same_diary"
            columns: ["tag_id", "diary_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id", "diary_id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          ai_excluded: boolean
          author_id: string
          body: string | null
          created_at: string
          deleted_at: string | null
          diary_id: string
          entry_at: string
          entry_date: string
          id: string
          is_favourite: boolean
          location_label: string | null
          mood: number | null
          people: string[] | null
          thread_id: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          ai_excluded?: boolean
          author_id: string
          body?: string | null
          created_at?: string
          deleted_at?: string | null
          diary_id: string
          entry_at?: string
          entry_date?: string
          id?: string
          is_favourite?: boolean
          location_label?: string | null
          mood?: number | null
          people?: string[] | null
          thread_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          ai_excluded?: boolean
          author_id?: string
          body?: string | null
          created_at?: string
          deleted_at?: string | null
          diary_id?: string
          entry_at?: string
          entry_date?: string
          id?: string
          is_favourite?: boolean
          location_label?: string | null
          mood?: number | null
          people?: string[] | null
          thread_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_diary_id_fkey"
            columns: ["diary_id"]
            isOneToOne: false
            referencedRelation: "diaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_thread_same_diary"
            columns: ["thread_id", "diary_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id", "diary_id"]
          },
        ]
      }
      profiles: {
        Row: {
          ai_consented_at: string | null
          ai_enabled: boolean
          avatar_path: string | null
          created_at: string
          display_name: string | null
          id: string
          onboarding_completed_at: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          ai_consented_at?: string | null
          ai_enabled?: boolean
          avatar_path?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          onboarding_completed_at?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          ai_consented_at?: string | null
          ai_enabled?: boolean
          avatar_path?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          onboarding_completed_at?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          created_at: string
          diary_id: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          diary_id: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          diary_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_diary_id_fkey"
            columns: ["diary_id"]
            isOneToOne: false
            referencedRelation: "diaries"
            referencedColumns: ["id"]
          },
        ]
      }
      threads: {
        Row: {
          created_at: string
          description: string | null
          diary_id: string
          id: string
          is_private: boolean
          started_on: string
          status: Database["public"]["Enums"]["thread_status"]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          diary_id: string
          id?: string
          is_private?: boolean
          started_on?: string
          status?: Database["public"]["Enums"]["thread_status"]
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          diary_id?: string
          id?: string
          is_private?: boolean
          started_on?: string
          status?: Database["public"]["Enums"]["thread_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "threads_diary_id_fkey"
            columns: ["diary_id"]
            isOneToOne: false
            referencedRelation: "diaries"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_diary_member: { Args: { d: string; u: string }; Returns: boolean }
      is_diary_owner: { Args: { d: string; u: string }; Returns: boolean }
    }
    Enums: {
      ai_message_kind: "question" | "observation"
      diary_kind: "personal" | "shared"
      diary_role: "owner" | "member"
      media_kind: "photo" | "video" | "audio"
      media_status: "pending" | "uploaded" | "failed"
      thread_status: "open" | "closed"
      transcript_status: "none" | "pending" | "done" | "failed"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      ai_message_kind: ["question", "observation"],
      diary_kind: ["personal", "shared"],
      diary_role: ["owner", "member"],
      media_kind: ["photo", "video", "audio"],
      media_status: ["pending", "uploaded", "failed"],
      thread_status: ["open", "closed"],
      transcript_status: ["none", "pending", "done", "failed"],
    },
  },
} as const

