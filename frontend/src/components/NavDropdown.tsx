import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";

// link inside dropdown
type Item = { to: string; label: string }


export default function NavDropdown({ label, items }: { label: string; items: Item[] }) {

    // open close state calling setOpen re-renders
    const [open, setOpen] = useState(false);

    // holds dom node to find out if click was inside me
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;

        // click outside component close
        function handleClickOutside(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        }

        // esc key
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") setOpen(false);
        }

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", onKeyDown);

        // Runs when open flips false or the component unmounts.
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", onKeyDown);
        };
        // Re-runs whenever open changes.
    }, [open]);

    return (
        <div ref={ref} className="relative">
            <button onClick={() => setOpen((v) => !v)}
            className="px-3 py-2 text-sm font-medium hover:text-primary"
            >
            {label}
            </button>
           {/* When open is false, this renders nothing at all. */}
      {open && (
        <div
          role="menu"
          // z-50 keeps it above page content - without it the panel hides behind.
          className="absolute left-0 top-full z-50 mt-1 min-w-44 rounded-md border border-border bg-surface py-1 shadow-lg"
        >
          {items.map((item) => (
            <Link
              // React needs a stable id per list item; the URL works.
              key={item.to}
              to={item.to}
              role="menuitem"
              // Close after navigating - the page does not reload, so it would stay open.
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-sm hover:bg-black/5"
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}