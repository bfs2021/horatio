import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { BackLink } from "./BackLink";
import { useConfirm } from "./ConfirmDialog";
import { LinkButton } from "./LinkButton";

afterEach(cleanup);

beforeAll(() => {
  // jsdom has no modal dialogs of its own.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
});

function Asker({ answered }: { answered: (yes: boolean) => void }) {
  const [confirmed, confirming] = useConfirm();
  return (
    <>
      <button onClick={async () => answered(await confirmed({ title: "Delete UW1?", body: "It goes for good.", action: "Delete" }))}>Ask</button>
      {confirming}
    </>
  );
}

describe("useConfirm", () => {
  it("asks in a dialog named by the question, and answers yes from its danger button", async () => {
    const answers: boolean[] = [];
    render(<Asker answered={(yes) => answers.push(yes)} />);
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    const dialog = screen.getByRole("dialog", { name: "Delete UW1?" });
    expect(dialog.textContent).toContain("It goes for good.");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Delete" })));
    expect(answers).toEqual([true]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("answers no from Cancel", async () => {
    const answers: boolean[] = [];
    render(<Asker answered={(yes) => answers.push(yes)} />);
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Cancel" })));
    expect(answers).toEqual([false]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("LinkButton and BackLink", () => {
  it("is a link with a button's height, or an <a> when given href", () => {
    render(
      <MemoryRouter>
        <LinkButton to="/characters/import">Import a character</LinkButton>
        <LinkButton variant="secondary" href="/api/character-backups" download>
          Export all
        </LinkButton>
      </MemoryRouter>,
    );
    const inApp = screen.getByRole("link", { name: "Import a character" });
    expect(inApp.getAttribute("href")).toBe("/characters/import");
    expect(inApp.className).toContain("min-h-10");
    const out = screen.getByRole("link", { name: "Export all" });
    expect(out.getAttribute("href")).toBe("/api/character-backups");
    expect(out.hasAttribute("download")).toBe(true);
    expect(out.className).toContain("border-ash");
  });

  it("names the place it goes back to", () => {
    let backed = false;
    render(
      <MemoryRouter>
        <BackLink label="All locations" to="/troupes/t1/locations" />
        <BackLink label="Everyone" onClick={() => (backed = true)} />
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: "← All locations" });
    expect(link.getAttribute("href")).toBe("/troupes/t1/locations");
    expect(link.className).toContain("min-h-10");
    fireEvent.click(screen.getByRole("button", { name: "← Everyone" }));
    expect(backed).toBe(true);
  });
});
