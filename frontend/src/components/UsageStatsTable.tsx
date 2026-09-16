import type { UsageStatEntry } from "@/lib/types";
import DataTable, { type Column } from "./DataTable";
import PlayerPhoto from "./PlayerPhoto";

// The one table on the site where every numeric column is sortable --
// this is a stats explorer, not a ranking, so there's no single correct
// order and the reader picks the axis that matters to them.

/** Nulls render as an em dash, never 0 -- a null aDOT (a QB never targeted)
 *  and a real 0.0 aDOT mean different things, and collapsing them would
 *  quietly lie about players who legitimately have the stat. */
const pct = (v: number | null, digits = 0) => (v != null ? `${(v * 100).toFixed(digits)}%` : "—");
const num = (v: number | null, digits = 0) => (v != null ? v.toFixed(digits) : "—");

const columns: Column<UsageStatEntry>[] = [
  {
    key: "name",
    header: "Player",
    cell: (p) => (
      <span className="flex items-center gap-2">
        <PlayerPhoto src={p.photo_url} alt={p.name} size={32} />
        <span className="min-w-0">
          <span className="block truncate font-semibold">{p.name}</span>
          <span className="block text-xs text-muted">
            {p.position} · {p.team}
          </span>
        </span>
      </span>
    ),
  },
  {
    key: "snap_pct",
    header: "Snap %",
    align: "right",
    sortable: true,
    sortValue: (p) => p.snap_pct,
    cell: (p) => num(p.snap_pct, 0) + (p.snap_pct != null ? "%" : ""),
  },
  {
    key: "target_share",
    header: "Tgt Share",
    align: "right",
    sortable: true,
    sortValue: (p) => p.target_share,
    cell: (p) => pct(p.target_share, 1),
  },
  {
    key: "rush_share",
    header: "Rush Share",
    align: "right",
    hideBelow: "md",
    sortable: true,
    sortValue: (p) => p.rush_share,
    cell: (p) => pct(p.rush_share, 1),
  },
  {
    key: "adot",
    header: "aDOT",
    align: "right",
    hideBelow: "md",
    sortable: true,
    sortValue: (p) => p.adot,
    cell: (p) => num(p.adot, 1),
  },
  {
    key: "air_yards",
    header: "Air Yards",
    align: "right",
    hideBelow: "lg",
    sortable: true,
    sortValue: (p) => p.air_yards,
    cell: (p) => (p.air_yards != null ? p.air_yards.toLocaleString() : "—"),
  },
  {
    key: "air_yards_share",
    header: "Air Yd Share",
    align: "right",
    hideBelow: "lg",
    sortable: true,
    sortValue: (p) => p.air_yards_share,
    cell: (p) => pct(p.air_yards_share, 1),
  },
  {
    key: "red_zone_targets",
    header: "RZ Tgt",
    align: "right",
    hideBelow: "md",
    sortable: true,
    sortValue: (p) => p.red_zone_targets,
    cell: (p) => p.red_zone_targets,
  },
  {
    key: "team_success_rate",
    header: "Team Success%",
    align: "right",
    hideBelow: "lg",
    sortable: true,
    sortValue: (p) => p.team_success_rate,
    cell: (p) => pct(p.team_success_rate, 1),
  },
];

export default function UsageStatsTable({ entries }: { entries: UsageStatEntry[] }) {
  return (
    <DataTable
      rows={entries}
      columns={columns}
      rowKey={(p) => p.player_id}
      emptyMessage="No season-to-date usage data yet for this week."
      renderCard={(p) => (
        <div className="rounded-card border border-border bg-surface px-3 py-2.5">
          <div className="flex items-center gap-2">
            <PlayerPhoto src={p.photo_url} alt={p.name} size={36} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{p.name}</span>
              <span className="block text-xs text-muted">
                {p.position} · {p.team}
              </span>
            </span>
          </div>
          <dl className="mt-2.5 grid grid-cols-3 gap-x-2 gap-y-1.5 text-xs">
            <div>
              <dt className="text-muted">Snap %</dt>
              <dd className="font-display font-bold tabular-nums">{num(p.snap_pct)}{p.snap_pct != null ? "%" : ""}</dd>
            </div>
            <div>
              <dt className="text-muted">Tgt Share</dt>
              <dd className="font-display font-bold tabular-nums">{pct(p.target_share, 1)}</dd>
            </div>
            <div>
              <dt className="text-muted">Rush Share</dt>
              <dd className="font-display font-bold tabular-nums">{pct(p.rush_share, 1)}</dd>
            </div>
            <div>
              <dt className="text-muted">aDOT</dt>
              <dd className="font-display font-bold tabular-nums">{num(p.adot, 1)}</dd>
            </div>
            <div>
              <dt className="text-muted">RZ Tgt</dt>
              <dd className="font-display font-bold tabular-nums">{p.red_zone_targets}</dd>
            </div>
            <div>
              <dt className="text-muted">Team Success%</dt>
              <dd className="font-display font-bold tabular-nums">{pct(p.team_success_rate, 1)}</dd>
            </div>
          </dl>
        </div>
      )}
    />
  );
}
