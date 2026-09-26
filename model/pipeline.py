"""
Scout-level weekly fantasy football projection pipeline.

Architecture in one sentence: every signal that depends on in-season sample
size (a player's own performance, a defense's points-allowed-by-position,
and a team's pass-rate-over-expected) is Bayesian-blended from a prior-season
baseline toward a current-season empirical estimate as the season accumulates
weeks, and the blended player-level number is then adjusted by purely
contextual, non-learned multipliers (Vegas implied total, opponent DvP,
weather) that don't need a training sample to be meaningful.

Data source: nflreadpy. As of this writing (pre-2026-season), nflreadpy's
2026 `load_rosters_weekly` / `load_player_stats` endpoints 404 because the
season hasn't been played yet -- this is not a bug, it *is* the Week-1
cold-start problem the pipeline is built to survive. Every loader below
degrades gracefully to an empty frame (or a season-level fallback) instead
of crashing, and the blend schedule automatically shifts all the weight
onto the offseason prior when no current-season rows exist.
"""

from __future__ import annotations

import warnings

import numpy as np
import pandas as pd
from scipy.stats import norm, spearmanr
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.linear_model import LogisticRegression, Ridge

import nflreadpy as nfl

warnings.filterwarnings("ignore", category=FutureWarning)
pd.set_option("mode.chained_assignment", None)

POSITIONS = ["QB", "RB", "WR", "TE"]

# ---------------------------------------------------------------------------
# 1. CONFIG
# ---------------------------------------------------------------------------

# Points per stat unit, by league scoring format. `rec` = points per catch,
# `te_bonus` = extra points per TE catch on top of `rec` (TE-premium leagues).
SCORING_FORMATS = {
    "standard": dict(pass_yd=0.04, pass_td=4, interception=-2, rush_yd=0.1,
                      rush_td=6, rec=0.0, rec_yd=0.1, rec_td=6,
                      fumble_lost=-2, te_bonus=0.0),
    "half_ppr": dict(pass_yd=0.04, pass_td=4, interception=-2, rush_yd=0.1,
                      rush_td=6, rec=0.5, rec_yd=0.1, rec_td=6,
                      fumble_lost=-2, te_bonus=0.0),
    "ppr": dict(pass_yd=0.04, pass_td=4, interception=-2, rush_yd=0.1,
                rush_td=6, rec=1.0, rec_yd=0.1, rec_td=6,
                fumble_lost=-2, te_bonus=0.0),
    "te_premium": dict(pass_yd=0.04, pass_td=4, interception=-2, rush_yd=0.1,
                        rush_td=6, rec=1.0, rec_yd=0.1, rec_td=6,
                        fumble_lost=-2, te_bonus=0.5),
}

# (prior_weight, model_weight) by week number for player-level blending.
# Any week not listed (i.e. 4+) falls back to DEFAULT_BLEND.
WEEK_BLEND_SCHEDULE = {1: (1.00, 0.00), 2: (0.60, 0.40), 3: (0.30, 0.70)}
DEFAULT_BLEND = (0.00, 1.00)

# Defense-vs-position and team PROE need *less* in-season data to trust than
# a single player's box score (32 opposing players feed one DvP number, one
# team feeds one PROE number each week), so they trust the current season
# a little faster than the player-level schedule.
DVP_BLEND_SCHEDULE = {1: (1.00, 0.00), 2: (0.75, 0.25), 3: (0.50, 0.50)}
DVP_DEFAULT_BLEND = (0.15, 0.85)

VEGAS_BASELINE_TOTAL = 21.5  # league-average implied team total
GAMES_IN_SEASON = 17  # NFL regular season length since 2021; used for season-long totals
GAME_MARGIN_STDEV = 13.5  # empirical std dev of NFL full-game scoring margins
TEAM_SCORE_STDEV = 10.0  # empirical std dev of a single team's single-game score

# Rookie PPG baseline by position and draft-capital bucket.
ROOKIE_BASELINES = {
    "QB": {1: 14.0, 2: 10.0, 3: 7.0, "day3": 4.0},
    "RB": {1: 9.0, 2: 7.5, 3: 5.5, "day3": 3.0},
    "WR": {1: 10.0, 2: 7.0, 3: 5.0, "day3": 2.5},
    "TE": {1: 7.0, 2: 5.0, 3: 3.5, "day3": 2.0},
}
# Floor for a player with neither a 2025 stat line nor draft capital (UDFA).
# This assumes SOME real usage -- a WR3/RB2/TE2 bench player still gets a
# handful of snaps most weeks, which is why these are nonzero.
REPLACEMENT_LEVEL_PPG = {"QB": 6.0, "RB": 2.5, "WR": 2.5, "TE": 2.0}
REPLACEMENT_LEVEL_SHARE = {"QB": 0.05, "RB": 0.05, "WR": 0.03, "TE": 0.03}

# A backup QB behind a HEALTHY starter is a fundamentally different case:
# there is no "a few backup-QB snaps" the way there's a few garbage-time WR3
# targets -- he takes ~0 offensive snaps unless the starter gets hurt
# mid-game. REPLACEMENT_LEVEL_PPG assumes real usage and is too generous
# here; this reflects near-zero expected production (a small allowance for
# rare garbage-time mop-up duty), used only in apply_qb_depth_chart_status.
NON_STARTING_QB_PPG = 1.0
NON_STARTING_QB_SHARE = 0.01

# WR/RB/TE depth-chart role-change adjustment: if a player's CURRENT
# depth-chart rank on his team has moved relative to where his own USAGE
# ranked him last season (e.g. he was his team's #1 target-share receiver
# last year but the current depth chart now lists him #2 behind a new
# addition), that's a direct statement of role change -- no dollar-to-
# usage conversion needed the way a contract-value signal would require.
# Asymmetric on purpose: a demotion is a fairly mechanical signal (a real
# roster decision moved snaps elsewhere), while a promotion's fantasy value
# is less certain until it shows up in actual games, so it's dampened less
# confidently than a drop is discounted.
DEPTH_RANK_CHANGE_PER_SLOT = 0.12
MAX_DEPTH_RANK_DAMPEN = 0.40   # cap on how much a demotion can reduce the prior
MAX_DEPTH_RANK_BOOST = 0.25    # cap on how much a promotion can raise the prior

# Each position gets its own opportunity profile -- a QB has no target share,
# an RB is a dual-usage rush/target player, WR/TE are receiving-only but
# modeled separately since their aDOT/red-zone distributions differ.
# `team_pressure_rate_allowed_blended` (pass-block proxy, section 5b) and
# `snap_share_*`/`team_run_block_oe_blended` (section 5c) are learned
# features, not hardcoded multipliers -- Ridge decides their coefficient
# from data, same as every other column here.
POSITION_FEATURES = {
    "QB": ["pass_attempt_share_r3", "pass_attempt_share_exp",
           "carry_share_r3", "carry_share_exp",
           "rz_carry_share_r3", "rz_carry_share_exp",
           "team_proe_blended", "adot_r3",
           "team_pressure_rate_allowed_blended"],
    "RB": ["carry_share_r3", "carry_share_exp",
           "rz_carry_share_r3", "rz_carry_share_exp",
           "target_share_r3", "target_share_exp",
           "wopr_r3", "wopr_exp", "team_proe_blended",
           "snap_share_r3", "snap_share_exp",
           "team_run_block_oe_blended"],
    "WR": ["target_share_r3", "target_share_exp",
           "wopr_r3", "wopr_exp",
           "adot_r3", "adot_exp",
           "rz_target_share_r3", "rz_target_share_exp",
           "snap_share_r3", "snap_share_exp"],
    "TE": ["target_share_r3", "target_share_exp",
           "wopr_r3", "wopr_exp",
           "adot_r3", "adot_exp",
           "rz_target_share_r3", "rz_target_share_exp",
           "snap_share_r3", "snap_share_exp"],
}

MIN_TRAINING_ROWS = 20  # below this, skip ML and lean entirely on the prior

# Standard 12-team, single-QB league starter cutoffs used as the "replacement
# level" rank for VORP (Value Over Replacement Player): the Nth-best
# projection at a position approximates the last player who'd actually be
# rostered as a starter that week.
REPLACEMENT_RANK = {"QB": 13, "RB": 30, "WR": 36, "TE": 13}

# Practice-report participation -> estimated probability of playing this
# week. Applied as a soft, continuous scale-down BEFORE official gameday
# inactives are known (which is when the hard roster_status ACT/INACTIVE
# zeroing below actually kicks in) -- "Questionable, DNP Friday" and
# "Questionable, Full Friday" are very different signals that a binary
# active/inactive flag can't see yet mid-week.
PRACTICE_STATUS_PROB = {
    "Did Not Participate In Practice": 0.55,
    "Limited Participation in Practice": 0.80,
    "Full Participation in Practice": 0.95,
}
REPORT_STATUS_PROB = {"Out": 0.0, "Doubtful": 0.25, "Questionable": None}  # None = defer to practice status

# nflverse is not internally consistent about team abbreviations: schedules/
# player_stats/pbp use the canonical codes (ARI, LA, GB, ...), but
# `load_draft_picks` uses PFR-style codes and `load_rosters` has been
# observed to use 'AZ' for Arizona for not-yet-played seasons. Any merge on
# `team` silently drops rows for a mismatched code instead of erroring, so
# every team column gets normalized to the schedule's canonical set on load.
TEAM_CODE_MAP = {
    "AZ": "ARI", "NOR": "NO", "NWE": "NE", "TAM": "TB",
    "GNB": "GB", "SFO": "SF", "LAR": "LA", "KAN": "KC", "LVR": "LV",
}


def normalize_team_codes(series: pd.Series) -> pd.Series:
    return series.replace(TEAM_CODE_MAP)


def restrict_depth_chart_to_date(depth_charts_df: pd.DataFrame, cutoff_date) -> pd.DataFrame:
    """`load_depth_charts(season)` returns snapshots spanning the ENTIRE
    season plus its following offseason (a `season=2025` pull runs from
    Aug 2025 through March 2026) -- every depth-chart-consuming function in
    this pipeline picks the single latest snapshot available, so without
    this bound a backtest on an October 2025 week would silently pick up a
    March 2026 snapshot that already reflects the FOLLOWING offseason's
    free agency and draft moves. Bounding to snapshots dated at or before
    the week actually being predicted keeps every use of the depth chart
    honestly "as of" that week -- for a live, not-yet-played week this is a
    no-op (there's nothing dated later to exclude), so it only changes
    behavior for backtesting."""
    if depth_charts_df.empty or cutoff_date is None or "dt" not in depth_charts_df.columns:
        return depth_charts_df
    dt_parsed = pd.to_datetime(depth_charts_df["dt"], utc=True, errors="coerce").dt.tz_localize(None)
    return depth_charts_df[dt_parsed <= cutoff_date]


# External, current-year-only O-line ratings (e.g. preseason panel rankings)
# CANNOT be used as a learned Ridge feature the way team_pressure_rate_allowed
# / team_run_block_oe are -- there is no history of "team had rating X, RB
# scored Y" to fit a coefficient on a rating that only exists for one
# season. Instead it's applied as a hand-calibrated multiplier layered on
# top of the existing data-derived proxy, gated by season so it only
# affects the year it's actually sourced for and never touches historical
# backtesting. Add a new season's table here (average rank across a panel
# of sources, 1 = best) as they're published; keys must be canonical team
# codes (see TEAM_CODE_MAP above).
EXTERNAL_OLINE_RANKINGS = {
    2026: {  # 2026 preseason O-line panel avg rank (Clay/Sharp/4for4/FTN)
        "DEN": 1.0, "PHI": 2.5, "LA": 3.8, "CHI": 4.5, "TB": 6.3, "SF": 6.8,
        "BUF": 7.3, "CAR": 8.0, "LAC": 12.0, "IND": 12.8, "ATL": 13.3,
        "MIN": 13.8, "NE": 14.8, "SEA": 14.8, "DAL": 15.0, "DET": 16.3,
        "NYJ": 17.0, "NYG": 17.5, "PIT": 18.0, "ARI": 19.3, "KC": 19.3,
        "NO": 20.0, "JAX": 21.0, "LV": 21.5, "WAS": 22.3, "BAL": 23.8,
        "GB": 28.0, "CIN": 28.5, "HOU": 28.8, "MIA": 29.5, "TEN": 29.8,
        "CLE": 30.5,
    },
}
# Max multiplier swing at the very best/worst-ranked O-line (rank 1 vs 32);
# modest on purpose since this is a subjective preseason panel, not a
# data-fitted signal -- it nudges QB/RB projections, it doesn't dominate them.
EXTERNAL_OLINE_MAX_SWING = 0.05


def compute_external_oline_multiplier(season: int) -> pd.DataFrame:
    """Rank-to-multiplier: linear around the rank-16.5 median, capped at
    +/-EXTERNAL_OLINE_MAX_SWING at the rank-1/rank-32 extremes. Returns
    multiplier 1.0 for every team (a no-op) when no table is registered for
    this season."""
    ratings = EXTERNAL_OLINE_RANKINGS.get(season)
    if not ratings:
        # An empty pd.DataFrame(columns=[...]) with no data defaults every
        # column to object dtype, which then poisons every downstream
        # multiplication (vegas/dvp/weather * an object-dtype column stays
        # object dtype instead of upcasting to float) all the way through to
        # `final_projection` -- explicit dtypes avoid that silently.
        return pd.DataFrame({"team": pd.Series(dtype=str), "external_oline_multiplier": pd.Series(dtype=float)})
    rows = [{"team": team, "external_oline_multiplier": 1 + (16.5 - rank) / 16.5 * EXTERNAL_OLINE_MAX_SWING}
            for team, rank in ratings.items()]
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# 2. DATA INGESTION
# ---------------------------------------------------------------------------

def _safe_load(loader, *args, label="data", **kwargs) -> pd.DataFrame:
    """nflreadpy hits nflverse's release assets over HTTP; a season that
    hasn't been played yet (or a library version's season-range validator
    lagging real life, as with 2026 `load_rosters_weekly` today) 404s or
    raises. Degrade to an empty frame with a printed warning instead of
    crashing the whole pipeline -- an empty upstream table is exactly the
    cold-start condition this pipeline is designed to absorb."""
    try:
        return loader(*args, **kwargs).to_pandas()
    except Exception as exc:  # noqa: BLE001 - deliberately broad, see above
        print(f"[warn] could not load {label}: {exc}")
        return pd.DataFrame()


def load_current_season_inputs(season: int) -> dict[str, pd.DataFrame]:
    """All 2026-side inputs. `weekly_status_source` records which roster
    endpoint we actually got activity status from, since week-level gameday
    status (`load_rosters_weekly`) may not exist yet for a season that
    hasn't started -- callers must know whether 'ACT' means "active this
    week" or the weaker "on the 53/practice squad as of the season roster"."""
    player_stats = _safe_load(nfl.load_player_stats, [season], label="player_stats")
    schedules = _safe_load(nfl.load_schedules, [season], label="schedules")
    depth_charts = _safe_load(nfl.load_depth_charts, [season], label="depth_charts")
    draft_picks = _safe_load(nfl.load_draft_picks, [season], label="draft_picks")
    pbp = _safe_load(nfl.load_pbp, [season], label="pbp")
    snap_counts = _safe_load(nfl.load_snap_counts, [season], label="snap_counts")
    injuries = _safe_load(nfl.load_injuries, [season], label="injuries")
    ngs_rushing = _safe_load(nfl.load_nextgen_stats, stat_type="rushing", seasons=[season], label="nextgen rushing")
    players = _safe_load(nfl.load_players, label="players crosswalk")

    rosters_weekly = _safe_load(nfl.load_rosters_weekly, [season], label="rosters_weekly")
    weekly_status_source = "rosters_weekly"
    if rosters_weekly.empty:
        rosters_weekly = _safe_load(nfl.load_rosters, [season], label="rosters (season fallback)")
        weekly_status_source = "rosters_season_fallback"
        if not rosters_weekly.empty:
            print("[warn] gameday-level roster status unavailable for "
                  f"{season}; using season-roster status as a proxy for "
                  "'active' until nflverse publishes weekly rosters.")

    return dict(player_stats=player_stats, schedules=schedules,
                depth_charts=depth_charts, draft_picks=draft_picks,
                pbp=pbp, rosters_weekly=rosters_weekly,
                weekly_status_source=weekly_status_source,
                snap_counts=snap_counts, injuries=injuries,
                ngs_rushing=ngs_rushing, players=players)


def load_prior_season_inputs(prior_season: int) -> dict[str, pd.DataFrame]:
    return dict(
        player_stats=_safe_load(nfl.load_player_stats, [prior_season], label="prior player_stats"),
        pbp=_safe_load(nfl.load_pbp, [prior_season], label="prior pbp"),
        ngs_rushing=_safe_load(nfl.load_nextgen_stats, stat_type="rushing", seasons=[prior_season],
                                label="prior nextgen rushing"),
    )


# ---------------------------------------------------------------------------
# 3. SCORING
# ---------------------------------------------------------------------------

