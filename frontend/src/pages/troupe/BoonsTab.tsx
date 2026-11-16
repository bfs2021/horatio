import { useQueries, useQuery, type Query, type QueryKey } from "@tanstack/react-query";
import { Fragment, useContext, useEffect, useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import { api, unwrap } from "../../api/client";
import type { BoonGameOut, BoonOut, TroupeBoonsOut } from "../../api/types";
import { BOON_PAGE, kindName, stateText, type BoonView } from "../../boons";
import { weight } from "../../boonStandings";
import { DataTable, type Column, type DataGroup } from "../../components/DataTable";
import { InfoButton } from "../../components/InfoButton";
import { Pager } from "../../components/Pager";
import { SidePanel, useSideBySide } from "../../components/SidePanel";
import { SortHeading } from "../../components/SortHeading";
import { SectionLabel } from "../../components/Headings";
import { useWidePage } from "../../components/widePage";
import { Badge, Empty, ErrorText, Loading } from "../../components/ui";
import { useDates } from "../../dates";
import { useOnline } from "../../offline/connection";
import { BoonDetail, boonLabel, BoonMarks, LEFT } from "./BoonDetail";
import { RegisterBoons, type Reveal } from "./BoonEntry";
import { BoonExportMenu } from "./BoonExport";
import { HarpyMode, keeperNote, type LedgerKeeper } from "./boonKeeper";
import { groupBoons, OPEN_GROUPS, type BoonGroup } from "./boonGroups";
import {
  GROUP_MOST,
  ledgerQuery,
  narrowed,
  onParty,
  PAGES,
  partyOf,
  readLedger,
  showing,
  shows,
  sideGroup,
  sideSort,
  sortBy,
  writeLedger,
  type BoonSide,
  type LedgerSearch,
  type LedgerSort,
} from "./boonSearch";
import { BoonPartyHeader } from "./BoonParty";
import { BoonToolbar } from "./BoonToolbar";
import { BoonTotals } from "./BoonTotals";

export type { LedgerKeeper } from "./boonKeeper";

const count = new Intl.NumberFormat("en-GB");

/**
 * The troupe's boon ledger, for its running staff (#685): every boon, by view (open,
 * departed, settled, void, all), narrowed to a character or a name, a kind, or a span
 * of nights. Staff register boons, a whole game's at once, and open one to edit,
 * trade, pass on, settle, void or reopen it, each with its own log. Only shown while
 * the troupe keeps a ledger. Boons waiting for review, or flagged, are under the To
 * review tab (#687, #982), at `review`, and each boon's detail has its review; an old
 * link to the ledger's "To review" view (`?view=review`) goes there.
 */
export function BoonsTab({ troupeId, harpy = null, review }: { troupeId: string; harpy?: LedgerKeeper | null; review?: string }) {
  const [params] = useSearchParams();
  if (review && params.get("view") === "review") return <Navigate to={review} replace />;
  return (
    <HarpyMode.Provider value={harpy}>
      <Ledger troupeId={troupeId} reviewTo={review} />
    </HarpyMode.Provider>
  );
}

// A page of the ledger (#978): the boons the API sends at a time.
const PAGE = 100;

/**
 * A list of the ledger's boons, with its page in the URL (`page`): the whole ledger's,
 * or on a party's own page (#980) one of its two sections, what they owe (as the
 * debtor) and what they are owed (as the creditor), each with a page of its own.
 */
type Section = { page: string; side?: BoonSide; label?: string };
const WHOLE: Section[] = [{ page: PAGES.ledger }];
const PARTY: Section[] = [
  { page: PAGES.debtor, side: "debtor", label: "Owes" },
  { page: PAGES.creditor, side: "creditor", label: "Is owed" },
];

function Ledger({ troupeId, reviewTo }: { troupeId: string; reviewTo?: string }) {
  const harpy = useContext(HarpyMode);
  // Room for the table at 1280 px and up (#975).
  useWidePage();
  const [params, setSearchParams] = useSearchParams();
  // Each change to the URL builds on the one asked for before it until the page catches
  // up, not on the address as the page was last drawn: on a phone a boon's dialog says
  // it has closed a moment after it goes, and a view chosen in that moment was undone,
  // or the boon opened again (#1025).
  const asked = useRef<URLSearchParams | null>(null);
  useEffect(() => {
    asked.current = null;
  }, [params]);
  const setParams = (change: (now: URLSearchParams) => URLSearchParams, options: { replace: boolean }) => {
    const next = change(new URLSearchParams(asked.current ?? window.location.search));
    asked.current = next;
    setSearchParams(next, options);
  };
  // A page, from 1, in the URL as ?page= so a reload or a link keeps it (#978).
  const pageOf = (key: string) => Math.max(1, Math.floor(Number(params.get(key))) || 1);
  const setPage = (key: string, to: number, replace = false) =>
    setParams(
      (now) => {
        const next = new URLSearchParams(now);
        if (to > 1) next.set(key, String(to));
        else next.delete(key);
        return next;
      },
      { replace },
    );
  // The search, view, kinds, filters and order, in the URL too (#976). A change starts
  // again from the first page.
  const search = readLedger(params);
  const update = (change: Partial<LedgerSearch>) => setParams((now) => writeLedger(now, { ...readLedger(now), ...change }), { replace: true });
  // Narrowed to a character or a name, it is their own page (#980): what they owe and
  // what they are owed, in two sections, under a head with their totals.
  const party = partyOf(search);
  const sections = party ? PARTY : WHOLE;
  // The boon open in the side panel, in the URL as ?boon= so it can be linked, and Back
  // closes it (#979). A search or a page leaves it open.
  const opened = params.get("boon");
  const open = (boonId: string | null) =>
    setParams(
      (now) => {
        const next = new URLSearchParams(now);
        if (boonId) next.set("boon", boonId);
        else next.delete("boon");
        return next;
      },
      { replace: !boonId },
    );
  // Beside the table from lg up, where the Play View's page is wide too (#985); a
  // dialog on a phone.
  const docked = useSideBySide();
  // Offline in the Play View, the Harpy can't act on the ledger: what shows is as it was (#985).
  const online = useOnline();
  const offline = harpy !== null && !online;
  // The top of the list, brought back into sight when paging from its foot.
  const top = useRef<HTMLDivElement>(null);
  const queryOf = (s: Section) => ({
    ...ledgerQuery(search),
    ...(s.side ? { side: s.side, sort: sideSort(search, s.side) } : {}),
    limit: PAGE,
    offset: (pageOf(s.page) - 1) * PAGE,
  });
  const lists = useQueries({
    queries: sections.map((s) => {
      const query = queryOf(s);
      return {
        queryKey: ["troupe-boons", troupeId, query],
        queryFn: () =>
          unwrap(
            api.GET("/api/troupes/{troupe_id}/boons", {
              params: { path: { troupe_id: troupeId }, query },
            }),
          ),
        // The page before, while the next comes: of the same list only.
        placeholderData: (previous: TroupeBoonsOut | undefined, before?: Query<TroupeBoonsOut, Error, TroupeBoonsOut, QueryKey>) =>
          (before?.queryKey[2] as { side?: BoonSide } | undefined)?.side === s.side ? previous : undefined,
      };
    }),
  });
  // Grouped (#981), each list's every row at once, where none has more than GROUP_MOST
  // (one not read yet, as yet): a list on one page has them all already.
  const groupable = lists.every((l) => !l.data || l.data.total <= GROUP_MOST);
  const grouping = search.group !== "" && groupable;
  const complete = (s: Section, list: (typeof lists)[number]) => pageOf(s.page) === 1 && Boolean(list.data && list.data.boons.length >= list.data.total);
  const everyRow = useQueries({
    queries: sections.map((s, i) => {
      const query = { ...queryOf(s), limit: GROUP_MOST, offset: 0 };
      return {
        queryKey: ["troupe-boons", troupeId, query],
        queryFn: () =>
          unwrap(
            api.GET("/api/troupes/{troupe_id}/boons", {
              params: { path: { troupe_id: troupeId }, query },
            }),
          ),
        enabled: grouping && Boolean(lists[i]?.data) && !complete(s, lists[i]!),
        placeholderData: (previous: TroupeBoonsOut | undefined, before?: Query<TroupeBoonsOut, Error, TroupeBoonsOut, QueryKey>) =>
          (before?.queryKey[2] as { side?: BoonSide } | undefined)?.side === s.side ? previous : undefined,
      };
    }),
  });
  // Who may be named on a boon: read once, not with every page (#978).
  const choices = useQuery({
    queryKey: ["boon-characters", troupeId],
    queryFn: () => unwrap(api.GET("/api/troupes/{troupe_id}/boon-characters", { params: { path: { troupe_id: troupeId } } })),
  });
  const reviews = (!harpy || harpy.review) && Boolean(reviewTo);
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
  const past = sections.map((s, i) => {
    const list = lists[i];
    const total = list?.data?.total ?? 0;
    return list?.isSuccess && !list.isPlaceholderData && pageOf(s.page) > 1 && (pageOf(s.page) - 1) * PAGE >= total ? { s, total } : null;
  });
  useEffect(() => {
    for (const p of past) if (p) setPage(p.s.page, Math.max(1, Math.ceil(p.total / PAGE)), true);
  });
  const whole = lists[0]!;
  if (choices.isPending || (!party && whole.isPending)) return <Loading />;
  const failed = [...lists, ...everyRow].find((l) => l.error);
  if (failed) return <ErrorText error={failed.error} />;
  if (choices.error) return <ErrorText error={choices.error} />;
  const characters = choices.data;
  // The views' counts, within the search: a party's, both their sections'.
  const counts: Partial<Record<BoonView, number>> = {};
  for (const list of lists) for (const [view, n] of Object.entries(list.data?.counts ?? {})) counts[view as BoonView] = (counts[view as BoonView] ?? 0) + n;
  const sorting =
    (side?: BoonSide) =>
    (label: string, by: LedgerSort): Pick<Column<BoonOut>, "header" | "label" | "sort"> => {
      const now = side ? sideSort(search, side) : search.sort;
      const way = now === by ? (search.direction === "asc" ? "ascending" : "descending") : undefined;
      return { header: <SortHeading label={label} sort={way} onSort={() => update(sortBy({ ...search, sort: now }, by))} />, label, sort: way };
    };
  // A name on a boon goes to their own page (#980); on a phone, out of the boon's dialog.
  const partyTo = (p: BoonOut["debtor"]) => {
    const next = writeLedger(params, onParty(search, p));
    if (!docked) next.delete("boon");
    return `?${next}`;
  };
  // Boons just registered that the search hides: "Show them" clears it (#983).
  const reveal: Reveal = (made, game) => (made.every((b) => shows(search, b, game)) ? null : () => update(showing(search, made)));
  const register = (!harpy || harpy.add) && <RegisterBoons troupeId={troupeId} characters={characters} reveal={reveal} disabled={offline} />;
  // Exports (#986): this view, or the whole ledger; the Harpy's where the troupe lets them (#987).
  const exports = (!harpy || harpy.export) && <BoonExportMenu troupeId={troupeId} query={ledgerQuery(search)} disabled={offline} />;
  const turn = (key: string, to: number) => {
    setPage(key, to);
    const list = top.current;
    if (list && list.getBoundingClientRect().top < 0) list.scrollIntoView({ block: "start" });
  };
  const empty = narrowed({ ...search, character: "", name: "" }) ? "No boons match." : search.view === "open" ? "None open." : "None here.";
  // A list grouped (#981), from its every row: on a party's page, by the other side.
  const groupedTable = (s: Section, list: (typeof lists)[number], every: (typeof everyRow)[number]) => {
    if (!every.data) return <Loading compact />;
    const by = s.side ? sideGroup(search.group, s.side) : search.group;
    const groups = groupBoons(every.data.boons, by as BoonSide | "night", every.data.weights, s.side ? sideSort(search, s.side) : search.sort, search.direction);
    return (
      <BoonTable
        key={`${search.view} ${by}`}
        label={s.label ?? "Boons"}
        boons={every.data.boons}
        groups={groups}
        games={games.data}
        busy={list.isPlaceholderData || every.isPlaceholderData}
        sorting={sorting(s.side)}
        party={s.side}
        partyTo={partyTo}
        opened={opened}
        onOpen={open}
      />
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* The ledger is its boons (#982): what it is, and how a Harpy keeps it, behind ⓘ. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg text-gold">Boon ledger</h2>
          <InfoButton label="About the boon ledger">
            {/* First, for the Harpy or a Lesser Harpy: what they may do, logged as their character (#985). */}
            {harpy && (
              <span className="mb-1 block">
                {keeperNote(harpy)}
                {(harpy.add || harpy.edit) && " An NPC you can't pick is named by name, for staff to link."}
              </span>
            )}
            <span className="block">
              The debts characters owe each other, registered with the Harpy ({BOON_PAGE}). Each boon keeps its own log; what each entry changed shows only to
              storytellers and assistant storytellers. A boon made off the record isn&apos;t tracked here.
            </span>
          </InfoButton>
        </div>
      </div>

      <div ref={top} className="flex scroll-mt-4 flex-col gap-3">
        {party ? (
          <BoonPartyHeader troupeId={troupeId} party={party} back={`?${writeLedger(params, { ...search, character: "", name: "" })}`} auditTo="audits" offline={offline} />
        ) : (
          whole.data && <BoonTotals totals={whole.data.totals} review={reviews && reviewTo ? { count: toReview, to: reviewTo } : null} search={search} show={update} />
        )}
        <BoonToolbar
          search={search}
          update={update}
          counts={counts}
          characters={characters}
          games={games.data ?? []}
          groupable={groupable}
          // At its right, registering boons (#983) and the menu of exports.
          end={
            (register || exports) && (
              <div className="ml-auto flex items-center gap-2">
                {register}
                {exports}
              </div>
            )
          }
        />
      </div>

      <div className={docked && opened ? "grid grid-cols-[minmax(0,1fr)_20rem] items-start gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]" : ""}>
        <div className="flex min-w-0 flex-col gap-4">
          {sections.map((s, i) => {
            const list = lists[i]!;
            const total = list.data?.total ?? 0;
            const body = list.isPending ? (
              list.fetchStatus === "paused" ? (
                <Empty>These come with a signal.</Empty>
              ) : (
                <Loading compact />
              )
            ) : total === 0 ? (
              <Empty>{s.side ? empty : narrowed(search) ? "No boons match." : search.view === "open" ? "No open boons yet." : "None here."}</Empty>
            ) : grouping ? (
              groupedTable(s, list, complete(s, list) ? list : everyRow[i]!)
            ) : (
              <>
                <BoonTable
                  key={search.view}
                  label={s.label ?? "Boons"}
                  boons={list.data?.boons ?? []}
                  busy={list.isPlaceholderData}
                  sorting={sorting(s.side)}
                  party={s.side}
                  partyTo={partyTo}
                  opened={opened}
                  onOpen={open}
                />
                <Pager
                  label={s.label ? `Pages of boons: ${s.label}` : "Pages of boons"}
                  page={pageOf(s.page)}
                  size={PAGE}
                  shown={list.data?.boons.length ?? 0}
                  total={total}
                  onPage={(to) => turn(s.page, to)}
                />
              </>
            );
            if (!s.label) return <Fragment key={s.page}>{body}</Fragment>;
            const headingId = `boon-section-${s.page}`;
            return (
              <section key={s.page} aria-labelledby={headingId} className="flex flex-col gap-2">
                <SectionLabel as="h3" id={headingId}>
                  {s.label}
                  {list.data && ` (${count.format(total)})`}
                </SectionLabel>
                {body}
              </section>
            );
          })}
        </div>
        {opened && (
          <BoonDetail
            key={opened}
            troupeId={troupeId}
            boonId={opened}
            characters={characters}
            partyTo={partyTo}
            frame={(title, actions, body) => (
              <SidePanel title={title} actions={actions} docked={docked} onClose={() => open(null)}>
                {body}
              </SidePanel>
            )}
          />
        )}
      </div>
    </div>
  );
}

/**
 * The ledger's boons, one line each (#975), as the troupe's old sheet has them: who
 * owes whom, the kind, the night, the reason, and where it stands. A click on a row
 * opens it in the side panel (#979), and marks it; a click on a name goes to that
 * side's own page (#980, `partyTo`). On a phone each row folds to "Debtor owes
 * Creditor", then its kind, night and reason. In a section of a party's own page,
 * the side they are on (`party`) goes without saying, so only the other shows.
 */
function BoonTable({
  label,
  boons,
  groups,
  games = [],
  busy,
  sorting,
  party,
  partyTo,
  opened,
  onOpen,
}: {
  label: string;
  boons: BoonOut[];
  // In groups (#981), each under a heading row, the first few open.
  groups?: BoonGroup[];
  // The troupe's games, to say which nights had one: staff's only.
  games?: BoonGameOut[];
  busy: boolean;
  // A column's heading, which sorts by it (#976).
  sorting: (label: string, by: LedgerSort) => Pick<Column<BoonOut>, "header" | "label" | "sort">;
  party?: BoonSide;
  partyTo: (party: BoonOut["debtor"]) => string;
  // The boon open in the side panel, and opening one.
  opened: string | null;
  onOpen: (boonId: string) => void;
}) {
  const dates = useDates();
  // The groups opened or closed by hand; the rest as they start.
  const [toggled, setToggled] = useState<Map<string, boolean>>(new Map());
  const debtor: Column<BoonOut> = {
    key: "debtor",
    ...sorting("Debtor", "debtor"),
    phone: "title",
    cell: (b) =>
      party ? (
        <PartyName party={b.debtor} to={partyTo(b.debtor)} />
      ) : (
        <span className="flex flex-wrap items-center gap-x-1.5">
          <PartyName party={b.debtor} to={partyTo(b.debtor)} />
          {/* A phone's first line has the creditor too: "Agnes owes Bram". */}
          <span className="text-mist lg:hidden">owes</span>
          <span className="flex max-w-full min-w-0 lg:hidden">
            <PartyName party={b.creditor} disgraced={b.creditor_disgraced} to={partyTo(b.creditor)} />
          </span>
        </span>
      ),
  };
  const creditor: Column<BoonOut> = {
    key: "creditor",
    ...sorting("Creditor", "creditor"),
    phone: party ? "title" : "detail",
    cell: (b) => <PartyName party={b.creditor} disgraced={b.creditor_disgraced} to={partyTo(b.creditor)} />,
  };
  const columns: Column<BoonOut>[] = [
    ...(party === "debtor" ? [creditor] : party === "creditor" ? [debtor] : [debtor, creditor]),
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
  // The days the troupe's games began, as the nights are written: "2026-10-03".
  const gameNights = new Set(games.map((g) => dates.toInput(g.starts_at).slice(0, 10)));
  const grouped = groups?.map((g, i): DataGroup<BoonOut> => {
    const open = toggled.get(g.key) ?? i < OPEN_GROUPS;
    return {
      key: g.key,
      heading: <GroupHeading group={g} night={g.night && dates.longDay(g.night)} game={Boolean(g.night && gameNights.has(g.night))} />,
      rows: g.boons,
      open,
      onToggle: () => setToggled(new Map(toggled).set(g.key, !open)),
    };
  });
  return (
    <DataTable
      label={label}
      columns={columns}
      rows={boons}
      groups={grouped}
      rowKey={(b) => b.id}
      rowLabel={boonLabel}
      stackBelow="lg"
      dense
      busy={busy}
      className={busy ? "opacity-60" : ""}
      select={{ label: (b) => `Details: ${boonLabel(b)}`, onSelect: (b) => onOpen(b.id), selected: opened }}
    />
  );
}

/**
 * A group's heading row (#981): who it is, or the night (marked where the troupe
 * held a game that day), then how many boons it holds and what they weigh.
 */
function GroupHeading({ group, night, game }: { group: BoonGroup; night: string | null; game: boolean }) {
  const n = group.boons.length;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
      {group.party ? (
        <span className={`min-w-0 truncate text-parchment ${group.party.character_id ? "" : "pr-0.5 italic"}`}>{group.party.name}</span>
      ) : (
        <span className="text-parchment">{night}</span>
      )}{" "}
      {game && <Badge>Game</Badge>}{" "}
      <span className="text-xs text-mist">
        {count.format(n)} {n === 1 ? "boon" : "boons"} · weight {weight(group.weight)}
      </span>
    </span>
  );
}

/**
 * A side of a boon on one line, its name cut to fit, a link to their own page (#980;
 * from lg up, where a phone's tap opens the row): in italics for a name only,
 * someone not in Horatio; with a quiet mark for one who is dead or off-field (as the
 * court knows it, for a Harpy); marked when they're a Boonbreaker (#717), or, as
 * the creditor, Disgraced (the sentence is in the detail).
 */
function PartyName({ party, disgraced = false, to }: { party: BoonOut["debtor"]; disgraced?: boolean; to: string }) {
  return (
    <span className="flex max-w-full min-w-0 items-center gap-1">
      <Link
        to={to}
        // On a phone a tap on the row opens the boon, whose detail links each name.
        className={`max-w-full min-w-0 truncate text-parchment hover:text-gold hover:underline max-lg:pointer-events-none lg:max-w-48 ${party.character_id ? "" : "pr-0.5 italic"}`}
        title={party.name}
      >
        {party.name}
      </Link>
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

