import type { PlayBoonIn, PlayBoonOut, PlayBoonsOut, PlayReportOut } from "../../api/types";
import { kindName, SETTLED, shortName } from "../../boons";

/** How a creditor's player may settle a boon in the Play View (#686): formally ignoring one is its debtor's doing (p. 397). */
export type PlayerSettles = "called_in" | "forgiven";

export const playerSettles = SETTLED.filter((s): s is (typeof SETTLED)[number] & { value: PlayerSettles } => s.value === "called_in" || s.value === "forgiven");

/** "a minor boon", "3 major boons": every kind starts with a consonant. */
export function aBoon(kind: PlayBoonIn["kind"], count: number): string {
  const name = kindName(kind).toLowerCase();
  return count === 1 ? `a ${name} boon` : `${count} ${name} boons`;
}

/** A side's boons: those standing, then those settled, each as the server sends them (newest first). */
export function standingFirst(boons: readonly PlayBoonOut[]): { standing: PlayBoonOut[]; settled: PlayBoonOut[] } {
  return { standing: boons.filter((b) => b.state === "registered"), settled: boons.filter((b) => b.state === "settled") };
}

/** "Settled: called in, Sat 3 Oct 2026. For influence." */
export function settledText(boon: Pick<PlayBoonOut, "settled_how" | "settled_at" | "settled_note">, day: (at: string) => string): string {
  const how = (SETTLED.find((s) => s.value === boon.settled_how)?.label ?? "").toLowerCase();
  const when = boon.settled_at ? `, ${day(boon.settled_at)}` : "";
  const note = boon.settled_note ? ` ${boon.settled_note.replace(/[.\s]*$/, "")}.` : "";
  return `Settled${how ? `: ${how}` : ""}${when}.${note}`;
}

/**
 * The toast after a report: "Reported to Elysium's ledger: Agnes owes Bram a minor
 * boon." Where it waits for approval (#687, #993): "Waiting for the Harpy's approval:
 * …", or, where the troupe gives its Harpy no access, "Waiting for staff's approval:
 * …".
 */
export function reportedText(
  name: string,
  other: string,
  direction: PlayBoonIn["direction"],
  kind: PlayBoonIn["kind"],
  count: number,
  troupe: string,
  waits = false,
  approver: Approver = "staff",
): string {
  const [debtor, creditor] = direction === "owes" ? [name, other] : [other, name];
  const where = waits ? `Waiting for ${approverName(approver)} approval` : `Reported to ${troupe}'s ledger`;
  return `${where}: ${debtor} owes ${creditor} ${aBoon(kind, count)}.`;
}

/** Who approves what players report, as a player is told (#993): never a Lesser Harpy by name. */
export type Approver = NonNullable<PlayBoonsOut["approver"]>;

/** "the Harpy's", or "staff's" where the troupe gives its Harpy no access. */
export function approverName(approver: Approver): string {
  return approver === "harpy" ? "the Harpy's" : "staff's";
}

/** Where a report stands, as its player reads it (#993). */
export function reportState(report: Pick<PlayReportOut, "state">, approver: Approver): string {
  if (report.state === "pending") return `Waiting for ${approverName(approver)} approval.`;
  if (report.state === "accepted") return "In the ledger.";
  return "Not accepted";
}

/** A report of the player's that waits for review, went in or wasn't accepted (#687, #993): "Agnes owes Bram a minor boon". */
export function reportLine(report: Pick<PlayReportOut, "direction" | "other" | "kind">, name: string): string {
  // Staff may have written a passage of story for the other side (#990): a line of it here.
  const other = shortName(report.other);
  const [debtor, creditor] = report.direction === "owes" ? [name, other] : [other, name];
  return `${debtor} owes ${creditor} ${aBoon(report.kind, 1)}`;
}
