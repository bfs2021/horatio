import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Segmented } from "./Segmented";
import { SettingRow } from "./SettingRow";

afterEach(cleanup);

function Paper() {
  const [paper, setPaper] = useState("letter");
  return (
    <SettingRow label="Paper" hint="What printed sheets are laid out for.">
      <Segmented
        label="Paper"
        value={paper}
        options={[
          { value: "letter", label: "US Letter" },
          { value: "a4", label: "A4" },
        ]}
        onChange={setPaper}
      />
    </SettingRow>
  );
}

function QuickNotes() {
  const [on, setOn] = useState(true);
  return <SettingRow label="Quick notes" hint="The Play View asks what each use was for." checked={on} onChange={setOn} />;
}

describe("SettingRow", () => {
  it("shows its label and hint beside the control it is given", () => {
    render(<Paper />);
    expect(screen.getByText("Paper")).toBeTruthy();
    expect(screen.getByText("What printed sheets are laid out for.")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "A4" }));
    expect(screen.getByRole("radio", { name: "A4" }).getAttribute("aria-checked")).toBe("true");
  });

  it("is a switch named by its label, its hint read as its description, given checked and onChange", () => {
    render(<QuickNotes />);
    const toggle = screen.getByRole("switch", { name: "Quick notes" });
    expect(document.getElementById(toggle.getAttribute("aria-describedby")!)?.textContent).toBe("The Play View asks what each use was for.");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    // The whole row is the tap target.
    fireEvent.click(screen.getByText("The Play View asks what each use was for."));
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });
});
