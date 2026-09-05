/* The chrome that wraps every public page: nav on top, footer on the bottom.
   Individual pages never render their own nav or decide their own page
   margins, so everything stays aligned automatically.

   <Outlet /> is the important bit. It is the hole the matched child route
   renders into. This layout has no idea whether that is HomePage or anything
   else, and it should not. */

import { Outlet } from "react-router-dom";

export default function PublicLayout() {
  return (
    /* min-h-screen + flex-col + flex-1 on the middle band is the standard
       sticky-footer recipe: the footer sits at the bottom even on a
       near-empty page. */
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border">
        <nav className="mx-auto w-full max-w-6xl px-6 h-16 flex items-center">
          <span className="font-bold">Fantasy Football</span>
        </nav>
      </header>

      {/* The same mx-auto max-w-6xl px-6 appears on all three bands so the
          header, content and footer share one column width. */}
      <main className="mx-auto w-full max-w-6xl px-6 flex-1 py-10">
        <Outlet />
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto w-full max-w-6xl px-6 py-6 text-sm text-muted">
          &copy; 2026 Fantasy Football
        </div>
      </footer>
    </div>
  );
}
