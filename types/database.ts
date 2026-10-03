// Auto-generated from Supabase schema — extend as needed

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type CoachingTable<Row, RequiredKeys extends keyof Row> = {
  Row: Row;
  Insert: Pick<Row, RequiredKeys> & Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      platform_operators: CoachingTable<{ user_id: string; created_at: string }, "user_id">;
      coach_business_invitations: CoachingTable<{
        id: string; name: string; email: string; invited_by: string; auth_user_id: string | null;
        status: "sending" | "email_sent" | "email_failed" | "accepted" | "cancelled";
        failure_code: "recipient_not_authorized" | "email_rate_limit" | "email_service_unavailable" | "server_not_configured" | null;
        attempt_id: string; last_attempt_at: string; created_at: string; expires_at: string; organization_id: string | null;
      }, "name" | "email" | "invited_by">;
      coach_organizations: CoachingTable<{
        id: string; name: string; owner_user_id: string; status: "trial" | "active" | "paused";
        plan: "free_test"; created_at: string; updated_at: string;
      }, "name" | "owner_user_id">;
      coach_memberships: CoachingTable<{
        user_id: string; organization_id: string; role: "coach" | "client";
        status: "active" | "disabled"; created_at: string;
      }, "user_id" | "organization_id" | "role">;
      coaching_drafts: CoachingTable<{
        id: string; member_id: string; coach_id: string; brief: string;
        scope: Json; content: Json | null; revision: number; status: "draft" | "approved";
        generation_job_id: string | null; generation_revision: number | null; assignment_id: string | null;
        created_at: string; updated_at: string;
      }, "member_id" | "coach_id" | "brief" | "scope">;
      coaching_profiles: CoachingTable<{
        member_id: string; training_context: string; coach_rules: string; nutrition_targets: string;
        updated_by: string; updated_at: string;
      }, "member_id" | "updated_by">;
      coach_chat_turns: CoachingTable<{
        id: string; user_id: string; job_id: string; question: string; answer: string | null;
        assignment_id: string | null; created_at: string;
      }, "user_id" | "job_id" | "question">;
      coaching_review_requests: CoachingTable<{
        id: string; member_id: string; assignment_id: string | null; message: string;
        status: "open" | "resolved"; created_at: string; resolved_at: string | null;
      }, "member_id" | "message">;
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          username: string | null;
          avatar_url: string | null;
          role: "admin" | "member";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          username?: string | null;
          avatar_url?: string | null;
          role?: "admin" | "member";
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };

      exercises: {
        Row: {
          organization_id: string | null;
          id: string;
          name: string;
          description: string | null;
          muscle_groups: string[];
          movement_type: string | null;
          equipment: string | null;
          is_compound: boolean;
          primary_lift: "bench" | "squat" | "deadlift" | null;
          created_by: string | null;
          is_public: boolean;
          coaching_client_id: string | null;
          created_at: string;
        };
        Insert: {
          organization_id?: string | null;
          id?: string;
          name: string;
          description?: string | null;
          muscle_groups?: string[];
          movement_type?: string | null;
          equipment?: string | null;
          is_compound?: boolean;
          primary_lift?: "bench" | "squat" | "deadlift" | null;
          created_by?: string | null;
          is_public?: boolean;
          coaching_client_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["exercises"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "exercises_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exercises_coaching_client_id_fkey";
            columns: ["coaching_client_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };

      programs: {
        Row: {
          organization_id: string | null;
          client_id: string | null;
          approved_snapshot: Json | null;
          id: string;
          title: string;
          description: string | null;
          created_by: string | null;
          is_template: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id?: string | null;
          client_id?: string | null;
          approved_snapshot?: Json | null;
          id?: string;
          title: string;
          description?: string | null;
          created_by?: string | null;
          is_template?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["programs"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "programs_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };

      program_blocks: {
        Row: {
          id: string;
          program_id: string;
          title: string;
          description: string | null;
          order_index: number;
          duration_weeks: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          program_id: string;
          title: string;
          description?: string | null;
          order_index: number;
          duration_weeks?: number | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["program_blocks"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "program_blocks_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          }
        ];
      };

      program_sessions: {
        Row: {
          id: string;
          block_id: string;
          program_id: string;
          title: string;
          session_order: number;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          block_id: string;
          program_id: string;
          title: string;
          session_order: number;
          notes?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["program_sessions"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "program_sessions_block_id_fkey";
            columns: ["block_id"];
            isOneToOne: false;
            referencedRelation: "program_blocks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "program_sessions_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          }
        ];
      };

      session_exercises: {
        Row: {
          prescription: Json | null;
          id: string;
          session_id: string;
          exercise_id: string;
          order_index: number;
          target_sets: number | null;
          target_reps: string | null;
          target_rpe: number | null;
          target_weight_kg: number | null;
          percent_1rm: number | null;
          rest_seconds: number | null;
          notes: string | null;
          is_warmup: boolean;
          created_at: string;
        };
        Insert: {
          prescription?: Json | null;
          id?: string;
          session_id: string;
          exercise_id: string;
          order_index: number;
          target_sets?: number | null;
          target_reps?: string | null;
          target_rpe?: number | null;
          target_weight_kg?: number | null;
          percent_1rm?: number | null;
          rest_seconds?: number | null;
          notes?: string | null;
          is_warmup?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["session_exercises"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "session_exercises_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "program_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "session_exercises_exercise_id_fkey";
            columns: ["exercise_id"];
            isOneToOne: false;
            referencedRelation: "exercises";
            referencedColumns: ["id"];
          }
        ];
      };

      user_program_assignments: {
        Row: {
          is_finite: boolean;
          status: "active" | "completed" | "replaced";
          completed_at: string | null;
          id: string;
          user_id: string;
          program_id: string;
          assigned_by: string | null;
          is_active: boolean;
          current_session_index: number;
          started_at: string;
          created_at: string;
        };
        Insert: {
          is_finite?: boolean;
          status?: "active" | "completed" | "replaced";
          completed_at?: string | null;
          id?: string;
          user_id: string;
          program_id: string;
          assigned_by?: string | null;
          is_active?: boolean;
          current_session_index?: number;
          started_at?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["user_program_assignments"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "user_program_assignments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_program_assignments_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_program_assignments_assigned_by_fkey";
            columns: ["assigned_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };

      user_exercise_overrides: {
        Row: {
          id: string;
          user_id: string;
          session_exercise_id: string;
          override_exercise_id: string | null;
          target_sets: number | null;
          target_reps: string | null;
          target_rpe: number | null;
          target_weight_kg: number | null;
          percent_1rm: number | null;
          rest_seconds: number | null;
          notes: string | null;
          is_deleted: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          session_exercise_id: string;
          override_exercise_id?: string | null;
          target_sets?: number | null;
          target_reps?: string | null;
          target_rpe?: number | null;
          target_weight_kg?: number | null;
          percent_1rm?: number | null;
          rest_seconds?: number | null;
          notes?: string | null;
          is_deleted?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["user_exercise_overrides"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "user_exercise_overrides_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_exercise_overrides_session_exercise_id_fkey";
            columns: ["session_exercise_id"];
            isOneToOne: false;
            referencedRelation: "session_exercises";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_exercise_overrides_override_exercise_id_fkey";
            columns: ["override_exercise_id"];
            isOneToOne: false;
            referencedRelation: "exercises";
            referencedColumns: ["id"];
          }
        ];
      };

      workout_logs: {
        Row: {
          id: string;
          user_id: string;
          session_id: string | null;
          assignment_id: string | null;
          title: string | null;
          date: string;
          started_at: string | null;
          finished_at: string | null;
          duration_minutes: number | null;
          status: "in_progress" | "completed" | "skipped";
          bodyweight_kg: number | null;
          energy_rating: number | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          session_id?: string | null;
          assignment_id?: string | null;
          title?: string | null;
          date?: string;
          started_at?: string | null;
          finished_at?: string | null;
          duration_minutes?: number | null;
          status?: "in_progress" | "completed" | "skipped";
          bodyweight_kg?: number | null;
          energy_rating?: number | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["workout_logs"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "workout_logs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workout_logs_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "program_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workout_logs_assignment_id_fkey";
            columns: ["assignment_id"];
            isOneToOne: false;
            referencedRelation: "user_program_assignments";
            referencedColumns: ["id"];
          }
        ];
      };

      workout_log_exercises: {
        Row: {
          planned_snapshot: Json | null;
          id: string;
          workout_log_id: string;
          exercise_id: string;
          session_exercise_id: string | null;
          order_index: number;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          planned_snapshot?: Json | null;
          id?: string;
          workout_log_id: string;
          exercise_id: string;
          session_exercise_id?: string | null;
          order_index: number;
          notes?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["workout_log_exercises"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "workout_log_exercises_workout_log_id_fkey";
            columns: ["workout_log_id"];
            isOneToOne: false;
            referencedRelation: "workout_logs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workout_log_exercises_exercise_id_fkey";
            columns: ["exercise_id"];
            isOneToOne: false;
            referencedRelation: "exercises";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workout_log_exercises_session_exercise_id_fkey";
            columns: ["session_exercise_id"];
            isOneToOne: false;
            referencedRelation: "session_exercises";
            referencedColumns: ["id"];
          }
        ];
      };

      workout_log_sets: {
        Row: {
          hold_seconds: number | null;
          id: string;
          log_exercise_id: string;
          set_number: number;
          weight_kg: number | null;
          reps: number | null;
          rpe: number | null;
          is_warmup: boolean;
          is_completed: boolean;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          hold_seconds?: number | null;
          id?: string;
          log_exercise_id: string;
          set_number: number;
          weight_kg?: number | null;
          reps?: number | null;
          rpe?: number | null;
          is_warmup?: boolean;
          is_completed?: boolean;
          notes?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["workout_log_sets"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "workout_log_sets_log_exercise_id_fkey";
            columns: ["log_exercise_id"];
            isOneToOne: false;
            referencedRelation: "workout_log_exercises";
            referencedColumns: ["id"];
          }
        ];
      };

      body_metrics: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          bodyweight_kg: number | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          date?: string;
          bodyweight_kg?: number | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["body_metrics"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "body_metrics_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };

      personal_records: {
        Row: {
          id: string;
          user_id: string;
          exercise_id: string;
          record_type: "1rm" | "estimated_1rm" | "volume";
          value: number;
          reps: number | null;
          date: string;
          workout_log_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          exercise_id: string;
          record_type: "1rm" | "estimated_1rm" | "volume";
          value: number;
          reps?: number | null;
          date?: string;
          workout_log_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["personal_records"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "personal_records_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "personal_records_exercise_id_fkey";
            columns: ["exercise_id"];
            isOneToOne: false;
            referencedRelation: "exercises";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "personal_records_workout_log_id_fkey";
            columns: ["workout_log_id"];
            isOneToOne: false;
            referencedRelation: "workout_logs";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_platform_operator: { Args: Record<string, never>; Returns: boolean };
      current_coach_organization: { Args: Record<string, never>; Returns: string | null };
      can_coach_member: { Args: { p_member_id: string }; Returns: boolean };
      can_manage_coaching_program: { Args: { p_program_id: string }; Returns: boolean };
      can_manage_coach_business: { Args: { p_organization_id: string }; Returns: boolean };
      coach_ai_access: { Args: Record<string, never>; Returns: boolean };
      get_coach_business_metrics: { Args: Record<string, never>; Returns: Json };
      create_coach_business: { Args: { p_name: string; p_coach_email: string }; Returns: string };
      prepare_coach_business_invitation: { Args: { p_name: string; p_email: string }; Returns: Json };
      record_coach_invitation_delivery: { Args: { p_invitation_id: string; p_attempt_id: string; p_auth_user_id: string | null; p_failure_code: string | null }; Returns: undefined };
      get_my_coach_business_invitation: { Args: Record<string, never>; Returns: Json };
      accept_coach_business_invitation: { Args: Record<string, never>; Returns: string };
      cancel_coach_business_invitation: { Args: { p_invitation_id: string }; Returns: undefined };
      set_coach_business_status: { Args: { p_organization_id: string; p_status: string }; Returns: undefined };
      add_coach_business_client: { Args: { p_email: string }; Returns: string };
      set_coach_member_role: { Args: { p_user_id: string; p_role: string }; Returns: undefined };
      start_workout_atomically: { Args: { p_session_id: string; p_quick_complete?: boolean }; Returns: string };
      complete_workout_atomically: { Args: { p_log_id: string; p_sets: Json; p_notes?: string | null; p_bodyweight?: number | null; p_energy?: number | null }; Returns: string };
      reopen_quick_workout_atomically: { Args: { p_session_id: string }; Returns: string };
      save_coaching_draft: {
        Args: { p_member_id: string; p_brief: string; p_scope: Json; p_content?: Json | null; p_draft_id?: string | null; p_expected_revision?: number | null; p_generation_job_id?: string | null };
        Returns: Database["public"]["Tables"]["coaching_drafts"]["Row"];
      };
      set_coaching_generation: { Args: { p_draft_id: string; p_expected_revision: number; p_job_id: string | null }; Returns: Database["public"]["Tables"]["coaching_drafts"]["Row"] };
      complete_coaching_generation: { Args: { p_draft_id: string; p_job_id: string; p_content: Json }; Returns: Database["public"]["Tables"]["coaching_drafts"]["Row"] };
      approve_coaching_draft: {
        Args: { p_draft_id: string; p_expected_revision: number };
        Returns: Json;
      };
      assign_program_atomically: { Args: { p_member_id: string; p_program_id: string }; Returns: string };
      save_coach_chat_turn: { Args: { p_job_id: string; p_question: string; p_answer: string | null; p_assignment_id?: string | null }; Returns: string };
      create_coaching_review_request: { Args: { p_message: string }; Returns: string };
      can_read_coaching_program: { Args: { p_program_id: string }; Returns: boolean };
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
    Enums: {
      [_ in never]: never;
    };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type Inserts<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type Updates<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
