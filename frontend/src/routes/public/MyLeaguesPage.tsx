import { useEffect, useState } from "react";
import type { ConnectedLeague } from "@/lib/types";
import { loadLeagues, addLeague, removeLeague, platformLabel } from "@/lib/myLeagues";
import AddLeagueForm from "@/components/AddLeagueForm";

export default function MyLeaguesPage() {
  const [leagues, setLeagues] = useState<ConnectedLeague[]>([]);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    setLeagues(loadLeagues());
  }, []);

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">My Leagues</h1>
      <p className="mt-2 text-muted">
        Connect your Sleeper or ESPN leagues, or set up a custom one with your own rules and enter
        its matchups by hand. Nothing leaves your browser — league info (including private-league
        cookies) is stored locally, not on our server.
      </p>

      <div className="mt-6 space-y-3">
        {leagues.map((league) => (
          <div
            key={league.id}
            className="flex items-center justify-between gap-4 rounded-md border border-border p-4"
          >
            <div className="flex items-center gap-3">
              {(league.myTeam.avatar_url || league.myTeam.logo_url) && (
                <img
                  src={league.myTeam.avatar_url ?? league.myTeam.logo_url ?? ""}
                  alt=""
                  width={36}
                  height={36}
                  className="rounded-full"
                />
              )}
              <div>
                <div className="font-semibold">{league.leagueName}</div>
                <div className="text-sm text-muted">
                  {league.myTeam.team_name} · {platformLabel(league.platform)} ·{" "}
                  {league.season} · {league.scoringFormat.toUpperCase()}
                </div>
                {league.rulesNotes && <div className="mt-0.5 text-xs text-muted">{league.rulesNotes}</div>}
              </div>
            </div>
            <button
              onClick={() => setLeagues(removeLeague(league.id))}
              className="text-sm text-muted hover:text-danger"
            >
              Remove
            </button>
          </div>
        ))}

        {leagues.length === 0 && !showForm && (
          <p className="rounded-md border border-dashed border-border p-6 text-center text-muted">
            No leagues connected yet.
          </p>
        )}
      </div>

      <div className="mt-6">
        {showForm ? (
          <AddLeagueForm
            onAdded={(league) => {
              setLeagues(addLeague(league));
              setShowForm(false);
            }}
            onCancel={() => setShowForm(false)}
          />
        ) : (
          <button
            onClick={() => setShowForm(true)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-brand"
          >
            + Add League
          </button>
        )}
      </div>
    </div>
  );
}
