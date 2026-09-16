"""Proxies to third-party fantasy platform APIs for the My Leagues feature.

Nothing here is persisted server-side -- the site has no accounts yet, so
"my leagues" (including a private ESPN league's espn_s2/SWID cookies) lives
in the browser's localStorage and gets sent fresh with each request. This
module's only job is looking up a league's teams so the frontend can show a
"pick your team" list, and is deliberately read-only (GET calls to the
platforms, never anything that could modify a real league).
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/leagues", tags=["leagues"])

SLEEPER_BASE = "https://api.sleeper.app/v1"
ESPN_BASE = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl"

# Sleeper's full player directory is a ~5MB static-ish file meant to be
# fetched once and cached, not re-pulled per request (same pattern as the
# photo/team-logo caches in scripts/_photos.py).
SLEEPER_PLAYERS_CACHE = Path(__file__).parent / "data" / "players" / "sleeper_players_cache.json"
_sleeper_players_memo: dict | None = None


async def _load_sleeper_players() -> dict:
    global _sleeper_players_memo
    if _sleeper_players_memo is not None:
        return _sleeper_players_memo
    if SLEEPER_PLAYERS_CACHE.exists():
        _sleeper_players_memo = json.loads(SLEEPER_PLAYERS_CACHE.read_text())
        return _sleeper_players_memo

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(f"{SLEEPER_BASE}/players/nfl")
    resp.raise_for_status()
    players = resp.json()
    SLEEPER_PLAYERS_CACHE.parent.mkdir(parents=True, exist_ok=True)
    SLEEPER_PLAYERS_CACHE.write_text(json.dumps(players))
    _sleeper_players_memo = players
    return players


@router.get("/state")
async def nfl_state() -> dict:
    """Current NFL week, so the frontend can default a matchup view to
    "this week" instead of making the user pick one."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(f"{SLEEPER_BASE}/state/nfl")
    resp.raise_for_status()
    return resp.json()


# Sleeper's flat roster_positions list (e.g. ["QB","RB","RB","WR","WR","WR",
# "TE","FLEX","K","DEF","BN","BN","BN","BN","BN","BN","IR"]) -- counted into
# the same slot shape CustomRosterSlots uses. Anything not in this map
# (IDP slots, TAXI, REC_FLEX/WRRB_FLEX variants) is uncommon enough to skip
# rather than guess at a bucket for.
SLEEPER_ROSTER_POSITION_MAP = {
    "QB": "qb", "RB": "rb", "WR": "wr", "TE": "te", "FLEX": "flex",
    "SUPER_FLEX": "superflex", "K": "k", "DEF": "dst", "BN": "bench", "IR": "ir",
}


def _sleeper_roster_slots(roster_positions: list[str]) -> dict:
    slots = dict.fromkeys(SLEEPER_ROSTER_POSITION_MAP.values(), 0)
    for position in roster_positions:
        key = SLEEPER_ROSTER_POSITION_MAP.get(position)
        if key:
            slots[key] += 1
    return slots


def _sleeper_scoring_rules(scoring_settings: dict) -> dict:
    """Sleeper's own field names (pass_yd, pass_int, fum_lost, etc.) mapped
    onto the camelCase shape CustomScoringRules uses on the frontend."""
    return {
        "passYd": scoring_settings.get("pass_yd", 0.04),
        "passTd": scoring_settings.get("pass_td", 4),
        "interception": scoring_settings.get("pass_int", -2),
        "rushYd": scoring_settings.get("rush_yd", 0.1),
        "rushTd": scoring_settings.get("rush_td", 6),
        "reception": scoring_settings.get("rec", 0),
        "recYd": scoring_settings.get("rec_yd", 0.1),
        "recTd": scoring_settings.get("rec_td", 6),
        "fumbleLost": scoring_settings.get("fum_lost", -2),
        "teBonus": scoring_settings.get("bonus_rec_te", 0),
    }


