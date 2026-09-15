import type { GamePrediction } from "@/lib/types";
import { distinguishPair, readableOn, safeTeamColor } from "@/lib/teamColor";

/* A game card is tinted by the teams in it. The previous version rotated
   through eight fixed accents by array index, which meant the color said
   nothing -- on a sports site that is a wasted channel, and the same game
   changed color depending on where it landed in the grid. */

function TeamRow({
  team,
  logoUrl,
  color,
  label,
  bandLow,
  bandHigh,
  score,
  isPick,
}: {
  team: string;
  logoUrl: string | null;
  color: string;
  label: "AWAY" | "HOME";
  bandLow: number;
  bandHigh: number;
  score: number;
  isPick: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-[10px] px-3 py-2 ${
        isPick ? "bg-surface-sunken" : ""
      }`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {logoUrl && <img src={logoUrl} alt="" width={28} height={28} loading="lazy" />}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-display font-bold">{team}</span>
            {isPick && (
              <span
                className="rounded-full px-1.5 py-0.5 font-display text-[11px] font-bold uppercase leading-none tracking-[0.04em]"
                style={{ backgroundColor: color, color: readableOn(color) }}
              >
                Pick
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted">
            {label} · 80% band {bandLow.toFixed(0)}–{bandHigh.toFixed(0)}
          </div>
        </div>
      </div>
      <div className="font-display text-xl font-bold tabular-nums">{score.toFixed(1)}</div>
    </div>
  );
}

export default function GameCard({ game }: { game: GamePrediction }) {
  const winner = game.pick_team === game.home_team ? game.home_team : game.away_team;
  const loser = game.pick_team === game.home_team ? game.away_team : game.home_team;

  // The probability bar is the one place both colors sit edge to edge, so
  // it is the one place they have to be guaranteed distinguishable.
  const [awayBar, homeBar] = distinguishPair(game.away_color, game.home_color);
  const pickColor = safeTeamColor(
    game.pick_team === game.home_team ? game.home_color : game.away_color,
  );

  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
      {/* Carries the pick, so the strip is information: the card is wearing
          the color of the team we think wins. */}
      <div className="h-1" style={{ backgroundColor: pickColor }} />

      <div className="p-4">
        <div className="flex items-center justify-between text-[11px] text-muted">
          <span>{game.kickoff}</span>
          <span>
            {game.spread_display} · O/U {game.total_line != null ? game.total_line : "TBD"}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h3 className="font-display text-base font-bold">
            {winner} over {loser} · {game.pick_win_pct.toFixed(1)}%
          </h3>
          {game.is_upset && (
            <span className="rounded-full border border-warning-border bg-warning-soft px-1.5 py-0.5 font-display text-[11px] font-bold uppercase leading-none tracking-[0.04em] text-warning">
              Upset pick
            </span>
          )}
        </div>

        <div className="mt-3 space-y-1">
          <TeamRow
            team={game.away_team}
            logoUrl={game.away_logo_url}
            color={safeTeamColor(game.away_color)}
            label="AWAY"
            bandLow={game.away_band_low}
            bandHigh={game.away_band_high}
            score={game.away_score}
            isPick={game.pick_team === game.away_team}
          />
          <TeamRow
            team={game.home_team}
            logoUrl={game.home_logo_url}
            color={safeTeamColor(game.home_color)}
            label="HOME"
            bandLow={game.home_band_low}
            bandHigh={game.home_band_high}
            score={game.home_score}
            isPick={game.pick_team === game.home_team}
          />
        </div>

        <div className="mt-3">
          <div className="flex justify-between text-[11px] text-muted">
            <span>
              {game.away_team} {game.away_win_pct.toFixed(1)}%
            </span>
            <span>
              {game.home_team} {game.home_win_pct.toFixed(1)}%
            </span>
          </div>
          <div className="mt-1 flex h-1.5 w-full overflow-hidden rounded-full bg-border">
            <div style={{ width: `${game.away_win_pct}%`, backgroundColor: awayBar }} />
            <div style={{ width: `${game.home_win_pct}%`, backgroundColor: homeBar }} />
          </div>
        </div>
      </div>
    </div>
  );
}
