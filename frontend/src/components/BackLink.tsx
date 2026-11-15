import { Link } from "react-router";

const PAGE = "inline-flex min-h-10 min-w-0 items-center text-sm text-mist hover:text-parchment";
/** A print page's own bar is black on grey whatever the theme, like the paper under it. */
const PRINT = "inline-flex min-h-10 items-center text-sm underline";

/**
 * The way back, as "← {label}" (#902). The label names the place it goes to ("All
 * locations", the troupe's name), never just "Back", except on a print page going
 * back to the page it was opened from. A link when given `to`; a button when the
 * way back is in the page itself (`onClick`). Two or more levels up is a
 * `Breadcrumb` instead. In a column, give it `self-start` so only its words are the link.
 */
export function BackLink({
  label,
  to,
  onClick,
  relative,
  print = false,
  className = "",
}: { label: string; print?: boolean; className?: string } & (
  | { to: string; relative?: "path"; onClick?: undefined }
  | { onClick: () => void; to?: undefined; relative?: undefined }
)) {
  const classes = `${print ? PRINT : PAGE} ${className}`;
  const text = <span className="truncate">← {label}</span>;
  if (to === undefined)
    return (
      <button type="button" className={classes} onClick={onClick}>
        {text}
      </button>
    );
  return (
    <Link to={to} relative={relative} className={classes}>
      {text}
    </Link>
  );
}
