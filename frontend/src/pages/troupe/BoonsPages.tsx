import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router";
import { Loading } from "../../components/ui";
import { AuditsCard } from "./BoonAudits";
import { BoonbreakersTab } from "./Boonbreakers";
import { BoonReviewTab } from "./BoonReviewTab";
import { BoonStandingsTab } from "./BoonStandingsTab";
import { BoonsTab } from "./BoonsTab";
import { BoonTabs, type BoonPart } from "./BoonTabs";

// The statistics bring d3 with them (#702), so they load only when opened (#706).
const BoonStatisticsPage = lazy(() => import("./BoonStatisticsPage").then((m) => ({ default: m.BoonStatisticsPage })));

// Running staff have every part: they review, declare Boonbreakers and audit.
const PARTS: BoonPart[] = ["ledger", "review", "standings", "statistics", "boonbreakers", "audits"];

/**
 * The troupe's boons, for its running staff, as one tab (#780): the ledger, what waits
 * for review, the standings and the statistics, and the Boonbreakers and audits, each
 * a tab of its own (#982) so the ledger opens on its boons. `holdsReview`: the troupe
 * holds the boons players report for review, so To review is always there.
 */
export function BoonsPages({ troupeId, holdsReview }: { troupeId: string; holdsReview: boolean }) {
  const base = `/troupes/${troupeId}/boons`;
  return (
    <>
      <BoonTabs troupeId={troupeId} base={base} parts={PARTS} holdsReview={holdsReview} />
      <Routes>
        <Route index element={<BoonsTab troupeId={troupeId} review={`${base}/review`} />} />
        <Route path="review" element={<BoonReviewTab troupeId={troupeId} />} />
        <Route path="standings" element={<BoonStandingsTab troupeId={troupeId} />} />
        <Route
          path="statistics"
          element={
            <Suspense fallback={<Loading />}>
              <BoonStatisticsPage troupeId={troupeId} />
            </Suspense>
          }
        />
        <Route path="boonbreakers" element={<BoonbreakersTab troupeId={troupeId} />} />
        <Route path="audits" element={<AuditsCard troupeId={troupeId} />} />
      </Routes>
    </>
  );
}
