import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { api, unwrap } from "../../api/client";
import type { BoonStandingsOut, BoonWeightsIn } from "../../api/types";
import { BOON_PAGE, KINDS, kindName } from "../../boons";
import { DEFAULT_WEIGHTS, months, net, netWords, SCOPES, share, weight, weightsLine, type Scope } from "../../boonStandings";
import { DataTable, type Column } from "../../components/DataTable";
import { OneLine } from "../../components/OneLine";
import { useToast } from "../../components/Toast";
import { Button, Card, Empty, ErrorText, Field, Input, Loading } from "../../components/ui";
import { useWidePage } from "../../components/widePage";
import { useAction } from "../../hooks";
import { SectionLabel } from "../../components/Headings";

type Standings = BoonStandingsOut;
type Party = Standings["characters"][number]["who"];
type Group = Standings["clans"][number];
type Tally = Standings["court"][number]["owe_them"][number];
type KindCount = Standings["by_kind"][number];
type Standing = Standings["characters"][number];
type Band = Standings["debt_age"][number];
type Settled = Standings["settling"]["by_kind"][number];
type Pair = Standings["across_clans"]["pairs"][number];
type Mutual = Standings["mutual"][number];

/** How many characters the standing list shows before "Show everyone". */
const FIRST = 25;

/**
 * Boon standings (#691), for the troupe's running staff: where everyone stands in its
 * boon ledger, live. Every kind has a weight (the troupe's own, or Trivial 0.5, Minor
 * 1, Major 3, Blood 5, Life 10), and a character's net is the weight owed to them less
 * the weight they owe. Tables first, each with a plain bar beside the numbers; the
 * charts come with #702. Only shown while the troupe keeps a ledger. With `harpy`, as
 * the Harpy reads them from their ledger page where the troupe allows it (#749): who
 * has left only as the court knows it (the server sees to that), and the weights read
 * only.
 */
export function BoonStandingsTab({ troupeId, harpy = false }: { troupeId: string; harpy?: boolean }) {
  useWidePage();
  const [scope, setScope] = useState<Scope>("active");
  const standings = useQuery({
    queryKey: ["boon-standings", troupeId, scope],
    queryFn: () =>
      unwrap(
        api.GET("/api/troupes/{troupe_id}/boon-standings", {
          params: { path: { troupe_id: troupeId }, query: { scope } },
        }),
      ),
    placeholderData: (previous) => previous,
  });
  if (standings.isPending) return <Loading />;
  if (standings.error) return <ErrorText error={standings.error} />;
  const s = standings.data;
  const { trivial, minor, major, blood, life } = s.weights;
  const weights: BoonWeightsIn = { trivial, minor, major, blood, life };
  return (
    <div className="flex flex-col gap-4">
      <Card title="Boon standings">
        <p className="mb-3 text-sm text-mist">
          Where everyone stands in the boon ledger, now ({BOON_PAGE}). Each kind of boon has a weight, and a character&apos;s <strong>net</strong> is the weight
          owed to them less the weight they owe.{" "}
          {harpy ? (
            <>Who has left is shown as the court knows it.</>
          ) : (
            <>
              The boons themselves are on the <Link to={`/troupes/${troupeId}/boons`}>Ledger</Link>.
            </>
          )}
        </p>
        <fieldset className="flex flex-wrap items-center gap-2 text-sm">
          <legend className="sr-only">Who is counted</legend>
          {SCOPES.map((o) => (
            <label key={o.value} className="flex items-center gap-1">
              <input type="radio" name="boon-standings-scope" checked={scope === o.value} onChange={() => setScope(o.value)} />
              {o.label}
            </label>
          ))}
          <span className="text-xs text-mist">{SCOPES.find((o) => o.value === scope)?.meaning}</span>
        </fieldset>
        <Totals totals={s.totals} />
        {harpy ? (
          <p className="mt-3 text-sm">
            <span className="text-mist">Weights{s.weights.defaults ? " (the defaults)" : ""}:</span> {weightsLine(weights)}
          </p>
        ) : (
          <Weights troupeId={troupeId} weights={weights} defaults={s.weights.defaults} />
        )}
      </Card>
      <ByKind standings={s} />
      <Characters standings={s} />
      <Court standings={s} />
      <Groups title="By clan" groups={s.clans} label="Clan" />
      <Groups title="By age" groups={s.ages} label="Age" />
      <Groups title="By sect" groups={s.sects} label="Sect" />
      <DebtAge standings={s} />
      <Settling standings={s} />
      <Across title="Across clan lines" across={s.across_clans} line="clan" />
      <Across title="Across sect lines" across={s.across_sects} line="sect" />
      <Mutual standings={s} />
    </div>
  );
}

