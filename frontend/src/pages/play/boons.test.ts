import { describe, expect, it } from "vitest";
import type { PlayBoonOut } from "../../api/types";
import { datesFor } from "../../dates";
import { aBoon, playerSettles, reportedText, reportLine, reportState, settledText, standingFirst } from "./boons";

const boon = (over: Partial<PlayBoonOut>): PlayBoonOut => ({
  id: "b1",
  other: "Bram",
  other_id: null,
  kind: "minor",
  made_on: "2026-10-03",
  reason: "",
  conditions: "",
  notify_on_trade: false,
  state: "registered",
  settled_how: null,
  settled_at: null,
  settled_note: "",
  creditor_disgraced: false,
  can_settle: false,
  other_boonbreaker: false,
  ...over,
});

describe("the Play View's boons", () => {
  it("puts standing boons first and settled ones after, keeping their order", () => {
    const list = [boon({ id: "a", state: "settled" }), boon({ id: "b" }), boon({ id: "c", state: "settled" }), boon({ id: "d" })];
    const { standing, settled } = standingFirst(list);
    expect(standing.map((b) => b.id)).toEqual(["b", "d"]);
    expect(settled.map((b) => b.id)).toEqual(["a", "c"]);
  });

  it("says how and when a boon was settled, with its note", () => {
    const day = (at: string) => `day ${at.slice(0, 10)}`;
    expect(settledText(boon({ settled_how: "called_in", settled_at: "2026-10-16T20:00:00Z", settled_note: "For influence." }), day)).toBe(
      "Settled: called in, day 2026-10-16. For influence.",
    );
    expect(settledText(boon({ settled_how: "forgiven", settled_at: null }), day)).toBe("Settled: forgiven.");
  });

  it("writes the moment a boon was settled as a date, not NaN (#998)", () => {
    const dates = datesFor({ time_zone: "UTC", date_format: "day_month", clock: "12" });
    expect(settledText(boon({ settled_how: "called_in", settled_at: "2026-10-16T20:00:00.123456+00:00" }), dates.date)).toBe("Settled: called in, 16 Oct 2026.");
  });

  it("offers a creditor only calling in and forgiving, not formally ignoring", () => {
    expect(playerSettles.map((s) => s.value)).toEqual(["called_in", "forgiven"]);
  });

  it("words a report either way", () => {
    expect(aBoon("major", 1)).toBe("a major boon");
    expect(aBoon("trivial", 3)).toBe("3 trivial boons");
    expect(reportedText("Agnes", "Bram", "owes", "minor", 1, "Elysium")).toBe("Reported to Elysium's ledger: Agnes owes Bram a minor boon.");
    expect(reportedText("Agnes", "The Moon", "owed", "blood", 2, "Elysium")).toBe("Reported to Elysium's ledger: The Moon owes Agnes 2 blood boons.");
    expect(reportedText("Agnes", "Bram", "owes", "minor", 1, "Elysium", true)).toBe("Waiting for staff's approval: Agnes owes Bram a minor boon.");
    expect(reportedText("Agnes", "Bram", "owes", "minor", 1, "Elysium", true, "harpy")).toBe("Waiting for the Harpy's approval: Agnes owes Bram a minor boon.");
  });

  it("words a report waiting for review (#687)", () => {
    expect(reportLine({ direction: "owes", other: "Bram", kind: "minor" }, "Agnes")).toBe("Agnes owes Bram a minor boon");
    // Where it stands, naming no one but the Harpy, or staff (#993).
    expect(reportState({ state: "pending" }, "harpy")).toBe("Waiting for the Harpy's approval.");
    expect(reportState({ state: "pending" }, "staff")).toBe("Waiting for staff's approval.");
    expect(reportState({ state: "accepted" }, "harpy")).toBe("In the ledger.");
    expect(reportLine({ direction: "owed", other: "The Moon", kind: "major" }, "Agnes")).toBe("The Moon owes Agnes a major boon");
  });
});
