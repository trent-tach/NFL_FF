"""Converts a pipeline usage-stats CSV (build_usage_stats_board output)
into the JSON shape the website serves, joins in player photos and team
logos/colors, and updates the rankings manifest. Run with the model's own
venv:

    ~/Desktop/FF/.venv/bin/python backend/scripts/build_usage_stats.py \\
        --source ~/Desktop/FF/usage_week_02.csv \\
        --week usage-week-02 --label "Week 2"

Unlike the rankings/kicker/DST converters, there is no rank concept here to
diff week over week -- this is a stats explorer, not a ranking, so there's
no `rank_change` field and no `load_previous_ranks` call."""

from __future__ import annotations

import argparse
import json

import pandas as pd

from _photos import (
    RANKINGS_DIR, PLAYERS_DIR, PLACEHOLDER_PHOTO, normalize_name, slugify,
    load_photo_map, load_overrides, load_team_logo_map, load_team_color_map, update_index,
)

RANKING_TYPE = "usage"


def build_entries(df: pd.DataFrame, photo_map: dict[str, str], overrides: dict[str, str],
                   logo_map: dict[str, str], color_map: dict[str, dict[str, str]]) -> list[dict]:
    entries = []
    unmatched = []
    for _, row in df.iterrows():
        name = row["player_display_name"]
        team = row["team"]
        photo = overrides.get(name) or photo_map.get(normalize_name(name))
        if not photo:
            photo = PLACEHOLDER_PHOTO
            unmatched.append(name)

        entries.append({
            "player_id": row["player_id"],
            "slug": slugify(name),
            "name": name,
            "team": team,
            "position": row["position"],
            "photo_url": photo,
            "logo_url": logo_map.get(team),
            "team_color": (color_map.get(team) or {}).get("primary"),
            "games": int(row["games"]),
            "target_share": round(float(row["target_share"]), 3) if pd.notna(row["target_share"]) else None,
            "air_yards": int(row["air_yards"]) if pd.notna(row["air_yards"]) else None,
            "air_yards_share": round(float(row["air_yards_share"]), 3) if pd.notna(row["air_yards_share"]) else None,
            "adot": round(float(row["adot"]), 1) if pd.notna(row["adot"]) else None,
            "red_zone_targets": int(row["red_zone_targets"]),
            "rush_share": round(float(row["rush_share"]), 3) if pd.notna(row["rush_share"]) else None,
            "snap_pct": round(float(row["snap_pct"]), 1) if pd.notna(row["snap_pct"]) else None,
            "team_success_rate": round(float(row["team_success_rate"]), 3) if pd.notna(row["team_success_rate"]) else None,
        })

    if unmatched:
        print(f"[warn] {len(unmatched)} player(s) had no photo match (using placeholder): "
              f"{', '.join(unmatched[:15])}{'...' if len(unmatched) > 15 else ''}")
    else:
        print("[info] every player matched a photo")

    return entries


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, help="Path to build_usage_stats_board's CSV output")
    parser.add_argument("--week", required=True, help='Manifest key, e.g. "usage-week-02"')
    parser.add_argument("--label", required=True, help='Display label, e.g. "Week 2"')
    args = parser.parse_args()

    RANKINGS_DIR.mkdir(parents=True, exist_ok=True)
    PLAYERS_DIR.mkdir(parents=True, exist_ok=True)

    df = pd.read_csv(args.source)
    photo_map = load_photo_map()
    overrides = load_overrides()
    logo_map = load_team_logo_map()
    color_map = load_team_color_map()

    entries = build_entries(df, photo_map, overrides, logo_map, color_map)

    out_path = RANKINGS_DIR / f"{args.week}.json"
    out_path.write_text(json.dumps(entries, indent=2))
    update_index(args.week, args.label, RANKING_TYPE)
    print(f"[info] wrote {len(entries)} players to {out_path}")


if __name__ == "__main__":
    main()
