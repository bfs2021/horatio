import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Pager, pageRange } from "./Pager";

afterEach(cleanup);

describe("pageRange", () => {
  it("says which ones a page shows, with thousands marked", () => {
    expect(pageRange(0, 100, 2998)).toBe("1 to 100 of 2,998");
    expect(pageRange(2900, 98, 2998)).toBe("2,901 to 2,998 of 2,998");
    expect(pageRange(0, 0, 0)).toBe("None");
  });
});

describe("Pager", () => {
  it("shows nothing while everything fits on one page", () => {
    const { container } = render(<Pager label="Pages of boons" page={1} size={100} shown={12} total={12} onPage={() => {}} />);
    expect(container.innerHTML).toBe("");
  });

  it("turns the page, and stops at either end", () => {
    const onPage = vi.fn();
    const { rerender } = render(<Pager label="Pages of boons" page={1} size={100} shown={100} total={250} onPage={onPage} />);
    expect(screen.getByRole("navigation", { name: "Pages of boons" }).textContent).toContain("1 to 100 of 250");
    expect(screen.getByRole("button", { name: "Previous" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onPage).toHaveBeenLastCalledWith(2);

    rerender(<Pager label="Pages of boons" page={3} size={100} shown={50} total={250} onPage={onPage} />);
    expect(screen.getByText("201 to 250 of 250")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(onPage).toHaveBeenLastCalledWith(2);
  });
});
