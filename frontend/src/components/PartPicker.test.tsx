import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { PartPicker } from "./PartPicker";

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

const rules = [
  { to: "/rules", label: "As players read it", end: true },
  { to: "/rules/checks", label: "Checks" },
  { to: "/rules/costs", label: "Costs" },
];

const kinds = [
  {
    label: "Skills",
    parts: [
      { to: "/kinds/lore", label: "Lore" },
      { to: "/kinds/drive", label: "Drive" },
    ],
  },
  { label: "Merits", parts: [] },
  { label: "Backgrounds", parts: [{ to: "/kinds/haven", label: "Haven" }] },
];

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function show(at: string, label: string, parts: Parameters<typeof PartPicker>[0]["parts"]) {
  render(
    <MemoryRouter initialEntries={[at]}>
      <PartPicker label={label} parts={parts}>
        <p>The part itself</p>
      </PartPicker>
      <Where />
    </MemoryRouter>,
  );
  return screen.getByRole("navigation", { name: label });
}

describe("PartPicker", () => {
  it("lists the parts down the side, the open one marked, with the part beside them", () => {
    const nav = show("/rules/costs", "House rules", rules);
    const list = nav.querySelector(".max-lg\\:hidden") as HTMLElement;
    const links = within(list).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["As players read it", "Checks", "Costs"]);
    expect(within(list).getByRole("link", { name: "Costs" }).getAttribute("aria-current")).toBe("page");
    expect(within(list).getByRole("link", { name: "As players read it" }).getAttribute("aria-current")).toBeNull();
    // No headings for parts not in groups.
    expect(within(nav).queryAllByRole("heading")).toEqual([]);
    expect(screen.getByText("The part itself")).toBeTruthy();
  });

  it("puts grouped parts under their group's heading, leaving out an empty group", () => {
    const nav = show("/kinds/haven", "Specialisations", kinds);
    expect(
      within(nav)
        .getAllByRole("heading", { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(["Skills", "Backgrounds"]);
    expect(within(nav).getByRole("list", { name: "Backgrounds" }).textContent).toBe("Haven");
  });

  it("below lg, is one button naming the open part, which opens them all in a sheet", () => {
    const nav = show("/rules/checks", "House rules", rules);
    const button = within(nav).getByRole("button");
    expect(button.textContent).toBe("Checks▾");
    expect(button.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(button);
    const sheet = screen.getByRole("dialog", { name: "House rules" });
    const links = within(sheet).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["As players read it", "Checks", "Costs"]);
    for (const link of links) expect(link.className).toContain("min-h-11");
    expect(within(sheet).getByRole("link", { name: "Checks" }).getAttribute("aria-current")).toBe("page");

    fireEvent.click(within(sheet).getByRole("link", { name: "Costs" }));
    expect(screen.getByTestId("where").textContent).toBe("/rules/costs");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(nav).getByRole("button").textContent).toBe("Costs▾");
  });

  it("names a grouped part after its group on the button", () => {
    const nav = show("/kinds/drive", "Specialisations", kinds);
    expect(within(nav).getByRole("button").textContent).toBe("Skills, ›Drive▾");
  });

  it("names the list on the button while no part is open", () => {
    const nav = show("/kinds", "Specialisations", kinds);
    expect(within(nav).getByRole("button").textContent).toBe("Specialisations▾");
  });
});
