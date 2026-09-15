import { useState } from "react";
import type { ConnectedLeague, CustomRosterSlots, CustomScoringRules } from "@/lib/types";
import { DEFAULT_ROSTER_SLOTS, DEFAULT_SCORING_RULES, deriveScoringFormat } from "@/lib/leagueSettings";

// Full roster/scoring settings for a league with no API of its own --
// mirrors the category shape pipeline.py's scoring formats already use,
// so "points per reception" here is the same lever that already decides
// PPR/Half/Standard for Sleeper and ESPN leagues.

function NumberField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-muted">{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm"
      />
    </label>
  );
}

export default function CustomLeagueSettingsForm({
  onAdded,
  onCancel,
}: {
  onAdded: (league: ConnectedLeague) => void;
  onCancel: () => void;
}) {
  const [leagueName, setLeagueName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [roster, setRoster] = useState<CustomRosterSlots>(DEFAULT_ROSTER_SLOTS);
  const [scoring, setScoring] = useState<CustomScoringRules>(DEFAULT_SCORING_RULES);
  const [notes, setNotes] = useState("");

  function setRosterField<K extends keyof CustomRosterSlots>(key: K, value: number) {
    setRoster((r) => ({ ...r, [key]: value }));
  }
  function setScoringField<K extends keyof CustomScoringRules>(key: K, value: number) {
    setScoring((s) => ({ ...s, [key]: value }));
  }

  function handleAdd() {
    if (!leagueName.trim() || !teamName.trim()) return;
    onAdded({
      id: crypto.randomUUID(),
      platform: "custom",
      leagueId: crypto.randomUUID(), // no external league to key off of
      season: new Date().getFullYear(),
      leagueName: leagueName.trim(),
      scoringFormat: deriveScoringFormat(scoring.reception),
      myTeam: { team_name: teamName.trim(), wins: null, losses: null },
      rosterSlots: roster,
      scoringRules: scoring,
      rulesNotes: notes.trim() || undefined,
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-muted">League name</label>
        <input
          value={leagueName}
          onChange={(e) => setLeagueName(e.target.value)}
          placeholder="e.g. The League of Extraordinary Dads"
          className="mt-1 w-full rounded-md border border-border px-3 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-muted">Your team name</label>
        <input
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          className="mt-1 w-full rounded-md border border-border px-3 py-1.5 text-sm"
        />
      </div>

      <div>
        <p className="text-sm font-medium text-muted">Roster spots</p>
        <div className="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-5">
          <NumberField label="QB" value={roster.qb} onChange={(v) => setRosterField("qb", v)} />
          <NumberField label="RB" value={roster.rb} onChange={(v) => setRosterField("rb", v)} />
          <NumberField label="WR" value={roster.wr} onChange={(v) => setRosterField("wr", v)} />
          <NumberField label="TE" value={roster.te} onChange={(v) => setRosterField("te", v)} />
          <NumberField label="FLEX" value={roster.flex} onChange={(v) => setRosterField("flex", v)} />
          <NumberField label="Superflex" value={roster.superflex} onChange={(v) => setRosterField("superflex", v)} />
          <NumberField label="K" value={roster.k} onChange={(v) => setRosterField("k", v)} />
          <NumberField label="DST" value={roster.dst} onChange={(v) => setRosterField("dst", v)} />
          <NumberField label="Bench" value={roster.bench} onChange={(v) => setRosterField("bench", v)} />
          <NumberField label="IR" value={roster.ir} onChange={(v) => setRosterField("ir", v)} />
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-muted">Scoring</p>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <NumberField label="Pts / pass yard" value={scoring.passYd} onChange={(v) => setScoringField("passYd", v)} step={0.01} />
          <NumberField label="Pts / pass TD" value={scoring.passTd} onChange={(v) => setScoringField("passTd", v)} />
          <NumberField label="Pts / INT thrown" value={scoring.interception} onChange={(v) => setScoringField("interception", v)} />
          <NumberField label="Pts / rush yard" value={scoring.rushYd} onChange={(v) => setScoringField("rushYd", v)} step={0.01} />
          <NumberField label="Pts / rush TD" value={scoring.rushTd} onChange={(v) => setScoringField("rushTd", v)} />
          <NumberField label="Pts / reception" value={scoring.reception} onChange={(v) => setScoringField("reception", v)} step={0.5} />
          <NumberField label="Pts / rec yard" value={scoring.recYd} onChange={(v) => setScoringField("recYd", v)} step={0.01} />
          <NumberField label="Pts / rec TD" value={scoring.recTd} onChange={(v) => setScoringField("recTd", v)} />
          <NumberField label="Pts / fumble lost" value={scoring.fumbleLost} onChange={(v) => setScoringField("fumbleLost", v)} />
          <NumberField label="TE reception bonus" value={scoring.teBonus} onChange={(v) => setScoringField("teBonus", v)} step={0.5} />
        </div>
        <p className="mt-2 text-xs text-muted">
          Our projections are only computed in PPR / Half-PPR / Standard — based on "Pts / reception" above, this
          league will be priced as <b>{deriveScoringFormat(scoring.reception).replace("_", " ").toUpperCase()}</b>.
          Every other field here is captured for reference (and for anything built on top of them later, like
          lineup-legality checks).
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-muted">Other rules (notes, optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. keeper league, 4-team playoff, TD-only bonus…"
          rows={2}
          className="mt-1 w-full rounded-md border border-border px-3 py-1.5 text-sm"
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleAdd}
          disabled={!leagueName.trim() || !teamName.trim()}
          className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Add League
        </button>
        <button onClick={onCancel} className="rounded-md px-4 py-1.5 text-sm text-muted hover:bg-black/5">
          Cancel
        </button>
      </div>
    </div>
  );
}
