import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { Dialog } from "./Dialog";

// Tailwind's lg: from here up there is room for a list and a panel side by side.
const WIDE = "(min-width: 64rem)";

function watchWide(changed: () => void) {
  const query = typeof matchMedia === "function" ? matchMedia(WIDE) : null;
  query?.addEventListener("change", changed);
  return () => query?.removeEventListener("change", changed);
}

/** Whether the screen is wide enough (lg and up) for a `SidePanel` beside its list. */
export function useSideBySide(): boolean {
  return useSyncExternalStore(
    watchWide,
    () => (typeof matchMedia === "function" ? matchMedia(WIDE).matches : false),
    () => false,
  );
}

/**
 * One thing out of a list, shown beside it (#979): `docked`, a pane at the side of
 * the page (the caller lays the two out side by side); otherwise a dialog that fills
 * a phone's screen. Escape or Close closes it either way. Its `actions` (a menu, say)
 * sit in its header beside the title. Mounted only while something is shown.
 */
export function SidePanel({
  title,
  actions,
  docked,
  onClose,
  children,
}: {
  title: string;
  actions?: ReactNode;
  docked: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!docked)
    return (
      <Dialog title={title} actions={actions} open wide phoneFull onClose={onClose}>
        {children}
      </Dialog>
    );
  return (
    <DockedPanel title={title} actions={actions} onClose={onClose}>
      {children}
    </DockedPanel>
  );
}

function DockedPanel({ title, actions, onClose, children }: { title: string; actions?: ReactNode; onClose: () => void; children: ReactNode }) {
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  // Opened, the panel has the focus, so the keyboard goes on from there.
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  // Escape closes it, unless it is closing something open inside it first: a menu or
  // a list of choices.
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const at = e.target instanceof Element ? e.target : null;
      if (at?.closest('[role="menu"], [aria-expanded="true"], dialog')) return;
      close.current();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, []);

  // Below a sticky header, where the page sets its height as --sticky-top (the Play View's ledger, #985).
  return (
    <aside
      aria-labelledby={titleId}
      className="sticky top-[calc(var(--sticky-top,0px)+1rem)] flex max-h-[calc(100dvh-var(--sticky-top,0px)-2rem)] flex-col rounded-lg border border-ash bg-dusk text-parchment shadow-xl"
    >
      <div className="flex items-center gap-3 border-b border-ash px-4 py-3">
        <h2 ref={heading} id={titleId} tabIndex={-1} className="min-w-0 font-display text-gold wrap-anywhere focus:outline-none">
          {title}
        </h2>
        {actions && <div className="ml-auto shrink-0">{actions}</div>}
        <button type="button" aria-label="Close" className={`text-xl leading-none text-mist hover:text-parchment ${actions ? "" : "ml-auto"}`} onClick={onClose}>
          ×
        </button>
      </div>
      <div className="overflow-y-auto p-4">{children}</div>
    </aside>
  );
}
