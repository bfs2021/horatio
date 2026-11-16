import { describe, expect, it } from "vitest";
import type { BoonOut } from "../../api/types";
import { groupBoons } from "./boonGroups";

const WEIGHTS = { trivial: 0.5, minor: 1, major: 3, blood: 5, life: 10 };
const party = (name: string, character_id: string | null = null): BoonOut["debtor"] => ({ character_id, name, kind: character_id ? "pc" : null, standing: null, boonbreaker: false });
let made = 0;
const boon = (debtor: BoonOut["debtor"], creditor: BoonOut["creditor"], kind: BoonOut["kind"], made_on = "2026-10-03") =>
  ({ id: `b${++made}`, debtor, creditor, kind, made_on, reason: "", conditions: "", state: "registered", departed: false, flagged: false }) as BoonOut;

const agnes = party("Agnes Thorne", "c1");
const bram = party("bram Okafor", "c2");
const grove = party("Grove");

describe("the ledger's rows in groups (#981)", () => {
  const boons = [
    boon(bram, agnes, "minor", "2026-10-03"),
    boon(agnes, bram, "major", "2026-10-01"),
    boon(grove, agnes, "trivial", "2026-10-03"),
    boon(agnes, grove, "trivial", "2026-09-20"),
    boon(party("GROVE"), bram, "life", "2026-09-20"),
  ];

  it("groups by a side, A to Z whatever the case, each with its count and weight, in the list's order", () => {
    const groups = groupBoons(boons, "debtor", WEIGHTS, "date", "desc");
    expect(groups.map((g) => g.party?.name)).toEqual(["Agnes Thorne", "bram Okafor", "Grove"]);
    expect(groups.map((g) => g.boons.map((b) => b.id))).toEqual([
      [boons[1]!.id, boons[3]!.id],
      [boons[0]!.id],
      // A name only is one group in any case, as the ledger matches it.
      [boons[2]!.id, boons[4]!.id],
    ]);
    expect(groups.map((g) => g.weight)).toEqual([3.5, 1, 10.5]);
  });

  it("goes Z to A when the list is sorted by that side the other way", () => {
    expect(groupBoons(boons, "creditor", WEIGHTS, "creditor", "desc").map((g) => g.party?.name)).toEqual(["Grove", "bram Okafor", "Agnes Thorne"]);
    expect(groupBoons(boons, "creditor", WEIGHTS, "debtor", "desc").map((g) => g.party?.name)).toEqual(["Agnes Thorne", "bram Okafor", "Grove"]);
  });

  it("groups a character by who they are, not by their name", () => {
    const renamed = [boon(agnes, bram, "minor"), boon({ ...agnes, name: "Agnes Thorne-Vey" }, bram, "minor"), boon(party("Agnes Thorne"), bram, "minor")];
    expect(groupBoons(renamed, "debtor", WEIGHTS, "date", "desc").map((g) => g.boons.length)).toEqual([2, 1]);
  });

  it("groups by night, newest first unless the list is oldest first", () => {
    expect(groupBoons(boons, "night", WEIGHTS, "date", "desc").map((g) => [g.night, g.boons.length])).toEqual([
      ["2026-10-03", 2],
      ["2026-10-01", 1],
      ["2026-09-20", 2],
    ]);
    expect(groupBoons(boons, "night", WEIGHTS, "date", "asc").map((g) => g.night)).toEqual(["2026-09-20", "2026-10-01", "2026-10-03"]);
    expect(groupBoons(boons, "night", WEIGHTS, "kind", "asc").map((g) => g.night)).toEqual(["2026-10-03", "2026-10-01", "2026-09-20"]);
  });
});
