import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiGet } from "@/lib/apiClient";
import type { PlayerDetail } from "@/lib/types";
import PlayerPhoto from "@/components/PlayerPhoto";

export default function PlayerPage() {
  const { slug } = useParams<{ slug: string }>();
  const [player, setPlayer] = useState<PlayerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    setPlayer(null);
    setError(null);
    apiGet<PlayerDetail>(`/players/${slug}`)
      .then(setPlayer)
      .catch((err: Error) => setError(err.message));
  }, [slug]);

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-700">
        <strong>Could not load player</strong> ({error}).
      </div>
    );
  }

  if (!player) return <p>Loading…</p>;

  return (
    <div>
      <div className="flex items-center gap-4">
        <PlayerPhoto src={player.photo_url} alt={player.name} size={72} />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{player.name}</h1>
          <p className="text-muted">
            {player.position} · {player.team}
          </p>
        </div>
      </div>

      <h2 className="mt-8 text-lg font-semibold">Rank history</h2>
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted">
            <th className="py-2 pr-2">Ranking</th>
            <th className="py-2 pr-2">Rank</th>
            <th className="py-2 pr-2 text-right">Projection</th>
          </tr>
        </thead>
        <tbody>
          {player.history.map((h) => (
            <tr key={h.week_key} className="border-b border-border/60">
              <td className="py-2 pr-2">{h.week_label}</td>
              <td className="py-2 pr-2">{h.rank}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{h.projection.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
