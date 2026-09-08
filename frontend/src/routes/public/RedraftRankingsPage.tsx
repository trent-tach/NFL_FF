import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import type {
  RankingEntry, RankingManifestItem, RankingType, ScoringFormat, KickerEntry, DSTEntry,
} from "@/lib/types";
import RankingsTable from "@/components/RankingsTable";
import KickerRankingsTable from "@/components/KickerRankingsTable";
import DSTRankingsTable from "@/components/DSTRankingsTable";

// The week/scoring-format selector only ever needs to distinguish these
// three -- Kickers and DST aren't a "week" you pick, they're an extra
// position filter (see POSITIONS below) that swaps in a different board.
const GROUP_LABEL: Record<"preseason" | "weekly" | "ros", string> = {
  preseason: "Preseason",
  weekly: "Weekly",
  ros: "Rest of Season",
};
const GROUP_ORDER: ("preseason" | "weekly" | "ros")[] = ["preseason", "weekly", "ros"];
const REDRAFT_TYPES = new Set<RankingType>(GROUP_ORDER);
const SCORING_FORMATS: { value: ScoringFormat; label: string }[] = [
  { value: "ppr", label: "PPR" },
  { value: "half_ppr", label: "Half PPR" },
  { value: "standard", label: "Standard" },
];

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE", "FLEX", "K", "DST"] as const;
type PositionFilter = (typeof POSITIONS)[number];
const FLEX_POSITIONS = new Set(["RB", "WR", "TE"]);
// K/DST aren't a filter on the current week's QB/RB/WR/TE list -- they
// swap in an entirely different board (Project Upright / the DST model).
const SPECIAL_POSITIONS = new Set<PositionFilter>(["K", "DST"]);

export default function RedraftRankingsPage() {
  const [manifest, setManifest] = useState<RankingManifestItem[]>([]);
  const [weekKey, setWeekKey] = useState<string | null>(null);
  const [scoringFormat, setScoringFormat] = useState<ScoringFormat>("ppr");
  const [entries, setEntries] = useState<RankingEntry[]>([]);
  // The key `entries` was fetched for -- guards against a slow earlier
  // request resolving after a fast later one and rendering mismatched data.
  const [entriesKey, setEntriesKey] = useState<string | null>(null);
  const [position, setPosition] = useState<PositionFilter>("ALL");
  const [kickerEntries, setKickerEntries] = useState<KickerEntry[] | null>(null);
  const [dstEntries, setDstEntries] = useState<DSTEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load the manifest once and default to the most recently added
  // Preseason/Weekly/ROS week (Kickers/DST are never the initial view).
  useEffect(() => {
    apiGet<RankingManifestItem[]>("/rankings/redraft")
      .then((data) => {
        setManifest(data);
        const redraftWeeks = data.filter((m) => REDRAFT_TYPES.has(m.type));
        if (redraftWeeks.length > 0) setWeekKey(redraftWeeks[redraftWeeks.length - 1].key);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!weekKey) return;
    let cancelled = false;
    apiGet<RankingEntry[]>(`/rankings/redraft/${weekKey}?format=${scoringFormat}`)
      .then((data) => {
        if (cancelled) return;
        setEntries(data);
        setEntriesKey(weekKey);
      })
      .catch((err: Error) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [weekKey, scoringFormat]);

  // Kickers/DST are lazy-loaded on first click -- most visits never need
  // them, and there's only ever one "current" board for each right now.
  useEffect(() => {
    if (position === "K" && kickerEntries === null) {
      const key = [...manifest].reverse().find((m) => m.type === "kicker")?.key;
      if (key) apiGet<KickerEntry[]>(`/rankings/redraft/${key}`).then(setKickerEntries).catch((err: Error) => setError(err.message));
    }
    if (position === "DST" && dstEntries === null) {
      const key = [...manifest].reverse().find((m) => m.type === "dst")?.key;
      if (key) apiGet<DSTEntry[]>(`/rankings/redraft/${key}`).then(setDstEntries).catch((err: Error) => setError(err.message));
    }
  }, [position, manifest, kickerEntries, dstEntries]);

  const entriesReady = entriesKey === weekKey;

  const grouped = useMemo(() => {
    const byType: Record<"preseason" | "weekly" | "ros", RankingManifestItem[]> = {
      preseason: [], weekly: [], ros: [],
    };
    for (const item of manifest) {
      if (item.type === "preseason" || item.type === "weekly" || item.type === "ros") {
        byType[item.type].push(item);
      }
    }
    return byType;
  }, [manifest]);

  const visibleEntries = useMemo(() => {
    if (!entriesReady || SPECIAL_POSITIONS.has(position)) return [];
    if (position === "ALL") return entries;
    if (position === "FLEX") return entries.filter((e) => FLEX_POSITIONS.has(e.position));
    return entries.filter((e) => e.position === position);
  }, [entries, position, entriesReady]);

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Redraft Rankings</h1>
      <p className="mt-2 text-muted">Model projections, updated as the season progresses.</p>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          <strong>Could not load rankings</strong> ({error}).
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <select
          value={weekKey ?? ""}
          onChange={(e) => setWeekKey(e.target.value)}
          className="rounded-md border border-border px-3 py-1.5 text-sm"
        >
          {GROUP_ORDER.filter((t) => grouped[t].length > 0).map((type) => (
            <optgroup key={type} label={GROUP_LABEL[type]}>
              {grouped[type].map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        {!SPECIAL_POSITIONS.has(position) && (
          <select
            value={scoringFormat}
            onChange={(e) => setScoringFormat(e.target.value as ScoringFormat)}
            className="rounded-md border border-border px-3 py-1.5 text-sm"
          >
            {SCORING_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        )}

        <div className="flex gap-1">
          {POSITIONS.map((pos) => (
            <button
              key={pos}
              onClick={() => setPosition(pos)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                position === pos ? "bg-primary text-white" : "hover:bg-black/5"
              }`}
            >
              {pos}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        {position === "K" && (kickerEntries ? <KickerRankingsTable entries={kickerEntries} /> : <p className="text-muted">Loading…</p>)}
        {position === "DST" && (dstEntries ? <DSTRankingsTable entries={dstEntries} /> : <p className="text-muted">Loading…</p>)}
        {!SPECIAL_POSITIONS.has(position) && (
          entriesReady ? <RankingsTable entries={visibleEntries} /> : <p className="text-muted">Loading…</p>
        )}
      </div>
    </div>
  );
}
