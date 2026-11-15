import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { openTab, useTitle } from "../title";
import { Dialog } from "./Dialog";
import { SectionLabel } from "./Headings";
import { PickerButton, TabSheet, Where } from "./SectionPicker";
import { CountBubble, type Tab } from "./ui";

/** Parts under a heading, such as a specialisation's "Skills" and "Backgrounds". */
export type PartGroup = { label: string; parts: Tab[] };

const grouped = (parts: Tab[] | PartGroup[]): parts is PartGroup[] => parts.length > 0 && "parts" in parts[0]!;

/**
 * The parts of one page, for a page with more than five of them (#906); five or
 * fewer go in `PageTabs`. `parts` is a list, or groups of them under headings.
 * From `lg` up they are a list down the left of the page, the open part marked
 * as `SubTabs` marks its open pill, with the part itself (`children`) to its
 * right. Below `lg` they give way to one button naming the open part, which
 * opens the same list in a sheet, as `SectionPicker` does for a page's tabs.
 * `label` names the list and its sheet.
 */
export function PartPicker({ label, parts, children }: { label: string; parts: Tab[] | PartGroup[]; children: ReactNode }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const nav = useRef<HTMLElement>(null);
  const groups: { label?: string; tabs: Tab[] }[] = grouped(parts)
    ? parts.filter((g) => g.parts.length > 0).map((g) => ({ label: g.label, tabs: g.parts }))
    : [{ tabs: parts }];
  const part = openTab(
    groups.flatMap((g) => g.tabs),
    pathname,
  );
  const group = part && groups.find((g) => g.tabs.includes(part))?.label;
  useTitle(part?.label, nav);
  // Shut when the page changes underneath it, as by the browser's Back.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="lg:grid lg:grid-cols-[12.5rem_minmax(0,1fr)] lg:items-start lg:gap-8">
      <nav ref={nav} aria-label={label} className="mb-5 lg:sticky lg:top-4 lg:mb-0 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto">
        <div className="lg:hidden">
          <PickerButton open={open} onOpen={() => setOpen(true)}>
            {part ? <Where group={group} tab={part.label} /> : label}
          </PickerButton>
        </div>
        <div className="space-y-4 max-lg:hidden">
          {groups.map((g, i) => (
            <section key={g.label ?? i}>
              {g.label && <SectionLabel className="mb-1 px-3">{g.label}</SectionLabel>}
              <ul aria-label={g.label} className="space-y-0.5">
                {g.tabs.map((t) => {
                  const isOpen = t === part;
                  return (
                    <li key={t.to}>
                      <Link
                        to={t.to}
                        aria-label={t.ariaLabel}
                        aria-current={isOpen ? "page" : undefined}
                        // At least 40 px tall on a touch screen.
                        className={`flex items-center gap-2 rounded-md border px-3 py-1 text-sm pointer-coarse:min-h-10 ${
                          isOpen ? "border-gold/60 bg-gold/10 text-parchment" : "border-transparent text-mist hover:text-parchment"
                        }`}
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
        <Dialog title={label} open={open} onClose={() => setOpen(false)} phoneFull>
          <TabSheet groups={groups} open={part} onChoose={() => setOpen(false)} />
        </Dialog>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
