import { createContext, useContext } from "react";
import { ANY_TEXT_HINT, LONGEST_NAME, LONGEST_TEXT } from "../../boons";

/**
 * Who keeps the ledger, and how far they reach: its running staff (null), or a Harpy
 * (#688) or a Lesser Harpy (#689), working as their character from the Play View. A
 * Harpy has the review queue only or the full ledger; a Lesser Harpy sees the ledger
 * and does what the Harpy let them. Neither sees or writes a boon's staff note.
 */
export type LedgerKeeper = {
  access: "submissions" | "full";
  role: "harpy" | "talon";
  add: boolean;
  // Correct boons: edit what one says, and link a name to a character (#984).
  edit: boolean;
  // Settle and move boons: trade, pass on, settle, void and reopen them, and answer a
  // status loss or Gallant (#984).
  settle: boolean;
  review: boolean;
  // Audit a character's boons (#690).
  audit: boolean;
  // Export the ledger as they see it, where the troupe lets the Harpy (#987).
  export?: boolean;
  // One of the troupe's Lesser Harpies, as it calls them: "Lesser Harpy" or "Talon".
  word: string;
};
export const HarpyMode = createContext<LedgerKeeper | null>(null);

/**
 * A side written as text in the boon forms (#990): staff write up to LONGEST_TEXT, a
 * Harpy or a talon LONGEST_NAME, as the API allows them.
 */
export function useAnyText() {
  const harpy = useContext(HarpyMode);
  return { longest: harpy ? LONGEST_NAME : LONGEST_TEXT, hint: ANY_TEXT_HINT };
}

/**
 * The line at the top of the Harpy's or a Lesser Harpy's ledger, behind its ⓘ (#985):
 * what they may do, and that it is logged as their character. "As a Lesser Harpy you
 * may correct boons and settle and move them. What you do is logged as your character."
 */
export function keeperNote(keeper: LedgerKeeper): string {
  const who = keeper.role === "harpy" ? "As the troupe's Harpy" : `As a ${keeper.word}`;
  const deeds = [keeper.add && "register", keeper.edit && "correct", keeper.settle && "settle and move"]
    .filter((d): d is string => Boolean(d))
    .map((d, i) => `${d} ${i === 0 ? "boons" : "them"}`);
  if (keeper.review) deeds.push("approve what players report");
  if (keeper.audit) deeds.push("perform audits");
  if (keeper.export) deeds.push("export the ledger");
  if (deeds.length === 0) return `${who} you may read the ledger; the Harpy hasn't let you change it.`;
  const may = deeds.length === 1 ? deeds[0] : `${deeds.slice(0, -1).join(", ")} and ${deeds[deeds.length - 1]}`;
  return `${who} you may ${may}. What you do is logged as your character.`;
}
