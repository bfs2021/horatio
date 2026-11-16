import { useState, type ReactNode } from "react";
import { api, unwrap } from "../../api/client";
import type { BoonOut } from "../../api/types";
import { KINDS, kindName, owes, type BoonKind } from "../../boons";
import { Checkbox } from "../../components/Checkbox";
import { useConfirm } from "../../components/ConfirmDialog";
import { DataTable, type Column } from "../../components/DataTable";
import { Dialog } from "../../components/Dialog";
import { useToast } from "../../components/Toast";
import { Badge, Button, Empty, ErrorText, Field, Input, Select } from "../../components/ui";
import { useDates } from "../../dates";
import { useAction } from "../../hooks";
import { ANY, approvalSummary, narrowWaiting, reporterOf, waitingChoices, type WaitingFilter } from "./boonApproval";
import { boonLabel } from "./BoonDetail";

/**
 * The kinds of boon a player reports that go straight into the ledger while the troupe
 * holds reports for review (#993), a tick for each, saved together. For whoever runs
 * the queue: staff, or the Harpy (never a Lesser Harpy). Boons already waiting stay.
 */
export function ApprovalKinds({ troupeId, kinds, onSaved }: { troupeId: string; kinds: readonly BoonKind[]; onSaved?: () => void }) {
  const toast = useToast();
  const [ticked, setTicked] = useState<BoonKind[]>([...kinds]);
  const save = useAction(async (next: BoonKind[]) => {
    const done = await unwrap(api.PUT("/api/troupes/{troupe_id}/boon-auto-accept", { params: { path: { troupe_id: troupeId } }, body: { kinds: next } }));
    toast({ message: `Saved. ${approvalSummary(done.auto_accept)}` });
    onSaved?.();
  });
  const changed = ticked.length !== kinds.length || ticked.some((k) => !kinds.includes(k));
  return (
    <form
      aria-label="Boons that go straight in"
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(ticked);
      }}
    >
      <div role="group" aria-label="Kinds that go straight into the ledger" className="flex flex-col">
        {KINDS.map((k) => (
          <Checkbox
            key={k.value}
            label={k.label}
            checked={ticked.includes(k.value)}
            disabled={save.isPending}
            onChange={(on) => setTicked(on ? [...ticked, k.value] : ticked.filter((t) => t !== k.value))}
          />
        ))}
      </div>
      <p className="text-xs text-mist">
        A boon of a ticked kind is accepted at once, its log saying &ldquo;Accepted automatically&rdquo;; flags still apply. Any other waits for approval, unless a
        Lesser Harpy is on either side: that one always goes straight in. Changing this never touches boons already waiting.
      </p>
      <ErrorText error={save.error} />
      <div>
        <Button type="submit" variant="secondary" disabled={save.isPending || !changed}>
          Save
        </Button>
      </div>
    </form>
  );
}