function Totals({ totals }: { totals: Standings["totals"] }) {
  const tiles: [string, number, string][] = [
    ["Open", totals.open, "Standing, with everyone on them in play."],
    ["Involve the departed", totals.departed, "Standing, but someone on them is dead or off-field."],
    ["Settled", totals.settled, "Called in, forgiven or formally ignored."],
    ["Waiting for review", totals.pending, "Submitted, not yet registered."],
    ["Name only", totals.name_only, "Standing boons with a side not linked to a character."],
  ];
  return (
    <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="The whole ledger">
      {tiles.map(([label, value, meaning]) => (
        <div key={label} className="rounded border border-ash px-3 py-2">
          <dt className="text-xs text-mist">{label}</dt>
          <dd className="text-xl text-parchment tabular-nums">{value}</dd>
          {/* What it counts, under the number: a hover title never shows on a phone. */}
          <dd className="text-xs leading-tight text-mist">{meaning}</dd>
        </div>
      ))}
    </dl>
  );
}

function Weights({ troupeId, weights, defaults }: { troupeId: string; weights: BoonWeightsIn; defaults: boolean }) {
  const toast = useToast();
  const [editing, setEditing] = useState<Record<keyof BoonWeightsIn, string> | null>(null);
  const save = useAction(async (next: BoonWeightsIn) => {
    await unwrap(api.PUT("/api/troupes/{troupe_id}/boon-weights", { params: { path: { troupe_id: troupeId } }, body: next }));
    setEditing(null);
    toast({ message: "The boon weights are saved." });
  });
  const start = (from: BoonWeightsIn) =>
    setEditing({
      trivial: String(from.trivial),
      minor: String(from.minor),
      major: String(from.major),
      blood: String(from.blood),
      life: String(from.life),
    });
  return (
    <div className="mt-3 text-sm">
      <p>
        <span className="text-mist">Weights{defaults ? " (the defaults)" : ""}:</span> {weightsLine(weights)}{" "}
        {!editing && (
          <button type="button" className="text-xs text-mist underline hover:text-parchment" aria-label="Edit the weights" onClick={() => start(weights)}>
            Edit
          </button>
        )}
      </p>
      {editing && (
        <form
          className="mt-2 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({
              trivial: Number(editing.trivial),
              minor: Number(editing.minor),
              major: Number(editing.major),
              blood: Number(editing.blood),
              life: Number(editing.life),
            });
          }}
        >
          {KINDS.map((k) => (
            <div key={k.value} className="w-20">
              <Field label={k.label}>
                <Input
                  type="number"
                  min={0.25}
                  max={100}
                  step={0.25}
                  required
                  value={editing[k.value]}
                  onChange={(e) => setEditing({ ...editing, [k.value]: e.target.value })}
                />
              </Field>
            </div>
          ))}
          <Button type="submit" disabled={save.isPending}>
            Save
          </Button>
          <Button type="button" variant="ghost" onClick={() => start(DEFAULT_WEIGHTS)}>
            Defaults
          </Button>
          <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
            Cancel
          </Button>
          <ErrorText error={save.error} />
        </form>
      )}
    </div>
  );
}

