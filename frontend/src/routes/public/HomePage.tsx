/* The public landing page. Routes are meant to stay thin: they compose
   sections and nothing else.

   The page leads with the claim and then immediately proves it with live
   board data, rather than describing the product in the abstract. A
   projections site whose front door shows no projections is asking to be
   taken on faith. */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "@/lib/apiClient";
import type { RankingEntry, RankingManifestItem } from "@/lib/types";
import PlayerPhoto from "@/components/PlayerPhoto";

export default function HomePage() {
  const [top, setTop] = useState<RankingEntry[] | null>(null);
  const [weekLabel, setWeekLabel] = useState<string>("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    apiGet<RankingManifestItem[]>("/rankings/redraft")
      .then(async (manifest) => {
        const weekly = manifest.filter((m) => m.type === "weekly");
        const latest = weekly[weekly.length - 1];
        if (!latest) return;
        const entries = await apiGet<RankingEntry[]>(
          `/rankings/redraft/${latest.key}?format=ppr`,
        );
        if (cancelled) return;
        setWeekLabel(latest.label);
        setTop(entries.slice(0, 10));
      })
      .catch(() => !cancelled && setFailed(true));

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      {/* The header and footer slabs are dark so the lockup reads on them,
          which leaves the hero to carry the brand color. */}
      <section className="rounded-slab bg-brand px-6 py-14 text-on-brand sm:px-12 sm:py-20">
        <h1 className="max-w-3xl text-4xl font-bold leading-[1.05] tracking-[-0.03em] sm:text-6xl">
          Rankings that don't just repeat the betting line.
        </h1>
        <p className="mt-6 max-w-[62ch] text-lg text-white/85">
          Our power ratings come from score differential adjusted for who a team has actually
          played, blended with play-by-play efficiency. The Vegas line gets a minority vote — it
          doesn't set the number.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link
            to="/redraft"
            className="rounded-full bg-surface px-6 py-3 font-display text-[13px] font-bold uppercase tracking-[0.08em] text-brand transition-colors hover:bg-brand-50"
          >
            This week's rankings
          </Link>
          <Link
            to="/games"
            className="rounded-full border border-white/40 px-6 py-3 font-display text-[13px] font-bold uppercase tracking-[0.08em] transition-colors hover:bg-white/10"
          >
            Game picks
          </Link>
        </div>
      </section>

      <section className="mt-16">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-2xl font-bold">
            {weekLabel ? `${weekLabel} top 10` : "This week's top 10"}
          </h2>
          <Link
            to="/redraft"
            className="font-display text-[12px] font-bold uppercase tracking-[0.08em] text-brand hover:text-brand-strong"
          >
            Every player
          </Link>
        </div>

        {failed && (
          <p className="mt-6 text-sm text-muted">
            Rankings are unavailable right now. The full board is at{" "}
            <Link to="/redraft" className="text-brand underline underline-offset-2">
              redraft rankings
            </Link>
            .
          </p>
        )}

        {!top && !failed && (
          // Skeleton rows rather than a spinner: the layout lands once and
          // the content fills in, instead of the page jumping on arrival.
          <ul className="mt-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <li
                key={i}
                className="flex items-center gap-4 border-b border-border/60 py-3"
                aria-hidden="true"
              >
                <div className="h-4 w-5 rounded bg-surface-sunken" />
                <div className="h-9 w-9 rounded-full bg-surface-sunken" />
                <div className="h-4 w-40 rounded bg-surface-sunken" />
              </li>
            ))}
          </ul>
        )}

        {top && (
          <ol className="mt-5">
            {top.map((p) => (
              <li key={p.slug}>
                <Link
                  to={`/players/${p.slug}`}
                  className="flex items-center gap-4 border-b border-border/60 py-3 transition-colors hover:bg-hover-tint"
                >
                  <span className="w-5 text-right font-display text-sm font-bold tabular-nums text-muted">
                    {p.rank}
                  </span>
                  <PlayerPhoto src={p.photo_url} alt={p.name} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{p.name}</span>
                    <span className="block text-xs text-muted">
                      {p.position} · {p.team}
                      {p.opponent ? ` · vs ${p.opponent}` : ""}
                    </span>
                  </span>
                  <span className="font-display text-base font-bold tabular-nums">
                    {p.projection.toFixed(1)}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
