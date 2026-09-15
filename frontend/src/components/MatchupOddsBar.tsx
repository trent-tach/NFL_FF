// Shared win-probability readout for a head-to-head matchup -- same
// two-color bar convention as GameCard's NFL win probabilities, so a
// fantasy matchup and a real game read the same way at a glance.

export default function MatchupOddsBar({
  leftLabel,
  rightLabel,
  leftWinPct,
  rightWinPct,
}: {
  leftLabel: string;
  rightLabel: string;
  leftWinPct: number;
  rightWinPct: number;
}) {
  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs text-muted">
        <span>
          {leftLabel} {leftWinPct.toFixed(1)}%
        </span>
        <span>
          {rightLabel} {rightWinPct.toFixed(1)}%
        </span>
      </div>
      <div className="mt-1 flex h-1.5 w-full overflow-hidden rounded-full bg-border">
        <div className="bg-primary" style={{ width: `${leftWinPct}%` }} />
        <div className="bg-black/70" style={{ width: `${rightWinPct}%` }} />
      </div>
    </div>
  );
}
