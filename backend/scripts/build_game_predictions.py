"""Converts a pipeline game-predictions CSV (build_game_predictions output)
into the JSON shape the /games page serves, joins in team logos, and
updates the rankings manifest. Run with the model's own venv:

    ~/Desktop/FF/.venv/bin/python backend/scripts/build_game_predictions.py \\
        --source ~/Desktop/FF/games_week_01.csv \\
        --week games-week-01 --label "Week 1"
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime

import pandas as pd

from _photos import RANKINGS_DIR, PLAYERS_DIR, load_team_logo_map, update_index

RANKING_TYPE = "games"


def spread_display(home_team: str, away_team: str, spread_line: float) -> str:
    """nflverse's spread_line is signed so positive = home favored (see
    compute_vegas_game_script in pipeline.py) -- convert to the
    conventional "FAVORITE -N.N" a reader expects."""
    if spread_line > 0:
        return f"{home_team} -{spread_line:g}"
    if spread_line < 0:
        return f"{away_team} -{-spread_line:g}"
    return "PICK'EM"


def kickoff_display(gameday: str, gametime: str) -> str:
    dt = datetime.strptime(f"{gameday} {gametime}", "%Y-%m-%d %H:%M")
    return dt.strftime("%a, %b %-d").upper() + " · " + dt.strftime("%H:%M")


def build_entries(df: pd.DataFrame, logo_map: dict[str, str]) -> list[dict]:
    entries = []
    for _, row in df.iterrows():
        home, away = row["home_team"], row["away_team"]
        pick = row["pick_team"]
        pick_win_pct = row["home_win_pct"] if pick == home else row["away_win_pct"]
        entries.append({
            "game_id": row["game_id"],
            "kickoff": kickoff_display(row["gameday"], row["gametime"]),
            "gameday": row["gameday"],
            "gametime": row["gametime"],
            "spread_display": spread_display(home, away, row["spread_line"]),
            "total_line": row["total_line"],
            "away_team": away,
            "away_logo_url": logo_map.get(away),
            "away_score": row["away_score"],
            "away_band_low": row["away_band_low"],
            "away_band_high": row["away_band_high"],
            "away_win_pct": row["away_win_pct"],
            "home_team": home,
            "home_logo_url": logo_map.get(home),
            "home_score": row["home_score"],
            "home_band_low": row["home_band_low"],
            "home_band_high": row["home_band_high"],
            "home_win_pct": row["home_win_pct"],
            "pick_team": pick,
            "pick_win_pct": pick_win_pct,
            "is_upset": bool(row["is_upset"]),
        })
    return entries


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, help="Path to build_game_predictions' CSV output")
    parser.add_argument("--week", required=True, help='Manifest key, e.g. "games-week-01"')
    parser.add_argument("--label", required=True, help='Display label, e.g. "Week 1"')
    args = parser.parse_args()

    RANKINGS_DIR.mkdir(parents=True, exist_ok=True)
    PLAYERS_DIR.mkdir(parents=True, exist_ok=True)

    df = pd.read_csv(args.source)
    logo_map = load_team_logo_map()

    entries = build_entries(df, logo_map)

    out_path = RANKINGS_DIR / f"{args.week}.json"
    out_path.write_text(json.dumps(entries, indent=2))
    update_index(args.week, args.label, RANKING_TYPE)
    print(f"[info] wrote {len(entries)} games to {out_path}")


if __name__ == "__main__":
    main()
