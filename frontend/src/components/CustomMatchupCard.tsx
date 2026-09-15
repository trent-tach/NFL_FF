import type { CustomMatchup, CustomMatchupSide } from "@/lib/types";
import { computeMatchupOdds } from "@/lib/matchupOdds";
import MatchupOddsBar from "./MatchupOddsBar";

function totalFor(side: CustomMatchupSide): number {
  return side.players.reduce((sum, p) => sum + p.projection, 0);
}

export default function CustomMatchupCard({
  matchup,
  onRemove,
}: {
  matchup: CustomMatchup;
  onRemove: () => void;
}) {
  const totalA = totalFor(matchup.sideA);
  const totalB = totalFor(matchup.sideB);
  const winner = totalA === totalB ? null : totalA > totalB ? "A" : "B";

  const sides: { key: "A" | "B"; side: CustomMatchupSide; total: number }[] = [
    { key: "A", side: matchup.sideA, total: totalA },
    { key: "B", side: matchup.sideB, total: totalB },
  ];

  return (
    <div className="rounded-md border border-border p-5">
      <div className="flex items-center justify-between">
        <p className="font-semibold">{matchup.name}</p>
        <button onClick={onRemove} className="text-sm text-muted hover:text-red-600">
          Remove
        </button>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {sides.map(({ key, side, total }) => (
          <div
            key={key}
            className={`rounded-md border p-3 ${winner === key ? "border-primary" : "border-transparent"}`}
          >
            <div className="flex items-baseline justify-between">
              <span className="font-semibold">{side.label}</span>
              <span className="text-lg font-bold tabular-nums">{total.toFixed(1)}</span>
            </div>
            <ul className="mt-2 space-y-1 text-sm text-muted">
              {side.players.map((p) => (
                <li key={p.slug} className="flex justify-between">
                  <span>
                    {p.name} <span className="text-xs">{p.position} · {p.team}</span>
                  </span>
                  <span className="tabular-nums">{p.projection.toFixed(1)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {(() => {
        const odds = computeMatchupOdds(totalA, totalB, matchup.sideA.players.length, matchup.sideB.players.length);
        return (
          <MatchupOddsBar
            leftLabel={matchup.sideA.label}
            rightLabel={matchup.sideB.label}
            leftWinPct={odds.myWinPct}
            rightWinPct={odds.opponentWinPct}
          />
        );
      })()}
    </div>
  );
}
