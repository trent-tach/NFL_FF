import type { UsageStatEntry } from "@/lib/types";
import DataTable, { type Column } from "./DataTable";
import PlayerPhoto from "./PlayerPhoto";

// The one table on the site where every numeric column is sortable --
// this is a stats explorer, not a ranking, so there's no single correct
// order and the reader picks the axis that matters to them.
//
// Receiving-only stats (target share, aDOT, catchable %, 3rd/4th down
// targets, end zone targets) render "--" for a QB rather than a bare 0 --
// a QB genuinely being targeted zero times and a stat that doesn't apply
// to QBs at all are different facts, and 0 would quietly claim the first
// one. The three broader situational cuts (2-min / LDD / SDD) apply to
// every position, since a QB's own dropback counts the same as a WR's
// target for "did this player produce in this situation."

/** Nulls render as an em dash, never 0 -- a null aDOT (a QB never targeted)
 *  and a real 0.0 aDOT mean different things, and collapsing them would
 *  quietly lie about players who legitimately have the stat. */
const pct = (v: number | null, digits = 0) => (v != null ? `${(v * 100).toFixed(digits)}%` : "—");
const num = (v: number | null, digits = 0) => (v != null ? v.toFixed(digits) : "—");

const isQb = (p: UsageStatEntry) => p.position === "QB";

/** A situational-bucket cell: the PPR points it produced, sortable, with a
 *  second line underneath giving it context. `share` (a % of this player's
 *  OWN targets) is used for the two receiving-only cuts, where "42% of his
 *  targets were on 3rd/4th down" is the more useful read than a bare
 *  count; `opportunities` (a raw count) is used for the broader 2-min/LDD/
 *  SDD cuts, which mix targets/carries/attempts and have no single "share
 *  of what" that means the same thing across positions. `applicable`
 *  false renders a blank dash for a QB on the receiving-only cuts. */
function BucketCell({
  ppr,
  share,
  opportunities,
  applicable,
}: {
  ppr: number;
  share?: number | null;
  opportunities?: number;
  applicable: boolean;
}) {
  if (!applicable) return <span className="text-muted">—</span>;
  return (
    <span className="flex flex-col items-end leading-tight">
      <span className="font-display font-bold tabular-nums">{ppr.toFixed(1)}</span>
      <span className="text-[11px] text-muted">
        {share != null ? pct(share, 0) + " of tgt" : `${opportunities} opp`}
      </span>
    </span>
  );
}

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
    key: "total_ppr",
    header: "PPR",
    align: "right",
    sortable: true,
    sortValue: (p) => p.total_ppr,
    cell: (p) => p.total_ppr.toFixed(1),
  },
  {
    key: "ppr_rank",
    header: "PPR Rk",
    align: "right",
    hideBelow: "md",
    sortable: true,
    sortValue: (p) => p.ppr_rank,
    cell: (p) => `#${p.ppr_rank}`,
  },
  {
    key: "ppg",
    header: "PPG",
    align: "right",
    sortable: true,
    sortValue: (p) => p.ppg,
    cell: (p) => p.ppg.toFixed(1),
  },
  {
    key: "xppg",
    header: "xPPG",
    align: "right",
    sortable: true,
    sortValue: (p) => p.xppg,
    cell: (p) => num(p.xppg, 1),
  },
  {
    key: "fpoe",
    header: "FPOE/G",
    align: "right",
    sortable: true,
    sortValue: (p) => p.fpoe_per_game,
    cell: (p) =>
      p.fpoe_per_game == null ? (
        "—"
      ) : (
        <span className={p.fpoe_per_game >= 0 ? "text-success" : "text-danger"}>
          {p.fpoe_per_game > 0 ? "+" : ""}
          {p.fpoe_per_game.toFixed(1)}
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
    sortValue: (p) => (isQb(p) ? null : p.target_share),
    cell: (p) => (isQb(p) ? "—" : pct(p.target_share, 1)),
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
    key: "catchable_pct",
    header: "Catchable%",
    align: "right",
    hideBelow: "lg",
    sortable: true,
    sortValue: (p) => (isQb(p) ? null : p.catchable_target_pct),
    cell: (p) => (isQb(p) ? "—" : pct(p.catchable_target_pct, 1)),
  },
  {
    key: "adot",
    header: "aDOT",
    align: "right",
    hideBelow: "md",
    sortable: true,
    sortValue: (p) => (isQb(p) ? null : p.adot),
    cell: (p) => (isQb(p) ? "—" : num(p.adot, 1)),
  },
  {
    key: "red_zone_targets",
    header: "RZ Tgt",
    align: "right",
    hideBelow: "lg",
    sortable: true,
    sortValue: (p) => (isQb(p) ? null : p.red_zone_targets),
    cell: (p) => (isQb(p) ? "—" : p.red_zone_targets),
  },
  {
    key: "third_fourth",
    header: "3rd/4th Dn",
    align: "right",
    sortable: true,
    sortValue: (p) => (isQb(p) ? null : p.third_fourth_down_ppr),
    cell: (p) => (
      <BucketCell
        ppr={p.third_fourth_down_ppr}
        share={p.third_fourth_down_target_pct}
        applicable={!isQb(p)}
      />
    ),
  },
  {
    key: "end_zone",
    header: "End Zone",
    align: "right",
    hideBelow: "lg",
    sortable: true,
    sortValue: (p) => (isQb(p) ? null : p.end_zone_ppr),
    cell: (p) => <BucketCell ppr={p.end_zone_ppr} share={p.end_zone_target_pct} applicable={!isQb(p)} />,
  },
  {
    key: "play_action_pct",
    header: "PA Tgt%",
    align: "right",
    hideBelow: "lg",
    sortable: true,
    sortValue: (p) => (isQb(p) ? null : p.play_action_target_pct),
    cell: (p) => (isQb(p) ? "—" : pct(p.play_action_target_pct, 1)),
  },
  {
    key: "air_yards_share",
    header: "Air Yd%",
    align: "right",
    hideBelow: "lg",
    sortable: true,
    sortValue: (p) => (isQb(p) ? null : p.air_yards_share),
    cell: (p) => (isQb(p) ? "—" : pct(p.air_yards_share, 1)),
  },
  {
    key: "two_min",
    header: "2-Min",
    align: "right",
    sortable: true,
    sortValue: (p) => p.two_min_ppr,
    cell: (p) => (
      <BucketCell
        ppr={p.two_min_ppr}
        opportunities={p.two_min_targets + p.two_min_carries + p.two_min_attempts}
        applicable
      />
    ),
  },
  {
    key: "ldd",
    header: "LDD",
    align: "right",
    sortable: true,
    sortValue: (p) => p.ldd_ppr,
    cell: (p) => (
      <BucketCell ppr={p.ldd_ppr} opportunities={p.ldd_targets + p.ldd_carries + p.ldd_attempts} applicable />
    ),
  },
  {
    key: "sdd",
    header: "SDD",
    align: "right",
    hideBelow: "md",
    sortable: true,
    sortValue: (p) => p.sdd_ppr,
    cell: (p) => (
      <BucketCell ppr={p.sdd_ppr} opportunities={p.sdd_targets + p.sdd_carries + p.sdd_attempts} applicable />
    ),
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

function MobileStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="font-display font-bold tabular-nums">{value}</dd>
    </div>
  );
}

