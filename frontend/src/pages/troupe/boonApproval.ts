import type { BoonOut } from "../../api/types";
import { KINDS, type BoonKind } from "../../boons";

/** What narrows the boons waiting for approval (#993): a kind, who reported it, the night; "" for any. */
export type WaitingFilter = { kind: BoonKind | ""; reporter: string; night: string };

export const ANY: WaitingFilter = { kind: "", reporter: "", night: "" };

/** Who reported a boon, as the queue shows it: the character it was reported as, else who entered it (staff see that). */
export function reporterOf(boon: Pick<BoonOut, "reported_as" | "submitted_by">): string {
  return boon.reported_as ?? boon.submitted_by ?? "";
}

/** The boons that pass the filter, in the queue's order. */
export function narrowWaiting<T extends Pick<BoonOut, "kind" | "made_on" | "reported_as" | "submitted_by">>(boons: readonly T[], filter: WaitingFilter): T[] {
  return boons.filter(
    (b) => (!filter.kind || b.kind === filter.kind) && (!filter.reporter || reporterOf(b) === filter.reporter) && (!filter.night || b.made_on === filter.night),
  );
}

/** What the filters can choose from: the kinds (lightest first), reporters (A to Z) and nights (newest first) among the boons. */
export function waitingChoices(boons: readonly Pick<BoonOut, "kind" | "made_on" | "reported_as" | "submitted_by">[]) {
  const kinds = KINDS.map((k) => k.value).filter((k) => boons.some((b) => b.kind === k));
  const reporters = [...new Set(boons.map(reporterOf).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const nights = [...new Set(boons.map((b) => b.made_on))].sort().reverse();
  return { kinds, reporters, nights };
}

/** "Trivial and minor boons players report go straight into the ledger; the rest wait." */
export function approvalSummary(kinds: readonly BoonKind[]): string {
  if (kinds.length === 0) return "Every boon players report waits for approval.";
  if (kinds.length === KINDS.length) return "Every boon players report goes straight into the ledger.";
  const names = KINDS.filter((k) => kinds.includes(k.value)).map((k) => k.label.toLowerCase());
  const listed: string = names.length === 1 ? names[0]! : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${listed.charAt(0).toUpperCase()}${listed.slice(1)} boons players report go straight into the ledger; the rest wait.`;
}
