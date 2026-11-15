import { useId } from "react";
import type { ReactNode } from "react";

function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/** What a `Checkbox` and a `Toggle` both take. */
export type ChoiceProps = {
  /** What it turns on: the control's accessible name, unless `aria-label` gives another. */
  label: ReactNode;
  /** A line under the label, read as the control's description. */
  hint?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Read but not shown, where a column heading or the row around it already says it. */
  hideLabel?: boolean;
  /** The name, where the label shows more than it (a badge beside it, a sentence that changes). */
  "aria-label"?: string;
  /** For the row: its spacing, a border, its text colour. */
  className?: string;
  /** Under the label and hint, outside the tap target: links, a button, a field. */
  children?: ReactNode;
};

/**
 * The row a `Checkbox`, a `Toggle` or a `RadioList` option makes: the control and its words in one label, so
 * the whole row is the tap target, at least 40 px tall. The name is the label alone
 * and the hint is its description, however much the row holds.
 */
export function ChoiceRow({
  props,
  control,
  end = false,
  pad,
  wordsPad,
  indent,
}: {
  props: ChoiceProps;
  /** The input, given the ids that name and describe it. */
  control: (aria: { "aria-labelledby"?: string; "aria-label"?: string; "aria-describedby"?: string }) => ReactNode;
  /** The control after the words, at the row's far end, as a settings list has it. */
  end?: boolean;
  /** Padding that makes the row 40 px tall around the control. */
  pad: string;
  /** Padding that lines the first line of words up with the control's middle. */
  wordsPad?: string;
  /** Lines children up under the words. */
  indent: string;
}) {
  const id = useId();
  const { label, hint, hideLabel, disabled, className, children } = props;
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  const input = control({
    "aria-labelledby": props["aria-label"] ? undefined : labelId,
    "aria-label": props["aria-label"],
    "aria-describedby": hint && !hideLabel ? hintId : undefined,
  });
  const words = (
    <span className={cx("flex min-w-0 flex-col gap-0.5", wordsPad, hideLabel && "sr-only")}>
      <span id={labelId}>{label}</span>
      {hint && !hideLabel && (
        <span id={hintId} className="text-xs text-mist">
          {hint}
        </span>
      )}
    </span>
  );
  const row = (
    <label className={cx("flex min-h-10 items-start gap-3 text-sm", pad, end && "justify-between", disabled ? "cursor-not-allowed" : "cursor-pointer", !children && className)}>
      {end ? (
        <>
          {words}
          {input}
        </>
      ) : (
        <>
          {input}
          {words}
        </>
      )}
    </label>
  );
  if (!children) return row;
  return (
    <div className={className}>
      {row}
      <div className={end ? undefined : indent}>{children}</div>
    </div>
  );
}

/**
 * A tick box: a 20 px box on night with a `line` edge, ticked in gold.
 *
 * Which to use: a `Checkbox` when it is one of several ticks in a list (the clans with
 * a seat, the sects a character may join from), or part of a form saved with a button.
 * A `Toggle` when the change takes effect at once, on its own.
 */
export function Checkbox(props: ChoiceProps) {
  const { checked, onChange, disabled } = props;
  return (
    <ChoiceRow
      props={props}
      pad="py-2.5"
      indent="pl-8"
      control={(aria) => (
        <span className="relative inline-flex h-5 w-5 shrink-0">
          <input
            type="checkbox"
            {...aria}
            checked={checked}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
            className="peer h-5 w-5 cursor-pointer appearance-none rounded border border-line bg-night transition-colors checked:border-gold disabled:cursor-not-allowed disabled:opacity-50"
          />
          <svg
            aria-hidden
            viewBox="0 0 20 20"
            className="pointer-events-none absolute inset-0 hidden h-5 w-5 text-gold peer-checked:block peer-disabled:opacity-50"
          >
            <path d="M5 10.5l3.2 3.2L15 6.8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
    />
  );
}
