import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { TraitOut } from "../api/types";
import { withClanNames } from "../clanNames";
import { bookSummary, wordingOf } from "../houseWording";
import { AboutButton, AboutTrait, hasAbout } from "./AboutTrait";
import { useClanName } from "./ClanNames";
import { Input } from "./ui";
import { pageLabel } from "./TraitInfo";

/**
 * One choice in a `ChoiceBox`. `note` says why the character can't usually take it:
 * the choice is greyed, saying so, and can still be made (staff building an NPC need
 * no one's approval). `mark` is a short word beside it, such as "in-clan".
 */
export type BoxChoice = {
  value: string;
  label: string;
  /** The trait, for its line under the name and its detail. */
  trait?: TraitOut;
  /** Its line under the name, in place of the trait's. */
  summary?: string | null;
  group?: string | null;
  mark?: string;
  note?: string;
};

/**
 * What a trait does in one line, for the list to choose from: the troupe's own
 * summary, else the book's (unless the troupe's wording replaces it), else the
 * troupe's wording; for a clan, its in-clan disciplines.
 */
export function oneLine(trait: TraitOut | undefined): string | null {
  if (!trait) return null;
  if (trait.in_clan?.length) return `In-clan: ${trait.in_clan.join(", ")}`;
  return trait.house?.summary || bookSummary(trait.description, trait.changed) || wordingOf(trait.changed)?.wording || null;
}

/**
 * A searchable drop-down that explains each choice while picking (#1039): a box that
 * opens its list when tapped, typing narrowing it; each choice with what it does in
 * a line under its name and its page, and the highlighted one's detail (the same as
 * `AboutTrait` shows: the book's summary, the troupe's wording and house rule, a
 * discipline's powers) under the list. Arrow keys move the highlight and Enter
 * chooses; on a touch screen each choice's chevron shows its detail without choosing
 * it. The list is as wide as a phone's screen allows.
 *
 * With `value`, it shows the choice made, as a select does; without, it is a search
 * to add, emptied once a choice is made.
 */
