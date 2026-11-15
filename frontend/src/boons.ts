import type { AppealOut, BoonEventOut, BoonOut, BoonKindCount, BoonbreakerPreviewOut } from "./api/types";

/** Where the book has boons: what they are, their kinds, and boon breakers. */
export const BOON_PAGE = "MET: VTM pp. 395-397";

export type BoonKind = BoonOut["kind"];
export type SettledHow = NonNullable<BoonOut["settled_how"]>;
export type BoonView = "open" | "departed" | "settled" | "void" | "pending" | "all";
export type Party = BoonOut["debtor"];

/** The five kinds, lightest first, each with what it is for (pp. 396-397). */
export const KINDS: { value: BoonKind; label: string; meaning: string }[] = [
  {
    value: "trivial",
    label: "Trivial",
    meaning: "A small favour, an introduction or a faux pas forgiven: repaid in a night.",
  },
  {
    value: "minor",
    label: "Minor",
    meaning: "Real time or effort at little risk: repaid within two games or a month.",
  },
  {
    value: "major",
    label: "Major",
    meaning: "A large debt of time, resources or standing: repaid within six games or three months.",
  },
  {
    value: "blood",
    label: "Blood",
    meaning: "Repaid only by shedding blood, or risking all, for the creditor.",
  },
  {
    value: "life",
    label: "Life",
    meaning: "For saving the debtor's life: rare, and owed until a life is saved in return.",
  },
];

export const SETTLED: { value: SettledHow; label: string; meaning: string }[] = [
  {
    value: "called_in",
    label: "Called in",
    meaning: "The creditor called it in and the debtor repaid it.",
  },
  {
    value: "forgiven",
    label: "Forgiven",
    meaning: "The creditor forgave it.",
  },
  {
    value: "ignored",
    label: "Formally ignored",
    meaning: "The debtor formally ignored it, which costs them status for a major, blood or life boon (p. 395).",
  },
];

/** The ledger's views, as its tabs. Pending boons wait for review (#687), so that tab shows only when there are some. */
export const VIEWS: { value: BoonView; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "departed", label: "Departed" },
  { value: "settled", label: "Settled" },
  { value: "void", label: "Void" },
  { value: "pending", label: "Pending" },
  { value: "all", label: "All" },
];

const STANDINGS: Record<NonNullable<Party["standing"]>, string> = {
  active: "Active",
  final_death: "Final Death",
  off_field: "Off-field",
  inactive: "Inactive",
  retired: "Retired",
};

export function kindName(kind: BoonKind): string {
  return KINDS.find((k) => k.value === kind)?.label ?? kind;
}

/**
 * The longest name-only side of a boon a Harpy, a talon or a player writes. The troupe's
 * running staff write up to LONGEST_TEXT there (#990): a passage of story where a name
 * would be, for a ledger used as a prop, or "The Moon".
 */
export const LONGEST_NAME = 200;
export const LONGEST_TEXT = 2000;

/** The hint for a side of a boon written as text, not picked (#990). */
export const ANY_TEXT_HINT = "A name, or anything else the ledger should say: an NPC with no sheet, a mortal, the Moon. Its other side's player sees this as written.";

/**
 * A name cut to `most` characters, at a word where it can be, with "…": a side of a boon
 * can be a passage of story (#990), and where only a line fits (a label, a chart, a
 * sentence) the whole of it would swamp the rest. Shorter names are as they are.
 */
