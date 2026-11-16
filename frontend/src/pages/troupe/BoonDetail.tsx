import { useQuery } from "@tanstack/react-query";
import { useContext, useState, type ReactNode } from "react";
import { api, unwrap } from "../../api/client";
import type { BoonEventOut, BoonOut, CharacterChoice } from "../../api/types";
import { partyIn } from "../../bonds";
import { disgracedText } from "../../boonStatus";
import {
  actionsFor,
  eventName,
  fieldName,
  gallantText,
  KINDS,
  kindName,
  LOSS_TEXT,
  owes,
  partyName,
  SETTLED,
  shortName,
  stateText,
  type BoonKind,
  type SettledHow,
} from "../../boons";
import { ActionMenu, MenuGroup, MenuItem } from "../../components/ActionMenu";
import { DateInput } from "../../components/DateInput";
import { SectionLabel } from "../../components/Headings";
import { Badge, Button, ErrorText, Field, Input, Loading, Select, Textarea } from "../../components/ui";
import { useDates } from "../../dates";
import { useAction } from "../../hooks";
import { useOnline } from "../../offline/connection";
import { ReviewPanel } from "./BoonReview";
import { HarpyMode, useAnyText } from "./boonKeeper";
import { WhoPicker } from "./WhoPicker";

/** A picked side ("c:<id>" or "name"), from a party the API sent. */
function picked(party: BoonOut["debtor"]): { who: string; name: string } {
  return party.character_id ? { who: `c:${party.character_id}`, name: "" } : { who: "name", name: party.name };
}

/** A boon's name, for its row and its detail: "Agnes owes Bram, minor". */
export function boonLabel(boon: BoonOut): string {
  return `${owes(boon)}, ${kindName(boon.kind).toLowerCase()}`;
}

/** Where a boon stands, and whether a flag on it waits for a ruling (#687). */
export function BoonMarks({ boon }: { boon: BoonOut }) {
  const state = stateText(boon);
  return (
    <span className="flex flex-wrap gap-1">
      {state && <Badge tone={boon.state === "void" ? "blood" : "mist"}>{state}</Badge>}
      {boon.flagged && <Badge tone="gold">Flagged</Badge>}
    </span>
  );
}

export const LEFT: Record<NonNullable<BoonOut["debtor"]["left"]>, string> = { dead: "Dead", off_field: "Off-field" };

type Doing = "edit" | "trade" | "pass" | "settle" | "void" | "reopen";

const ACTION_LABELS: Record<Doing, string> = {
  edit: "Edit",
  trade: "Trade",
  pass: "Pass on",
  settle: "Settle",
  void: "Make void",
  reopen: "Reopen",
};

// Set apart at the foot of the Actions menu.
const ENDS: Doing[] = ["void", "reopen"];

/**
 * How a boon's detail is laid out around it: its title ("Agnes owes Bram"), its
 * Actions menu (null when there is nothing its keeper may do), and the rest. A side
 * panel puts the first two in its header (#979).
 */
export type DetailFrame = (title: string, actions: ReactNode, body: ReactNode) => ReactNode;

/** In a list, such as the review queue: the menu above the rest, which its row names. */
const inline: DetailFrame = (_title, actions, body) => (
  <div className="mt-3 flex flex-col gap-3 border-t border-ash pt-3">
    {actions && <div className="flex justify-end">{actions}</div>}
    {body}
  </div>
);

/**
 * A boon in full (#979): what it is, where it stands and who registered it, then what
 * waits on a decision (its review, a status loss, Gallant), then its log. What its
 * keeper may do with it is in one Actions menu; choosing one shows its form at the
 * top. A Lesser Harpy sees only what the Harpy let them do, and none, no menu.
 */
