// Shared shapes returned by /api/rankings/* and /api/players/*. Kept in one
// file since the rankings page and the player page both consume them.

export type RankingType = "preseason" | "weekly" | "ros" | "kicker" | "dst" | "games";
export type ScoringFormat = "ppr" | "half_ppr" | "standard";

export interface RankingManifestItem {
  key: string;
  label: string;
  type: RankingType;
  // When the converter last wrote this board. Optional because boards
  // imported before the converter started stamping them don't carry one.
  generated_at?: string | null;
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
  // Football-native fields added with the redesign. All optional: the
  // frontend renders correctly against boards generated before the
  // pipeline started emitting them, so the UI could ship first.
  bye_week?: number | null;
  injury_status?: string | null; // "Questionable" | "Doubtful" | "Out" | "IR"
  playing_probability?: number | null; // 0-1
  team_color?: string | null; // team primary, hex
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
  total_line: number | null; // null when Vegas hasn't posted a total yet (a far-out week)
  away_team: string;
  away_logo_url: string | null;
  away_color?: string | null; // team primary, hex
  away_score: number;
  away_band_low: number;
  away_band_high: number;
  away_win_pct: number;
  home_team: string;
  home_logo_url: string | null;
  home_color?: string | null; // team primary, hex
  home_score: number;
  home_band_low: number;
  home_band_high: number;
  home_win_pct: number;
  pick_team: string;
  pick_win_pct: number;
  is_upset: boolean;
}

// --- My Leagues -----------------------------------------------------------
// Nothing here is persisted server-side (no accounts yet) -- a connected
// league, including a private ESPN league's cookies, lives entirely in the
// browser's localStorage. See lib/myLeagues.ts.

export type LeaguePlatform = "sleeper" | "espn" | "custom";

export interface LeagueTeamOption {
  // Sleeper fields
  roster_id?: number;
  owner_id?: string;
  owner_display_name?: string;
  avatar_url?: string | null;
  // ESPN fields
  team_id?: number;
  abbrev?: string;
  logo_url?: string | null;
  // shared
  team_name: string;
  wins: number | null;
  losses: number | null;
}

// Custom leagues only -- structured roster/scoring settings, mirroring the
// same category shape pipeline.py's SCORING_FORMATS dict already uses
// (pass_yd/pass_td/interception/rush_yd/rush_td/rec/rec_yd/rec_td/
// fumble_lost/te_bonus), so this maps cleanly onto real scoring later.
export interface CustomRosterSlots {
  qb: number;
  rb: number;
  wr: number;
  te: number;
  flex: number; // RB/WR/TE
  superflex: number; // QB/RB/WR/TE
  k: number;
  dst: number;
  bench: number;
  ir: number;
}

export interface CustomScoringRules {
  passYd: number; // points per passing yard
  passTd: number;
  interception: number; // points per INT thrown (usually negative)
  rushYd: number;
  rushTd: number;
  reception: number; // the PPR value -- also what derives `scoringFormat` below
  recYd: number;
  recTd: number;
  fumbleLost: number; // usually negative
  teBonus: number; // extra points per TE reception, on top of `reception`
}

export interface LeagueLookupResult {
  platform: LeaguePlatform;
  league_id: string;
  league_name: string;
  season: string | number;
  scoring_format: ScoringFormat;
  roster_slots: CustomRosterSlots | null;
  scoring_rules: CustomScoringRules | null;
  teams: LeagueTeamOption[];
}

export interface ConnectedLeague {
  id: string; // local uuid, not the platform's league id
  platform: LeaguePlatform;
  leagueId: string;
  season: string | number;
  leagueName: string;
  scoringFormat: ScoringFormat;
  myTeam: LeagueTeamOption;
  // ESPN private leagues only -- the user's own espn.com session cookies,
  // kept only in this browser, sent fresh with each lookup/refresh.
  espnAuth?: { espn_s2: string; swid: string };
  // Custom leagues only. `scoringFormat` above is derived automatically
  // from `scoringRules.reception` (see lib/leagueSettings.ts) and is what
  // actually prices a matchup today, since our projections only compute
  // in PPR/Half/Standard -- `rosterSlots`/`scoringRules` capture the real
  // settings for reference (and for anything built on top of them later,
  // like lineup-legality checks), `rulesNotes` catches anything else
  // (keeper status, bye-week rules, etc.) that isn't a slot or a stat.
  rosterSlots?: CustomRosterSlots;
  scoringRules?: CustomScoringRules;
  rulesNotes?: string;
}

// --- Matchups ---------------------------------------------------------
// "Your Matchups" shows two kinds: a live one pulled from a connected
// league (fetched fresh each visit, never stored) and a custom one you
// build by hand (stored in localStorage, see lib/matchups.ts).

export interface MatchupPlayer {
  player_id: string | number | null;
  name: string | null;
  position: string | null;
  team: string | null;
  photo_url: string | null;
  points: number | null;
}

export interface MatchupSide {
  roster_id?: number;
  team_id?: number;
  team_name: string;
  players: MatchupPlayer[];
  total: number | null;
}

export interface LeagueMatchup {
  week: number;
  my_team: MatchupSide | null;
  opponent: MatchupSide | null;
}

// One roster spot's worth of player, common to QB/RB/WR/TE (from
// RankingEntry), K (from KickerEntry) and DST (from DSTEntry) -- lets the
// slot-based custom-league roster builder below treat all five position
// groups the same way instead of juggling three different shapes.
export interface RosterPlayer {
  slug: string;
  name: string;
  team: string;
  position: string; // QB | RB | WR | TE | K | DST
  photo_url: string;
  projection: number;
}

// A custom league has no live-scoring API of its own, so its matchup for
// a given week is entered by hand and saved per (league, week) -- unlike
// CustomMatchup below, which is a one-off comparison not tied to any
// league or week. Players are stored flat (not keyed by slot) in slot
// order -- see lib/rosterSlots.ts for how they're re-associated with slots
// when the form reopens for editing.
export interface CustomLeagueMatchup {
  leagueId: string; // ConnectedLeague.id
  week: number;
  myPlayers: RosterPlayer[];
  opponentTeamName: string;
  opponentPlayers: RosterPlayer[];
}

export interface CustomMatchupSide {
  label: string;
  players: RankingEntry[];
}

export interface CustomMatchup {
  id: string;
  name: string;
  weekKey: string; // the RankingManifestItem key its projections came from
  sideA: CustomMatchupSide;
  sideB: CustomMatchupSide;
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
