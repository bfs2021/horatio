import { ActionMenu, MenuGroup, MenuItem } from "../../components/ActionMenu";

/** The ledger's filters as its list sends them, which "This view" exports. */
export type LedgerQuery = Record<string, string | readonly string[] | number | boolean | undefined>;

// What reads one page of the list, not which boons: the export has them all.
const PAGING = new Set(["limit", "offset"]);

/** Where the export is: the whole ledger, or with the view and filters of `query`. */
export function exportHref(troupeId: string, format: "csv" | "xlsx", query: LedgerQuery | null): string {
  const params = new URLSearchParams({ format });
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === "" || PAGING.has(key)) continue;
    for (const one of Array.isArray(value) ? value : [value]) params.append(key, String(one));
  }
  return `/api/troupes/${troupeId}/boon-export?${params}`;
}

/** Downloads the file, as a link with `download` would: the API names it. */
function download(href: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = "";
  link.click();
}

/**
 * For staff (#986), and the Harpy where the troupe lets them (#987): the quiet ⋯ at
 * the end of the ledger's toolbar, to export the ledger as a CSV file or a
 * spreadsheet: the view and filters showing (`query`; none while the review queue
 * shows), or the whole ledger. The Harpy's file holds only what their ledger shows
 * them; the API leaves out the rest.
 */
export function BoonExportMenu({ troupeId, query }: { troupeId: string; query: LedgerQuery | null }) {
  return (
    <ActionMenu label="More for the ledger" variant="ghost" menuClassName="w-60" className="ml-auto">
      <MenuGroup label="Export">
        <div aria-hidden="true" className="px-3 pt-1 pb-0.5 text-xs text-mist">
          Export
        </div>
        {query && (
          <>
            <MenuItem onSelect={() => download(exportHref(troupeId, "csv", query))}>This view (CSV)</MenuItem>
            <MenuItem onSelect={() => download(exportHref(troupeId, "xlsx", query))}>This view (spreadsheet)</MenuItem>
          </>
        )}
        <MenuItem onSelect={() => download(exportHref(troupeId, "csv", null))}>Whole ledger (CSV)</MenuItem>
        <MenuItem onSelect={() => download(exportHref(troupeId, "xlsx", null))}>Whole ledger (spreadsheet)</MenuItem>
      </MenuGroup>
    </ActionMenu>
  );
}
