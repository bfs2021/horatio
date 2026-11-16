import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { usePageWidth, useWidePage, WidePages } from "./widePage";

afterEach(cleanup);

function Wide() {
  useWidePage();
  return null;
}

function Page({ wide, widths = [] }: { wide: number; widths?: [string, string] | [] }) {
  const page = usePageWidth(...widths);
  return (
    <main data-testid="main" className={page.width}>
      <WidePages ask={page.ask}>
        {Array.from({ length: wide }, (_, i) => (
          <Wide key={i} />
        ))}
      </WidePages>
    </main>
  );
}

describe("useWidePage", () => {
  it("keeps a page narrow unless it asks", () => {
    render(<Page wide={0} />);
    expect(screen.getByTestId("main").className).toBe("max-w-5xl");
  });

  it("widens while a page asks, and narrows once none does", () => {
    const { rerender } = render(<Page wide={1} />);
    expect(screen.getByTestId("main").className).toBe("max-w-7xl");
    rerender(<Page wide={2} />);
    rerender(<Page wide={1} />);
    expect(screen.getByTestId("main").className).toBe("max-w-7xl");
    rerender(<Page wide={0} />);
    expect(screen.getByTestId("main").className).toBe("max-w-5xl");
  });

  it("takes a page's own widths (#985)", () => {
    const { rerender } = render(<Page wide={0} widths={["max-w-3xl", "max-w-3xl lg:max-w-7xl"]} />);
    expect(screen.getByTestId("main").className).toBe("max-w-3xl");
    rerender(<Page wide={1} widths={["max-w-3xl", "max-w-3xl lg:max-w-7xl"]} />);
    expect(screen.getByTestId("main").className).toBe("max-w-3xl lg:max-w-7xl");
  });

  it("does nothing outside a layout", () => {
    expect(() => render(<Wide />)).not.toThrow();
  });
});
