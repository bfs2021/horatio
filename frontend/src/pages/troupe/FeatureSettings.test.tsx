import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { FeatureSettings } from "./FeatureSettings";

afterEach(cleanup);

beforeAll(() => {
  // jsdom has no modal dialogs of its own.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
});

function Address() {
  const { pathname, hash } = useLocation();
  return <p data-testid="address">{pathname + hash}</p>;
}

function show(at: string, children = <p>Who may settle a boon</p>) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[at]}>
        <FeatureSettings tab="Boons">{children}</FeatureSettings>
        <Address />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("a feature's Settings button (#784, #909)", () => {
  it("is a button when the tab is opened, its settings closed", () => {
    show("/troupes/t1/boons");
    expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy();
    expect(screen.queryByText("Who may settle a boon")).toBeNull();
    expect(document.querySelector("details")).toBeNull();
  });

  it("opens them in a dialog named after the tab, and closes again", () => {
    show("/troupes/t1/boons");
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("dialog", { name: "Boons settings" })).toBeTruthy();
    expect(screen.getByText("Who may settle a boon")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]!);
    expect(screen.queryByText("Who may settle a boon")).toBeNull();
  });

  it("opens when the Features list's Settings link lands on it, and leaves the address when closed", () => {
    show("/troupes/t1/boons#settings");
    expect(screen.getByRole("dialog", { name: "Boons settings" })).toBeTruthy();
    expect(screen.getByText("Who may settle a boon")).toBeTruthy();
    act(() => {
      fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]!);
    });
    expect(screen.queryByText("Who may settle a boon")).toBeNull();
    expect(screen.getByTestId("address").textContent).toBe("/troupes/t1/boons");
  });

  it("opens at a moved part's card when an old House rules address lands on it, scrolling only the dialog (#785)", () => {
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { value: scroll, configurable: true });
    try {
      show("/troupes/t1/approvals#settings-teachers", <div id="settings-teachers">Teachers</div>);
      expect(screen.getByRole("dialog", { name: "Boons settings" }).contains(screen.getByText("Teachers"))).toBe(true);
      // The page under it stays where it is.
      expect(scroll).not.toHaveBeenCalled();
    } finally {
      delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });
});
