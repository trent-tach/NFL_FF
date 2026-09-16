import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDownIcon } from "./icons";

export type NavItem = { to: string; label: string };

/* A menu button in the nav slab. `role="menu"` is a promise about keyboard
   behavior -- arrow keys move between items, Home/End jump to the ends,
   Escape closes and returns focus to the trigger -- so this implements that
   contract rather than just borrowing the role name. */

export default function NavDropdown({ label, items }: { label: string; items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  // Which item should hold focus once the panel renders. -1 means "the
  // panel opened by mouse", where moving focus would be unwelcome.
  const [focusIndex, setFocusIndex] = useState(-1);

  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Focus follows state rather than being moved inline, so opening by
  // keyboard and arrowing within the panel share one code path.
  useEffect(() => {
    if (open && focusIndex >= 0) itemRefs.current[focusIndex]?.focus();
  }, [open, focusIndex]);

  function close(returnFocus: boolean) {
    setOpen(false);
    setFocusIndex(-1);
    if (returnFocus) triggerRef.current?.focus();
  }

  function onTriggerKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
      setFocusIndex(0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setFocusIndex(items.length - 1);
    } else if (e.key === "Escape") {
      close(true);
    }
  }

  function onMenuKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusIndex((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusIndex((i) => (i - 1 + items.length) % items.length);
    } else if (e.key === "Home") {
      e.preventDefault();
      setFocusIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setFocusIndex(items.length - 1);
    } else if (e.key === "Tab") {
      // Tabbing out of a menu closes it, but focus should keep going where
      // the user sent it -- so no preventDefault and no focus restore.
      close(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="flex items-center gap-1 rounded-full px-3 py-1.5 font-display text-[12px] font-bold uppercase tracking-[0.08em] transition-colors hover:bg-white/15"
      >
        {label}
        <ChevronDownIcon
          size={14}
          className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className="absolute left-0 top-full z-50 mt-2 min-w-48 rounded-card border border-border bg-surface p-1.5 text-ink shadow-card"
        >
          {items.map((item, i) => (
            <Link
              key={item.to}
              to={item.to}
              role="menuitem"
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              onClick={() => close(false)}
              className="block rounded-[8px] px-3 py-2 text-sm font-medium transition-colors hover:bg-hover-tint"
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
