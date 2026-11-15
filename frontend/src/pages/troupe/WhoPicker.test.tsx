import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { CharacterChoice } from "../../api/types";
import { WhoPicker } from "./WhoPicker";

afterEach(cleanup);

const characters = [{ id: "c1", name: "Agnes Thorne", kind: "pc" }] as CharacterChoice[];
const anyText = { longest: 2000, hint: "A name, or anything else the ledger should say." };

function Picker({ start = { who: "", name: "" }, text = true }: { start?: { who: string; name: string }; text?: boolean }) {
  const [side, setSide] = useState(start);
  return (
    <>
      <WhoPicker characters={characters} who={side.who} name={side.name} anyText={text ? anyText : undefined} onChange={(who, name) => setSide({ who, name })} />
      <output>{`${side.who}|${side.name}`}</output>
    </>
  );
}

describe("WhoPicker with any text (#990)", () => {
  it("offers someone not in Horatio last, which turns it into a text box with its hint", () => {
    render(<Picker />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "The" } });
    const options = screen.getAllByRole("option");
    expect(options.at(-1)?.textContent).toBe("Someone not in Horatio…");
    // A typed name that matches nobody still works as it did.
    expect(options.at(-2)?.textContent).toContain("name only");
    fireEvent.click(options.at(-1)!);
    const box = screen.getByRole("textbox");
    expect(box.tagName).toBe("TEXTAREA");
    expect((box as HTMLTextAreaElement).value).toBe("The");
    expect(box.getAttribute("maxlength")).toBe("2000");
    expect(document.getElementById(box.getAttribute("aria-describedby")!)?.textContent).toBe(anyText.hint);
    fireEvent.change(box, { target: { value: "The Moon, who saw it all" } });
    expect(screen.getByRole("status").textContent).toBe("name|The Moon, who saw it all");
  });

  it("goes back to finding a character", () => {
    render(<Picker />);
    fireEvent.focus(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "Someone not in Horatio…" }));
    fireEvent.click(screen.getByRole("button", { name: "Find a character instead" }));
    expect(screen.getByRole("combobox")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("|");
  });

  it("opens a long name already given in the text box, a short one in the search box", () => {
    const story = "The debt was written in silver on the night the river froze, and sealed.";
    render(<Picker start={{ who: "name", name: story }} />);
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(story);
    cleanup();
    render(<Picker start={{ who: "name", name: "Grove" }} />);
    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("Grove");
  });

  it("offers nothing more without it", () => {
    render(<Picker text={false} />);
    fireEvent.focus(screen.getByRole("combobox"));
    expect(screen.queryByRole("option", { name: "Someone not in Horatio…" })).toBeNull();
  });
});
