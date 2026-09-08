import type { GamePrediction } from "@/lib/types";

// A rotating accent palette per card, purely for visual variety (not tied
// to any data), matching the colorful-card-grid look of the reference design.
const ACCENTS = [
  { text: "text-blue-700", bar: "bg-blue-700", bg: "bg-blue-50" },
  { text: "text-red-700", bar: "bg-red-700", bg: "bg-red-50" },
  { text: "text-sky-600", bar: "bg-sky-600", bg: "bg-sky-50" },
  { text: "text-slate-700", bar: "bg-slate-700", bg: "bg-slate-50" },
  { text: "text-indigo-700", bar: "bg-indigo-700", bg: "bg-indigo-50" },
  { text: "text-teal-700", bar: "bg-teal-700", bg: "bg-teal-50" },
  { text: "text-orange-700", bar: "bg-orange-700", bg: "bg-orange-50" },
  { text: "text-purple-700", bar: "bg-purple-700", bg: "bg-purple-50" },
];

function TeamRow({
  team,
  logoUrl,
  label,
  bandLow,
  bandHigh,
  score,
  isPick,
  accentBg,
}: {
  team: string;
  logoUrl: string | null;
  label: "AWAY" | "HOME";
  bandLow: number;
  bandHigh: number;
  score: number;
  isPick: boolean;
  accentBg: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 rounded-md px-3 py-2 ${isPick ? accentBg : ""}`}>
      <div className="flex items-center gap-2">
        {logoUrl && <img src={logoUrl} alt={team} width={28} height={28} />}
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-semibold">{team}</span>
            {isPick && (
              <span className="rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-bold text-white">
                PICK
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted">
            {label} · 80% band {bandLow.toFixed(0)}-{bandHigh.toFixed(0)}
          </div>
        </div>
      </div>
      <div className="text-xl font-bold tabular-nums">{score.toFixed(1)}</div>
    </div>
  );
}

export default function GameCard({ game, index }: { game: GamePrediction; index: number }) {
  const accent = ACCENTS[index % ACCENTS.length];
  const winner = game.pick_team === game.home_team ? game.home_team : game.away_team;
  const loser = game.pick_team === game.home_team ? game.away_team : game.home_team;

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className={`h-1 ${accent.bar}`} />
      <div className="p-4">
        <div className="flex items-center justify-between text-[11px] text-muted">
          <span>{game.kickoff}</span>
          <span>
            {game.spread_display} · O/U {game.total_line}
          </span>
        </div>

        <div className="mt-1 flex items-center gap-2">
          <h3 className={`font-bold ${accent.text}`}>
            {winner} over {loser} · {game.pick_win_pct.toFixed(1)}%
          </h3>
          {game.is_upset && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
              UPSET PICK
            </span>
          )}
        </div>

        <div className="mt-3 space-y-1">
          <TeamRow
            team={game.away_team}
            logoUrl={game.away_logo_url}
            label="AWAY"
            bandLow={game.away_band_low}
            bandHigh={game.away_band_high}
            score={game.away_score}
            isPick={game.pick_team === game.away_team}
            accentBg={accent.bg}
          />
          <TeamRow
            team={game.home_team}
            logoUrl={game.home_logo_url}
            label="HOME"
            bandLow={game.home_band_low}
            bandHigh={game.home_band_high}
            score={game.home_score}
            isPick={game.pick_team === game.home_team}
            accentBg={accent.bg}
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
            <div className={accent.bar} style={{ width: `${game.away_win_pct}%` }} />
            <div className="bg-black/70" style={{ width: `${game.home_win_pct}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
