import { Link } from "react-router";
import { Card } from "../../../components/ui";
import { manualLink } from "../../../manualLink";

/**
 * The way into the import of a troupe's boon ledger from its old spreadsheet (#989),
 * beside the import from Yorick: the card says what it does and opens it.
 */
export function BoonImportCard() {
  return (
    <Card title="Import a boon ledger">
      <p className="mb-3 text-sm text-mist">
        Bring a troupe's boons across from its old spreadsheet, downloaded as .xlsx: check what a dry run finds, then import it. Running it again updates what
        it made.{" "}
        <Link to={manualLink("custodian", "importing-a-boon-ledger")} className="text-gold hover:underline">
          How it works
        </Link>
      </p>
      <Link to="/custodian/tools/boon-import" className="text-sm text-gold hover:underline">
        Open the boon import
      </Link>
    </Card>
  );
}
