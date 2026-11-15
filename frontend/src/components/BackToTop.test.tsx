import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BackToTop, pastOneScreen } from "./BackToTop";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.scrollY = 0;
});

describe("BackToTop (#922)", () => {
  it("shows only once the page is scrolled past one screen", () => {
    expect(pastOneScreen(0, 800)).toBe(false);
    expect(pastOneScreen(800, 800)).toBe(false);
    expect(pastOneScreen(801, 800)).toBe(true);
  });

  it("appears on scrolling down, and goes back to the top", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    render(<BackToTop />);
    expect(screen.queryByRole("button", { name: "Back to the top" })).toBeNull();
    act(() => {
      window.scrollY = window.innerHeight * 2;
      fireEvent.scroll(window);
    });
    const button = screen.getByRole("button", { name: "Back to the top" });
    expect(button.textContent).toBe("↑ Top");
    fireEvent.click(button);
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
  });
});
