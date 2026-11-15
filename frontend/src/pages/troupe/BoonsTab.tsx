import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { api, unwrap } from "../../api/client";
import type { BoonOut, CharacterChoice } from "../../api/types";
import { partyIn } from "../../bonds";
import { disgracedText } from "../../boonStatus";
import {
  actionsFor,
  ANY_TEXT_HINT,
  BOON_PAGE,
  changeText,
  emptyRow,
  eventName,
  gallantText,
  KINDS,
  kindName,
  LONGEST_NAME,
  LONGEST_TEXT,
  LOSS_TEXT,
  owes,
  partyName,
  rowStarted,
  rowsTotal,
  SETTLED,
  shortName,
  stateText,
  type BoonKind,
  type EntryRow,
  type SettledHow,
} from "../../boons";
import { DataTable, type Column } from "../../components/DataTable";
import { DateInput } from "../../components/DateInput";
import { SectionLabel } from "../../components/Headings";
import { Pager } from "../../components/Pager";
import { SortHeading } from "../../components/SortHeading";
import { useToast } from "../../components/Toast";
import { useWidePage } from "../../components/widePage";
import { Badge, Button, Card, Empty, ErrorText, Field, Input, Loading, Select, Textarea } from "../../components/ui";
import { useDates } from "../../dates";
import { useAction } from "../../hooks";
import { AuditsCard } from "./BoonAudits";
import { BoonExportMenu } from "./BoonExport";
import { Boonbreakers } from "./Boonbreakers";
import { BoonReviewQueue, ReviewPanel } from "./BoonReview";
import { ledgerQuery, narrowed, readLedger, sortBy, writeLedger, type LedgerSearch, type LedgerSort } from "./boonSearch";
import { BoonToolbar } from "./BoonToolbar";
import { BoonTotals } from "./BoonTotals";
import { WhoPicker } from "./WhoPicker";

/**
 * Who keeps the ledger, and how far they reach: its running staff (null), or a Harpy
 * (#688) or a Lesser Harpy (#689), working as their character from the Play View. A
 * Harpy has the review queue only or the full ledger; a Lesser Harpy sees the ledger
 * and does what the Harpy let them. Neither sees or writes a boon's staff note.
 */
export type LedgerKeeper = {
  access: "submissions" | "full";
  role: "harpy" | "talon";
  add: boolean;
  // Correct boons: edit what one says, and link a name to a character (#984).
  edit: boolean;
  // Settle and move boons: trade, pass on, settle, void and reopen them, and answer a
  // status loss or Gallant (#984).
  settle: boolean;
  review: boolean;
  // Audit a character's boons (#690).
  audit: boolean;
  // One of the troupe's Lesser Harpies, as it calls them: "Lesser Harpy" or "Talon".
  word: string;
};
const HarpyMode = createContext<LedgerKeeper | null>(null);

function today(dates: ReturnType<typeof useDates>) {
  return dates.toInput(new Date()).slice(0, 10);
}

/**
 * A side written as text in the boon forms (#990): staff write up to LONGEST_TEXT, a
 * Harpy or a talon LONGEST_NAME, as the API allows them.
 */
function useAnyText() {
  const harpy = useContext(HarpyMode);
  return { longest: harpy ? LONGEST_NAME : LONGEST_TEXT, hint: ANY_TEXT_HINT };
}

/** A picked side ("c:<id>" or "name"), from a party the API sent. */
function picked(party: BoonOut["debtor"]): { who: string; name: string } {
  return party.character_id ? { who: `c:${party.character_id}`, name: "" } : { who: "name", name: party.name };
}

/**
 * The troupe's boon ledger, for its running staff (#685): every boon, by view (open,
 * departed, settled, void, all), narrowed to a character or a name, a kind, or a span
 * of nights. Staff register boons, a whole game's at once, and open one to edit,
 * trade, pass on, settle, void or reopen it, each with its own log. Only shown while
 * the troupe keeps a ledger. Boons waiting for review, or flagged, are listed under
 * "To review" (#687), and each boon's detail has its review.
 */
export function BoonsTab({ troupeId, harpy = null }: { troupeId: string; harpy?: LedgerKeeper | null }) {
  return (
    <HarpyMode.Provider value={harpy}>{harpy?.access === "submissions" ? <ReviewOnly troupeId={troupeId} /> : <Ledger troupeId={troupeId} />}</HarpyMode.Provider>
  );
}

