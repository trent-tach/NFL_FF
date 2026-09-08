// Shared shapes returned by /api/rankings/* and /api/players/*. Kept in one
// file since the rankings page and the player page both consume them.

export type RankingType = "preseason" | "weekly" | "ros" | "kicker" | "dst" | "games";
export type ScoringFormat = "ppr" | "half_ppr" | "standard";

export interface RankingManifestItem {
  key: string;
  label: string;
  type: RankingType;
}

export interface RankingEntry {
  slug: string;
  rank: number;
  position_rank: number;
  name: string;
  position: string;
  team: string;
  photo_url: string;
  opponent: string | null;
  opponent_logo_url: string | null;
  opp_rank: number | null; // 1 (hardest) - 32 (easiest); null until week 2
  dome: boolean | null; // weekly only
  weather: string | null; // weekly only -- "🏟️ Dome" or "💨 38°F, 22mph wind" etc.
  dome_games: number | null; // ROS only -- # of remaining games in a dome/closed roof
  projection: number;
  projection_label: string;
  games: number | null;
  rank_change: string; // "new" | "0" | "+N" | "-N"
  roster_status: string;
}

export interface KickerEntry {
  slug: string;
  rank: number;
  name: string;
  team: string;
  opponent: string;
  photo_url: string;
  distance_projection: number;
  standard_projection: number;
  fg_pct: number | null;
  offense_rank: number | null;
  fourth_down_go_pct: number | null;
  rank_change: string;
  roster_status: string;
}

export interface DSTEntry {
  slug: string;
  rank: number;
  team: string;
  opponent: string;
  logo_url: string;
  projection: number;
  pressure_rate: number;
  opponent_offense_rank: number | null;
  bottom_10_offense_faced: boolean;
  sacks_pg: number;
  takeaways_pg: number;
  points_allowed_pg: number;
  rank_change: string;
}

export interface GamePrediction {
  game_id: string;
  kickoff: string;
  gameday: string;
  gametime: string;
  spread_display: string;
  total_line: number;
  away_team: string;
  away_logo_url: string | null;
  away_score: number;
  away_band_low: number;
  away_band_high: number;
  away_win_pct: number;
  home_team: string;
  home_logo_url: string | null;
  home_score: number;
  home_band_low: number;
  home_band_high: number;
  home_win_pct: number;
  pick_team: string;
  pick_win_pct: number;
  is_upset: boolean;
}

export interface PlayerHistoryEntry {
  week_key: string;
  week_label: string;
  type: RankingType;
  rank: number;
  projection: number;
}

export interface PlayerDetail {
  slug: string;
  name: string;
  position: string;
  team: string;
  photo_url: string;
  history: PlayerHistoryEntry[];
}
