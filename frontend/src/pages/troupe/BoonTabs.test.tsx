import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { BoonTabs, partTo, type BoonPart } from "./BoonTabs";

afterEach(cleanup);

const EVERY: BoonPart[] = ["ledger", "review", "standings", "statistics", "boonbreakers", "audits"];
const base = "/troupes/t1/boons";

function tabsAt(at: string, { parts = EVERY, holds = false, waiting = 0, marked = 0 }: { parts?: BoonPart[]; holds?: boolean; waiting?: number; marked?: number } = {}) {
  cleanup();
  // What the tabs read, already in hand: nothing is fetched.
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  client.setQueryData(["boon-review", "t1"], { boons: Array.from({ length: waiting }, (_, i) => ({ id: `b${i}` })), characters: [] });
  client.setQueryData(["boonbreakers", "t1"], { marks: [...Array.from({ length: marked }, (_, i) => ({ id: `m${i}`, lifted_at: null })), { id: "old", lifted_at: "2026-01-01" }] });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[at]}>
        <BoonTabs troupeId="t1" base={base} parts={parts} holdsReview={holds} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const nav = screen.queryByRole("navigation", { name: "Boons" });
  return nav ? [...nav.querySelectorAll("a")].map((a) => `${a.textContent} ${a.getAttribute("href")}`) : null;
}

describe("BoonTabs (#982)", () => {
  it("gives staff every part, each at its own address, To review with how many wait and Boonbreakers with how many are marked", () => {
    expect(tabsAt(base, { waiting: 3, marked: 1 })).toEqual([
      `Ledger ${base}`,
      `To review3 ${base}/review`,
      `Standings ${base}/standings`,
      `Statistics ${base}/statistics`,
      `Boonbreakers1 ${base}/boonbreakers`,
      `Audits ${base}/audits`,
    ]);
  });

  it("leaves To review out while nothing waits and the troupe doesn't hold reports, unless it is open", () => {
    expect(tabsAt(base)).not.toContainEqual(expect.stringMatching(/^To review/));
    expect(tabsAt(base, { holds: true })).toContainEqual(`To review ${base}/review`);
    expect(tabsAt(`${base}/review`)).toContainEqual(`To review ${base}/review`);
  });

  it("opens a Harpy given only the review queue on it, and shows no tabs with nothing else", () => {
    const queue: BoonPart[] = ["review", "standings", "statistics"];
    expect(partTo(base, queue, "review")).toBe(base);
    expect(tabsAt(base, { parts: queue })).toEqual([`To review ${base}`, `Standings ${base}/standings`, `Statistics ${base}/statistics`]);
    expect(tabsAt(base, { parts: ["review"], waiting: 2 })).toBeNull();
  });
});
