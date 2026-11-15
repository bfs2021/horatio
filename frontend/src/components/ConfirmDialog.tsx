import { useCallback, useState, type ReactNode } from "react";
import { Dialog } from "./Dialog";
import { Button } from "./ui";

/** What to ask: the question as the title, a line on what will be lost, and the danger button's name. */
export type Ask = { title: string; body?: ReactNode; action: string };

/**
 * "Are you sure?" in the app's own dialog, in place of the browser's (#902): the
 * question, a line on what will be lost, a danger button named for the action
 * ("Delete", "Remove", "Take back") and Cancel.
 */
export function ConfirmDialog({ ask, open, onConfirm, onCancel }: { ask: Ask; open: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Dialog title={ask.title} open={open} onClose={onCancel}>
      {ask.body && <p className="mb-4 text-sm">{ask.body}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" variant="danger" onClick={onConfirm}>
          {ask.action}
        </Button>
      </div>
    </Dialog>
  );
}

/**
 * The browser's confirm, answered through a `ConfirmDialog` instead:
 * `const [confirmed, confirming] = useConfirm()`, then `if (await confirmed({…}))
 * remove()`, with `{confirming}` rendered somewhere in the component.
 */
export function useConfirm(): [(ask: Ask) => Promise<boolean>, ReactNode] {
  const [asking, setAsking] = useState<{ ask: Ask; answer: (yes: boolean) => void } | null>(null);
  const confirmed = useCallback((ask: Ask) => new Promise<boolean>((answer) => setAsking({ ask, answer })), []);
  const answer = (yes: boolean) => {
    asking?.answer(yes);
    setAsking(null);
  };
  const dialog = asking && <ConfirmDialog ask={asking.ask} open onConfirm={() => answer(true)} onCancel={() => answer(false)} />;
  return [confirmed, dialog];
}
