import { useState } from "react";
import { apiGet } from "@/lib/apiClient";
import type { ConnectedLeague, LeaguePlatform, LeagueLookupResult, LeagueTeamOption } from "@/lib/types";
import CustomLeagueSettingsForm from "./CustomLeagueSettingsForm";

// Sleeper/ESPN: pick a platform, enter the league's own ID (+ ESPN cookies
// if it's private), then pick which team in that league is yours -- the
// lookup already pulls the league's real roster slots/scoring settings
// (see leagues.py), so nothing needs to be re-entered by hand.
//
// Custom: there's no external league to look up, so CustomLeagueSettingsForm
// collects the same shape of settings directly.

export default function AddLeagueForm({
  onAdded,
  onCancel,
}: {
  onAdded: (league: ConnectedLeague) => void;
  onCancel: () => void;
}) {
  const [platform, setPlatform] = useState<LeaguePlatform>("sleeper");

  const [leagueId, setLeagueId] = useState("");
  const [season, setSeason] = useState(String(new Date().getFullYear()));
  const [isPrivate, setIsPrivate] = useState(false);
  const [espnS2, setEspnS2] = useState("");
  const [swid, setSwid] = useState("");
  const [lookup, setLookup] = useState<LeagueLookupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLookup() {
    if (!leagueId.trim()) return;
    setLoading(true);
    setError(null);
    setLookup(null);
    try {
      const path =
        platform === "sleeper"
          ? `/leagues/sleeper/${leagueId.trim()}`
          : `/leagues/espn?league_id=${encodeURIComponent(leagueId.trim())}&season=${encodeURIComponent(season)}` +
            (isPrivate ? `&espn_s2=${encodeURIComponent(espnS2)}&swid=${encodeURIComponent(swid)}` : "");
      const result = await apiGet<LeagueLookupResult>(path);
      setLookup(result);
    } catch (err) {
      // apiGet's Error message already includes the backend's own detail
      // text (e.g. "This ESPN league is private...") -- strip the
      // "API 401 on /leagues/espn: " prefix so it reads like a message,
      // not a stack trace.
      const raw = (err as Error).message;
      const jsonStart = raw.indexOf("{");
      if (jsonStart >= 0) {
        try {
          setError(JSON.parse(raw.slice(jsonStart)).detail ?? raw);
        } catch {
          setError(raw);
        }
      } else {
        setError(raw);
      }
    } finally {
      setLoading(false);
    }
  }

  function handlePickTeam(team: LeagueTeamOption) {
    if (!lookup) return;
    onAdded({
      id: crypto.randomUUID(),
      platform: lookup.platform,
      leagueId: lookup.league_id,
      season: lookup.season,
      leagueName: lookup.league_name,
      scoringFormat: lookup.scoring_format,
      myTeam: team,
      espnAuth: isPrivate ? { espn_s2: espnS2, swid } : undefined,
      rosterSlots: lookup.roster_slots ?? undefined,
      scoringRules: lookup.scoring_rules ?? undefined,
    });
  }

  return (
    <div className="rounded-md border border-border p-5">
      <div className="flex gap-1">
        {(["sleeper", "espn", "custom"] as const).map((p) => (
          <button
            key={p}
            onClick={() => {
              setPlatform(p);
              setLookup(null);
              setError(null);
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize ${
              platform === p ? "bg-primary text-on-brand" : "hover:bg-hover-tint"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {platform === "custom" && (
        <div className="mt-4">
          <CustomLeagueSettingsForm onAdded={onAdded} onCancel={onCancel} />
        </div>
      )}

      {platform !== "custom" && !lookup && (
        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-muted">League ID</label>
            <input
              value={leagueId}
              onChange={(e) => setLeagueId(e.target.value)}
              placeholder={platform === "sleeper" ? "e.g. 918398394183847168" : "e.g. 123456"}
              className="mt-1 w-full rounded-md border border-border px-3 py-1.5 text-sm"
            />
          </div>

          {platform === "espn" && (
            <>
              <div>
                <label className="block text-sm font-medium text-muted">Season</label>
                <input
                  value={season}
                  onChange={(e) => setSeason(e.target.value)}
                  className="mt-1 w-32 rounded-md border border-border px-3 py-1.5 text-sm"
                />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
                This is a private league
              </label>

              {isPrivate && (
                <div className="rounded-md bg-surface-alt p-4 text-sm">
                  <p className="font-medium">Open ESPN's cookie storage</p>
                  <p className="mt-1 text-muted">
                    While logged into espn.com: open DevTools → <b>Application</b> tab (Chrome/Edge) or{" "}
                    <b>Storage</b> (Firefox/Safari) — use the <b>»</b> overflow menu if the tab is hidden — then{" "}
                    <b>Cookies → https://www.espn.com</b>. Copy the <code>espn_s2</code> and <code>SWID</code>{" "}
                    values into the fields below.
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input
                      value={espnS2}
                      onChange={(e) => setEspnS2(e.target.value)}
                      placeholder="espn_s2 value"
                      className="rounded-md border border-border px-3 py-1.5 text-sm"
                    />
                    <input
                      value={swid}
                      onChange={(e) => setSwid(e.target.value)}
                      placeholder="SWID value"
                      className="rounded-md border border-border px-3 py-1.5 text-sm"
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={handleLookup}
              disabled={loading || !leagueId.trim()}
              className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-on-brand disabled:opacity-50"
            >
              {loading ? "Looking up…" : "Look up league"}
            </button>
            <button onClick={onCancel} className="rounded-md px-4 py-1.5 text-sm text-muted hover:bg-hover-tint">
              Cancel
            </button>
          </div>
        </div>
      )}

      {platform !== "custom" && lookup && (
        <div className="mt-4">
          <p className="text-sm text-muted">
            <span className="font-medium">{lookup.league_name}</span> · {lookup.season} ·{" "}
            {lookup.scoring_format.toUpperCase()} — which team is yours?
          </p>
          <ul className="mt-3 space-y-1">
            {lookup.teams.map((team) => (
              <li key={team.roster_id ?? team.team_id}>
                <button
                  onClick={() => handlePickTeam(team)}
                  className="flex w-full items-center gap-3 rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-hover-tint"
                >
                  {(team.avatar_url || team.logo_url) && (
                    <img src={team.avatar_url ?? team.logo_url ?? ""} alt="" width={24} height={24} className="rounded-full" />
                  )}
                  <span className="font-medium">{team.team_name}</span>
                  {team.owner_display_name && <span className="text-muted">({team.owner_display_name})</span>}
                  {team.wins != null && (
                    <span className="ml-auto text-muted">
                      {team.wins}-{team.losses}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <button onClick={() => setLookup(null)} className="mt-3 text-sm text-muted hover:text-primary">
            ← Back
          </button>
        </div>
      )}
    </div>
  );
}