export function ChoiceBox({
  id,
  label,
  placeholder,
  value,
  choices,
  onChoose,
  onOpen,
  splat,
  troupeId,
  className = "",
  "aria-describedby": describedBy,
}: {
  id?: string;
  /** Its name, where no `Field` labels it. */
  label?: string;
  placeholder: string;
  /** The label of the choice made; leave it out for a search to add. */
  value?: string;
  choices: BoxChoice[];
  onChoose: (value: string) => void;
  /** Told when the list opens and closes, so the caller can ask what is refused only then. */
  onOpen?: (open: boolean) => void;
  /** The rule set's splat, for a discipline's powers. */
  splat?: string;
  /** The troupe whose written rules about a trait are linked. */
  troupeId?: string | null;
  className?: string;
  "aria-describedby"?: string;
}) {
  const named = useClanName();
  const ownId = useId();
  const inputId = id ?? `${ownId}-box`;
  const listId = `${ownId}-list`;
  const detailId = `${ownId}-detail`;
  const popup = useRef<HTMLDivElement>(null);
  const listbox = useRef<HTMLUListElement>(null);
  // Whether the highlight moved by key, so the list follows it; a hover leaves the list where it is.
  const byKey = useRef(false);
  const [open, setOpen] = useState(false);
  // What is typed while the list is open; the choice made shows otherwise.
  const [typed, setTyped] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const [place, setPlace] = useState<CSSProperties>({});
  const closing = useRef<ReturnType<typeof setTimeout>>(undefined);
  const q = (typed ?? "").trim().toLowerCase();
  const shown = choices.filter((c) => !q || withClanNames(c.label).toLowerCase().includes(q) || named(c.label).toLowerCase().includes(q));
  const groups = [...new Set(shown.map((c) => c.group ?? null))];
  // In the order the list shows them, for the arrow keys.
  const ordered = groups.flatMap((g) => shown.filter((c) => (c.group ?? null) === g));
  const lit = ordered[active];

  const show = () => {
    clearTimeout(closing.current);
    if (open) return;
    setOpen(true);
    onOpen?.(true);
    // The choice made is highlighted, its detail showing.
    setActive(value ? choices.findIndex((c) => c.label === value) : -1);
  };
  const close = () => {
    setOpen(false);
    setTyped(null);
    setActive(-1);
    onOpen?.(false);
  };
  const choose = (c: BoxChoice) => {
    close();
    onChoose(c.value);
  };

  // As wide as the screen allows, and kept on it: a box at the right of a card opens leftwards.
  useLayoutEffect(() => {
    const box = open ? document.getElementById(inputId)?.getBoundingClientRect() : undefined;
    if (!box) return;
    // The page's own width: a phone's innerWidth grows with anything that overflows it.
    const screen = Math.min(window.innerWidth, document.documentElement.clientWidth || window.innerWidth);
    const width = Math.min(Math.max(box.width, 448), screen - 32);
    setPlace({ width, left: Math.max(16 - box.left, Math.min(0, screen - 16 - (box.left + width))) });
  }, [open, inputId]);
  useEffect(() => {
    if (open) popup.current?.scrollIntoView?.({ block: "nearest" });
  }, [open]);
  // The list alone scrolls to the highlight, never the page, which would move the list under the pointer.
  useEffect(() => {
    const row = open && active >= 0 && byKey.current ? document.getElementById(`${listId}-${active}`) : null;
    const box = listbox.current;
    byKey.current = false;
    if (!row || !box) return;
    // The list is the row's offset parent (it is `relative`).
    const top = row.offsetTop;
    if (top < box.scrollTop) box.scrollTop = top;
    else if (top + row.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = top + row.offsetHeight - box.clientHeight;
  }, [open, active, listId]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return show();
      if (!ordered.length) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      byKey.current = true;
      setActive((active + step + ordered.length) % ordered.length);
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      const c = lit ?? (ordered.length === 1 ? ordered[0] : undefined);
      if (c) choose(c);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      close();
    }
  };

  return (
    <div className={`relative ${className}`}>
      <Input
        id={inputId}
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="done"
        placeholder={placeholder}
        value={typed ?? (value ? named(value) : "")}
        className="pr-8 text-sm"
        onChange={(e) => {
          setTyped(e.target.value);
          setActive(-1);
          show();
        }}
        onFocus={(e) => {
          show();
          e.currentTarget.select();
        }}
        onClick={show}
        // Late enough that a tap in the list lands first; coming back to the box keeps it open.
        onBlur={() => {
          closing.current = setTimeout(close, 150);
        }}
        onKeyDown={onKeyDown}
      />
      <span aria-hidden className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-mist">
        ▾
      </span>
      {open && (
        <div
          ref={popup}
          style={place}
          // Keeps the box focused while the list is tapped or scrolled.
          onMouseDown={(e) => e.preventDefault()}
          // The box's width until it is measured, so its one-line summaries never widen the page.
          className="absolute z-20 mt-1 flex w-full flex-col overflow-hidden rounded-md border border-ash bg-dusk shadow-lg"
        >
          <ul ref={listbox} id={listId} role="listbox" aria-label={label ?? placeholder} className="relative max-h-64 overflow-y-auto py-1">
            {groups.map((group) => (
              <li key={group ?? "all"} role="presentation">
                {group && groups.length > 1 && <p className="px-3 pt-2 pb-1 text-xs tracking-wide text-mist uppercase">{group}</p>}
                <ul role="presentation">
                  {shown
                    .filter((c) => (c.group ?? null) === group)
                    .map((c) => {
                      const index = ordered.indexOf(c);
                      const line = c.summary !== undefined ? c.summary : oneLine(c.trait);
                      const page = pageLabel(c.trait?.page_reference);
                      const current = !!value && c.label === value;
                      return (
                        <li key={c.value} role="presentation" data-choice={c.label} className="flex items-start">
                          <div
                            id={`${listId}-${index}`}
                            role="option"
                            aria-label={named(c.label)}
                            aria-selected={current}
                            aria-describedby={`${c.mark ? `${listId}-${index}-mark ` : ""}${listId}-${index}-line`}
                            onClick={() => choose(c)}
                            onMouseEnter={() => setActive(index)}
                            className={`min-w-0 flex-1 cursor-pointer px-3 py-1.5 pointer-coarse:py-2 ${index === active ? "bg-gold/15" : "hover:bg-night"}`}
                          >
                            <span className="flex items-baseline gap-2">
                              <span className={`text-sm ${current ? "text-gold" : c.note ? "text-mist" : "text-parchment"}`}>{named(c.label)}</span>
                              {c.mark && <span id={`${listId}-${index}-mark`} className="rounded border border-gold/50 px-1 text-[0.7rem] leading-4 text-gold">{c.mark}</span>}
                              {page && <span className="ml-auto shrink-0 text-[0.7rem] text-mist">{page}</span>}
                            </span>
                            <span id={`${listId}-${index}-line`} className="block truncate text-xs text-mist">
                              {c.note ? <span className="text-blood-bright/80">{named(c.note)}</span> : named(line)}
                            </span>
                          </div>
                          {c.trait && hasAbout(c.trait, splat) && (
                            <AboutButton name={named(c.label)} open={index === active} controls={detailId} onToggle={() => setActive(index === active ? -1 : index)} className="mt-1 mr-1" />
                          )}
                        </li>
                      );
                    })}
                </ul>
              </li>
            ))}
          </ul>
          {shown.length === 0 && <p className="px-3 py-2 text-sm text-mist">Nothing by that name here.</p>}
          <div id={detailId} aria-live="polite" className="max-h-56 overflow-y-auto border-t border-ash px-3 py-2">
            {lit ? (
              <>
                <p className="text-sm text-gold">
                  {named(lit.label)}
                  {lit.mark && <span className="ml-2 text-xs text-mist">({lit.mark})</span>}
                </p>
                {lit.note && <p className="text-xs text-blood-bright">{named(lit.note)} Staff can give it all the same.</p>}
                {lit.trait ? (
                  <AboutTrait
                    id={`${detailId}-about`}
                    trait={lit.trait}
                    splat={splat}
                    to={lit.trait.category === "disciplines" ? 5 : 1}
                    troupeId={troupeId}
                    className="mt-0.5"
                  />
                ) : (
                  lit.summary && <p className="text-xs text-mist">{named(lit.summary)}</p>
                )}
                {lit.trait?.in_clan?.length ? <p className="mt-0.5 text-xs text-mist">In-clan disciplines: {lit.trait.in_clan.join(", ")}.</p> : null}
              </>
            ) : (
              <p className="text-xs text-mist">Highlight one to read about it: the arrow keys, a hover, or its chevron.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
