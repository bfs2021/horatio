/**
 * The boon ledger's toolbar (#976), kept apart from the screen so it can be tested:
 * what it asks, as it travels in the URL (so a reload or a link keeps it), and as the
 * API takes it. `?character=<id>` is the key other pages link to the ledger with.
 */
import type { BoonOut } from "../../api/types";
import { KINDS, VIEWS, type BoonKind, type BoonView } from "../../boons";

export type LedgerSort = "date" | "debtor" | "creditor" | "kind";
export type Direction = "asc" | "desc";

export type LedgerSearch = {
  /** Any part of either side's name, the reason or the conditions. */
  q: string;
  /** One of the ledger's views. The review queue (#687) has a tab of its own (#982). */
  view: BoonView;
  /** None for every kind. */
  kinds: BoonKind[];
  /** A character on either side, by id. */
  character: string;
  /** A name only on either side, the whole name. */
  name: string;
  /** Made on or after this night, and on or before that: "2026-10-01". */
  from: string;
  to: string;
  /** With a flag still raised for review. */
  flagged: boolean;
  /** Registered at this game, by id. */
  game: string;
  sort: LedgerSort;
  direction: Direction;
};

const SORTS: LedgerSort[] = ["date", "debtor", "creditor", "kind"];

/** The way a sort goes first: newest first for the date, A to Z or trivial to life for the rest. */
export function firstWay(sort: LedgerSort): Direction {
  return sort === "date" ? "desc" : "asc";
}

// Every key the toolbar keeps in the URL, and the page (#978), which a change starts again.
const KEYS = ["q", "view", "kind", "character", "name", "from", "to", "flagged", "game", "sort", "dir", "page"];

export function readLedger(params: URLSearchParams): LedgerSearch {
  const view = params.get("view");
  const kinds = (params.get("kind") ?? "").split(",");
  const sort = params.get("sort") as LedgerSort;
  const sorted = SORTS.includes(sort) ? sort : "date";
  const dir = params.get("dir");
  return {
    q: params.get("q") ?? "",
    view: VIEWS.some((v) => v.value === view) ? (view as BoonView) : "open",
    // In the order the kinds go, each once.
    kinds: KINDS.map((k) => k.value).filter((k) => kinds.includes(k)),
    character: params.get("character") ?? "",
    name: params.get("name") ?? "",
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
    flagged: params.get("flagged") === "1",
    game: params.get("game") ?? "",
    sort: sorted,
    direction: dir === "asc" || dir === "desc" ? dir : firstWay(sorted),
  };
}

/**
 * The URL's parameters with the search in place of the toolbar's own, leaving out what
 * is as it starts. Anything else in them stays; the page goes, so a change starts on
 * the first.
 */
export function writeLedger(now: URLSearchParams, s: LedgerSearch): URLSearchParams {
  const params = new URLSearchParams(now);
  for (const key of KEYS) params.delete(key);
  const put = (key: string, value: string) => value && params.set(key, value);
  put("q", s.q);
  if (s.view !== "open") put("view", s.view);
  put("kind", s.kinds.join(","));
  put("character", s.character);
  if (!s.character) put("name", s.name);
  put("from", s.from);
  put("to", s.to);
  if (s.flagged) put("flagged", "1");
  put("game", s.game);
  if (s.sort !== "date") put("sort", s.sort);
  if (s.direction !== firstWay(s.sort)) put("dir", s.direction);
  return params;
}

/** The search with nothing narrowing it: its view and order stay. */
export function everyBoon(s: LedgerSearch): LedgerSearch {
  return { ...s, q: "", kinds: [], character: "", name: "", from: "", to: "", flagged: false, game: "" };
}

/** How many of the filters behind "More filters" are set. */
export function moreSet(s: LedgerSearch): number {
  return [s.character || s.name.trim(), s.from, s.to, s.flagged, s.game].filter(Boolean).length;
}

/** Whether anything narrows the ledger: the search, the kinds or the filters. */
export function narrowed(s: LedgerSearch): boolean {
  return Boolean(s.q.trim() || s.kinds.length || moreSet(s));
}

/** The view a boon is in: open, or departed, while it stands; otherwise its state. */
export function viewOf(b: Pick<BoonOut, "state" | "departed">): BoonView {
  return b.state === "registered" ? (b.departed ? "departed" : "open") : b.state;
}

/**
 * Whether the ledger, as searched, shows a boon just registered (#983), as the API
 * would narrow it (horatio.boon_ledger.narrowing). `game` is the game it was
 * registered at, if any.
 */
export function shows(s: LedgerSearch, b: BoonOut, game: string | null): boolean {
  const sides = [b.debtor, b.creditor];
  const q = s.q.trim().toLowerCase();
  const name = s.name.trim().toLowerCase();
  return (
    (s.view === "all" || viewOf(b) === s.view) &&
    (!q || [...sides.map((p) => p.name), b.reason, b.conditions].some((text) => text.toLowerCase().includes(q))) &&
    (!s.kinds.length || s.kinds.includes(b.kind)) &&
    (!s.character || sides.some((p) => p.character_id === s.character)) &&
    (Boolean(s.character) || !name || sides.some((p) => !p.character_id && p.name.toLowerCase() === name)) &&
    (!s.from || b.made_on >= s.from) &&
    (!s.to || b.made_on <= s.to) &&
    (!s.flagged || b.flagged) &&
    (!s.game || s.game === game)
  );
}

/** The search that shows boons just registered: nothing narrowing it, in a view that holds them all. */
export function showing(s: LedgerSearch, made: Pick<BoonOut, "state" | "departed">[]): LedgerSearch {
  const views = [...new Set(made.map(viewOf))];
  const view = views.length !== 1 ? "all" : s.view === "all" ? s.view : views[0]!;
  return { ...everyBoon(s), view };
}

/** The ledger's query for the API, without its page. */
export function ledgerQuery(s: LedgerSearch) {
  return {
    view: s.view,
    ...(s.q.trim() ? { q: s.q.trim() } : {}),
    ...(s.kinds.length ? { kind: s.kinds } : {}),
    ...(s.character ? { character_id: s.character } : {}),
    ...(!s.character && s.name.trim() ? { name: s.name.trim() } : {}),
    ...(s.from ? { made_from: s.from } : {}),
    ...(s.to ? { made_to: s.to } : {}),
    ...(s.flagged ? { flagged: true } : {}),
    ...(s.game ? { game_id: s.game } : {}),
    sort: s.sort,
    direction: s.direction,
  };
}

/** A click on a column's heading: sorted by it already, the other way; otherwise by it, the way it goes first. */
export function sortBy(s: LedgerSearch, by: LedgerSort): Pick<LedgerSearch, "sort" | "direction"> {
  if (s.sort === by) return { sort: by, direction: s.direction === "asc" ? "desc" : "asc" };
  return { sort: by, direction: firstWay(by) };
}
