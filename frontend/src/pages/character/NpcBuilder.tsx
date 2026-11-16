import { useQuery } from "@tanstack/react-query";
import { withClanNames } from "../../clanNames";
import { useClanName } from "../../components/ClanNames";
import { HouseMark } from "../../components/HouseMark";
import { useId, useMemo, useState, type ReactNode } from "react";
import { api, unwrap } from "../../api/client";
import type { CatalogueOut, CharacterOut, SheetOut, TraitOut } from "../../api/types";
import { Badge, Button, Card, Empty, ErrorText, Field, Input, Loading } from "../../components/ui";
import { useAction, usePreferences, useUnavailable } from "../../hooks";
import { PrintAndBadge } from "./Badge";
import { NpcPicks } from "./NpcPicks";
import { DomitorCard } from "./Domitor";
import { FreeChoicesRow } from "./FreeChoices";
import { ChoiceSelect } from "./ChoiceSelect";
import { detailNeed, fieldSkills } from "./fields";
import { useHasDomitor } from "./splats";
import { rulesTroupe } from "./rules";
import { CUSTOM_ARCHETYPE, identityChoices } from "./creation/logic";
import { MORALITY, heldMorality, moralityLabel, moralityOptions, moveMorality, willpowerAndHealth } from "./morality";
import { useCatalogue } from "../../catalogue";
import { SectionLabel } from "../../components/Headings";
import { AboutButton, AboutTrait, hasAbout } from "../../components/AboutTrait";
import { ChoiceBox, type BoxChoice } from "../../components/ChoiceBox";

type Change = { category: string; name: string; detail?: string; rating: number | null };
/** A held trait's detail changed in place: a merit's choice, a skill's field (#570). */
type Rename = { category: string; name: string; detail: string; to: string };

/** Categories whose traits may carry a detail in staff's own words, as a player's may. */
const DETAILED = new Set(["skills", "backgrounds", "merits", "flaws"]);

/** Each attribute, in sheet order, with the category its focus is chosen from (MET: VTM p. 90). */
const ATTRIBUTES: [string, string][] = [
  ["Physical", "focus_physicals"],
  ["Social", "focus_socials"],
  ["Mental", "focus_mentals"],
];

/** A focus's choice when none is held. */
const NO_FOCUS = "No focus";

/** A card that spans both columns, as the sheet's long parts do. */
const WIDE = "md:col-span-2";

/** Sections of the quick builder after attributes, in sheet order. Long lists get a search box. */
const SECTIONS: { title: string; categories: string[]; split?: boolean; powers?: boolean }[] = [
  { title: "Skills", categories: ["skills"], split: true },
  { title: "Backgrounds", categories: ["backgrounds"] },
  { title: "Disciplines", categories: ["disciplines"] },
  { title: "Techniques", categories: ["techniques"], powers: true },
  { title: "Elder & luminary powers", categories: ["elder_disciplines", "luminary_disciplines"], powers: true },
  { title: "Rituals", categories: ["rituals", "sabbat_rituals"], powers: true },
  { title: "Extra in-clan disciplines", categories: ["extra_in_clan_disciplines"], powers: true },
  { title: "Merits & flaws", categories: ["merits", "flaws"] },
];

/**
 * The fast way to make an NPC: every trait is a row of dots, or of numbers as
 * Settings shows ratings, and tapping one sets the rating there and then (tap
 * the one held again to lower it by one).
 * Nothing is spent; the tally shows what the build would be worth in this
 * troupe.
 */
