/**
 * A column heading that sorts a table by it (a `DataTable` column's `header`), with
 * an arrow for the way it is sorted: ↑ ascending, ↓ descending. Give the column the
 * same `sort` as its `aria-sort`, and `label` for its name. On a narrow screen, where
 * the headings are for screen readers only, it is the plain label.
 */
export function SortHeading({ label, sort, onSort }: { label: string; sort: "ascending" | "descending" | undefined; onSort: () => void }) {
  return (
    <>
      <span className="lg:hidden">{label}</span>
      <button type="button" className="inline-flex items-center gap-1 hover:text-parchment max-lg:hidden" onClick={onSort}>
        {label}
        <span aria-hidden="true" className="inline-block w-2.5">
          {sort === "descending" ? "↓" : sort === "ascending" ? "↑" : ""}
        </span>
      </button>
    </>
  );
}
