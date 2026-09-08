import { Link } from "react-router-dom";
import type { RankingEntry } from "@/lib/types";
import PlayerPhoto from "./PlayerPhoto";
import RankChangeBadge from "./RankChangeBadge";

// Shared by the Redraft and Dynasty pages -- same columns, same photo/rank
// treatment, only the data feeding it differs.

function OppRankBadge({ oppRank }: { oppRank: number | null }) {
  if (oppRank === null) {
    return <span className="text-muted">N/A</span>;
  }
  // 1 = hardest matchup, 32 = easiest -- a quick red/green tint on the
  // extremes makes the number scannable without reading the header twice.
  const color = oppRank <= 10 ? "text-red-600" : oppRank >= 23 ? "text-green-600" : "text-muted";
  return <span className={`font-medium ${color}`}>{oppRank}</span>;
}

export default function RankingsTable({ entries }: { entries: RankingEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-muted">No players in this ranking.</p>;
  }

  // Only the weekly board has a single well-defined opponent/venue per
  // player (preseason/ROS span the whole season or many games) -- show
  // these columns only when the data actually has them.
  // `!= null` (loose) on purpose -- preseason/ROS JSON objects don't carry
  // these keys at all, so they read as `undefined`, not `null`; `!==`
  // would treat `undefined !== null` as true and show the column anyway.
  const showOpponent = entries.some((p) => p.opponent);
  const showWeather = entries.some((p) => p.weather != null || p.dome != null);
  const showDomeGames = entries.some((p) => p.dome_games != null);

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-muted">
          <th className="py-2 pr-2 w-10">#</th>
          <th className="py-2 pr-2"></th>
          <th className="py-2 pr-2">Player</th>
          <th className="py-2 pr-2">Pos</th>
          <th className="py-2 pr-2">Team</th>
          {showOpponent && <th className="py-2 pr-2">Opp</th>}
          {showOpponent && <th className="py-2 pr-2">Opp Rk</th>}
          {showWeather && <th className="py-2 pr-2">Weather</th>}
          {showDomeGames && <th className="py-2 pr-2 text-right">Dome G</th>}
          <th className="py-2 pr-2 text-right">Proj</th>
          <th className="py-2 pl-2">Chg</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((p) => (
          <tr key={p.slug} className="border-b border-border/60 hover:bg-black/[0.02]">
            <td className="py-2 pr-2 font-medium">{p.rank}</td>
            <td className="py-2 pr-2">
              <PlayerPhoto src={p.photo_url} alt={p.name} />
            </td>
            <td className="py-2 pr-2">
              <Link to={`/players/${p.slug}`} className="font-medium hover:text-primary">
                {p.name}
              </Link>
            </td>
            <td className="py-2 pr-2 text-muted">{p.position}</td>
            <td className="py-2 pr-2 text-muted">{p.team}</td>
            {showOpponent && (
              <td className="py-2 pr-2 text-muted">
                {p.opponent && (
                  <span className="inline-flex items-center gap-1.5">
                    {p.opponent_logo_url && (
                      <img src={p.opponent_logo_url} alt={p.opponent} width={18} height={18} />
                    )}
                    {p.opponent}
                  </span>
                )}
              </td>
            )}
            {showOpponent && (
              <td className="py-2 pr-2">
                <OppRankBadge oppRank={p.opp_rank} />
              </td>
            )}
            {showWeather && (
              <td className="py-2 pr-2 text-muted whitespace-nowrap">{p.weather ?? "—"}</td>
            )}
            {showDomeGames && (
              <td className="py-2 pr-2 text-right tabular-nums text-muted">{p.dome_games}</td>
            )}
            <td className="py-2 pr-2 text-right tabular-nums">{p.projection.toFixed(1)}</td>
            <td className="py-2 pl-2">
              <RankChangeBadge change={p.rank_change} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
