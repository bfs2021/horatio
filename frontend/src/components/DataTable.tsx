import { Fragment, useId, useState, type ReactNode, type TdHTMLAttributes } from "react";
import { Chevron } from "./TraitInfo";
import { Button } from "./ui";

/**
 * Where a column goes on a phone (#914):
 * - `title`: the row's first line, its one wide cell;
 * - `shown`: under the title, as "label: value";
 * - `detail`: left out (or in the opened row, when the table has one);
 * - `always`: a narrow cell of its own at every width, such as a tick box or the ⋯.
 */
export type Phone = "title" | "shown" | "detail" | "always";

export type Column<T> = {
  key: string;
  /** What its heading says. When it isn't plain text (a sort button, words for screen readers only), give `label` too. */
  header: ReactNode;
  /** Its name in words: the label before its value on a phone. */
  label?: string;
  phone: Phone;
  cell: (row: T) => ReactNode;
  /** For a `shown` column, what a phone shows in place of its cell; null leaves it out for that row. */
  folded?: (row: T) => ReactNode;
  /** Shown on a phone without its label, for a value that says what it is (a badge). */
  bare?: boolean;
  /** Right-aligned, with figures of one width, so a column of numbers lines up. */
  numeric?: boolean;
  /** Added to each of its cells (and to its heading, with `headClassName`). */
  className?: string;
  headClassName?: string;
  /** Its heading's `aria-sort`, when the list is sorted by it. */
  sort?: "ascending" | "descending";
  /** More for a cell, such as an aria-label or a title. */
  cellProps?: (row: T) => TdHTMLAttributes<HTMLTableCellElement>;
};

/** The width from which it is a table; below it, each row folds into a block. */
type Breakpoint = "sm" | "lg";

// Written out in full for each width, so Tailwind finds every class.
const AT: Record<Breakpoint, { head: string; wide: string; narrow: string; title: string; opened: string }> = {
  sm: { head: "max-sm:sr-only", wide: "hidden sm:table-cell", narrow: "sm:hidden", title: "max-sm:w-full max-sm:max-w-0", opened: "sm:pl-10" },
  lg: { head: "max-lg:sr-only", wide: "hidden lg:table-cell", narrow: "lg:hidden", title: "max-lg:w-full max-lg:max-w-0", opened: "lg:pl-10" },
};

/**
 * A table that fits a phone (#914). From `stackBelow` up (`sm` unless said) it is a
 * table, read as one by a screen reader; below it each row is a block: its title
 * column on the first line, the `shown` columns under it as "label: value", its
 * `detail` columns left out. The headings stay, for screen readers only.
 *
 * With `expand`, a chevron at the start of each row opens a row under it, across
 * the table, with `expand.render`; more than one can be open.
 */
export function DataTable<T>({
  label,
  columns,
  rows,
  rowKey,
  rowLabel,
  stackBelow = "sm",
  expand,
  foldClassName = "",
  className = "",
  busy,
  dense = false,
}: {
  /** The table's name, for screen readers. */
  label: string;
  columns: Column<NoInfer<T>>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** A row's name, for screen readers and tests, when its title cell alone isn't it. */
  rowLabel?: (row: T) => string;
  stackBelow?: Breakpoint;
  expand?: {
    /** The chevron's name, such as "Ada's characters"; the opened row is a region of that name only if `render` makes one. */
    label: (row: T) => string;
    render: (row: T) => ReactNode;
  };
  /** Added to the block of "label: value" under the title, such as to line it up past a picture. */
  foldClassName?: string;
  className?: string;
  /** While it waits for a newer answer. */
  busy?: boolean;
  /** Shorter rows, for a page of many small tables of figures. */
  dense?: boolean;
}) {
  const at = AT[stackBelow];
  const id = useId();
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const shown = columns.filter((c) => c.phone === "shown");
  const span = columns.length + (expand ? 1 : 0);
  const toggle = (key: string) => {
    const next = new Set(opened);
    if (!next.delete(key)) next.add(key);
    setOpened(next);
  };

  // Where a column's cells show, and how they line up.
  const place = (c: Column<T>) => {
    if (c.phone === "always") return "w-px py-1.5 align-top";
    const narrow = c.phone === "title" ? at.title : at.wide;
    // A word longer than its column breaks rather than pushing the table wider than the page.
    return `${narrow} ${dense ? "py-1.5" : "py-2.5"} pr-3 align-top last:pr-0 ${c.numeric ? "text-right tabular-nums" : "wrap-anywhere"}`;
  };

  const fold = (row: T) => {
    const pairs = shown
      .map((c) => ({ c, value: c.folded ? c.folded(row) : c.cell(row) }))
      .filter(({ value }) => value !== null && value !== undefined && value !== false && value !== "");
    if (!pairs.length) return null;
    return (
      <span className={`${at.narrow} mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs ${foldClassName}`}>
        {pairs.map(({ c, value }) => (
          <span key={c.key} className="flex max-w-full min-w-0 items-baseline gap-1">
            {!c.bare && <span className="shrink-0 text-mist">{c.label ?? c.header}:</span>}
            <span className={`min-w-0 wrap-anywhere ${c.numeric ? "tabular-nums" : ""}`}>{value}</span>
          </span>
        ))}
      </span>
    );
  };

  return (
    <table aria-label={label} aria-busy={busy || undefined} className={`w-full text-sm ${className}`}>
      <thead className={at.head}>
        <tr className="border-b border-ash text-left text-xs text-mist">
          {expand && (
            <th className="w-px py-2 pr-1 font-normal">
              <span className="sr-only">Open</span>
            </th>
          )}
          {columns.map((c) => (
            <th
              key={c.key}
              aria-sort={c.sort}
              className={`${c.phone === "always" ? "w-px" : c.phone === "title" ? "" : at.wide} py-2 pr-3 font-normal last:pr-0 ${c.numeric ? "text-right" : ""} ${c.headClassName ?? ""}`}
            >
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-ash">
        {rows.map((row) => {
          const key = rowKey(row);
          const open = opened.has(key);
          const openedId = `${id}-${key}`;
          return (
            <Fragment key={key}>
              <tr aria-label={rowLabel?.(row)} className={open ? "border-b-0" : undefined}>
                {expand && (
                  <td className="w-px py-1 pr-1 align-top">
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-8 px-1.5"
                      aria-label={expand.label(row)}
                      aria-expanded={open}
                      aria-controls={open ? openedId : undefined}
                      onClick={() => toggle(key)}
                    >
                      <Chevron open={open} />
                    </Button>
                  </td>
                )}
                {columns.map((c) => (
                  <td key={c.key} {...c.cellProps?.(row)} className={`${place(c)} ${c.className ?? ""}`}>
                    {c.cell(row)}
                    {c.phone === "title" && fold(row)}
                  </td>
                ))}
              </tr>
              {expand && open && (
                <tr id={openedId}>
                  <td colSpan={span} className={`pb-3 ${at.opened}`}>
                    {expand.render(row)}
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
