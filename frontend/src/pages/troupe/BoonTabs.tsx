import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router";
import { api, unwrap } from "../../api/client";
import { PageTabs, type Tab } from "../../components/ui";

/** The parts of the boons screen (#780, #982), in the order its tabs go. */
export type BoonPart = "ledger" | "review" | "standings" | "statistics" | "boonbreakers" | "audits";

const LABELS: Record<BoonPart, string> = {
  ledger: "Ledger",
  review: "To review",
  standings: "Standings",
  statistics: "Statistics",
  boonbreakers: "Boonbreakers",
  audits: "Audits",
};

/**
 * Where a part is, under the boons screen's own address: the first of `parts` (those
 * the person may use, in order) at the address itself, "", and each other at its name
 * ("review", "boonbreakers"). The ledger is first for all who see it; a Harpy given
 * only the review queue opens on To review.
 */
export function partPath(parts: BoonPart[], part: BoonPart): string {
  return parts[0] === part ? "" : part;
}

/** A part's address, under the boons screen's `base`. */
export function partTo(base: string, parts: BoonPart[], part: BoonPart): string {
  const path = partPath(parts, part);
  return path ? `${base}/${path}` : base;
}

/**
 * The boons screen's tabs (#982): Ledger · To review · Standings · Statistics ·
 * Boonbreakers · Audits, as many of them as `parts` gives the person, for staff under
 * the troupe and for the Harpy and Lesser Harpies in play. To review carries how many
 * wait, and shows while some do, while it is open, or always where the troupe holds
 * what players report for review (`holdsReview`). Boonbreakers carries how many are
 * marked now. On a phone the row scrolls sideways under the tab bars' chevrons. With
 * only one part there are no tabs.
 */
export function BoonTabs({ troupeId, base, parts, holdsReview }: { troupeId: string; base: string; parts: BoonPart[]; holdsReview: boolean }) {
  const { pathname } = useLocation();
  // The same reads as the tabs themselves make, so they are shared, not made twice.
  const review = useQuery({
    queryKey: ["boon-review", troupeId],
    queryFn: () => unwrap(api.GET("/api/troupes/{troupe_id}/boon-review", { params: { path: { troupe_id: troupeId } } })),
    enabled: parts.includes("review"),
  });
  const marks = useQuery({
    queryKey: ["boonbreakers", troupeId],
    queryFn: () => unwrap(api.GET("/api/troupes/{troupe_id}/boonbreakers", { params: { path: { troupe_id: troupeId } } })),
    enabled: parts.includes("boonbreakers"),
  });
  const toReview = review.data?.boons.length ?? 0;
  const marked = marks.data?.marks.filter((m) => !m.lifted_at).length ?? 0;
  const reviewTo = partTo(base, parts, "review");
  const shown = parts.filter((p) => p !== "review" || holdsReview || toReview > 0 || pathname === reviewTo || partPath(parts, p) === "");
  if (shown.length < 2) return null;
  const tabs: Tab[] = shown.map((p) => ({
    to: partTo(base, parts, p),
    label: LABELS[p],
    end: partPath(parts, p) === "",
    ...(p === "review" ? { count: toReview } : p === "boonbreakers" ? { count: marked, countLabel: "marked" } : {}),
  }));
  return <PageTabs label="Boons" tabs={tabs} scrolls />;
}
