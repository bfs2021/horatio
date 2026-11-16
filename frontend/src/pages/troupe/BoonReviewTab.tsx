import { useQuery } from "@tanstack/react-query";
import { useContext } from "react";
import { api, unwrap } from "../../api/client";
import { BOON_PAGE } from "../../boons";
import { ErrorText, Loading } from "../../components/ui";
import { BoonDetail } from "./BoonDetail";
import { HarpyMode } from "./boonKeeper";
import { BoonReviewQueue } from "./BoonReview";

/**
 * The boons screen's To review tab (#982), for whoever reviews: its running staff, a
 * Harpy (#688), or a Lesser Harpy who may settle boons (#984). The review queue
 * (#687) on its own, apart from the ledger: every boon waiting for review or flagged,
 * each opened under its row to review it. A Harpy given only the review queue sees
 * this and nothing else of the ledger.
 */
export function BoonReviewTab({ troupeId }: { troupeId: string }) {
  const harpy = useContext(HarpyMode);
  // The queue's own read: the BoonReviewQueue below shares it.
  const review = useQuery({
    queryKey: ["boon-review", troupeId],
    queryFn: () => unwrap(api.GET("/api/troupes/{troupe_id}/boon-review", { params: { path: { troupe_id: troupeId } } })),
  });
  if (review.isPending) return <Loading />;
  if (review.error) return <ErrorText error={review.error} />;
  const characters = review.data.characters ?? [];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-mist">
        Boons players reported that wait for review, and boons flagged for a ruling ({BOON_PAGE}). Accept each one, or don&apos;t, with a reason its player sees;
        link a name to a character; clear a flag.
        {harpy?.access === "submissions" && " The rest of the ledger is staff's."}
      </p>
      <BoonReviewQueue troupeId={troupeId} detail={(boonId) => <BoonDetail troupeId={troupeId} boonId={boonId} characters={characters} />} />
    </div>
  );
}
