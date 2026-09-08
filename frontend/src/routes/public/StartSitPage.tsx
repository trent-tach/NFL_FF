import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import type { RankingEntry, RankingManifestItem, ScoringFormat } from "@/lib/types";
import PlayerSearchSelect from "@/components/PlayerSearchSelect";
import PlayerPhoto from "@/components/PlayerPhoto";

const SCORING_FORMATS: { value: ScoringFormat; label: string }[] = [
  { value: "ppr", label: "PPR" },
  { value: "half_ppr", label: "Half PPR" },
  { value: "standard", label: "Standard" },
];

export default function StartSitPage() {
  const [manifest, setManifest] = useState<RankingManifestItem[]>([]);
  const [weekKey, setWeekKey] = useState<string | null>(null);
  const [scoringFormat, setScoringFormat] = useState<ScoringFormat>("ppr");
  const [players, setPlayers] = useState<RankingEntry[]>([]);
  const [playerA, setPlayerA] = useState<RankingEntry | null>(null);
  const [playerB, setPlayerB] = useState<RankingEntry | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Only the weekly board has a single-week projection that makes sense
  // for a "start this week" call -- preseason/ROS span the whole season.
  const weeklyWeeks = useMemo(() => manifest.filter((m) => m.type === "weekly"), [manifest]);

  useEffect(() => {
    apiGet<RankingManifestItem[]>("/rankings/redraft")
      .then((data) => {
        setManifest(data);
        const weekly = data.filter((m) => m.type === "weekly");
        if (weekly.length > 0) setWeekKey(weekly[weekly.length - 1].key);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!weekKey) return;
    let cancelled = false;
    apiGet<RankingEntry[]>(`/rankings/redraft/${weekKey}?format=${scoringFormat}`)
      .then((data) => {
        if (cancelled) return;
        setPlayers(data);
        // Keep the same two players selected across a week/format change
        // (by slug) rather than clearing the comparison every time.
        setPlayerA((prev) => (prev ? data.find((p) => p.slug === prev.slug) ?? null : null));
        setPlayerB((prev) => (prev ? data.find((p) => p.slug === prev.slug) ?? null : null));
      })
      .catch((err: Error) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [weekKey, scoringFormat]);

  const winner = useMemo(() => {
    if (!playerA || !playerB || playerA.projection === playerB.projection) return null;
    return playerA.projection > playerB.projection ? playerA : playerB;
  }, [playerA, playerB]);

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Start/Sit</h1>
      <p className="mt-2 text-muted">
        Look up two players and see who the model likes better this week.
      </p>

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
          {weeklyWeeks.map((w) => (
            <option key={w.key} value={w.key}>
              {w.label}
            </option>
          ))}
        </select>

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
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <PlayerSearchSelect
          label="Player A"
          players={players}
          selected={playerA}
          onSelect={setPlayerA}
          excludeSlug={playerB?.slug}
        />
        <PlayerSearchSelect
          label="Player B"
          players={players}
          selected={playerB}
          onSelect={setPlayerB}
          excludeSlug={playerA?.slug}
        />
      </div>

      {playerA && playerB && (
        <div className="mt-8 rounded-md border border-border p-6">
          {winner ? (
            <p className="text-lg">
              <span className="font-semibold text-primary">Start {winner.name}</span> — projected{" "}
              {winner.projection.toFixed(1)} vs {(winner.slug === playerA.slug ? playerB : playerA).projection.toFixed(1)}.
            </p>
          ) : (
            <p className="text-lg">
              Dead even — {playerA.projection.toFixed(1)} pts projected for both.
            </p>
          )}

          <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {[playerA, playerB].map((p) => (
              <div
                key={p.slug}
                className={`rounded-md border p-4 ${
                  winner?.slug === p.slug ? "border-primary" : "border-border"
                }`}
              >
                <div className="flex items-center gap-3">
                  <PlayerPhoto src={p.photo_url} alt={p.name} size={48} />
                  <div>
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-sm text-muted">
                      {p.position} · {p.team}
                    </div>
                  </div>
                  {winner?.slug === p.slug && (
                    <span className="ml-auto text-xs font-semibold text-primary">START</span>
                  )}
                </div>
                <dl className="mt-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted">Opponent</dt>
                    <dd className="inline-flex items-center gap-1.5">
                      {p.opponent_logo_url && (
                        <img src={p.opponent_logo_url} alt={p.opponent ?? ""} width={16} height={16} />
                      )}
                      {p.opponent ?? "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Opp Rank</dt>
                    <dd>{p.opp_rank ?? "N/A"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Weather</dt>
                    <dd>{p.weather ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Projection</dt>
                    <dd className="font-semibold tabular-nums">{p.projection.toFixed(1)}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
