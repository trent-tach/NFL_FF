import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import type { RankingManifestItem, UsageStatEntry } from "@/lib/types";
import UsageStatsTable from "@/components/UsageStatsTable";

// Usage is season-to-date through the most recently completed week, not a
// per-week snapshot -- there's no such thing as "this week's target share"
// before the week is played. See build_usage_stats_board in pipeline.py.

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE"] as const;
type PositionFilter = (typeof POSITIONS)[number];

const CONTROL =
  "rounded-full border border-border-strong bg-surface px-4 py-2 font-display text-[12px] font-bold uppercase tracking-[0.06em] transition-colors hover:bg-hover-tint";

export default function AdvancedStatsPage() {
  const [manifest, setManifest] = useState<RankingManifestItem[]>([]);
  const [weekKey, setWeekKey] = useState<string | null>(null);
  const [entries, setEntries] = useState<UsageStatEntry[]>([]);
  const [entriesKey, setEntriesKey] = useState<string | null>(null);
  const [position, setPosition] = useState<PositionFilter>("ALL");
  const [team, setTeam] = useState<string>("ALL");
  const [error, setError] = useState<string | null>(null);

  const usageWeeks = useMemo(() => manifest.filter((m) => m.type === "usage"), [manifest]);

  useEffect(() => {
    apiGet<RankingManifestItem[]>("/rankings/redraft")
      .then((data) => {
        setManifest(data);
        const weeks = data.filter((m) => m.type === "usage");
        if (weeks.length > 0) setWeekKey(weeks[weeks.length - 1].key);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!weekKey) return;
    let cancelled = false;
    apiGet<UsageStatEntry[]>(`/rankings/redraft/${weekKey}`)
      .then((data) => {
        if (cancelled) return;
        setEntries(data);
        setEntriesKey(weekKey);
      })
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [weekKey]);

  const teams = useMemo(
    () => [...new Set(entries.map((p) => p.team))].sort(),
    [entries],
  );

  const visibleEntries = useMemo(() => {
    if (entriesKey !== weekKey) return [];
    return entries
      .filter((p) => position === "ALL" || p.position === position)
      .filter((p) => team === "ALL" || p.team === team);
  }, [entries, entriesKey, weekKey, position, team]);

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Advanced Stats</h1>
      <p className="mt-2 text-muted">
        Season-to-date usage — target share, snap share, red zone looks — through the most
        recently completed week. The same inputs the model itself trains on, not a separate story.
      </p>

      {error && (
        <div className="mt-4 rounded-card border border-danger-border bg-danger-soft px-4 py-3 text-danger">
          <strong>Could not load usage stats</strong> ({error}).
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <select
          value={weekKey ?? ""}
          onChange={(e) => setWeekKey(e.target.value)}
          aria-label="Week"
          className={CONTROL}
        >
          {usageWeeks.map((w) => (
            <option key={w.key} value={w.key}>
              {w.label}
            </option>
          ))}
        </select>

        <select value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Team" className={CONTROL}>
          <option value="ALL">All Teams</option>
          {teams.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <div role="group" aria-label="Position" className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {POSITIONS.map((pos) => (
            <button
              key={pos}
              onClick={() => setPosition(pos)}
              aria-pressed={position === pos}
              className={`shrink-0 rounded-full px-3.5 py-2 font-display text-[12px] font-bold uppercase tracking-[0.06em] transition-colors ${
                position === pos ? "bg-brand text-on-brand" : "border border-border-strong hover:bg-hover-tint"
              }`}
            >
              {pos}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        {entriesKey === weekKey ? (
          <UsageStatsTable entries={visibleEntries} />
        ) : (
          <p className="py-8 text-center text-muted">Loading…</p>
        )}
      </div>
    </div>
  );
}
