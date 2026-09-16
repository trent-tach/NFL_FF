import { useMemo, useState } from "react";
import type { RosterPlayer } from "@/lib/types";
import PlayerPhoto from "./PlayerPhoto";

// One roster-slot box in the custom-league matchup builder: shows the
// filled player (headshot + name) with a way to change it, or a
// position-filtered search when empty. Same interaction as
// PlayerSearchSelect, but scoped to whichever positions this slot (QB,
// FLEX, SUPERFLEX, ...) is allowed to hold.

export default function RosterSlotBox({
  label,
  eligiblePositions,
  pool,
  takenSlugs,
  selected,
  onSelect,
}: {
  label: string;
  eligiblePositions: string[];
  pool: RosterPlayer[];
  takenSlugs: Set<string>;
  selected: RosterPlayer | null;
  onSelect: (player: RosterPlayer | null) => void;
}) {
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return pool
      .filter(
        (p) =>
          eligiblePositions.includes(p.position) &&
          !takenSlugs.has(p.slug) &&
          p.name.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [query, pool, eligiblePositions, takenSlugs]);

  if (selected) {
    return (
      <div className="rounded-md border border-border p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted">{label}</span>
          <button onClick={() => onSelect(null)} className="text-xs text-muted hover:text-primary">
            Change
          </button>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <PlayerPhoto src={selected.photo_url} alt={selected.name} size={32} />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{selected.name}</div>
            <div className="text-xs text-muted">
              {selected.position} · {selected.team}
            </div>
          </div>
          <span className="ml-auto shrink-0 text-sm font-semibold tabular-nums">
            {selected.projection.toFixed(1)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-dashed border-border p-2.5">
      <span className="text-xs font-semibold text-muted">{label}</span>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Add a ${eligiblePositions.join("/")}…`}
        className="mt-1.5 w-full rounded-md border border-border px-2 py-1 text-sm"
      />
      {matches.length > 0 && (
        <ul className="mt-1 max-h-40 overflow-y-auto rounded-md border border-border">
          {matches.map((p) => (
            <li key={p.slug}>
              <button
                onClick={() => {
                  onSelect(p);
                  setQuery("");
                }}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-hover-tint"
              >
                <PlayerPhoto src={p.photo_url} alt={p.name} size={20} />
                <span className="truncate font-medium">{p.name}</span>
                <span className="shrink-0 text-xs text-muted">
                  {p.position} · {p.team}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim() && matches.length === 0 && (
        <p className="mt-1 text-xs text-muted">No {eligiblePositions.join("/")} matches "{query}".</p>
      )}
    </div>
  );
}
