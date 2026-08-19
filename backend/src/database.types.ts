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
    PostgrestVersion: "14.15"
  }
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
      classes: {
        Row: {
          created_at: string
          id: string
          lore_intro: string
          name: string
          sport_id: string | null
        }
        Insert: {
          created_at?: string
          id: string
          lore_intro: string
          name: string
          sport_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          lore_intro?: string
          name?: string
          sport_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "classes_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      entitlements: {
        Row: {
          expires_at: string | null
          plan: Database["public"]["Enums"]["entitlement_plan"]
          profile_id: string
          revenuecat_id: string | null
          status: Database["public"]["Enums"]["entitlement_status"]
          updated_at: string
        }
        Insert: {
          expires_at?: string | null
          plan?: Database["public"]["Enums"]["entitlement_plan"]
          profile_id: string
          revenuecat_id?: string | null
          status?: Database["public"]["Enums"]["entitlement_status"]
          updated_at?: string
        }
        Update: {
          expires_at?: string | null
          plan?: Database["public"]["Enums"]["entitlement_plan"]
          profile_id?: string
          revenuecat_id?: string | null
          status?: Database["public"]["Enums"]["entitlement_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entitlements_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      level_thresholds: {
        Row: {
          level: number
          title: string
          unlock_description: string | null
          xp_required: number
        }
        Insert: {
          level: number
          title: string
          unlock_description?: string | null
          xp_required: number
        }
        Update: {
          level?: number
          title?: string
          unlock_description?: string | null
          xp_required?: number
        }
        Relationships: []
      }
      narrative_beats: {
        Row: {
          body: string
          created_at: string
          id: string
          order_index: number
          sport_id: string | null
          title: string
          track: string
          trigger_type: string
          trigger_value: number
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          order_index: number
          sport_id?: string | null
          title: string
          track: string
          trigger_type: string
          trigger_value: number
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          order_index?: number
          sport_id?: string | null
          title?: string
          track?: string
          trigger_type?: string
          trigger_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "narrative_beats_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          class_id: string | null
          created_at: string
          id: string
          notify_level_up: boolean
          timezone: string
          username: string | null
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          id: string
          notify_level_up?: boolean
          timezone?: string
          username?: string | null
        }
        Update: {
          class_id?: string | null
          created_at?: string
          id?: string
          notify_level_up?: boolean
          timezone?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      sports: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id: string
          name: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      user_narrative_unlocks: {
        Row: {
          beat_id: string
          profile_id: string
          read_at: string | null
          unlocked_at: string
        }
        Insert: {
          beat_id: string
          profile_id: string
          read_at?: string | null
          unlocked_at?: string
        }
        Update: {
          beat_id?: string
          profile_id?: string
          read_at?: string | null
          unlocked_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_narrative_unlocks_beat_id_fkey"
            columns: ["beat_id"]
            isOneToOne: false
            referencedRelation: "narrative_beats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_narrative_unlocks_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_progress: {
        Row: {
          current_xp: number
          last_workout_on: string | null
          level: number
          profile_id: string
          streak_days: number
          updated_at: string
        }
        Insert: {
          current_xp?: number
          last_workout_on?: string | null
          level?: number
          profile_id: string
          streak_days?: number
          updated_at?: string
        }
        Update: {
          current_xp?: number
          last_workout_on?: string | null
          level?: number
          profile_id?: string
          streak_days?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_progress_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_logs: {
        Row: {
          created_at: string
          id: string
          metrics: Json
          performed_at: string
          profile_id: string
          sport_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          metrics?: Json
          performed_at?: string
          profile_id: string
          sport_id: string
        }
        Update: {
          created_at?: string
          id?: string
          metrics?: Json
          performed_at?: string
          profile_id?: string
          sport_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_logs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_logs_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      xp_events: {
        Row: {
          amount: number
          created_at: string
          id: string
          profile_id: string
          source_id: string | null
          source_type: Database["public"]["Enums"]["xp_source_type"]
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          profile_id: string
          source_id?: string | null
          source_type: Database["public"]["Enums"]["xp_source_type"]
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          profile_id?: string
          source_id?: string | null
          source_type?: Database["public"]["Enums"]["xp_source_type"]
        }
        Relationships: [
          {
            foreignKeyName: "xp_events_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      count_workouts_by_sport: {
        Args: { p_profile_id: string }
        Returns: {
          sessions: number
          sport_id: string
        }[]
      }
      log_workout_with_xp: {
        Args: {
          p_daily_credited_limit: number
          p_day_end: string
          p_day_start: string
          p_last_workout_on: string
          p_metrics: Json
          p_min_gap_minutes: number
          p_performed_at: string
          p_profile_id: string
          p_sport_id: string
          p_streak_days: number
          p_streak_xp: number
          p_workout_xp: number
        }
        Returns: Json
      }
    }
    Enums: {
      entitlement_plan: "freemium" | "subscription" | "lifetime"
      entitlement_status: "active" | "in_grace_period" | "cancelled" | "expired"
      xp_source_type: "workout" | "streak" | "achievement" | "manual_adjustment"
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
      entitlement_plan: ["freemium", "subscription", "lifetime"],
      entitlement_status: ["active", "in_grace_period", "cancelled", "expired"],
      xp_source_type: ["workout", "streak", "achievement", "manual_adjustment"],
    },
  },
} as const
