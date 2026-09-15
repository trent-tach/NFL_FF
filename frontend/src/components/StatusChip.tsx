/* Availability at a glance: the designation a fantasy player actually
   checks before setting a lineup. Abbreviated the way the league does it
   (Q/D/O/IR), with the full word in the title so the letter is never the
   only thing carrying the meaning.

   Severity is encoded in color AND letter, never color alone. */

const STYLES: Record<string, { label: string; title: string; className: string }> = {
  questionable: {
    label: "Q",
    title: "Questionable",
    className: "bg-warning-soft text-warning border-warning-border",
  },
  doubtful: {
    label: "D",
    title: "Doubtful",
    className: "bg-warning-soft text-warning border-warning-border",
  },
  out: {
    label: "O",
    title: "Out",
    className: "bg-danger-soft text-danger border-danger-border",
  },
  ir: {
    label: "IR",
    title: "Injured reserve",
    className: "bg-danger-soft text-danger border-danger-border",
  },
  bye: {
    label: "BYE",
    title: "On bye this week",
    className: "bg-surface-sunken text-muted border-border-strong",
  },
};

export default function StatusChip({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  const style = STYLES[status.trim().toLowerCase()];
  if (!style) return null;

  return (
    <span
      title={style.title}
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 font-display text-[11px] font-bold uppercase leading-none tracking-[0.04em] ${style.className}`}
    >
      {style.label}
      <span className="sr-only"> — {style.title}</span>
    </span>
  );
}
