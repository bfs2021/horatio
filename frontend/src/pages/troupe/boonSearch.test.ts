import { describe, expect, it } from "vitest";
import { everyBoon, ledgerQuery, moreSet, narrowed, readLedger, sortBy, writeLedger } from "./boonSearch";

const read = (query: string) => readLedger(new URLSearchParams(query));

describe("the boon ledger's search in the URL (#976)", () => {
  it("starts on open boons, newest first, and writes nothing for that", () => {
    const start = read("");
    expect(start).toMatchObject({ q: "", view: "open", kinds: [], character: "", flagged: false, sort: "date", direction: "desc" });
    expect(writeLedger(new URLSearchParams(), start).toString()).toBe("");
    expect(narrowed(start)).toBe(false);
  });

  it("keeps everything it asks across a reload", () => {
    const search = read("q=elysium&view=settled&kind=major,trivial&name=The+Moon&from=2026-10-01&to=2026-10-31&flagged=1&game=g1&sort=kind&dir=desc");
    expect(search).toEqual({
      q: "elysium",
      view: "settled",
      // In the order the kinds go.
      kinds: ["trivial", "major"],
      character: "",
      name: "The Moon",
      from: "2026-10-01",
      to: "2026-10-31",
      flagged: true,
      game: "g1",
      sort: "kind",
      direction: "desc",
    });
    expect(readLedger(writeLedger(new URLSearchParams(), search))).toEqual(search);
    expect(moreSet(search)).toBe(5);
  });

  it("keeps ?character=, which other pages link with, and what isn't its own; a change starts on page 1", () => {
    const now = new URLSearchParams("character=c1&page=3&tab=x");
    const search = read(now.toString());
    expect(search.character).toBe("c1");
    expect(moreSet(search)).toBe(1);
    const next = writeLedger(now, { ...search, kinds: ["minor"] });
    expect(next.toString()).toBe("tab=x&kind=minor&character=c1");
  });

  it("ignores what it doesn't know", () => {
    expect(read("view=lost&kind=huge&sort=colour&dir=up")).toMatchObject({ view: "open", kinds: [], sort: "date", direction: "desc" });
    // The review queue is a tab of its own now (#982): the ledger reads an old link as the open view.
    expect(read("view=review").view).toBe("open");
  });

  it("writes a sort's direction only when it isn't the way that sort goes first", () => {
    expect(writeLedger(new URLSearchParams(), { ...read(""), sort: "debtor", direction: "asc" }).toString()).toBe("sort=debtor");
    expect(writeLedger(new URLSearchParams(), { ...read(""), direction: "asc" }).toString()).toBe("dir=asc");
  });

  it("shows every boon by clearing all but the view and the order", () => {
    const search = read("q=x&view=all&kind=life&character=c1&flagged=1&sort=creditor");
    expect(everyBoon(search)).toEqual({ ...read("view=all&sort=creditor") });
  });
});

describe("ledgerQuery", () => {
  it("asks the API for what is set, and the order", () => {
    expect(ledgerQuery(read("q=+thorns+&kind=minor,major&character=c1&name=x&flagged=1&game=g1"))).toEqual({
      view: "open",
      q: "thorns",
      kind: ["minor", "major"],
      character_id: "c1",
      flagged: true,
      game_id: "g1",
      sort: "date",
      direction: "desc",
    });
    expect(ledgerQuery(read("name=The+Moon&from=2026-10-01&to=2026-10-02"))).toMatchObject({ name: "The Moon", made_from: "2026-10-01", made_to: "2026-10-02" });
  });
});

describe("sortBy", () => {
  it("sorts by a column the way it goes first, then the other way", () => {
    const start = read("");
    expect(sortBy(start, "kind")).toEqual({ sort: "kind", direction: "asc" });
    expect(sortBy(start, "date")).toEqual({ sort: "date", direction: "asc" });
    expect(sortBy(read("sort=debtor&dir=desc"), "debtor")).toEqual({ sort: "debtor", direction: "asc" });
    expect(sortBy(read("sort=debtor"), "date")).toEqual({ sort: "date", direction: "desc" });
  });
});