export function NpcBuilder({ character }: { character: CharacterOut }) {
  const path = { params: { path: { character_id: character.id } } };
  const sheet = useQuery({ queryKey: ["sheet", character.id, null], queryFn: () => unwrap(api.GET("/api/characters/{character_id}/sheet", path)) });
  const tally = useQuery({ queryKey: ["tally", character.id], queryFn: () => unwrap(api.GET("/api/characters/{character_id}/npc/tally", path)) });
  const catalogue = useCatalogue(character.splat, rulesTroupe(character));
  // What the NPC's kind leaves off the Vampire sheet: a mortal has no Generation or Humanity.
  const kinds = useQuery({ queryKey: ["npc-kinds"], queryFn: () => unwrap(api.GET("/api/npc-kinds")), staleTime: Infinity });
  const panels = kinds.data?.find((k) => k.key === character.npc_kind)?.panels;
  // A ghoul NPC takes its clan from its domitor, which staff set here instead.
  const hasDomitor = useHasDomitor(character.splat);
  const set = useAction((body: Change) => unwrap(api.PUT("/api/characters/{character_id}/npc/ratings", { ...path, body: { ...body, detail: body.detail ?? "" } })));
  const rename = useAction((body: Rename) => unwrap(api.PUT("/api/characters/{character_id}/npc/detail", { ...path, body })));

  if (sheet.isPending || catalogue.isPending) return <Loading />;
  if (!sheet.data || !catalogue.data) return <ErrorText error={sheet.error ?? catalogue.error} />;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_16rem]">
      {/* As on the sheet: small cards sit side by side, long ones span the width. */}
      <div className="grid content-start gap-4 md:grid-cols-2">
        {hasDomitor && (
          <div className={WIDE}>
            <DomitorCard character={character} sheet={sheet.data} catalogue={catalogue.data} canChange />
          </div>
        )}
        {/* Who it is and its Morality, small, side by side; then the long parts in sheet order. */}
        <Identity
          sheet={sheet.data}
          catalogue={catalogue.data}
          troupeId={rulesTroupe(character)}
          withoutClan={!!hasDomitor}
          wide={panels?.morality === false}
          onChange={(c) => set.mutate(c)}
        />
        {panels?.morality !== false && <Morality sheet={sheet.data} catalogue={catalogue.data} troupeId={rulesTroupe(character)} onChange={(c) => set.mutate(c)} />}
        <Attributes sheet={sheet.data} catalogue={catalogue.data} troupeId={rulesTroupe(character)} onChange={(c) => set.mutate(c)} />
        {SECTIONS.map((section) => (
          <Section
            key={section.title}
            {...section}
            noGeneration={panels?.generation === false}
            inClan={inClanOf(sheet.data, catalogue.data)}
            character={character}
            sheet={sheet.data}
            catalogue={catalogue.data}
            onChange={(c) => set.mutate(c)}
            onRename={(r) => rename.mutate(r)}
            busy={set.isPending || rename.isPending}
          />
        ))}
        {(set.error ?? rename.error) && (
          <div className={WIDE}>
            <ErrorText error={set.error ?? rename.error} />
          </div>
        )}
      </div>
      <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
        {/* Only the troupe's staff see an NPC, and they all print its badge. */}
        <PrintAndBadge character={character} />
        <Card title="Worth">
          <p className="font-display text-3xl text-gold">{tally.data?.total ?? "…"} XP</p>
          <p className="mt-1 text-xs text-mist">What this build would cost a player character here. Starting traits and creation picks are free.</p>
          {tally.data?.lines.some((l) => l.cost === null) && (
            <ul className="mt-2 text-xs text-blood-bright">
              {tally.data.lines
                .filter((l) => l.cost === null)
                .map((l) => (
                  <li key={l.name}>
                    {l.name}: {l.note}
                  </li>
                ))}
            </ul>
          )}
        </Card>
        <NpcPicks character={character} />
      </aside>
    </div>
  );
}

/**
 * The NPC's in-clan disciplines: its clan's, and the extra ones it holds. A ghoul's
 * come from its domitor, which the sheet doesn't say here, so it has none marked.
 */
function inClanOf(sheet: SheetOut, catalogue: CatalogueOut): Set<string> {
  const clan = sheet.traits.find((t) => t.category === "clan")?.name;
  const own = catalogue.traits.find((t) => t.category === "clan" && t.name === clan)?.in_clan ?? [];
  const extra = sheet.traits.filter((t) => t.category === "extra_in_clan_disciplines" && (t.rating ?? 0) > 0).map((t) => t.name);
  return new Set([...own, ...extra]);
}

/** Whether a discipline, or an elder power of one ("Animalism: Crimson Fury"), is in-clan. */
function isInClan(trait: TraitOut, inClan: Set<string>): boolean {
  if (trait.category === "disciplines") return inClan.has(trait.name);
  if (trait.category === "elder_disciplines") return inClan.has(trait.name.split(":")[0]!.trim());
  return false;
}

