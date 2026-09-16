import { Link } from "react-router-dom";
import type { RankingEntry } from "@/lib/types";
import DataTable, { type Column } from "./DataTable";
import PlayerPhoto from "./PlayerPhoto";
import RankChangeBadge from "./RankChangeBadge";
import StatusChip from "./StatusChip";

// Shared by the Redraft and Dynasty pages -- same columns, same photo/rank
// treatment, only the data feeding it differs.

function OppRankBadge({ oppRank }: { oppRank: number | null }) {
  if (oppRank === null) {
    return <span className="text-muted">N/A</span>;
  }
  // 1 = hardest matchup, 32 = easiest -- a quick red/green tint on the
  // extremes makes the number scannable without reading the header twice.
  const color = oppRank <= 10 ? "text-danger" : oppRank >= 23 ? "text-success" : "text-muted";
  return <span className={`font-medium ${color}`}>{oppRank}</span>;
}

/** No opponent on a board that otherwise has them means this player isn't
 *  playing. It only reads as a bye when the row also carries a bye week --
 *  otherwise it's a schedule join that missed, which is a different problem
 *  and shouldn't be labeled as one. */
function Opponent({ p }: { p: RankingEntry }) {
  if (!p.opponent) {
    return p.bye_week != null ? <StatusChip status="bye" /> : <span className="text-muted">—</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-muted">
      {p.opponent_logo_url && (
        <img src={p.opponent_logo_url} alt="" width={18} height={18} loading="lazy" />
      )}
      {p.opponent}
    </span>
  );
}

export default function RankingsTable({ entries }: { entries: RankingEntry[] }) {
  // Only the weekly board has a single well-defined opponent/venue per
  // player (preseason/ROS span the whole season or many games) -- show
  // these columns only when the data actually has them.
  // `!= null` (loose) on purpose -- preseason/ROS JSON objects don't carry
  // these keys at all, so they read as `undefined`, not `null`; `!==`
  // would treat `undefined !== null` as true and show the column anyway.
  const showOpponent = entries.some((p) => p.opponent);
  const showWeather = entries.some((p) => p.weather != null || p.dome != null);
  const showDomeGames = entries.some((p) => p.dome_games != null);
  const showBye = entries.some((p) => p.bye_week != null);

  const columns: (Column<RankingEntry> | false)[] = [
    {
      key: "rank",
      header: "#",
      className: "w-10 font-medium tabular-nums",
      cell: (p) => p.rank,
    },
    {
      key: "photo",
      header: <span className="sr-only">Photo</span>,
      className: "w-12",
      cell: (p) => <PlayerPhoto src={p.photo_url} alt={p.name} size={36} />,
    },
    {
      key: "player",
      header: "Player",
      cell: (p) => (
        <span className="flex items-center gap-2">
          <Link to={`/players/${p.slug}`} className="font-semibold hover:text-brand">
            {p.name}
          </Link>
          <StatusChip status={p.injury_status} />
        </span>
      ),
    },
    { key: "pos", header: "Pos", className: "text-muted", cell: (p) => p.position },
    { key: "team", header: "Team", className: "text-muted", cell: (p) => p.team },
    showBye && {
      key: "bye",
      header: "Bye",
      hideBelow: "md" as const,
      className: "text-muted tabular-nums",
      cell: (p) => p.bye_week ?? "—",
    },
    showOpponent && {
      key: "opp",
      header: "Opp",
      cell: (p) => <Opponent p={p} />,
    },
    showOpponent && {
      key: "opprk",
      header: "Opp Rk",
      hideBelow: "lg" as const,
      cell: (p) => <OppRankBadge oppRank={p.opp_rank} />,
    },
    showWeather && {
      key: "weather",
      header: "Weather",
      hideBelow: "lg" as const,
      className: "whitespace-nowrap text-muted",
      cell: (p) => p.weather ?? "—",
    },
    showDomeGames && {
      key: "domeg",
      header: "Dome G",
      align: "right" as const,
      hideBelow: "lg" as const,
      className: "text-muted",
      cell: (p) => p.dome_games,
    },
    {
      key: "proj",
      header: "Proj",
      align: "right" as const,
      className: "font-display font-bold",
      cell: (p) => p.projection.toFixed(1),
    },
    {
      key: "chg",
      header: "Chg",
      hideBelow: "md" as const,
      cell: (p) => <RankChangeBadge change={p.rank_change} />,
    },
  ];

  return (
    <DataTable
      rows={entries}
      columns={columns.filter(Boolean) as Column<RankingEntry>[]}
      rowKey={(p) => p.slug}
      emptyMessage="No players in this ranking."
      // Below `sm` the same row becomes a card: rank, face, name and
      // projection stay, and the context columns fold into one line.
      renderCard={(p) => (
        <Link
          to={`/players/${p.slug}`}
          className="flex items-center gap-3 rounded-card border border-border bg-surface px-3 py-2.5"
        >
          <span className="w-6 text-right font-display text-sm font-bold tabular-nums text-muted">
            {p.rank}
          </span>
          <PlayerPhoto src={p.photo_url} alt={p.name} size={36} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate font-semibold">{p.name}</span>
              <StatusChip status={p.injury_status} />
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted">
              {p.position} · {p.team}
              {p.opponent ? ` · vs ${p.opponent}` : ""}
              {p.bye_week != null ? ` · Bye ${p.bye_week}` : ""}
            </span>
          </span>
          <span className="font-display text-base font-bold tabular-nums">
            {p.projection.toFixed(1)}
          </span>
        </Link>
      )}
    />
  );
}
