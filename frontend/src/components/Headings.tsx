import type { ReactNode } from "react";

/*
 * The heading scale (#901). A screen uses these four steps and no others:
 *
 * 1. Page title: `PageTitle` (ui.tsx). An `h1` in the display font, parchment.
 * 2. Card title: `Card`'s `title` (ui.tsx). An `h2` in the display font, gold,
 *    `text-lg`, or `text-base` when the card is `dense`.
 * 3. A heading inside a card: `CardHeading`. The display font, gold, `text-base`.
 * 4. A group label: `SectionLabel`. The small grey capitals that name a list or
 *    a group of things, in the plain font.
 *
 * Both take `as` for the heading's level, so the page's outline stays right, and
 * `className` for spacing only (`mb-1`, `mt-4`), never for colour or size.
 * Print pages (`*PrintPage.tsx`, `BadgePage.tsx`, `pages/jyhad/`) keep their own.
 */

type Level = "h2" | "h3" | "h4";

type HeadingProps = {
  /** The heading's level: `h3` unless the outline wants another. */
  as?: Level;
  /** Spacing only. */
  className?: string;
  id?: string;
  children: ReactNode;
};

function heading(look: string, { as: Tag = "h3", className, id, children }: HeadingProps) {
  return (
    <Tag id={id} className={className ? `${look} ${className}` : look}>
      {children}
    </Tag>
  );
}

/** The small grey capitals that name a group of things, such as a list's section. */
export function SectionLabel(props: HeadingProps) {
  return heading("font-sans text-xs tracking-wide text-mist uppercase", props);
}

/** A heading inside a card, one step below the card's own title. */
export function CardHeading(props: HeadingProps) {
  // `font-display` so an `h4` matches: the base styles give it only to h1 to h3.
  return heading("font-display text-base text-gold", props);
}