def calculate_fantasy_points(df: pd.DataFrame, scoring_format: str = "ppr") -> pd.Series:
    """Vectorized fantasy-point calculation parameterized by league format,
    so the same pipeline serves Standard / Half-PPR / PPR / TE-Premium
    leagues without touching any other function."""
    cfg = SCORING_FORMATS[scoring_format]
    te_extra = np.where(df.get("position", "") == "TE", cfg["te_bonus"], 0.0)
    return (
        df.get("passing_yards", 0).fillna(0) * cfg["pass_yd"]
        + df.get("passing_tds", 0).fillna(0) * cfg["pass_td"]
        + df.get("passing_interceptions", 0).fillna(0) * cfg["interception"]
        + df.get("rushing_yards", 0).fillna(0) * cfg["rush_yd"]
        + df.get("rushing_tds", 0).fillna(0) * cfg["rush_td"]
        + df.get("receptions", 0).fillna(0) * (cfg["rec"] + te_extra)
        + df.get("receiving_yards", 0).fillna(0) * cfg["rec_yd"]
        + df.get("receiving_tds", 0).fillna(0) * cfg["rec_td"]
        + df.get("fumbles_lost_total", 0).fillna(0) * cfg["fumble_lost"]
    )


# ---------------------------------------------------------------------------
# 4. OPPORTUNITY-SHARE FEATURES
# ---------------------------------------------------------------------------

def compute_opportunity_shares(df: pd.DataFrame) -> pd.DataFrame:
    """`target_share`, `wopr` and `air_yards_share` ship pre-computed and
    validated in nflreadpy's `load_player_stats` -- reusing them avoids
    silently reinventing (and possibly mis-deriving) a number the source
    already got right. `carry_share` and QB `pass_attempt_share` are NOT
    provided, so those are the two shares this function actually builds."""
    df = df.copy()
    team_week_carries = df.groupby(["season", "week", "team"])["carries"].transform("sum")
    df["carry_share"] = np.where(team_week_carries > 0, df["carries"] / team_week_carries, 0.0)

    team_week_attempts = df.groupby(["season", "week", "team"])["attempts"].transform("sum")
    df["pass_attempt_share"] = np.where(team_week_attempts > 0, df["attempts"] / team_week_attempts, 0.0)

    df["adot"] = np.where(df["targets"] > 0, df["receiving_air_yards"] / df["targets"], np.nan)
    for col in ["target_share", "wopr", "air_yards_share"]:
        if col not in df.columns:
            df[col] = 0.0
    return df


def compute_redzone_shares(weekly_df: pd.DataFrame, pbp_df: pd.DataFrame) -> pd.DataFrame:
    """Red-zone opportunity share isn't in the weekly stats table at all --
    it has to be derived from play-by-play (yardline_100 <= 20) and merged
    back onto the player-week grain. Red-zone touches predict touchdowns
    (and therefore fantasy spikes) far better than the same volume outside
    the 20."""
    if pbp_df.empty:
        weekly_df = weekly_df.copy()
        weekly_df["rz_target_share"] = 0.0
        weekly_df["rz_carry_share"] = 0.0
        return weekly_df

    rz = pbp_df[(pbp_df["yardline_100"] <= 20) & (pbp_df["yardline_100"] > 0)]

    rz_targets = (
        rz[rz["pass_attempt"] == 1]
        .dropna(subset=["receiver_player_id"])
        .groupby(["season", "week", "receiver_player_id"])
        .size().rename("rz_targets").reset_index()
        .rename(columns={"receiver_player_id": "player_id"})
    )
    team_rz_targets = (
        rz[rz["pass_attempt"] == 1]
        .groupby(["season", "week", "posteam"])
        .size().rename("team_rz_targets").reset_index()
        .rename(columns={"posteam": "team"})
    )
    rz_carries = (
        rz[rz["rush_attempt"] == 1]
        .dropna(subset=["rusher_player_id"])
        .groupby(["season", "week", "rusher_player_id"])
        .size().rename("rz_carries").reset_index()
        .rename(columns={"rusher_player_id": "player_id"})
    )
    team_rz_carries = (
        rz[rz["rush_attempt"] == 1]
        .groupby(["season", "week", "posteam"])
        .size().rename("team_rz_carries").reset_index()
        .rename(columns={"posteam": "team"})
    )

    out = weekly_df.merge(rz_targets, on=["season", "week", "player_id"], how="left")
    out = out.merge(team_rz_targets, on=["season", "week", "team"], how="left")
    out = out.merge(rz_carries, on=["season", "week", "player_id"], how="left")
    out = out.merge(team_rz_carries, on=["season", "week", "team"], how="left")

    for col in ["rz_targets", "team_rz_targets", "rz_carries", "team_rz_carries"]:
        out[col] = out[col].fillna(0.0)

    out["rz_target_share"] = np.where(out["team_rz_targets"] > 0,
                                       out["rz_targets"] / out["team_rz_targets"], 0.0)
    out["rz_carry_share"] = np.where(out["team_rz_carries"] > 0,
                                      out["rz_carries"] / out["team_rz_carries"], 0.0)
    return out.drop(columns=["rz_targets", "team_rz_targets", "rz_carries", "team_rz_carries"])


def compute_snap_share(weekly_df: pd.DataFrame, snap_counts_df: pd.DataFrame,
                        players_df: pd.DataFrame) -> pd.DataFrame:
    """Offensive snap share is a leading indicator opportunity shares can
    miss: a player whose snaps are climbing while target/carry share is
    still flat is often about to see a usage bump the market hasn't priced
    in yet. `load_snap_counts` is keyed by `pfr_player_id`, not the
    `player_id` (gsis_id) grain everything else in this pipeline uses, so
    `load_players`'s id crosswalk is required to join it on."""
    weekly_df = weekly_df.copy()
    if snap_counts_df.empty or players_df.empty:
        weekly_df["snap_share"] = np.nan
        return weekly_df
    crosswalk = players_df[["gsis_id", "pfr_id"]].dropna().rename(
        columns={"gsis_id": "player_id", "pfr_id": "pfr_player_id"})
    snaps = snap_counts_df.merge(crosswalk, on="pfr_player_id", how="left")
    snaps = snaps.dropna(subset=["player_id"])[["player_id", "season", "week", "offense_pct"]]
    snaps = snaps.rename(columns={"offense_pct": "snap_share"})
    return weekly_df.merge(snaps, on=["player_id", "season", "week"], how="left")


def add_rolling_and_expanding(df: pd.DataFrame, share_cols: list[str]) -> pd.DataFrame:
    """For every opportunity-share column, add BOTH a trailing-3-week mean
    and a season-to-date (expanding) mean, each shifted by one week so that
    the value attached to week w only ever uses weeks < w -- the single
    most important anti-leakage guarantee in the whole pipeline, applied
    uniformly whether the column is a passing, rushing, receiving, or
    red-zone share."""
    df = df.sort_values(["player_id", "season", "week"]).copy()
    grouped = df.groupby("player_id")
    for col in share_cols:
        if col not in df.columns:
            continue
        df[f"{col}_r3"] = grouped[col].transform(
            lambda s: s.shift(1).rolling(3, min_periods=1).mean()
        )
        df[f"{col}_exp"] = grouped[col].transform(
            lambda s: s.shift(1).expanding(min_periods=1).mean()
        )
    return df


# ---------------------------------------------------------------------------
# 5. VEGAS GAME SCRIPT, PACE, AND PROE
# ---------------------------------------------------------------------------

def compute_bye_weeks(schedules_df: pd.DataFrame) -> dict[str, int]:
    """Each team's bye week, derived from the regular-season schedule: the
    one week a team has no game on either side of the ball.

    Nothing upstream publishes byes as a field, but the schedule already
    encodes them, and a bye is the single most-checked thing on a ranking
    board -- a player who cannot score this week should never sit in a list
    sorted by expected points without saying so."""
    reg = schedules_df[schedules_df["game_type"] == "REG"]
    if reg.empty:
        return {}

    played = pd.concat([
        reg[["week", "home_team"]].rename(columns={"home_team": "team"}),
        reg[["week", "away_team"]].rename(columns={"away_team": "team"}),
    ])
    all_weeks = set(reg["week"].unique())

    byes: dict[str, int] = {}
    for team, weeks in played.groupby("team")["week"]:
        missing = sorted(all_weeks - set(weeks))
        # Exactly one missing week is a bye. Anything else means the
        # schedule is partial (a mid-season load, an expansion of the
        # format), and guessing would be worse than saying nothing.
        if len(missing) == 1:
            byes[team] = int(missing[0])
    return byes


def compute_team_success_rate(pbp_df: pd.DataFrame, through_week: int) -> dict[str, float]:
    """Team offensive success rate (nflverse's own EPA-based `success` flag
    -- roughly, a play that keeps the offense on schedule), season-to-date
    through the most recently completed week.

    `through_week` is exclusive on purpose: at week w this is what a
    reader deciding on week w already knows, the same "only weeks < w"
    convention `add_rolling_and_expanding` uses elsewhere in this file so a
    displayed stat never leaks the outcome of the week it's supposed to be
    informing."""
    if pbp_df.empty:
        return {}
    plays = pbp_df[(pbp_df["week"] < through_week)
                   & ((pbp_df["pass_attempt"] == 1) | (pbp_df["rush_attempt"] == 1))]
    if plays.empty:
        return {}
    return plays.groupby("posteam")["success"].mean().to_dict()


def compute_vegas_game_script(schedules_df: pd.DataFrame) -> pd.DataFrame:
    """nflverse's `spread_line` is defined as the number of points by which
    the HOME team is favored (positive = home favored, e.g. a 15.5 here
    means the home team is a 15.5-point favorite) -- confirmed empirically
    against moneylines, since this is the opposite sign convention from a
    traditional bookmaker board where the favorite is quoted negative. The
    favored team's implied total is therefore the game total plus half the
    home spread for the home team, minus it for the away team. Produces one
    row per team per week with that team's own implied_total, spread (their
    own signed line), and vegas_multiplier."""
    if schedules_df.empty:
        return pd.DataFrame(columns=["season", "week", "team", "implied_total",
                                      "team_spread", "vegas_multiplier",
                                      "roof", "temp", "wind"])
    home = schedules_df[["season", "week", "home_team", "away_team",
                          "spread_line", "total_line", "roof", "temp", "wind"]].copy()
    home["implied_total"] = home["total_line"] / 2 + home["spread_line"] / 2
    home["team_spread"] = home["spread_line"]
    home = home.rename(columns={"home_team": "team"}).drop(columns=["away_team"])

    away = schedules_df[["season", "week", "home_team", "away_team",
                          "spread_line", "total_line", "roof", "temp", "wind"]].copy()
    away["implied_total"] = away["total_line"] / 2 - away["spread_line"] / 2
    away["team_spread"] = -away["spread_line"]
    away = away.rename(columns={"away_team": "team"}).drop(columns=["home_team"])

    out = pd.concat([home, away], ignore_index=True).drop(columns=["spread_line", "total_line"])
    out["vegas_multiplier"] = out["implied_total"] / VEGAS_BASELINE_TOTAL
    return out


def compute_weather_multiplier(vegas_df: pd.DataFrame) -> pd.DataFrame:
    """Passing games (and kicking) degrade in high wind / weather-exposed
    outdoor venues; a dome or closed roof is weather-neutral by definition.
    Rushing is left untouched -- it is materially weather-insensitive."""
    df = vegas_df.copy()
    is_exposed = ~df["roof"].isin(["dome", "closed"])
    high_wind = is_exposed & (df["wind"].fillna(0) > 15)
    extreme_temp = is_exposed & ((df["temp"].fillna(70) < 20) | (df["temp"].fillna(70) > 95))

    df["weather_multiplier_pass"] = 1.0
    df.loc[high_wind, "weather_multiplier_pass"] *= 0.90
    df.loc[extreme_temp, "weather_multiplier_pass"] *= 0.97
    df["weather_multiplier_rush"] = 1.0
    return df[["season", "week", "team", "weather_multiplier_pass", "weather_multiplier_rush"]]


def _fit_expected_pass_model(pbp_df: pd.DataFrame) -> LogisticRegression | None:
    feats = ["down", "ydstogo", "qtr", "score_differential", "half_seconds_remaining"]
    plays = pbp_df[(pbp_df["pass_attempt"] == 1) | (pbp_df["rush_attempt"] == 1)].dropna(subset=feats)
    if len(plays) < 200:
        return None
    model = LogisticRegression(max_iter=1000)
    model.fit(plays[feats], plays["pass_attempt"].astype(int))
    return model


def compute_proe_features(pbp_df: pd.DataFrame, prior_pbp_df: pd.DataFrame,
                           current_week: int) -> pd.DataFrame:
    """Pass-rate-over-expected (PROE): fit a simple expected-pass model
    (down/distance/score-differential/quarter/clock) on the prior season so
    it captures generic league-wide play-calling tendencies, then measure
    how much each team over- or under-passes that baseline. Positive PROE =
    pass-funnel game script (helps WR/TE, hurts RB volume); negative = run
    funnel. Current-season team PROE is itself cold-start blended against
    the prior-season team PROE using the same logic as everything else."""
    feats = ["down", "ydstogo", "qtr", "score_differential", "half_seconds_remaining"]
    model = _fit_expected_pass_model(prior_pbp_df)
    teams = sorted(set(prior_pbp_df.get("posteam", pd.Series(dtype=str)).dropna()) |
                    set(pbp_df.get("posteam", pd.Series(dtype=str)).dropna()))
    if model is None or not teams:
        return pd.DataFrame({"team": teams, "team_proe_blended": 0.0})

    def team_proe(plays: pd.DataFrame, group_cols: list[str]) -> pd.DataFrame:
        if plays.empty or "pass_attempt" not in plays.columns:
            return pd.DataFrame(columns=group_cols + ["proe"])
        p = plays[(plays["pass_attempt"] == 1) | (plays["rush_attempt"] == 1)].dropna(subset=feats).copy()
        if p.empty:
            return pd.DataFrame(columns=group_cols + ["proe"])
        p["expected_pass"] = model.predict_proba(p[feats])[:, 1]
        p["residual"] = p["pass_attempt"] - p["expected_pass"]
        return p.groupby(group_cols)["residual"].mean().rename("proe").reset_index()

    prior_team_proe = team_proe(prior_pbp_df, ["posteam"]).rename(columns={"posteam": "team", "proe": "prior_proe"})

    current_weekly = team_proe(pbp_df, ["posteam", "week"]).rename(columns={"posteam": "team", "proe": "week_proe"})
    if current_weekly.empty:
        current_weekly = pd.DataFrame(columns=["team", "week", "week_proe"])
    current_weekly = current_weekly.sort_values(["team", "week"])
    current_weekly["current_proe_expanding"] = (
        current_weekly.groupby("team")["week_proe"].transform(lambda s: s.shift(1).expanding(min_periods=1).mean())
    )

    snapshot = (
        current_weekly[current_weekly["week"] == current_week][["team", "current_proe_expanding"]]
        if not current_weekly.empty else pd.DataFrame(columns=["team", "current_proe_expanding"])
    )
    out = pd.DataFrame({"team": teams}).merge(prior_team_proe, on="team", how="left")
    out = out.merge(snapshot, on="team", how="left")
    out["prior_proe"] = out["prior_proe"].fillna(0.0)

    prior_w, model_w = WEEK_BLEND_SCHEDULE.get(current_week, DEFAULT_BLEND)
    out["team_proe_blended"] = (
        prior_w * out["prior_proe"] + model_w * out["current_proe_expanding"].fillna(out["prior_proe"])
    )
    return out[["team", "team_proe_blended"]]


# ---------------------------------------------------------------------------
# 5b. O-LINE CONTEXT (pass-block and run-block proxies, cold-start blended)
# ---------------------------------------------------------------------------
#
# There is no free, reliably-updated O-line grade source (PFF/DVOA-style
# ratings are paid and not automatable), and a preseason snapshot of one
# would face the exact same cold-start problem as everything else here
# anyway. Instead of bolting on a manual/paid rating, this derives two
# equivalent proxies from data already loaded -- a team's pass-block
# quality (pressure rate allowed, from pbp) and run-block quality (rushing
# yards over expected, from Next Gen Stats) -- and blends each from the
# prior season toward the current season on the same schedule as DvP/PROE.
# If a licensed O-line rating source becomes available later, it plugs into
# this same slot: replace the prior-season lookup, keep the blend.

def _team_pressure_rate(pbp_df: pd.DataFrame, group_cols: list[str]) -> pd.DataFrame:
    """Pressure rate allowed by the offense's own line: (sacks + QB hits
    allowed) / dropbacks, at the requested grouping (team, or team+week)."""
    if pbp_df.empty or "sack" not in pbp_df.columns:
        return pd.DataFrame(columns=group_cols + ["pressure_rate"])
    dropbacks = pbp_df[pbp_df["pass_attempt"] == 1].copy()
    if dropbacks.empty:
        return pd.DataFrame(columns=group_cols + ["pressure_rate"])
    dropbacks["pressured"] = ((dropbacks["sack"].fillna(0) == 1) | (dropbacks["qb_hit"].fillna(0) == 1)).astype(int)
    return dropbacks.groupby(group_cols)["pressured"].mean().rename("pressure_rate").reset_index()