/** A Harpy given only the review queue (#688): the boons waiting for review or flagged, nothing else of the ledger. */
function ReviewOnly({ troupeId }: { troupeId: string }) {
  const review = useQuery({
    queryKey: ["boon-review", troupeId],
    queryFn: () => unwrap(api.GET("/api/troupes/{troupe_id}/boon-review", { params: { path: { troupe_id: troupeId } } })),
  });
  if (review.isPending) return <Loading />;
  if (review.error) return <ErrorText error={review.error} />;
  const characters = review.data.characters ?? [];
  return (
    <div className="flex flex-col gap-4">
      <Card title="To review">
        <p className="text-sm text-mist">
          Boons players reported that wait for review, and boons flagged for a ruling ({BOON_PAGE}). Accept each one, or don&apos;t, with a reason its player
          sees; link a name to a character; clear a flag. The rest of the ledger is staff&apos;s.
        </p>
      </Card>
      <BoonReviewQueue troupeId={troupeId} detail={(boonId) => <BoonDetail troupeId={troupeId} boonId={boonId} characters={characters} />} />
    </div>
  );
}

// A page of the ledger (#978): the boons the API sends at a time.
const PAGE = 100;

function Ledger({ troupeId }: { troupeId: string }) {
  const harpy = useContext(HarpyMode);
  // Room for the table at 1280 px and up (#975).
  useWidePage();
  const [params, setParams] = useSearchParams();
  // The page, from 1, in the URL as ?page= so a reload or a link keeps it (#978).
  const page = Math.max(1, Math.floor(Number(params.get("page"))) || 1);
  const setPage = (to: number, replace = false) =>
    setParams(
      (now) => {
        const next = new URLSearchParams(now);
        if (to > 1) next.set("page", String(to));
        else next.delete("page");
        return next;
      },
      { replace },
    );
  // The search, view, kinds, filters and order, in the URL too (#976). A change starts
  // again from the first page.
  const search = readLedger(params);
  const update = (change: Partial<LedgerSearch>) => setParams((now) => writeLedger(now, { ...readLedger(now), ...change }), { replace: true });
  const reviewing = search.view === "review";
  // The top of the list, brought back into sight when paging from its foot.
  const top = useRef<HTMLDivElement>(null);
  const [adding, setAdding] = useState(false);
  const query = { ...ledgerQuery(search), limit: PAGE, offset: (page - 1) * PAGE };
  const ledger = useQuery({
    queryKey: ["troupe-boons", troupeId, query],
    queryFn: () =>
      unwrap(
        api.GET("/api/troupes/{troupe_id}/boons", {
          params: { path: { troupe_id: troupeId }, query },
        }),
      ),
    placeholderData: (previous) => previous,
  });
  // Who may be named on a boon: read once, not with every page (#978).
  const choices = useQuery({
    queryKey: ["boon-characters", troupeId],
    queryFn: () => unwrap(api.GET("/api/troupes/{troupe_id}/boon-characters", { params: { path: { troupe_id: troupeId } } })),
  });
  const reviews = !harpy || harpy.review;
  const review = useQuery({
    queryKey: ["boon-review", troupeId],
    queryFn: () => unwrap(api.GET("/api/troupes/{troupe_id}/boon-review", { params: { path: { troupe_id: troupeId } } })),
    enabled: reviews,
  });
  const toReview = review.data?.boons.length ?? 0;
  // The troupe's games, for "At a game": staff's, as with registering at one.
  const games = useQuery({
    queryKey: ["boon-games", troupeId],
    queryFn: () => unwrap(api.GET("/api/troupes/{troupe_id}/boon-games", { params: { path: { troupe_id: troupeId } } })),
    enabled: !harpy,
  });
  // Past the last page (boons settled, or an old link): go to the last there is.
  const total = ledger.data?.total ?? 0;
  const past = ledger.isSuccess && !ledger.isPlaceholderData && page > 1 && (page - 1) * PAGE >= total;
  useEffect(() => {
    if (past) setPage(Math.max(1, Math.ceil(total / PAGE)), true);
  });
  if (ledger.isPending || choices.isPending) return <Loading />;
  if (ledger.error) return <ErrorText error={ledger.error} />;
  if (choices.error) return <ErrorText error={choices.error} />;
  const { boons, counts, totals } = ledger.data;
  const characters = choices.data;
  const sorting = (label: string, by: LedgerSort): Pick<Column<BoonOut>, "header" | "label" | "sort"> => {
    const way = search.sort === by ? (search.direction === "asc" ? "ascending" : "descending") : undefined;
    return { header: <SortHeading label={label} sort={way} onSort={() => update(sortBy(search, by))} />, label, sort: way };
  };
  const turn = (to: number) => {
    setPage(to);
    const list = top.current;
    if (list && list.getBoundingClientRect().top < 0) list.scrollIntoView({ block: "start" });
  };

  return (
    <div className="flex flex-col gap-4">
      <Card
        title="Boon ledger"
        actions={
          !adding &&
          (!harpy || harpy.add) && (
            <Button variant="secondary" onClick={() => setAdding(true)}>
              Register boons
            </Button>
          )
        }
      >
        <p className="text-sm text-mist">
          The debts characters owe each other, registered with the Harpy ({BOON_PAGE}). Each boon keeps its own log; an edit&apos;s changes show only to
          storytellers and assistant storytellers. A boon made off the record isn&apos;t tracked here.
          {harpy?.role === "harpy" && " You keep it as the troupe's Harpy: what you do is logged as your character. An NPC you can't pick is named by name, for staff to link."}
          {harpy?.role === "talon" &&
            ` You keep it as a ${harpy.word} of the troupe, as far as the Harpy lets you: what you do is logged as your character. An NPC you can't pick is named by name, for staff to link.`}
        </p>
        {adding && <QuickEntry troupeId={troupeId} characters={characters} onDone={() => setAdding(false)} />}
      </Card>

      {(!harpy || harpy.role === "harpy") && <Boonbreakers troupeId={troupeId} characters={characters} />}

      <div ref={top} className="flex scroll-mt-4 flex-col gap-3">
        <BoonTotals totals={totals} toReview={reviews ? toReview : null} search={search} show={update} />
        <BoonToolbar
          search={search}
          update={update}
          counts={counts}
          toReview={reviews ? toReview : null}
          characters={characters}
          games={games.data ?? []}
          // Staff's exports (#986): this view, or the whole ledger.
          end={!harpy && <BoonExportMenu troupeId={troupeId} query={reviewing ? null : query} />}
        />
      </div>

      {reviewing ? (
        <BoonReviewQueue troupeId={troupeId} detail={(boonId) => <BoonDetail troupeId={troupeId} boonId={boonId} characters={characters} />} />
      ) : total === 0 ? (
        <Empty>{narrowed(search) ? "No boons match." : search.view === "open" ? "No open boons yet." : "None here."}</Empty>
      ) : (
        <>
          <BoonTable key={search.view} troupeId={troupeId} boons={boons} characters={characters} busy={ledger.isPlaceholderData} sorting={sorting} />
          <Pager label="Pages of boons" page={page} size={PAGE} shown={boons.length} total={total} onPage={turn} />
        </>
      )}

      {(!harpy || harpy.audit) && <AuditsCard troupeId={troupeId} inPlay={!!harpy} />}
    </div>
  );
}

