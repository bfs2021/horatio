import type { ReactNode } from "react";
import { Toggle } from "./Toggle";

function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

type Words = {
  /** What it is: "Paper", "Quick notes". */
  label: string;
  /** A line under the label saying what it does. */
  hint?: ReactNode;
};

type Control = {
  children: ReactNode;
  /** Two or three short choices, narrow enough to stay beside a short label on a phone too, with the hint under both. */
  short?: boolean;
};

type Switch = {
  /** On or off, saved as it changes: the row is a `Toggle`, and the whole row is its tap target. */
  checked: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
};

/**
 * One setting in a `SettingCard`'s list (#910): every row the same shape, divided by a
 * line. Its label and hint on the left; its control (a `Segmented`, a `Select`, a field)
 * on the right from `sm` up, and under the label on a phone, unless it is `short`. Given
 * `checked` and `onChange` instead of a control, the row is a `Toggle` with its switch at
 * the end, at every width.
 */
export function SettingRow(props: Words & (Control | Switch)) {
  const { label, hint } = props;
  if ("checked" in props)
    return (
      <div className="border-b border-ash/60 py-1 last:border-0">
        <Toggle label={label} hint={hint} checked={props.checked} onChange={props.onChange} disabled={props.disabled} end />
      </div>
    );
  // The label, its hint under it, and the control to the right of both. On a phone the
  // hint takes the whole width, and the control goes under it unless it is short.
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 border-b border-ash/60 py-3 last:border-0">
      <p className="col-[1] row-[1] text-sm text-parchment">{label}</p>
      {hint && <p className="col-[1/-1] row-[2] text-xs text-mist sm:col-[1]">{hint}</p>}
      <div className={cx("min-w-0", props.short ? "col-[2] row-[1]" : "col-[1/-1] row-[3] mt-2 sm:col-[2] sm:mt-0", hint ? "sm:row-[1/span_2]" : "sm:row-[1]")}>
        {props.children}
      </div>
    </div>
  );
}
