import { useCallback, useEffect, useRef } from "react";
import { useLocation, useSearchParams, type NavigateOptions } from "react-router";

/** A change to the address's search params, from them as they now are. */
export type SearchParamsChange = (now: URLSearchParams) => URLSearchParams;

/**
 * `useSearchParams`, with a setter whose change builds on the address as it now is.
 *
 * React Router's own `setSearchParams(fn)` hands `fn` the params as the page was last
 * drawn, so two changes made before the page catches up undo one another: the second
 * builds on the old params and drops the first. On the boon ledger a boon's dialog says
 * it has closed a moment after it goes, and a view chosen in that moment was lost
 * (#1025). Here each change builds on the one asked for before it until the page
 * catches up, and otherwise on the address bar (#1030).
 */
export function useSearchParamsUpdate(): [URLSearchParams, (change: SearchParamsChange, options?: NavigateOptions) => void] {
  const [params, setSearchParams] = useSearchParams();
  const location = useLocation();
  const asked = useRef<URLSearchParams | null>(null);
  useEffect(() => {
    asked.current = null;
  }, [location]);
  const { pathname } = location;
  const update = useCallback(
    (change: SearchParamsChange, options?: NavigateOptions) => {
      // The address bar is the app's own (a browser router); a memory router, as in a
      // test, has only what it last drew.
      const now = asked.current ?? (window.location.pathname === pathname ? new URLSearchParams(window.location.search) : params);
      const next = change(new URLSearchParams(now));
      asked.current = next;
      setSearchParams(next, options);
    },
    [params, pathname, setSearchParams],
  );
  return [params, update];
}
