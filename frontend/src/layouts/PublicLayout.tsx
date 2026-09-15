/* The chrome that wraps every public page: the update strip and nav slab on
   top, a footer slab on the bottom. Individual pages never render their own
   nav or decide their own page margins, so everything stays aligned
   automatically.

   <Outlet /> is the important bit. It is the hole the matched child route
   renders into. This layout has no idea whether that is HomePage or anything
   else, and it should not. */

import { Outlet } from "react-router-dom";
import Navbar from "@/components/Navbar";
import AnnouncementBar from "@/components/AnnouncementBar";
import Wordmark from "@/components/Wordmark";

export default function PublicLayout() {
  return (
    /* min-h-screen + flex-col + flex-1 on the middle band is the standard
       sticky-footer recipe: the footer sits at the bottom even on a
       near-empty page. */
    <div className="flex min-h-screen flex-col">
      <AnnouncementBar />
      <Navbar />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 sm:py-12">
        <Outlet />
      </main>

      {/* Mirrors the header: full width, same radius, turned the other way
          up, so the page is bracketed by the same shape. */}
      <footer className="mt-10">
        <div className="rounded-t-slab bg-surface-alt">
          <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
              <div className="max-w-sm">
                <Wordmark size="sm" className="text-brand" />
                <p className="mt-3 text-sm text-muted">
                  Weekly projections and straight-up game picks, built on our own
                  strength-of-schedule-adjusted power ratings and play efficiency.
                </p>
              </div>

              {/* The provenance a projection site owes its reader: what the
                  numbers are built from, and who made them. */}
              <dl className="text-sm">
                <dt className="font-display text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
                  How the numbers are made
                </dt>
                <dd className="mt-2 max-w-xs text-muted">
                  Power ratings from score differential adjusted for strength of schedule, blended
                  with play-by-play efficiency. Vegas lines are a minority input, never the
                  starting point. Play and schedule data from nflverse.
                </dd>
              </dl>
            </div>

            <p className="mt-10 border-t border-border pt-5 text-xs text-muted">
              &copy; {new Date().getFullYear()} FF. Projections are estimates, not advice.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
