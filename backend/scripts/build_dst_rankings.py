"""Converts a pipeline DST CSV (build_dst_rankings output) into the JSON
shape the website serves, joins in a team logo, and updates the rankings
manifest. Run with the model's own venv:

    ~/Desktop/FF/.venv/bin/python backend/scripts/build_dst_rankings.py \\
        --source ~/Desktop/FF/dst_week_01.csv \\
        --week dst-week-01 --label "Week 1"
"""

from __future__ import annotations

import argparse
import json

import pandas as pd

from _photos import (
    RANKINGS_DIR, PLAYERS_DIR, load_team_logo_map, load_previous_ranks, rank_change, update_index,
)

RANKING_TYPE = "dst"


def build_entries(df: pd.DataFrame, logo_map: dict[str, str], previous_ranks: dict[str, int]) -> list[dict]:
    entries = []
    unmatched = []
    for _, row in df.iterrows():
        team = row["team"]
        slug = team.lower()
        rank = int(row["overall_rank"])
        logo = logo_map.get(team)
        if not logo:
            unmatched.append(team)

        entries.append({
            "slug": slug,
            "rank": rank,
            "team": team,
            "opponent": row["opponent"],
            "logo_url": logo or "/player-placeholder.svg",
            "projection": round(float(row["standard_dst_projection"]), 2),
            "pressure_rate": round(float(row["pressure_rate"]), 3),
            "opponent_offense_rank": int(row["opponent_offense_rank"]) if pd.notna(row["opponent_offense_rank"]) else None,
            "bottom_10_offense_faced": bool(row["bottom_10_offense_faced"]),
            "sacks_pg": round(float(row["sacks_pg"]), 2),
            "takeaways_pg": round(float(row["takeaways_pg"]), 2),
            "points_allowed_pg": round(float(row["points_allowed_pg"]), 1),
            "rank_change": rank_change(previous_ranks, slug, rank),
        })

    if unmatched:
        print(f"[warn] {len(unmatched)} team(s) had no logo match: {', '.join(unmatched)}")
    else:
        print("[info] every team matched a logo")

    return entries


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, help="Path to build_dst_rankings' CSV output")
    parser.add_argument("--week", required=True, help='Manifest key, e.g. "dst-week-01"')
    parser.add_argument("--label", required=True, help='Display label, e.g. "Week 1"')
    args = parser.parse_args()

    RANKINGS_DIR.mkdir(parents=True, exist_ok=True)
    PLAYERS_DIR.mkdir(parents=True, exist_ok=True)

    df = pd.read_csv(args.source)
    logo_map = load_team_logo_map()
    previous_ranks = load_previous_ranks(RANKING_TYPE, args.week)

    entries = build_entries(df, logo_map, previous_ranks)
    entries.sort(key=lambda e: e["rank"])

    out_path = RANKINGS_DIR / f"{args.week}.json"
    out_path.write_text(json.dumps(entries, indent=2))
    update_index(args.week, args.label, RANKING_TYPE)
    print(f"[info] wrote {len(entries)} teams to {out_path}")


if __name__ == "__main__":
    main()