/** A boon's name, for its row and its detail: "Agnes owes Bram, minor". */
function boonLabel(boon: BoonOut): string {
  return `${owes(boon)}, ${kindName(boon.kind).toLowerCase()}`;
}

/**
 * The ledger's boons, one line each (#975), as the troupe's old sheet has them: who
 * owes whom, the kind, the night, the reason, and where it stands. A click on a row
 * opens its detail under it. On a phone each row folds to "Debtor owes Creditor",
 * then its kind, night and reason.
 */
function BoonTable({
  troupeId,
  boons,
  characters,
  busy,
  sorting,
}: {
  troupeId: string;
  boons: BoonOut[];
  characters: CharacterChoice[];
  busy: boolean;
  // A column's heading, which sorts by it (#976).
  sorting: (label: string, by: LedgerSort) => Pick<Column<BoonOut>, "header" | "label" | "sort">;
}) {
  const dates = useDates();
  const columns: Column<BoonOut>[] = [
    {
      key: "debtor",
      ...sorting("Debtor", "debtor"),
      phone: "title",
      cell: (b) => (
        <span className="flex flex-wrap items-center gap-x-1.5">
          <PartyName party={b.debtor} />
          {/* A phone's first line has the creditor too: "Agnes owes Bram". */}
          <span className="text-mist lg:hidden">owes</span>
          <span className="flex max-w-full min-w-0 lg:hidden">
            <PartyName party={b.creditor} disgraced={b.creditor_disgraced} />
          </span>
        </span>
      ),
    },
    { key: "creditor", ...sorting("Creditor", "creditor"), phone: "detail", cell: (b) => <PartyName party={b.creditor} disgraced={b.creditor_disgraced} /> },
    { key: "kind", ...sorting("Kind", "kind"), phone: "shown", bare: true, cell: (b) => <span className="whitespace-nowrap text-gold">{kindName(b.kind)}</span> },
    { key: "date", ...sorting("Date", "date"), phone: "shown", bare: true, cell: (b) => <span className="whitespace-nowrap">{dates.day(b.made_on)}</span> },
    {
      key: "reason",
      header: "Reason",
      phone: "shown",
      bare: true,
      // The rest of the width, each line cut to fit; the detail has them in full.
      className: "w-full max-w-0",
      cell: (b) => (
        <>
          <span className="block truncate text-mist" title={b.reason || undefined}>
            {b.reason}
          </span>
          {b.conditions && (
            <span className="block truncate text-xs text-mist" title={b.conditions}>
              Conditions: {b.conditions}
            </span>
          )}
        </>
      ),
      folded: (b) =>
        b.reason ? (
          <span className="block truncate text-mist" title={b.reason}>
            {b.reason}
          </span>
        ) : null,
    },
    {
      key: "state",
      header: "State",
      phone: "shown",
      bare: true,
      cell: (b) => <BoonMarks boon={b} />,
      folded: (b) => (stateText(b) || b.flagged ? <BoonMarks boon={b} /> : null),
    },
  ];
  return (
    <DataTable
      label="Boons"
      columns={columns}
      rows={boons}
      rowKey={(b) => b.id}
      rowLabel={boonLabel}
      stackBelow="lg"
      dense
      busy={busy}
      className={busy ? "opacity-60" : ""}
      expand={{
        label: (b) => `Details: ${boonLabel(b)}`,
        wholeRow: true,
        render: (b) => (
          <section aria-label={`Boon: ${boonLabel(b)}`}>
            <BoonDetail troupeId={troupeId} boonId={b.id} characters={characters} />
          </section>
        ),
      }}
    />
  );
}

