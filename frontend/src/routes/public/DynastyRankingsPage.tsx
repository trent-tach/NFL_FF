import { useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import type { RankingEntry } from "@/lib/types";
import RankingsTable from "@/components/RankingsTable";

export default function DynastyRankingsPage() {
  const [entries, setEntries] = useState<RankingEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<RankingEntry[]>("/rankings/dynasty")
      .then(setEntries)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Dynasty Rankings</h1>
      <p className="mt-2 text-muted">
        Placeholder list — no dynasty model yet, but wired to the same data shape as Redraft.
      </p>

      {error && (
        <div className="mt-4 rounded-md border border-danger-border bg-danger-soft px-4 py-3 text-danger">
          <strong>Could not load rankings</strong> ({error}).
        </div>
      )}

      <div className="mt-6">
        <RankingsTable entries={entries} />
      </div>
    </div>
  );
}
