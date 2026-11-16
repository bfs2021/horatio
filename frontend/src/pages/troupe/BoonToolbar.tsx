import { useEffect, useId, useState, type ReactNode } from "react";
import type { BoonGameOut, CharacterChoice } from "../../api/types";
import { KINDS, VIEWS, type BoonView } from "../../boons";
import { Checkbox } from "../../components/Checkbox";
import { DateInput } from "../../components/DateInput";
import { Segmented } from "../../components/Segmented";
import { Button, Field, Input, Select } from "../../components/ui";
import { useDates } from "../../dates";
import { everyBoon, moreSet, narrowed, type Direction, type LedgerSearch, type LedgerSort } from "./boonSearch";
import { WhoPicker } from "./WhoPicker";

const count = new Intl.NumberFormat("en-GB");

/** Who the search is narrowed to, a character or a name, as one value to compare. */
function whoOf(s: LedgerSearch): string {
  return s.character ? `c:${s.character}` : s.name ? `name:${s.name}` : "";
}

// The orders a phone picks from, where the column headings are for screen readers only.
const ORDERS: { sort: LedgerSort; direction: Direction; label: string }[] = [
  { sort: "date", direction: "desc", label: "Newest first" },
  { sort: "date", direction: "asc", label: "Oldest first" },
  { sort: "debtor", direction: "asc", label: "Debtor, A to Z" },
  { sort: "debtor", direction: "desc", label: "Debtor, Z to A" },
  { sort: "creditor", direction: "asc", label: "Creditor, A to Z" },
  { sort: "creditor", direction: "desc", label: "Creditor, Z to A" },
  { sort: "kind", direction: "asc", label: "Kind, trivial to life" },
  { sort: "kind", direction: "desc", label: "Kind, life to trivial" },
];

/**
 * The boon ledger's toolbar (#976): a search over either side's name, the reason and
 * the conditions; the views with their counts (a select on a phone); the kinds, any
 * number at once; and "More filters" (a character or a name, the nights it was made
 * between, flagged only, at a game), with how many of those are set. "Show every boon"
 * clears all of it but the view and the order.
 *
 * `counts` follow the search and filters, and show only while something narrows the
 * ledger: the totals strip above has the whole ledger's (#977). The review queue has
 * a tab of its own (#982).
 * `games` are the troupe's games, for "At a game"; none leaves it out. `end` goes at
 * the end of the search's row, such as a menu of more for the ledger.
 */
