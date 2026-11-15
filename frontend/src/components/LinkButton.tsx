import type { AnchorHTMLAttributes } from "react";
import { Link, type LinkProps } from "react-router";
import { buttonClasses, type Variant } from "./ui";

type Props = { variant?: Variant; className?: string } & (
  | ({ href?: undefined } & LinkProps)
  | ({ href: string; to?: undefined } & AnchorHTMLAttributes<HTMLAnchorElement>)
);

/**
 * A link that looks like a `Button` (#902): the same variants and the same 40 px
 * height. A `Link` within the app; an `<a>` when given `href`, for a download or a
 * page outside it.
 */
export function LinkButton({ variant = "primary", className, ...props }: Props) {
  const classes = buttonClasses(variant, className);
  if (props.href !== undefined) return <a {...props} className={classes} />;
  return <Link {...props} className={classes} />;
}
