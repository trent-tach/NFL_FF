import type { ReactNode } from "react";

/* One table implementation for every board on the site.

   Two decisions worth knowing before adding a column:

   1. Columns are config, not JSX. The tables this replaced wrote each
      conditional column twice -- once in <thead>, once in <tbody> -- so a
      column that appeared only on weekly boards had to be guarded in four
      places and drifted out of sync. Here a column is one object, and
      `columns.filter(...)` at the call site adds or removes it everywhere.

   2. Narrow widths drop columns and then switch to cards; they never scroll
      sideways. A horizontally scrolling table hides the numbers people came
      for behind a gesture they have no reason to guess at, and on this site
      it also dragged the whole page sideways. `hideBelow` sheds the
      context columns first, and below `sm` the row becomes a card. */

export type Column<T> = {
  key: string;
  header: ReactNode;
  align?: "left" | "right";
  /** Width/utility classes applied to both the header and its cells. */
  className?: string;
  /** Hide this column below the given breakpoint. */
  hideBelow?: "sm" | "md" | "lg";
  cell: (row: T) => ReactNode;
};

// Written out rather than interpolated: Tailwind scans source text for class
// names, so `hidden ${bp}:table-cell` would never be generated.
const HIDE_BELOW: Record<NonNullable<Column<unknown>["hideBelow"]>, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
};

export default function DataTable<T>({
  rows,
  columns,
  rowKey,
  renderCard,
  emptyMessage = "Nothing to show yet.",
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** Mobile presentation. Without it, the table renders at every width. */
  renderCard?: (row: T) => ReactNode;
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-muted">{emptyMessage}</p>;
  }

  const table = (
    <table className="w-full text-sm">
      <thead>
        {/* Sticky so the column meaning survives a 900-row scroll. This is
            also why there is no overflow wrapper: a scroll container would
            make `top-0` resolve against the container, not the viewport,
            and the header would never stick. */}
        <tr className="sticky top-0 z-10 border-b border-border bg-ground text-left">
          {columns.map((col) => (
            <th
              key={col.key}
              scope="col"
              className={`whitespace-nowrap py-2.5 pr-3 font-display text-[11px] font-bold uppercase tracking-[0.06em] text-muted ${
                col.align === "right" ? "text-right" : ""
              } ${col.hideBelow ? HIDE_BELOW[col.hideBelow] : ""} ${col.className ?? ""}`}
            >
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={rowKey(row)} className="border-b border-border/60 transition-colors hover:bg-hover-tint">
            {columns.map((col) => (
              <td
                key={col.key}
                className={`py-2.5 pr-3 ${col.align === "right" ? "text-right tabular-nums" : ""} ${
                  col.hideBelow ? HIDE_BELOW[col.hideBelow] : ""
                } ${col.className ?? ""}`}
              >
                {col.cell(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );

  if (!renderCard) return table;

  return (
    <>
      <div className="sm:hidden">
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={rowKey(row)}>{renderCard(row)}</li>
          ))}
        </ul>
      </div>
      <div className="hidden sm:block">{table}</div>
    </>
  );
}
