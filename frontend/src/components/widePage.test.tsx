import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { usePageWidth, useWidePage, WidePages } from "./widePage";

afterEach(cleanup);

function Wide() {
  useWidePage();
  return null;
}

function Page({ wide }: { wide: number }) {
  const page = usePageWidth();
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

  it("does nothing outside a layout", () => {
    expect(() => render(<Wide />)).not.toThrow();
  });
});
