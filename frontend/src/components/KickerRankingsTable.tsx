import type { KickerEntry } from "@/lib/types";
import PlayerPhoto from "./PlayerPhoto";
import RankChangeBadge from "./RankChangeBadge";

// Kickers get two projection columns (Distance sorts the board, Standard
// is for 3/4/5-point leagues) plus an advanced-stats section: season FG%,
// the team's offensive ranking, and how often that team goes for it on
// 4th down instead of giving the kicker a look.

export default function KickerRankingsTable({ entries }: { entries: KickerEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-muted">No kickers in this ranking.</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-muted">
          <th className="py-2 pr-2 w-10">#</th>
          <th className="py-2 pr-2"></th>
          <th className="py-2 pr-2">Player</th>
          <th className="py-2 pr-2">Team</th>
          <th className="py-2 pr-2">Opp</th>
          <th className="py-2 pr-2 text-right">Distance</th>
          <th className="py-2 pr-2 text-right">Standard</th>
          <th className="py-2 pr-2 text-right">FG%</th>
          <th className="py-2 pr-2 text-right">Off Rk</th>
          <th className="py-2 pr-2 text-right">4th&amp;Go%</th>
          <th className="py-2 pl-2">Chg</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((k) => (
          <tr key={k.slug} className="border-b border-border/60 hover:bg-black/[0.02]">
            <td className="py-2 pr-2 font-medium">{k.rank}</td>
            <td className="py-2 pr-2">
              <PlayerPhoto src={k.photo_url} alt={k.name} />
            </td>
            <td className="py-2 pr-2 font-medium">{k.name}</td>
            <td className="py-2 pr-2 text-muted">{k.team}</td>
            <td className="py-2 pr-2 text-muted">{k.opponent}</td>
            <td className="py-2 pr-2 text-right tabular-nums">{k.distance_projection.toFixed(1)}</td>
            <td className="py-2 pr-2 text-right tabular-nums">{k.standard_projection.toFixed(1)}</td>
            <td className="py-2 pr-2 text-right tabular-nums text-muted">
              {k.fg_pct != null ? `${(k.fg_pct * 100).toFixed(1)}%` : "—"}
            </td>
            <td className="py-2 pr-2 text-right tabular-nums text-muted">{k.offense_rank ?? "—"}</td>
            <td className="py-2 pr-2 text-right tabular-nums text-muted">
              {k.fourth_down_go_pct != null ? `${(k.fourth_down_go_pct * 100).toFixed(1)}%` : "—"}
            </td>
            <td className="py-2 pl-2">
              <RankChangeBadge change={k.rank_change} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