/** The To review tab's quiet way to the kinds that go straight in (#993), for whoever runs the queue. */
export function ApprovalSettings({ troupeId, kinds }: { troupeId: string; kinds: readonly BoonKind[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" className="self-start" onClick={() => setOpen(true)}>
        Approval settings
      </Button>
      <Dialog title="Approval settings" open={open} onClose={() => setOpen(false)}>
        <p className="mb-2 text-sm">Which boons players report go straight into the ledger, without waiting for approval.</p>
        <ApprovalKinds troupeId={troupeId} kinds={kinds} onSaved={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

/**
 * The boons players reported that wait for approval (#993), as rows like the ledger's
 * table (#975): who owes whom, the kind, the night, the reason and who reported it,
 * with Accept and Don't accept on each. Narrowed by kind, reporter and night, "Accept
 * all shown" accepts every row left. A click on a row opens the boon under it, to edit
 * it first, flag it or link a name, as the queue has always opened them.
 */
export function WaitingForApproval({ troupeId, boons, detail }: { troupeId: string; boons: BoonOut[]; detail: (boonId: string) => ReactNode }) {
  const dates = useDates();
  const toast = useToast();
  const [filter, setFilter] = useState<WaitingFilter>(ANY);
  const [refusing, setRefusing] = useState<BoonOut | null>(null);
  const [confirmed, confirming] = useConfirm();
  const choices = waitingChoices(boons);
  const shown = narrowWaiting(boons, filter);
  const accept = useAction(async (boon: BoonOut) => {
    await unwrap(
      api.POST("/api/troupes/{troupe_id}/boons/{boon_id}/accept", { params: { path: { troupe_id: troupeId, boon_id: boon.id } }, body: { note: "" } }),
    );
    toast({ message: `Accepted: ${owes(boon)}.` });
  });
  const acceptAll = useAction(async (found: BoonOut[]) => {
    const done = await unwrap(
      api.POST("/api/troupes/{troupe_id}/boons/accept", { params: { path: { troupe_id: troupeId } }, body: { boon_ids: found.map((b) => b.id), note: "" } }),
    );
    toast({ message: `Accepted ${done.accepted === 1 ? "1 boon" : `${done.accepted} boons`}.` });
    setFilter(ANY);
  });
  const busy = accept.isPending || acceptAll.isPending;
  const columns: Column<BoonOut>[] = [
    {
      key: "debtor",
      header: "Debtor",
      phone: "title",
      cell: (b) => (
        <span className="flex flex-wrap items-center gap-x-1.5">
          <Name party={b.debtor} />
          <span className="text-mist lg:hidden">owes</span>
          <span className="lg:hidden">
            <Name party={b.creditor} />
          </span>
          {b.flagged && <Badge tone="gold">Flagged</Badge>}
        </span>
      ),
    },
    { key: "creditor", header: "Creditor", phone: "detail", cell: (b) => <Name party={b.creditor} /> },
    { key: "kind", header: "Kind", phone: "shown", bare: true, cell: (b) => <span className="whitespace-nowrap text-gold">{kindName(b.kind)}</span> },
    { key: "date", header: "Date", phone: "shown", bare: true, cell: (b) => <span className="whitespace-nowrap">{dates.day(b.made_on)}</span> },
    {
      key: "reason",
      header: "Reason",
      phone: "shown",
      bare: true,
      className: "w-full max-w-0",
      cell: (b) => (
        <span className="block truncate text-mist" title={b.reason || undefined}>
          {b.reason}
        </span>
      ),
      folded: (b) => (b.reason ? <span className="block truncate text-mist">{b.reason}</span> : null),
    },
    { key: "reporter", header: "Reported by", label: "Reported by", phone: "shown", cell: (b) => <span className="whitespace-nowrap">{reporterOf(b) || "—"}</span> },
    {
      key: "actions",
      header: <span className="sr-only">Accept or not</span>,
      label: "Accept or not",
      phone: "always",
      cell: (b) => (
        <span className="flex flex-col gap-1 sm:flex-row">
          <Button variant="secondary" className="min-h-8 px-3" aria-label={`Accept: ${owes(b)}`} disabled={busy} onClick={() => accept.mutate(b)}>
            Accept
          </Button>
          <Button variant="ghost" className="min-h-8 px-3 whitespace-nowrap" aria-label={`Don't accept: ${owes(b)}`} disabled={busy} onClick={() => setRefusing(b)}>
            Don&apos;t accept
          </Button>
        </span>
      ),
    },
  ];
  if (boons.length === 0) return <Empty>Nothing waits for approval.</Empty>;
  const narrowed = filter.kind || filter.reporter || filter.night;
  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Narrow the boons waiting" className="flex flex-wrap items-end gap-2">
        <Field label="Kind">
          <Select value={filter.kind} onChange={(e) => setFilter({ ...filter, kind: e.target.value as WaitingFilter["kind"] })}>
            <option value="">Any kind</option>
            {choices.kinds.map((k) => (
              <option key={k} value={k}>
                {kindName(k)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reported by">
          <Select value={filter.reporter} onChange={(e) => setFilter({ ...filter, reporter: e.target.value })}>
            <option value="">Anyone</option>
            {choices.reporters.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Night">
          <Select value={filter.night} onChange={(e) => setFilter({ ...filter, night: e.target.value })}>
            <option value="">Any night</option>
            {choices.nights.map((n) => (
              <option key={n} value={n}>
                {dates.day(n)}
              </option>
            ))}
          </Select>
        </Field>
        <Button
          variant="secondary"
          disabled={busy || shown.length === 0}
          onClick={async () => {
            const what = shown.length === 1 ? "1 boon" : `${shown.length} boons`;
            if (await confirmed({ title: `Accept ${what}?`, body: "Each goes into the ledger, logged as accepted by you.", action: "Accept them" })) acceptAll.mutate(shown);
          }}
        >
          Accept all shown ({shown.length})
        </Button>
      </div>
      <ErrorText error={accept.error ?? acceptAll.error} />
      {shown.length === 0 ? (
        <Empty>None waiting {narrowed ? "matches" : "here"}.</Empty>
      ) : (
        <DataTable
          label="Waiting for approval"
          columns={columns}
          rows={shown}
          rowKey={(b) => b.id}
          rowLabel={boonLabel}
          stackBelow="lg"
          dense
          expand={{ label: (b) => `Details: ${boonLabel(b)}`, render: (b) => detail(b.id), wholeRow: true }}
        />
      )}
      {/* Kept mounted and closed by `open`, so its close hands a toast back to the page. */}
      <Dialog title={refusing ? `Don't accept: ${owes(refusing)}` : "Don't accept"} open={refusing !== null} onClose={() => setRefusing(null)}>
        {refusing && <Refuse troupeId={troupeId} boon={refusing} onClose={() => setRefusing(null)} />}
      </Dialog>
      {confirming}
    </div>
  );
}

/** A side's name, in italics for a name only, cut to fit. */
function Name({ party }: { party: BoonOut["debtor"] }) {
  return (
    <span className={`max-w-full min-w-0 truncate text-parchment lg:max-w-48 ${party.character_id ? "" : "italic"}`} title={party.name}>
      {party.name}
    </span>
  );
}

/** Don't accept a boon, with why: its reporter sees it. */
function Refuse({ troupeId, boon, onClose }: { troupeId: string; boon: BoonOut; onClose: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const save = useAction(async () => {
    await unwrap(
      api.POST("/api/troupes/{troupe_id}/boons/{boon_id}/reject", { params: { path: { troupe_id: troupeId, boon_id: boon.id } }, body: { reason } }),
    );
    toast({ message: `Not accepted: ${owes(boon)}.` });
    onClose();
  });
  return (
    <form
      aria-label={`Don't accept: ${owes(boon)}`}
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(undefined);
      }}
    >
      <Field label="Why" hint="The player who reported it sees this. It stays in the ledger as void.">
        <Input maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <ErrorText error={save.error} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="danger" disabled={save.isPending || !reason.trim()}>
          Don&apos;t accept it
        </Button>
      </div>
    </form>
  );
}