def compute_oline_pass_block_context(pbp_df: pd.DataFrame, prior_pbp_df: pd.DataFrame,
                                      current_week: int) -> pd.DataFrame:
    """Team-level pass-block quality, cold-start blended prior -> current
    season exactly like PROE (same class of signal: one team-week of pbp
    feeds the current-season side, so it earns trust at the same pace)."""
    prior_rate = _team_pressure_rate(prior_pbp_df, ["posteam"]).rename(
        columns={"posteam": "team", "pressure_rate": "prior_pressure_rate"})
    league_avg = prior_rate["prior_pressure_rate"].mean() if not prior_rate.empty else 0.20

    current_weekly = _team_pressure_rate(pbp_df, ["posteam", "week"]).rename(columns={"posteam": "team"})
    if current_weekly.empty:
        current_weekly = pd.DataFrame(columns=["team", "week", "pressure_rate"])
    current_weekly = current_weekly.sort_values(["team", "week"])
    current_weekly["current_expanding"] = (
        current_weekly.groupby("team")["pressure_rate"].transform(lambda s: s.shift(1).expanding(min_periods=1).mean())
    )
    snapshot = current_weekly[current_weekly["week"] == current_week][["team", "current_expanding"]]

    teams = sorted(set(prior_rate["team"]) | set(snapshot.get("team", pd.Series(dtype=str))))
    out = pd.DataFrame({"team": teams}).merge(prior_rate, on="team", how="left")
    out["prior_pressure_rate"] = out["prior_pressure_rate"].fillna(league_avg)
    out = out.merge(snapshot, on="team", how="left")

    prior_w, model_w = DVP_BLEND_SCHEDULE.get(current_week, DVP_DEFAULT_BLEND)
    out["team_pressure_rate_allowed_blended"] = (
        prior_w * out["prior_pressure_rate"] + model_w * out["current_expanding"].fillna(out["prior_pressure_rate"])
    )
    return out[["team", "team_pressure_rate_allowed_blended"]]


def compute_run_block_context(ngs_df: pd.DataFrame, prior_ngs_df: pd.DataFrame,
                               current_week: int) -> pd.DataFrame:
    """Team-level run-block quality proxy: rushing yards over expected per
    attempt (NGS), attempt-weighted to the team level. This still contains
    some of an individual back's own vision/burst, but averaged across a
    team's whole rushing corps over a season it is a standard, widely-used
    stand-in for run-blocking quality when a paid O-line grade isn't
    available. Cold-start blended the same way as pass-block context."""
    def team_weighted_oe(df: pd.DataFrame, group_cols: list[str]) -> pd.DataFrame:
        if df.empty or "rush_yards_over_expected_per_att" not in df.columns:
            return pd.DataFrame(columns=group_cols + ["run_block_oe"])
        d = df.dropna(subset=["rush_yards_over_expected_per_att", "rush_attempts"]).copy()
        d["weighted"] = d["rush_yards_over_expected_per_att"] * d["rush_attempts"]
        g = d.groupby(group_cols).agg(weighted=("weighted", "sum"), attempts=("rush_attempts", "sum")).reset_index()
        g["run_block_oe"] = np.where(g["attempts"] > 0, g["weighted"] / g["attempts"], 0.0)
        return g[group_cols + ["run_block_oe"]]

    prior_ngs = prior_ngs_df.rename(columns={"team_abbr": "team"}) if not prior_ngs_df.empty else prior_ngs_df
    if prior_ngs is not None and not prior_ngs.empty:
        prior_ngs["team"] = normalize_team_codes(prior_ngs["team"])
    prior_rate = team_weighted_oe(prior_ngs, ["team"]).rename(columns={"run_block_oe": "prior_run_block_oe"})
    league_avg = prior_rate["prior_run_block_oe"].mean() if not prior_rate.empty else 0.0

    current_ngs = ngs_df.rename(columns={"team_abbr": "team"}) if not ngs_df.empty else ngs_df
    if current_ngs is not None and not current_ngs.empty:
        current_ngs["team"] = normalize_team_codes(current_ngs["team"])
    current_weekly = team_weighted_oe(current_ngs, ["team", "week"])
    if current_weekly.empty:
        current_weekly = pd.DataFrame(columns=["team", "week", "run_block_oe"])
    current_weekly = current_weekly.sort_values(["team", "week"])
    current_weekly["current_expanding"] = (
        current_weekly.groupby("team")["run_block_oe"].transform(lambda s: s.shift(1).expanding(min_periods=1).mean())
    )
    snapshot = current_weekly[current_weekly["week"] == current_week][["team", "current_expanding"]]

    teams = sorted(set(prior_rate["team"]) | set(snapshot.get("team", pd.Series(dtype=str))))
    out = pd.DataFrame({"team": teams}).merge(prior_rate, on="team", how="left")
    out["prior_run_block_oe"] = out["prior_run_block_oe"].fillna(league_avg)
    out = out.merge(snapshot, on="team", how="left")

    prior_w, model_w = DVP_BLEND_SCHEDULE.get(current_week, DVP_DEFAULT_BLEND)
    out["team_run_block_oe_blended"] = (
        prior_w * out["prior_run_block_oe"] + model_w * out["current_expanding"].fillna(out["prior_run_block_oe"])
    )
    return out[["team", "team_run_block_oe_blended"]]


# ---------------------------------------------------------------------------
# 6. DEFENSE VS. POSITION (DvP)
# ---------------------------------------------------------------------------

def compute_dvp_features(current_weekly_df: pd.DataFrame, prior_weekly_df: pd.DataFrame,
                          current_week: int, scoring_format: str) -> pd.DataFrame:
    """Points a defense allows to a position, itself cold-start blended
    from the prior season toward the current season as weeks accumulate --
    a single week of current-season DvP sample is noisy, so it needs the
    same treatment as a player's own box score, just on a faster schedule
    (32 offensive players feed one team-week DvP number vs. one player
    feeding one player-week box score)."""
    # "Points allowed to a position" is a PER-GAME TOTAL (summed across every
    # player at that position who faced the defense that week), not a
    # per-player average -- summing first, then averaging across weeks, on
    # both the prior-season baseline and the current-season side below is
    # what keeps the two numbers on the same scale.
    prior = prior_weekly_df[prior_weekly_df["position"].isin(POSITIONS)].copy()
    prior["fantasy_points"] = calculate_fantasy_points(prior, scoring_format)
    prior_weekly_allowed = (
        prior.groupby(["opponent_team", "position", "week"])["fantasy_points"]
        .sum().rename("pts_allowed").reset_index()
    )
    prior_dvp = prior_weekly_allowed.groupby(["opponent_team", "position"])["pts_allowed"].mean().rename(
        "prior_pts_allowed").reset_index().rename(columns={"opponent_team": "team"})
    league_avg = prior_weekly_allowed.groupby("position")["pts_allowed"].mean().rename("league_avg_pts").reset_index()

    current = current_weekly_df[current_weekly_df["position"].isin(POSITIONS)].copy()
    if current.empty:
        current_expanding = pd.DataFrame(columns=["team", "position", "current_dvp_expanding"])
    else:
        current["fantasy_points"] = calculate_fantasy_points(current, scoring_format)
        weekly_allowed = (
            current.groupby(["opponent_team", "position", "week"])["fantasy_points"]
            .sum().rename("pts_allowed").reset_index()
            .rename(columns={"opponent_team": "team"})
            .sort_values(["team", "position", "week"])
        )
        weekly_allowed["current_dvp_expanding"] = (
            weekly_allowed.groupby(["team", "position"])["pts_allowed"]
            .transform(lambda s: s.shift(1).expanding(min_periods=1).mean())
        )
        current_expanding = weekly_allowed[weekly_allowed["week"] == current_week][
            ["team", "position", "current_dvp_expanding"]
        ]

    teams = sorted(set(prior_dvp["team"]) | set(current_expanding.get("team", pd.Series(dtype=str))))
    grid = pd.MultiIndex.from_product([teams, POSITIONS], names=["team", "position"]).to_frame(index=False)
    out = grid.merge(prior_dvp, on=["team", "position"], how="left")
    out = out.merge(league_avg, on="position", how="left")
    out = out.merge(current_expanding, on=["team", "position"], how="left")
    out["prior_pts_allowed"] = out["prior_pts_allowed"].fillna(out["league_avg_pts"])

    prior_w, model_w = DVP_BLEND_SCHEDULE.get(current_week, DVP_DEFAULT_BLEND)
    out["blended_pts_allowed"] = (
        prior_w * out["prior_pts_allowed"]
        + model_w * out["current_dvp_expanding"].fillna(out["prior_pts_allowed"])
    )
    out["dvp_multiplier"] = out["blended_pts_allowed"] / out["league_avg_pts"]
    return out[["team", "position", "dvp_multiplier"]]


# ---------------------------------------------------------------------------
# 7. OFFSEASON / ROOKIE PRIORS
# ---------------------------------------------------------------------------

def compute_td_luck(prior_weekly_df: pd.DataFrame, prior_pbp_df: pd.DataFrame) -> pd.DataFrame:
    """A player's expected touchdowns computed from HIS OWN TEAM's actual
    red-zone TD production, split by his share of that team's red-zone
    targets/carries -- deliberately NOT a flat league-wide conversion rate.
    That distinction matters: a flat league rate would flag a receiver on a
    run-first, low-scoring offense as 'unlucky' when the real story is his
    team just doesn't score many TDs at all (a team-quality signal, already
    captured elsewhere via Vegas implied_total), not personal misfortune.
    Conditioning on the team's own red-zone scoring nets that out, so the
    resulting `td_luck` isolates the part that's plausibly random variance
    -- actual TDs above or below what his own team's red-zone scoring,
    distributed by his own usage share, would predict."""
    if prior_pbp_df.empty:
        return pd.DataFrame(columns=["player_id", "td_luck"])

    rz = prior_pbp_df[(prior_pbp_df["yardline_100"] <= 20) & (prior_pbp_df["yardline_100"] > 0)]
    rz_pass = rz[rz["pass_attempt"] == 1]
    rz_rush = rz[rz["rush_attempt"] == 1]

    team_rz_pass_tds = rz_pass[rz_pass["touchdown"] == 1].groupby("posteam").size().rename("team_rz_pass_tds")
    team_rz_rush_tds = rz_rush[rz_rush["touchdown"] == 1].groupby("posteam").size().rename("team_rz_rush_tds")
    team_rz_targets = rz_pass.groupby("posteam").size().rename("team_rz_targets")
    team_rz_carries = rz_rush.groupby("posteam").size().rename("team_rz_carries")

    player_rz_targets = (rz_pass.dropna(subset=["receiver_player_id"])
                          .groupby(["posteam", "receiver_player_id"]).size().rename("player_rz_targets")
                          .reset_index().rename(columns={"receiver_player_id": "player_id"}))
    player_rz_carries = (rz_rush.dropna(subset=["rusher_player_id"])
                          .groupby(["posteam", "rusher_player_id"]).size().rename("player_rz_carries")
                          .reset_index().rename(columns={"rusher_player_id": "player_id"}))

    usage = player_rz_targets.merge(player_rz_carries, on=["posteam", "player_id"], how="outer")
    usage[["player_rz_targets", "player_rz_carries"]] = usage[["player_rz_targets", "player_rz_carries"]].fillna(0.0)
    usage = usage.merge(team_rz_pass_tds, on="posteam", how="left").merge(team_rz_rush_tds, on="posteam", how="left")
    usage = usage.merge(team_rz_targets, on="posteam", how="left").merge(team_rz_carries, on="posteam", how="left")
    usage = usage.fillna(0.0)

    usage["expected_tds"] = (
        np.where(usage["team_rz_targets"] > 0, usage["player_rz_targets"] / usage["team_rz_targets"], 0.0) * usage["team_rz_pass_tds"]
        + np.where(usage["team_rz_carries"] > 0, usage["player_rz_carries"] / usage["team_rz_carries"], 0.0) * usage["team_rz_rush_tds"]
    )

    actual_tds = prior_weekly_df.groupby("player_id").agg(
        actual_tds=("receiving_tds", "sum"), rushing_tds=("rushing_tds", "sum")
    ).reset_index()
    actual_tds["actual_tds"] = actual_tds["actual_tds"].fillna(0) + actual_tds["rushing_tds"].fillna(0)

    out = usage.groupby("player_id")["expected_tds"].sum().reset_index().merge(actual_tds, on="player_id", how="outer")
    out[["expected_tds", "actual_tds"]] = out[["expected_tds", "actual_tds"]].fillna(0.0)
    out["td_luck"] = out["actual_tds"] - out["expected_tds"]
    return out[["player_id", "td_luck"]]


# TD rate is well known to be far noisier year-over-year than target/carry
# share, so only regress PART of the observed luck back toward expectation
# rather than fully erasing it -- some players really are more red-zone/
# TD-efficient (size, QB rapport, goal-line role) and that skill component
# shouldn't be regressed away along with the noise.
TD_LUCK_REGRESSION_FRACTION = 0.5
POINTS_PER_TD = 6  # rec_td and rush_td are both worth 6 in every SCORING_FORMATS entry


def build_offseason_priors(prior_weekly_df: pd.DataFrame, prior_pbp_df: pd.DataFrame,
                            scoring_format: str) -> pd.DataFrame:
    """One row per player_id summarizing their ENTIRE prior season: PPG plus
    average opportunity shares. This is the sole source of signal for a
    player at Week 1, when there is no current-season sample at all.
    `offseason_prior_ppg` is nudged by TD-luck regression (see
    `compute_td_luck`): a player who scored well below his own team's
    red-zone-usage-implied expectation gets a small upward adjustment for
    next season, and vice versa for a player who overperformed."""
    df = prior_weekly_df[prior_weekly_df["position"].isin(POSITIONS)].copy()
    df = compute_opportunity_shares(df)
    df["fantasy_points"] = calculate_fantasy_points(df, scoring_format)
    priors = df.groupby("player_id").agg(
        offseason_prior_ppg=("fantasy_points", "mean"),
        prior_target_share=("target_share", "mean"),
        prior_carry_share=("carry_share", "mean"),
        prior_pass_attempt_share=("pass_attempt_share", "mean"),
        prior_wopr=("wopr", "mean"),
        prior_adot=("adot", "mean"),
        games_played=("week", "nunique"),
    ).reset_index()

    td_luck = compute_td_luck(prior_weekly_df, prior_pbp_df)
    priors = priors.merge(td_luck, on="player_id", how="left")
    priors["td_luck"] = priors["td_luck"].fillna(0.0)
    luck_points_per_game = np.where(
        priors["games_played"] > 0,
        (priors["td_luck"] * POINTS_PER_TD) / priors["games_played"].clip(lower=1),
        0.0,
    )
    priors["offseason_prior_ppg"] = priors["offseason_prior_ppg"] - TD_LUCK_REGRESSION_FRACTION * luck_points_per_game
    return priors


def build_rookie_priors(draft_picks_df: pd.DataFrame) -> pd.DataFrame:
    """Rookie baseline PPG keyed off actual draft capital -- Day 3/UDFA
    rookies fall back to REPLACEMENT_LEVEL_PPG via the caller's fillna,
    since undrafted players never appear in `load_draft_picks` at all."""
    if draft_picks_df.empty:
        return pd.DataFrame(columns=["player_id", "rookie_prior_ppg"])
    df = draft_picks_df[draft_picks_df["position"].isin(POSITIONS)].copy()
    df["round_bucket"] = np.where(df["round"] <= 3, df["round"], "day3")

    def lookup(row):
        return ROOKIE_BASELINES.get(row["position"], {}).get(row["round_bucket"],
                                                              REPLACEMENT_LEVEL_PPG.get(row["position"], 3.0))

    df["rookie_prior_ppg"] = df.apply(lookup, axis=1)
    return df.rename(columns={"gsis_id": "player_id"})[["player_id", "rookie_prior_ppg"]]


def merge_priors_to_roster(active_roster_df: pd.DataFrame, offseason_priors: pd.DataFrame,
                            rookie_priors: pd.DataFrame) -> pd.DataFrame:
    """Left-join priors onto the current active roster. Precedence: real
    2025 stats > rookie draft-capital baseline > position replacement level
    (for UDFAs/street free agents with neither)."""
    out = active_roster_df.merge(offseason_priors, on="player_id", how="left")
    out = out.merge(rookie_priors, on="player_id", how="left")

    has_prior = out["offseason_prior_ppg"].notna()
    has_rookie = out["rookie_prior_ppg"].notna()
    out["offseason_prior_ppg"] = np.select(
        [has_prior, has_rookie],
        [out["offseason_prior_ppg"], out["rookie_prior_ppg"]],
        default=out["position"].map(REPLACEMENT_LEVEL_PPG).fillna(3.0),
    )
    replacement_share = out["position"].map(REPLACEMENT_LEVEL_SHARE).fillna(0.03)
    for col in ["prior_target_share", "prior_carry_share", "prior_pass_attempt_share", "prior_wopr"]:
        out[col] = out[col].fillna(replacement_share)
    out["prior_adot"] = out["prior_adot"].fillna(8.0)
    out["games_played"] = out["games_played"].fillna(0)
    return out.drop(columns=["rookie_prior_ppg"])