function Identity({
  sheet,
  catalogue,
  troupeId,
  withoutClan,
  wide,
  onChange,
}: {
  sheet: SheetOut;
  catalogue: CatalogueOut;
  troupeId?: string;
  withoutClan: boolean;
  /** Spanning the width, with no Morality card beside it. */
  wide: boolean;
  onChange: (c: Change) => void;
}) {
  const choices = identityChoices(catalogue, sheet).filter((c) => !(withoutClan && c.key === "clan"));
  return (
    <Card dense title="Who" className={wide ? WIDE : undefined}>
      <div className={`grid gap-3 sm:grid-cols-2 ${wide ? "" : "md:grid-cols-1"}`}>
        {choices.map((c) => (
          <Field key={c.key} label={c.name}>
            <ChoiceBox
              label={c.name}
              placeholder="Choose…"
              value={sheet.traits.find((t) => t.category === c.key)?.name ?? ""}
              choices={catalogue.traits
                .filter((t) => t.category === c.key && t.name !== CUSTOM_ARCHETYPE)
                .map((t): BoxChoice => ({ value: t.name, label: t.name, trait: t }))}
              troupeId={troupeId}
              onChoose={(name) => onChange({ category: c.key, name, rating: null })}
            />
          </Field>
        ))}
      </div>
    </Card>
  );
}

/** Attributes, each with its focus beside it: one of three, chosen like a PC's. */
function Attributes({ sheet, catalogue, troupeId, onChange }: { sheet: SheetOut; catalogue: CatalogueOut; troupeId?: string; onChange: (c: Change) => void }) {
  const max = catalogue.categories.find((c) => c.key === "attributes")?.max_rating ?? 10;
  return (
    <Card dense title="Attributes" className={WIDE}>
      <ul className="@container">
        {ATTRIBUTES.map(([name, focusCategory]) => {
          const trait = catalogue.traits.find((t) => t.category === "attributes" && t.name === name);
          if (!trait) return null;
          const options = catalogue.traits.filter((t) => t.category === focusCategory);
          const focus = sheet.traits.find((t) => t.category === focusCategory && (t.rating ?? 0) > 0)?.name ?? "";
          const rating = sheet.traits.find((t) => t.category === "attributes" && t.name === name)?.rating ?? 0;
          return (
            <Row
              key={name}
              trait={trait}
              rating={rating}
              max={max}
              onChange={onChange}
              aside={
                options.length > 0 && (
                  <ChoiceBox
                    label={`${name} focus`}
                    placeholder="No focus"
                    value={focus || NO_FOCUS}
                    choices={[
                      { value: "", label: NO_FOCUS, summary: "None of the three: it can be chosen later." },
                      ...options.map((o): BoxChoice => ({ value: o.name, label: o.name, trait: o })),
                    ]}
                    troupeId={troupeId}
                    onChoose={(chosen) => {
                      if (chosen === focus) return;
                      onChange(chosen ? { category: focusCategory, name: chosen, rating: 1 } : { category: focusCategory, name: focus, rating: 0 });
                    }}
                    className="w-full @lg:w-44"
                  />
                )
              }
            />
          );
        })}
      </ul>
    </Card>
  );
}

/**
 * Morality is one choice, Humanity or a single Path, at one rating: choosing
 * another moves the NPC to it, keeping the rating. Willpower and health levels
 * follow as dots.
 */
function Morality({ sheet, catalogue, troupeId, onChange }: { sheet: SheetOut; catalogue: CatalogueOut; troupeId?: string; onChange: (c: Change) => void }) {
  // With no Morality held, the choice waits here for its first dot.
  const [chosen, setChosen] = useState<string | null>(null);
  const options = moralityOptions(catalogue);
  const held = heldMorality(sheet, options);
  const name = held.rating ? held.name : (chosen ?? held.name);
  const trait = options.find((t) => t.name === name);
  const rest = willpowerAndHealth(catalogue);
  const maxOf = (category: string) => catalogue.categories.find((c) => c.key === category)?.max_rating ?? 5;
  if (!trait && !rest.length) return null;
  return (
    <Card dense title="Morality & willpower">
      <ul className="@container">
        {trait && (
          <Row
            trait={trait}
            label="Morality"
            rating={held.rating}
            max={maxOf(MORALITY)}
            onChange={onChange}
            aside={
              <ChoiceBox
                label="Morality"
                placeholder="Humanity or a Path"
                value={moralityLabel(name)}
                choices={options.map((o): BoxChoice => ({ value: o.name, label: moralityLabel(o.name), trait: o }))}
                troupeId={troupeId}
                onChoose={(chosen) => {
                  if (chosen === name) return;
                  const move = moveMorality(held, chosen);
                  if (move) onChange(move);
                  else setChosen(chosen);
                }}
                className="w-full @lg:w-56"
              />
            }
          />
        )}
        {rest.map((t) => (
          <Row
            key={`${t.category}/${t.name}`}
            trait={t}
            rating={sheet.traits.find((s) => s.category === t.category && s.name === t.name)?.rating ?? 0}
            max={maxOf(t.category)}
            onChange={onChange}
          />
        ))}
      </ul>
    </Card>
  );
}

