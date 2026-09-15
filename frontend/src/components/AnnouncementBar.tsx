import { useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import type { RankingManifestItem } from "@/lib/types";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";

/* The strip above the nav slab. It carries real state, not marketing copy:
   when the model last ran, and which week the boards are on.

   That first one matters more than it looks. The whole pitch of this site is
   its own projections, and the first question anyone asks of a projection is
   how stale it is -- which is why every competitor puts a timestamp in the
   masthead. */

function formatStamp(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  // Fantasy runs on Eastern time regardless of where the reader is: kickoff
  // windows and waiver deadlines are quoted in ET, so a local-time stamp
  // would be the one number on the page in a different clock.
  const parts = date.toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `Updated ${parts} ET`;
}

export default function AnnouncementBar() {
  const [messages, setMessages] = useState<string[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;

    apiGet<RankingManifestItem[]>("/rankings/redraft")
      .then((manifest) => {
        if (cancelled) return;

        const next: string[] = [];
        const weekly = manifest.filter((m) => m.type === "weekly");
        const latest = weekly[weekly.length - 1];

        // `generated_at` only exists on boards imported since the converter
        // started stamping them, so the bar degrades to the week label
        // rather than showing a wrong or empty time.
        const stamp = latest?.generated_at ? formatStamp(latest.generated_at) : null;
        if (stamp) next.push(stamp);
        if (latest) next.push(`${latest.label} rankings are live`);

        const games = manifest.filter((m) => m.type === "games");
        if (games.length > 0) next.push(`Game picks through ${games[games.length - 1].label}`);

        setMessages(next);
      })
      .catch(() => {
        // A dead backend should cost the reader the strip, not the page.
        if (!cancelled) setMessages([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (messages.length === 0) return null;

  const step = (delta: number) =>
    setIndex((i) => (i + delta + messages.length) % messages.length);

  return (
    <div className="px-3 sm:px-4 lg:px-6">
      <div className="mx-auto flex h-9 max-w-6xl items-center justify-center gap-2">
        {messages.length > 1 && (
          <button
            onClick={() => step(-1)}
            aria-label="Previous update"
            className="rounded-full p-1 text-muted transition-colors hover:bg-hover-tint hover:text-ink"
          >
            <ChevronLeftIcon size={14} />
          </button>
        )}

        {/* aria-live so the rotation is announced rather than silently
            swapping text under a screen reader. */}
        <p
          aria-live="polite"
          className="truncate text-center font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-muted"
        >
          {messages[index]}
        </p>

        {messages.length > 1 && (
          <button
            onClick={() => step(1)}
            aria-label="Next update"
            className="rounded-full p-1 text-muted transition-colors hover:bg-hover-tint hover:text-ink"
          >
            <ChevronRightIcon size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
