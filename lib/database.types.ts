// Tipos TypeScript do banco de dados.
// Mantido manualmente em sincronia com as migrações em supabase/migrations/.
// (Para regenerar do projeto: npx supabase gen types typescript --project-id <id>)

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ExtraResult = 'home' | 'draw' | 'away';
export type MatchStatus = 'SCHEDULED' | 'FINISHED';
export type TournamentFormat = 'groups' | 'knockout' | 'mixed';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          avatar_url: string | null;
          total_points: number;
          exact_matches: number;
          is_admin: boolean;
          total_money: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username: string;
          avatar_url?: string | null;
          total_points?: number;
          exact_matches?: number;
          is_admin?: boolean;
          total_money?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          username?: string;
          avatar_url?: string | null;
          total_points?: number;
          exact_matches?: number;
          is_admin?: boolean;
          total_money?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      tournaments: {
        Row: {
          id: number;
          name: string;
          slug: string;
          active: boolean;
          logo_url: string | null;
          format: TournamentFormat;
          champion_team: string | null;
          champion_iso: string | null;
          runner_up_team: string | null;
          runner_up_iso: string | null;
          third_place_team: string | null;
          third_place_iso: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          name: string;
          slug: string;
          active?: boolean;
          logo_url?: string | null;
          format?: TournamentFormat;
          champion_team?: string | null;
          champion_iso?: string | null;
          runner_up_team?: string | null;
          runner_up_iso?: string | null;
          third_place_team?: string | null;
          third_place_iso?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          name?: string;
          slug?: string;
          active?: boolean;
          logo_url?: string | null;
          format?: TournamentFormat;
          champion_team?: string | null;
          champion_iso?: string | null;
          runner_up_team?: string | null;
          runner_up_iso?: string | null;
          third_place_team?: string | null;
          third_place_iso?: string | null;
          created_at?: string;
        };
      };
      matches: {
        Row: {
          id: number;
          tournament_id: number | null;
          team_home: string;
          team_away: string;
          home_iso: string | null;
          away_iso: string | null;
          match_date: string;
          score_home: number | null;
          score_away: number | null;
          status: MatchStatus;
          phase: string | null;
          is_knockout: boolean;
          extra_time_result: ExtraResult | null;
          pen_home: number | null;
          pen_away: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          tournament_id?: number | null;
          team_home: string;
          team_away: string;
          home_iso?: string | null;
          away_iso?: string | null;
          match_date: string;
          score_home?: number | null;
          score_away?: number | null;
          status?: MatchStatus;
          phase?: string | null;
          is_knockout?: boolean;
          extra_time_result?: ExtraResult | null;
          pen_home?: number | null;
          pen_away?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          tournament_id?: number | null;
          team_home?: string;
          team_away?: string;
          home_iso?: string | null;
          away_iso?: string | null;
          match_date?: string;
          score_home?: number | null;
          score_away?: number | null;
          status?: MatchStatus;
          phase?: string | null;
          is_knockout?: boolean;
          extra_time_result?: ExtraResult | null;
          pen_home?: number | null;
          pen_away?: number | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      predictions: {
        Row: {
          id: number;
          user_id: string;
          match_id: number;
          pred_home: number;
          pred_away: number;
          pred_extra_result: ExtraResult | null;
          pred_pen_home: number | null;
          pred_pen_away: number | null;
          points_earned: number;
          points_regular: number;
          points_extra: number;
          points_pen: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          match_id: number;
          pred_home: number;
          pred_away: number;
          pred_extra_result?: ExtraResult | null;
          pred_pen_home?: number | null;
          pred_pen_away?: number | null;
          points_earned?: number;
          points_regular?: number;
          points_extra?: number;
          points_pen?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string;
          match_id?: number;
          pred_home?: number;
          pred_away?: number;
          pred_extra_result?: ExtraResult | null;
          pred_pen_home?: number | null;
          pred_pen_away?: number | null;
          points_earned?: number;
          points_regular?: number;
          points_extra?: number;
          points_pen?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      podium_predictions: {
        Row: {
          id: number;
          user_id: string;
          tournament_id: number;
          champion_team: string | null;
          champion_iso: string | null;
          runner_up_team: string | null;
          runner_up_iso: string | null;
          third_place_team: string | null;
          third_place_iso: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          tournament_id: number;
          champion_team?: string | null;
          champion_iso?: string | null;
          runner_up_team?: string | null;
          runner_up_iso?: string | null;
          third_place_team?: string | null;
          third_place_iso?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string;
          tournament_id?: number;
          champion_team?: string | null;
          champion_iso?: string | null;
          runner_up_team?: string | null;
          runner_up_iso?: string | null;
          third_place_team?: string | null;
          third_place_iso?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      tournament_rankings: {
        Row: {
          id: number;
          user_id: string;
          tournament_id: number;
          total_points: number;
          exact_matches: number;
          prize_money: number;
          podium_points: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          tournament_id: number;
          total_points?: number;
          exact_matches?: number;
          prize_money?: number;
          podium_points?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string;
          tournament_id?: number;
          total_points?: number;
          exact_matches?: number;
          prize_money?: number;
          podium_points?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}
