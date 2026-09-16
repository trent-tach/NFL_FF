// Win probability for a head-to-head fantasy matchup, same spirit as
// pipeline.py's build_game_predictions: turn a projected margin into a
// probability via the normal CDF of that margin over a combined standard
// deviation, rather than just declaring whoever projects higher "wins."
//
// There's no equivalent NFL-game empirical constant for "how much does one
// starter's score vary week to week" exposed yet (floor/ceiling per player
// isn't in the weekly JSON), so this uses a single reasonable per-player
// stdev and scales it by roster size (assuming roughly independent
// per-player variance, so summed variances scale with player count) --
// a heuristic, like the game-prediction model, not a fitted one.

const PLAYER_POINTS_STDEV = 8.5; // empirical-ish single-starter weekly stdev

/** Logistic approximation of the standard normal CDF -- accurate to
 * within ~1%, and avoids pulling in a stats library for one function. */
function normalCdfApprox(z: number): number {
  return 1 / (1 + Math.exp(-1.702 * z));
}

export function computeMatchupOdds(
  myTotal: number,
  opponentTotal: number,
  myPlayerCount: number,
  opponentPlayerCount: number,
): { myWinPct: number; opponentWinPct: number } {
  const combinedStdev = PLAYER_POINTS_STDEV * Math.sqrt(Math.max(myPlayerCount + opponentPlayerCount, 1));
  const margin = myTotal - opponentTotal;
  const myWinPct = normalCdfApprox(margin / combinedStdev) * 100;
  return { myWinPct, opponentWinPct: 100 - myWinPct };
}
