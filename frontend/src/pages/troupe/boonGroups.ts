/**
 * The boon ledger's rows in groups (#981), kept apart from the screen so it can be
 * tested: by either side, or by the night each boon was made.
 */
import type { BoonOut } from "../../api/types";
import type { BoonSide, Direction, LedgerSort } from "./boonSearch";

export type BoonGroup = {
  key: string;
  /** Who it is, grouped by a side; null grouped by night. */
  party: BoonOut["debtor"] | null;
  /** The night, "2026-10-03", grouped by night; null grouped by a side. */
  night: string | null;
  boons: BoonOut[];
  /** Its boons weighed by the troupe's weights, as the standings weigh them. */
  weight: number;
};

/** How many groups start open; the rest start closed. */
export const OPEN_GROUPS = 5;

/**
 * The boons in groups, by a side or by night, each keeping the list's order. A
 * character is one group whatever their name; a name only, its whole name in any
 * case, as the ledger matches one (#980). The sides go A to Z, or Z to A when the
 * list is sorted by that side the other way; the nights newest first, or oldest
 * first when the list is.
 */
export function groupBoons(boons: BoonOut[], by: BoonSide | "night", weights: Record<string, number>, sort: LedgerSort, direction: Direction): BoonGroup[] {
  const groups = new Map<string, BoonGroup>();
  for (const b of boons) {
    const party = by === "night" ? null : b[by];
    const key = party ? (party.character_id ? `c:${party.character_id}` : `name:${party.name.toLowerCase()}`) : b.made_on;
    let group = groups.get(key);
    if (!group) groups.set(key, (group = { key, party, night: party ? null : b.made_on, boons: [], weight: 0 }));
    group.boons.push(b);
    group.weight += weights[b.kind] ?? 0;
  }
  const list = [...groups.values()];
  if (by === "night") {
    list.sort((a, b) => b.night!.localeCompare(a.night!));
    if (sort === "date" && direction === "asc") list.reverse();
  } else {
    list.sort((a, b) => a.party!.name.localeCompare(b.party!.name, "en", { sensitivity: "base" }) || a.key.localeCompare(b.key));
    if (sort === by && direction === "desc") list.reverse();
  }
  return list;
}
