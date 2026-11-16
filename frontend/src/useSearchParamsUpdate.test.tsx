import { act, cleanup, render, screen } from "@testing-library/react";
import { createBrowserRouter, createMemoryRouter, useSearchParams } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it } from "vitest";
import { useSearchParamsUpdate, type SearchParamsChange } from "./useSearchParamsUpdate";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

const setting =
  (key: string, value: string | null): SearchParamsChange =>
  (now) => {
    const next = new URLSearchParams(now);
    if (value === null) next.delete(key);
    else next.set(key, value);
    return next;
  };

type Update = (change: SearchParamsChange) => void;

/** A page that shows its search params and hands out its setter, made with `use`. */
function pageWith(use: () => [URLSearchParams, Update]) {
  const held: { update: Update } = { update: () => {} };
  function Page() {
    const [params, update] = use();
    held.update = update;
    return <p data-testid="params">{params.toString()}</p>;
  }
  return { held, routes: [{ path: "/ledger", element: <Page /> }] };
}

const withHook = (): [URLSearchParams, Update] => {
  const [params, update] = useSearchParamsUpdate();
  return [params, (change) => update(change, { replace: true })];
};
const withRouterOnly = (): [URLSearchParams, Update] => {
  const [params, set] = useSearchParams();
  return [params, (change) => set(change, { replace: true })];
};

/** A boon open on the settled view, as in #1025: the view changes to All, then the boon's dialog says it has closed, before the page catches up. */
async function twoChangesBeforeARender(router: ReturnType<typeof createMemoryRouter>, held: { update: Update }) {
  render(<RouterProvider router={router} />);
  expect(screen.getByTestId("params").textContent).toBe("view=settled&boon=b1");
  await act(async () => {
    held.update(setting("view", "all"));
    held.update(setting("boon", null));
  });
  return new URLSearchParams(router.state.location.search);
}

describe("useSearchParamsUpdate (#1030)", () => {
  it("keeps both of two changes made before the page re-renders, in the app's browser router", async () => {
    window.history.replaceState(null, "", "/ledger?view=settled&boon=b1");
    const { held, routes } = pageWith(withHook);
    const router = createBrowserRouter(routes);
    const after = await twoChangesBeforeARender(router, held);
    expect(after.toString()).toBe("view=all");
    expect(window.location.search).toBe("?view=all");
    expect(screen.getByTestId("params").textContent).toBe("view=all");
  });

  it("keeps both in a memory router too", async () => {
    const { held, routes } = pageWith(withHook);
    const router = createMemoryRouter(routes, { initialEntries: ["/ledger?view=settled&boon=b1"] });
    const after = await twoChangesBeforeARender(router, held);
    expect(after.toString()).toBe("view=all");
  });

  it("is needed: React Router's own setter loses the first of the two", async () => {
    window.history.replaceState(null, "", "/ledger?view=settled&boon=b1");
    const { held, routes } = pageWith(withRouterOnly);
    const router = createBrowserRouter(routes);
    const after = await twoChangesBeforeARender(router, held);
    expect(after.toString()).toBe("view=settled");
  });

  it("builds on the address as it now is once the page has caught up, after Back too", async () => {
    window.history.replaceState(null, "", "/ledger?view=settled");
    const { held, routes } = pageWith(withHook);
    const router = createBrowserRouter(routes);
    render(<RouterProvider router={router} />);
    await act(async () => held.update(setting("boon", "b1")));
    expect(screen.getByTestId("params").textContent).toBe("view=settled&boon=b1");
    await act(async () => router.navigate("/ledger?view=open"));
    await act(async () => held.update(setting("page", "2")));
    expect(screen.getByTestId("params").textContent).toBe("view=open&page=2");
  });
});
