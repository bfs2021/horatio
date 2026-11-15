import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { api, unwrap } from "../../api/client";
import type { components } from "../../api/schema";
import { Dialog } from "../../components/Dialog";
import { SectionLabel } from "../../components/Headings";
import { OneLine } from "../../components/OneLine";
import { Badge, Button, Card, Empty, ErrorText, Field, Input, Notice, Select } from "../../components/ui";
import { useAction } from "../../hooks";
import { manualLink } from "../../manualLink";

type BoonImport = components["schemas"]["BoonImportOut"];
type NameCount = BoonImport["names"][number];

const KINDS: Record<BoonImport["kinds"][number]["kind"], string> = {
  trivial: "Trivial",
  minor: "Minor",
  major: "Major",
  blood: "Blood",
  life: "Life",
};
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/**
 * Bringing a troupe's boon ledger across from its old spreadsheet (#989): the custodian
 * chooses the troupe and the sheet, downloaded as .xlsx, reads the dry run's report, and
 * imports it. The sheet is sent again for the import and never kept on the server.
 */
export function BoonImportTab() {
  const [params, setParams] = useSearchParams();
  const troupeId = params.get("troupe") ?? "";
  const troupes = useQuery({
    queryKey: ["troupes"],
    queryFn: () => unwrap(api.GET("/api/troupes")),
  });

  return (
    <div className="flex flex-col gap-4">
      <Card title="Import a boon ledger">
        <p className="mb-3 text-sm text-mist">
          Bring a troupe's boons across from its old spreadsheet. Download the sheet as .xlsx and choose it here: a dry run reads its{" "}
          <strong className="text-parchment">Master</strong> and <strong className="text-parchment">Characters</strong> tabs and says what importing it would
          do, saving nothing. Import it when the report looks right. Running it again, with a newer sheet, updates the boons it made and adds new rows, and
          leaves any boon staff have changed since.{" "}
          <Link to={manualLink("custodian", "importing-a-boon-ledger")} className="text-gold hover:underline">
            How it works
          </Link>
        </p>
        <Field label="Troupe">
          <Select
            value={troupeId}
            onChange={(e) =>
              setParams(e.target.value ? { troupe: e.target.value } : {}, {
                replace: true,
              })
            }
            className="w-full max-w-md"
          >
            <option value="">Choose a troupe…</option>
            {troupes.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <ErrorText error={troupes.error} />
      </Card>
      {troupeId && <ImportPanel key={troupeId} troupeId={troupeId} />}
    </div>
  );
}

function ImportPanel({ troupeId }: { troupeId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [confirming, setConfirming] = useState(false);
  const send = (dryRun: boolean) => (sheet: File) => {
    const form = new FormData();
    form.append("file", sheet);
    return unwrap(
      api.POST("/api/boon-imports/{troupe_id}", {
        params: { path: { troupe_id: troupeId }, query: { dry_run: dryRun } },
        body: form as never,
        bodySerializer: (body: unknown) => body as FormData,
      }),
    );
  };
  const dry = useAction(send(true));
  const done = useAction(send(false));
  const report = done.data ?? dry.data;
  const busy = dry.isPending || done.isPending;

  const choose = (chosen: File) => {
    setFile(chosen);
    done.reset();
    dry.mutate(chosen);
  };

  return (
    <>
      <Card
        title="The spreadsheet"
        actions={
          <Button type="button" variant={file ? "secondary" : "primary"} disabled={busy} onClick={() => input.current?.click()}>
            {file ? "Choose another" : "Choose the spreadsheet"}
          </Button>
        }
      >
        <Input
          ref={input}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label="Boon spreadsheet"
          hidden
          onChange={(e) => {
            const chosen = e.target.files?.[0];
            e.target.value = "";
            if (chosen) choose(chosen);
          }}
        />
        {file ? <p className="mb-3 text-sm wrap-anywhere text-parchment">{file.name}</p> : <Empty>No spreadsheet chosen.</Empty>}
        <p className="text-sm text-mist">
          In Google Sheets, choose <strong className="text-parchment">File › Download › Microsoft Excel (.xlsx)</strong>. The sheet holds players' names and
          emails: it's read here and never kept. No email is stored on a boon, or put in the report.
        </p>
        {busy && (
          <p role="status" className="mt-3 text-sm">
            {done.isPending ? "Importing…" : "Reading the spreadsheet…"} A sheet of a few thousand boons takes a little while.
          </p>
        )}
        <ErrorText error={dry.error ?? done.error} />
      </Card>
      {report && !dry.isPending && (
        <>
          <ReportCards report={report} />
          {file && (
            <Card title="Import">
              <p className="mb-3 text-sm text-mist">
                Every boon the dry run found is saved in {report.troupe_name}'s ledger at once, each with one line in its log, "Imported from the spreadsheet".
                No one is notified, and no Gallant is offered. Importing again is safe: it adds only what's new and updates what it made.
              </p>
              <Button type="button" disabled={busy} onClick={() => setConfirming(true)}>
                Import into {report.troupe_name}
              </Button>
              <Dialog title={`Import into ${report.troupe_name}?`} open={confirming} onClose={() => setConfirming(false)}>
                <p className="mb-4 text-sm">The boons are saved in {report.troupe_name}'s ledger as the dry run showed.</p>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
                    Not yet
                  </Button>
                  <Button
                    type="button"
                    disabled={done.isPending}
                    onClick={() =>
                      done.mutate(file, {
                        onSuccess: () => setConfirming(false),
                      })
                    }
                  >
                    Import
                  </Button>
                </div>
              </Dialog>
            </Card>
          )}
        </>
      )}
    </>
  );
}

function ReportCards({ report }: { report: BoonImport }) {
  const dryRun = report.dry_run;
  const download = () => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([report.csv], { type: "text/csv;charset=utf-8" }));
    link.download = `${report.troupe_name} boon import${dryRun ? " (dry run)" : ""}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const done = (what: string) => (dryRun ? `to be ${what}` : what);
  const matched = report.names.filter((n) => n.how === "matched");
  const byAlias = report.names.filter((n) => n.how === "alias");
  const kept = report.names.filter((n) => n.how === "unmatched" || n.how === "ambiguous");

  return (
    <>
      <Card
        title={dryRun ? "Dry run" : "Imported"}
        actions={
          <Button type="button" variant="secondary" onClick={download}>
            Download the report (CSV)
          </Button>
        }
      >
        {!report.ledger_on && <Notice>{report.troupe_name} doesn't keep a boon ledger: the boons won't show until its Boons feature is switched on.</Notice>}
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          <li>
            {plural(report.rows, "row")} read: {plural(report.added, "boon")} {done("added")}, {report.updated.toLocaleString()} {done("updated")},{" "}
            {report.unchanged.toLocaleString()} unchanged, {plural(report.skipped.length, "row")} skipped.
          </li>
          <li>
            {plural(report.flagged, "boon")} flagged for review; {plural(report.by_account, "boon")} entered by someone with an account here.
          </li>
          {report.general.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {dryRun && <p className="mt-2 text-xs text-mist">Nothing was saved.</p>}
        {report.kinds.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full max-w-sm text-sm">
              <caption className="sr-only">Boons by kind</caption>
              <thead>
                <tr className="text-left text-xs text-mist">
                  <th scope="col" className="py-1 font-normal">
                    Kind
                  </th>
                  <th scope="col" className="py-1 text-right font-normal">
                    Standing
                  </th>
                  <th scope="col" className="py-1 text-right font-normal">
                    Settled
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ash">
                {report.kinds.map((k) => (
                  <tr key={k.kind}>
                    <th scope="row" className="py-1 text-left font-normal">
                      {KINDS[k.kind]}
                    </th>
                    <td className="py-1 text-right">{k.standing.toLocaleString()}</td>
                    <td className="py-1 text-right">{k.settled.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card title="Names">
        <p className="mb-3 text-sm text-mist">
          Each name the sheet gives, matched to a character in the troupe by its name, a name it had before, or an alias on the Characters tab, ignoring
          capitals, spacing, quotes and a trailing "(D)". A name that matches no one, or more than one character, is kept as written, as a name only: staff can
          link it to a character from the boon later.
        </p>
        <NameList title="Kept as written" names={kept} open />
        <NameList title="Matched by alias" names={byAlias} />
        <NameList title="Matched" names={matched} />
      </Card>
      {(report.skipped.length > 0 || report.duplicates.length > 0 || report.notes.length > 0) && (
        <Card title="Rows to check">
          <RowList title={`Skipped (${report.skipped.length})`} items={report.skipped.map((s) => `${s.row}: ${s.note}`)} />
          <RowList
            title={`Likely duplicates (${report.duplicates.length})`}
            items={report.duplicates.map((d) =>
              d.in_ledger ? `${d.rows.join(", ")}: like a boon in the ledger already, ${d.what}` : `${d.rows.join(", ")} look alike: ${d.what}`,
            )}
          />
          <RowList title={`Notes (${report.notes.length})`} items={report.notes.map((n) => `${n.row}: ${n.note}`)} />
        </Card>
      )}
    </>
  );
}

function NameList({ title, names, open = false }: { title: string; names: NameCount[]; open?: boolean }) {
  return (
    <details open={open && names.length > 0} className="border-t border-ash py-2">
      <summary className="cursor-pointer text-sm text-parchment">
        {title} ({names.length.toLocaleString()})
      </summary>
      {names.length ? (
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {names.map((n) => (
            <li key={`${n.how}:${n.name}`} className="flex min-w-0 flex-wrap items-baseline gap-x-2">
              <OneLine text={n.name} className={n.character_id ? "" : "italic"} />
              {n.character_id && (
                <>
                  <span aria-hidden="true" className="text-mist">
                    →
                  </span>
                  <Link to={`/characters/${n.character_id}`} className="text-gold hover:underline">
                    {n.character_name}
                  </Link>
                </>
              )}
              {n.how === "ambiguous" && <Badge>More than one character</Badge>}
              <span className="text-xs text-mist">{plural(n.boons, "boon")}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-mist">None.</p>
      )}
    </details>
  );
}

function RowList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mb-3 last:mb-0">
      <SectionLabel>{title}</SectionLabel>
      <ul className="list-disc pl-5 text-sm wrap-anywhere">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
