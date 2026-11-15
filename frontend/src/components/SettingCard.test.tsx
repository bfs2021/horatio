import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingCard, SettingForm, useSaveOnChange, useSettingForm } from "./SettingCard";
import { ToastProvider } from "./Toast";
import { Toggle } from "./Toggle";
import { ErrorText } from "./ui";

afterEach(cleanup);

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

/** A card with one typed field, saved with its button, kept as a server would. */
function Typed({ submit }: { submit: (value: { name: string }) => Promise<unknown> }) {
  const [kept, setKept] = useState("Elysium");
  const form = useSettingForm({ name: kept }, async (value) => {
    await submit(value);
    setKept(value.name);
  });
  return (
    <SettingCard title="Court name" about="What the court is called.">
      <SettingForm form={form}>
        <input aria-label="Name" value={form.value.name} onChange={(e) => form.set({ name: e.target.value })} />
      </SettingForm>
    </SettingCard>
  );
}

/** A card with one switch, saved as it changes. */
function Switched({ submit }: { submit: (on: boolean) => Promise<unknown> }) {
  const [on, setOn] = useState(false);
  const save = useSaveOnChange(async (next: boolean) => {
    await submit(next);
    setOn(next);
  });
  return (
    <SettingCard title="Rack">
      <Toggle label="Use the Rack" checked={on} disabled={save.isPending} onChange={(next) => save.mutate(next)} />
      <ErrorText error={save.error} />
    </SettingCard>
  );
}

describe("a settings card (#900)", () => {
  it("is a region named by its title, with its state, what it does, and who changes it when it is read-only", () => {
    wrap(
      <SettingCard title="Feeding" state="On" about="How Horatio handles feeding." readOnly>
        <p>As the book has it.</p>
      </SettingCard>,
    );
    const card = screen.getByRole("region", { name: "Feeding" });
    expect(card.textContent).toContain("On");
    expect(card.textContent).toContain("How Horatio handles feeding.");
    expect(card.textContent).toContain("The troupe's storytellers change this.");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("with a typed field, has one Save, enabled only once something changed, and saves it", async () => {
    const submit = vi.fn(() => Promise.resolve());
    wrap(<Typed submit={submit} />);
    const save = screen.getByRole("button", { name: "Save" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText("Not saved yet")).toBeNull();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "The Rookery" } });
    expect((save as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText("Not saved yet")).toBeTruthy();

    // Typed back as it was saved, there is nothing to save.
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Elysium" } });
    expect((save as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "The Rookery" } });
    fireEvent.click(save);
    await waitFor(() => expect(screen.getByText("Saved.")).toBeTruthy());
    expect(submit).toHaveBeenCalledWith({ name: "The Rookery" });
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("The Rookery");
    expect((save as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText("Not saved yet")).toBeNull();
  });

  it("keeps what was typed and says why when the save fails", async () => {
    wrap(<Typed submit={() => Promise.reject(new Error("The name is taken."))} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "The Rookery" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("The name is taken."));
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("The Rookery");
    expect(screen.getByText("Not saved yet")).toBeTruthy();
  });

  it("with only a switch, saves as it changes and says so, with no button", async () => {
    const submit = vi.fn(() => Promise.resolve());
    wrap(<Switched submit={submit} />);
    expect(screen.queryByRole("button")).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Use the Rack" }));
    await waitFor(() => expect(screen.getByText("Saved.")).toBeTruthy());
    expect(submit).toHaveBeenCalledWith(true);
    expect((screen.getByRole("switch", { name: "Use the Rack" }) as HTMLInputElement).checked).toBe(true);
  });

  it("puts a switch back and shows the error when its save fails", async () => {
    wrap(<Switched submit={() => Promise.reject(new Error("Couldn't save."))} />);
    fireEvent.click(screen.getByRole("switch", { name: "Use the Rack" }));
    await waitFor(() => expect(screen.getByText("Couldn't save.")).toBeTruthy());
    expect((screen.getByRole("switch", { name: "Use the Rack" }) as HTMLInputElement).checked).toBe(false);
  });
});
