"""Converts a pipeline CSV (preseason / weekly / ROS) into the JSON shape
the website serves, joins in a player photo, and updates the rankings
manifest. Run with the model's own venv (it already has pandas +
nflreadpy):

    ~/Desktop/FF/.venv/bin/python backend/scripts/build_rankings.py \\
        --source ~/Desktop/FF/top_300_season_rankings_2026.csv \\
        --week preseason --label "Preseason" --type preseason
"""

from __future__ import annotations

import argparse
import json

import pandas as pd

from _photos import (
    RANKINGS_DIR, PLAYERS_DIR, PLACEHOLDER_PHOTO, normalize_name, slugify,
    load_photo_map, load_overrides, load_previous_ranks, rank_change, update_index,
    load_team_logo_map,
)

# Column name, by ranking type, for the "how many points" and "what rank"
# values that mean the same thing across the three CSV shapes the model
# produces.
PROJECTION_COL = {
    "preseason": "season_projection",
    "weekly": "final_projection",
    "ros": "ros_projection",
}
GAMES_COL = {"preseason": "games", "ros": "games_remaining"}
DOME_ROOFS = {"dome", "closed"}


def weather_label(roof, temp, wind) -> str | None:
    """A compact, self-contained weather string for the weekly board.
    nflverse doesn't publish temp/wind until close to kickoff, so this is
    often None for a game more than a week or so out -- that's real
    unknown data, not a bug, so it's left blank rather than guessed."""
    if pd.notna(roof) and roof in DOME_ROOFS:
        return "🏟️ Dome"
    if pd.isna(temp) and pd.isna(wind):
        return None
    temp_str = f"{int(temp)}°F" if pd.notna(temp) else "?"
    wind_str = f"{int(wind)}mph" if pd.notna(wind) else "?"
    emoji = "🌤️"
    if pd.notna(wind) and wind > 15:
        emoji = "💨"
    elif pd.notna(temp) and temp < 32:
        emoji = "❄️"
    elif pd.notna(temp) and temp > 85:
        emoji = "🥵"
    return f"{emoji} {temp_str}, {wind_str} wind"


def build_entries(df: pd.DataFrame, ranking_type: str, photo_map: dict[str, str],
                   overrides: dict[str, str], previous_ranks: dict[str, int],
                   logo_map: dict[str, str]) -> list[dict]:
    projection_col = PROJECTION_COL[ranking_type]
    # Only the weekly board has a single, well-defined opponent per player
    # (build_weekly_rankings carries it straight from project_week) --
    # preseason/ROS span the whole season or many remaining games, so
    # there's no one "opponent" to show.
    has_opponent = "opponent" in df.columns
    has_opp_rank = "opp_rank" in df.columns
    has_weather = "roof" in df.columns  # weekly only
    has_dome_games = "dome_games" in df.columns  # ROS only

    # `main()`'s weekly output has no rank column at all (just a top-30
    # slice sorted by final_projection) -- derive one instead of requiring
    # the pipeline to add it.
    if "overall_rank" not in df.columns:
        df = df.sort_values(projection_col, ascending=False).reset_index(drop=True)
        df["overall_rank"] = df.index + 1
    if "position_rank" not in df.columns:
        df["position_rank"] = df.groupby("position")[projection_col].rank(
            ascending=False, method="first").astype(int)

    games_col = GAMES_COL.get(ranking_type)

    entries = []
    unmatched = []
    for _, row in df.iterrows():
        name = row["player_name"]
        slug = slugify(name)
        norm = normalize_name(name)
        photo = overrides.get(name) or photo_map.get(norm)
        if not photo:
            photo = PLACEHOLDER_PHOTO
            unmatched.append(name)

        rank = int(row["overall_rank"])
        opponent = row["opponent"] if has_opponent and pd.notna(row["opponent"]) else None
        # N/A until week 2 -- see build_weekly_rankings in pipeline.py for
        # why week 1 is deliberately blank rather than a prior-season-only
        # estimate.
        opp_rank = int(row["opp_rank"]) if has_opp_rank and pd.notna(row["opp_rank"]) else None
        dome = bool(row["roof"] in DOME_ROOFS) if has_weather and pd.notna(row["roof"]) else None
        weather = weather_label(row["roof"], row["temp"], row["wind"]) if has_weather else None
        dome_games = int(row["dome_games"]) if has_dome_games and pd.notna(row["dome_games"]) else None
        entries.append({
            "slug": slug,
            "rank": rank,
            "position_rank": int(row["position_rank"]),
            "name": name,
            "position": row["position"],
            "team": row["team"],
            "photo_url": photo,
            "opponent": opponent,
            "opponent_logo_url": logo_map.get(opponent) if opponent else None,
            "opp_rank": opp_rank,
            "dome": dome,
            "weather": weather,
            "dome_games": dome_games,
            "projection": round(float(row[projection_col]), 1),
            "projection_label": projection_col,
            "games": int(row[games_col]) if games_col and games_col in row else None,
            "rank_change": rank_change(previous_ranks, slug, rank),
            "roster_status": row.get("roster_status", "ACT"),
        })

    if unmatched:
        print(f"[warn] {len(unmatched)} player(s) had no photo match (using placeholder): "
              f"{', '.join(unmatched[:15])}{'...' if len(unmatched) > 15 else ''}")
    else:
        print("[info] every player matched a photo")

    return entries


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, help="Path to the pipeline's CSV output")
    parser.add_argument("--week", required=True, help='Manifest key, e.g. "preseason", "week-01", "ros-week-01"')
    parser.add_argument("--label", required=True, help='Display label, e.g. "Week 1"')
    parser.add_argument("--type", required=True, choices=["preseason", "weekly", "ros"])
    parser.add_argument("--format", default="ppr", choices=["ppr", "half_ppr", "standard"],
                         help="Scoring format the source CSV was generated with (default: ppr)")
    args = parser.parse_args()

    RANKINGS_DIR.mkdir(parents=True, exist_ok=True)
    PLAYERS_DIR.mkdir(parents=True, exist_ok=True)

    df = pd.read_csv(args.source)
    photo_map = load_photo_map()
    overrides = load_overrides()
    logo_map = load_team_logo_map()
    previous_ranks = load_previous_ranks(args.type, args.week, args.format)

    entries = build_entries(df, args.type, photo_map, overrides, previous_ranks, logo_map)
    entries.sort(key=lambda e: e["rank"])

    out_path = RANKINGS_DIR / f"{args.week}__{args.format}.json"
    out_path.write_text(json.dumps(entries, indent=2))
    update_index(args.week, args.label, args.type)
    print(f"[info] wrote {len(entries)} players to {out_path}")


if __name__ == "__main__":
    main()
