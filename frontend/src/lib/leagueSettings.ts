// Defaults and derivation for a custom league's roster/scoring settings.
// Standard 1-QB PPR defaults, since that's the most common starting point
// people tweak from.

import type { CustomRosterSlots, CustomScoringRules, ScoringFormat } from "./types";

export const DEFAULT_ROSTER_SLOTS: CustomRosterSlots = {
  qb: 1,
  rb: 2,
  wr: 2,
  te: 1,
  flex: 1,
  superflex: 0,
  k: 1,
  dst: 1,
  bench: 6,
  ir: 1,
};

export const DEFAULT_SCORING_RULES: CustomScoringRules = {
  passYd: 0.04,
  passTd: 4,
  interception: -2,
  rushYd: 0.1,
  rushTd: 6,
  reception: 1,
  recYd: 0.1,
  recTd: 6,
  fumbleLost: -2,
  teBonus: 0,
};

/** Same threshold logic backend/leagues.py already uses to derive a
 * Sleeper/ESPN league's scoring format from its reception point value --
 * kept consistent so a custom league lands on the same PPR/Half/Standard
 * bucket a real league with the same reception rule would. */
export function deriveScoringFormat(receptionPoints: number): ScoringFormat {
  if (receptionPoints >= 1) return "ppr";
  if (receptionPoints >= 0.5) return "half_ppr";
  return "standard";
}