def apply_qb_depth_chart_status(base_df: pd.DataFrame, depth_charts_df: pd.DataFrame) -> pd.DataFrame:
    """QB is a hard single-starter position: unlike WR2/WR3 or RB2, a
    backup QB behind a healthy starter gets essentially zero snaps most
    weeks. But `offseason_prior_ppg` is built purely from a player's OWN
    games last season, with no idea who's starting THIS year -- a veteran
    who started for a different team last year (e.g. a since-benched
    free-agent signing) would otherwise carry that PPG forward into a
    clipboard-holder role and get ranked as if he were playing. This looks
    up the CURRENT depth chart to find each team's actual starter (lowest
    pos_rank) and, only when that starter is confirmed active this week,
    caps every other same-team QB's prior at replacement level. If the
    starter is inactive, the backup is left alone -- they're the one
    actually playing, and `apply_vacated_share` handles their opportunity
    boost from there."""
    df = base_df.copy()
    if depth_charts_df.empty or "pos_abb" not in depth_charts_df.columns:
        return df
    dc = depth_charts_df[depth_charts_df["pos_abb"] == "QB"].copy().rename(columns={"gsis_id": "player_id"})
    if dc.empty:
        return df
    dc = dc.sort_values("dt").drop_duplicates(subset=["team", "player_id"], keep="last")
    dc = dc.sort_values(["team", "pos_rank"])

    status = df.set_index("player_id")["roster_status"]
    starters = dc.groupby("team").first().reset_index()[["team", "player_id"]]
    starters["starter_active"] = starters["player_id"].map(status).eq("ACT")
    active_starter_teams = set(starters.loc[starters["starter_active"], "team"])

    backups = dc[dc["pos_rank"] > 1]
    suppress_ids = set(backups.loc[backups["team"].isin(active_starter_teams), "player_id"])
    is_suppressed = df["player_id"].isin(suppress_ids)

    df.loc[is_suppressed, "offseason_prior_ppg"] = np.minimum(
        df.loc[is_suppressed, "offseason_prior_ppg"], NON_STARTING_QB_PPG)
    for col in ["prior_pass_attempt_share", "prior_carry_share", "prior_wopr"]:
        if col in df.columns:
            df.loc[is_suppressed, col] = np.minimum(df.loc[is_suppressed, col], NON_STARTING_QB_SHARE)
    return df


def compute_prior_usage_rank(prior_weekly_df: pd.DataFrame) -> pd.DataFrame:
    """Where a player ranked on HIS OWN team last season by actual usage
    share (1 = the team's leader at that position) -- e.g. the WR who led
    the team in target share was that team's #1 receiver by usage,
    regardless of what the depth chart said. This is the "before" side of
    the role-change comparison in `apply_depth_chart_role_change`; it is
    deliberately keyed only by player_id + position, not by team, since a
    player who changed teams in free agency should still carry forward
    what his usage rank WAS, to compare against wherever he lands now."""
    df = prior_weekly_df[prior_weekly_df["position"].isin(POSITIONS)].copy()
    df = compute_opportunity_shares(df)
    rows = []
    for pos in POSITIONS:
        share_col = "carry_share" if pos == "RB" else ("pass_attempt_share" if pos == "QB" else "target_share")
        pos_df = df[df["position"] == pos]
        season_avg = pos_df.groupby(["team", "player_id"]).agg(
            season_share=(share_col, "mean"), weeks=("week", "nunique")).reset_index()
        season_avg["prior_usage_rank"] = season_avg.groupby("team")["season_share"].rank(ascending=False, method="first")
        season_avg["position"] = pos
        # A player traded mid-season has one row per team here; keep only
        # his primary team (the one he played the most games for) so this
        # stays one row per player_id+position -- otherwise the merge in
        # apply_depth_chart_role_change fans a traded player's base row out
        # into duplicates, one per former team, corrupting every downstream
        # count and ranking for that player.
        season_avg = season_avg.sort_values("weeks", ascending=False).drop_duplicates(
            subset=["player_id", "position"], keep="first")
        rows.append(season_avg[["player_id", "position", "prior_usage_rank"]])
    return pd.concat(rows, ignore_index=True)


def apply_depth_chart_role_change(base_df: pd.DataFrame, depth_charts_df: pd.DataFrame,
                                   prior_usage_rank_df: pd.DataFrame) -> pd.DataFrame:
    """WR/RB/TE version of the same idea behind the QB starter fix: compare
    a player's CURRENT depth-chart rank on his team to where his own usage
    ranked him last season. A drop (e.g. was the team's #1 receiver by
    target share, now depth-chart #2 behind a new addition) dampens his
    prior; a rise boosts it (less aggressively -- an on-paper promotion
    hasn't been proven in real games yet). Only fires when BOTH numbers
    exist (a player with no prior-season usage, e.g. a rookie, is already
    fully handled by the draft-capital rookie baseline and is left alone
    here to avoid double-adjusting)."""
    df = base_df.copy()
    if depth_charts_df.empty or "pos_abb" not in depth_charts_df.columns:
        return df
    dc = depth_charts_df[depth_charts_df["pos_abb"].isin(["WR", "RB", "TE"])].copy()
    if dc.empty:
        return df
    dc = dc.rename(columns={"gsis_id": "player_id"})
    # Keep exactly one row per player_id (his most recent team/rank): a
    # player who changed teams WITHIN the depth-chart window (a
    # mid-window signing or cut) would otherwise still have one row per
    # former team, and merging that onto `df` on player_id+position alone
    # would fan his base row out into duplicates -- the same bug class as
    # the one fixed in compute_prior_usage_rank, just on the "after" side.
    dc = dc.sort_values("dt").drop_duplicates(subset=["player_id"], keep="last")
    current_rank = dc[["player_id", "pos_abb", "pos_rank"]].rename(
        columns={"pos_abb": "position", "pos_rank": "current_depth_rank"})

    df = df.merge(prior_usage_rank_df, on=["player_id", "position"], how="left")
    df = df.merge(current_rank, on=["player_id", "position"], how="left")

    has_both = df["prior_usage_rank"].notna() & df["current_depth_rank"].notna()
    rank_delta = np.where(has_both, df["current_depth_rank"] - df["prior_usage_rank"], 0.0)
    # positive delta = dropped in the pecking order (dampen); negative = rose (boost)
    swing = np.clip(rank_delta * DEPTH_RANK_CHANGE_PER_SLOT, -MAX_DEPTH_RANK_BOOST, MAX_DEPTH_RANK_DAMPEN)
    df["depth_rank_change_multiplier"] = np.where(has_both, 1 - swing, 1.0)

    for col in ["offseason_prior_ppg", "prior_target_share", "prior_carry_share", "prior_wopr"]:
        if col in df.columns:
            df[col] = df[col] * df["depth_rank_change_multiplier"]
    return df.drop(columns=["prior_usage_rank", "current_depth_rank", "depth_rank_change_multiplier"])


# ---------------------------------------------------------------------------
# 8. ROSTER STATUS & INJURY VACATED SHARE
# ---------------------------------------------------------------------------

def get_active_roster(rosters_weekly_df: pd.DataFrame, season: int, week: int,
                       weekly_status_source: str) -> pd.DataFrame:
    """Definitive 'is this player active on gameday' check. Falls back to
    season-roster status when true weekly gameday status doesn't exist yet
    for this season (see load_current_season_inputs)."""
    df = rosters_weekly_df.copy()
    if weekly_status_source == "rosters_weekly" and "week" in df.columns:
        df = df[(df["season"] == season) & (df["week"] == week)]
    else:
        df = df[df["season"] == season] if "season" in df.columns else df
    df = df[df["position"].isin(POSITIONS)]
    df = df.rename(columns={"gsis_id": "player_id", "full_name": "player_name"})
    df["team"] = normalize_team_codes(df["team"])
    df["roster_status"] = np.where(df["status"] == "ACT", "ACT", "INACTIVE")
    keep = ["player_id", "player_name", "position", "team", "roster_status"]
    return df[keep].drop_duplicates(subset=["player_id"])


def compute_vacated_share_elasticity(prior_weekly_df: pd.DataFrame) -> dict[str, float]:
    """League-wide 'next man up' elasticity, estimated once from the prior
    season: for each team-position, find weeks the season's primary
    (highest target/carry share) player recorded ~0 usage, and measure how
    much of that player's typical share the next-most-used teammate picked
    up in those specific weeks vs. their own normal share. Returns a
    fraction in [0, 1] per position (share of the missing starter's
    average opportunity that gets absorbed by the top backup)."""
    df = prior_weekly_df[prior_weekly_df["position"].isin(POSITIONS)].copy()
    df = compute_opportunity_shares(df)
    elasticities = {}
    for pos in POSITIONS:
        share_col = "carry_share" if pos in ("RB",) else "target_share"
        pos_df = df[df["position"] == pos]
        season_avg = pos_df.groupby(["team", "player_id"])[share_col].mean().rename("season_share").reset_index()
        season_avg["rank"] = season_avg.groupby("team")["season_share"].rank(ascending=False, method="first")
        starters = season_avg[season_avg["rank"] == 1][["team", "player_id"]].rename(columns={"player_id": "starter_id"})
        backups = season_avg[season_avg["rank"] == 2][["team", "player_id", "season_share"]].rename(
            columns={"player_id": "backup_id", "season_share": "backup_normal_share"})

        merged = starters.merge(backups, on="team", how="inner")
        deltas = []
        for _, row in merged.iterrows():
            starter_weeks = pos_df[pos_df["player_id"] == row["starter_id"]]
            missed_weeks = starter_weeks.loc[starter_weeks[share_col] < 0.01, "week"]
            if missed_weeks.empty:
                continue
            backup_weeks = pos_df[(pos_df["player_id"] == row["backup_id"]) & (pos_df["week"].isin(missed_weeks))]
            if backup_weeks.empty:
                continue
            elevated_share = backup_weeks[share_col].mean()
            starter_typical = starter_weeks.loc[starter_weeks[share_col] >= 0.01, share_col].mean()
            if pd.notna(starter_typical) and starter_typical > 0:
                deltas.append(np.clip((elevated_share - row["backup_normal_share"]) / starter_typical, 0, 1))
        elasticities[pos] = float(np.mean(deltas)) if deltas else 0.4  # sane literature-consistent default
    return elasticities


def apply_vacated_share(feature_df: pd.DataFrame, active_roster_df: pd.DataFrame,
                         depth_charts_df: pd.DataFrame, elasticities: dict[str, float]) -> pd.DataFrame:
    """When the top-of-depth-chart player at a team/position is inactive,
    transfer a fraction (the elasticity computed above) of their
    season-to-date opportunity share onto the next-ranked healthy player's
    expanding-share features, so the backup's projection reflects real
    'next man up' usage instead of being computed as if nothing changed."""
    df = feature_df.copy()
    if depth_charts_df.empty:
        return df
    dc = depth_charts_df.copy().rename(columns={"gsis_id": "player_id"})
    dc = dc[dc["pos_abb"].notna()]
    dc = dc.sort_values("dt").drop_duplicates(subset=["team", "player_id"], keep="last")
    # `pos_abb` carries the actual position label ("QB", "RB", "WR", ...);
    # `pos_grp` is a defensive-scheme label ("Base 4-3 D", "3WR 1TE", ...)
    # and never equals "QB"/"RB"/"WR"/"TE" -- filtering on it made this
    # function a silent no-op for every position, every week.
    dc = dc.sort_values(["team", "pos_abb", "pos_rank"])

    status = active_roster_df.set_index("player_id")["roster_status"]

    for pos in POSITIONS:
        share_cols = (["carry_share_exp", "carry_share_r3"] if pos == "RB"
                      else ["pass_attempt_share_exp", "pass_attempt_share_r3"] if pos == "QB"
                      else ["target_share_exp", "target_share_r3"])
        pos_depth = dc[dc["pos_abb"] == pos]
        if pos_depth.empty:
            continue
        for team, group in pos_depth.groupby("team"):
            ranked = group.sort_values("pos_rank")["player_id"].tolist()
            if len(ranked) < 2:
                continue
            starter_id = ranked[0]
            if status.get(starter_id, "ACT") == "ACT":
                continue  # starter healthy, nothing to redistribute
            backup_id = ranked[1]
            elasticity = elasticities.get(pos, 0.4)
            starter_rows = df[df["player_id"] == starter_id]
            if starter_rows.empty:
                continue
            for col in share_cols:
                if col not in df.columns:
                    continue
                starter_share = starter_rows[col].iloc[0]
                if pd.isna(starter_share):
                    continue
                boost = elasticity * starter_share
                df.loc[df["player_id"] == backup_id, col] = df.loc[df["player_id"] == backup_id, col].fillna(0) + boost
    return df


def compute_playing_probability(injuries_df: pd.DataFrame, week: int) -> pd.DataFrame:
    """Wed/Thu/Fri practice-report signal, converted to a continuous
    probability-of-playing instead of the roster_status hard ACT/INACTIVE
    cutoff -- official gameday inactives aren't published until ~90 minutes
    before kickoff, so for most of the week this practice report is the
    *only* signal available, and 'Questionable, DNP Friday' should scale a
    projection down far more than 'Questionable, Full Friday' even though
    both carry the same injury-report label. Players with no report at all
    are assumed fully healthy (probability 1.0)."""
    if injuries_df.empty:
        return pd.DataFrame(columns=["player_id", "playing_probability", "injury_status"])
    df = injuries_df[injuries_df["week"] == week].copy()
    if df.empty:
        return pd.DataFrame(columns=["player_id", "playing_probability", "injury_status"])

    def prob(row) -> float:
        report = REPORT_STATUS_PROB.get(row["report_status"])
        if report is not None:
            return report
        return PRACTICE_STATUS_PROB.get(row["practice_status"], 0.85)

    df["playing_probability"] = df.apply(prob, axis=1)
    # The label itself is carried alongside the probability, not just folded
    # into it. They answer different questions: the probability scales the
    # projection, but a reader setting a lineup still wants to see the word
    # "Questionable" -- and a 0.8 multiplier doesn't say that on its own.
    df = df.rename(columns={"gsis_id": "player_id", "report_status": "injury_status"})
    return (
        df[["player_id", "playing_probability", "injury_status"]]
        .drop_duplicates(subset="player_id")
    )


# ---------------------------------------------------------------------------
# 9. ML MODELING
# ---------------------------------------------------------------------------

def build_training_and_prediction_frames(feature_df: pd.DataFrame, current_week: int,
                                          position: str, scoring_format: str):
    """Rows with week < current_week and non-null trailing features are
    valid (features_w, actual_points_w) training pairs -- week 1 rows are
    excluded from training since they have no lagged history at all (that
    IS the cold-start problem; it's why the Bayesian blend exists). The
    prediction frame is each active player's most recent feature snapshot,
    representing "entering current_week"."""
    cols = POSITION_FEATURES[position]
    pos_df = feature_df[feature_df["position"] == position].copy()
    pos_df["fantasy_points"] = calculate_fantasy_points(pos_df, scoring_format)

    train = pos_df[(pos_df["week"] < current_week)].dropna(subset=cols)
    predict = (
        pos_df[pos_df["week"] == current_week - 1]
        .sort_values("week")
        .drop_duplicates(subset="player_id", keep="last")
    )
    return train, predict, cols


def train_position_models(feature_df: pd.DataFrame, current_week: int, scoring_format: str):
    """Ridge(alpha=1.0) per position, trained only on that position's own
    opportunity features -- keeps each regression well-conditioned on a
    handful of genuinely related columns instead of one giant collinear
    feature bank shared across positions."""
    models, predictions = {}, {}
    for pos in POSITIONS:
        train, predict, cols = build_training_and_prediction_frames(feature_df, current_week, pos, scoring_format)
        if len(train) < MIN_TRAINING_ROWS or predict.empty:
            print(f"[info] {pos}: only {len(train)} trainable rows (< {MIN_TRAINING_ROWS}); "
                  "skipping ML this week, projections lean on the offseason prior.")
            models[pos] = None
            predictions[pos] = predict.assign(model_raw_pred=0.0, model_trained=False) if not predict.empty else predict
            continue
        model = Ridge(alpha=1.0)
        model.fit(train[cols], train["fantasy_points"])
        models[pos] = model
        pred_df = predict.copy()
        pred_df["model_raw_pred"] = model.predict(pred_df[cols].fillna(0.0))
        pred_df["model_trained"] = True
        predictions[pos] = pred_df
    return models, predictions


