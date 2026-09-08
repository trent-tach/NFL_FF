import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import type { GamePrediction, RankingManifestItem } from "@/lib/types";
import GameCard from "@/components/GameCard";

export default function GamesPage() {
  const [manifest, setManifest] = useState<RankingManifestItem[]>([]);
  const [weekKey, setWeekKey] = useState<string | null>(null);
  const [games, setGames] = useState<GamePrediction[]>([]);
  const [error, setError] = useState<string | null>(null);

  const gameWeeks = useMemo(() => manifest.filter((m) => m.type === "games"), [manifest]);

  // Reuses the same manifest every ranking page reads -- "games" weeks are
  // just another entry type in it.
  useEffect(() => {
    apiGet<RankingManifestItem[]>("/rankings/redraft")
      .then((data) => {
        setManifest(data);
        const weeks = data.filter((m) => m.type === "games");
        if (weeks.length > 0) setWeekKey(weeks[weeks.length - 1].key);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!weekKey) return;
    let cancelled = false;
    apiGet<GamePrediction[]>(`/games/${weekKey}`)
      .then((data) => { if (!cancelled) setGames(data); })
      .catch((err: Error) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [weekKey]);

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Game Predictions</h1>
      <p className="mt-2 text-muted">
        Straight-up winner picks, blending the Vegas line with our own offense/defense signals.
      </p>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          <strong>Could not load games</strong> ({error}).
        </div>
      )}

      {gameWeeks.length > 1 && (
        <div className="mt-6">
          <select
            value={weekKey ?? ""}
            onChange={(e) => setWeekKey(e.target.value)}
            className="rounded-md border border-border px-3 py-1.5 text-sm"
          >
            {gameWeeks.map((w) => (
              <option key={w.key} value={w.key}>
                {w.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {games.map((game, i) => (
          <GameCard key={game.game_id} game={game} index={i} />
        ))}
      </div>
    </div>
  );
}