/** A plain bar for one measure, in gold; the number is always beside it. */
function Bar({ value, most }: { value: number; most: number }) {
  return (
    <div className="h-2 w-full min-w-16 rounded bg-ash/60" aria-hidden="true">
      <div className="h-full rounded bg-gold" style={{ width: `${share(value, most)}%` }} />
    </div>
  );
}

/**
 * A net, as a bar from a middle line: right in gold for owed more than they owe, left
 * in mist for owing more. Its sign is in its position and in the number beside it,
 * never in its colour alone (gold and blood are too close in Ultra goth).
 */
function NetBar({ value, most }: { value: number; most: number }) {
  const half = share(Math.abs(value), most) / 2;
  return (
    <div className="relative h-2 w-full min-w-20" aria-hidden="true">
      <div className="absolute inset-y-[-2px] left-1/2 w-px bg-line" />
      {value > 0 && <div className="absolute inset-y-0 left-1/2 rounded-r bg-gold" style={{ width: `${half}%` }} />}
      {value < 0 && <div className="absolute inset-y-0 right-1/2 rounded-l bg-mist" style={{ width: `${half}%` }} />}
    </div>
  );
}

/** A column of figures; on a phone, a "label: value" under the row's name. */
function figure<T>(key: string, header: string, cell: (row: T) => ReactNode): Column<T> {
  return { key, header, phone: "shown", numeric: true, cell };
}

/** A row's net, as a figure: signed, and in words for a screen reader. */
function netColumn<T>(of: (row: T) => number): Column<T> {
  return {
    ...figure<T>("net", "Net", (row) => net(of(row))),
    cellProps: (row) => ({ "aria-label": netWords(of(row)) }),
    // A cell's aria-label doesn't reach the phone's copy, so the words come along there.
    folded: (row) => (
      <>
        <span aria-hidden="true">{net(of(row))}</span>
        <span className="sr-only">{netWords(of(row))}</span>
      </>
    ),
  };
}

/** The plain bar beside the figures: left out on a phone, where the figures are enough. */
function barColumn<T>(width: string, bar: (row: T) => ReactNode): Column<T> {
  return { key: "bar", header: <span className="sr-only">Bar</span>, label: "Bar", phone: "detail", className: width, cell: bar };
}

function Name({ who }: { who: Party }) {
  const gone = who.standing && who.standing !== "active" && who.standing !== "inactive";
  // A name longer than its list is wide breaks rather than pushing the page sideways; a
  // passage of story written for a name-only side is cut to a line (#990).
  return (
    <span className="wrap-anywhere">
      {who.character_id === null ? <OneLine text={who.name} /> : who.name}
      {who.character_id === null && <span className="text-xs text-mist"> (name only)</span>}
      {gone && <span className="text-xs text-mist"> ({who.standing === "final_death" ? "Final Death" : who.standing === "off_field" ? "Off-field" : "retired"})</span>}
    </span>
  );
}

function ByKind({ standings }: { standings: Standings }) {
  const most = Math.max(0, ...standings.by_kind.map((k) => k.count));
  return (
    <Card title="Open boons by kind">
      <DataTable
        label="Open boons by kind"
        dense
        rows={standings.by_kind}
        rowKey={(k) => k.kind}
        columns={[
          { key: "kind", header: "Kind", phone: "title", cell: (k) => kindName(k.kind) },
          figure<KindCount>("weight", "Weight", (k) => weight(k.weight)),
          figure<KindCount>("open", "Open", (k) => k.count),
          figure<KindCount>("total", "Total weight", (k) => weight(k.total)),
          barColumn<KindCount>("w-1/3", (k) => <Bar value={k.count} most={most} />),
        ]}
      />
    </Card>
  );
}

