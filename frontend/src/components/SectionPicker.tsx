import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { openTab } from "../title";
import { Dialog } from "./Dialog";
import { SectionLabel } from "./Headings";
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

  return (
    <nav aria-label={label} className={className ?? "mb-6"}>
      <PickerButton open={open} onOpen={() => setOpen(true)} after={<CountBubble count={total} label="waiting" />}>
        {!at ? "Sections" : <Where group={at.group.label === at.tab.label ? undefined : at.group.label} tab={at.tab.label} />}
      </PickerButton>
      <Dialog title={label} open={open} onClose={() => setOpen(false)} phoneFull>
        <TabSheet groups={shown} open={at?.tab} onChoose={() => setOpen(false)} />
      </Dialog>
    </nav>
  );
}

/**
 * The button a picker shows in place of its tabs, as wide as the page, saying
 * where you are; it opens the picker's sheet. `after` sits at its right, before
 * the ▾. Shared with `PartPicker` (#906).
 */
export function PickerButton({ open, onOpen, after, children }: { open: boolean; onOpen: () => void; after?: ReactNode; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onOpen}
      className="flex min-h-11 w-full items-center gap-2 rounded-md border border-ash bg-dusk px-3 text-left text-sm text-parchment hover:border-mist"
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {after}
      <span aria-hidden className="text-mist">
        ▾
      </span>
    </button>
  );
}

/** The open tab's name on a picker's button, after its group's when it has one: "Customise › Troupe settings". */
export function Where({ group, tab }: { group?: string; tab: string }) {
  if (!group) return <>{tab}</>;
  return (
    <>
      <span className="text-mist">{group}</span>
      {/* Read as "Customise, Troupe settings". */}
      <span className="sr-only">, </span>
      <span aria-hidden className="px-1.5 text-mist">
        ›
      </span>
      {tab}
    </>
  );
}

/**
 * A picker's sheet: each group under its heading, with its tabs one to a line,
 * the open one marked and brought into sight. A group without a label is its
 * tabs alone. Choosing one calls `onChoose`, to shut the sheet.
 */
export function TabSheet({ groups, open, onChoose }: { groups: { label?: string; tabs: Tab[] }[]; open: Tab | undefined; onChoose: () => void }) {
  // The open tab in sight in a long sheet. The sheet's content mounts as it opens,
  // before the dialog around it is shown, so it waits a frame.
  const current = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => current.current?.scrollIntoView?.({ block: "center" }));
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div className="space-y-5">
      {groups.map((g, i) => (
        <section key={g.label ?? i}>
          {g.label && <SectionLabel className="mb-1">{g.label}</SectionLabel>}
          <ul aria-label={g.label}>
            {g.tabs.map((t) => {
              const isOpen = t === open;
              return (
                <li key={t.to}>
                  <Link
                    to={t.to}
                    aria-label={t.ariaLabel}
                    aria-current={isOpen ? "page" : undefined}
                    ref={isOpen ? current : undefined}
                    onClick={onChoose}
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
  );
}
