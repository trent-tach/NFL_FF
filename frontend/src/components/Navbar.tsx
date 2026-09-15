import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import NavDropdown, { type NavItem } from "./NavDropdown";
import Wordmark from "./Wordmark";
import { MenuIcon, CloseIcon } from "./icons";

/* The header slab: a saturated panel inset from the page edges with a deep
   bottom radius, so the page reads as stacked panels on cream rather than as
   a document with a rule across the top. The hero and footer repeat the
   shape.

   Only the few destinations people actually navigate to sit in the bar. The
   full tree lives behind the menu button, which is present at every width --
   that is what keeps the bar from collapsing into a scrolling row of links
   on a phone, which is how the previous header overflowed. */

const RANKINGS: NavItem[] = [
  { to: "/redraft", label: "Redraft rankings" },
  { to: "/dynasty", label: "Dynasty rankings" },
];

// The sheet's full tree. Every entry here resolves to a real route; an
// unbuilt destination belongs in the backlog, not in the nav.
const SHEET_SECTIONS: { heading: string; items: NavItem[] }[] = [
  { heading: "Rankings", items: RANKINGS },
  {
    heading: "This week",
    items: [
      { to: "/games", label: "Game predictions" },
      { to: "/tools/start-sit", label: "Start/Sit" },
    ],
  },
  {
    heading: "Your teams",
    items: [
      { to: "/my-leagues", label: "My leagues" },
      { to: "/my-matchups", label: "Your matchups" },
    ],
  },
];

const barLink =
  "rounded-full px-3 py-1.5 font-display text-[12px] font-bold uppercase tracking-[0.08em] transition-colors";

function BarLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `${barLink} ${isActive ? "bg-white/20" : "hover:bg-white/15"}`
      }
    >
      {children}
    </NavLink>
  );
}

function MobileSheet({ onClose }: { onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();

    // The sheet covers the page, so the page behind it must not scroll --
    // otherwise closing returns you somewhere you never navigated to.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key !== "Tab") return;

    // Keep Tab inside the sheet. Without this, focus walks into the page
    // underneath, which is still rendered and still focusable.
    const focusable = panelRef.current?.querySelectorAll<HTMLElement>("a[href], button");
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Site menu"
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-[60] overflow-y-auto bg-ground px-5 py-5"
    >
      <div className="mx-auto max-w-6xl">
        <div className="flex h-10 items-center justify-between">
          <Wordmark size="sm" className="text-brand" />
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-full p-2 text-ink transition-colors hover:bg-hover-tint"
          >
            <CloseIcon size={22} />
          </button>
        </div>

        <nav className="mt-8 flex flex-col gap-9 pb-10">
          {SHEET_SECTIONS.map((section) => (
            <div key={section.heading}>
              <h2 className="font-display text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
                {section.heading}
              </h2>
              <div className="mt-3 flex flex-col">
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={onClose}
                    className={({ isActive }) =>
                      `-mx-2 rounded-[10px] px-2 py-2.5 font-display text-2xl font-bold tracking-[-0.02em] transition-colors ${
                        isActive ? "text-brand" : "hover:bg-hover-tint"
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </div>
    </div>
  );
}

export default function Navbar() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { pathname } = useLocation();

  // A route change with the sheet still open would leave it covering the
  // page it just navigated to.
  useEffect(() => setSheetOpen(false), [pathname]);

  return (
    // `on-brand` flips the focus ring to white for everything in the slab;
    // the default brand-colored ring would be invisible against it.
    <header className="on-brand px-3 sm:px-4 lg:px-6">
      <nav className="relative mx-auto flex h-16 max-w-6xl items-center gap-1 rounded-b-slab bg-brand px-2 text-on-brand shadow-slab sm:px-4">
        <button
          onClick={() => setSheetOpen(true)}
          aria-label="Open menu"
          aria-expanded={sheetOpen}
          className="rounded-full p-2 transition-colors hover:bg-white/15"
        >
          <MenuIcon size={22} />
        </button>

        <div className="hidden items-center gap-0.5 lg:flex">
          <NavDropdown label="Rankings" items={RANKINGS} />
          <BarLink to="/games">Games</BarLink>
        </div>

        {/* `ml-auto` below lg pushes the CTA to the far right, so the phone
            layout reads hamburger / mark / action with the mark actually on
            center. From lg the left cluster exists, and the CTA tucks in
            beside it while the right cluster takes the free space. */}
        <Link
          to="/tools/start-sit"
          className="ml-auto rounded-full bg-surface px-4 py-1.5 font-display text-[12px] font-bold uppercase tracking-[0.08em] text-brand transition-colors hover:bg-brand-50 lg:ml-1"
        >
          Start/Sit
        </Link>

        {/* Absolutely centered so the mark stays on the page's optical
            center line regardless of how wide the two clusters are. */}
        <Link
          to="/"
          aria-label="FF home"
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        >
          <Wordmark />
        </Link>

        <div className="ml-auto hidden items-center gap-0.5 lg:flex">
          <BarLink to="/my-leagues">My leagues</BarLink>
          <BarLink to="/my-matchups">Your matchups</BarLink>
        </div>
      </nav>

      {sheetOpen && <MobileSheet onClose={() => setSheetOpen(false)} />}
    </header>
  );
}
