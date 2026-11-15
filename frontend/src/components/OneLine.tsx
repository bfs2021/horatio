import { useLayoutEffect, useRef, useState } from "react";
import { shortName } from "../boons";
import { usePopover } from "./InfoButton";

/**
 * Text that may run long kept to one line, such as a side of a boon written as a passage
 * of story (#990): cut short with "…" past `most` characters, and to the width it has,
 * the whole of it on hover. Once it is cut, a "more" button beside it opens it in full,
 * for a phone. Printed, it is shown in full. It sits in a line of text, a list or a
 * table's cell; `className` is for its look (a colour, italics).
 */
export function OneLine({ text, most = 60, className = "" }: { text: string; most?: number; className?: string }) {
  const { open, toggle, id, root, button, popover, style } = usePopover();
  const line = useRef<HTMLSpanElement>(null);
  const [narrow, setNarrow] = useState(false);
  const short = shortName(text, most);

  // Cut to the width it has too, as a phone's narrow column cuts it.
  useLayoutEffect(() => {
    const el = line.current;
    if (!el) return;
    const measure = () => setNarrow(el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, [short]);

  const cut = short !== text || narrow;
  return (
    <span ref={root} className="relative inline-flex max-w-full min-w-0 items-baseline gap-1 align-bottom print:inline">
      {/* Clamped to a line rather than kept from wrapping, so it never makes what holds it wider than the screen. */}
      <span ref={line} title={cut ? text : undefined} className={`line-clamp-1 min-w-0 wrap-anywhere print:hidden ${className}`}>
        {short}
      </span>
      <span className={`hidden whitespace-pre-line wrap-anywhere print:inline ${className}`}>{text}</span>
      {(cut || open) && (
        <button
          ref={button}
          type="button"
          aria-label={`Read all of “${shortName(text, 40)}”`}
          aria-expanded={open}
          aria-controls={id}
          onClick={toggle}
          className="shrink-0 text-xs text-gold underline hover:text-parchment print:hidden"
        >
          more
        </button>
      )}
      {open && (
        <span
          ref={popover}
          id={id}
          style={style}
          className="absolute top-full left-0 z-20 mt-1 block max-h-64 w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-md border border-ash bg-night p-3 text-left font-sans text-xs leading-relaxed font-normal whitespace-pre-line text-parchment not-italic shadow-lg wrap-anywhere print:hidden"
        >
          {text}
        </span>
      )}
    </span>
  );
}
