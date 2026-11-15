import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { BoonTotalsOut } from "../../api/types";
import { readLedger, type LedgerSearch } from "./boonSearch";
import { BoonTotals } from "./BoonTotals";

afterEach(cleanup);

const totals: BoonTotalsOut = {
  views: { open: 1254, departed: 30, settled: 2100, void: 12, pending: 1, all: 3397 },
  open_by_kind: [
    { kind: "trivial", count: 386 },
    { kind: "minor", count: 700 },
    { kind: "major", count: 168 },
    { kind: "blood", count: 0 },
    { kind: "life", count: 0 },
  ],
};

function Strip({ start = "", toReview = null }: { start?: string; toReview?: number | null }) {
  const [search, setSearch] = useState<LedgerSearch>(readLedger(new URLSearchParams(start)));
  return (
    <>
      <BoonTotals totals={totals} toReview={toReview} search={search} show={setSearch} />
      <output>{JSON.stringify(search)}</output>
    </>
  );
}

const shown = () => JSON.parse(screen.getByRole("status").textContent!) as LedgerSearch;
const names = (group: string) => within(screen.getByRole("group", { name: group })).getAllByRole("button").map((b) => b.textContent);

describe("BoonTotals (#977)", () => {
  it("counts the views, To review for one who reviews, and the open boons by kind, every kind", () => {
    render(<Strip toReview={4} />);
    expect(names("The whole ledger")).toEqual(["Open 1,254", "Departed 30", "Settled 2,100", "To review 4", "Trivial 386", "Minor 700", "Major 168", "Blood 0", "Life 0"]);
    cleanup();
    render(<Strip />);
    expect(screen.queryByRole("button", { name: /To review/ })).toBeNull();
  });

  it("shows a view or a kind, clearing the search and filters but keeping the order", () => {
    render(<Strip start="view=all&q=elysium&kind=major,life&flagged=1&sort=kind" toReview={4} />);
    fireEvent.click(screen.getByRole("button", { name: "Settled 2,100" }));
    expect(shown()).toMatchObject({ view: "settled", q: "", kinds: [], flagged: false, sort: "kind" });
    expect(screen.getByRole("button", { name: "Settled 2,100" }).getAttribute("aria-current")).toBe("true");
    fireEvent.click(within(screen.getByRole("group", { name: "Open boons by kind" })).getByRole("button", { name: "Minor 700" }));
    expect(shown()).toMatchObject({ view: "open", kinds: ["minor"] });
    expect(screen.getByRole("button", { name: "Minor 700" }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("button", { name: "Open 1,254" }).getAttribute("aria-current")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "To review 4" }));
    expect(shown().view).toBe("review");
  });
});
