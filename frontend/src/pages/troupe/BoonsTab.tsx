import { useQuery } from "@tanstack/react-query";
import { useContext, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { api, unwrap } from "../../api/client";
import type { BoonOut, CharacterChoice } from "../../api/types";
import { BOON_PAGE, kindName, stateText } from "../../boons";
import { DataTable, type Column } from "../../components/DataTable";
import { Pager } from "../../components/Pager";
import { SortHeading } from "../../components/SortHeading";
import { useWidePage } from "../../components/widePage";
import { Badge, Button, Card, Empty, ErrorText, Loading } from "../../components/ui";
import { useDates } from "../../dates";
import { AuditsCard } from "./BoonAudits";
import { BoonDetail, boonLabel, BoonMarks, LEFT } from "./BoonDetail";
import { QuickEntry } from "./BoonEntry";
import { BoonExportMenu } from "./BoonExport";
import { Boonbreakers } from "./Boonbreakers";
import { HarpyMode, type LedgerKeeper } from "./boonKeeper";
import { BoonReviewQueue } from "./BoonReview";
import { ledgerQuery, narrowed, readLedger, sortBy, writeLedger, type LedgerSearch, type LedgerSort } from "./boonSearch";
import { BoonToolbar } from "./BoonToolbar";
import { BoonTotals } from "./BoonTotals";

export type { LedgerKeeper } from "./boonKeeper";

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
          // Exports (#986): this view, or the whole ledger; the Harpy's where the troupe lets them (#987).
          end={(!harpy || harpy.export) && <BoonExportMenu troupeId={troupeId} query={reviewing ? null : query} />}
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