@router.get("/sleeper/{league_id}")
async def sleeper_league(league_id: str) -> dict:
    """League name/scoring plus one row per team (owner + roster), so the
    frontend can offer a "which team is yours" picker."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        league_resp, rosters_resp, users_resp = await asyncio.gather(
            client.get(f"{SLEEPER_BASE}/league/{league_id}"),
            client.get(f"{SLEEPER_BASE}/league/{league_id}/rosters"),
            client.get(f"{SLEEPER_BASE}/league/{league_id}/users"),
        )

    if league_resp.status_code != 200 or league_resp.json() is None:
        raise HTTPException(status_code=404, detail="No Sleeper league found for that ID")

    league = league_resp.json()
    rosters = rosters_resp.json() or []
    users = {u["user_id"]: u for u in (users_resp.json() or [])}

    scoring_settings = league.get("scoring_settings") or {}
    rec_pts = scoring_settings.get("rec", 0)
    scoring_format = "ppr" if rec_pts >= 1 else "half_ppr" if rec_pts >= 0.5 else "standard"

    teams = []
    for roster in rosters:
        owner = users.get(roster.get("owner_id"), {})
        metadata = owner.get("metadata") or {}
        teams.append({
            "roster_id": roster["roster_id"],
            "owner_id": roster.get("owner_id"),
            "team_name": metadata.get("team_name") or owner.get("display_name") or f"Roster {roster['roster_id']}",
            "owner_display_name": owner.get("display_name"),
            "avatar_url": f"https://sleepercdn.com/avatars/{owner['avatar']}" if owner.get("avatar") else None,
            "wins": (roster.get("settings") or {}).get("wins"),
            "losses": (roster.get("settings") or {}).get("losses"),
        })

    return {
        "platform": "sleeper",
        "league_id": league_id,
        "league_name": league.get("name"),
        "season": league.get("season"),
        "scoring_format": scoring_format,
        "roster_slots": _sleeper_roster_slots(league.get("roster_positions") or []),
        "scoring_rules": _sleeper_scoring_rules(scoring_settings),
        "teams": teams,
    }


@router.get("/sleeper/{league_id}/matchup")
async def sleeper_matchup(league_id: str, week: int, roster_id: int) -> dict:
    """This week's matchup for one roster: your starters and your
    opponent's, with the live/final points Sleeper has already computed
    under your league's own scoring settings -- no need to recompute
    fantasy points ourselves here, unlike the screenshot-import path will
    have to."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        matchups_resp, rosters_resp, users_resp = await asyncio.gather(
            client.get(f"{SLEEPER_BASE}/league/{league_id}/matchups/{week}"),
            client.get(f"{SLEEPER_BASE}/league/{league_id}/rosters"),
            client.get(f"{SLEEPER_BASE}/league/{league_id}/users"),
        )
    matchups = matchups_resp.json() or []
    my_entry = next((m for m in matchups if m["roster_id"] == roster_id), None)
    if my_entry is None:
        raise HTTPException(status_code=404, detail="No matchup found for that roster/week")
    opp_entry = next(
        (m for m in matchups if m["matchup_id"] == my_entry["matchup_id"] and m["roster_id"] != roster_id), None)

    players = await _load_sleeper_players()
    rosters = {r["roster_id"]: r for r in (rosters_resp.json() or [])}
    users = {u["user_id"]: u for u in (users_resp.json() or [])}

    def team_label(rid: int) -> str:
        owner = users.get((rosters.get(rid) or {}).get("owner_id"), {})
        metadata = owner.get("metadata") or {}
        return metadata.get("team_name") or owner.get("display_name") or f"Roster {rid}"

    def build_side(entry: dict | None) -> dict | None:
        if entry is None:
            return None
        starters = entry.get("starters") or []
        starter_pts = entry.get("starters_points") or []
        roster_players = []
        for i, player_id in enumerate(starters):
            meta = players.get(player_id, {})
            position = meta.get("position")
            team = meta.get("team")
            # Sleeper represents a team defense as a "player" whose id/team
            # is just the team abbreviation (e.g. "SEA") -- no headshot for
            # that, so fall back to the same team-logo CDN the DST rankings
            # board already uses.
            if position == "DEF" and team:
                photo_url = f"https://a.espncdn.com/i/teamlogos/nfl/500/{team.lower()}.png"
            else:
                photo_url = f"https://sleepercdn.com/content/nfl/players/thumb/{player_id}.jpg"
            roster_players.append({
                "player_id": player_id,
                "name": meta.get("full_name") or player_id,
                "position": position,
                "team": team,
                "photo_url": photo_url,
                "points": starter_pts[i] if i < len(starter_pts) else None,
            })
        return {
            "roster_id": entry["roster_id"],
            "team_name": team_label(entry["roster_id"]),
            "players": roster_players,
            "total": entry.get("points"),
        }

    return {"week": week, "my_team": build_side(my_entry), "opponent": build_side(opp_entry)}


