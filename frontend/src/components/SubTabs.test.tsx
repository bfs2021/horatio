import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { SubTabs } from "./ui";

afterEach(cleanup);

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
});
