/**
 * A small round chevron over the faded edge of a row of tabs that scrolls
 * sideways, shown while more of the row is beyond that edge (#921); pressing it
 * scrolls the row that way. It sits in the row's `relative` box, beside the part
 * that scrolls. Hidden from a screen reader and out of the keyboard's way: the
 * tabs themselves are reached with Tab, and the row scrolls to each in turn.
 */
export function RowChevron({ side, onPress }: { side: "start" | "end"; onPress: () => void }) {
  return (
    <button
      type="button"
      aria-hidden
      tabIndex={-1}
      data-testid={`row-chevron-${side}`}
      onClick={onPress}
      // A 40 px tap target over the 40 px fade, the round smaller inside it.
      className={`group absolute top-1/2 grid h-10 w-10 -translate-y-1/2 cursor-pointer place-items-center print:hidden ${side === "start" ? "left-0" : "right-0"}`}
    >
      <span className="grid h-7 w-7 place-items-center rounded-full border border-ash bg-dusk text-mist shadow-sm group-hover:border-mist group-hover:text-parchment">
        <svg viewBox="0 0 20 20" className={`h-3.5 w-3.5 ${side === "start" ? "rotate-180" : ""}`}>
          <path d="M7.5 4.5 13 10l-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </button>
  );
}
