import { Button } from "./ui";

const count = new Intl.NumberFormat("en-GB");

/** Which boons, rows or entries a page shows: "1 to 100 of 2,998". */
export function pageRange(offset: number, shown: number, total: number): string {
  if (total === 0) return "None";
  return `${count.format(offset + 1)} to ${count.format(offset + shown)} of ${count.format(total)}`;
}

/**
 * Previous and Next for a list read a page at a time (#978), with where it stands:
 * "101 to 200 of 2,998". Shows nothing while everything fits on one page.
 * `onPage` gets the page asked for, counting from 1. The buttons stay live while a
 * page loads, so focus stays on the one pressed.
 */
export function Pager({
  label,
  page,
  size,
  shown,
  total,
  onPage,
}: {
  /** What it pages, as its accessible name: "Pages of boons". */
  label: string;
  page: number;
  /** How many a full page holds. */
  size: number;
  /** How many this page holds. */
  shown: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const last = Math.max(1, Math.ceil(total / size));
  if (last === 1 && page === 1) return null;
  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <p className="text-mist" aria-live="polite">
        {pageRange((page - 1) * size, shown, total)}
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button variant="secondary" disabled={page >= last} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </nav>
  );
}