/** Where a boon stands, and whether a flag on it waits for a ruling (#687). */
function BoonMarks({ boon }: { boon: BoonOut }) {
  const state = stateText(boon);
  return (
    <span className="flex flex-wrap gap-1">
      {state && <Badge tone={boon.state === "void" ? "blood" : "mist"}>{state}</Badge>}
      {boon.flagged && <Badge tone="gold">Flagged</Badge>}
    </span>
  );
}

const LEFT: Record<NonNullable<BoonOut["debtor"]["left"]>, string> = { dead: "Dead", off_field: "Off-field" };

/**
 * A side of a boon on one line, its name cut to fit: in italics for a name only,
 * someone not in Horatio; with a quiet mark for one who is dead or off-field (as the
 * court knows it, for a Harpy); marked when they're a Boonbreaker (#717), or, as
 * the creditor, Disgraced (the sentence is in the detail).
 */
function PartyName({ party, disgraced = false }: { party: BoonOut["debtor"]; disgraced?: boolean }) {
  return (
    <span className="flex max-w-full min-w-0 items-center gap-1">
      <span className={`max-w-full min-w-0 truncate text-parchment lg:max-w-48 ${party.character_id ? "" : "italic"}`} title={party.name}>
        {party.name}
      </span>
      {party.left && <Badge className="shrink-0">{LEFT[party.left]}</Badge>}
      {party.boonbreaker && (
        <Badge tone="blood" className="shrink-0">
          Boonbreaker
        </Badge>
      )}
      {disgraced && (
        <Badge tone="blood" className="shrink-0">
          Disgraced
        </Badge>
      )}
    </span>
  );
}

type Doing = "edit" | "trade" | "pass" | "settle" | "void" | "reopen";

const ACTION_LABELS: Record<Doing, string> = {
  edit: "Edit",
  trade: "Trade",
  pass: "Pass on",
  settle: "Settle",
  void: "Make void",
  reopen: "Reopen",
};

