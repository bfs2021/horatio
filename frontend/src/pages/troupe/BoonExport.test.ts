import { describe, expect, it } from "vitest";
import { exportHref } from "./BoonExport";

describe("exportHref", () => {
  it("exports the whole ledger with no view or filters", () => {
    expect(exportHref("t1", "csv", null)).toBe("/api/troupes/t1/boon-export?format=csv");
  });

  it("exports this view with its filters, kinds repeated, leaving out the empty ones and paging", () => {
    const href = exportHref("t1", "xlsx", { view: "open", name: "", kind: ["minor", "major"], made_from: "2026-10-01", limit: 100, offset: 200 });
    expect(href).toBe("/api/troupes/t1/boon-export?format=xlsx&view=open&kind=minor&kind=major&made_from=2026-10-01");
  });
});