def train_quantile_models(feature_df: pd.DataFrame, current_week: int, scoring_format: str,
                           predictions: dict[str, pd.DataFrame]) -> dict[str, pd.DataFrame]:
    """10th/50th/90th percentile GradientBoostingRegressor per position for
    a real floor/median/ceiling range (not just a point estimate), plus a
    volatility_score = ceiling - floor for boom/bust identification."""
    for pos in POSITIONS:
        train, _, cols = build_training_and_prediction_frames(feature_df, current_week, pos, scoring_format)
        pred_df = predictions[pos]
        if len(train) < MIN_TRAINING_ROWS or pred_df.empty:
            if not pred_df.empty:
                pred_df["floor_pred"] = pred_df["model_raw_pred"] * 0.6
                pred_df["ceiling_pred"] = pred_df["model_raw_pred"] * 1.4
                pred_df["volatility_score"] = pred_df["ceiling_pred"] - pred_df["floor_pred"]
            continue
        for q, name in [(0.1, "floor_pred"), (0.9, "ceiling_pred")]:
            gbm = GradientBoostingRegressor(loss="quantile", alpha=q, n_estimators=100,
                                             max_depth=2, random_state=42)
            gbm.fit(train[cols], train["fantasy_points"])
            pred_df[name] = gbm.predict(pred_df[cols].fillna(0.0))
        # A 10th-percentile WR/TE week can genuinely be a real bust (near
        # zero catches), but fantasy scoring is displayed as non-negative,
        # so clip the floor at 0 after ordering it below the point estimate.
        pred_df["floor_pred"] = np.maximum(0.0, np.minimum(pred_df["floor_pred"], pred_df["model_raw_pred"]))
        pred_df["ceiling_pred"] = np.maximum(pred_df["ceiling_pred"], pred_df["model_raw_pred"])
        pred_df["volatility_score"] = pred_df["ceiling_pred"] - pred_df["floor_pred"]
        predictions[pos] = pred_df
    return predictions


# ---------------------------------------------------------------------------
# 10. BAYESIAN BLENDING
# ---------------------------------------------------------------------------

def blend_projections(row: pd.Series, current_week: int) -> float:
    """Week 1: 100% prior / 0% model. Week 2: 60/40. Week 3: 30/70.
    Week 4+: 0/100 -- UNLESS this position's model was skipped this week for
    insufficient training sample (`model_trained` False), in which case the
    schedule is overridden to 100% prior regardless of week: falling back
    to the schedule's nominal 0% prior weight would silently zero out every
    projection for that position instead of actually leaning on the prior,
    as the skip message promises. The blended base is then scaled by every
    contextual multiplier (Vegas, opponent DvP, weather) before
    roster-status zeroing."""
    if row.get("model_trained", False):
        prior_weight, model_weight = WEEK_BLEND_SCHEDULE.get(current_week, DEFAULT_BLEND)
    else:
        prior_weight, model_weight = 1.0, 0.0
    base = prior_weight * row["offseason_prior_ppg"] + model_weight * row.get("model_raw_pred", 0.0)
    multiplier = row.get("vegas_multiplier", 1.0) * row.get("dvp_multiplier", 1.0) * row.get("weather_multiplier", 1.0)
    return base * multiplier


def assign_confidence_tier(df: pd.DataFrame, current_week: int) -> pd.Series:
    """High/Medium/Low confidence based on (a) how many current-season
    weeks of real sample the player has -- early weeks are capped below
    High regardless of what the model says, since the number is still
    mostly prior-driven -- and (b) RELATIVE volatility (floor-to-ceiling
    spread divided by the projection itself) relative to positional peers.
    Using the ratio rather than the raw point spread matters: a star with a
    naturally larger point total also has a naturally wider absolute
    floor-ceiling range than a replacement-level bench player sitting near
    zero, so ranking on absolute volatility_score would mislabel every star
    as "low confidence" simply for scoring more, not for being less
    predictable."""
    tier_rank = {"Low": 0, "Medium": 1, "High": 2}
    max_tier = "Medium" if current_week <= 2 else "High"

    relative_volatility = df["volatility_score"] / df["final_projection"].clip(lower=1.0)
    vol_pct = relative_volatility.groupby(df["position"]).rank(pct=True, na_option="bottom")
    base_tier = np.select([vol_pct <= 0.33, vol_pct <= 0.66], ["High", "Medium"], default="Low")

    capped = np.minimum(pd.Series(base_tier).map(tier_rank), tier_rank[max_tier])
    inv_map = {v: k for k, v in tier_rank.items()}
    return capped.map(inv_map)


# ---------------------------------------------------------------------------
# 11. EVALUATION
# ---------------------------------------------------------------------------

def positional_spearman_correlation(df: pd.DataFrame) -> pd.DataFrame:
    """Clean per-position Spearman correlation between `final_projection`
    and `actual_points`, computed via a plain loop over
    `groupby(..., observed=True)` groups (never `.apply` on a groupby
    object), which sidesteps pandas' groupby-apply column-inclusion
    deprecation warning entirely."""
    rows = []
    for pos, group in df.groupby("position", observed=True):
        group = group.dropna(subset=["final_projection", "actual_points"])
        if len(group) < 3:
            rows.append({"position": pos, "n": len(group), "spearman_r": np.nan})
            continue
        corr, _ = spearmanr(group["final_projection"], group["actual_points"])
        rows.append({"position": pos, "n": len(group), "spearman_r": corr})
    return pd.DataFrame(rows)


def compute_vorp(df: pd.DataFrame, value_col: str = "final_projection") -> pd.Series:
    """Value Over Replacement Player: `value_col` minus the projection of
    the last player at that position who'd actually be rostered as a
    starter in a standard 12-team league (REPLACEMENT_RANK). This is what
    should drive a start/sit, waiver, or draft decision -- a 14-point RB2
    is worth more than a 14-point WR4 if replacement-level at RB is 8
    points and at WR is 11, even though the raw projections tie. `value_col`
    defaults to the weekly pipeline's column name but `build_season_long_rankings`
    reuses this on `season_projection` instead."""
    # Built on numpy arrays (not .loc assignment) so it's indifferent to
    # whether `df` carries a duplicate or non-default index, which the
    # concatenation steps upstream in `project_week` can produce.
    positions = df["position"].to_numpy()
    projections = df[value_col].to_numpy(dtype=float)
    vorp = np.zeros(len(df))
    for pos, rank in REPLACEMENT_RANK.items():
        idx = np.where(positions == pos)[0]
        if idx.size == 0:
            continue
        sorted_values = np.sort(projections[idx])[::-1]
        replacement_value = sorted_values[min(rank, len(sorted_values)) - 1]
        vorp[idx] = projections[idx] - replacement_value
    return pd.Series(vorp, index=df.index)


# ---------------------------------------------------------------------------
# 12. ORCHESTRATION
# ---------------------------------------------------------------------------

def build_player_priors(season: int, week: int, current: dict, prior: dict, scoring_format: str):
    """The season-context-independent part of every player's baseline:
    2025 priors blended with rookie draft-capital baselines / replacement
    level (`merge_priors_to_roster`), TD-luck regression (already inside
    `build_offseason_priors`), QB starter gating, and the WR/RB/TE
    depth-chart role-change signal. This is the ENTIRE signal at a Week 1
    cold start, and also the entire signal for a season-long/redraft
    ranking (which has no single "current week" to layer schedule context
    on top of week by week) -- factored out so both `project_week` and
    `build_season_long_rankings` build it identically instead of
    duplicating this sequence."""
    this_week_games = current["schedules"][current["schedules"]["week"] == week] if not current["schedules"].empty else pd.DataFrame()
    depth_chart_cutoff = pd.to_datetime(this_week_games["gameday"]).min() if not this_week_games.empty else None
    depth_charts_as_of = restrict_depth_chart_to_date(current["depth_charts"], depth_chart_cutoff)

    active_roster = get_active_roster(current["rosters_weekly"], season, week,
                                       current["weekly_status_source"])
    offseason_priors = build_offseason_priors(prior["player_stats"], prior["pbp"], scoring_format)
    rookie_priors = build_rookie_priors(current["draft_picks"])
    base = merge_priors_to_roster(active_roster, offseason_priors, rookie_priors)
    base = apply_qb_depth_chart_status(base, depth_charts_as_of)
    prior_usage_rank = compute_prior_usage_rank(prior["player_stats"])
    base = apply_depth_chart_role_change(base, depth_charts_as_of, prior_usage_rank)
    return base, active_roster, depth_charts_as_of


def project_week(season: int, week: int, scoring_format: str = "ppr",
                  verbose: bool = True) -> tuple[pd.DataFrame, pd.DataFrame | None]:
    """Core pipeline for a single (season, week): loads data, builds priors
    and features, trains models, blends, and returns the FULL result frame
    (every intermediate column, not just the Top-30 output slice) plus the
    evaluation frame (None if the week hasn't been played yet). Factored out
    of `main` so `backtest` can drive it across many weeks without
    re-implementing any of the pipeline logic."""
    if scoring_format not in SCORING_FORMATS:
        raise ValueError(f"scoring_format must be one of {list(SCORING_FORMATS)}")
    prior_season = season - 1
    log = print if verbose else (lambda *a, **k: None)
    log(f"=== Weekly Fantasy Projections: {season} Week {week} ({scoring_format}) ===")

    current = load_current_season_inputs(season)
    prior = load_prior_season_inputs(prior_season)

    base, active_roster, depth_charts_as_of = build_player_priors(season, week, current, prior, scoring_format)

    # --- Feature engineering (current season, weeks before `week`) --------
    weekly = current["player_stats"]
    weekly = weekly[weekly["position"].isin(POSITIONS)].copy() if not weekly.empty else weekly
    if not weekly.empty:
        weekly = compute_opportunity_shares(weekly)
        weekly = compute_redzone_shares(weekly, current["pbp"])
        weekly = compute_snap_share(weekly, current["snap_counts"], current["players"])
        share_cols = ["target_share", "carry_share", "pass_attempt_share", "wopr",
                      "rz_target_share", "rz_carry_share", "adot", "snap_share"]
        weekly = add_rolling_and_expanding(weekly, share_cols)
        elasticities = compute_vacated_share_elasticity(prior["player_stats"])
        weekly = apply_vacated_share(weekly, active_roster, depth_charts_as_of, elasticities)
    else:
        log("[info] no current-season weekly stats yet -- pure cold start; "
            "ML models will be skipped and the prior alone will drive projections.")

    vegas = compute_vegas_game_script(current["schedules"])
    weather = compute_weather_multiplier(vegas)
    proe = compute_proe_features(current["pbp"], prior["pbp"], week)
    pass_block = compute_oline_pass_block_context(current["pbp"], prior["pbp"], week)
    run_block = compute_run_block_context(current["ngs_rushing"], prior["ngs_rushing"], week)
    playing_prob = compute_playing_probability(current["injuries"], week)
    dvp = compute_dvp_features(weekly if not weekly.empty else pd.DataFrame(columns=["position", "opponent_team", "week"]),
                                prior["player_stats"], week, scoring_format)

    # --- ML models ----------------------------------------------------------
    if not weekly.empty:
        weekly = weekly.merge(proe, on="team", how="left")
        weekly = weekly.merge(pass_block, on="team", how="left")
        weekly = weekly.merge(run_block, on="team", how="left")
        weekly["team_proe_blended"] = weekly["team_proe_blended"].fillna(0.0)
        weekly["team_pressure_rate_allowed_blended"] = weekly["team_pressure_rate_allowed_blended"].fillna(0.20)
        weekly["team_run_block_oe_blended"] = weekly["team_run_block_oe_blended"].fillna(0.0)
        models, predictions = train_position_models(weekly, week, scoring_format)
        predictions = train_quantile_models(weekly, week, scoring_format, predictions)
        model_cols = ["player_id", "model_raw_pred", "floor_pred", "ceiling_pred", "volatility_score", "model_trained"]
        model_out = pd.concat([p for p in predictions.values() if not p.empty], ignore_index=True) \
            if any(not p.empty for p in predictions.values()) else pd.DataFrame(columns=["player_id"])
        # Week 1 of an already-completed season still has non-empty overall
        # `weekly` data, but every position's OWN prediction frame is empty
        # (there is no week 0 to build a "last week" snapshot from), so
        # `model_out` can come back with only `player_id` and none of the
        # other model columns -- reindex to guarantee the full column set
        # regardless of which branch produced it.
        model_out = model_out.reindex(columns=model_cols)
    else:
        model_out = pd.DataFrame(columns=["player_id", "model_raw_pred", "floor_pred", "ceiling_pred",
                                           "volatility_score", "model_trained"])

    # --- Assemble final frame ----------------------------------------------
    result = base.merge(model_out, on="player_id", how="left").reset_index(drop=True)
    result[["model_raw_pred", "floor_pred", "ceiling_pred", "volatility_score"]] = (
        result[["model_raw_pred", "floor_pred", "ceiling_pred", "volatility_score"]].fillna(0.0)
    )
    result["model_trained"] = result["model_trained"].fillna(False)
    # Any player with no trained model prediction at all (pure cold start, or a
    # position with too little current-season sample this week) gets a
    # prior-based +/-40% band instead of a meaningless floor/ceiling of 0.
    no_model = (result["model_raw_pred"] == 0) & (result["floor_pred"] == 0) & (result["ceiling_pred"] == 0)
    result.loc[no_model, "floor_pred"] = result.loc[no_model, "offseason_prior_ppg"] * 0.6
    result.loc[no_model, "ceiling_pred"] = result.loc[no_model, "offseason_prior_ppg"] * 1.4

    this_week_vegas = vegas[vegas["week"] == week][["team", "implied_total", "team_spread", "vegas_multiplier"]]
    this_week_weather = weather[weather["week"] == week][["team", "weather_multiplier_pass", "weather_multiplier_rush"]]
    schedule_map = current["schedules"][current["schedules"]["week"] == week][["home_team", "away_team"]]
    opponent_map = pd.concat([
        schedule_map.rename(columns={"home_team": "team", "away_team": "opponent"}),
        schedule_map.rename(columns={"away_team": "team", "home_team": "opponent"}),
    ])[["team", "opponent"]]

    result = result.merge(this_week_vegas, on="team", how="left")
    result = result.merge(this_week_weather, on="team", how="left")
    result = result.merge(opponent_map, on="team", how="left")
    result = result.merge(dvp.rename(columns={"team": "opponent"}), on=["opponent", "position"], how="left")

    result["vegas_multiplier"] = result["vegas_multiplier"].fillna(1.0)
    result["dvp_multiplier"] = result["dvp_multiplier"].fillna(1.0)
    result["weather_multiplier"] = np.where(
        result["position"].isin(["QB", "WR", "TE"]),
        result["weather_multiplier_pass"].fillna(1.0),
        result["weather_multiplier_rush"].fillna(1.0),
    )

    # External current-year-only O-line panel ranking (season-gated, see
    # EXTERNAL_OLINE_RANKINGS): only QB/RB get it, since pass/run blocking
    # most directly affects protection and rushing lanes.
    external_oline = compute_external_oline_multiplier(season)
    result = result.merge(external_oline, on="team", how="left")
    result["external_oline_multiplier"] = np.where(
        result["position"].isin(["QB", "RB"]),
        result["external_oline_multiplier"].fillna(1.0),
        1.0,
    )

    result["final_projection"] = result.apply(blend_projections, axis=1, current_week=week)
    context_multiplier = (result["vegas_multiplier"] * result["dvp_multiplier"]
                           * result["weather_multiplier"] * result["external_oline_multiplier"])
    result["final_projection"] = result["final_projection"] * result["external_oline_multiplier"]
    result["final_floor"] = result["floor_pred"] * context_multiplier
    result["final_ceiling"] = result["ceiling_pred"] * context_multiplier
    result["volatility_score"] = result["final_ceiling"] - result["final_floor"]

    result["confidence_tier"] = assign_confidence_tier(result, week)

    # --- Injury practice-report probability-of-playing (soft scale-down) ---
    result = result.merge(playing_prob, on="player_id", how="left")
    result["playing_probability"] = result["playing_probability"].fillna(1.0)
    for col in ["final_projection", "final_floor", "final_ceiling"]:
        result[col] = result[col] * result["playing_probability"]

    # Roster status is the final word: inactive players are hard-zeroed.
    inactive = result["roster_status"] != "ACT"
    result.loc[inactive, ["final_projection", "final_floor", "final_ceiling"]] = 0.0
    result.loc[inactive, "confidence_tier"] = "Low"

    result["vorp"] = compute_vorp(result)

    # --- Evaluation (only meaningful once the target week has been played) --
    actuals = current["player_stats"]
    actuals = actuals[(actuals.get("week") == week)] if not actuals.empty else pd.DataFrame()
    eval_df = None
    if not actuals.empty:
        actuals = actuals.copy()
        actuals["actual_points"] = calculate_fantasy_points(actuals, scoring_format)
        eval_df = result.merge(actuals[["player_id", "actual_points"]], on="player_id", how="left")
        log("\nPositional Spearman rank correlation (projection vs. actual):")
        log(positional_spearman_correlation(eval_df).to_string(index=False))
    else:
        log(f"\n[info] {season} Week {week} hasn't been played yet -- "
            "no actuals available, skipping evaluation metrics.")

    return result, eval_df


