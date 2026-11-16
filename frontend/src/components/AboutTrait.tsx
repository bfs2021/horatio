import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { api, unwrap } from "../api/client";
import type { TraitOut } from "../api/types";
import { CATALOGUE_MS } from "../catalogue";
import { bookSummary, wordingOf } from "../houseWording";
import { ruleLink } from "../pages/troupe/writtenRules";
import { useClanName } from "./ClanNames";
import { Rating } from "./ui";
import { Chevron, PageRef, pageLabel } from "./TraitInfo";
import { HouseWording } from "./TroupeChange";

/** Whether a trait in a list has anything to read about it before it is chosen. */
export function hasAbout(trait: TraitOut, splat?: string): boolean {
  return Boolean(
    trait.description ||
      wordingOf(trait.changed) ||
      trait.house_rule ||
      trait.house?.summary ||
      pageLabel(trait.page_reference) ||
      (splat && trait.category === "disciplines"),
  );
}

/**
 * The chevron on a row of a list to choose from that opens what the trait does
 * under the row (AboutTrait), without choosing it: the same chevron as a held
 * trait's on the sheet (TraitInfo). Its own button, so it works on a row that
 * can't be chosen (greyed, the rules refusing it), and on a phone, where there is
 * no hover. 40 px square on a touch screen.
 */
export function AboutButton({ name, open, controls, onToggle, className = "" }: { name: string; open: boolean; controls: string; onToggle: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-label={`About ${name}`}
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className={`grid h-8 w-7 shrink-0 place-items-center rounded text-mist hover:bg-ash hover:text-parchment aria-expanded:text-gold pointer-coarse:h-10 pointer-coarse:w-10 ${className}`}
    >
      <Chevron open={open} />
    </button>
  );
}

/**
 * What a trait in a list to choose from does, to read before choosing it (#1000):
 * its summary, the troupe's own wording and house rule, and its page; for a
 * discipline, its test pool and the powers the dots `from` to `to` would give (the
 * next dot, or the dots a pick at a rating gives), from the power reference.
 * `troupeId` links the troupe's written rules about it.
 */
export function AboutTrait({
  id,
  trait,
  splat,
  from = 1,
  to = from,
  troupeId,
  className = "",
}: {
  id: string;
  trait: TraitOut;
  splat?: string;
  from?: number;
  to?: number;
  troupeId?: string | null;
  className?: string;
}) {
  const named = useClanName();
  const shown = bookSummary(trait.description, trait.changed);
  return (
    <div id={id} data-testid="about-trait" className={`text-xs leading-relaxed text-mist ${className}`}>
      {shown && <p>{named(shown)}</p>}
      <HouseWording change={trait.changed} className="my-1" />
      {trait.house?.summary && <p className="text-gold">What it does: {named(trait.house.summary)}</p>}
      {trait.house_rule && <p className="text-gold">House rule: {trait.house_rule}</p>}
      {troupeId && !!trait.written_rules?.length && (
        <p>
          House rules about it:{" "}
          {trait.written_rules.map((w, n) => (
            <span key={w.id}>
              {n > 0 && ", "}
              <Link to={ruleLink(troupeId, w.id)} className="underline hover:text-parchment">
                {w.title}
              </Link>
            </span>
          ))}
        </p>
      )}
      {splat && trait.category === "disciplines" && <DisciplineDots splat={splat} discipline={trait.name} from={from} to={to} />}
      {pageLabel(trait.page_reference) && (
        <p className="mt-0.5">
          <PageRef page={trait.page_reference} />
        </p>
      )}
    </div>
  );
}

/** What each dot of the rule set's disciplines gives, asked for once a discipline is opened, and kept. */
function usePowerNotes(splat: string) {
  return useQuery({
    queryKey: ["power-notes", splat],
    queryFn: () => unwrap(api.GET("/api/rules/{splat}/powers", { params: { path: { splat } } })),
    // The power reference changes only with a new build.
    staleTime: Infinity,
    gcTime: CATALOGUE_MS,
  });
}

/**
 * A discipline's test pool (unless `test` is false), and the power each of the dots
 * `from` to `to` gives, as the Play View's Pools tab words them.
 */
export function DisciplineDots({ splat, discipline, from, to = from, test: withTest = true }: { splat: string; discipline: string; from: number; to?: number; test?: boolean }) {
  const notes = usePowerNotes(splat);
  if (notes.isPending) return <p className="mt-1">Loading its powers…</p>;
  if (!notes.data) return null;
  const test = notes.data.disciplines.find((d) => d.name === discipline);
  const pool = test?.pool ? `${test.pool} against ${test.versus}.` : null;
  const powers = notes.data.powers.filter((p) => p.discipline === discipline && p.level >= from && p.level <= to);
  return (
    <>
      {withTest && (pool || test?.note) && <p className="mt-1">{[pool && `Test: ${pool}`, test?.note].filter(Boolean).join(" ")}</p>}
      {powers.length > 0 && (
        <>
          <p className="mt-1 text-gold">{from === to ? `Dot ${from} gives:` : `Dots ${from} to ${to} give:`}</p>
          <ol className="flex flex-col gap-1">
            {powers.map((p) => (
              <li key={p.level}>
                <Rating value={p.level} of={p.level} className="min-w-5 text-gold" /> <span className="text-parchment">{p.name}</span> {p.note}
              </li>
            ))}
          </ol>
        </>
      )}
    </>
  );
}