export default function UsageStatsTable({ entries }: { entries: UsageStatEntry[] }) {
  return (
    <DataTable
      rows={entries}
      columns={columns}
      rowKey={(p) => p.player_id}
      emptyMessage="No season-to-date usage data yet for this week."
      renderCard={(p) => {
        const qb = isQb(p);
        return (
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
              <MobileStat label="PPR" value={`${p.total_ppr.toFixed(1)} (#${p.ppr_rank})`} />
              <MobileStat label="PPG" value={p.ppg.toFixed(1)} />
              <MobileStat label="xPPG" value={num(p.xppg, 1)} />
              <MobileStat
                label="FPOE/G"
                value={p.fpoe_per_game == null ? "—" : `${p.fpoe_per_game > 0 ? "+" : ""}${p.fpoe_per_game.toFixed(1)}`}
              />
              <MobileStat label="Snap %" value={num(p.snap_pct) + (p.snap_pct != null ? "%" : "")} />
              <MobileStat label="Tgt Share" value={qb ? "—" : pct(p.target_share, 1)} />
              <MobileStat label="Rush Share" value={pct(p.rush_share, 1)} />
              <MobileStat label="Catchable%" value={qb ? "—" : pct(p.catchable_target_pct, 1)} />
              <MobileStat label="PA Tgt%" value={qb ? "—" : pct(p.play_action_target_pct, 1)} />
              <MobileStat label="Air Yd%" value={qb ? "—" : pct(p.air_yards_share, 1)} />
              <MobileStat label="RZ Tgt" value={qb ? "—" : String(p.red_zone_targets)} />
              <MobileStat label="Team Success%" value={pct(p.team_success_rate, 1)} />
              <MobileStat
                label="3rd/4th Dn PPR"
                value={qb ? "—" : `${p.third_fourth_down_ppr.toFixed(1)} (${pct(p.third_fourth_down_target_pct, 0)})`}
              />
              <MobileStat
                label="End Zone PPR"
                value={qb ? "—" : `${p.end_zone_ppr.toFixed(1)} (${pct(p.end_zone_target_pct, 0)})`}
              />
              <MobileStat label="2-Min PPR" value={p.two_min_ppr.toFixed(1)} />
              <MobileStat label="LDD PPR" value={p.ldd_ppr.toFixed(1)} />
              <MobileStat label="SDD PPR" value={p.sdd_ppr.toFixed(1)} />
            </dl>
          </div>
        );
      }}
    />
  );
}
