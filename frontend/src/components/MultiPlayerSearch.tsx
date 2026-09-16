import { useMemo, useState } from "react";
import type { RankingEntry } from "@/lib/types";
import PlayerPhoto from "./PlayerPhoto";

// Same type-to-search idea as PlayerSearchSelect, but builds up a list
// instead of picking one -- used by the custom matchup builder, which
// needs a full side of players, not a single comparison target.

export default function MultiPlayerSearch({
  players,
  selected,
  onChange,
}: {
  players: RankingEntry[];
  selected: RankingEntry[];
  onChange: (players: RankingEntry[]) => void;
}) {
  const [query, setQuery] = useState("");
  const selectedSlugs = useMemo(() => new Set(selected.map((p) => p.slug)), [selected]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return players.filter((p) => !selectedSlugs.has(p.slug) && p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [query, players, selectedSlugs]);

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Add a player…"
        className="w-full rounded-md border border-border px-3 py-1.5 text-sm"
      />
      {matches.length > 0 && (
        <ul className="mt-1 max-h-48 overflow-y-auto rounded-md border border-border">
          {matches.map((p) => (
            <li key={p.slug}>
              <button
                onClick={() => {
                  onChange([...selected, p]);
                  setQuery("");
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-hover-tint"
              >
                <PlayerPhoto src={p.photo_url} alt={p.name} size={22} />
                <span className="font-medium">{p.name}</span>
                <span className="text-muted">
                  {p.position} · {p.team}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected.length > 0 && (
        <ul className="mt-2 space-y-1">
          {selected.map((p) => (
            <li
              key={p.slug}
              className="flex items-center justify-between rounded-md bg-surface-alt px-3 py-1.5 text-sm"
            >
              <span className="flex items-center gap-2">
                <PlayerPhoto src={p.photo_url} alt={p.name} size={20} />
                {p.name}
                <span className="text-muted">
                  {p.position} · {p.team}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <span className="tabular-nums text-muted">{p.projection.toFixed(1)}</span>
                <button
                  onClick={() => onChange(selected.filter((s) => s.slug !== p.slug))}
                  className="text-muted hover:text-danger"
                >
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