# ESPN's scoring stat IDs are undocumented and reverse-engineered by the
# community -- only the ones below are confirmed from multiple consistent
# sources. The rest (receiving yards/TD, fumble lost, TE bonus) come back
# as None rather than a guessed ID, since a wrong statId would silently
# mislabel a league's actual scoring.
ESPN_SCORING_STAT_IDS = {
    "passYd": 3, "passTd": 4, "interception": 20, "rushYd": 23, "rushTd": 25, "reception": 53,
}
ESPN_UNVERIFIED_SCORING_FIELDS = ("recYd", "recTd", "fumbleLost", "teBonus")


def _espn_scoring_rules(scoring_items: list[dict]) -> dict:
    by_stat_id = {item.get("statId"): item.get("points") for item in scoring_items}
    rules = {field: by_stat_id.get(stat_id) for field, stat_id in ESPN_SCORING_STAT_IDS.items()}
    rules.update(dict.fromkeys(ESPN_UNVERIFIED_SCORING_FIELDS))
    return rules


@router.get("/espn")
async def espn_league(league_id: str, season: int, espn_s2: str | None = None, swid: str | None = None) -> dict:
    """Same shape as the Sleeper endpoint, for ESPN. Public leagues need
    only league_id + season; private leagues need espn_s2/SWID pulled from
    the user's own browser cookies for espn.com (there's no login flow for
    ESPN's fantasy API -- this is the only way in for a private league)."""
    cookies = {}
    if espn_s2 and swid:
        cookies = {"espn_s2": espn_s2, "SWID": swid}

    url = f"{ESPN_BASE}/seasons/{season}/segments/0/leagues/{league_id}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, params={"view": "mTeam"}, cookies=cookies)

    if resp.status_code in (401, 403):
        raise HTTPException(
            status_code=401,
            detail="This ESPN league is private (or the cookies are wrong/expired) -- "
                   "add espn_s2 and SWID from your own espn.com cookies.",
        )
    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail="No ESPN league found for that ID/season")
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"ESPN API returned {resp.status_code}")

    data = resp.json()
    teams = []
    for team in data.get("teams", []):
        name = team.get("name") or f"{team.get('location', '')} {team.get('nickname', '')}".strip()
        teams.append({
            "team_id": team["id"],
            "team_name": name or f"Team {team['id']}",
            "abbrev": team.get("abbrev"),
            "logo_url": team.get("logo"),
            "wins": (team.get("record") or {}).get("overall", {}).get("wins"),
            "losses": (team.get("record") or {}).get("overall", {}).get("losses"),
        })

    settings = data.get("settings") or {}
    scoring_items = (settings.get("scoringSettings") or {}).get("scoringItems") or []
    scoring_rules = _espn_scoring_rules(scoring_items)
    rec_pts = scoring_rules["reception"] or 0
    scoring_format = "ppr" if rec_pts >= 1 else "half_ppr" if rec_pts >= 0.5 else "standard"

    return {
        "platform": "espn",
        "league_id": league_id,
        "league_name": settings.get("name"),
        "season": season,
        "scoring_format": scoring_format,
        # ESPN's roster-slot IDs (lineupSlotCounts) aren't confidently
        # sourced the way Sleeper's roster_positions are -- rather than
        # guess at a mapping, this stays null until that's verified.
        "roster_slots": None,
        "scoring_rules": scoring_rules,
        "teams": teams,
    }


