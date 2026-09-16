import type { DSTEntry } from "@/lib/types";
import DataTable, { type Column } from "./DataTable";
import RankChangeBadge from "./RankChangeBadge";

// Team logo instead of a player headshot; exposes the actual factors
// driving the projection (pressure rate, opponent's offense rank, this
// defense's own season output) since those are the ranking's whole pitch,
// not a deferred stats-table phase.

function OffenseRankBadge({ rank }: { rank: number | null }) {
  if (rank === null) return <span className="text-muted">—</span>;
  // A defense facing a weak (high-numbered) offense has the easier
  // matchup -- green there mirrors OppRankBadge's convention elsewhere.
  const color = rank >= 23 ? "text-success" : rank <= 10 ? "text-danger" : "text-muted";
  return <span className={`font-medium ${color}`}>{rank}</span>;
}

function TeamLogo({ src, team }: { src: string; team: string }) {
  return <img src={src} alt="" width={28} height={28} loading="lazy" title={team} />;
}

const columns: Column<DSTEntry>[] = [
  { key: "rank", header: "#", className: "w-10 font-medium tabular-nums", cell: (d) => d.rank },
  {
    key: "logo",
    header: <span className="sr-only">Logo</span>,
    className: "w-12",
    cell: (d) => <TeamLogo src={d.logo_url} team={d.team} />,
  },
  { key: "team", header: "Team", className: "font-semibold", cell: (d) => d.team },
  { key: "opp", header: "Opp", className: "text-muted", cell: (d) => d.opponent },
  {
    key: "proj",
    header: "Proj",
    align: "right",
    className: "font-display font-bold",
    cell: (d) => d.projection.toFixed(1),
  },
  {
    key: "pressure",
    header: "Pressure%",
    align: "right",
    hideBelow: "md",
    cell: (d) => `${(d.pressure_rate * 100).toFixed(1)}%`,
  },
  {
    key: "oppoff",
    header: "Opp Off Rk",
    align: "right",
    hideBelow: "md",
    cell: (d) => <OffenseRankBadge rank={d.opponent_offense_rank} />,
  },
  {
    key: "sacks",
    header: "Sacks/G",
    align: "right",
    hideBelow: "lg",
    className: "text-muted",
    cell: (d) => d.sacks_pg.toFixed(1),
  },
  {
    key: "to",
    header: "TO/G",
    align: "right",
    hideBelow: "lg",
    className: "text-muted",
    cell: (d) => d.takeaways_pg.toFixed(1),
  },
  {
    key: "pa",
    header: "PA/G",
    align: "right",
    hideBelow: "lg",
    className: "text-muted",
    cell: (d) => d.points_allowed_pg.toFixed(1),
  },
  { key: "chg", header: "Chg", hideBelow: "md", cell: (d) => <RankChangeBadge change={d.rank_change} /> },
];

export default function DSTRankingsTable({ entries }: { entries: DSTEntry[] }) {
  return (
    <DataTable
      rows={entries}
      columns={columns}
      rowKey={(d) => d.slug}
      emptyMessage="No defenses in this ranking."
      renderCard={(d) => (
        <div className="flex items-center gap-3 rounded-card border border-border bg-surface px-3 py-2.5">
          <span className="w-6 text-right font-display text-sm font-bold tabular-nums text-muted">
            {d.rank}
          </span>
          <TeamLogo src={d.logo_url} team={d.team} />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{d.team}</span>
            <span className="mt-0.5 block text-xs text-muted">
              vs {d.opponent} · {(d.pressure_rate * 100).toFixed(0)}% pressure
            </span>
          </span>
          <span className="font-display text-base font-bold tabular-nums">
            {d.projection.toFixed(1)}
          </span>
        </div>
      )}
    />
  );
}
