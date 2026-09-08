import { useMemo, useState } from "react";
import type { RankingEntry } from "@/lib/types";
import PlayerPhoto from "./PlayerPhoto";

// A type-to-search player picker over an already-loaded week's roster --
// 921 players is small enough to filter client-side, no search endpoint
// needed. Shared by the Start/Sit tool; reusable anywhere else that needs
// "pick a player from this week."

export default function PlayerSearchSelect({
  label,
  players,
  selected,
  onSelect,
  excludeSlug,
}: {
  label: string;
  players: RankingEntry[];
  selected: RankingEntry | null;
  onSelect: (player: RankingEntry | null) => void;
  excludeSlug?: string;
}) {
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return players
      .filter((p) => p.slug !== excludeSlug && p.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, players, excludeSlug]);

  if (selected) {
    return (
      <div className="rounded-md border border-border p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted">{label}</span>
          <button
            onClick={() => onSelect(null)}
            className="text-xs text-muted hover:text-primary"
          >
            Change
          </button>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <PlayerPhoto src={selected.photo_url} alt={selected.name} size={48} />
          <div>
            <div className="font-semibold">{selected.name}</div>
            <div className="text-sm text-muted">
              {selected.position} · {selected.team}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border p-4">
      <span className="text-sm font-medium text-muted">{label}</span>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search a player…"
        className="mt-2 w-full rounded-md border border-border px-3 py-1.5 text-sm"
      />
      {matches.length > 0 && (
        <ul className="mt-2 max-h-56 overflow-y-auto rounded-md border border-border">
          {matches.map((p) => (
            <li key={p.slug}>
              <button
                onClick={() => {
                  onSelect(p);
                  setQuery("");
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-black/5"
              >
                <PlayerPhoto src={p.photo_url} alt={p.name} size={24} />
                <span className="font-medium">{p.name}</span>
                <span className="text-muted">
                  {p.position} · {p.team}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim() && matches.length === 0 && (
        <p className="mt-2 text-sm text-muted">No players match "{query}".</p>
      )}
    </div>
  );
}
