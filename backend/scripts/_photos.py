"""Shared helpers for the rankings converter scripts (build_rankings.py,
build_kicker_rankings.py, build_dst_rankings.py): player-photo / team-logo
joining, and the manifest bookkeeping (rank-change diffing, index.json
updates) common to all three, extracted here so the three scripts don't
drift out of sync with three copies of the same logic."""

from __future__ import annotations

import json
import re
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
RANKINGS_DIR = DATA_DIR / "rankings"
PLAYERS_DIR = DATA_DIR / "players"
PHOTO_CACHE_PATH = PLAYERS_DIR / "photo_cache.json"
PHOTO_OVERRIDES_PATH = PLAYERS_DIR / "photo_overrides.json"
TEAM_LOGO_CACHE_PATH = PLAYERS_DIR / "team_logo_cache.json"
INDEX_PATH = RANKINGS_DIR / "index.json"
PLACEHOLDER_PHOTO = "/player-placeholder.svg"

SUFFIXES = re.compile(r"\b(jr|sr|ii|iii|iv|v)\b\.?$")
NON_ALNUM = re.compile(r"[^a-z0-9\s-]")


def normalize_name(name: str) -> str:
    """Lowercase, drop punctuation and generational suffixes, so
    "Ja'Marr Chase" and "Amon-Ra St. Brown Jr." both join cleanly against
    nflreadpy's `display_name`."""
    n = name.lower().replace(".", "").replace("'", "")
    n = NON_ALNUM.sub("", n)
    n = SUFFIXES.sub("", n).strip()
    return re.sub(r"\s+", " ", n)


def slugify(name: str) -> str:
    s = name.lower().replace("'", "")
    s = NON_ALNUM.sub("", s)
    return re.sub(r"[\s]+", "-", s.strip())


def load_photo_map() -> dict[str, str]:
    """Player photos, keyed by normalized name. Cached to disk on first run
    since `nflreadpy.load_players()` downloads a multi-MB crosswalk."""
    if PHOTO_CACHE_PATH.exists():
        return json.loads(PHOTO_CACHE_PATH.read_text())

    import nflreadpy as nfl

    players = nfl.load_players().select(["display_name", "headshot"]).to_pandas()
    photo_map: dict[str, str] = {}
    for _, row in players.dropna(subset=["headshot"]).iterrows():
        photo_map[normalize_name(row["display_name"])] = row["headshot"]

    PLAYERS_DIR.mkdir(parents=True, exist_ok=True)
    PHOTO_CACHE_PATH.write_text(json.dumps(photo_map))
    return photo_map


def load_overrides() -> dict[str, str]:
    if PHOTO_OVERRIDES_PATH.exists():
        return json.loads(PHOTO_OVERRIDES_PATH.read_text())
    return {}


def load_team_logo_map() -> dict[str, str]:
    """Team logos, keyed by team abbreviation -- an exact-match join, no
    name normalization needed. Cached like the player photo map."""
    if TEAM_LOGO_CACHE_PATH.exists():
        return json.loads(TEAM_LOGO_CACHE_PATH.read_text())

    import nflreadpy as nfl

    teams = nfl.load_teams().select(["team_abbr", "team_logo_espn"]).to_pandas()
    logo_map = dict(zip(teams["team_abbr"], teams["team_logo_espn"]))

    PLAYERS_DIR.mkdir(parents=True, exist_ok=True)
    TEAM_LOGO_CACHE_PATH.write_text(json.dumps(logo_map))
    return logo_map


def load_previous_ranks(ranking_type: str, current_key: str, suffix: str | None = None) -> dict[str, int]:
    """Rank-by-slug from the most recent manifest entry of the same type
    (and, for the QB/RB/WR/TE rankings, the same scoring-format `suffix`)
    that isn't the one we're about to (re)write, so re-running an import
    for the same week doesn't diff a file against itself."""
    if not INDEX_PATH.exists():
        return {}
    manifest = json.loads(INDEX_PATH.read_text())
    prior_entries = [e for e in manifest if e["type"] == ranking_type and e["key"] != current_key]
    if not prior_entries:
        return {}
    filename = f"{prior_entries[-1]['key']}__{suffix}.json" if suffix else f"{prior_entries[-1]['key']}.json"
    prior_path = RANKINGS_DIR / filename
    if not prior_path.exists():
        return {}
    prior_entries_data = json.loads(prior_path.read_text())
    return {p["slug"]: p["rank"] for p in prior_entries_data}


def rank_change(previous_ranks: dict[str, int], slug: str, rank: int) -> str:
    if slug not in previous_ranks:
        return "new"
    delta = previous_ranks[slug] - rank
    if delta == 0:
        return "0"
    return f"{delta:+d}"


def update_index(key: str, label: str, ranking_type: str) -> None:
    manifest = json.loads(INDEX_PATH.read_text()) if INDEX_PATH.exists() else []
    manifest = [e for e in manifest if e["key"] != key]
    manifest.append({"key": key, "label": label, "type": ranking_type})
    INDEX_PATH.write_text(json.dumps(manifest, indent=2))