export function BoonDetail({
  troupeId,
  boonId,
  characters,
  frame = inline,
}: {
  troupeId: string;
  boonId: string;
  characters: CharacterChoice[];
  frame?: DetailFrame;
}) {
  const harpy = useContext(HarpyMode);
  const dates = useDates();
  // Offline in the Play View, its actions can't be chosen (#985).
  const online = useOnline();
  const offline = harpy !== null && !online;
  const [doing, setDoing] = useState<Doing | null>(null);
  const boon = useQuery({
    queryKey: ["boon", troupeId, boonId],
    queryFn: () =>
      unwrap(
        api.GET("/api/troupes/{troupe_id}/boons/{boon_id}", {
          params: { path: { troupe_id: troupeId, boon_id: boonId } },
        }),
      ),
  });
  if (boon.isPending) return frame("Boon", null, <Loading />);
  if (boon.error) return frame("Boon", null, <ErrorText error={boon.error} />);
  const b = boon.data;
  const done = () => setDoing(null);
  // A Lesser Harpy sees only what the Harpy let them do (#984).
  const actions = actionsFor(b.state).filter((a) => !harpy || (a === "edit" ? harpy.edit : harpy.settle));
  const menu =
    actions.length === 0 ? null : (
      <ActionMenu label={`Actions: ${boonLabel(b)}`} trigger="Actions" menuClassName="w-44" disabled={offline}>
        <MenuGroup label="Change it">
          {actions
            .filter((a) => !ENDS.includes(a))
            .map((a) => (
              <MenuItem key={a} onSelect={() => setDoing(a)}>
                {ACTION_LABELS[a]}
              </MenuItem>
            ))}
        </MenuGroup>
        <MenuGroup label="Close or reopen it">
          {actions
            .filter((a) => ENDS.includes(a))
            .map((a) => (
              <MenuItem key={a} danger={a === "void"} onSelect={() => setDoing(a)}>
                {ACTION_LABELS[a]}
              </MenuItem>
            ))}
        </MenuGroup>
      </ActionMenu>
    );
  const sides = (["debtor", "creditor"] as const).map((side) => ({ side, party: b[side] }));
  const notes = sides.flatMap(({ side, party }) => sideNotes(party, side));
  const body = (
    <section aria-label={`Boon: ${boonLabel(b)}`} className="flex flex-col gap-4 text-sm">
      {doing === null ? null : doing === "edit" ? (
        <EditForm troupeId={troupeId} boon={b} characters={characters} onDone={done} />
      ) : doing === "trade" || doing === "pass" ? (
        <MoveForm troupeId={troupeId} boon={b} characters={characters} pass={doing === "pass"} onDone={done} />
      ) : doing === "settle" ? (
        <SettleForm troupeId={troupeId} boon={b} onDone={done} />
      ) : (
        <NoteForm troupeId={troupeId} boon={b} action={doing} onDone={done} />
      )}
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-gold">{kindName(b.kind)}</span>
        <span>{dates.day(b.made_on)}</span>
        <BoonMarks boon={b} />
      </p>
      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
        {sides.map(({ side, party }) => {
          // A side written as text, in full where elsewhere it is cut to a line (#990).
          if (party.character_id || shortName(party.name) === party.name) return null;
          return (
            <div key={side} className="contents">
              <dt className="text-mist">{side === "debtor" ? "Debtor" : "Creditor"}</dt>
              <dd className="whitespace-pre-line italic wrap-anywhere">{party.name}</dd>
            </div>
          );
        })}
        {b.reason && (
          <>
            <dt className="text-mist">Reason</dt>
            <dd className="wrap-anywhere whitespace-pre-line">{b.reason}</dd>
          </>
        )}
        {b.conditions && (
          <>
            <dt className="text-mist">Conditions</dt>
            <dd className="wrap-anywhere whitespace-pre-line">{b.conditions}</dd>
          </>
        )}
      </dl>
      {(notes.length > 0 || b.creditor_disgraced) && (
        <ul className="flex flex-col gap-1">
          {notes.map((n) => (
            <li key={n.key} className={n.blood ? "text-blood-bright" : "text-mist"}>
              {n.text}
            </li>
          ))}
          {b.creditor_disgraced && <li className="text-blood-bright">{disgracedText(partyName(b.creditor))}</li>}
        </ul>
      )}
      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
        <dt className="text-mist">Registered</dt>
        <dd>
          {dates.dateTime(b.submitted_at)}
          {b.submitted_by && <span className="text-mist"> by {b.submitted_by}</span>}
        </dd>
        {b.closed_at && (
          <>
            <dt className="text-mist">{b.state === "void" ? "Made void" : "Settled"}</dt>
            <dd>
              {dates.dateTime(b.closed_at)}
              {b.closed_note && <span className="text-mist"> · {b.closed_note}</span>}
            </dd>
          </>
        )}
        {b.notify_on_trade && (
          <>
            <dt className="text-mist">If traded</dt>
            <dd>Its debtor&apos;s player is told</dd>
          </>
        )}
        {b.staff_note && (
          <>
            <dt className="text-mist">Staff note</dt>
            <dd className="whitespace-pre-line">{b.staff_note}</dd>
          </>
        )}
      </dl>
      {/* What waits on a decision; offline in the Play View, it waits for a signal (#985). */}
      <fieldset disabled={offline} className="flex min-w-0 flex-col gap-4 empty:hidden">
        {(!harpy || harpy.review || harpy.edit) && (
          <ReviewPanel
            troupeId={troupeId}
            boon={b}
            characters={characters}
            review={!harpy || harpy.review}
            link={!harpy || harpy.role === "harpy" || harpy.edit}
          />
        )}
        {b.status_loss && (!harpy || harpy.settle) && <StatusLoss troupeId={troupeId} boon={b} />}
        {b.gallant && (!harpy || harpy.settle) && <GallantOffer troupeId={troupeId} boon={b} offer={b.gallant} />}
      </fieldset>
      <div>
        <SectionLabel as="h3">Its log</SectionLabel>
        <BoonLog boon={b} />
      </div>
    </section>
  );
  return frame(owes(b), menu, body);
}

