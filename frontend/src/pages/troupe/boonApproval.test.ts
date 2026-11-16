import { describe, expect, it } from "vitest";
import { ANY, approvalSummary, narrowWaiting, reporterOf, waitingChoices } from "./boonApproval";

const boon = (kind: "trivial" | "minor" | "major", made_on: string, reported_as: string | null, submitted_by: string | null = null) => ({
  kind,
  made_on,
  reported_as,
  submitted_by,
});

const waiting = [boon("minor", "2026-10-03", "Agnes"), boon("major", "2026-10-10", "Bram"), boon("minor", "2026-10-10", null, "Ledger keeper")];

describe("the boons waiting for approval (#993)", () => {
  it("narrow by kind, reporter and night together", () => {
    expect(narrowWaiting(waiting, ANY)).toHaveLength(3);
    expect(narrowWaiting(waiting, { ...ANY, kind: "minor" }).map(reporterOf)).toEqual(["Agnes", "Ledger keeper"]);
    expect(narrowWaiting(waiting, { kind: "minor", reporter: "", night: "2026-10-10" }).map(reporterOf)).toEqual(["Ledger keeper"]);
    expect(narrowWaiting(waiting, { ...ANY, reporter: "Bram" }).map((b) => b.kind)).toEqual(["major"]);
  });

  it("offer only what is there: kinds lightest first, reporters A to Z, nights newest first", () => {
    expect(waitingChoices(waiting)).toEqual({
      kinds: ["minor", "major"],
      reporters: ["Agnes", "Bram", "Ledger keeper"],
      nights: ["2026-10-10", "2026-10-03"],
    });
  });
});

describe("the approval setting in words", () => {
  it("names the kinds that go straight in, lightest first", () => {
    expect(approvalSummary([])).toBe("Every boon players report waits for approval.");
    expect(approvalSummary(["trivial"])).toBe("Trivial boons players report go straight into the ledger; the rest wait.");
    expect(approvalSummary(["major", "trivial", "minor"])).toBe("Trivial, minor and major boons players report go straight into the ledger; the rest wait.");
    expect(approvalSummary(["trivial", "minor", "major", "blood", "life"])).toBe("Every boon players report goes straight into the ledger.");
  });
});
