import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import type { Preferences } from "../../api/types";
import { Segmented } from "../../components/Segmented";
import { useToast } from "../../components/Toast";
import { ErrorText } from "../../components/ui";
import { usePreferences, useSavingPreferences, useSetPreferences } from "../../hooks";

type Key = keyof Preferences;

/** Save a change to the settings, and say so once it is kept: "Paper: A4. Saved." */
export function useSaveSetting() {
  const set = useSetPreferences();
  const toast = useToast();
  return (changes: Partial<Preferences>, said: string) =>
    set.mutate(changes, {
      onSuccess: () => toast({ message: `${said}. Saved.` }),
    });
}

/** A setting with a few choices, as buttons side by side. */
export function Choice<K extends Key>({ name, label, choices }: { name: K; label: string; choices: [Preferences[K], string][] }) {
  const prefs = usePreferences();
  const save = useSaveSetting();
  return (
    <Segmented
      label={label}
      value={choices.findIndex(([value]) => value === prefs[name])}
      options={choices.map(([, text], i) => ({ value: i, label: text }))}
      onChange={(i) => {
        const [value, text] = choices[i]!;
        save({ [name]: value } as Partial<Preferences>, `${label}: ${text}`);
      }}
    />
  );
}

/** True once `on` has stayed true for `ms`, so a quick save doesn't flash. */
function useAfter(on: boolean, ms: number): boolean {
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!on) return setLate(false);
    const timer = setTimeout(() => setLate(true), ms);
    return () => clearTimeout(timer);
  }, [on, ms]);
  return on && late;
}

/** Scroll to the part of the page the address names, such as #notifications from
 * the bell, once it is there. */
export function useScrollToHash() {
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);
}

/**
 * Cards whose settings are kept on the account, so they follow the person to their
 * phone at game. Each takes effect as soon as it changes, and a toast says it is kept.
 * Every control waits while a change is saved, so changes reach the server one at a
 * time and none is lost; "Saving…" shows if it takes a moment.
 */
export function PreferenceCards({ id, children }: { id?: string; children: ReactNode }) {
  const set = useSetPreferences();
  const saving = useSavingPreferences();
  const slow = useAfter(saving, 200);
  return (
    <fieldset id={id} disabled={saving} aria-busy={saving} className={`flex min-w-0 scroll-mt-4 flex-col gap-6 ${slow ? "cursor-wait opacity-60" : ""}`}>
      <p role="status" className="pointer-events-none fixed right-4 bottom-4 text-sm text-mist">
        {slow ? "Saving…" : ""}
      </p>
      {children}
      <ErrorText error={set.error} />
    </fieldset>
  );
}
