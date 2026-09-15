import type { KickerEntry } from "@/lib/types";
import DataTable, { type Column } from "./DataTable";
import PlayerPhoto from "./PlayerPhoto";
import RankChangeBadge from "./RankChangeBadge";

// Kickers get two projection columns (Distance sorts the board, Standard
// is for 3/4/5-point leagues) plus an advanced-stats section: season FG%,
// the team's offensive ranking, and how often that team goes for it on
// 4th down instead of giving the kicker a look.

const pct = (v: number | null) => (v != null ? `${(v * 100).toFixed(1)}%` : "—");

const columns: Column<KickerEntry>[] = [
  { key: "rank", header: "#", className: "w-10 font-medium tabular-nums", cell: (k) => k.rank },
  {
    key: "photo",
    header: <span className="sr-only">Photo</span>,
    className: "w-12",
    cell: (k) => <PlayerPhoto src={k.photo_url} alt={k.name} size={36} />,
  },
  { key: "name", header: "Player", className: "font-semibold", cell: (k) => k.name },
  { key: "team", header: "Team", className: "text-muted", cell: (k) => k.team },
  { key: "opp", header: "Opp", className: "text-muted", cell: (k) => k.opponent },
  {
    key: "distance",
    header: "Distance",
    align: "right",
    className: "font-display font-bold",
    cell: (k) => k.distance_projection.toFixed(1),
  },
  {
    key: "standard",
    header: "Standard",
    align: "right",
    hideBelow: "md",
    cell: (k) => k.standard_projection.toFixed(1),
  },
  { key: "fg", header: "FG%", align: "right", hideBelow: "lg", className: "text-muted", cell: (k) => pct(k.fg_pct) },
  {
    key: "offrk",
    header: "Off Rk",
    align: "right",
    hideBelow: "lg",
    className: "text-muted",
    cell: (k) => k.offense_rank ?? "—",
  },
  {
    key: "fourth",
    header: "4th&Go%",
    align: "right",
    hideBelow: "lg",
    className: "text-muted",
    cell: (k) => pct(k.fourth_down_go_pct),
  },
  { key: "chg", header: "Chg", hideBelow: "md", cell: (k) => <RankChangeBadge change={k.rank_change} /> },
];

export default function KickerRankingsTable({ entries }: { entries: KickerEntry[] }) {
  return (
    <DataTable
      rows={entries}
      columns={columns}
      rowKey={(k) => k.slug}
      emptyMessage="No kickers in this ranking."
      renderCard={(k) => (
        <div className="flex items-center gap-3 rounded-card border border-border bg-surface px-3 py-2.5">
          <span className="w-6 text-right font-display text-sm font-bold tabular-nums text-muted">
            {k.rank}
          </span>
          <PlayerPhoto src={k.photo_url} alt={k.name} size={36} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{k.name}</span>
            <span className="mt-0.5 block text-xs text-muted">
              {k.team} · vs {k.opponent}
            </span>
          </span>
          <span className="font-display text-base font-bold tabular-nums">
            {k.distance_projection.toFixed(1)}
          </span>
        </div>
      )}
    />
  );
}