function Section({
  character,
  title,
  categories,
  split,
  powers,
  noGeneration,
  inClan,
  sheet,
  catalogue,
  onChange,
  onRename,
  busy,
}: {
  character: CharacterOut;
  /** The NPC's in-clan disciplines, marked in the list to add from. */
  inClan?: Set<string>;
  /** Leave the Generation background out: the NPC's kind has none. */
  noGeneration?: boolean;
  title: string;
  categories: string[];
  split?: boolean;
  /** Powers are held or not, in one tap; staff may give any, and one whose prerequisites are unmet is marked. */
  powers?: boolean;
  sheet: SheetOut;
  catalogue: CatalogueOut;
  onChange: (c: Change) => void;
  onRename: (r: Rename) => void;
  busy: boolean;
}) {
  const [query, setQuery] = useState("");
  // Whether the list to add from is open: why each trait not held is out of reach is
  // asked only then, as it is slow (#1039).
  const [adding, setAdding] = useState(false);
  const refusedFirst = useUnavailable(character.id, categories[0] ?? "", adding);
  const refusedSecond = useUnavailable(character.id, categories[1] ?? "", adding && categories.length > 1);
  const refused = useMemo(() => {
    const found = new Map<string, string>();
    categories.forEach((category, i) => {
      for (const [name, reason] of Object.entries((i === 0 ? refusedFirst.data : refusedSecond.data) ?? {})) found.set(`${category}/${name}`, reason);
    });
    return found;
  }, [categories, refusedFirst.data, refusedSecond.data]);
  // From the sheet's problems, why each power held is out of order.
  const marks = useMemo(() => {
    const found = new Map<string, string>();
    if (!powers) return found;
    for (const p of sheet.problems) if (categories.includes(p.category)) found.set(`${p.category}/${p.name}`, p.message);
    return found;
  }, [powers, categories, sheet.problems]);
  // Each trait held, once for each detail it is held with (Crafts: Painting and Crafts: Pottery).
  const held = useMemo(() => {
    const found = new Map<string, { detail: string; rating: number }[]>();
    for (const t of sheet.traits) {
      if (!t.rating) continue;
      const key = `${t.category}/${t.name}`;
      found.set(key, [...(found.get(key) ?? []), { detail: t.detail, rating: t.rating }]);
    }
    return found;
  }, [sheet]);
  const ratings = useMemo(() => new Map([...held].map(([key, all]) => [key, Math.max(...all.map((h) => h.rating))])), [held]);
  const present = categories.filter((c) => catalogue.categories.some((k) => k.key === c));
  if (!present.length) return null;
  // An archived house merit is not taken anew; one held stays listed.
  const traits = catalogue.traits.filter(
    (t) =>
      present.includes(t.category) &&
      !(noGeneration && t.category === "backgrounds" && t.name === "Generation") &&
      !(t.house?.archived && !ratings.get(`${t.category}/${t.name}`)),
  );
  const q = query.trim().toLowerCase();
  // Long lists show what the NPC has, and the rest are added from a drop-down that
  // says what each does (#1039); a shorter one lists every trait, a search narrowing it.
  const long = traits.length > 30;
  const shown = traits.filter((t) => (long ? ratings.get(`${t.category}/${t.name}`) : !q || withClanNames(t.name).toLowerCase().includes(q)));
  const categoryName = (key: string) => catalogue.categories.find((c) => c.key === key)?.name ?? key;
  const toAdd = long
    ? traits
        .filter((t) => !ratings.get(`${t.category}/${t.name}`))
        .map(
          (t): BoxChoice => ({
            value: `${t.category}/${t.name}`,
            label: t.name,
            trait: t,
            group: present.length > 1 ? categoryName(t.category) : null,
            mark: inClan && isInClan(t, inClan) ? "in-clan" : undefined,
            note: refused.get(`${t.category}/${t.name}`),
          }),
        )
    : [];
  const groups = new Map<string, TraitOut[]>();
  for (const t of shown) {
    const heading = split ? (t.attribute ?? "Other") : (catalogue.categories.find((c) => c.key === t.category)?.name ?? t.category);
    groups.set(heading, [...(groups.get(heading) ?? []), t]);
  }
  const order = split ? ["Physical", "Social", "Mental", "Other"] : [...groups.keys()];
  // As on the sheet: a few rows of one kind make a small card, beside another; more, or a
  // search under way, span the width, and a long list of one kind flows into two columns.
  const wide = q !== "" || groups.size > 1 || shown.length > 5;
  const add = (key: string) => {
    const trait = traits.find((t) => `${t.category}/${t.name}` === key);
    if (trait) onChange({ category: trait.category, name: trait.name, rating: trait.fixed_rating ?? 1 });
  };

  return (
    <Card dense title={title} className={wide ? WIDE : undefined}>
      {long ? (
        <ChoiceBox
          label={`Search ${title}`}
          placeholder={`Search ${toAdd.length} to add…`}
          choices={toAdd}
          onChoose={add}
          onOpen={setAdding}
          splat={character.splat}
          troupeId={rulesTroupe(character)}
          className="mb-3"
        />
      ) : (
        traits.length > 12 && <Input aria-label={`Search ${title}`} placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} className="mb-3" />
      )}
      <div className={groups.size > 1 ? "grid gap-x-6 gap-y-3 sm:grid-cols-2" : undefined}>
        {order
          .filter((h) => groups.has(h))
          .map((heading) => (
            <div key={heading}>
              {(groups.size > 1 || split) && <SectionLabel className="mb-1">{heading}</SectionLabel>}
              <ul className={wide && groups.size === 1 ? "gap-x-6 sm:columns-2" : undefined}>
                {groups.get(heading)!.map((t) => (
                  <Held
                    key={`${t.category}/${t.name}`}
                    character={character}
                    trait={t}
                    held={held.get(`${t.category}/${t.name}`) ?? []}
                    max={catalogue.categories.find((c) => c.key === t.category)?.max_rating ?? 5}
                    onChange={onChange}
                    onRename={onRename}
                    power={powers}
                    mark={marks.get(`${t.category}/${t.name}`)}
                    sheet={sheet}
                    catalogue={catalogue}
                    busy={busy}
                  />
                ))}
              </ul>
            </div>
          ))}
      </div>
      {long && shown.length === 0 && <Empty>None yet. Search to add some.</Empty>}
    </Card>
  );
}