/** What the detail notes about a side: that they have left, as far as it is known, or are a Boonbreaker (#717). */
function sideNotes(party: BoonOut["debtor"], side: "debtor" | "creditor"): { key: string; text: string; blood: boolean }[] {
  const who = `${shortName(party.name)}, the ${side},`;
  const notes = [];
  if (party.left) notes.push({ key: `${side}-left`, text: `${who} ${party.left === "dead" ? "is dead" : "is off-field"}.`, blood: false });
  if (party.boonbreaker) notes.push({ key: `${side}-boonbreaker`, text: `${who} is a Boonbreaker.`, blood: true });
  return notes;
}

// A reported boon that went straight in (#993): Horatio's line, done by no one.
const AUTOMATIC = "Accepted automatically";
const automatic = (e: BoonEventOut) => e.kind === "accepted" && !e.by && !e.as_character && e.note === AUTOMATIC;

/**
 * A boon's log, oldest first, as a timeline: what was done, when, by whom (as their
 * character, for a Harpy, a Lesser Harpy or a player), and the note. What each line
 * changed comes only to storytellers and assistant storytellers (the API leaves it
 * out for anyone else), as a before and after, marked as theirs alone.
 */
function BoonLog({ boon }: { boon: BoonOut }) {
  const dates = useDates();
  return (
    <ol aria-label={`Log of ${owes(boon)}`} className="mt-2 ml-1 flex flex-col gap-3 border-l border-ash pl-4 text-xs wrap-anywhere">
      {(boon.events ?? []).map((e) => (
        <li key={e.id} className="relative">
          <span aria-hidden className="absolute top-1 -left-[calc(1rem+4.5px)] size-2 rounded-full border border-ash bg-dusk" />
          <span className="text-parchment">{automatic(e) ? AUTOMATIC : eventName(e.kind)}</span>
          <span className="text-mist">
            {" "}
            · {dates.dateTime(e.at)}
            {e.by ? ` · ${e.by}${e.as_character ? ` as ${e.as_character}` : ""}` : e.as_character ? ` · ${e.as_character}` : ""}
          </span>
          {e.note && !automatic(e) && <span> · {e.note}</span>}
          {e.changes && e.changes.length > 0 && <Changes changes={e.changes} />}
        </li>
      ))}
    </ol>
  );
}

