import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { openTab } from "../title";
import { Dialog } from "./Dialog";
import { CountBubble, type Tab } from "./ui";

type Group = { label: string; tabs: Tab[] };

/** What a group's counts add up to: what waits, leaving out a count that waits on no one (#774). */
function waiting(tabs: Tab[]): number {
  return tabs.filter((t) => t.countInGroup !== false).reduce((sum, t) => sum + (t.count ?? 0), 0);
}

/**
 * A page's tabs on a phone (#904): one button that says where you are, such as
 * "Customise › Troupe settings", with all that waits counted at its right. It
 * opens a sheet of every group with its tabs under it, one to a line, so every
 * tab is two taps from any other with nothing to scroll sideways. Choosing one
 * closes the sheet and goes there. `label` names the place on the page and the sheet.
 */
export function SectionPicker({ label, groups, className }: { label: string; groups: Group[]; className?: string }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const shown = groups.filter((g) => g.tabs.length > 0);
  const tabs = shown.flatMap((g) => g.tabs);
  // The open tab, as the rows mark it, and its group.
  const tab = openTab(tabs, pathname);
  const group = tab && shown.find((g) => g.tabs.includes(tab));
  const at = tab && group ? { tab, group } : undefined;
  const total = waiting(tabs);
  // Shut when the page changes underneath it, as by the browser's Back.
  useEffect(() => setOpen(false), [pathname]);
  // The open tab in sight in a long sheet, once the sheet is up.
  const current = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (open) current.current?.scrollIntoView?.({ block: "center" });
  }, [open]);

  return (
    <nav aria-label={label} className={className ?? "mb-6"}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex min-h-11 w-full items-center gap-2 rounded-md border border-ash bg-dusk px-3 text-left text-sm text-parchment hover:border-mist"
      >
        <span className="min-w-0 flex-1 truncate">
          {!at ? (
            "Sections"
          ) : at.group.label === at.tab.label ? (
            at.tab.label
          ) : (
            <>
              <span className="text-mist">{at.group.label}</span>
              {/* Read as "Customise, Troupe settings". */}
              <span className="sr-only">, </span>
              <span aria-hidden className="px-1.5 text-mist">
                ›
              </span>
              {at.tab.label}
            </>
          )}
        </span>
        <CountBubble count={total} label="waiting" />
        <span aria-hidden className="text-mist">
          ▾
        </span>
      </button>
      <Dialog title={label} open={open} onClose={() => setOpen(false)} phoneFull>
        <div className="space-y-5">
          {shown.map((g) => (
            <section key={g.label}>
              <h3 className="mb-1 font-sans text-xs tracking-wide text-mist uppercase">{g.label}</h3>
              <ul aria-label={g.label}>
                {g.tabs.map((t) => {
                  const isOpen = t === at?.tab;
                  return (
                    <li key={t.to}>
                      <Link
                        to={t.to}
                        aria-label={t.ariaLabel}
                        aria-current={isOpen ? "page" : undefined}
                        ref={isOpen ? current : undefined}
                        onClick={() => setOpen(false)}
                        className={
                          isOpen
                            ? "flex min-h-11 items-center gap-2 rounded-md border-l-2 border-gold bg-gold/10 px-3 text-sm text-parchment"
                            : "flex min-h-11 items-center gap-2 rounded-md border-l-2 border-transparent px-3 text-sm text-mist hover:text-parchment"
                        }
                      >
                        <span className="flex-1">{t.label}</span>
                        {t.count !== undefined && <CountBubble count={t.count} label={t.countLabel ?? "waiting"} />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </Dialog>
    </nav>
  );
}
