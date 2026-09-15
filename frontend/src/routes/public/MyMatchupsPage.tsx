import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "@/lib/apiClient";
import type { ConnectedLeague, CustomMatchup } from "@/lib/types";
import { loadLeagues } from "@/lib/myLeagues";
import { loadCustomMatchups, addCustomMatchup, removeCustomMatchup } from "@/lib/matchups";
import LeagueMatchupCard from "@/components/LeagueMatchupCard";
import CustomLeagueMatchupCard from "@/components/CustomLeagueMatchupCard";
import CustomMatchupCard from "@/components/CustomMatchupCard";
import CreateMatchupForm from "@/components/CreateMatchupForm";

export default function MyMatchupsPage() {
  const [leagues, setLeagues] = useState<ConnectedLeague[]>([]);
  const [customMatchups, setCustomMatchups] = useState<CustomMatchup[]>([]);
  const [week, setWeek] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    setLeagues(loadLeagues());
    setCustomMatchups(loadCustomMatchups());
    apiGet<{ week: number }>("/leagues/state")
      .then((s) => setWeek(s.week))
      .catch(() => {}); // default of 1 is a fine fallback if this fails
  }, []);

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Your Matchups</h1>
      <p className="mt-2 text-muted">
        Live matchups from leagues you've connected, plus any you've built by hand.
      </p>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">League matchups</h2>
          <label className="flex items-center gap-2 text-sm text-muted">
            Week
            <input
              type="number"
              min={1}
              max={18}
              value={week}
              onChange={(e) => setWeek(Number(e.target.value) || 1)}
              className="w-16 rounded-md border border-border px-2 py-1 text-sm"
            />
          </label>
        </div>
        <div className="mt-3 space-y-4">
          {leagues.length === 0 && (
            <p className="rounded-md border border-dashed border-border p-6 text-center text-muted">
              No leagues connected yet — add one from{" "}
              <Link to="/my-leagues" className="text-primary hover:underline">
                My Leagues
              </Link>
              .
            </p>
          )}
          {leagues.map((league) =>
            league.platform === "custom" ? (
              <CustomLeagueMatchupCard key={league.id} league={league} week={week} />
            ) : (
              <LeagueMatchupCard key={league.id} league={league} week={week} />
            ),
          )}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Quick comparisons</h2>
        <p className="mt-1 text-sm text-muted">
          One-off "who should I start" style comparisons — not tied to any league or week.
        </p>
        <div className="mt-3 space-y-4">
          {customMatchups.map((matchup) => (
            <CustomMatchupCard
              key={matchup.id}
              matchup={matchup}
              onRemove={() => setCustomMatchups(removeCustomMatchup(matchup.id))}
            />
          ))}
        </div>
        <div className="mt-4">
          {showCreate ? (
            <CreateMatchupForm
              onAdded={(matchup) => {
                setCustomMatchups(addCustomMatchup(matchup));
                setShowCreate(false);
              }}
              onCancel={() => setShowCreate(false)}
            />
          ) : (
            <button
              onClick={() => setShowCreate(true)}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white"
            >
              + Compare Players
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
