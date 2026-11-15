import { describe, expect, it } from "vitest";
import { datesFor } from "../../dates";
import { givenText } from "./BoonTalons";

const dates = datesFor({ time_zone: "America/New_York", date_format: "day_month", clock: "12" });

describe("a talon's row", () => {
  it("says who gave access and on what day, in the reader's zone (#998)", () => {
    // 1:30 am UTC on the 21st is still the 20th in New York.
    expect(givenText({ given_by: "Morwen Vale", given_at: "2026-10-21T01:30:00Z" }, dates)).toBe("Given by Morwen Vale, 20 Oct 2026");
    expect(givenText({ given_by: "", given_at: "2026-11-15T14:02:11.123456+00:00" }, dates)).toBe("Given, 15 Nov 2026");
  });
});
