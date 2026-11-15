import type { TraitChangeOut } from "../api/types";
import { wordingLabel, wordingOf, type Wording } from "../houseWording";
import { Markdown } from "./Markdown";
import { Badge } from "./ui";

/**
 * Beside a book trait the character's troupe bans (horatio.book_traits): marked
 * "Banned in this troupe", and the reason after it. Those who hold it keep it.
 */
export function BannedMark({ change }: { change?: TraitChangeOut | null }) {
  if (!change?.banned) return null;
  return (
    <span className="ml-2">
      <Badge tone="blood">Banned in this troupe</Badge>
      {change.ban_reason && <span className="ml-1 text-xs text-mist">{change.ban_reason}</span>}
    </span>
  );
}

/**
 * Beside a merit or flaw the character's troupe moved to another category
 * (horatio.book_traits): "Category changed in this troupe", then both categories.
 */
export function CategoryMark({ change }: { change?: Pick<TraitChangeOut, "kind" | "book_kind"> | null }) {
  if (!change?.kind) return null;
  return (
    <span className="ml-2">
      <Badge tone="gold">Category changed in this troupe</Badge>
      <span className="ml-1 text-xs text-mist">
        {change.kind} here, {change.book_kind ?? "another"} in the book
      </span>
    </span>
  );
}

/**
 * The troupe's own wording for a book trait, in Markdown with the safe renderer,
 * always marked as the troupe's: under the book's summary, or in its place.
 */
export function HouseWording({ change, className = "" }: { change?: Partial<Wording> | null; className?: string }) {
  const wording = wordingOf(change);
  if (!wording) return null;
  return (
    <div className={`border-l-2 border-gold/60 pl-2 text-parchment ${className}`} data-testid="house-wording">
      <p className="text-xs text-gold">{wordingLabel(wording)}</p>
      <Markdown text={wording.wording} />
    </div>
  );
}
