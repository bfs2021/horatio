import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SubTabs } from "./ui";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SubTabs", () => {
  it("names a tab that leaves the page by its own aria label, and the rest by their labels (#922)", () => {
    render(
      <MemoryRouter initialEntries={["/troupes/t1/play"]}>
        <SubTabs
          label="Games"
          tabs={[
            { to: "/troupes/t1/play", label: "At game" },
            { to: "/play/troupes/t1/scenes", label: "Scenes ↗", ariaLabel: "Scenes (opens the scenes page)" },
          ]}
        />
      </MemoryRouter>,
    );
    const nav = screen.getByRole("navigation", { name: "Games" });
    expect(nav.querySelectorAll("a")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "At game" }).getAttribute("aria-current")).toBe("page");
    const scenes = screen.getByRole("link", { name: "Scenes (opens the scenes page)" });
    expect(scenes.getAttribute("href")).toBe("/play/troupes/t1/scenes");
    expect(scenes.textContent).toBe("Scenes ↗");
  });

  it("shows a chevron only at an edge with more beyond it, out of a screen reader's way, and pressing it scrolls the row by most of its width (#921)", () => {
    // jsdom lays nothing out: a row 300 px wide holding 900 px of tabs.
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(300);
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(900);
    const scrollBy = vi.fn();
    HTMLElement.prototype.scrollBy = scrollBy;
    render(
      <MemoryRouter initialEntries={["/troupes/t1/play"]}>
        <SubTabs
          label="Games"
          tabs={[
            { to: "/troupes/t1/play", label: "At game" },
            { to: "/troupes/t1/award", label: "Award XP" },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId("row-chevron-start")).toBeNull();
    const end = screen.getByTestId("row-chevron-end");
    expect(end.getAttribute("aria-hidden")).toBe("true");
    expect(end.tabIndex).toBe(-1);
    expect(screen.queryByRole("button")).toBeNull();
    fireEvent.click(end);
    expect(scrollBy).toHaveBeenCalledWith(expect.objectContaining({ left: 220 }));
  });
});