def main(season: int, week: int, position: str | None = None,
         scoring_format: str = "ppr") -> pd.DataFrame:
    """Thin wrapper around `project_week`: runs the full pipeline, prints
    evaluation metrics, and returns the Top 30 (optionally filtered to one
    position) with the columns a scouting report actually needs."""
    result, _ = project_week(season, week, scoring_format, verbose=True)

    output_cols = ["player_name", "position", "team", "opponent", "offseason_prior_ppg",
                   "model_raw_pred", "vegas_multiplier", "dvp_multiplier", "weather_multiplier",
                   "external_oline_multiplier", "playing_probability", "injury_status",
                   "final_projection",
                   "final_floor", "final_ceiling", "volatility_score", "vorp",
                   "confidence_tier", "roster_status"]
    result = result[output_cols].rename(columns={"final_floor": "floor_pred", "final_ceiling": "ceiling_pred"})

    scope = result if position is None else result[result["position"] == position]
    top = scope.sort_values("final_projection", ascending=False).head(30).reset_index(drop=True)
    return top


def backtest(season: int, start_week: int = 2, end_week: int = 18,
             scoring_format: str = "ppr") -> pd.DataFrame:
    """Rerun the pipeline across a full range of already-played weeks and
    report the positional Spearman correlation trend week over week. This
    is the empirical check on WEEK_BLEND_SCHEDULE / DVP_BLEND_SCHEDULE: if
    correlation is still climbing sharply at week 4 when the schedule has
    already handed 100% of the weight to the model, the hardcoded weights
    are too aggressive and should be stretched out further; if it plateaus
    by week 2-3, they could hand off sooner. Week 1 is skipped since there
    is nothing to blend against yet (100% prior by construction)."""
    trend = []
    for wk in range(max(start_week, 2), end_week + 1):
        _, eval_df = project_week(season, wk, scoring_format, verbose=False)
        if eval_df is None:
            print(f"[info] {season} week {wk}: not played yet, stopping backtest here.")
            break
        week_corr = positional_spearman_correlation(eval_df)
        week_corr["week"] = wk
        trend.append(week_corr)
        print(f"week {wk:>2}: " + ", ".join(
            f"{r.position}={r.spearman_r:.2f}" for r in week_corr.itertuples() if pd.notna(r.spearman_r)
        ))
    if not trend:
        return pd.DataFrame(columns=["week", "position", "n", "spearman_r"])
    trend_df = pd.concat(trend, ignore_index=True)
    print("\nAverage Spearman correlation by position across backtested weeks:")
    print(trend_df.groupby("position")["spearman_r"].mean().to_string())
    return trend_df


# ---------------------------------------------------------------------------
# 13. SEASON-LONG / REDRAFT RANKINGS
# ---------------------------------------------------------------------------

