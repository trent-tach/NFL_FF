import { useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import type { ConnectedLeague, LeagueMatchup, MatchupSide } from "@/lib/types";
import { computeMatchupOdds } from "@/lib/matchupOdds";
import { platformLabel } from "@/lib/myLeagues";
import MatchupOddsBar from "./MatchupOddsBar";
import PlayerPhoto from "./PlayerPhoto";

function SideBlock({ side }: { side: MatchupSide | null }) {
  if (!side) return <p className="text-sm text-muted">No data for this side.</p>;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="font-semibold">{side.team_name}</span>
        <span className="text-lg font-bold tabular-nums">{side.total != null ? side.total.toFixed(1) : "—"}</span>
      </div>
      <ul className="mt-2 space-y-1 text-sm text-muted">
        {side.players.map((p, i) => (
          <li key={p.player_id ?? i} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <PlayerPhoto src={p.photo_url ?? ""} alt={p.name ?? "Unknown"} size={24} />
              <span className="truncate">{p.name ?? "Unknown"}</span>
              <span className="shrink-0 text-xs">{p.position ?? ""} {p.team ?? ""}</span>
            </span>
            <span className="shrink-0 tabular-nums">{p.points != null ? p.points.toFixed(1) : "-"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function LeagueMatchupCard({ league, week }: { league: ConnectedLeague; week: number }) {
  const [matchup, setMatchup] = useState<LeagueMatchup | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMatchup(null);
    setError(null);
    let cancelled = false;

    const path =
      league.platform === "sleeper"
        ? `/leagues/sleeper/${league.leagueId}/matchup?week=${week}&roster_id=${league.myTeam.roster_id}`
        : `/leagues/espn/matchup?league_id=${league.leagueId}&season=${league.season}&team_id=${league.myTeam.team_id}&week=${week}` +
          (league.espnAuth
            ? `&espn_s2=${encodeURIComponent(league.espnAuth.espn_s2)}&swid=${encodeURIComponent(league.espnAuth.swid)}`
            : "");

    apiGet<LeagueMatchup>(path)
      .then((data) => { if (!cancelled) setMatchup(data); })
      .catch((err: Error) => { if (!cancelled) setError(err.message); });

    return () => { cancelled = true; };
  }, [league, week]);

  const odds =
    matchup?.my_team?.total != null && matchup?.opponent?.total != null
      ? computeMatchupOdds(
          matchup.my_team.total,
          matchup.opponent.total,
          matchup.my_team.players.length,
          matchup.opponent.players.length,
        )
      : null;

  return (
    <div className="rounded-md border border-border p-5">
      <p className="text-sm text-muted">
        {league.leagueName} · {platformLabel(league.platform)} · Week {week}
      </p>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {!matchup && !error && <p className="mt-2 text-sm text-muted">Loading…</p>}
      {matchup && (
        <>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SideBlock side={matchup.my_team} />
            <SideBlock side={matchup.opponent} />
          </div>
          {odds && (
            <MatchupOddsBar
              leftLabel={matchup.my_team?.team_name ?? "You"}
              rightLabel={matchup.opponent?.team_name ?? "Opponent"}
              leftWinPct={odds.myWinPct}
              rightWinPct={odds.opponentWinPct}
            />
          )}
        </>
      )}
    </div>
  );
}
