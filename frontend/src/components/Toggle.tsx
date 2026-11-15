import { ChoiceRow, type ChoiceProps } from "./Checkbox";

/**
 * A switch (`role="switch"`): gold and to the right when on, a grey knob on night when off.
 *
 * Which to use: a `Toggle` when the change takes effect at once, on its own (a feature
 * switched on, a setting saved as it is tapped, a filter). A `Checkbox` when it is one of
 * several ticks in a list, or part of a form saved with a button.
 *
 * `end` puts the switch at the row's far end, after its words, as a settings list has it.
 */
export function Toggle({ end = false, ...props }: ChoiceProps & { end?: boolean }) {
  const { checked, onChange, disabled } = props;
  return (
    <ChoiceRow
      props={props}
      end={end}
      pad="py-2"
      wordsPad="pt-0.5"
      indent="pl-14"
      control={(aria) => (
        <span className="relative inline-flex h-6 w-11 shrink-0">
          <input
            type="checkbox"
            role="switch"
            {...aria}
            aria-checked={checked}
            checked={checked}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
            className="peer h-6 w-11 cursor-pointer appearance-none rounded-full border border-line bg-night transition-colors checked:border-gold checked:bg-gold/30 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute top-1 left-1 h-4 w-4 rounded-full bg-mist transition-transform peer-checked:translate-x-5 peer-checked:bg-gold peer-disabled:opacity-60"
          />
        </span>
      )}
    />
  );
}