function Row({
  trait,
  label,
  detail = "",
  rating,
  max,
  onChange,
  aside,
  power,
  mark,
  nameAside,
  splat,
  children,
}: {
  trait: TraitOut;
  /** Shown in place of the trait's name, such as Morality before its picker. */
  label?: string;
  /** The detail the trait is held with, which a change of its rating keeps. */
  detail?: string;
  rating: number;
  max: number;
  onChange: (c: Change) => void;
  /** Shown beside the name, such as an attribute's focus. */
  aside?: ReactNode;
  /** A power (technique, ritual...): held or not, at its level if it has one. */
  power?: boolean;
  /** Why this one is out of order for the NPC; it is allowed all the same. */
  mark?: string;
  /** Shown just after the name, such as the button that changes its detail. */
  nameAside?: ReactNode;
  /** Shown under the row, such as the box its detail is set in. */
  children?: ReactNode;
  /** The rule set's splat, given where the row's chevron opens what the trait does (#1000): for a discipline, with the power its next dot gives. */
  splat?: string;
}) {
  const named = useClanName();
  const shown = detail ? `${trait.name}: ${detail}` : trait.name;
  const numbers = usePreferences().ratings === "numbers";
  const [reading, setReading] = useState(false);
  const aboutId = useId();
  const chevron = splat !== undefined && hasAbout(trait, splat) && (
    <AboutButton name={named(shown)} open={reading} controls={aboutId} onToggle={() => setReading(!reading)} className="-ml-1" />
  );
  const about = reading && <AboutTrait id={aboutId} trait={trait} splat={splat} from={rating + 1} className="pb-1 pl-6" />;
  if (trait.fixed_rating || power) {
    const on = rating > 0;
    const level = trait.fixed_rating ?? 1;
    return (
      <li className="break-inside-avoid py-1 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            {chevron}
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={on} onChange={() => onChange({ category: trait.category, name: trait.name, detail, rating: on ? 0 : level })} />
              <span className={on ? "text-parchment" : "text-mist"}>{named(shown)}</span>
              {trait.house && <HouseMark label={trait.house.label} short />}
            </label>
            {nameAside}
          </span>
          {trait.fixed_rating && <Badge className="shrink-0">{trait.fixed_rating}</Badge>}
        </div>
        {mark && (
          <p className="ml-6 text-xs text-blood-bright" data-testid="power-mark">
            {on ? "Marked: " : ""}
            {named(mark)}
          </p>
        )}
        {about}
        {children}
      </li>
    );
  }
  // Enough dots to reach the usual ratings in one tap: attributes run to 10.
  const usual = trait.category === "attributes" ? 10 : 5;
  const dots = Math.min(Math.max(usual, rating + 1), max);
  // As numbers, each button is the rating it sets, the one held marked (Settings → Show ratings as).
  const look = (dot: number) =>
    numbers
      ? dot === rating
        ? "rounded bg-blood/25 font-semibold text-parchment"
        : dot < rating
          ? "text-blood-bright"
          : "text-mist/60"
      : dot <= rating
        ? "text-blood-bright"
        : "text-mist/60";
  // The rating at the right of the row, as on the sheet, so a card reads as a table: a long
  // name wraps rather than push it down a line. A picker beside the name (a focus,
  // Morality's path) goes under it where the card is narrow (a phone).
  return (
    <li className={`break-inside-avoid text-sm ${aside ? "py-1.5" : "py-0.5"}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 @lg:flex-none">
          <span className="flex min-w-0 items-center">
            {chevron}
            <span className={`${aside ? "w-16" : ""} ${rating ? "text-parchment" : "text-mist"}`}>{label ?? named(shown)}</span>
          </span>
          {nameAside}
        </span>
        {aside && <span className="order-last basis-full @lg:order-none @lg:basis-auto">{aside}</span>}
        <span className="ml-auto flex shrink-0">
          {Array.from({ length: dots }, (_, i) => i + 1).map((dot) => (
            <button
              key={dot}
              type="button"
              aria-label={`${shown} ${dot}`}
              aria-pressed={rating === dot}
              onClick={() => onChange({ category: trait.category, name: trait.name, detail, rating: rating === dot ? dot - 1 : dot })}
              className={`grid h-7 w-5 place-items-center hover:bg-ash sm:w-6 ${numbers ? "text-sm tabular-nums" : "text-base"} ${look(dot)}`}
            >
              {numbers ? dot : dot <= rating ? "●" : "○"}
            </button>
          ))}
        </span>
      </div>
      {about}
      {children}
    </li>
  );
}

/**
 * A trait of a section, once for each detail the NPC holds it with, or once unheld.
 * A held one's detail can be changed in place, keeping its rating and creation pick
 * (#570). One its rules need (Thaumaturgic Expertise's path, a skill's field, a
 * Retainer's name) is flagged until it is given. One that gives merits or dots
 * (Piece That Remains, Ventrue Royalty) has what it gives chosen under it (#577).
 */
function Held({
  character,
  trait,
  held,
  max,
  onChange,
  onRename,
  power,
  mark,
  sheet,
  catalogue,
  busy,
}: {
  character: CharacterOut;
  trait: TraitOut;
  held: { detail: string; rating: number }[];
  max: number;
  onChange: (c: Change) => void;
  onRename: (r: Rename) => void;
  power?: boolean;
  mark?: string;
  sheet: SheetOut;
  catalogue: CatalogueOut;
  busy: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const asks = !!trait.choices || !!detailNeed(trait);
  const detailed = asks || (!power && DETAILED.has(trait.category));
  const rows = held.length ? held : [{ detail: "", rating: 0 }];
  // Another of a trait held once for each field or name (Crafts, Retainers), once each held has its own.
  const another = !!detailNeed(trait) && held.length > 0 && held.every((h) => h.detail);
  return (
    <>
      {rows.map((h) => {
        const missing = asks && h.rating > 0 && !h.detail;
        const open = detailed && h.rating > 0 && (missing || editing === h.detail);
        const onSheet = h.rating > 0 ? sheet.traits.find((t) => t.category === trait.category && t.name === trait.name && t.detail === h.detail) : undefined;
        return (
          <Row
            key={h.detail}
            trait={trait}
            detail={h.detail}
            rating={h.rating}
            max={max}
            onChange={onChange}
            power={power}
            mark={mark}
            splat={character.splat}
            nameAside={
              detailed &&
              h.rating > 0 &&
              !open && (
                <button
                  type="button"
                  className="text-xs text-mist underline hover:text-parchment"
                  aria-label={h.detail ? `Edit the detail of ${trait.name}: ${h.detail}` : `Add a detail to ${trait.name}`}
                  onClick={() => setEditing(h.detail)}
                >
                  {h.detail ? "Edit" : "Detail"}
                </button>
              )
            }
          >
            {open && (
              <DetailEditor
                trait={trait}
                initial={h.detail}
                missing={missing}
                sheet={sheet}
                catalogue={catalogue}
                busy={busy}
                onSave={(to) => {
                  onRename({ category: trait.category, name: trait.name, detail: h.detail, to });
                  setEditing(null);
                }}
                onCancel={missing ? undefined : () => setEditing(null)}
              />
            )}
            {!!onSheet?.free_choices?.length && <FreeChoicesRow character={character} trait={onSheet} editable={character.status !== "retired"} folded />}
          </Row>
        );
      })}
      {another &&
        (adding ? (
          <li>
            <DetailEditor
              trait={trait}
              initial=""
              missing={false}
              sheet={sheet}
              catalogue={catalogue}
              busy={busy}
              saveLabel="Add"
              onSave={(to) => {
                onChange({ category: trait.category, name: trait.name, detail: to, rating: trait.fixed_rating ?? 1 });
                setAdding(false);
              }}
              onCancel={() => setAdding(false)}
            />
          </li>
        ) : (
          <li className="mb-1 ml-3 text-xs">
            <button type="button" className="text-mist underline hover:text-parchment" onClick={() => setAdding(true)}>
              {detailNeed(trait)?.another}
            </button>
          </li>
        ))}
    </>
  );
}

/** The box a held trait's detail is set in: one of its choices, or staff's own words. */
function DetailEditor({
  trait,
  initial,
  missing,
  sheet,
  catalogue,
  busy,
  saveLabel = "Set",
  onSave,
  onCancel,
}: {
  trait: TraitOut;
  initial: string;
  /** Its rules need one and none is given yet: flagged until it is. */
  missing: boolean;
  sheet: SheetOut;
  catalogue: CatalogueOut;
  busy: boolean;
  saveLabel?: string;
  onSave: (to: string) => void;
  onCancel?: () => void;
}) {
  const named = useClanName();
  const [draft, setDraft] = useState(initial);
  const need = detailNeed(trait);
  const choices = trait.choices;
  const to = draft.trim();
  // One its rules need can't be emptied; one in staff's own words can.
  const ready = to !== initial && (to !== "" || (!choices && !need));
  const label = choices ? (missing ? "Choose what it applies to" : "Applies to") : need ? (missing ? need.missing : need.label) : "Detail";
  // The NPC's own traits first: for Thaumaturgic Expertise, the paths it holds.
  const own = sheet.traits.filter((t) => (t.rating ?? 0) > 0).map((t) => t.name);
  return (
    <div className={`mt-0.5 mb-1 ml-3 flex flex-wrap items-center gap-1.5 border-l pl-3 text-xs ${missing ? "border-blood/60" : "border-ash"}`}>
      <span className={missing ? "text-blood-bright" : "text-mist"}>{label}:</span>
      {choices ? (
        <ChoiceSelect
          label={`What ${trait.name} applies to`}
          choices={choices}
          preferred={own}
          fields={fieldSkills(catalogue)}
          value={draft}
          onChange={setDraft}
          className="min-h-8 max-w-full py-1 text-xs"
        />
      ) : (
        <Input
          aria-label={`${named(trait.name)} ${need ? need.label.toLowerCase() : "detail"}`}
          value={draft}
          maxLength={200}
          placeholder={need?.placeholder ?? "A specialisation, subject or name"}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && ready) onSave(to);
            if (e.key === "Escape") onCancel?.();
          }}
          className="min-h-8 w-40 py-1 text-xs"
        />
      )}
      <Button variant="secondary" className="min-h-8 px-2 py-1 text-xs" disabled={!ready || busy} onClick={() => onSave(to)}>
        {saveLabel}
      </Button>
      {onCancel && (
        <Button variant="secondary" className="min-h-8 px-2 py-1 text-xs" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </div>
  );
}