def compute_season_schedule_context(schedules_df: pd.DataFrame, dvp_df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Season-long analogue of the weekly Vegas/DvP/weather multipliers:
    instead of one week's opponent, average across every game on a team's
    actual schedule. `season_dvp_multiplier` in particular is a real
    strength-of-schedule number -- the average difficulty, at a given
    position, of the specific 17 opponents that team's players will
    actually face this season, not a league-wide average."""
    vegas = compute_vegas_game_script(schedules_df)
    weather = compute_weather_multiplier(vegas)
    season_vegas = vegas.groupby("team")["vegas_multiplier"].mean().rename("season_vegas_multiplier").reset_index()
    season_weather = weather.groupby("team").agg(
        season_weather_multiplier_pass=("weather_multiplier_pass", "mean"),
        season_weather_multiplier_rush=("weather_multiplier_rush", "mean"),
    ).reset_index()

    if schedules_df.empty:
        season_dvp = pd.DataFrame(columns=["team", "position", "season_dvp_multiplier"])
    else:
        opponents = pd.concat([
            schedules_df[["home_team", "away_team"]].rename(columns={"home_team": "team", "away_team": "opponent"}),
            schedules_df[["home_team", "away_team"]].rename(columns={"away_team": "team", "home_team": "opponent"}),
        ])
        opp_dvp = opponents.merge(dvp_df.rename(columns={"team": "opponent"}), on="opponent", how="left")
        season_dvp = opp_dvp.groupby(["team", "position"])["dvp_multiplier"].mean().rename(
            "season_dvp_multiplier").reset_index()

    return season_vegas, season_weather, season_dvp


def build_season_long_rankings(season: int, scoring_format: str = "ppr") -> pd.DataFrame:
    """Preseason/redraft-style ranking: every rostered player's projected
    FULL-SEASON points, ranked overall and by position. Built from the
    exact same baseline as the Week 1 cold start (`build_player_priors` --
    2025 priors, rookie draft-capital baselines, QB starter gating, TD-luck
    regression, WR/RB/TE depth-chart role-change signal), since a
    season-long ranking has no single "current week" to run the ML/blend
    machinery against -- there's no in-season data yet by definition. What
    it adds on top is schedule context averaged across the whole season
    (`compute_season_schedule_context`) instead of one week's opponent, and
    multiplies the resulting per-game rate out over a full GAMES_IN_SEASON
    (17-game) season. DvP is computed once using week=1 (which forces
    100% prior-season weight in the blend schedule regardless of whether
    `season` has partial in-progress data) so this is always a
    prior-season-grounded projection, not a mid-season snapshot."""
    current = load_current_season_inputs(season)
    prior = load_prior_season_inputs(season - 1)

    base, _, _ = build_player_priors(season, 1, current, prior, scoring_format)
    dvp = compute_dvp_features(pd.DataFrame(columns=["position", "opponent_team", "week"]),
                                prior["player_stats"], current_week=1, scoring_format=scoring_format)
    season_vegas, season_weather, season_dvp = compute_season_schedule_context(current["schedules"], dvp)
    external_oline = compute_external_oline_multiplier(season)

    result = base.merge(season_vegas, on="team", how="left")
    result = result.merge(season_weather, on="team", how="left")
    result = result.merge(season_dvp, on=["team", "position"], how="left")
    result = result.merge(external_oline, on="team", how="left")

    result["season_vegas_multiplier"] = result["season_vegas_multiplier"].fillna(1.0)
    result["season_dvp_multiplier"] = result["season_dvp_multiplier"].fillna(1.0)
    result["season_weather_multiplier"] = np.where(
        result["position"].isin(["QB", "WR", "TE"]),
        result["season_weather_multiplier_pass"].fillna(1.0),
        result["season_weather_multiplier_rush"].fillna(1.0),
    )
    result["external_oline_multiplier"] = np.where(
        result["position"].isin(["QB", "RB"]),
        result["external_oline_multiplier"].fillna(1.0),
        1.0,
    )

    result["ppg_projection"] = (
        result["offseason_prior_ppg"] * result["season_vegas_multiplier"]
        * result["season_dvp_multiplier"] * result["season_weather_multiplier"]
        * result["external_oline_multiplier"]
    )
    result["games"] = GAMES_IN_SEASON
    result["season_projection"] = result["ppg_projection"] * result["games"]

    # No in-season injury forecasting -- a bye week and a season-ending injury
    # are both unknowable ahead of time from box-score data, so every player
    # is projected for a full healthy season. Roster status is still the
    # final word for someone already known to be off the active roster.
    inactive = result["roster_status"] != "ACT"
    result.loc[inactive, ["ppg_projection", "season_projection"]] = 0.0

    result["vorp"] = compute_vorp(result, value_col="season_projection")

    result = result.sort_values("season_projection", ascending=False).reset_index(drop=True)
    result["overall_rank"] = np.arange(1, len(result) + 1)
    result["position_rank"] = result.groupby("position")["season_projection"].rank(
        ascending=False, method="first").astype(int)

    output_cols = ["overall_rank", "position_rank", "player_name", "position", "team",
                   "ppg_projection", "games", "season_projection", "vorp",
                   "offseason_prior_ppg", "roster_status"]
    return result[output_cols]


def build_weekly_rankings(season: int, week: int, scoring_format: str = "ppr") -> pd.DataFrame:
    """Single-week ranking over every rostered player, not just the Top 30
    `main()` prints for a scouting report -- a site ranking page needs the
    full WR/RB/TE/QB pool (`main()`'s truncate-then-report shape otherwise
    lets QBs, which this model tends to project highest, crowd out the rest
    of the top 30 almost entirely)."""
    result, _ = project_week(season, week, scoring_format, verbose=False)
    result = result.rename(columns={"final_floor": "floor_pred", "final_ceiling": "ceiling_pred"})

    # `project_week` only keeps the derived weather_multiplier, not the raw
    # venue/roof/temp/wind -- a site ranking wants the raw values to show
    # (dome vs. outdoors, actual temp/wind), so pull them in separately.
    current = load_current_season_inputs(season)
    venue = compute_vegas_game_script(current["schedules"])
    venue = venue[venue["week"] == week][["team", "roof", "temp", "wind"]]
    result = result.merge(venue, on="team", how="left")

    # --- Bye weeks -------------------------------------------------------
    # `project_week` merges the opponent map with a left join and fills the
    # missing multipliers with 1.0, so a player whose team is on bye comes
    # out the other side with a full week's projection and a blank opponent.
    # Zero them explicitly against the schedule rather than inferring from
    # the null opponent: a missing opponent can also mean the schedule join
    # failed, which is a different bug and should not be labelled a bye.
    bye_map = compute_bye_weeks(current["schedules"])
    result["bye_week"] = result["team"].map(bye_map).astype("Int64")
    on_bye = result["bye_week"] == week
    result.loc[on_bye, ["final_projection", "floor_pred", "ceiling_pred"]] = 0.0

    result = result.sort_values("final_projection", ascending=False).reset_index(drop=True)
    result["overall_rank"] = np.arange(1, len(result) + 1)
    result["position_rank"] = result.groupby("position")["final_projection"].rank(
        ascending=False, method="first").astype(int)

    # Opponent matchup difficulty, 1 (hardest) to 32 (easiest), from the
    # same `dvp_multiplier` (points a defense allows to this position)
    # `project_week` already computed for each player's own opponent --
    # lower points allowed = stingier defense = harder matchup = rank 1.
    # Week 1's dvp_multiplier is 100% last season's data (see
    # DVP_BLEND_SCHEDULE) with zero current-season signal, which is
    # exactly the case this is meant to not show yet: left N/A until
    # week 2, once there's real current-season defensive data behind it.
    if week == 1:
        result["opp_rank"] = pd.array([pd.NA] * len(result), dtype="Int64")
    else:
        # "dense" ranks by DISTINCT dvp_multiplier value (one per opponent),
        # not by row position -- "min" would space ranks out by how many
        # players share each opponent (e.g. WR's ~12 players/team), blowing
        # the scale well past 32 instead of keeping it 1-32.
        result["opp_rank"] = result.groupby("position")["dvp_multiplier"].rank(
            method="dense", ascending=True).astype("Int64")

    output_cols = ["overall_rank", "position_rank", "player_name", "position", "team", "opponent",
                   "offseason_prior_ppg", "model_raw_pred", "vegas_multiplier", "dvp_multiplier",
                   "opp_rank", "roof", "temp", "wind", "weather_multiplier", "external_oline_multiplier",
                   "playing_probability", "injury_status", "bye_week",
                   "final_projection", "floor_pred", "ceiling_pred",
                   "volatility_score", "vorp", "confidence_tier", "roster_status"]
    return result[output_cols]


def build_rest_of_season_rankings(season: int, current_week: int,
                                   scoring_format: str = "ppr") -> pd.DataFrame:
    """Rest-of-season ranking as of `current_week` (inclusive): unlike
    `build_season_long_rankings`, which only ever has the offseason prior to
    work with, this starts from `project_week`'s in-season-blended per-game
    rate (`final_projection`) -- the same number the weekly pipeline trusts
    for `current_week` -- so a hot or cold start actually moves the ranking.
    That per-game rate already excludes single-opponent Vegas/DvP/weather
    noise (see `project_week`), so it's the right base to multiply back out
    over the games still left to play, the same way `offseason_prior_ppg`
    is multiplied out over all 17 in `build_season_long_rankings`."""
    current = load_current_season_inputs(season)
    prior = load_prior_season_inputs(season - 1)

    result, _ = project_week(season, current_week, scoring_format, verbose=False)

    remaining_schedule = current["schedules"][current["schedules"]["week"] >= current_week]

    weekly = current["player_stats"]
    weekly = weekly[weekly["position"].isin(POSITIONS)].copy() if not weekly.empty else weekly
    dvp = compute_dvp_features(
        weekly if not weekly.empty else pd.DataFrame(columns=["position", "opponent_team", "week"]),
        prior["player_stats"], current_week, scoring_format)

    season_vegas, season_weather, season_dvp = compute_season_schedule_context(remaining_schedule, dvp)
    # `result` (from `project_week`) already carries its own
    # `external_oline_multiplier` -- the current-season O-line signal isn't
    # week-specific, so it's reused as-is rather than merged again (which
    # would collide with the existing column and rename both to `_x`/`_y`).

    # Bye weeks fall out naturally: a team with no row for a given week in
    # `remaining_schedule` just doesn't get a game credited for it.
    games_remaining = pd.concat([
        remaining_schedule[["home_team"]].rename(columns={"home_team": "team"}),
        remaining_schedule[["away_team"]].rename(columns={"away_team": "team"}),
    ]).groupby("team").size().rename("games_remaining").reset_index()

    # A dome/closed-roof game is weather-neutral for the rest of the season
    # regardless of which team is home, so both sides of every such game
    # count toward each participant's own dome-game count.
    dome_schedule = remaining_schedule[remaining_schedule["roof"].isin(["dome", "closed"])]
    dome_games = pd.concat([
        dome_schedule[["home_team"]].rename(columns={"home_team": "team"}),
        dome_schedule[["away_team"]].rename(columns={"away_team": "team"}),
    ]).groupby("team").size().rename("dome_games").reset_index()

    result = result.merge(season_vegas, on="team", how="left")
    result = result.merge(season_weather, on="team", how="left")
    result = result.merge(season_dvp, on=["team", "position"], how="left")
    result = result.merge(games_remaining, on="team", how="left")
    result = result.merge(dome_games, on="team", how="left")
    result["dome_games"] = result["dome_games"].fillna(0).astype(int)

    result["season_vegas_multiplier"] = result["season_vegas_multiplier"].fillna(1.0)
    result["season_dvp_multiplier"] = result["season_dvp_multiplier"].fillna(1.0)
    result["season_weather_multiplier"] = np.where(
        result["position"].isin(["QB", "WR", "TE"]),
        result["season_weather_multiplier_pass"].fillna(1.0),
        result["season_weather_multiplier_rush"].fillna(1.0),
    )
    result["games_remaining"] = result["games_remaining"].fillna(0).astype(int)

    result["ppg_projection"] = (
        result["final_projection"] * result["season_vegas_multiplier"]
        * result["season_dvp_multiplier"] * result["season_weather_multiplier"]
        * result["external_oline_multiplier"]
    )
    result["ros_projection"] = result["ppg_projection"] * result["games_remaining"]

    # Same final word as the other two ranking builders: a player already
    # known to be off the active roster is hard-zeroed, not projected.
    inactive = result["roster_status"] != "ACT"
    result.loc[inactive, ["ppg_projection", "ros_projection"]] = 0.0

    result["vorp"] = compute_vorp(result, value_col="ros_projection")

    result = result.sort_values("ros_projection", ascending=False).reset_index(drop=True)
    result["overall_rank"] = np.arange(1, len(result) + 1)
    result["position_rank"] = result.groupby("position")["ros_projection"].rank(
        ascending=False, method="first").astype(int)

    output_cols = ["overall_rank", "position_rank", "player_name", "position", "team",
                   "ppg_projection", "games_remaining", "dome_games", "ros_projection", "vorp",
                   "offseason_prior_ppg", "roster_status"]
    return result[output_cols]


# ---------------------------------------------------------------------------
# 14. KICKER RANKINGS ("PROJECT UPRIGHT")
# ---------------------------------------------------------------------------

# Distance scoring: 0.1 pt/yard on a made FG, +1 made XP, -1 missed XP.
KICKER_DISTANCE_SCORING = dict(yard_made=0.1, xp_made=1.0, xp_missed=-1.0)
# Standard scoring: bucketed by make distance, +1 made XP (no penalty for a miss).
KICKER_STANDARD_SCORING = dict(fg_under_40=3.0, fg_40_49=4.0, fg_50_plus=5.0, xp_made=1.0)

# League-average FG make rate by distance bucket (rough NFL norms) and the
# share of a team's expected FG attempts that fall in each bucket. First-pass
# heuristic standing in for the real 2015-2025 calibration described in the
# Project Upright write-up -- tunable once that backtest exists.
KICKER_MAKE_RATE = {"fg_under_40": 0.94, "fg_40_49": 0.83, "fg_50_plus": 0.62}
KICKER_BUCKET_SHARE = {"fg_under_40": 0.50, "fg_40_49": 0.35, "fg_50_plus": 0.15}
KICKER_BUCKET_MIDPOINT_YARDS = {"fg_under_40": 32, "fg_40_49": 44, "fg_50_plus": 54}
# Expected FG attempts and XP attempts for a team at league-average implied
# total; scaled up/down with implied_total below.
LEAGUE_AVG_FG_ATTEMPTS = 1.9
LEAGUE_AVG_XP_ATTEMPTS = 2.6
XP_MAKE_RATE = 0.94


def compute_kicker_weather_multiplier(vegas_df: pd.DataFrame) -> pd.DataFrame:
    """Kicking-specific weather adjustment -- wind hurts FG% (more on long
    attempts than short ones) and effective range; cold trims range
    slightly. A dome or closed roof is neutral by definition. Thresholds
    are a first-pass heuristic, not the historical calibration described
    in the Project Upright write-up."""
    df = vegas_df.copy()
    is_exposed = ~df["roof"].isin(["dome", "closed"])
    wind = df["wind"].fillna(0)
    temp = df["temp"].fillna(60)

    df["kicker_make_multiplier_short"] = 1.0
    df["kicker_make_multiplier_long"] = 1.0
    windy = is_exposed & (wind > 15)
    very_windy = is_exposed & (wind > 25)
    df.loc[windy, "kicker_make_multiplier_short"] *= 0.97
    df.loc[windy, "kicker_make_multiplier_long"] *= 0.88
    df.loc[very_windy, "kicker_make_multiplier_long"] *= 0.85

    cold = is_exposed & (temp < 25)
    df.loc[cold, "kicker_make_multiplier_long"] *= 0.95

    return df[["season", "week", "team", "kicker_make_multiplier_short", "kicker_make_multiplier_long"]]


def compute_fourth_down_aggressiveness(pbp_df: pd.DataFrame) -> pd.DataFrame:
    """Share of a team's 4th downs where they go for it (run/pass) instead
    of punting or kicking a field goal -- a team that goes for it more
    often is taking fourth-down looks away from its own kicker. Excludes
    penalty no-plays (the actual decision isn't recorded) and kneels."""
    if pbp_df.empty:
        return pd.DataFrame(columns=["team", "fourth_down_go_pct"])
    fourth = pbp_df[(pbp_df["down"] == 4) & (pbp_df["play_type"].isin(["run", "pass", "punt", "field_goal"]))]
    if fourth.empty:
        return pd.DataFrame(columns=["team", "fourth_down_go_pct"])
    counts = fourth.groupby(["posteam", "play_type"]).size().unstack(fill_value=0)
    go_plays = counts.get("run", 0) + counts.get("pass", 0)
    total_plays = counts.sum(axis=1)
    out = pd.DataFrame({
        "team": counts.index,
        "fourth_down_go_pct": (go_plays / total_plays).values,
    }).reset_index(drop=True)
    return out


def build_kicker_rankings(season: int, week: int) -> pd.DataFrame:
    """Weekly kicker board ("Project Upright"): ranks each team's current
    placekicker by expected fantasy points under two scoring systems,
    driven by Vegas implied team total (more expected points -> more
    scoring drives -> more FG chances when a drive stalls) and venue/
    weather. This is a live-data heuristic, not the full 2015-2025
    historical calibration described in the write-up -- see
    `compute_kicker_weather_multiplier` and the KICKER_* constants above
    for the pieces meant to be replaced by that calibration later."""
    current = load_current_season_inputs(season)
    prior = load_prior_season_inputs(season - 1)

    rosters = current["rosters_weekly"]
    if "week" in rosters.columns and current["weekly_status_source"] == "rosters_weekly":
        rosters = rosters[(rosters["season"] == season) & (rosters["week"] == week)]
    kickers = rosters[(rosters["position"] == "K") & (rosters["status"] == "ACT")].copy()
    kickers = kickers.rename(columns={"gsis_id": "player_id", "full_name": "player_name"})
    kickers["team"] = normalize_team_codes(kickers["team"])
    kickers["roster_status"] = "ACT"
    kickers = kickers[["player_id", "player_name", "team", "roster_status", "headshot_url"]] \
        .drop_duplicates(subset=["team"])

    vegas = compute_vegas_game_script(current["schedules"])
    this_week_vegas = vegas[vegas["week"] == week]
    weather = compute_kicker_weather_multiplier(this_week_vegas)

    schedule_map = current["schedules"][current["schedules"]["week"] == week][["home_team", "away_team"]]
    opponent_map = pd.concat([
        schedule_map.rename(columns={"home_team": "team", "away_team": "opponent"}),
        schedule_map.rename(columns={"away_team": "team", "home_team": "opponent"}),
    ])

    result = kickers.merge(this_week_vegas, on="team", how="inner")
    result = result.merge(weather, on=["season", "week", "team"], how="left")
    result = result.merge(opponent_map, on="team", how="left")

    playing_prob = compute_playing_probability(current["injuries"], week)
    result = result.merge(playing_prob, on="player_id", how="left")
    result["playing_probability"] = result["playing_probability"].fillna(1.0)

    # Advanced-stats section: season FG% (prior-season team total, since
    # there's no current-season kicking sample yet -- one kicker per team
    # for most of a season makes this a reasonable stand-in), this team's
    # offensive ranking (reuses the same signal the DST board ranks
    # opponents by), and how often this team goes for it on 4th down
    # instead of giving its kicker a look.
    prior_team_stats = _safe_load(nfl.load_team_stats, [season - 1], summary_level="week",
                                   label="prior team_stats (kicker FG%)")
    if not prior_team_stats.empty:
        fg_by_team = prior_team_stats.groupby("team").agg(
            fg_made=("fg_made", "sum"), fg_att=("fg_att", "sum")).reset_index()
        fg_by_team["fg_pct"] = fg_by_team["fg_made"] / fg_by_team["fg_att"].replace(0, np.nan)
    else:
        fg_by_team = pd.DataFrame(columns=["team", "fg_pct"])

    offense_quality = compute_offense_quality(season, week)
    fourth_down = compute_fourth_down_aggressiveness(prior["pbp"])

    result = result.merge(fg_by_team[["team", "fg_pct"]], on="team", how="left")
    result = result.merge(offense_quality[["team", "offense_rank"]], on="team", how="left")
    result = result.merge(fourth_down, on="team", how="left")

    result["kicker_make_multiplier_short"] = result["kicker_make_multiplier_short"].fillna(1.0)
    result["kicker_make_multiplier_long"] = result["kicker_make_multiplier_long"].fillna(1.0)

    # Expected FG attempts scale with how many points Vegas expects this
    # offense to score relative to league average.
    expected_fg_attempts = LEAGUE_AVG_FG_ATTEMPTS * (result["implied_total"] / VEGAS_BASELINE_TOTAL)
    expected_xp_attempts = LEAGUE_AVG_XP_ATTEMPTS * (result["implied_total"] / VEGAS_BASELINE_TOTAL)

    distance_projection = result["playing_probability"] * 0.0
    standard_projection = result["playing_probability"] * 0.0
    for bucket, share in KICKER_BUCKET_SHARE.items():
        attempts = expected_fg_attempts * share
        base_rate = KICKER_MAKE_RATE[bucket]
        mult = result["kicker_make_multiplier_short"] if bucket == "fg_under_40" else result["kicker_make_multiplier_long"]
        make_rate = (base_rate * mult).clip(upper=0.99)
        expected_makes = attempts * make_rate

        distance_projection = distance_projection + expected_makes * KICKER_BUCKET_MIDPOINT_YARDS[bucket] * KICKER_DISTANCE_SCORING["yard_made"]
        standard_projection = standard_projection + expected_makes * KICKER_STANDARD_SCORING[bucket]

    expected_xp_made = expected_xp_attempts * XP_MAKE_RATE
    expected_xp_missed = expected_xp_attempts * (1 - XP_MAKE_RATE)
    distance_projection = distance_projection + expected_xp_made * KICKER_DISTANCE_SCORING["xp_made"] \
        + expected_xp_missed * KICKER_DISTANCE_SCORING["xp_missed"]
    standard_projection = standard_projection + expected_xp_made * KICKER_STANDARD_SCORING["xp_made"]

    result["distance_projection"] = (distance_projection * result["playing_probability"]).round(2)
    result["standard_projection"] = (standard_projection * result["playing_probability"]).round(2)

    result = result.sort_values("distance_projection", ascending=False).reset_index(drop=True)
    result["overall_rank"] = np.arange(1, len(result) + 1)

    output_cols = ["overall_rank", "player_name", "team", "opponent", "distance_projection",
                   "standard_projection", "implied_total", "roof", "temp", "wind",
                   "fg_pct", "offense_rank", "fourth_down_go_pct",
                   "playing_probability", "roster_status", "headshot_url"]
    return result[output_cols]


# ---------------------------------------------------------------------------
# 15. DST RANKINGS
# ---------------------------------------------------------------------------

# Standard DST category scoring.
DST_SCORING = dict(sack=1.0, interception=2.0, fumble_recovery=2.0, safety=2.0,
                    def_td=6.0, special_teams_td=6.0, blocked_kick=2.0)
# (min_allowed, max_allowed, points) -- first bucket whose range contains
# points-allowed wins.
DST_POINTS_ALLOWED_TIERS = [
    (0, 0, 10.0), (1, 6, 7.0), (7, 13, 4.0), (14, 20, 1.0),
    (21, 27, 0.0), (28, 34, -1.0), (35, 999, -4.0),
]
LEAGUE_AVG_DROPBACKS = 35.0  # pass attempts + sacks taken, per team per game


def _prior_season_team_defense(prior_season: int) -> pd.DataFrame:
    """Full prior-season team defensive aggregates, used as the cold-start
    baseline for weeks with no current-season sample yet -- same problem
    `load_prior_season_inputs` solves elsewhere in this pipeline."""
    team_stats = _safe_load(nfl.load_team_stats, [prior_season], summary_level="week", label="prior team_stats")
    if team_stats.empty:
        return pd.DataFrame(columns=["team", "sacks_pg", "takeaways_pg", "def_td_pg",
                                      "safeties_pg", "points_allowed_pg", "pressure_rate"])

    schedules = _safe_load(nfl.load_schedules, [prior_season], label="prior schedules")
    points_allowed = _points_allowed_by_team(schedules)

    agg = team_stats.groupby("team").agg(
        sacks_pg=("def_sacks", "mean"),
        interceptions_pg=("def_interceptions", "mean"),
        fumbles_pg=("def_fumbles", "mean"),
        def_td_pg=("def_tds", "mean"),
        safeties_pg=("def_safeties", "mean"),
    ).reset_index()
    agg["takeaways_pg"] = agg["interceptions_pg"] + agg["fumbles_pg"]

    pfr_def = _safe_load(nfl.load_pfr_advstats, seasons=[prior_season], stat_type="def",
                          summary_level="week", label="prior pfr_advstats")
    if not pfr_def.empty:
        pressures = pfr_def.groupby(["team", "week"]).agg(
            pressures=("def_pressures", "sum"), hurries=("def_times_hurried", "sum"),
            hits=("def_times_hitqb", "sum"), sacks=("def_sacks", "sum"),
        ).reset_index()
        pressures["team_pressure_events"] = pressures[["pressures", "hurries", "hits", "sacks"]].sum(axis=1)
        # Divides by a league-average dropback count rather than the true
        # opponent-that-week dropbacks (which would need a schedule join
        # per game) -- a simplification appropriate for a first-pass
        # heuristic; a real calibration would use the actual opponent snap
        # count.
        pressures["pressure_rate"] = pressures["team_pressure_events"] / LEAGUE_AVG_DROPBACKS
        pressure_by_team = pressures.groupby("team")["pressure_rate"].mean().reset_index()
        agg = agg.merge(pressure_by_team, on="team", how="left")
    else:
        agg["pressure_rate"] = np.nan

    agg = agg.merge(points_allowed.groupby("team")["points_allowed"].mean().rename("points_allowed_pg").reset_index(),
                     on="team", how="left")
    return agg


def _points_allowed_by_team(schedules_df: pd.DataFrame) -> pd.DataFrame:
    """One row per team per played game with the points that team allowed
    (i.e. the opponent's final score)."""
    played = schedules_df.dropna(subset=["home_score", "away_score"])
    if played.empty:
        return pd.DataFrame(columns=["team", "week", "points_allowed"])
    home = played[["week", "home_team", "away_score"]].rename(
        columns={"home_team": "team", "away_score": "points_allowed"})
    away = played[["week", "away_team", "home_score"]].rename(
        columns={"away_team": "team", "home_score": "points_allowed"})
    return pd.concat([home, away], ignore_index=True)


def compute_team_defense_history(season: int, through_week: int) -> pd.DataFrame:
    """Each team's season-to-date defensive profile (sacks/game, takeaways/
    game, defensive TDs/game, safeties/game, points allowed/game, pressure
    rate). Falls back to the full prior season at `through_week == 1`
    (no current-season sample exists yet) and otherwise uses whatever
    current-season weeks are available -- a lighter version of the
    prior/current blend `WEEK_BLEND_SCHEDULE` uses elsewhere, since there
    is no equivalent historical calibration for defense yet."""
    prior = _prior_season_team_defense(season - 1)
    if through_week <= 1:
        return prior

    current_team_stats = _safe_load(nfl.load_team_stats, [season], summary_level="week", label="team_stats")
    current_team_stats = current_team_stats[current_team_stats["week"] < through_week]
    if current_team_stats.empty:
        return prior

    schedules = _safe_load(nfl.load_schedules, [season], label="schedules")
    points_allowed = _points_allowed_by_team(schedules)
    points_allowed = points_allowed[points_allowed["week"] < through_week]

    agg = current_team_stats.groupby("team").agg(
        sacks_pg=("def_sacks", "mean"), interceptions_pg=("def_interceptions", "mean"),
        fumbles_pg=("def_fumbles", "mean"), def_td_pg=("def_tds", "mean"),
        safeties_pg=("def_safeties", "mean"),
    ).reset_index()
    agg["takeaways_pg"] = agg["interceptions_pg"] + agg["fumbles_pg"]
    agg = agg.merge(points_allowed.groupby("team")["points_allowed"].mean().rename("points_allowed_pg").reset_index(),
                     on="team", how="left")

    # Blend toward the current season as its sample grows; 100% current by
    # week 5, matching the point where the rest of this pipeline starts
    # trusting in-season signal over the prior year (see WEEK_BLEND_SCHEDULE).
    current_weight = min(1.0, (through_week - 1) / 4)
    merged = prior.merge(agg, on="team", how="outer", suffixes=("_prior", "_current"))
    out = pd.DataFrame({"team": merged["team"]})
    for col in ["sacks_pg", "takeaways_pg", "def_td_pg", "safeties_pg", "points_allowed_pg"]:
        prior_col, cur_col = merged.get(f"{col}_prior"), merged.get(f"{col}_current")
        out[col] = prior_col.fillna(0) * (1 - current_weight) + cur_col.fillna(prior_col).fillna(0) * current_weight
    out["pressure_rate"] = merged.get("pressure_rate_prior", merged.get("pressure_rate"))
    return out


def compute_offense_quality(season: int, through_week: int) -> pd.DataFrame:
    """Season-to-date scoring output per team (points/game), with a
    league-wide rank and a `bottom_10_offense` flag -- same prior-season
    cold-start fallback as `compute_team_defense_history`."""
    if through_week <= 1:
        schedules = _safe_load(nfl.load_schedules, [season - 1], label="prior schedules for offense")
        played = schedules.dropna(subset=["home_score", "away_score"])
        home = played[["week", "home_team", "home_score"]].rename(columns={"home_team": "team", "home_score": "points_scored"})
        away = played[["week", "away_team", "away_score"]].rename(columns={"away_team": "team", "away_score": "points_scored"})
        points_scored = pd.concat([home, away], ignore_index=True)
    else:
        schedules = _safe_load(nfl.load_schedules, [season], label="schedules for offense")
        played = schedules[schedules["week"] < through_week].dropna(subset=["home_score", "away_score"])
        home = played[["week", "home_team", "home_score"]].rename(columns={"home_team": "team", "home_score": "points_scored"})
        away = played[["week", "away_team", "away_score"]].rename(columns={"away_team": "team", "away_score": "points_scored"})
        points_scored = pd.concat([home, away], ignore_index=True)
        if points_scored.empty:
            return compute_offense_quality(season, through_week=1)

    ppg = points_scored.groupby("team")["points_scored"].mean().rename("points_scored_pg").reset_index()
    ppg["offense_rank"] = ppg["points_scored_pg"].rank(ascending=False, method="first")
    ppg["bottom_10_offense"] = ppg["offense_rank"] > (ppg["offense_rank"].max() - 10)
    return ppg


def build_dst_rankings(season: int, week: int) -> pd.DataFrame:
    """Weekly DST board: standard category scoring, driven by this
    defense's own season-to-date profile (pressure rate, takeaways,
    points allowed), this week's opponent's Vegas implied total (directly
    "how many points is this defense expected to allow"), and whether that
    opponent is a bottom-10 offense. Live-data heuristic, not a historical
    backtest -- see the constants above for what a future calibration
    would replace."""
    current = load_current_season_inputs(season)
    vegas = compute_vegas_game_script(current["schedules"])
    this_week_vegas = vegas[vegas["week"] == week][["team", "implied_total"]]

    schedule_map = current["schedules"][current["schedules"]["week"] == week][["home_team", "away_team"]]
    opponent_map = pd.concat([
        schedule_map.rename(columns={"home_team": "team", "away_team": "opponent"}),
        schedule_map.rename(columns={"away_team": "team", "home_team": "opponent"}),
    ])

    defense = compute_team_defense_history(season, week)
    offense_quality = compute_offense_quality(season, week)

    result = opponent_map.merge(this_week_vegas, on="team", how="left")
    result = result.merge(defense, on="team", how="left")
    result = result.merge(
        offense_quality.rename(columns={
            "team": "opponent", "bottom_10_offense": "bottom_10_offense_faced",
            "offense_rank": "opponent_offense_rank",
        }),
        on="opponent", how="left")

    result["pressure_rate"] = result["pressure_rate"].fillna(0.20)
    result["bottom_10_offense_faced"] = result["bottom_10_offense_faced"].fillna(False)
    result["opponent_offense_rank"] = result["opponent_offense_rank"].astype("Int64")
    for col in ["sacks_pg", "takeaways_pg", "def_td_pg", "safeties_pg"]:
        result[col] = result[col].fillna(0.0)
    result["points_allowed_pg"] = result["points_allowed_pg"].fillna(VEGAS_BASELINE_TOTAL)

    # Expected sacks: this DST's pressure rate applied to a league-average
    # dropback count, nudged up when this week's opponent is a bottom-10
    # offense (more likely to fall behind schedule / pass under duress).
    opponent_penalty = np.where(result["bottom_10_offense_faced"], 1.15, 1.0)
    expected_sacks = result["pressure_rate"] * LEAGUE_AVG_DROPBACKS / 6.0 * opponent_penalty
    expected_sacks = 0.5 * expected_sacks + 0.5 * result["sacks_pg"]

    expected_takeaways = result["takeaways_pg"] * np.where(result["bottom_10_offense_faced"], 1.20, 1.0)
    expected_def_td = result["def_td_pg"]
    expected_safeties = result["safeties_pg"]
    expected_blocked_kicks = 0.03  # rare-event constant, not modeled per-team yet

    # Points allowed this week: blend Vegas' opponent-specific implied
    # total (the most direct signal for THIS game) with the defense's own
    # season trend, mapped through the standard tiers via a smooth
    # linear interpolation between neighboring tier averages rather than a
    # single point estimate.
    expected_points_allowed = 0.6 * result["implied_total"].fillna(result["points_allowed_pg"]) \
        + 0.4 * result["points_allowed_pg"]

    def tier_points(pa: float) -> float:
        for lo, hi, pts in DST_POINTS_ALLOWED_TIERS:
            if lo <= pa <= hi:
                return pts
        return DST_POINTS_ALLOWED_TIERS[-1][2]

    # Smooth over the tier step function: average the tier score at pa-3
    # and pa+3 instead of a hard cutoff, so 20.5 expected points allowed
    # doesn't swing the whole projection the way a real, single, whole-
    # number outcome would.
    points_allowed_score = expected_points_allowed.apply(
        lambda pa: (tier_points(max(pa - 3, 0)) + tier_points(pa) + tier_points(pa + 3)) / 3)

    result["standard_dst_projection"] = (
        expected_sacks * DST_SCORING["sack"]
        + expected_takeaways * (DST_SCORING["interception"] + DST_SCORING["fumble_recovery"]) / 2
        + expected_def_td * DST_SCORING["def_td"]
        + expected_safeties * DST_SCORING["safety"]
        + expected_blocked_kicks * DST_SCORING["blocked_kick"]
        + points_allowed_score
    ).round(2)
    result["pressure_rate"] = result["pressure_rate"].round(3)
    result["opponent_implied_total"] = result["implied_total"].round(1)
    result["sacks_pg"] = result["sacks_pg"].round(2)
    result["takeaways_pg"] = result["takeaways_pg"].round(2)
    result["points_allowed_pg"] = result["points_allowed_pg"].round(1)

    result = result.sort_values("standard_dst_projection", ascending=False).reset_index(drop=True)
    result["overall_rank"] = np.arange(1, len(result) + 1)

    output_cols = ["overall_rank", "team", "opponent", "opponent_implied_total",
                   "opponent_offense_rank", "bottom_10_offense_faced", "pressure_rate",
                   "sacks_pg", "takeaways_pg", "points_allowed_pg", "standard_dst_projection"]
    return result[output_cols]


# ---------------------------------------------------------------------------
# 16. GAME PREDICTIONS (STRAIGHT-UP WINNER PICKS)
# ---------------------------------------------------------------------------

HOME_FIELD_ADVANTAGE = 1.7  # empirical modern-NFL home-field point edge
AVG_PLAYS_PER_GAME = 65  # per team, per game -- scales EPA/play up to point-equivalent terms
# Margin blend: SRS (score differential + strength of schedule) and EPA
# differential are both computed independently of any sportsbook line;
# Vegas is kept only as a minority check, not the primary driver.
MARGIN_WEIGHT_SRS = 0.50
MARGIN_WEIGHT_EPA = 0.30
MARGIN_WEIGHT_VEGAS = 0.20


def compute_srs_ratings(schedules_df: pd.DataFrame, iterations: int = 100) -> pd.DataFrame:
    """Simple Rating System: each team's rating equals its average margin
    of victory plus the average rating of the teams it played, solved by
    iterative averaging (recentered to a league mean of 0 every pass so
    the system doesn't drift). This is what makes it a "team strength
    that accounts for who they played" measure rather than a plain scoring
    average -- beating bad teams by a lot counts for less than beating
    good teams by a little -- and it never touches a betting line."""
    played = schedules_df.dropna(subset=["home_score", "away_score"])
    if played.empty:
        return pd.DataFrame(columns=["team", "srs"])

    home = played[["home_team", "away_team", "home_score", "away_score"]].rename(
        columns={"home_team": "team", "away_team": "opponent", "home_score": "pf", "away_score": "pa"})
    away = played[["away_team", "home_team", "away_score", "home_score"]].rename(
        columns={"away_team": "team", "home_team": "opponent", "away_score": "pf", "home_score": "pa"})
    games = pd.concat([home, away], ignore_index=True)
    games["mov"] = games["pf"] - games["pa"]

    teams = sorted(set(games["team"]) | set(games["opponent"]))
    mov_by_team = games.groupby("team")["mov"].mean().reindex(teams).fillna(0.0)
    srs = pd.Series(0.0, index=teams)

    for _ in range(iterations):
        opp_avg = games["opponent"].map(srs).groupby(games["team"]).mean().reindex(teams).fillna(0.0)
        new_srs = mov_by_team + opp_avg
        srs = new_srs - new_srs.mean()

    return srs.rename("srs").rename_axis("team").reset_index()


def compute_epa_ratings(pbp_df: pd.DataFrame) -> pd.DataFrame:
    """Net EPA/play (offensive EPA/play minus defensive EPA/play allowed)
    per team over a full season -- a play-level efficiency measure that
    doesn't get fooled by garbage-time production the way raw points can,
    and (like SRS) is entirely independent of any Vegas line."""
    plays = pbp_df[((pbp_df["pass_attempt"] == 1) | (pbp_df["rush_attempt"] == 1))].dropna(subset=["epa"])
    if plays.empty:
        return pd.DataFrame(columns=["team", "net_epa_per_play"])
    off = plays.groupby("posteam")["epa"].mean().rename("off_epa_per_play")
    dfn = plays.groupby("defteam")["epa"].mean().rename("def_epa_per_play_allowed")
    out = pd.concat([off, dfn], axis=1).fillna(0.0)
    out["net_epa_per_play"] = out["off_epa_per_play"] - out["def_epa_per_play_allowed"]
    return out[["net_epa_per_play"]].rename_axis("team").reset_index()


def build_game_predictions(season: int, week: int) -> pd.DataFrame:
    """Straight-up game-winner predictions for the week. Who wins and by
    how much is driven mostly by our OWN power ratings -- SRS (score
    differential adjusted for strength of schedule) and net EPA/play --
    computed from last season's full game log and play-by-play, with the
    Vegas spread kept only as a minority check (see MARGIN_WEIGHT_*
    above). Total points still leans on Vegas' total_line, since
    estimating scoring PACE independently is a separate problem from
    estimating who's better -- this only reduces reliance on the spread.
    Win probability comes from the normal CDF of that blended margin over
    `GAME_MARGIN_STDEV`. Still a live/historical-data heuristic, not a
    fitted/backtested model."""
    current = load_current_season_inputs(season)
    vegas = compute_vegas_game_script(current["schedules"])
    this_week_vegas = vegas[vegas["week"] == week].set_index("team")

    prior_schedules = _safe_load(nfl.load_schedules, [season - 1], label="prior schedules (SRS)")
    prior_pbp = _safe_load(nfl.load_pbp, [season - 1], label="prior pbp (EPA ratings)")
    srs = compute_srs_ratings(prior_schedules).set_index("team")["srs"]
    epa = compute_epa_ratings(prior_pbp).set_index("team")["net_epa_per_play"]

    schedule = current["schedules"][current["schedules"]["week"] == week][
        ["game_id", "home_team", "away_team", "gameday", "gametime", "spread_line", "total_line"]
    ].copy()

    z_80 = norm.ppf(0.90)  # 80% central interval -> 90th percentile each side
    rows = []
    for _, g in schedule.iterrows():
        home, away = g["home_team"], g["away_team"]

        srs_margin = (srs.get(home, 0.0) - srs.get(away, 0.0)) + HOME_FIELD_ADVANTAGE
        epa_margin = (epa.get(home, 0.0) - epa.get(away, 0.0)) * AVG_PLAYS_PER_GAME
        # .get() only falls back to the default when the team is ABSENT --
        # for a week far enough out that Vegas hasn't posted lines yet, the
        # team is present with an implied_total of NaN, which .get() passes
        # straight through. Coalesce that NaN the same way `total` below
        # already does, so an un-posted week degrades to a neutral vegas
        # input instead of NaN-ing every downstream number.
        home_implied = this_week_vegas["implied_total"].get(home, VEGAS_BASELINE_TOTAL)
        away_implied = this_week_vegas["implied_total"].get(away, VEGAS_BASELINE_TOTAL)
        if pd.isna(home_implied):
            home_implied = VEGAS_BASELINE_TOTAL
        if pd.isna(away_implied):
            away_implied = VEGAS_BASELINE_TOTAL
        vegas_margin = home_implied - away_implied

        margin = (MARGIN_WEIGHT_SRS * srs_margin + MARGIN_WEIGHT_EPA * epa_margin
                  + MARGIN_WEIGHT_VEGAS * vegas_margin)

        total = g["total_line"] if pd.notna(g["total_line"]) else home_implied + away_implied
        home_score = total / 2 + margin / 2
        away_score = total / 2 - margin / 2

        home_win_pct = norm.cdf(margin / GAME_MARGIN_STDEV)
        away_win_pct = 1 - home_win_pct

        vegas_favorite = home if home_implied >= away_implied else away
        model_pick = home if home_win_pct >= 0.5 else away

        rows.append({
            "game_id": g["game_id"], "gameday": g["gameday"], "gametime": g["gametime"],
            "home_team": home, "away_team": away,
            "home_score": round(home_score, 1), "away_score": round(away_score, 1),
            "home_band_low": round(home_score - z_80 * TEAM_SCORE_STDEV, 1),
            "home_band_high": round(home_score + z_80 * TEAM_SCORE_STDEV, 1),
            "away_band_low": round(away_score - z_80 * TEAM_SCORE_STDEV, 1),
            "away_band_high": round(away_score + z_80 * TEAM_SCORE_STDEV, 1),
            "home_win_pct": round(home_win_pct * 100, 1),
            "away_win_pct": round(away_win_pct * 100, 1),
            "spread_line": g["spread_line"], "total_line": g["total_line"],
            "pick_team": model_pick, "is_upset": model_pick != vegas_favorite,
        })

    return pd.DataFrame(rows).sort_values(["gameday", "gametime"]).reset_index(drop=True)


def build_usage_stats_board(season: int, week: int) -> pd.DataFrame:
    """Season-to-date usage profile per player, through the most recently
    completed week -- for a showcase page, and as a direct window into
    exactly what `project_week` already feeds the model as trailing
    features (see `compute_opportunity_shares`/`compute_redzone_shares`/
    `compute_snap_share`, used there with rolling/expanding windows; this
    aggregates the same per-week columns for display instead of shifting
    them for training).

    At week 1 there is no season-to-date data yet -- this comes back
    empty, the same cold-start the rest of the file already accepts for
    e.g. `opp_rank` being N/A in week 1."""
    current = load_current_season_inputs(season)
    weekly = current["player_stats"]
    weekly = weekly[weekly["position"].isin(POSITIONS)].copy() if not weekly.empty else weekly
    weekly = weekly[weekly["week"] < week] if not weekly.empty else weekly

    output_cols = ["player_id", "player_display_name", "team", "position", "games",
                   "target_share", "air_yards", "air_yards_share", "adot",
                   "red_zone_targets", "rush_share", "snap_pct", "team_success_rate"]
    if weekly.empty:
        return pd.DataFrame(columns=output_cols)

    weekly = compute_opportunity_shares(weekly)
    weekly = compute_redzone_shares(weekly, current["pbp"])
    weekly = compute_snap_share(weekly, current["snap_counts"], current["players"])

    # `player_name` here is the abbreviated "A.Rodgers" form nflreadpy's
    # weekly stats use for display in their own tables -- `player_display_name`
    # is the full name, and the one the site's photo join (keyed on full
    # names from `load_players`) actually needs.
    agg = weekly.groupby(["player_id", "player_display_name", "position"]).agg(
        team=("team", "last"),
        games=("week", "nunique"),
        target_share=("target_share", "mean"),
        air_yards=("receiving_air_yards", "sum"),
        air_yards_share=("air_yards_share", "mean"),
        adot=("adot", "mean"),
        rush_share=("carry_share", "mean"),
        snap_pct=("snap_share", "mean"),
    ).reset_index()
    agg["snap_pct"] = agg["snap_pct"] * 100

    # Raw red-zone target counts, not the share `compute_redzone_shares`
    # already computes and needs internally -- a plain count is the more
    # readable number for a showcase page, and cheap enough to compute
    # separately rather than reworking a function the model already relies on.
    pbp = current["pbp"]
    rz = pbp[(pbp["week"] < week) & (pbp["pass_attempt"] == 1)
             & (pbp["yardline_100"] <= 20) & (pbp["yardline_100"] > 0)]
    rz_targets = (rz.dropna(subset=["receiver_player_id"])
                  .groupby("receiver_player_id").size()
                  .rename("red_zone_targets").rename_axis("player_id").reset_index())
    agg = agg.merge(rz_targets, on="player_id", how="left")
    agg["red_zone_targets"] = agg["red_zone_targets"].fillna(0).astype(int)

    success_map = compute_team_success_rate(pbp, week)
    agg["team_success_rate"] = agg["team"].map(success_map)

    return (agg[output_cols]
            .sort_values("snap_pct", ascending=False, na_position="last")
            .reset_index(drop=True))


def save_rankings(df: pd.DataFrame, file_path: str) -> str:
    """Write any of this pipeline's ranking outputs to a real CSV file --
    every function above only returns an in-memory DataFrame, so without
    calling this (or doing your own df.to_csv), nothing survives past the
    current Python process."""
    df.to_csv(file_path, index=False)
    print(f"[info] wrote {len(df)} rows to {file_path}")
    return file_path


if __name__ == "__main__":
    top_players = main(season=2026, week=1, scoring_format="ppr")
    print("\nTop 30 (all positions), 2026 Week 1:")
    print(top_players.to_string(index=False))

    # Full player pool (not the Top-30 scouting-report slice above) is what
    # actually goes on the site -- see `build_weekly_rankings`.
    weekly_rankings = build_weekly_rankings(season=2026, week=1, scoring_format="ppr")
    save_rankings(weekly_rankings, "week_01.csv")

    season_rankings = build_season_long_rankings(season=2026, scoring_format="ppr")
    print("\nTop 20 season-long rankings, 2026:")
    print(season_rankings.head(20).to_string(index=False))
    save_rankings(season_rankings, "full_season_rankings_2026.csv")
    save_rankings(season_rankings.head(300), "top_300_season_rankings_2026.csv")

    ros_rankings = build_rest_of_season_rankings(season=2026, current_week=1, scoring_format="ppr")
    print("\nTop 20 rest-of-season rankings, 2026 (as of Week 1):")
    print(ros_rankings.head(20).to_string(index=False))
    save_rankings(ros_rankings, "ros_week_01.csv")
    save_rankings(season_rankings, "season_long_rankings_2026.csv")

    kicker_rankings = build_kicker_rankings(season=2026, week=1)
    print("\nProject Upright: Week 1 kicker rankings, 2026:")
    print(kicker_rankings.to_string(index=False))
    save_rankings(kicker_rankings, "kickers_week_01.csv")

    dst_rankings = build_dst_rankings(season=2026, week=1)
    print("\nDST rankings, 2026 Week 1:")
    print(dst_rankings.to_string(index=False))
    save_rankings(dst_rankings, "dst_week_01.csv")

    # Season-to-date usage board: unlike everything above, week 1 has no
    # season-to-date data to show (it comes back empty), so this exports
    # for week 2 -- the first week there's a completed week behind it.
    usage_stats = build_usage_stats_board(season=2026, week=2)
    print("\nUsage stats board, 2026 (through Week 1):")
    print(usage_stats.head(20).to_string(index=False))
    save_rankings(usage_stats, "usage_week_02.csv")