export function shortName(name: string, most = 60): string {
  if (name.length <= most) return name;
  const flat = name.replace(/\s+/g, " ").trim();
  if (flat.length <= most) return flat;
  const cut = flat.slice(0, most - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > most / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** A party's name, with how it left play when it has: "Mercer (Final Death)". A name only is just the name. */
export function partyName(party: Party): string {
  if (!party.standing || party.standing === "active") return party.name;
  return `${party.name} (${STANDINGS[party.standing]})`;
}

/** "Agnes owes Bram", a long side cut short. */
export function owes(boon: Pick<BoonOut, "debtor" | "creditor">): string {
  return `${shortName(boon.debtor.name)} owes ${shortName(boon.creditor.name)}`;
}

/** Where a boon stands now, for its row: "Settled: called in", "Void", or "" while it stands. */
export function stateText(boon: Pick<BoonOut, "state" | "settled_how" | "departed">): string {
  if (boon.state === "settled") return `Settled: ${(SETTLED.find((s) => s.value === boon.settled_how)?.label ?? "").toLowerCase()}`;
  if (boon.state === "void") return "Void";
  if (boon.state === "pending") return "Pending";
  return boon.departed ? "Involves someone departed" : "";
}

const EVENTS: Record<BoonEventOut["kind"], string> = {
  registered: "Registered",
  edited: "Edited",
  traded: "Traded",
  passed_on: "Passed on",
  settled: "Settled",
  voided: "Made void",
  reopened: "Reopened",
  submitted: "Reported for review",
  accepted: "Accepted",
  rejected: "Not accepted",
  flagged: "Flagged for review",
  flag_cleared: "Flag cleared",
  linked: "Name linked",
  gallant_given: "Gallant given",
  gallant_declined: "Gallant not given",
};

export function eventName(kind: BoonEventOut["kind"]): string {
  return EVENTS[kind];
}

const FIELDS: Record<string, string> = {
  debtor: "Debtor",
  creditor: "Creditor",
  kind: "Kind",
  made_on: "Date",
  reason: "Reason",
  conditions: "Conditions",
  notify_on_trade: "Tell the debtor if traded",
  staff_note: "Staff note",
  state: "State",
  flags: "Flags",
  gallant: "Gallant",
};

/** Why Gallant is offered for a repaid boon's debtor (#693; MET: VTM pp. 402, 405). */
const GALLANT_REASONS: Record<"nobility" | "great", string> = {
  nobility: "the creditor has Social Nobility (p. 405)",
  great: "a great boon repaid to someone of significance (p. 402)",
};

/** "Give Bram Gallant for repaying it? The creditor has Social Nobility (p. 405)." */
export function gallantText(offer: { debtor: string; reasons: ("nobility" | "great")[] }): string {
  const why = offer.reasons.map((r) => GALLANT_REASONS[r]).join(", and ");
  return `Give ${offer.debtor} Gallant for repaying it? ${why.charAt(0).toUpperCase()}${why.slice(1)}.`;
}

/** A field a change in a boon's log is to: "Kind", "Date". */
export function fieldName(field: string): string {
  return FIELDS[field] ?? field;
}

/** One change in a boon's log: "Kind: Minor → Major". Empty text reads "(none)". */
export function changeText(change: { field: string; before: string; after: string }): string {
  return `${fieldName(change.field)}: ${change.before || "(none)"} → ${change.after || "(none)"}`;
}

/** A summary of standing boons by kind, lightest first: "2 minor, 1 major", or "none". */
export function countsText(counts: BoonKindCount[]): string {
  if (counts.length === 0) return "none";
  return counts.map((c) => `${c.count} ${kindName(c.kind).toLowerCase()}`).join(", ");
}

/** The actions a boon allows in its state: a standing one is traded, passed on, settled or voided; a closed one reopened. */
export function actionsFor(state: BoonOut["state"]): ("edit" | "trade" | "pass" | "settle" | "void" | "reopen")[] {
  if (state === "registered") return ["edit", "trade", "pass", "settle", "void"];
  if (state === "pending") return ["edit", "void"];
  if (state === "settled") return ["edit", "void", "reopen"];
  return ["edit", "reopen"];
}

/** A row of the quick entry, as the form holds it. */
export type EntryRow = {
  debtor: { who: string; name: string };
  creditor: { who: string; name: string };
  kind: BoonKind;
  made_on: string;
  reason: string;
  conditions: string;
  notify_on_trade: boolean;
  count: number;
};

export function emptyRow(madeOn: string): EntryRow {
  return {
    debtor: { who: "", name: "" },
    creditor: { who: "", name: "" },
    kind: "minor",
    made_on: madeOn,
    reason: "",
    conditions: "",
    notify_on_trade: false,
    count: 1,
  };
}

/** Whether a row names someone: an untouched row is left out of what is registered. */
export function rowStarted(row: EntryRow): boolean {
  return Boolean(row.debtor.who || row.creditor.who || row.reason.trim() || row.conditions.trim());
}

/** How many boons the rows make, counting each row's count. */
export function rowsTotal(rows: EntryRow[]): number {
  return rows.filter(rowStarted).reduce((n, r) => n + Math.max(1, r.count || 1), 0);
}

export type BoonFlag = NonNullable<BoonOut["flags"]>[number];

/** A flag raised for review (#687), as its badge names it. */
export const FLAG_NAMES: Record<BoonFlag["kind"], string> = {
  unmatched: "Name not linked",
  duplicate: "Likely duplicate",
  hand: "Flagged",
};

/** What a flag says, after its name: "creditor, The Moon: No character in the troupe has this name." */
export function flagBody(flag: BoonFlag, boon: Pick<BoonOut, "debtor" | "creditor">): string {
  if (flag.kind === "unmatched" && flag.side) {
    const name = flag.side === "debtor" ? boon.debtor.name : boon.creditor.name;
    return `${flag.side}, ${shortName(name)}: ${flag.detail}`;
  }
  if (flag.kind === "duplicate") return flag.detail;
  return `${flag.raised_by ? `by ${flag.raised_by}: ` : ""}${flag.note}`;
}

/** What a flag is about, in a line: "Name not linked (creditor, The Moon): No character in the troupe has this name." */
export function flagText(flag: BoonFlag, boon: Pick<BoonOut, "debtor" | "creditor">): string {
  if (flag.kind === "unmatched") return `${FLAG_NAMES.unmatched} (${flagBody(flag, boon).replace(": ", "): ")}`;
  return `${FLAG_NAMES[flag.kind]}${flag.kind === "hand" && flag.raised_by ? " " : ": "}${flagBody(flag, boon)}`;
}

// --- Boonbreakers (#717) --------------------------------------------------------------------

/** Where the book has Boonbreakers, and appeals for mercy. */
export const BREAKER_PAGE = "MET: VTM pp. 397-398";

/** What declaring someone a Boonbreaker would make void, said before it's done. */
export function voidsText(preview: Pick<BoonbreakerPreviewOut, "owed_by" | "owed_to">): string {
  const total = preview.owed_by + preview.owed_to;
  if (total === 0) return "They have no open boons to make void.";
  return `This makes ${total} ${total === 1 ? "boon" : "boons"} void: ${preview.owed_by} owed by them, ${preview.owed_to} owed to them.`;
}

const APPEAL_TO: Record<AppealOut["to"], string> = { harpy: "the Harpy", court: "a court of Harpies" };

/** One appeal for mercy: "To a court of Harpies: mercy refused, 4 against". */
export function appealText(appeal: Pick<AppealOut, "to" | "outcome" | "against">): string {
  const outcome = appeal.outcome === "granted" ? "mercy granted" : "mercy refused";
  const votes = appeal.against !== null && appeal.against !== undefined ? `, ${appeal.against} against` : "";
  return `To ${APPEAL_TO[appeal.to]}: ${outcome}${votes}`;
}

/** A great boon its debtor formally ignored, and the status they lose for it (p. 395). */
export const LOSS_TEXT: Record<NonNullable<BoonOut["status_loss"]>, string> = {
  due: "Ignoring it costs its debtor status (p. 395): take it with the status tools, then say so here.",
  taken: "Its debtor lost status for ignoring it (p. 395).",
  waived: "No status was taken for ignoring it.",
};
