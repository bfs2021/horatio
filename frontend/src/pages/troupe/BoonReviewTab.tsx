import { useQuery } from "@tanstack/react-query";
import { useContext } from "react";
import { api, unwrap } from "../../api/client";
import { BOON_PAGE } from "../../boons";
import { SectionLabel } from "../../components/Headings";
import { Empty, ErrorText, Loading } from "../../components/ui";
import { ApprovalSettings, WaitingForApproval } from "./BoonApproval";
import { approvalSummary } from "./boonApproval";
import { BoonDetail } from "./BoonDetail";
import { HarpyMode } from "./boonKeeper";
import { ToldOfReports } from "./BoonReportsTold";
import { BoonReviewQueue } from "./BoonReview";

/**
 * The boons screen's To review tab (#982), for whoever reviews: its running staff, a
 * Harpy (#688), or a Lesser Harpy the Harpy lets approve reported boons (#993). One
 * holding space (#993): the boons players reported that wait for approval first, as
 * rows like the ledger's with Accept and Don't accept on each, then those flagged for
 * a ruling. Each opens under its row to review it. Whoever runs the queue (staff, the
 * Harpy) says which kinds go straight in, behind Approval settings. A Harpy given only
 * the review queue sees this and nothing else of the ledger.
 */
export function BoonReviewTab({ troupeId }: { troupeId: string }) {
  const harpy = useContext(HarpyMode);
  // The queue's own read, which the tabs' count and the totals strip share.
  const review = useQuery({
    queryKey: ["boon-review", troupeId],
    queryFn: () => unwrap(api.GET("/api/troupes/{troupe_id}/boon-review", { params: { path: { troupe_id: troupeId } } })),
  });
  if (review.isPending) return <Loading />;
  if (review.error) return <ErrorText error={review.error} />;
  const { boons, held = false, auto_accept: kinds = [], sets_approval: sets = false } = review.data;
  const characters = review.data.characters ?? [];
  const detail = (boonId: string) => <BoonDetail troupeId={troupeId} boonId={boonId} characters={characters} />;
  const waiting = boons.filter((b) => b.state === "pending");
  const flagged = boons.filter((b) => b.state !== "pending");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="max-w-prose text-sm text-mist">
          Boons players reported that wait for approval, and boons flagged for a ruling ({BOON_PAGE}). Accept each one, or don&apos;t, with a reason its player sees;
          link a name to a character; clear a flag.
          {held && ` ${approvalSummary(kinds)}`}
          {harpy?.access === "submissions" && " The rest of the ledger is staff's."}
        </p>
        {held && sets && <ApprovalSettings troupeId={troupeId} kinds={kinds} />}
      </div>
      {harpy && <ToldOfReports troupeId={troupeId} as="keeper" />}
      {boons.length === 0 && !held ? (
        <Empty>Nothing waits for review, and no boon is flagged.</Empty>
      ) : (
        <>
          {(held || waiting.length > 0) && (
            <section aria-labelledby="waiting-for-approval" className="flex flex-col gap-2">
              <SectionLabel as="h3" id="waiting-for-approval">
                Waiting for approval
              </SectionLabel>
              <WaitingForApproval troupeId={troupeId} boons={waiting} detail={detail} />
            </section>
          )}
          <section aria-labelledby="flagged-boons" className="flex flex-col gap-2">
            <SectionLabel as="h3" id="flagged-boons">
              Flagged
            </SectionLabel>
            <BoonReviewQueue boons={flagged} detail={detail} />
          </section>
        </>
      )}
    </div>
  );
}