export function BoonToolbar({
  search,
  update,
  counts,
  characters,
  games,
  end,
}: {
  search: LedgerSearch;
  update: (change: Partial<LedgerSearch>) => void;
  counts: Partial<Record<BoonView, number>>;
  characters: CharacterChoice[];
  games: BoonGameOut[];
  end?: ReactNode;
}) {
  const dates = useDates();
  const panelId = useId();
  const set = moreSet(search);
  // Opened by itself when a link or a reload brings filters with it.
  const [more, setMore] = useState(set > 0);
  // Bumped to empty the character box when everything is cleared.
  const [cleared, setCleared] = useState(0);
  // Typing waits a moment before it searches.
  const [words, setWords] = useState(search.q);
  // What the search box and the character box last asked for. A search set from
  // elsewhere, such as the totals strip (#977), is followed: the boxes show it.
  const [asked, setAsked] = useState({ q: search.q, who: whoOf(search) });
  if (search.q !== asked.q || whoOf(search) !== asked.who) {
    setAsked({ q: search.q, who: whoOf(search) });
    if (search.q !== asked.q) setWords(search.q);
    if (whoOf(search) !== asked.who) setCleared(cleared + 1);
  }
  const ask = (change: Partial<LedgerSearch>) => {
    const next = { ...search, ...change };
    setAsked({ q: next.q, who: whoOf(next) });
    update(change);
  };
  useEffect(() => {
    if (words === search.q) return;
    const wait = setTimeout(() => ask({ q: words }), 300);
    return () => clearTimeout(wait);
  });
  // Counted within a search only: the strip above counts the whole ledger (#977).
  const counted = narrowed(search);
  const views: { value: BoonView; label: string; count?: number }[] = VIEWS.filter((v) => v.value !== "pending" || (counts.pending ?? 0) > 0).map((v) => ({
    value: v.value,
    label: v.label,
    count: counted ? (counts[v.value] ?? 0) : undefined,
  }));
  const showKind = (kind: (typeof KINDS)[number]["value"]) => {
    const on = search.kinds.includes(kind);
    update({ kinds: on ? search.kinds.filter((k) => k !== kind) : [...search.kinds, kind] });
  };
  const clear = () => {
    setWords("");
    setCleared(cleared + 1);
    ask(everyBoon(search));
  };
  const order = ORDERS.findIndex((o) => o.sort === search.sort && o.direction === search.direction);

  return (
    <div className="flex flex-col gap-3">
      <Segmented
        label="Ledger views"
        className="self-start max-lg:hidden"
        value={search.view}
        options={views.map((v) => ({
          value: v.value,
          label:
            v.count === undefined ? (
              v.label
            ) : (
              <>
                {v.label} <span className="text-mist">({count.format(v.count)})</span>
              </>
            ),
        }))}
        onChange={(view) => update({ view })}
      />
      <Select aria-label="Ledger views" className="lg:hidden" value={search.view} onChange={(e) => update({ view: e.target.value as BoonView })}>
        {views.map((v) => (
          <option key={v.value} value={v.value}>
            {v.count === undefined ? v.label : `${v.label} (${count.format(v.count)})`}
          </option>
        ))}
      </Select>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          aria-label="Search the ledger"
          placeholder="Names, reason or conditions…"
          className="min-w-0 flex-1 basis-full sm:basis-64"
          maxLength={200}
          value={words}
          onChange={(e) => setWords(e.target.value)}
        />
        <div role="group" aria-label="Kinds" className="flex flex-wrap gap-1">
          {KINDS.map((k) => {
            const on = search.kinds.includes(k.value);
            return (
              <button
                key={k.value}
                type="button"
                aria-pressed={on}
                onClick={() => showKind(k.value)}
                className={`min-h-9 rounded-full border px-3 text-sm transition-colors pointer-coarse:min-h-10 ${on ? "border-gold/60 bg-gold/20 text-gold" : "border-ash text-mist hover:text-parchment"}`}
              >
                {k.label}
              </button>
            );
          })}
        </div>
        <Button
          variant={set > 0 ? "secondary" : "ghost"}
          aria-label={set > 0 ? `More filters, ${set} set` : undefined}
          aria-expanded={more}
          aria-controls={panelId}
          onClick={() => setMore(!more)}
        >
          More filters
          {set > 0 && (
            <span aria-hidden="true" className="inline-grid h-5 min-w-5 place-items-center rounded-full bg-gold/20 px-1.5 text-xs text-gold">
              {set}
            </span>
          )}
        </Button>
        {narrowed(search) && (
          <Button variant="ghost" onClick={clear}>
            Show every boon
          </Button>
        )}
        {end}
      </div>
      {more && (
        <div id={panelId} role="group" aria-label="More filters" className="grid gap-3 rounded-md border border-ash p-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Character or name">
            <WhoPicker
              key={cleared}
              characters={characters}
              who={search.character ? `c:${search.character}` : search.name ? "name" : ""}
              name={search.name}
              onChange={(who, name) => ask(who.startsWith("c:") ? { character: who.slice(2), name: "" } : { character: "", name: who === "name" ? name : "" })}
            />
          </Field>
          <Field label="Made from">
            <DateInput value={search.from} onChange={(e) => update({ from: e.target.value })} />
          </Field>
          <Field label="Made to">
            <DateInput value={search.to} onChange={(e) => update({ to: e.target.value })} />
          </Field>
          {(games.length > 0 || search.game) && (
            <Field label="At a game">
              <Select value={search.game} onChange={(e) => update({ game: e.target.value })}>
                <option value="">Any game, or none</option>
                {games.map((g) => (
                  <option key={g.id} value={g.id}>
                    {dates.dateTime(g.starts_at)}
                  </option>
                ))}
                {search.game && !games.some((g) => g.id === search.game) && <option value={search.game}>An earlier game</option>}
              </Select>
            </Field>
          )}
          <Checkbox label="Flagged only" hint="With a flag still waiting for a ruling." checked={search.flagged} onChange={(flagged) => update({ flagged })} className="self-end" />
          {/* On a phone, where the column headings can't be pressed. */}
          <div className="lg:hidden">
            <Field label="Order">
              <Select
                value={order === -1 ? 0 : order}
                onChange={(e) => {
                  const o = ORDERS[Number(e.target.value)]!;
                  update({ sort: o.sort, direction: o.direction });
                }}
              >
                {ORDERS.map((o, i) => (
                  <option key={o.label} value={i}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
      )}
    </div>
  );
}
