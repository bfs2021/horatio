import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DataTable, type Column } from "./DataTable";

afterEach(cleanup);

type Row = { id: string; name: string; clan: string | null; xp: number; note: string };

const ROWS: Row[] = [
  { id: "a", name: "Isolde Fenwright", clan: "Toreador", xp: 12, note: "Arrived late" },
  { id: "b", name: "Casimir Wode", clan: null, xp: 3, note: "" },
];

const COLUMNS: Column<Row>[] = [
  { key: "name", header: "Character", phone: "title", cell: (r) => r.name },
  { key: "clan", header: "Clan", phone: "shown", cell: (r) => r.clan },
  { key: "xp", header: "XP", phone: "shown", numeric: true, cell: (r) => r.xp },
  { key: "note", header: "Note", phone: "detail", cell: (r) => r.note },
  { key: "actions", header: <span className="sr-only">Actions</span>, label: "Actions", phone: "always", cell: (r) => <button type="button">Actions for {r.name}</button> },
];

describe("DataTable", () => {
  it("is a table with a heading for each column and a row for each row", () => {
    render(<DataTable label="Characters" columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />);
    const table = screen.getByRole("table", { name: "Characters" });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Character", "Clan", "XP", "Note", "Actions"]);
    expect(within(table).getAllByRole("row")).toHaveLength(3);
  });

  it("folds the shown columns under the title, as label: value, for a phone; detail columns stay out", () => {
    render(<DataTable label="Characters" columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />);
    const cells = screen.getAllByRole("cell");
    const isolde = cells.find((c) => c.textContent?.startsWith("Isolde"))!;
    const casimir = cells.find((c) => c.textContent?.startsWith("Casimir"))!;
    expect(isolde.textContent).toBe("Isolde FenwrightClan:ToreadorXP:12");
    // A column with nothing to show for a row leaves its label out too.
    expect(casimir.textContent).toBe("Casimir WodeXP:3");
    // The fold shows only below the breakpoint; the cells it copies, only above it.
    expect(isolde.querySelector(".sm\\:hidden")).toBeTruthy();
    const clanCell = screen.getAllByRole("cell").find((c) => c.textContent === "Toreador")!;
    expect(clanCell.className).toContain("hidden sm:table-cell");
  });

  it("lines numbers up on the right in figures of one width", () => {
    render(<DataTable label="Characters" columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />);
    const xp = screen.getAllByRole("cell").find((c) => c.textContent === "12")!;
    expect(xp.className).toContain("text-right");
    expect(xp.className).toContain("tabular-nums");
  });

  it("opens a row under a row from the chevron at its start, more than one at once", () => {
    render(
      <DataTable
        label="People"
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        expand={{ label: (r) => `${r.name}'s characters`, render: (r) => <p>All of {r.name}</p> }}
      />,
    );
    const chevron = screen.getByRole("button", { name: "Isolde Fenwright's characters" });
    expect(chevron.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("All of Isolde Fenwright")).toBeNull();
    fireEvent.click(chevron);
    expect(chevron.getAttribute("aria-expanded")).toBe("true");
    const opened = screen.getByText("All of Isolde Fenwright").closest("tr")!;
    expect(chevron.getAttribute("aria-controls")).toBe(opened.id);
    expect(opened.querySelector("td")!.colSpan).toBe(COLUMNS.length + 1);
    fireEvent.click(screen.getByRole("button", { name: "Casimir Wode's characters" }));
    expect(screen.getByText("All of Casimir Wode")).toBeTruthy();
    expect(screen.getByText("All of Isolde Fenwright")).toBeTruthy();
    fireEvent.click(chevron);
    expect(screen.queryByText("All of Isolde Fenwright")).toBeNull();
  });

  it("with wholeRow, opens a row from a click anywhere on it, but not from a control of its own", () => {
    render(
      <DataTable
        label="People"
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        expand={{ label: (r) => `${r.name}'s characters`, render: (r) => <p>All of {r.name}</p>, wholeRow: true }}
      />,
    );
    const chevron = screen.getByRole("button", { name: "Isolde Fenwright's characters" });
    fireEvent.click(screen.getAllByRole("cell").find((c) => c.textContent === "Toreador")!);
    expect(chevron.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("All of Isolde Fenwright")).toBeTruthy();
    // The chevron opens and closes it once, not twice.
    fireEvent.click(chevron);
    expect(screen.queryByText("All of Isolde Fenwright")).toBeNull();
    // A button of the row's own does its own thing.
    fireEvent.click(screen.getByRole("button", { name: "Actions for Isolde Fenwright" }));
    expect(screen.queryByText("All of Isolde Fenwright")).toBeNull();
  });

  it("with select, picks a row from a click on it to show elsewhere, marks it, and gives its chevron the focus once let go (#979)", async () => {
    const picked: string[] = [];
    const table = (selected: string | null) => (
      <DataTable
        label="People"
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        select={{ label: (r) => `Details: ${r.name}`, onSelect: (r) => picked.push(r.id), selected }}
      />
    );
    const { rerender } = render(table(null));
    fireEvent.click(screen.getAllByRole("cell").find((c) => c.textContent === "Toreador")!);
    fireEvent.click(screen.getByRole("button", { name: "Details: Casimir Wode" }));
    // A button of the row's own does its own thing.
    fireEvent.click(screen.getByRole("button", { name: "Actions for Isolde Fenwright" }));
    expect(picked).toEqual(["a", "b"]);
    // Nothing opens under the row.
    expect(screen.getAllByRole("row")).toHaveLength(3);

    rerender(table("a"));
    const chevron = screen.getByRole("button", { name: "Details: Isolde Fenwright" });
    expect(chevron.getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("button", { name: "Details: Casimir Wode" }).getAttribute("aria-current")).toBeNull();
    rerender(table(null));
    await new Promise((done) => requestAnimationFrame(done));
    expect(document.activeElement).toBe(chevron);
  });

  it("with groups, puts each under a heading row that opens and closes it (#981)", () => {
    const toggled: string[] = [];
    const groups = (open: boolean) => [
      { key: "t", heading: "Toreador, 1", rows: [ROWS[0]!], open: true, onToggle: () => toggled.push("t") },
      { key: "none", heading: "No clan, 1", rows: [ROWS[1]!], open, onToggle: () => toggled.push("none") },
    ];
    const { rerender } = render(<DataTable label="Characters" columns={COLUMNS} groups={groups(false)} rowKey={(r) => r.id} />);
    const table = screen.getByRole("table", { name: "Characters" });
    const closed = within(table).getByRole("button", { name: "No clan, 1" });
    expect(closed.getAttribute("aria-expanded")).toBe("false");
    expect(within(table).getByRole("button", { name: "Toreador, 1" }).getAttribute("aria-expanded")).toBe("true");
    // The heading row spans the table; a closed group's rows are left out.
    expect(within(table).getAllByRole("rowheader")[0]!.getAttribute("colspan")).toBe(String(COLUMNS.length));
    expect(within(table).queryByText("Casimir Wode")).toBeNull();
    expect(within(table).getByText("Isolde Fenwright")).toBeTruthy();
    fireEvent.click(closed);
    expect(toggled).toEqual(["none"]);
    rerender(<DataTable label="Characters" columns={COLUMNS} groups={groups(true)} rowKey={(r) => r.id} />);
    expect(within(table).getByText("Casimir Wode")).toBeTruthy();
  });

  it("marks the column the list is sorted by", () => {
    const sorted = COLUMNS.map((c) => (c.key === "xp" ? { ...c, sort: "descending" as const } : c));
    render(<DataTable label="Characters" columns={sorted} rows={ROWS} rowKey={(r) => r.id} />);
    expect(screen.getByRole("columnheader", { name: "XP" }).getAttribute("aria-sort")).toBe("descending");
    expect(screen.getByRole("columnheader", { name: "Clan" }).getAttribute("aria-sort")).toBeNull();
  });
});
