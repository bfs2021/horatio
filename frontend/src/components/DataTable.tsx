import { Fragment, useEffect, useId, useRef, useState, type ReactNode, type TdHTMLAttributes } from "react";
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
 * the table, with `expand.render`; more than one can be open. With `expand.wholeRow`,
 * a click anywhere on the row opens it too; the chevron stays the way in from the
 * keyboard and for screen readers.
 *
 * With `select` instead, a click on a row, or its chevron, picks it, to show it
 * elsewhere (a side panel, #979): the picked row is marked, and when it is let go its
 * chevron has the focus again.
 *
 * With `groups` in place of `rows`, the rows come in groups (#981), each under a
 * heading row across the table, a button that opens and closes it.
 */
export function DataTable<T>({
  label,
  columns,
  rows = [],
  groups,
  rowKey,
  rowLabel,
  stackBelow = "sm",
  expand,
  foldClassName = "",
  className = "",
  busy,
  dense = false,
  select,
}: {
  /** The table's name, for screen readers. */
  label: string;
  columns: Column<NoInfer<T>>[];
  rows?: T[];
  /** The rows in groups, in place of `rows`: each under its `heading`, shown while `open`. */
  groups?: DataGroup<T>[];
  rowKey: (row: T) => string;
  /** A row's name, for screen readers and tests, when its title cell alone isn't it. */
  rowLabel?: (row: T) => string;
  stackBelow?: Breakpoint;
  expand?: {
    /** The chevron's name, such as "Ada's characters"; the opened row is a region of that name only if `render` makes one. */
    label: (row: T) => string;
    render: (row: T) => ReactNode;
    /** A click anywhere on the row opens it, not just on the chevron (#975). */
    wholeRow?: boolean;
  };
  /** Rows picked to be shown elsewhere, not opened under themselves (#979). */
  select?: {
    /** The chevron's name, such as "Details: Agnes owes Bram, minor". */
    label: (row: T) => string;
    onSelect: (row: T) => void;
    /** The key of the row picked, if any. */
    selected: string | null;
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
  const lead = Boolean(expand || select);
  const span = columns.length + (lead ? 1 : 0);
  // Each row's chevron, so a row let go has the focus back.
  const chevrons = useRef(new Map<string, HTMLButtonElement>());
  const picked = select?.selected ?? null;
  const lastPicked = useRef(picked);
  useEffect(() => {
    const was = lastPicked.current;
    lastPicked.current = picked;
    if (!was || picked) return;
    // After the frame, so a dialog closing doesn't take the focus back elsewhere.
    const frame = requestAnimationFrame(() => chevrons.current.get(was)?.focus());
    return () => cancelAnimationFrame(frame);
  }, [picked]);
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

  // A row, and the row opened under it.
  const line = (row: T) => {
    const key = rowKey(row);
    const open = opened.has(key);
    const openedId = `${id}-${key}`;
    const isPicked = picked === key;
    const onRow = select ? () => select.onSelect(row) : expand?.wholeRow ? () => toggle(key) : undefined;
    return (
      <Fragment key={key}>
        <tr
          aria-label={rowLabel?.(row)}
          className={`${open ? "border-b-0" : ""} ${onRow ? "cursor-pointer hover:bg-ash/30" : ""} ${isPicked ? "bg-ash/40" : ""}`}
          onClick={onRow ? (e) => !ownClick(e.target) && onRow() : undefined}
        >
          {/* Dense, the chevron is no taller than a line of text, so a row stays one line high. */}
          {expand && (
            <td className={`w-px pr-1 align-top ${dense ? "py-0" : "py-1"}`}>
              <Button
                type="button"
                variant="ghost"
                className={`px-1.5 ${dense ? "min-h-8!" : "min-h-8"}`}
                aria-label={expand.label(row)}
                aria-expanded={open}
                aria-controls={open ? openedId : undefined}
                onClick={() => toggle(key)}
              >
                <Chevron open={open} />
              </Button>
            </td>
          )}
          {select && (
            <td className={`w-px pr-1 align-top ${dense ? "py-0" : "py-1"}`}>
              <Button
                ref={(button) => {
                  if (button) chevrons.current.set(key, button);
                  else chevrons.current.delete(key);
                }}
                type="button"
                variant="ghost"
                className={`px-1.5 ${dense ? "min-h-8!" : "min-h-8"} ${isPicked ? "text-gold" : ""}`}
                aria-label={select.label(row)}
                aria-current={isPicked || undefined}
                onClick={() => select.onSelect(row)}
              >
                <Chevron open={false} />
              </Button>
            </td>
          )}
          {columns.map((c) => (
            <td key={c.key} {...c.cellProps?.(row)} className={`${place(c)} ${c.className ?? ""}`}>
              {/* The title's own content in a box of its own, apart from the fold, so its text reads as it did. */}
              {c.phone === "title" ? (
                <>
                  <div>{c.cell(row)}</div>
                  {fold(row)}
                </>
              ) : (
                c.cell(row)
              )}
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
  };

  return (
    <table aria-label={label} aria-busy={busy || undefined} className={`w-full text-sm ${className}`}>
      <thead className={at.head}>
        <tr className="border-b border-ash text-left text-xs text-mist">
          {lead && (
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
      {groups ? (
        groups.map((g, i) => {
          const groupId = `${id}-group-${i}`;
          return (
            <tbody key={g.key} id={groupId} className="divide-y divide-ash border-b border-ash">
              <tr>
                <th scope="rowgroup" colSpan={span} className="bg-dusk p-0 text-left font-normal">
                  <button
                    type="button"
                    aria-expanded={g.open}
                    aria-controls={g.open ? groupId : undefined}
                    onClick={g.onToggle}
                    className="flex min-h-10 w-full items-center gap-2 px-2 py-1.5 text-left hover:text-gold"
                  >
                    <Chevron open={g.open} />
                    {g.heading}
                  </button>
                </th>
              </tr>
              {g.open && g.rows.map(line)}
            </tbody>
          );
        })
      ) : (
        <tbody className="divide-y divide-ash">{rows.map(line)}</tbody>
      )}
    </table>
  );
}

/** A group of a table's rows (#981), under a heading row that opens and closes it. */
export type DataGroup<T> = {
  key: string;
  /** What its heading row says after the chevron, such as its name and how many it holds. */
  heading: ReactNode;
  rows: T[];
  open: boolean;
  onToggle: () => void;
};

/**
 * A click a row leaves alone: on something of its own (the chevron, a link, a
 * button), or that ends a selection, so copying a name doesn't open the row.
 */
function ownClick(target: EventTarget) {
  if (target instanceof Element && target.closest("a, button, input, select, textarea, label, summary")) return true;
  return Boolean(window.getSelection()?.toString());
}
