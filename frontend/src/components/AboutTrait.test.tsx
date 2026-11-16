import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { TraitOut } from "../api/types";
import { AboutButton, AboutTrait, hasAbout } from "./AboutTrait";

afterEach(cleanup);

/** The power reference as the API sends it, already asked for, and nobody signed in. */
function client() {
  const found = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  found.setQueryData(["me"], null);
  found.setQueryData(["power-notes", "vampire"], {
    disciplines: [{ name: "Auspex", pool: "Mental + Investigation", versus: "Mental + Willpower" }],
    powers: [
      { discipline: "Auspex", level: 1, name: "Heightened Senses", note: "Sharper senses." },
      { discipline: "Auspex", level: 2, name: "Aura Perception", note: "Read an aura." },
      { discipline: "Auspex", level: 3, name: "Spirit's Touch", note: "Read an object." },
    ],
  });
  return found;
}

/** A row of a list to choose from, with its chevron and what it opens. */
function Row({ trait, from, to }: { trait: TraitOut; from?: number; to?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <AboutButton name={trait.name} open={open} controls={`about-${trait.name}`} onToggle={() => setOpen(!open)} />
      {open && <AboutTrait id={`about-${trait.name}`} trait={trait} splat="vampire" from={from} to={to} />}
    </div>
  );
}

const steal: TraitOut = {
  category: "elder_disciplines",
  name: "Mytherceria: Steal the Mind",
  description: "2 Blood, standard action, Mytherceria test: +3 Mental for 5 minutes.",
  page_reference: "217",
};
const auspex: TraitOut = { category: "disciplines", name: "Auspex", description: "Heightened senses and psychic insight.", page_reference: "128" };

describe("AboutTrait", () => {
  it("opens what a power does, with its page, and closes again", () => {
    render(
      <QueryClientProvider client={client()}>
        <Row trait={steal} />
      </QueryClientProvider>,
    );
    const button = screen.getByRole("button", { name: "About Mytherceria: Steal the Mind" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(button);
    const panel = document.getElementById(button.getAttribute("aria-controls")!)!;
    expect(panel.textContent).toContain("+3 Mental for 5 minutes.");
    expect(panel.textContent).toContain("MET: VTM p. 217");
    fireEvent.click(button);
    expect(document.getElementById(panel.id)).toBeNull();
  });

  it("gives a discipline's test pool and the power of the next dot only", () => {
    render(
      <QueryClientProvider client={client()}>
        <Row trait={auspex} from={2} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "About Auspex" }));
    const panel = screen.getByTestId("about-trait");
    expect(panel.textContent).toContain("Test: Mental + Investigation against Mental + Willpower.");
    expect(panel.textContent).toContain("Dot 2 gives:");
    expect(panel.textContent).toContain("Aura Perception Read an aura.");
    expect(panel.textContent).not.toContain("Heightened Senses");
    expect(panel.textContent).not.toContain("Spirit's Touch");
  });

  it("gives every dot a pick at a rating would", () => {
    render(
      <QueryClientProvider client={client()}>
        <Row trait={auspex} from={1} to={3} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "About Auspex" }));
    const panel = screen.getByTestId("about-trait");
    expect(panel.textContent).toContain("Dots 1 to 3 give:");
    expect(panel.textContent).toContain("Spirit's Touch");
  });

  it("several open at once", () => {
    render(
      <QueryClientProvider client={client()}>
        <Row trait={steal} />
        <Row trait={auspex} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "About Mytherceria: Steal the Mind" }));
    fireEvent.click(screen.getByRole("button", { name: "About Auspex" }));
    expect(screen.getAllByTestId("about-trait")).toHaveLength(2);
  });

  it("has nothing to say for a trait with no summary, wording or page", () => {
    expect(hasAbout({ category: "techniques", name: "Bull's Eye" })).toBe(false);
    expect(hasAbout({ category: "techniques", name: "Bull's Eye", page_reference: "226" })).toBe(true);
    expect(hasAbout({ category: "disciplines", name: "Auspex" }, "vampire")).toBe(true);
  });
});
