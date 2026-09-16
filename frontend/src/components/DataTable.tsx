import { useMemo, useState, type ReactNode } from "react";
import { ChevronDownIcon } from "./icons";

/* One table implementation for every board on the site.

   Three decisions worth knowing before adding a column:

   1. Columns are config, not JSX. The tables this replaced wrote each
      conditional column twice -- once in <thead>, once in <tbody> -- so a
      column that appeared only on weekly boards had to be guarded in four
      places and drifted out of sync. Here a column is one object, and
      `columns.filter(...)` at the call site adds or removes it everywhere.

   2. Narrow widths drop columns and then switch to cards; they never scroll
      sideways. A horizontally scrolling table hides the numbers people came
      for behind a gesture they have no reason to guess at, and on this site
      it also dragged the whole page sideways. `hideBelow` sheds the
      context columns first, and below `sm` the row becomes a card.

   3. Sorting is opt-in per column and does nothing until at least one
      column asks for it -- `RankingsTable` and friends pass neither prop
      and get their existing server-ordered behavior untouched. A stats
      explorer with eight comparable numbers is the case sorting exists for;
      a board that's already meaningfully ordered by rank isn't. */

export type Column<T> = {
  key: string;
  header: ReactNode;
  align?: "left" | "right";
  /** Width/utility classes applied to both the header and its cells. */
  className?: string;
  /** Hide this column below the given breakpoint. */
  hideBelow?: "sm" | "md" | "lg";
  cell: (row: T) => ReactNode;
  /** Turns the header into a sort toggle. Requires `sortValue`. */
  sortable?: boolean;
  /** The value to compare on -- `cell`'s return is a ReactNode and isn't
   *  itself comparable, so this is required whenever `sortable` is true. */
  sortValue?: (row: T) => number | string | null;
};

// Written out rather than interpolated: Tailwind scans source text for class
// names, so `hidden ${bp}:table-cell` would never be generated.
const HIDE_BELOW: Record<NonNullable<Column<unknown>["hideBelow"]>, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
};

type SortState = { key: string; dir: "asc" | "desc" } | null;

function sortRows<T>(rows: T[], columns: Column<T>[], sort: SortState): T[] {
  if (!sort) return rows;
  const column = columns.find((c) => c.key === sort.key);
  if (!column?.sortValue) return rows;

  const withValue = rows.map((row) => ({ row, value: column.sortValue!(row) }));
  withValue.sort((a, b) => {
    // Nulls sort last regardless of direction -- "no data" should never
    // masquerade as the smallest (or, worse, on a desc sort, the largest)
    // real value on the board.
    if (a.value == null && b.value == null) return 0;
    if (a.value == null) return 1;
    if (b.value == null) return -1;
    const cmp = a.value < b.value ? -1 : a.value > b.value ? 1 : 0;
    return sort.dir === "asc" ? cmp : -cmp;
  });
  return withValue.map((w) => w.row);
}

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
  const [sort, setSort] = useState<SortState>(null);
  const sortedRows = useMemo(() => sortRows(rows, columns, sort), [rows, columns, sort]);

  if (rows.length === 0) {
    return <p className="py-8 text-center text-muted">{emptyMessage}</p>;
  }

  function toggleSort(key: string) {
    // unset -> desc -> asc -> unset. Desc-first because "biggest number on
    // top" is the natural read for a stats board -- nobody opens a target
    // share leaderboard wanting to see the zeroes first.
    setSort((prev) => {
      if (prev?.key !== key) return { key, dir: "desc" };
      if (prev.dir === "desc") return { key, dir: "asc" };
      return null;
    });
  }

  const table = (
    <table className="w-full text-sm">
      <thead>
        {/* Sticky so the column meaning survives a 900-row scroll. This is
            also why there is no overflow wrapper: a scroll container would
            make `top-0` resolve against the container, not the viewport,
            and the header would never stick. */}
        <tr className="sticky top-0 z-10 border-b border-border bg-ground text-left">
          {columns.map((col) => {
            const active = sort?.key === col.key;
            const alignClass = col.align === "right" ? "text-right" : "";
            const hideClass = col.hideBelow ? HIDE_BELOW[col.hideBelow] : "";
            if (!col.sortable) {
              return (
                <th
                  key={col.key}
                  scope="col"
                  className={`whitespace-nowrap py-2.5 pr-3 font-display text-[11px] font-bold uppercase tracking-[0.06em] text-muted ${alignClass} ${hideClass} ${col.className ?? ""}`}
                >
                  {col.header}
                </th>
              );
            }
            return (
              <th
                key={col.key}
                scope="col"
                aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}
                className={`whitespace-nowrap py-2.5 pr-3 font-display text-[11px] font-bold uppercase tracking-[0.06em] text-muted ${hideClass} ${col.className ?? ""}`}
              >
                <button
                  onClick={() => toggleSort(col.key)}
                  className={`inline-flex items-center gap-0.5 uppercase tracking-[0.06em] transition-colors hover:text-ink ${
                    col.align === "right" ? "flex-row-reverse" : ""
                  } ${active ? "text-ink" : ""}`}
                >
                  {col.header}
                  <ChevronDownIcon
                    size={12}
                    className={`shrink-0 transition-transform ${active ? "opacity-100" : "opacity-30"} ${
                      active && sort!.dir === "asc" ? "rotate-180" : ""
                    }`}
                  />
                </button>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {sortedRows.map((row) => (
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
          {sortedRows.map((row) => (
            <li key={rowKey(row)}>{renderCard(row)}</li>
          ))}
        </ul>
      </div>
      <div className="hidden sm:block">{table}</div>
    </>
  );
}
