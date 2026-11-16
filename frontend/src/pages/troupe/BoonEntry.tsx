import { useQuery } from "@tanstack/react-query";
import { useContext, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { api, unwrap } from "../../api/client";
import type { BoonOut, CharacterChoice } from "../../api/types";
import { partyIn } from "../../bonds";
import { emptyRow, KINDS, rowStarted, rowsTotal, type BoonKind, type EntryRow } from "../../boons";
import { Checkbox } from "../../components/Checkbox";
import { useConfirm } from "../../components/ConfirmDialog";
import { DateInput } from "../../components/DateInput";
import { Dialog } from "../../components/Dialog";
import { useToast } from "../../components/Toast";
import { Button, ErrorText, Field, Input, Select } from "../../components/ui";
import { useDates } from "../../dates";
import { useAction, useLeaveWarning } from "../../hooks";
import { FormButtons } from "./BoonDetail";
import { HarpyMode, useAnyText } from "./boonKeeper";
import { WhoPicker } from "./WhoPicker";

function today(dates: ReturnType<typeof useDates>) {
  return dates.toInput(new Date()).slice(0, 10);
}

/**
 * Boons just registered, and the game they were registered at: a way to show them
 * where the ledger's search hides them, or null where it shows them.
 */
export type Reveal = (made: BoonOut[], game: string | null) => (() => void) | null;

/**
 * "Register boons" at the end of the ledger's toolbar (#983), for those who may add:
 * the quick entry in a wide dialog, the whole screen on a phone. Leaving it with rows
 * started asks first. Once they are registered it closes, and the toast says how many;
 * where the ledger's search hides them, it offers to show them. `disabled` (offline in
 * the Play View, #985), the button can't be pressed; a dialog already open stays.
 */
export function RegisterBoons({
  troupeId,
  characters,
  reveal,
  disabled = false,
}: {
  troupeId: string;
  characters: CharacterChoice[];
  reveal: Reveal;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Whether a row is started: a ref, so an Escape straight after a change reads it.
  const started = useRef(false);
  const [confirmed, confirming] = useConfirm();
  const close = () => {
    setOpen(false);
    started.current = false;
  };
  const leave = async () => {
    if (started.current && !(await confirmed({ title: "Discard these boons?", body: "The rows you've started aren't registered. They'll be lost.", action: "Discard" }))) return;
    close();
  };
  return (
    <>
      <Button variant="secondary" disabled={disabled} onClick={() => setOpen(true)}>
        Register boons
      </Button>
      <Dialog title="Register boons" open={open} onClose={leave} wide phoneFull asksToClose>
        <QuickEntry troupeId={troupeId} characters={characters} reveal={reveal} started={started} onCancel={leave} onDone={close} />
      </Dialog>
      {confirming}
    </>
  );
}

/**
 * Register boons: one, or a whole game's at once. Each row is a boon, made as many
 * times as its count ("1 of 3", "2 of 3"...); rows left untouched are skipped. All
 * register together, or none do. `started` says whether any row is started.
 */
function QuickEntry({
  troupeId,
  characters,
  reveal,
  started: startedRef,
  onCancel,
  onDone,
}: {
  troupeId: string;
  characters: CharacterChoice[];
  reveal: Reveal;
  started: RefObject<boolean>;
  onCancel: () => void;
  onDone: () => void;
}) {
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
  // Leaving the page with rows started asks first, as closing the dialog does.
  const unsaved = started.length > 0;
  useLeaveWarning(unsaved, { inApp: true });
  useLayoutEffect(() => {
    startedRef.current = unsaved;
  });
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
    const show = reveal(made, gameId || null);
    toast({
      message: made.length === 1 ? "Registered a boon." : `Registered ${made.length} boons.`,
      action: show ? { label: made.length === 1 ? "Show it" : "Show them", onClick: show } : undefined,
    });
    onDone();
  });
  return (
    <form
      aria-label="Register boons"
      className="flex flex-col gap-3"
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
              <Checkbox label="Tell the debtor's player if it's traded" checked={row.notify_on_trade} onChange={(notify_on_trade) => set(i, { notify_on_trade })} />
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
      <FormButtons pending={save.isPending} ready={ready} label={total <= 1 ? "Register the boon" : `Register ${total} boons`} onCancel={onCancel} />
    </form>
  );
}
