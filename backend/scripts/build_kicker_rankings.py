"""Converts a pipeline kicker CSV (build_kicker_rankings output) into the
JSON shape the website serves and updates the rankings manifest. Run with
the model's own venv:

    ~/Desktop/FF/.venv/bin/python backend/scripts/build_kicker_rankings.py \\
        --source ~/Desktop/FF/kickers_week_01.csv \\
        --week kickers-week-01 --label "Week 1"
"""

from __future__ import annotations

import argparse
import json

import pandas as pd

from _photos import RANKINGS_DIR, PLAYERS_DIR, slugify, load_previous_ranks, rank_change, update_index

RANKING_TYPE = "kicker"


def build_entries(df: pd.DataFrame, previous_ranks: dict[str, int]) -> list[dict]:
    entries = []
    for _, row in df.iterrows():
        slug = slugify(row["player_name"])
        rank = int(row["overall_rank"])
        entries.append({
            "slug": slug,
            "rank": rank,
            "name": row["player_name"],
            "team": row["team"],
            "opponent": row["opponent"],
            "photo_url": row["headshot_url"] if pd.notna(row["headshot_url"]) else "/player-placeholder.svg",
            "distance_projection": round(float(row["distance_projection"]), 2),
            "standard_projection": round(float(row["standard_projection"]), 2),
            "fg_pct": round(float(row["fg_pct"]), 3) if pd.notna(row["fg_pct"]) else None,
            "offense_rank": int(row["offense_rank"]) if pd.notna(row["offense_rank"]) else None,
            "fourth_down_go_pct": round(float(row["fourth_down_go_pct"]), 3) if pd.notna(row["fourth_down_go_pct"]) else None,
            "rank_change": rank_change(previous_ranks, slug, rank),
            "roster_status": row.get("roster_status", "ACT"),
        })
    return entries


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, help="Path to build_kicker_rankings' CSV output")
    parser.add_argument("--week", required=True, help='Manifest key, e.g. "kickers-week-01"')
    parser.add_argument("--label", required=True, help='Display label, e.g. "Week 1"')
    args = parser.parse_args()

    RANKINGS_DIR.mkdir(parents=True, exist_ok=True)
    PLAYERS_DIR.mkdir(parents=True, exist_ok=True)

    df = pd.read_csv(args.source)
    previous_ranks = load_previous_ranks(RANKING_TYPE, args.week)

    entries = build_entries(df, previous_ranks)
    entries.sort(key=lambda e: e["rank"])

    out_path = RANKINGS_DIR / f"{args.week}.json"
    out_path.write_text(json.dumps(entries, indent=2))
    update_index(args.week, args.label, RANKING_TYPE)
    print(f"[info] wrote {len(entries)} kickers to {out_path}")


if __name__ == "__main__":
    main()
