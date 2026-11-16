import { describe, expect, it } from "vitest";
import { keeperNote, type LedgerKeeper } from "./boonKeeper";

const NONE = { add: false, edit: false, settle: false, review: false, audit: false, export: false };
const harpy: LedgerKeeper = { access: "full", role: "harpy", ...NONE, add: true, edit: true, settle: true, review: true, audit: true, word: "Lesser Harpy" };
const talon = (can: Partial<LedgerKeeper>): LedgerKeeper => ({ access: "full", role: "talon", ...NONE, word: "Talon", ...can });

describe("keeperNote", () => {
  it("says what the Harpy may do, and that it is logged as their character", () => {
    expect(keeperNote(harpy)).toBe(
      "As the troupe's Harpy you may register boons, correct them, settle and move them, review what players report and perform audits. What you do is logged as your character.",
    );
    expect(keeperNote({ ...harpy, export: true })).toMatch(/perform audits and export the ledger\. /);
  });

  it("says only what a Lesser Harpy was let do, by the troupe's word for them", () => {
    expect(keeperNote(talon({ edit: true }))).toBe("As a Talon you may correct boons. What you do is logged as your character.");
    expect(keeperNote(talon({ settle: true, review: true }))).toBe(
      "As a Talon you may settle and move boons and review what players report. What you do is logged as your character.",
    );
    expect(keeperNote(talon({ add: true, export: true }))).toBe("As a Talon you may register boons and export the ledger. What you do is logged as your character.");
    expect(keeperNote(talon({}))).toBe("As a Talon you may read the ledger; the Harpy hasn't let you change it.");
  });
});
