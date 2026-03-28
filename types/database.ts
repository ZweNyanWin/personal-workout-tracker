// Auto-generated from Supabase schema — extend as needed

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
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
          created_at: string;
        };
        Insert: {
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
          }
        ];
      };

      programs: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          created_by: string | null;
          is_template: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
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
          id: string;
          workout_log_id: string;
          exercise_id: string;
          session_exercise_id: string | null;
          order_index: number;
          notes: string | null;
          created_at: string;
        };
        Insert: {
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
