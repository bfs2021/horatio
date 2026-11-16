import { Link } from "react-router";
import type { BoonTotalsOut } from "../../api/types";
import { kindName, type BoonKind } from "../../boons";
import { everyBoon, narrowed, type LedgerSearch } from "./boonSearch";

const count = new Intl.NumberFormat("en-GB");

// The views the strip counts, in its order; Void, Pending and All stay in the toolbar.
const SHOWN = [
  { view: "open", label: "Open" },
  { view: "departed", label: "Departed" },
  { view: "settled", label: "Settled" },
] as const;

/**
 * The whole ledger at a glance (#977), above its toolbar, as the troupe's old sheet
 * opened its standings: how many boons are open, departed and settled, how many wait
 * under To review (`review`: their number and the To review tab, #982; null for one
 * who doesn't review), then the open boons by kind. It counts the whole ledger,
 * whatever the search, so it holds still (the toolbar's views count within a search).
 * Each number shows its boons: it sets that view or kind, and clears the search and
 * filters so the table holds just those; To review's opens its tab.
 */
export function BoonTotals({
  totals,
  review,
  search,
  show,
}: {
  totals: BoonTotalsOut;
  review: { count: number; to: string } | null;
  search: LedgerSearch;
  show: (to: LedgerSearch) => void;
}) {
  // Whether the table shows one of the strip's numbers now: nothing but a kind narrows it.
  const bare = !narrowed({ ...search, kinds: [] });
  const look = (on: boolean) => `group inline-flex min-h-8 items-baseline gap-1.5 border-b-2 pt-1 pointer-coarse:min-h-10 ${on ? "border-gold" : "border-transparent hover:border-ash"}`;
  const says = (label: string, n: number) => (
    <>
      <span className="text-xs text-mist group-hover:text-parchment">{label}</span>{" "}
      <span className="font-semibold text-parchment tabular-nums">{count.format(n)}</span>
    </>
  );
  const item = (label: string, n: number, view: LedgerSearch["view"], kinds: BoonKind[] = []) => {
    const on = bare && search.view === view && search.kinds.join() === kinds.join();
    return (
      <button key={kinds[0] ?? view} type="button" aria-current={on || undefined} onClick={() => show({ ...everyBoon(search), view, kinds })} className={look(on)}>
        {says(label, n)}
      </button>
    );
  };
  return (
    <div role="group" aria-label="The whole ledger" className="flex flex-wrap items-baseline gap-x-6 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-3 sm:gap-x-4">
        {SHOWN.map((v) => item(v.label, totals.views[v.view] ?? 0, v.view))}
        {review && (
          <Link to={review.to} className={look(false)}>
            {says("To review", review.count)}
          </Link>
        )}
      </div>
      <div role="group" aria-label="Open boons by kind" className="flex flex-wrap items-baseline gap-x-3 sm:gap-x-4 lg:border-l lg:border-ash lg:pl-6">
        <span aria-hidden="true" className="text-xs text-mist max-sm:hidden">
          Open by kind:
        </span>
        {totals.open_by_kind.map((k) => item(kindName(k.kind), k.count, "open", [k.kind]))}
      </div>
    </div>
  );
}
