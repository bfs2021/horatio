import { createContext, useCallback, useContext, useLayoutEffect, useState, type ReactNode } from "react";

// Pages are max-w-5xl; a table page can ask for max-w-7xl (#913).
const AskWide = createContext<(wide: boolean) => void>(() => {});

/** For Layout: the width every page shares now, and what its pages ask through. */
export function usePageWidth() {
  // A count, not a flag: one wide page can mount before the last one unmounts.
  const [asking, setAsking] = useState(0);
  const ask = useCallback((wide: boolean) => setAsking((n) => n + (wide ? 1 : -1)), []);
  return { width: asking > 0 ? "max-w-7xl" : "max-w-5xl", ask };
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
