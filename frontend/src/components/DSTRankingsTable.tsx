import type { DSTEntry } from "@/lib/types";
import RankChangeBadge from "./RankChangeBadge";

// Team logo instead of a player headshot; exposes the actual factors
// driving the projection (pressure rate, opponent's offense rank, this
// defense's own season output) since those are the ranking's whole pitch,
// not a deferred stats-table phase.

function OffenseRankBadge({ rank }: { rank: number | null }) {
  if (rank === null) return <span className="text-muted">—</span>;
  // A defense facing a weak (high-numbered) offense has the easier
  // matchup -- green there mirrors OppRankBadge's convention elsewhere.
  const color = rank >= 23 ? "text-green-600" : rank <= 10 ? "text-red-600" : "text-muted";
  return <span className={`font-medium ${color}`}>{rank}</span>;
}

export default function DSTRankingsTable({ entries }: { entries: DSTEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-muted">No defenses in this ranking.</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-muted">
          <th className="py-2 pr-2 w-10">#</th>
          <th className="py-2 pr-2"></th>
          <th className="py-2 pr-2">Team</th>
          <th className="py-2 pr-2">Opp</th>
          <th className="py-2 pr-2 text-right">Proj</th>
          <th className="py-2 pr-2 text-right">Pressure%</th>
          <th className="py-2 pr-2 text-right">Opp Off Rk</th>
          <th className="py-2 pr-2 text-right">Sacks/G</th>
          <th className="py-2 pr-2 text-right">TO/G</th>
          <th className="py-2 pr-2 text-right">PA/G</th>
          <th className="py-2 pl-2">Chg</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((d) => (
          <tr key={d.slug} className="border-b border-border/60 hover:bg-black/[0.02]">
            <td className="py-2 pr-2 font-medium">{d.rank}</td>
            <td className="py-2 pr-2">
              <img src={d.logo_url} alt={d.team} width={28} height={28} />
            </td>
            <td className="py-2 pr-2 font-medium">{d.team}</td>
            <td className="py-2 pr-2 text-muted">{d.opponent}</td>
            <td className="py-2 pr-2 text-right tabular-nums">{d.projection.toFixed(1)}</td>
            <td className="py-2 pr-2 text-right tabular-nums">{(d.pressure_rate * 100).toFixed(1)}%</td>
            <td className="py-2 pr-2 text-right tabular-nums">
              <OffenseRankBadge rank={d.opponent_offense_rank} />
            </td>
            <td className="py-2 pr-2 text-right tabular-nums text-muted">{d.sacks_pg.toFixed(1)}</td>
            <td className="py-2 pr-2 text-right tabular-nums text-muted">{d.takeaways_pg.toFixed(1)}</td>
            <td className="py-2 pr-2 text-right tabular-nums text-muted">{d.points_allowed_pg.toFixed(1)}</td>
            <td className="py-2 pl-2">
              <RankChangeBadge change={d.rank_change} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
