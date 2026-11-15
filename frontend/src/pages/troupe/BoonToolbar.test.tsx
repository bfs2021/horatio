import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CharacterChoice } from "../../api/types";
import { readLedger, type LedgerSearch } from "./boonSearch";
import { BoonToolbar } from "./BoonToolbar";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const characters = [{ id: "c1", name: "Agnes Thorne", kind: "pc" }] as CharacterChoice[];

function Toolbar({ start = "", toReview = null }: { start?: string; toReview?: number | null }) {
  const [search, setSearch] = useState<LedgerSearch>(readLedger(new URLSearchParams(start)));
  return (
    <QueryClientProvider client={new QueryClient()}>
      <BoonToolbar
        search={search}
        update={(change) => setSearch((now) => ({ ...now, ...change }))}
        counts={{ open: 1234, departed: 1, settled: 2, void: 0, pending: 0, all: 1237 }}
        toReview={toReview}
        characters={characters}
        games={[]}
      />
      <output>{JSON.stringify(search)}</output>
    </QueryClientProvider>
  );
}

const shown = () => JSON.parse(screen.getByRole("status").textContent!) as LedgerSearch;

describe("BoonToolbar (#976)", () => {
  it("offers the views with their counts, Pending only when there are any, and To review while it holds boons", () => {
    render(<Toolbar toReview={3} />);
    const views = screen.getByRole("radiogroup", { name: "Ledger views" });
    const names = [...views.querySelectorAll("[role=radio]")].map((r) => r.textContent);
    expect(names).toEqual(["Open (1,234)", "Departed (1)", "Settled (2)", "Void (0)", "All (1,237)", "To review (3)"]);
    fireEvent.click(screen.getByRole("radio", { name: /^Settled/ }));
    expect(shown().view).toBe("settled");
    // The phone's select has the same views.
    expect([...screen.getByRole("combobox", { name: "Ledger views" }).querySelectorAll("option")].map((o) => o.value)).toEqual([
      "open",
      "departed",
      "settled",
      "void",
      "all",
      "review",
    ]);
  });

  it("picks several kinds at once, and a second press takes one off", () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByRole("button", { name: "Major" }));
    fireEvent.click(screen.getByRole("button", { name: "Trivial" }));
    expect(shown().kinds).toEqual(["major", "trivial"]);
    expect(screen.getByRole("button", { name: "Major" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Major" }));
    expect(shown().kinds).toEqual(["trivial"]);
  });

  it("searches a moment after typing stops", () => {
    vi.useFakeTimers();
    render(<Toolbar />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search the ledger" }), { target: { value: "elysium" } });
    expect(shown().q).toBe("");
    act(() => vi.advanceTimersByTime(300));
    expect(shown().q).toBe("elysium");
  });

  it("says how many of the more filters are set, opens on them, and Show every boon clears all but the view", () => {
    render(<Toolbar start="view=all&character=c1&flagged=1&q=thorns&kind=life" />);
    const more = screen.getByRole("button", { name: "More filters, 2 set" });
    expect(more.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("checkbox", { name: "Flagged only" })).toHaveProperty("checked", true);
    expect((screen.getByRole("combobox", { name: "Character or name" }) as HTMLInputElement).value).toBe("Agnes Thorne");
    fireEvent.click(screen.getByRole("button", { name: "Show every boon" }));
    expect(shown()).toMatchObject({ view: "all", q: "", kinds: [], character: "", flagged: false });
    expect(screen.queryByRole("button", { name: "Show every boon" })).toBeNull();
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("button", { name: "More filters" })).toBeTruthy();
  });

  it("leaves At a game out where the troupe has no games", () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByRole("button", { name: "More filters" }));
    expect(screen.getByRole("group", { name: "More filters" })).toBeTruthy();
    expect(screen.queryByLabelText("At a game")).toBeNull();
  });
});
