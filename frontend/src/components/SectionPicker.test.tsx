import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { SectionPicker } from "./SectionPicker";

// jsdom has no modal dialogs.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
});
afterEach(cleanup);

const groups = [
  { label: "Troupe", tabs: [{ to: "/troupes/1", label: "Overview", end: true }] },
  {
    label: "Characters",
    tabs: [
      { to: "/troupes/1/approvals", label: "Approvals", count: 2 },
      { to: "/troupes/1/being-built", label: "Being built", count: 4, countLabel: "being built", countInGroup: false },
    ],
  },
  { label: "Games", tabs: [] },
  {
    label: "Customise",
    tabs: [
      { to: "/troupes/1/customise", label: "Setup" },
      { to: "/troupes/1/settings", label: "Troupe settings" },
    ],
  },
];

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function show(at: string) {
  render(
    <MemoryRouter initialEntries={[at]}>
      <SectionPicker label="Troupe sections" groups={groups} />
      <Where />
    </MemoryRouter>,
  );
  return screen.getByRole("navigation", { name: "Troupe sections" });
}

describe("SectionPicker", () => {
  it("reads as where you are, with what waits counted", () => {
    const nav = show("/troupes/1/settings");
    const button = within(nav).getByRole("button");
    expect(button.textContent).toContain("Customise, ›Troupe settings");
    // Being built is counted on its tab, not as waiting.
    expect(within(button).getByLabelText("2 waiting")).toBeTruthy();
  });

  it("names a tab once when its group bears its name", () => {
    const nav = show("/troupes/1/ignored-not-a-tab");
    expect(within(nav).getByRole("button").textContent).toContain("Sections");
    cleanup();
    render(
      <MemoryRouter initialEntries={["/c/1/create"]}>
        <SectionPicker label="Character tabs" groups={[{ label: "Create", tabs: [{ to: "/c/1/create", label: "Create" }] }]} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button").textContent).toBe("Create▾");
  });

  it("names a tab in the sheet by its ariaLabel, when it has one (#922)", () => {
    render(
      <MemoryRouter initialEntries={["/troupes/1/play"]}>
        <SectionPicker
          label="Troupe sections"
          groups={[
            {
              label: "Games",
              tabs: [
                { to: "/troupes/1/play", label: "At game" },
                { to: "/play/troupes/1/scenes", label: "Scenes ↗", ariaLabel: "Scenes (opens the scenes page)" },
              ],
            },
          ]}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("link", { name: "Scenes (opens the scenes page)" }).textContent).toBe("Scenes ↗");
  });

  it("lists every group with its tabs, the open one marked, and goes where you choose", () => {
    const nav = show("/troupes/1/settings");
    fireEvent.click(within(nav).getByRole("button"));
    const sheet = screen.getByRole("dialog", { name: "Troupe sections" });
    expect(
      within(sheet)
        .getAllByRole("heading", { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(["Troupe", "Characters", "Customise"]);
    const links = within(sheet).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Overview", "Approvals2", "Being built4", "Setup", "Troupe settings"]);
    for (const link of links) expect(link.className).toContain("min-h-11");
    expect(within(sheet).getByRole("link", { name: "Troupe settings" }).getAttribute("aria-current")).toBe("page");
    expect(within(sheet).getByRole("link", { name: "Setup" }).getAttribute("aria-current")).toBeNull();

    fireEvent.click(within(sheet).getByRole("link", { name: /^Approvals/ }));
    expect(screen.getByTestId("where").textContent).toBe("/troupes/1/approvals");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