function Characters({ standings }: { standings: Standings }) {
  const [all, setAll] = useState(false);
  const rows = standings.characters;
  const shown = all ? rows : rows.slice(0, FIRST);
  const most = Math.max(0, ...rows.map((c) => Math.abs(c.net)));
  return (
    <Card title="Standing by character">
      {rows.length === 0 ? (
        <Empty>No open boons.</Empty>
      ) : (
        <>
          <DataTable
            label="Standing by character"
            dense
            rows={shown}
            rowKey={(c) => c.who.key}
            columns={[
              { key: "character", header: "Character", phone: "title", cell: (c) => <Name who={c.who} /> },
              { key: "clan", header: "Clan", phone: "shown", className: "text-mist", cell: (c) => c.who.clan ?? "" },
              figure<Standing>("owes", "Owes", (c) => weight(c.owes)),
              figure<Standing>("owed", "Owed", (c) => weight(c.owed)),
              netColumn<Standing>((c) => c.net),
              barColumn<Standing>("w-1/4", (c) => <NetBar value={c.net} most={most} />),
            ]}
          />
          {rows.length > FIRST && (
            <button type="button" className="mt-2 text-xs text-mist underline hover:text-parchment" onClick={() => setAll(!all)}>
              {all ? `Show the first ${FIRST}` : `Show everyone (${rows.length})`}
            </button>
          )}
        </>
      )}
    </Card>
  );
}

