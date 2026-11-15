import type { ReactNode } from "react";

/** What a custodian looks at rarely on a Site card, folded under its summary so the
 * card's status and its test stay in sight (#944). */
export function SiteFold({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="border-t border-ash pt-3">
      <summary className="cursor-pointer py-1 text-sm text-gold pointer-coarse:py-2.5">{summary}</summary>
      <div className="mt-3 flex flex-col gap-4">{children}</div>
    </details>
  );
}