function BoonDetail({ troupeId, boonId, characters }: { troupeId: string; boonId: string; characters: CharacterChoice[] }) {
  const harpy = useContext(HarpyMode);
  const dates = useDates();
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
  if (boon.isPending) return <Loading />;
  if (boon.error) return <ErrorText error={boon.error} />;
  const b = boon.data;
  const done = () => setDoing(null);
  // A Lesser Harpy sees only what the Harpy let them do (#984).
  const actions = actionsFor(b.state).filter((a) => !harpy || (a === "edit" ? harpy.edit : harpy.settle));
  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-ash pt-3">
      {b.creditor_disgraced && <p className="text-sm text-blood-bright">{disgracedText(partyName(b.creditor))}</p>}
      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
        {(["debtor", "creditor"] as const).map((side) => {
          const party = b[side];
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
        <dt className="text-mist">Registered</dt>
        <dd>
          {dates.dateTime(b.submitted_at)}
          {b.submitted_by && <span className="text-mist"> by {b.submitted_by}</span>}
        </dd>
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
        {b.closed_at && (
          <>
            <dt className="text-mist">{b.state === "void" ? "Made void" : "Settled"}</dt>
            <dd>
              {dates.dateTime(b.closed_at)}
              {b.closed_note && <span className="text-mist"> · {b.closed_note}</span>}
            </dd>
          </>
        )}
      </dl>
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
      {actions.length === 0 ? null : doing === null ? (
        <div role="group" aria-label="What to do with it" className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <Button key={a} variant={a === "void" ? "ghost" : "secondary"} onClick={() => setDoing(a)}>
              {ACTION_LABELS[a]}
            </Button>
          ))}
        </div>
      ) : doing === "edit" ? (
        <EditForm troupeId={troupeId} boon={b} characters={characters} onDone={done} />
      ) : doing === "trade" || doing === "pass" ? (
        <MoveForm troupeId={troupeId} boon={b} characters={characters} pass={doing === "pass"} onDone={done} />
      ) : doing === "settle" ? (
        <SettleForm troupeId={troupeId} boon={b} onDone={done} />
      ) : (
        <NoteForm troupeId={troupeId} boon={b} action={doing} onDone={done} />
      )}
      <div>
        <SectionLabel as="h4">Its log</SectionLabel>
        <ol aria-label={`Log of ${owes(b)}`} className="mt-1 flex flex-col gap-1 text-xs wrap-anywhere">
          {(b.events ?? []).map((e) => (
            <li key={e.id}>
              <span className="text-parchment">{eventName(e.kind)}</span>
              <span className="text-mist">
                {" "}
                · {dates.dateTime(e.at)}
                {e.by ? ` · ${e.by}${e.as_character ? ` as ${e.as_character}` : ""}` : e.as_character ? ` · ${e.as_character}` : ""}
              </span>
              {e.note && <span> · {e.note}</span>}
              {e.changes && e.changes.length > 0 && (
                <ul className="ml-3 text-mist">
                  {e.changes.map((c) => (
                    <li key={c.field}>{changeText(c)}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </div>
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

function FormButtons({ pending, ready, label, danger, onCancel }: { pending: boolean; ready: boolean; label: string; danger?: boolean; onCancel: () => void }) {
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

/**
 * Register boons: one, or a whole game's at once. Each row is a boon, made as many
 * times as its count ("1 of 3", "2 of 3"...); rows left untouched are skipped. All
 * register together, or none do.
 */
function QuickEntry({ troupeId, characters, onDone }: { troupeId: string; characters: CharacterChoice[]; onDone: () => void }) {
  const harpy = useContext(HarpyMode);
  const anyText = useAnyText();
  const dates = useDates();
  const toast = useToast();
  const [madeOn, setMadeOn] = useState(today(dates));
  const [rows, setRows] = useState<EntryRow[]>([emptyRow(today(dates))]);
  const [note, setNote] = useState("");
  const [gameId, setGameId] = useState("");
  // The troupe's recent games, for the statistics' activity per game (#702).
  const games = useQuery({
    queryKey: ["boon-games", troupeId],
    queryFn: () => unwrap(api.GET("/api/troupes/{troupe_id}/boon-games", { params: { path: { troupe_id: troupeId } } })),
    // The games come with the standings, which are staff's (a Harpy's are a follow-up to #688).
    enabled: !harpy,
  });
  const set = (i: number, change: Partial<EntryRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...change } : r)));
  const started = rows.filter(rowStarted);
  const parts = started.map((r) => ({
    row: r,
    debtor: partyIn(r.debtor.who, r.debtor.name),
    creditor: partyIn(r.creditor.who, r.creditor.name),
  }));
  const ready = parts.length > 0 && parts.every((p) => p.debtor && p.creditor && p.row.made_on);
  const total = rowsTotal(rows);
  const save = useAction(async () => {
    const body = parts.map(({ row, debtor, creditor }) => ({
      debtor: debtor!,
      creditor: creditor!,
      kind: row.kind,
      made_on: row.made_on,
      reason: row.reason,
      conditions: row.conditions,
      notify_on_trade: row.notify_on_trade,
      staff_note: "",
      count: Math.max(1, row.count || 1),
    }));
    const made = await unwrap(
      api.POST("/api/troupes/{troupe_id}/boons", {
        params: { path: { troupe_id: troupeId } },
        body: { boons: body, note, game_id: gameId || null },
      }),
    );
    toast({
      message: made.length === 1 ? "Registered a boon." : `Registered ${made.length} boons.`,
    });
    onDone();
  });
  return (
    <form
      aria-label="Register boons"
      className="mt-3 flex flex-col gap-3 border-t border-ash pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(undefined);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date for new rows" hint="The in-game night: each row can have its own.">
          <DateInput
            value={madeOn}
            onChange={(e) => {
              const next = e.target.value;
              // Rows still on the old date move with it.
              setRows(rows.map((r) => (r.made_on === madeOn ? { ...r, made_on: next } : r)));
              setMadeOn(next);
            }}
          />
        </Field>
        <Field label="Where they come from (optional)" hint="Goes in each boon's log: “Elysium, 3 October”.">
          <Input maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {(games.data?.length ?? 0) > 0 && (
          <Field label="At a game (optional)" hint="The game they were made at, for the statistics' boons at each game.">
            <Select value={gameId} onChange={(e) => setGameId(e.target.value)}>
              <option value="">Not at a game</option>
              {games.data!.map((g) => (
                <option key={g.id} value={g.id}>
                  {dates.dateTime(g.starts_at)}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      <ol className="flex flex-col gap-3">
        {rows.map((row, i) => (
          <li key={i} aria-label={`Boon ${i + 1}`} className="flex flex-col gap-2 rounded-md border border-ash p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Debtor" hint="Who owes it.">
                <WhoPicker
                  characters={characters}
                  who={row.debtor.who}
                  name={row.debtor.name}
                  anyText={anyText}
                  onChange={(who, name) => set(i, { debtor: { who, name } })}
                />
              </Field>
              <Field label="Creditor" hint="Who it's owed to.">
                <WhoPicker
                  characters={characters}
                  who={row.creditor.who}
                  name={row.creditor.name}
                  anyText={anyText}
                  onChange={(who, name) => set(i, { creditor: { who, name } })}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_6rem]">
              <Field label="Kind">
                <Select value={row.kind} onChange={(e) => set(i, { kind: e.target.value as BoonKind })}>
                  {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Date">
                <DateInput required value={row.made_on} onChange={(e) => set(i, { made_on: e.target.value })} />
              </Field>
              <Field label="How many">
                <Input type="number" min={1} max={20} value={row.count} onChange={(e) => set(i, { count: Number(e.target.value) })} />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Reason">
                <Input maxLength={2000} value={row.reason} onChange={(e) => set(i, { reason: e.target.value })} />
              </Field>
              <Field label="Conditions">
                <Input maxLength={2000} value={row.conditions} placeholder="Cannot be traded" onChange={(e) => set(i, { conditions: e.target.value })} />
              </Field>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={row.notify_on_trade} onChange={(e) => set(i, { notify_on_trade: e.target.checked })} />
                Tell the debtor&apos;s player if it&apos;s traded
              </label>
              {rows.length > 1 && (
                <Button type="button" variant="ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                  Remove
                </Button>
              )}
            </div>
          </li>
        ))}
      </ol>
      <div>
        <Button type="button" variant="secondary" onClick={() => setRows([...rows, emptyRow(madeOn)])}>
          Add a row
        </Button>
      </div>
      <ErrorText error={save.error} />
      <FormButtons pending={save.isPending} ready={ready} label={total <= 1 ? "Register the boon" : `Register ${total} boons`} onCancel={onDone} />
    </form>
  );
}
