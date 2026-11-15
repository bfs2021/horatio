import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OneLine } from "./OneLine";

afterEach(cleanup);

describe("OneLine", () => {
  it("shows a short name as it is, with nothing more to open", () => {
    render(<OneLine text="The Moon" />);
    expect(screen.getAllByText("The Moon").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("cuts a passage to a line, the whole of it on hover and under more (#990)", () => {
    const story = "The debt was written in silver on the night the river froze, and sealed. ".repeat(8).trim();
    render(<OneLine text={story} />);
    const line = screen.getByText(/…$/);
    expect(line.getAttribute("title")).toBe(story);
    const more = screen.getByRole("button", { name: /^Read all of/ });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(more);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(more.getAttribute("aria-controls")!)?.textContent).toBe(story);
  });
});
