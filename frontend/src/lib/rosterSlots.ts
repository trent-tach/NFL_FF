import type { CustomRosterSlots, RosterPlayer } from "./types";

// One box in the custom-league matchup form: a labeled slot that only
// accepts certain positions (a FLEX slot takes RB/WR/TE, a straight QB
// slot takes only QB, etc). Built from a league's own roster_slots, so a
// 2-QB superflex league and a standard 1-QB league each get exactly the
// boxes their own settings call for.
export interface SlotSpec {
  key: string;
  label: string;
  eligiblePositions: string[];
}

const SLOT_ORDER: { field: keyof CustomRosterSlots; label: string; eligiblePositions: string[] }[] = [
  { field: "qb", label: "QB", eligiblePositions: ["QB"] },
  { field: "rb", label: "RB", eligiblePositions: ["RB"] },
  { field: "wr", label: "WR", eligiblePositions: ["WR"] },
  { field: "te", label: "TE", eligiblePositions: ["TE"] },
  { field: "flex", label: "FLEX", eligiblePositions: ["RB", "WR", "TE"] },
  { field: "superflex", label: "SUPERFLEX", eligiblePositions: ["QB", "RB", "WR", "TE"] },
  { field: "k", label: "K", eligiblePositions: ["K"] },
  { field: "dst", label: "DST", eligiblePositions: ["DST"] },
];

/** Bench/IR aren't part of this -- a matchup's score comes from starters,
 * same as what the Sleeper/ESPN matchup endpoints already return. */
export function buildSlotSpecs(rosterSlots: CustomRosterSlots): SlotSpec[] {
  const specs: SlotSpec[] = [];
  for (const { field, label, eligiblePositions } of SLOT_ORDER) {
    const count = rosterSlots[field] ?? 0;
    for (let i = 0; i < count; i++) {
      specs.push({
        key: `${field}-${i}`,
        label: count > 1 ? `${label} ${i + 1}` : label,
        eligiblePositions,
      });
    }
  }
  return specs;
}

/** Restores a saved flat player list into per-slot assignments, greedily
 * filling slots in their defined order (QB/RB/WR/TE before FLEX/SUPERFLEX)
 * so a player only lands in a flex-type slot when no exact-position slot
 * is left for them -- matches how they'd most likely have been entered. */
export function assignPlayersToSlots(
  specs: SlotSpec[],
  players: RosterPlayer[],
): Record<string, RosterPlayer | null> {
  const assignment: Record<string, RosterPlayer | null> = {};
  for (const spec of specs) assignment[spec.key] = null;

  const remaining = [...players];
  for (const spec of specs) {
    const idx = remaining.findIndex((p) => spec.eligiblePositions.includes(p.position));
    if (idx !== -1) {
      assignment[spec.key] = remaining[idx];
      remaining.splice(idx, 1);
    }
  }
  return assignment;
}