function Tallies({ label, tallies }: { label: string; tallies: Tally[] }) {
  return (
    <div>
      <SectionLabel as="h4">{label}</SectionLabel>
      {tallies.length === 0 ? (
        <p className="text-xs text-mist">Nobody.</p>
      ) : (
        <ul className="text-sm">
          {tallies.map((t) => (
            <li key={t.who.key} className="flex justify-between gap-2">
              <Name who={t.who} />
              <span className="text-mist tabular-nums">
                {t.count} · {weight(t.weight)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Court({ standings }: { standings: Standings }) {
  return (
    <Card title="The court">
      {standings.court.length === 0 ? (
        <Empty>No title holder has an open boon.</Empty>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {standings.court.map((o) => (
            <li key={`${o.title}:${o.standing.who.key}`} className="rounded border border-ash p-3">
              <h3 className="text-sm">
                <span className="text-gold">{o.title}</span> · <Name who={o.standing.who} />
              </h3>
              <p className="text-xs text-mist">
                Owed {weight(o.standing.owed)}, owes {weight(o.standing.owes)}, net <span aria-label={netWords(o.standing.net)}>{net(o.standing.net)}</span>
              </p>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <Tallies label="Owe them most" tallies={o.owe_them} />
                <Tallies label="They owe most" tallies={o.they_owe} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Groups({ title, groups, label }: { title: string; groups: Group[]; label: string }) {
  const most = Math.max(0, ...groups.map((g) => Math.abs(g.net)));
  return (
    <Card title={title}>
      {groups.length === 0 ? (
        <Empty>No open boons.</Empty>
      ) : (
        <DataTable
          label={title}
          dense
          rows={groups}
          rowKey={(g) => g.label}
          columns={[
            { key: "group", header: label, phone: "title", cell: (g) => g.label },
            figure<Group>("characters", "Characters", (g) => g.characters),
            figure<Group>("owes", "Owes", (g) => weight(g.owes)),
            figure<Group>("owed", "Owed", (g) => weight(g.owed)),
            netColumn<Group>((g) => g.net),
            barColumn<Group>("w-1/4", (g) => <NetBar value={g.net} most={most} />),
          ]}
        />
      )}
    </Card>
  );
}

function DebtAge({ standings }: { standings: Standings }) {
  const most = Math.max(0, ...standings.debt_age.map((b) => b.count));
  return (
    <Card title="Age of open debt">
      <p className="mb-2 text-xs text-mist">How long each open boon has stood, in months, from the night it was made.</p>
      <DataTable
        label="Age of open debt"
        dense
        rows={standings.debt_age}
        rowKey={(b) => b.label}
        columns={[
          { key: "months", header: "Months", phone: "title", cell: (b) => b.label },
          figure<Band>("boons", "Boons", (b) => b.count),
          figure<Band>("weight", "Weight", (b) => weight(b.weight)),
          barColumn<Band>("w-1/2", (b) => <Bar value={b.count} most={most} />),
        ]}
      />
    </Card>
  );
}

function Settling({ standings }: { standings: Standings }) {
  const s = standings.settling;
  return (
    <Card title="Settling">
      <p className="mb-2 text-sm">
        {s.count} settled, weighing {weight(s.weight)}; half were settled within {months(s.median_months)} of being made.
      </p>
      <DataTable
        label="Settled by kind"
        dense
        rows={s.by_kind}
        rowKey={(k) => k.kind}
        columns={[
          { key: "kind", header: "Kind", phone: "title", cell: (k) => kindName(k.kind) },
          figure<Settled>("settled", "Settled", (k) => k.count),
          figure<Settled>("called", "Called in", (k) => k.called_in),
          figure<Settled>("forgiven", "Forgiven", (k) => k.forgiven),
          figure<Settled>("ignored", "Ignored", (k) => k.ignored),
          figure<Settled>("typical", "Typical time", (k) => months(k.median_months)),
        ]}
      />
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <SectionLabel>Settled by the debtor&apos;s clan</SectionLabel>
          <ul className="text-sm">
            {s.by_clan.map((b) => (
              <li key={b.label} className="flex justify-between gap-2">
                {b.label}
                <span className="text-mist tabular-nums">
                  {b.count} · {weight(b.weight)}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <SectionLabel>Call their boons in</SectionLabel>
          <ul className="text-sm">
            {s.calls_in.map((c) => (
              <li key={c.who.key}>
                <span className="flex justify-between gap-2">
                  <Name who={c.who} />
                  <span className="text-mist tabular-nums">{c.rate}%</span>
                </span>
                <span className="block text-xs text-mist tabular-nums">
                  called in {weight(c.called_in)}, still holds {weight(c.open)}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <SectionLabel>Leave them standing</SectionLabel>
          <ul className="text-sm">
            {s.leaves.map((c) => (
              <li key={c.who.key} className="flex justify-between gap-2">
                <Name who={c.who} />
                <span className="text-mist tabular-nums">holds {weight(c.open)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

function Across({ title, across, line }: { title: string; across: Standings["across_clans"]; line: "clan" | "sect" }) {
  const most = Math.max(0, ...across.pairs.map((p) => p.weight));
  return (
    <Card title={title}>
      <p className="mb-2 text-sm">
        {across.crossing} of {across.of} open boons cross a {line} line, weighing {weight(across.crossing_weight)}.
      </p>
      {across.pairs.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <DataTable
            label={`Between ${line}s`}
            dense
            rows={across.pairs}
            rowKey={(p) => p.label}
            columns={[
              { key: "between", header: "Between", phone: "title", cell: (p) => p.label },
              figure<Pair>("boons", "Boons", (p) => p.count),
              figure<Pair>("weight", "Weight", (p) => weight(p.weight)),
              barColumn<Pair>("w-1/3", (p) => <Bar value={p.weight} most={most} />),
            ]}
          />
          <Tallies label={`Most across ${line} lines`} tallies={across.most} />
        </div>
      )}
    </Card>
  );
}

function Mutual({ standings }: { standings: Standings }) {
  return (
    <Card title="Owing each other">
      {standings.mutual.length === 0 ? (
        <Empty>No two characters owe each other.</Empty>
      ) : (
        <DataTable
          label="Owing each other"
          dense
          rows={standings.mutual}
          rowKey={(m) => `${m.first.key}:${m.second.key}`}
          columns={[
            { key: "first", header: "Owes more", phone: "title", cell: (m) => <Name who={m.first} /> },
            { key: "second", header: "To", phone: "shown", cell: (m) => <Name who={m.second} /> },
            figure<Mutual>("owes", "Owes", (m) => weight(m.owes)),
            figure<Mutual>("back", "Back", (m) => weight(m.back)),
            figure<Mutual>("difference", "Difference", (m) => weight(m.net)),
          ]}
        />
      )}
    </Card>
  );
}
