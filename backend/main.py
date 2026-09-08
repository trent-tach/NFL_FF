"""
Fantasy Football API — entry point.

Spring Boot translation guide:
  - This file is roughly your @SpringBootApplication class + a @RestController in one.
  - `app = FastAPI()` is like the Spring application context being created.
  - `@app.get("/api/health")` is @GetMapping("/api/health").
  - The returned dict is auto-serialized to JSON, like returning an object
    from a @RestController method (Jackson does it in Spring; FastAPI uses Pydantic).
  - uvicorn (see README) plays the role of embedded Tomcat.
"""

import json
from pathlib import Path

from fastapi import FastAPI, HTTPException

app = FastAPI(title="Fantasy Football API")

DATA_DIR = Path(__file__).parent / "data"
RANKINGS_DIR = DATA_DIR / "rankings"


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "message": "Hello from FastAPI — backend and frontend are connected!",
    }


SCORING_FORMATS = ("ppr", "half_ppr", "standard")


def _load_rankings_file(key: str, scoring_format: str | None = None) -> list[dict]:
    filename = f"{key}__{scoring_format}.json" if scoring_format else f"{key}.json"
    path = RANKINGS_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"No rankings found for '{key}' ({scoring_format})")
    return json.loads(path.read_text())


@app.get("/api/rankings/redraft")
def redraft_manifest() -> list[dict]:
    index_path = RANKINGS_DIR / "index.json"
    if not index_path.exists():
        return []
    return json.loads(index_path.read_text())


def _manifest_type(week_key: str) -> str | None:
    index_path = RANKINGS_DIR / "index.json"
    if not index_path.exists():
        return None
    manifest = json.loads(index_path.read_text())
    entry = next((e for e in manifest if e["key"] == week_key), None)
    return entry["type"] if entry else None


# Kicker, DST, and game-prediction boards have no PPR/Half/Standard
# scoring-format variant (like dynasty.json) -- their files are plain
# `{key}.json`.
NO_FORMAT_TYPES = ("kicker", "dst", "games")


@app.get("/api/rankings/redraft/{week_key}")
def redraft_week(week_key: str, format: str = "ppr") -> list[dict]:
    if _manifest_type(week_key) in NO_FORMAT_TYPES:
        return _load_rankings_file(week_key)
    if format not in SCORING_FORMATS:
        raise HTTPException(status_code=400, detail=f"format must be one of {SCORING_FORMATS}")
    return _load_rankings_file(week_key, format)


@app.get("/api/rankings/dynasty")
def dynasty_rankings() -> list[dict]:
    return _load_rankings_file("dynasty")


@app.get("/api/games/{week_key}")
def game_predictions(week_key: str) -> list[dict]:
    return _load_rankings_file(week_key)


@app.get("/api/players/{slug}")
def player_detail(slug: str, format: str = "ppr") -> dict:
    if format not in SCORING_FORMATS:
        raise HTTPException(status_code=400, detail=f"format must be one of {SCORING_FORMATS}")
    manifest_path = RANKINGS_DIR / "index.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else []

    history = []
    player = None
    for entry in manifest:
        if entry["type"] in NO_FORMAT_TYPES:
            continue  # kicker/DST entries are a different schema (no PPR variants)
        rankings = _load_rankings_file(entry["key"], format)
        match = next((p for p in rankings if p["slug"] == slug), None)
        if match is None:
            continue
        player = player or match
        history.append({
            "week_key": entry["key"],
            "week_label": entry["label"],
            "type": entry["type"],
            "rank": match["rank"],
            "projection": match["projection"],
        })

    if player is None:
        raise HTTPException(status_code=404, detail=f"No player found for '{slug}'")

    return {
        "slug": player["slug"],
        "name": player["name"],
        "position": player["position"],
        "team": player["team"],
        "photo_url": player["photo_url"],
        "history": history,
    }
