import { describe, expect, it } from "vitest";
import { datesFor } from "../../dates";
import { givenText, what } from "./BoonTalons";

const dates = datesFor({ time_zone: "America/New_York", date_format: "day_month", clock: "12" });

describe("a talon's row", () => {
  it("says who gave access and on what day, in the reader's zone (#998)", () => {
    // 1:30 am UTC on the 21st is still the 20th in New York.
    expect(givenText({ given_by: "Morwen Vale", given_at: "2026-10-21T01:30:00Z" }, dates)).toBe("Given by Morwen Vale, 20 Oct 2026");
    expect(givenText({ given_by: "", given_at: "2026-11-15T14:02:11.123456+00:00" }, dates)).toBe("Given, 15 Nov 2026");
  });
});

describe("what a talon may do", () => {
  const can = { can_add: true, can_edit: false, can_settle: false, can_review: false, can_audit: false, can_export: true };

  it("names exporting only while the troupe lets the Harpy export (#987)", () => {
    expect(what(can, true)).toBe("sees the ledger, adds boons and exports the ledger");
    expect(what(can, false)).toBe("sees the ledger and adds boons");
  });

  it("names approving reported boons apart from settling them (#993)", () => {
    expect(what({ ...can, can_settle: true, can_review: true }, false)).toBe("sees the ledger, adds boons, settles them and approves reported boons");
    expect(what({ ...can, can_add: false, can_review: true }, false)).toBe("sees the ledger and approves reported boons");
  });
});
