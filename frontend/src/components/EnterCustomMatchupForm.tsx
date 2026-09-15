import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import type {
  ConnectedLeague,
  RankingEntry,
  KickerEntry,
  DSTEntry,
  RankingManifestItem,
  RosterPlayer,
  CustomLeagueMatchup,
} from "@/lib/types";
import { DEFAULT_ROSTER_SLOTS } from "@/lib/leagueSettings";
import { buildSlotSpecs, assignPlayersToSlots } from "@/lib/rosterSlots";
import RosterSlotBox from "./RosterSlotBox";

// A custom league has no API of its own, so its matchup for a given week
// is entered by hand: the league's own roster settings (from
// CustomLeagueSettingsForm) determine exactly which position boxes show
// up here -- a 2-QB superflex league gets two QB boxes and a SUPERFLEX
// box, a standard league gets one QB box and no superflex box at all --
// and each box is filled by searching that week's projections (priced in
// the league's own scoring format).

function latestManifestKey(manifest: RankingManifestItem[], type: RankingManifestItem["type"]): string | null {
  const matches = manifest.filter((m) => m.type === type);
  return matches.length > 0 ? matches[matches.length - 1].key : null;
}

export default function EnterCustomMatchupForm({
  league,
  week,
  initial,
  onSaved,
  onCancel,
}: {
  league: ConnectedLeague;
  week: number;
  initial: CustomLeagueMatchup | null;
  onSaved: (matchup: CustomLeagueMatchup) => void;
  onCancel: () => void;
}) {
  const rosterSlots = league.rosterSlots ?? DEFAULT_ROSTER_SLOTS;
  const slotSpecs = useMemo(() => buildSlotSpecs(rosterSlots), [rosterSlots]);

  const [pool, setPool] = useState<RosterPlayer[]>([]);
  const [opponentName, setOpponentName] = useState(initial?.opponentTeamName ?? "Opponent");
  const [error, setError] = useState<string | null>(null);

  const [mySlots, setMySlots] = useState<Record<string, RosterPlayer | null>>(() =>
    assignPlayersToSlots(slotSpecs, initial?.myPlayers ?? []),
  );
  const [oppSlots, setOppSlots] = useState<Record<string, RosterPlayer | null>>(() =>
    assignPlayersToSlots(slotSpecs, initial?.opponentPlayers ?? []),
  );

  useEffect(() => {
    let cancelled = false;

    apiGet<RankingManifestItem[]>("/rankings/redraft")
      .then(async (manifest) => {
        const weeklyKey = latestManifestKey(manifest, "weekly");
        if (!weeklyKey) {
          setError("No weekly rankings available yet to price this matchup from.");
          return;
        }
        const needsK = rosterSlots.k > 0;
        const needsDst = rosterSlots.dst > 0;
        const kickerKey = needsK ? latestManifestKey(manifest, "kicker") : null;
        const dstKey = needsDst ? latestManifestKey(manifest, "dst") : null;

        const [flexData, kickerData, dstData] = await Promise.all([
          apiGet<RankingEntry[]>(`/rankings/redraft/${weeklyKey}?format=${league.scoringFormat}`),
          kickerKey ? apiGet<KickerEntry[]>(`/rankings/redraft/${kickerKey}`) : Promise.resolve([]),
          dstKey ? apiGet<DSTEntry[]>(`/rankings/redraft/${dstKey}`) : Promise.resolve([]),
        ]);
        if (cancelled) return;

        const combined: RosterPlayer[] = [
          ...flexData.map((p) => ({
            slug: p.slug,
            name: p.name,
            team: p.team,
            position: p.position,
            photo_url: p.photo_url,
            projection: p.projection,
          })),
          ...kickerData.map((p) => ({
            slug: p.slug,
            name: p.name,
            team: p.team,
            position: "K",
            photo_url: p.photo_url,
            projection: p.standard_projection,
          })),
          ...dstData.map((d) => ({
            slug: d.slug,
            name: d.team,
            team: d.team,
            position: "DST",
            photo_url: d.logo_url,
            projection: d.projection,
          })),
        ];
        setPool(combined);
      })
      .catch((err: Error) => !cancelled && setError(err.message));

    return () => {
      cancelled = true;
    };
  }, [league.scoringFormat, rosterSlots.k, rosterSlots.dst]);

  const myPlayers = useMemo(
    () => slotSpecs.map((s) => mySlots[s.key]).filter((p): p is RosterPlayer => p != null),
    [slotSpecs, mySlots],
  );
  const opponentPlayers = useMemo(
    () => slotSpecs.map((s) => oppSlots[s.key]).filter((p): p is RosterPlayer => p != null),
    [slotSpecs, oppSlots],
  );
  const myTotal = useMemo(() => myPlayers.reduce((sum, p) => sum + p.projection, 0), [myPlayers]);
  const oppTotal = useMemo(() => opponentPlayers.reduce((sum, p) => sum + p.projection, 0), [opponentPlayers]);

  const mySlugs = useMemo(() => new Set(myPlayers.map((p) => p.slug)), [myPlayers]);
  const oppSlugs = useMemo(() => new Set(opponentPlayers.map((p) => p.slug)), [opponentPlayers]);

  function handleSave() {
    if (myPlayers.length === 0 || opponentPlayers.length === 0) return;
    onSaved({
      leagueId: league.id,
      week,
      myPlayers,
      opponentTeamName: opponentName.trim() || "Opponent",
      opponentPlayers,
    });
  }

  return (
    <div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <p className="text-sm font-semibold">{league.myTeam.team_name}</p>
          <p className="mt-1 text-sm text-muted">
            Projected: <span className="font-semibold tabular-nums">{myTotal.toFixed(1)}</span>
          </p>
          <div className="mt-2 space-y-2">
            {slotSpecs.map((spec) => (
              <RosterSlotBox
                key={spec.key}
                label={spec.label}
                eligiblePositions={spec.eligiblePositions}
                pool={pool}
                takenSlugs={mySlugs}
                selected={mySlots[spec.key] ?? null}
                onSelect={(player) => setMySlots((prev) => ({ ...prev, [spec.key]: player }))}
              />
            ))}
          </div>
        </div>
        <div>
          <input
            value={opponentName}
            onChange={(e) => setOpponentName(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-1.5 text-sm font-semibold"
          />
          <p className="mt-1 text-sm text-muted">
            Projected: <span className="font-semibold tabular-nums">{oppTotal.toFixed(1)}</span>
          </p>
          <div className="mt-2 space-y-2">
            {slotSpecs.map((spec) => (
              <RosterSlotBox
                key={spec.key}
                label={spec.label}
                eligiblePositions={spec.eligiblePositions}
                pool={pool}
                takenSlugs={oppSlugs}
                selected={oppSlots[spec.key] ?? null}
                onSelect={(player) => setOppSlots((prev) => ({ ...prev, [spec.key]: player }))}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={handleSave}
          disabled={myPlayers.length === 0 || opponentPlayers.length === 0}
          className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Save Week {week} matchup
        </button>
        <button onClick={onCancel} className="rounded-md px-4 py-1.5 text-sm text-muted hover:bg-black/5">
          Cancel
        </button>
      </div>
    </div>
  );
}