/**
 * What a line of the log changed, field by field: the old value struck through, the
 * new one beside it, or under it on a phone. Long text wraps.
 */
function Changes({ changes }: { changes: NonNullable<BoonEventOut["changes"]> }) {
  return (
    <div className="mt-1.5 flex flex-col gap-1.5 rounded-md border border-ash p-2">
      <Badge className="self-start">Staff only</Badge>
      <dl className="grid gap-x-3 gap-y-0.5 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]">
        {changes.map((c) => (
          <div key={c.field} className="contents">
            <dt className="text-mist max-sm:mt-1 max-sm:first:mt-0">
              {fieldName(c.field)}
              <span className="sr-only">: </span>
            </dt>
            <dd className="whitespace-pre-line">
              <del className="text-mist">{c.before || "(none)"}</del>
            </dd>
            <dd className="whitespace-pre-line">
              <span aria-hidden className="text-mist">
                {" → "}
              </span>
              <ins className="no-underline">{c.after || "(none)"}</ins>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * A major, blood or life boon its debtor formally ignored costs them status (p. 395):
 * staff, or the Harpy, take it with the status tools and say so here, or say they
 * won't. Never taken by itself (#717).
 */
function StatusLoss({ troupeId, boon }: { troupeId: string; boon: BoonOut }) {
  const [note, setNote] = useState("");
  const save = useAction(async (taken: boolean) => {
    await unwrap(
      api.POST("/api/troupes/{troupe_id}/boons/{boon_id}/status-loss", {
        ...boonPath(troupeId, boon),
        body: { taken, note },
      }),
    );
  });
  if (!boon.status_loss) return null;
  if (boon.status_loss !== "due") return <p className="text-sm text-mist">{LOSS_TEXT[boon.status_loss]}</p>;
  return (
    <div role="group" aria-label="Status for ignoring it" className="flex flex-col gap-2 rounded-md border border-blood/60 p-3 text-sm">
      <p>{LOSS_TEXT.due}</p>
      <Field label="Note (optional)" hint="Which status, say.">
        <Input maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <ErrorText error={save.error} />
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={save.isPending} onClick={() => save.mutate(true)}>
          Status taken
        </Button>
        <Button variant="ghost" disabled={save.isPending} onClick={() => save.mutate(false)}>
          No status taken
        </Button>
      </div>
    </div>
  );
}

export function FormButtons({ pending, ready, label, danger, onCancel }: { pending: boolean; ready: boolean; label: string; danger?: boolean; onCancel: () => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="submit" variant={danger ? "danger" : "primary"} disabled={pending || !ready}>
        {label}
      </Button>
      <Button type="button" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

function boonPath(troupeId: string, boon: BoonOut) {
  return { params: { path: { troupe_id: troupeId, boon_id: boon.id } } };
}

function EditForm({ troupeId, boon, characters, onDone }: { troupeId: string; boon: BoonOut; characters: CharacterChoice[]; onDone: () => void }) {
  const harpy = useContext(HarpyMode);
  const anyText = useAnyText();
  const [debtor, setDebtor] = useState(picked(boon.debtor));
  const [creditor, setCreditor] = useState(picked(boon.creditor));
  const [kind, setKind] = useState<BoonKind>(boon.kind);
  const [madeOn, setMadeOn] = useState(boon.made_on);
  const [reason, setReason] = useState(boon.reason);
  const [conditions, setConditions] = useState(boon.conditions);
  const [notify, setNotify] = useState(boon.notify_on_trade);
  const [staffNote, setStaffNote] = useState(boon.staff_note);
  const [note, setNote] = useState("");
  const d = partyIn(debtor.who, debtor.name);
  const c = partyIn(creditor.who, creditor.name);
  const save = useAction(async () => {
    if (!d || !c) return;
    await unwrap(
      api.PATCH("/api/troupes/{troupe_id}/boons/{boon_id}", {
        ...boonPath(troupeId, boon),
        body: {
          debtor: d,
          creditor: c,
          kind,
          made_on: madeOn,
          reason,
          conditions,
          notify_on_trade: notify,
          ...(harpy ? {} : { staff_note: staffNote }),
          note,
        },
      }),
    );
    onDone();
  });
  return (
    <form
      aria-label={`Edit: ${owes(boon)}`}
      className="flex flex-col gap-3 rounded-md border border-ash p-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(undefined);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Debtor">
          <WhoPicker characters={characters} who={debtor.who} name={debtor.name} anyText={anyText} onChange={(who, name) => setDebtor({ who, name })} />
        </Field>
        <Field label="Creditor">
          <WhoPicker characters={characters} who={creditor.who} name={creditor.name} anyText={anyText} onChange={(who, name) => setCreditor({ who, name })} />
        </Field>
        <Field label="Kind">
          <Select value={kind} onChange={(e) => setKind(e.target.value as BoonKind)}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date" hint="The in-game night it was made.">
          <DateInput required value={madeOn} onChange={(e) => setMadeOn(e.target.value)} />
        </Field>
      </div>
      <Field label="Reason">
        <Input maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <Field label="Conditions">
        <Input maxLength={2000} value={conditions} onChange={(e) => setConditions(e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
        Tell the debtor&apos;s player if it&apos;s traded
      </label>
      {!harpy && (
        <Field label="Staff note" hint="For storytellers and assistant storytellers only.">
          <Textarea rows={2} maxLength={2000} value={staffNote} onChange={(e) => setStaffNote(e.target.value)} />
        </Field>
      )}
      <Field label="Why the edit" hint="Goes in its log. What changed shows only to storytellers and assistant storytellers.">
        <Input maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <ErrorText error={save.error} />
      <FormButtons pending={save.isPending} ready={Boolean(d && c && madeOn && note.trim())} label="Save" onCancel={onDone} />
    </form>
  );
}

/** A trade, which gives the boon to a new creditor; or a passing on of either side, such as to a broodmate after a death. */
function MoveForm({
  troupeId,
  boon,
  characters,
  pass,
  onDone,
}: {
  troupeId: string;
  boon: BoonOut;
  characters: CharacterChoice[];
  pass: boolean;
  onDone: () => void;
}) {
  const anyText = useAnyText();
  const [side, setSide] = useState<"debtor" | "creditor">("debtor");
  const [to, setTo] = useState({ who: "", name: "" });
  const [note, setNote] = useState("");
  const target = partyIn(to.who, to.name);
  const save = useAction(async () => {
    if (!target) return;
    if (pass) {
      await unwrap(
        api.POST("/api/troupes/{troupe_id}/boons/{boon_id}/pass-on", {
          ...boonPath(troupeId, boon),
          body: { side, to: target, note },
        }),
      );
    } else {
      await unwrap(
        api.POST("/api/troupes/{troupe_id}/boons/{boon_id}/trade", {
          ...boonPath(troupeId, boon),
          body: { creditor: target, note },
        }),
      );
    }
    onDone();
  });
  return (
    <form
      aria-label={pass ? `Pass on: ${owes(boon)}` : `Trade: ${owes(boon)}`}
      className="flex flex-col gap-3 rounded-md border border-ash p-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(undefined);
      }}
    >
      {pass ? (
        <fieldset className="flex flex-wrap gap-4 text-sm">
          <legend className="mb-1 text-mist">Whose side passes on</legend>
          {(["debtor", "creditor"] as const).map((s) => (
            <label key={s} className="flex items-center gap-2">
              <input type="radio" name={`side-${boon.id}`} checked={side === s} onChange={() => setSide(s)} />
              {s === "debtor" ? `${shortName(boon.debtor.name)}'s, the debtor's` : `${shortName(boon.creditor.name)}'s, the creditor's`}
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="text-sm text-mist">
          {shortName(boon.creditor.name)} trades it: the new creditor holds it, and its log keeps the trade.
          {boon.notify_on_trade && " Its debtor's player is told."}
        </p>
      )}
      <Field label={pass ? "Passes on to" : "Traded to"}>
        <WhoPicker characters={characters} who={to.who} name={to.name} anyText={anyText} onChange={(who, name) => setTo({ who, name })} />
      </Field>
      <Field label="Note (optional)">
        <Input maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <ErrorText error={save.error} />
      <FormButtons pending={save.isPending} ready={Boolean(target)} label={pass ? "Pass it on" : "Record the trade"} onCancel={onDone} />
    </form>
  );
}

function SettleForm({ troupeId, boon, onDone }: { troupeId: string; boon: BoonOut; onDone: () => void }) {
  const [how, setHow] = useState<SettledHow>("called_in");
  const [note, setNote] = useState("");
  const save = useAction(async () => {
    await unwrap(
      api.POST("/api/troupes/{troupe_id}/boons/{boon_id}/settle", {
        ...boonPath(troupeId, boon),
        body: { how, note },
      }),
    );
    onDone();
  });
  return (
    <form
      aria-label={`Settle: ${owes(boon)}`}
      className="flex flex-col gap-3 rounded-md border border-ash p-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(undefined);
      }}
    >
      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="mb-1 text-mist">How it was settled</legend>
        {SETTLED.map((s) => (
          <label key={s.value} className="flex items-start gap-2">
            <input type="radio" className="mt-1" name={`how-${boon.id}`} checked={how === s.value} onChange={() => setHow(s.value)} />
            <span>
              {s.label}
              <span className="block text-xs text-mist">{s.meaning}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <Field label="Note (optional)" hint="What it was called in for, say.">
        <Input maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <ErrorText error={save.error} />
      <FormButtons pending={save.isPending} ready label="Settle it" onCancel={onDone} />
    </form>
  );
}

/** Gallant offered for a repaid boon's debtor (#693): staff give it or not, once. */
function GallantOffer({ troupeId, boon, offer }: { troupeId: string; boon: BoonOut; offer: NonNullable<BoonOut["gallant"]> }) {
  const [note, setNote] = useState("");
  const answer = useAction(async (give: boolean) => {
    await unwrap(
      api.POST("/api/troupes/{troupe_id}/boons/{boon_id}/gallant", {
        ...boonPath(troupeId, boon),
        body: { give, note },
      }),
    );
  });
  return (
    <section aria-label="Gallant offered" className="flex flex-col gap-2 rounded-md border border-gold/60 bg-gold/10 p-3 text-sm">
      <p>{gallantText(offer)}</p>
      <Field label="Note (optional)" hint="It goes in the boon's log.">
        <Input maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <ErrorText error={answer.error} />
      <div className="flex flex-wrap gap-2">
        <Button disabled={answer.isPending} onClick={() => answer.mutate(true)}>
          Give Gallant
        </Button>
        <Button variant="ghost" disabled={answer.isPending} onClick={() => answer.mutate(false)}>
          Not this time
        </Button>
      </div>
    </section>
  );
}

function NoteForm({ troupeId, boon, action, onDone }: { troupeId: string; boon: BoonOut; action: "void" | "reopen"; onDone: () => void }) {
  const [note, setNote] = useState("");
  const save = useAction(async () => {
    const path = boonPath(troupeId, boon);
    if (action === "void")
      await unwrap(
        api.POST("/api/troupes/{troupe_id}/boons/{boon_id}/void", {
          ...path,
          body: { note },
        }),
      );
    else
      await unwrap(
        api.POST("/api/troupes/{troupe_id}/boons/{boon_id}/reopen", {
          ...path,
          body: { note },
        }),
      );
    onDone();
  });
  return (
    <form
      aria-label={`${ACTION_LABELS[action]}: ${owes(boon)}`}
      className="flex flex-col gap-3 rounded-md border border-ash p-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(undefined);
      }}
    >
      <Field label="Why" hint={action === "void" ? "Entered by mistake, say. It stays in the ledger as void." : "It stands again: settled by mistake, say."}>
        <Input maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <ErrorText error={save.error} />
      <FormButtons
        pending={save.isPending}
        ready={Boolean(note.trim())}
        label={action === "void" ? "Make it void" : "Reopen it"}
        danger={action === "void"}
        onCancel={onDone}
      />
    </form>
  );
}
