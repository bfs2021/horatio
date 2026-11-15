import { Link } from "react-router";

/**
 * A troupe's or a character's tab the person may not open, or that isn't there
 * (#907): rather than nothing under the tabs, says so, with the way back to the
 * page's first tab (`to`).
 */
export function NotOpenHere({ name, to }: { name: string; to: string }) {
  return (
    <div className="flex flex-col items-start gap-2 py-2 text-sm">
      <p className="text-parchment">This part of {name} isn't open to you, or doesn't exist.</p>
      <Link to={to} className="text-gold underline hover:text-parchment">
        Back to {name}
      </Link>
    </div>
  );
}
