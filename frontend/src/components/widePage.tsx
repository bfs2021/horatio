import { createContext, useCallback, useContext, useLayoutEffect, useState, type ReactNode } from "react";

// Pages are max-w-5xl; a table page can ask for max-w-7xl (#913).
const AskWide = createContext<(wide: boolean) => void>(() => {});

/**
 * For Layout: the width every page shares now, and what its pages ask through. A
 * page of its own outside Layout gives its own widths: the Play View's boon ledger
 * is `max-w-3xl`, and wide from lg up (#985).
 */
export function usePageWidth(narrow = "max-w-5xl", wide = "max-w-7xl") {
  // A count, not a flag: one wide page can mount before the last one unmounts.
  const [asking, setAsking] = useState(0);
  const ask = useCallback((asks: boolean) => setAsking((n) => n + (asks ? 1 : -1)), []);
  return { width: asking > 0 ? wide : narrow, ask };
}

export function WidePages({ ask, children }: { ask: (wide: boolean) => void; children: ReactNode }) {
  return <AskWide value={ask}>{children}</AskWide>;
}

/**
 * Widens the page while this component is on screen, for a table that wraps
 * at the usual width. Text pages stay narrow. Below 1,024 px it changes nothing.
 */
export function useWidePage() {
  const ask = useContext(AskWide);
  // Before paint, so the page doesn't draw narrow first and then jump.
  useLayoutEffect(() => {
    ask(true);
    return () => ask(false);
  }, [ask]);
}
