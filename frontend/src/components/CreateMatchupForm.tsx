import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import type { RankingEntry, RankingManifestItem, CustomMatchup } from "@/lib/types";
import MultiPlayerSearch from "./MultiPlayerSearch";

// Builds a two-sided matchup from scratch, priced off the latest weekly
// projections -- for comparing hypothetical lineups, or for a league we
// haven't (or can't) connect live.

export default function CreateMatchupForm({
  onAdded,
  onCancel,
}: {
  onAdded: (matchup: CustomMatchup) => void;
  onCancel: () => void;
}) {
  const [players, setPlayers] = useState<RankingEntry[]>([]);
  const [weekKey, setWeekKey] = useState<string | null>(null);
  const [matchupName, setMatchupName] = useState("");
  const [labelA, setLabelA] = useState("My Team");
  const [labelB, setLabelB] = useState("Opponent");
  const [sideA, setSideA] = useState<RankingEntry[]>([]);
  const [sideB, setSideB] = useState<RankingEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<RankingManifestItem[]>("/rankings/redraft")
      .then((manifest) => {
        const weekly = manifest.filter((m) => m.type === "weekly");
        if (weekly.length === 0) {
          setError("No weekly rankings available yet to price a matchup from.");
          return null;
        }
        const key = weekly[weekly.length - 1].key;
        setWeekKey(key);
        return apiGet<RankingEntry[]>(`/rankings/redraft/${key}?format=ppr`);
      })
      .then((data) => data && setPlayers(data))
      .catch((err: Error) => setError(err.message));
  }, []);

  const totalA = useMemo(() => sideA.reduce((sum, p) => sum + p.projection, 0), [sideA]);
  const totalB = useMemo(() => sideB.reduce((sum, p) => sum + p.projection, 0), [sideB]);

  function handleSave() {
    if (!weekKey || sideA.length === 0 || sideB.length === 0) return;
    onAdded({
      id: crypto.randomUUID(),
      name: matchupName.trim() || `${labelA} vs ${labelB}`,
      weekKey,
      sideA: { label: labelA.trim() || "Side A", players: sideA },
      sideB: { label: labelB.trim() || "Side B", players: sideB },
    });
  }

  return (
    <div className="rounded-md border border-border p-5">
      {error && <p className="text-sm text-danger">{error}</p>}

      <div>
        <label className="block text-sm font-medium text-muted">Matchup name (optional)</label>
        <input
          value={matchupName}
          onChange={(e) => setMatchupName(e.target.value)}
          placeholder="e.g. Week 2 vs. Steve"
          className="mt-1 w-full rounded-md border border-border px-3 py-1.5 text-sm"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <input
            value={labelA}
            onChange={(e) => setLabelA(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-1.5 text-sm font-semibold"
          />
          <p className="mt-1 text-sm text-muted">
            Projected: <span className="font-semibold tabular-nums">{totalA.toFixed(1)}</span>
          </p>
          <div className="mt-2">
            <MultiPlayerSearch players={players} selected={sideA} onChange={setSideA} />
          </div>
        </div>
        <div>
          <input
            value={labelB}
            onChange={(e) => setLabelB(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-1.5 text-sm font-semibold"
          />
          <p className="mt-1 text-sm text-muted">
            Projected: <span className="font-semibold tabular-nums">{totalB.toFixed(1)}</span>
          </p>
          <div className="mt-2">
            <MultiPlayerSearch players={players} selected={sideB} onChange={setSideB} />
          </div>
        </div>
      </div>

      <div className="mt-5 flex gap-2">
        <button
          onClick={handleSave}
          disabled={sideA.length === 0 || sideB.length === 0}
          className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-on-brand disabled:opacity-50"
        >
          Save matchup
        </button>
        <button onClick={onCancel} className="rounded-md px-4 py-1.5 text-sm text-muted hover:bg-hover-tint">
          Cancel
        </button>
      </div>
    </div>
  );
}
