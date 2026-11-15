import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import type { CharacterChoice } from "../../api/types";
import { Empty, Input, Textarea } from "../../components/ui";
import { findCharacters } from "./logInfluence";

type Option = { kind: "character"; character: CharacterChoice } | { kind: "name"; name: string } | { kind: "text" };

/** Past this, or over more than one line, a name already given opens in the text box, where all of it shows. */
const ONE_LINE = 60;

/**
 * Who took an influence action: a search box over the troupe's PCs and NPCs that
 * opens as soon as it is focused, with typing narrowing it. Or a name only, for
 * someone not in Horatio: whatever was typed, offered last.
 *
 * `who` is "c:<character id>", "name" (with `name`), or "" until someone is picked.
 *
 * With `anyText` (a side of a boon, #990), it offers "Someone not in Horatio…" last,
 * always: it turns the box into one for any text up to `anyText.longest` characters,
 * with `anyText.hint` under it, growing past one line as it is written.
 */
export function WhoPicker({
  characters,
  who,
  name,
  onChange,
  id,
  "aria-describedby": describedBy,
  "aria-label": ariaLabel,
  anyText,
}: {
  characters: CharacterChoice[];
  who: string;
  name: string;
  onChange: (who: string, name: string) => void;
  id?: string;
  "aria-describedby"?: string;
  // For a picker with no field label of its own, such as a row of a list.
  "aria-label"?: string;
  anyText?: { longest: number; hint: string };
}) {
  const listId = useId();
  const hintId = useId();
  const picked = who.startsWith("c:") ? characters.find((c) => `c:${c.id}` === who) : undefined;
  const shown = picked ? picked.name : who === "name" ? name : "";
  const [text, setText] = useState(shown);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const closing = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [writing, setWriting] = useState(() => !!anyText && who === "name" && (name.length > ONE_LINE || name.includes("\n")));
  const box = useRef<HTMLTextAreaElement>(null);
  // Chosen from the list, the text box takes the focus; opened with a name already given, it doesn't.
  const focusBox = useRef(false);

  // The text box is a line high until what is written needs more.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    if (focusBox.current) {
      focusBox.current = false;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  }, [writing, name]);

  // Once someone is picked, opening the list again shows everyone, to pick someone else.
  const typed = who ? "" : text;
  const options: Option[] = [
    ...findCharacters(characters, typed).map((character) => ({ kind: "character" as const, character })),
    ...(typed.trim() ? [{ kind: "name" as const, name: typed.trim() }] : []),
    ...(anyText ? [{ kind: "text" as const }] : []),
  ];
  const pick = (option: Option) => {
    if (option.kind === "text") {
      // What was typed carries over, to go on with.
      onChange(typed.trim() ? "name" : "", typed);
      focusBox.current = true;
      setWriting(true);
    } else if (option.kind === "character") {
      onChange(`c:${option.character.id}`, "");
      setText(option.character.name);
    } else {
      onChange("name", option.name);
      setText(option.name);
    }
    setOpen(false);
    setActive(-1);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((active + step + options.length) % Math.max(options.length, 1));
    } else if (e.key === "Enter" && open && options[active]) {
      e.preventDefault();
      pick(options[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  if (writing && anyText) {
    return (
      <div className="flex flex-col gap-1">
        <Textarea
          ref={box}
          id={id}
          aria-describedby={[describedBy, hintId].filter(Boolean).join(" ")}
          aria-label={ariaLabel}
          rows={1}
          maxLength={anyText.longest}
          value={name}
          className="resize-none overflow-hidden"
          onChange={(e) => onChange(e.target.value.trim() ? "name" : "", e.target.value)}
        />
        <span id={hintId} className="text-xs text-mist">
          {anyText.hint}
        </span>
        <button
          type="button"
          className="self-start text-xs text-gold underline hover:text-parchment"
          onClick={() => {
            setWriting(false);
            setText("");
            onChange("", "");
          }}
        >
          Find a character instead
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input
        id={id}
        aria-describedby={describedBy}
        aria-label={ariaLabel}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        placeholder="Find a character, or type a name"
        maxLength={anyText?.longest}
        value={text}
        className="pr-8"
        onChange={(e) => {
          setText(e.target.value);
          if (who) onChange("", "");
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => {
          clearTimeout(closing.current);
          setOpen(true);
        }}
        // Late enough that a click on the list lands first.
        onBlur={() => {
          closing.current = setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={onKeyDown}
      />
      <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-mist">
        ▾
      </span>
      {open && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-ash bg-dusk py-1 shadow-lg"
        >
          <ul id={listId} role="listbox" aria-label="Characters">
            {options.map((option, i) => (
              <li
                key={option.kind === "character" ? option.character.id : option.kind}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onClick={() => pick(option)}
                className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm ${i === active ? "bg-gold/20 text-gold" : "hover:bg-night"}`}
              >
                {option.kind === "character" ? (
                  <>
                    <span className="min-w-0 flex-1 truncate">{option.character.name}</span>
                    <span className="shrink-0 text-xs text-mist">{option.character.kind === "pc" ? "PC" : "NPC"}</span>
                  </>
                ) : option.kind === "name" ? (
                  <>
                    <span className="min-w-0 flex-1 truncate">{option.name}</span>
                    <span className="shrink-0 text-xs text-mist">name only, not in Horatio</span>
                  </>
                ) : (
                  <span className="min-w-0 flex-1 text-mist italic">Someone not in Horatio…</span>
                )}
              </li>
            ))}
          </ul>
          {options.length === 0 && (
            <div className="px-3">
              <Empty>No characters yet. Type a name to log it under.</Empty>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
