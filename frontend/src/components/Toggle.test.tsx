import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Checkbox } from "./Checkbox";
import { Toggle } from "./Toggle";

afterEach(cleanup);

function Switched({ start = false, ...rest }: { start?: boolean; hideLabel?: boolean; "aria-label"?: string }) {
  const [on, setOn] = useState(start);
  return (
    <Toggle label="Print titles" hint="Under each name." checked={on} onChange={setOn} {...rest}>
      <a href="#badges">Open the badges</a>
    </Toggle>
  );
}

describe("Toggle", () => {
  it("is a switch named by its label alone, its hint read as its description", () => {
    render(<Switched />);
    const toggle = screen.getByRole("switch", { name: "Print titles" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(toggle.getAttribute("aria-describedby")).toBeTruthy();
    expect(document.getElementById(toggle.getAttribute("aria-describedby")!)?.textContent).toBe("Under each name.");
  });

  it("switches from a tap anywhere on its words, but not on what is under them", () => {
    render(<Switched />);
    fireEvent.click(screen.getByText("Under each name."));
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
    fireEvent.click(screen.getByRole("link", { name: "Open the badges" }));
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
  });

  it("takes another name where the label shows more", () => {
    render(<Switched aria-label="Badges" />);
    expect(screen.getByRole("switch", { name: "Badges" })).toBeTruthy();
  });

  it("can keep its label for screen readers only", () => {
    render(<Switched hideLabel />);
    expect(screen.getByRole("switch", { name: "Print titles" })).toBeTruthy();
    expect(screen.getByText("Print titles").parentElement?.className).toContain("sr-only");
  });
});

describe("Checkbox", () => {
  it("is a tick box named by its label, ticked from its words", () => {
    function Ticked() {
      const [on, setOn] = useState(false);
      return <Checkbox label="Brujah" checked={on} onChange={setOn} />;
    }
    render(<Ticked />);
    const box = screen.getByRole("checkbox", { name: "Brujah" }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(screen.getByText("Brujah"));
    expect(box.checked).toBe(true);
  });

  it("does nothing while disabled", () => {
    let changed = false;
    render(<Checkbox label="Brujah" checked={false} disabled onChange={() => (changed = true)} />);
    fireEvent.click(screen.getByText("Brujah"));
    expect(changed).toBe(false);
  });
});
