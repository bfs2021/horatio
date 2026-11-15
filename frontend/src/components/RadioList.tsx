import { useId } from "react";
import type { ReactNode } from "react";
import { ChoiceRow } from "./Checkbox";
import type { ChoiceValue } from "./Segmented";

function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export type RadioOption<T extends ChoiceValue> = {
  value: T;
  /** The option: its accessible name. */
  label: ReactNode;
  /** The line that explains it, read as its description. */
  hint?: ReactNode;
  /** Under its words, outside the tap target: a field that goes with it. */
  children?: ReactNode;
};

/**
 * One choice of several, one to a line (`role="radiogroup"`), each with a label and
 * an optional line under it: a 20 px round mark on night with a `line` edge, gold
 * when chosen, the same size and look as a `Checkbox`. The whole line is the tap
 * target, at least 40 px tall. Arrow keys move the choice, as with any radio buttons.
 *
 * Which to use: a `RadioList` where options need a line of explanation (who keeps
 * status, what the Harpy sees). A `Segmented` for 2 to 4 that need none. A `Select`
 * for more than about 7.
 */
export function RadioList<T extends ChoiceValue>({
  label,
  hideLabel = false,
  labelClassName = "mb-1 text-sm text-mist",
  value,
  options,
  onChange,
  disabled,
  className,
  children,
}: {
  /** The question it answers, shown above the options as the group's name. */
  label: ReactNode;
  /** Read but not shown, where the card's title or text above already asks it. */
  hideLabel?: boolean;
  /** The question's look, where it should match the headings around it. */
  labelClassName?: string;
  value: T | null | undefined;
  options: RadioOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  /** For the group: its spacing, a border. */
  className?: string;
  /** After the options, inside the group: what goes with every option, such as a figure. */
  children?: ReactNode;
}) {
  const name = useId();
  return (
    <fieldset role="radiogroup" disabled={disabled} className={cx("flex min-w-0 flex-col", className)}>
      <legend className={hideLabel ? "sr-only" : labelClassName}>{label}</legend>
      {options.map((o) => (
        <ChoiceRow
          key={String(o.value)}
          props={{ label: o.label, hint: o.hint, checked: o.value === value, onChange: () => onChange(o.value), disabled, children: o.children }}
          pad="py-2.5"
          indent="pl-8"
          control={(aria) => (
            <span className="relative inline-flex h-5 w-5 shrink-0">
              <input
                type="radio"
                name={name}
                {...aria}
                checked={o.value === value}
                disabled={disabled}
                onChange={() => onChange(o.value)}
                className="peer h-5 w-5 cursor-pointer appearance-none rounded-full border border-line bg-night transition-colors checked:border-gold disabled:cursor-not-allowed disabled:opacity-50"
              />
              <span aria-hidden className="pointer-events-none absolute inset-[5px] hidden rounded-full bg-gold peer-checked:block peer-disabled:opacity-50" />
            </span>
          )}
        />
      ))}
      {children}
    </fieldset>
  );
}
