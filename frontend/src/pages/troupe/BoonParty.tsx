import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { api, unwrap } from "../../api/client";
import type { BoonOwingOut, BoonPartyLedgerOut } from "../../api/types";
import { shortName, standingName } from "../../boons";
import { BackLink } from "../../components/BackLink";
import { CardHeading } from "../../components/Headings";
import { LinkButton } from "../../components/LinkButton";
import { Badge, ErrorText, Loading } from "../../components/ui";
import type { LedgerParty } from "./boonSearch";

const count = new Intl.NumberFormat("en-GB");
const weight = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });

/** "Owes 2 (weight 1.5) · Is owed 90 (weight 84)". */
function owingText(owes: BoonOwingOut, owed: BoonOwingOut): string {
  return `Owes ${count.format(owes.count)} (weight ${weight.format(owes.weight)}) · Is owed ${count.format(owed.count)} (weight ${weight.format(owed.weight)})`;
}

/**
 * The head of a character's own page of the ledger (#980), or a name only's, as the
 * troupe's old sheet had a tab for each audited character: the name, how they left
 * play if they have (a Harpy's, as the court knows it), and what they owe and are owed,
 * standing, counted and weighed by the troupe's weights as the Standings tab does:
 * with everyone on them in play, then, where it differs, with those who have left
 * too. Then the ways on: back to the whole ledger (`back`), making an audit of them
 * (`auditTo`, for those who may) and, for staff, their character sheet.
 */
export function BoonPartyHeader({ troupeId, party, back, auditTo }: { troupeId: string; party: LedgerParty; back: string; auditTo: string }) {
  const found = useQuery({
    queryKey: ["troupe-boons", troupeId, "party", party],
    queryFn: () =>
      unwrap(
        api.GET("/api/troupes/{troupe_id}/boon-party", {
          params: { path: { troupe_id: troupeId }, query: "character" in party ? { character_id: party.character } : { name: party.name } },
        }),
      ),
    placeholderData: (previous) => previous,
  });
  return (
    <section aria-label="Whose boons" className="flex flex-col gap-2">
      <BackLink label="The whole ledger" to={back} className="self-start" />
      {found.isPending ? (
        <Loading compact />
      ) : found.error ? (
        <ErrorText error={found.error} />
      ) : (
        <Head found={found.data} auditTo={auditTo} />
      )}
    </section>
  );
}

function Head({ found, auditTo }: { found: BoonPartyLedgerOut; auditTo: string }) {
  const { party } = found;
  const left = standingName(party);
  // Only where someone on their boons has left: otherwise the same again.
  const more = found.owes_everyone.count !== found.owes.count || found.owed_everyone.count !== found.owed.count;
  const id = party.character_id;
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <CardHeading as="h3">
            <span className={`wrap-anywhere ${id ? "" : "italic"}`} title={party.name}>
              {shortName(party.name)}
            </span>
          </CardHeading>
          {!id && <span className="text-xs text-mist">(name only)</span>}
          {left && <Badge>{left}</Badge>}
          {party.boonbreaker && <Badge tone="blood">Boonbreaker</Badge>}
        </div>
        <p className="text-sm text-parchment">{owingText(found.owes, found.owed)}</p>
        {more && <p className="text-xs text-mist">With boons naming someone who has left: {owingText(found.owes_everyone, found.owed_everyone).toLowerCase()}</p>}
      </div>
      {id && (found.can_audit || found.sheet) && (
        <div className="flex flex-wrap items-center gap-2">
          {found.can_audit && (
            <LinkButton variant="secondary" to={`${auditTo}?character=${id}`}>
              Make an audit
            </LinkButton>
          )}
          {found.sheet && (
            <Link to={`/characters/${id}`} className="inline-flex min-h-10 items-center text-sm text-mist underline hover:text-parchment">
              Character sheet
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
