import { useEffect, useState } from "react";
import type { ConnectedLeague, CustomLeagueMatchup } from "@/lib/types";
import { getCustomLeagueMatchup, saveCustomLeagueMatchup } from "@/lib/customLeagueMatchups";
import { computeMatchupOdds } from "@/lib/matchupOdds";
import EnterCustomMatchupForm from "./EnterCustomMatchupForm";
import MatchupOddsBar from "./MatchupOddsBar";
import PlayerPhoto from "./PlayerPhoto";

function total(players: CustomLeagueMatchup["myPlayers"]): number {
  return players.reduce((sum, p) => sum + p.projection, 0);
}

export default function CustomLeagueMatchupCard({ league, week }: { league: ConnectedLeague; week: number }) {
  const [matchup, setMatchup] = useState<CustomLeagueMatchup | null>(
    () => getCustomLeagueMatchup(league.id, week) ?? null,
  );
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setMatchup(getCustomLeagueMatchup(league.id, week) ?? null);
    setEditing(false);
  }, [league.id, week]);

  const myTotal = matchup ? total(matchup.myPlayers) : 0;
  const oppTotal = matchup ? total(matchup.opponentPlayers) : 0;

  return (
    <div className="rounded-md border border-border p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {league.leagueName} · Custom · Week {week}
        </p>
        {matchup && !editing && (
          <button onClick={() => setEditing(true)} className="text-sm text-muted hover:text-primary">
            Edit
          </button>
        )}
      </div>

      {(!matchup || editing) && (
        <div className="mt-3">
          <EnterCustomMatchupForm
            league={league}
            week={week}
            initial={matchup}
            onSaved={(m) => {
              saveCustomLeagueMatchup(m);
              setMatchup(m);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}

      {matchup && !editing && (
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className={`rounded-md border p-3 ${myTotal >= oppTotal ? "border-primary" : "border-transparent"}`}>
            <div className="flex items-baseline justify-between">
              <span className="font-semibold">{league.myTeam.team_name}</span>
              <span className="text-lg font-bold tabular-nums">{myTotal.toFixed(1)}</span>
            </div>
            <ul className="mt-2 space-y-1 text-sm text-muted">
              {matchup.myPlayers.map((p) => (
                <li key={p.slug} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <PlayerPhoto src={p.photo_url} alt={p.name} size={24} />
                    <span className="truncate">{p.name}</span>
                    <span className="shrink-0 text-xs">{p.position} · {p.team}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">{p.projection.toFixed(1)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className={`rounded-md border p-3 ${oppTotal > myTotal ? "border-primary" : "border-transparent"}`}>
            <div className="flex items-baseline justify-between">
              <span className="font-semibold">{matchup.opponentTeamName}</span>
              <span className="text-lg font-bold tabular-nums">{oppTotal.toFixed(1)}</span>
            </div>
            <ul className="mt-2 space-y-1 text-sm text-muted">
              {matchup.opponentPlayers.map((p) => (
                <li key={p.slug} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <PlayerPhoto src={p.photo_url} alt={p.name} size={24} />
                    <span className="truncate">{p.name}</span>
                    <span className="shrink-0 text-xs">{p.position} · {p.team}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">{p.projection.toFixed(1)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {matchup && !editing && (() => {
        const odds = computeMatchupOdds(myTotal, oppTotal, matchup.myPlayers.length, matchup.opponentPlayers.length);
        return (
          <MatchupOddsBar
            leftLabel={league.myTeam.team_name}
            rightLabel={matchup.opponentTeamName}
            leftWinPct={odds.myWinPct}
            rightWinPct={odds.opponentWinPct}
          />
        );
      })()}
    </div>
  );
}
