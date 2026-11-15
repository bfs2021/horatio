import { useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";

function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/** A choice a `Segmented` or a `RadioList` offers. */
export type ChoiceValue = string | number | boolean;

export type SegmentedOption<T extends ChoiceValue> = {
  value: T;
  /** A word or two: "Pips", "A4", "21:30". */
  label: ReactNode;
};

/**
 * One choice of 2 to 4 short ones, side by side in one bordered row (`role="radiogroup"`):
 * the chosen one gold on ash. Each is at least 40 px tall on a touch screen. Arrow keys
 * move the choice, Home and End go to the first and last, and Tab leaves the row.
 *
 * Which to use: a `Segmented` for 2 to 4 options that need no explaining (Numbers or
 * Pips, US Letter or A4). A `RadioList` where each option needs a line of explanation.
 * A `Select` for more than about 7.
 *
 * `value` is the chosen one, or none of them (Theme's Light, which is never kept).
 */
export function Segmented<T extends ChoiceValue>({
  label,
  value,
  options,
  onChange,
  disabled,
  className,
}: {
  /** The question it answers, as its accessible name: "Show ratings as". */
  label: string;
  value: T | null | undefined;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  /** For the row: its place in the layout. */
  className?: string;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const chosen = options.findIndex((o) => o.value === value);
  // Tab reaches the row once, on the chosen option, or the first where none is.
  const tabStop = chosen === -1 ? 0 : chosen;
  const move = (e: KeyboardEvent, from: number) => {
    const last = options.length - 1;
    const to =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? from === last
          ? 0
          : from + 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? from === 0
            ? last
            : from - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : null;
    if (to === null) return;
    e.preventDefault();
    buttons.current[to]?.focus();
    if (to !== chosen) onChange(options[to]!.value);
  };
  return (
    <span role="radiogroup" aria-label={label} className={cx("inline-flex max-w-full overflow-hidden rounded-md border border-ash", className)}>
      {options.map((o, i) => {
        const on = i === chosen;
        return (
          <button
            key={String(o.value)}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={i === tabStop ? 0 : -1}
            disabled={disabled}
            onClick={() => {
              if (!on) onChange(o.value);
            }}
            onKeyDown={(e) => move(e, i)}
            className={cx(
              "min-h-9 px-3 text-sm transition-colors focus-visible:-outline-offset-2 disabled:cursor-not-allowed pointer-coarse:min-h-10 [&+&]:border-l [&+&]:border-ash",
              on ? "bg-gold/20 text-gold" : "text-mist hover:text-parchment",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </span>
  );
}