# ESPN's numeric position/team IDs -- stable, widely-used mappings (the
# same ones every open-source ESPN fantasy client relies on), since ESPN's
# API returns IDs, not the readable position/team codes Sleeper does.
ESPN_POSITION_MAP = {1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "D/ST"}
ESPN_TEAM_MAP = {
    0: "FA", 1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN",
    8: "DET", 9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR", 15: "MIA",
    16: "MIN", 17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT",
    24: "LAC", 25: "SF", 26: "SEA", 27: "TB", 28: "WAS", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU",
}
ESPN_BENCH_SLOTS = {20, 21}  # Bench, IR -- everything else counts as a starter


@router.get("/espn/matchup")
async def espn_matchup(league_id: str, season: int, team_id: int, week: int,
                        espn_s2: str | None = None, swid: str | None = None) -> dict:
    """Best-effort equivalent of the Sleeper matchup endpoint above.
    ESPN's boxscore response is undocumented and has shifted shape before
    -- written defensively (a missing field just comes back None instead
    of a 500) but, unlike the Sleeper path, hasn't been exercised against
    a real league yet. Flag anything that looks wrong."""
    cookies = {"espn_s2": espn_s2, "SWID": swid} if espn_s2 and swid else {}
    url = f"{ESPN_BASE}/seasons/{season}/segments/0/leagues/{league_id}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            url,
            params=[("view", "mMatchupScore"), ("view", "mBoxscore"), ("scoringPeriodId", str(week))],
            cookies=cookies,
        )

    if resp.status_code in (401, 403):
        raise HTTPException(status_code=401, detail="ESPN rejected the request -- cookies may be wrong/expired.")
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"ESPN API returned {resp.status_code}")

    data = resp.json()
    game = next(
        (g for g in data.get("schedule", [])
         if g.get("matchupPeriodId") == week
         and team_id in ((g.get("home") or {}).get("teamId"), (g.get("away") or {}).get("teamId"))),
        None,
    )
    if game is None:
        raise HTTPException(status_code=404, detail="No matchup found for that team/week")

    mine = game["home"] if game["home"].get("teamId") == team_id else game["away"]
    theirs = game["away"] if game["home"].get("teamId") == team_id else game["home"]
    teams_by_id = {t["id"]: t for t in data.get("teams", [])}

    def team_label(side: dict) -> str:
        team = teams_by_id.get(side.get("teamId"), {})
        name = team.get("name") or f"{team.get('location', '')} {team.get('nickname', '')}".strip()
        return name or f"Team {side.get('teamId')}"

    def build_side(side: dict | None) -> dict | None:
        if side is None:
            return None
        entries = ((side.get("rosterForCurrentScoringPeriod") or {}).get("entries")) or []
        roster_players = []
        for entry in entries:
            if entry.get("lineupSlotId") in ESPN_BENCH_SLOTS:
                continue
            pool_entry = entry.get("playerPoolEntry") or {}
            player = pool_entry.get("player") or {}
            position = ESPN_POSITION_MAP.get(player.get("defaultPositionId"))
            team = ESPN_TEAM_MAP.get(player.get("proTeamId"))
            if position == "D/ST" and team and team not in ("FA",):
                photo_url = f"https://a.espncdn.com/i/teamlogos/nfl/500/{team.lower()}.png"
            else:
                photo_url = f"https://a.espncdn.com/i/headshots/nfl/players/full/{player.get('id')}.png"
            roster_players.append({
                "player_id": player.get("id"),
                "name": player.get("fullName"),
                "position": position,
                "team": team,
                "photo_url": photo_url,
                "points": pool_entry.get("appliedStatTotal"),
            })
        return {
            "team_id": side.get("teamId"),
            "team_name": team_label(side),
            "players": roster_players,
            "total": side.get("totalPoints"),
        }

    return {"week": week, "my_team": build_side(mine), "opponent": build_side(theirs)}
