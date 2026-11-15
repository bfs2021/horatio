import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { RadioList } from "./RadioList";
import { Segmented } from "./Segmented";

afterEach(cleanup);

function Paper({ start = "letter" }: { start?: string }) {
  const [paper, setPaper] = useState(start);
  return (
    <Segmented
      label="Paper"
      value={paper}
      options={[
        { value: "letter", label: "US Letter" },
        { value: "a4", label: "A4" },
        { value: "legal", label: "Legal" },
      ]}
      onChange={setPaper}
    />
  );
}

const checked = (name: string) => screen.getByRole("radio", { name }).getAttribute("aria-checked");

describe("Segmented", () => {
  it("is a radiogroup with the chosen option checked, and a tap chooses another", () => {
    render(<Paper />);
    expect(screen.getByRole("radiogroup", { name: "Paper" })).toBeTruthy();
    expect(checked("US Letter")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "A4" }));
    expect(checked("A4")).toBe("true");
    expect(checked("US Letter")).toBe("false");
  });

  it("is one tab stop, on the chosen option, and arrow keys move the choice round", () => {
    render(<Paper start="a4" />);
    expect(screen.getAllByRole("radio").map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
    fireEvent.keyDown(screen.getByRole("radio", { name: "A4" }), { key: "ArrowRight" });
    expect(checked("Legal")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Legal" }));
    fireEvent.keyDown(screen.getByRole("radio", { name: "Legal" }), { key: "ArrowRight" });
    expect(checked("US Letter")).toBe("true");
    fireEvent.keyDown(screen.getByRole("radio", { name: "US Letter" }), { key: "ArrowLeft" });
    expect(checked("Legal")).toBe("true");
    fireEvent.keyDown(screen.getByRole("radio", { name: "Legal" }), { key: "Home" });
    expect(checked("US Letter")).toBe("true");
  });

  it("with nothing chosen, Tab reaches the first", () => {
    render(<Paper start="tabloid" />);
    expect(screen.getAllByRole("radio").map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "false", "false"]);
    expect(screen.getAllByRole("radio").map((r) => r.tabIndex)).toEqual([0, -1, -1]);
  });
});

describe("RadioList", () => {
  function Status({ disabled = false }: { disabled?: boolean }) {
    const [by, setBy] = useState("players");
    return (
      <RadioList
        label="Who keeps status"
        value={by}
        disabled={disabled}
        options={[
          { value: "players", label: "Players keep their own", hint: "Each player adds and removes it." },
          { value: "staff", label: "Staff only", hint: "Players see it but can't change it." },
        ]}
        onChange={setBy}
      />
    );
  }

  it("is a radiogroup named by its question, each option named by its label and described by its hint", () => {
    render(<Status />);
    expect(screen.getByRole("radiogroup", { name: "Who keeps status" })).toBeTruthy();
    const staff = screen.getByRole("radio", { name: "Staff only" }) as HTMLInputElement;
    expect(staff.checked).toBe(false);
    expect(document.getElementById(staff.getAttribute("aria-describedby")!)?.textContent).toBe("Players see it but can't change it.");
    expect((screen.getByRole("radio", { name: "Players keep their own" }) as HTMLInputElement).checked).toBe(true);
  });

  it("chooses from a tap anywhere on the line", () => {
    render(<Status />);
    fireEvent.click(screen.getByText("Players see it but can't change it."));
    expect((screen.getByRole("radio", { name: "Staff only" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: "Players keep their own" }) as HTMLInputElement).checked).toBe(false);
  });

  it("does nothing while disabled", () => {
    render(<Status disabled />);
    fireEvent.click(screen.getByText("Staff only"));
    expect((screen.getByRole("radio", { name: "Staff only" }) as HTMLInputElement).checked).toBe(false);
  });
});
