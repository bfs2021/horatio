import { expect, test, type Page } from "@playwright/test";
import { closeContextsAfterEach, run, person, makeCustodian, builtVampire, ATTRIBUTES_AND_FOCUSES, backstoryOptional, shots, troupeTab, tabSettings } from "./support";

/** Boons: the troupe's ledger, for its running staff: registering a game's boons at once, settling, editing and trading them, each with its own log; the boon standings; the Play View's Boons tab, where players report boons and see what the troupe lets them (#686); review, where reports wait for staff to accept them (#687); the Harpy keeping the ledger as their character (#688); and Lesser Harpies the Harpy gives access (#689). */

closeContextsAfterEach();

/**
 * The boon ledger's table (#975): a row for each boon, named "Agnes owes Bram, minor",
 * opened by a click on it into its detail, a region named "Boon: Agnes owes Bram, minor".
 */
function ledgerOf(page: Page) {
  const table = page.getByRole("table", { name: "Boons" });
  return {
    table,
    row: (name: string) => table.getByRole("row", { name, exact: true }),
    // One chevron for each boon: the rows without the headings and the opened details.
    rows: table.getByRole("button", { name: /^Details: / }),
    detail: (name: string) => page.getByRole("region", { name: `Boon: ${name}`, exact: true }),
  };
}

test("staff keep the boon ledger: a game's boons at once, then a settling, an edit and a trade, each in its log", async ({ browser }) => {
  const custodian = await person(browser, "boons-custodian");
  makeCustodian(custodian.email);
  const lead = await person(browser, "boons-lead");
  const player = await person(browser, "boons-player");
  const headers = { "X-Horatio": "1" };
  const send = async (page: Page, method: "POST" | "PUT", url: string, data: object = {}) => {
    const response = await page.request.fetch(url, { method, headers, data });
    expect(response.status(), await response.text()).toBeLessThan(300);
    return response.json();
  };
  await custodian.page.reload();
  const troupe = await send(custodian.page, "POST", "/api/troupes", { name: `Ledger of Debts ${run}`, lead_handle: lead.handle });
  await backstoryOptional(custodian.page, troupe.id);
  const build = { ...ATTRIBUTES_AND_FOCUSES, backgrounds: [["Fame", 3], ["Herd", 2], ["Generation", 1]] as [string, number][], disciplines: [["Celerity", 2], ["Potence", 1], ["Presence", 1]] as [string, number][] };
  const mireille = await builtVampire(player.page, "Mireille Dauvin", "Brujah", build);
  const asked = await send(player.page, "POST", `/api/characters/${mireille}/home-troupe`, { troupe_id: troupe.id });
  await send(lead.page, "POST", `/api/approvals/${asked.id}/approve`);
  await send(lead.page, "POST", `/api/troupes/${troupe.id}/npcs`, { name: "Anselm Roque" });

  // The ledger is off by default. The lead switches it on in the Features list of the troupe's settings.
  const l = lead.page;
  await l.goto(`/troupes/${troupe.id}/settings`);
  const keep = l.getByRole("list", { name: "Features" }).getByRole("switch", { name: "Boons" });
  await expect(keep).toHaveAttribute("aria-checked", "false");
  await keep.click();
  await expect(l.getByText("Boons: switched on.")).toBeVisible();
  await expect(keep).toHaveAttribute("aria-checked", "true");

  // Under Court, the Boons screen: register a game's boons at once.
  await troupeTab(l, "Boons");
  await expect(l.getByText("No open boons yet.")).toBeVisible();
  await l.getByRole("button", { name: "Register boons" }).click();
  const entry = l.getByRole("form", { name: "Register boons" });
  await entry.getByLabel("Date for new rows").fill("2026-10-03");
  await entry.getByLabel("Where they come from (optional)").fill("Elysium, 3 October");
  const pick = async (row: ReturnType<Page["getByRole"]>, side: "Debtor" | "Creditor", typed: string, option: RegExp) => {
    await row.getByRole("combobox", { name: side }).fill(typed);
    await row.getByRole("listbox", { name: "Characters" }).getByRole("option", { name: option }).click();
  };
  const first = entry.getByRole("listitem", { name: "Boon 1" });
  await pick(first, "Debtor", "Mireille", /Mireille Dauvin/);
  await pick(first, "Creditor", "Anselm", /Anselm Roque/);
  await first.getByLabel("How many").fill("3");
  await first.getByLabel("Reason").fill("Secret");
  await entry.getByRole("button", { name: "Add a row" }).click();
  const second = entry.getByRole("listitem", { name: "Boon 2" });
  await pick(second, "Debtor", "Elder Varga", /name only/);
  await pick(second, "Creditor", "Mireille", /Mireille Dauvin/);
  await second.getByLabel("Kind").selectOption("trivial");
  await second.getByLabel("Reason").fill("Introduction");
  await entry.getByRole("button", { name: "Register 4 boons" }).click();
  await expect(l.getByText("Registered 4 boons.")).toBeVisible();

  const boons = ledgerOf(l);
  await expect(boons.row("Mireille Dauvin owes Anselm Roque, minor")).toHaveCount(3);
  await expect(l.getByRole("tab", { name: /^Open/ })).toContainText("(4)");
  // One line each (#975): a name only, someone not in Horatio, in italics.
  const vargaRow = boons.row("Elder Varga owes Mireille Dauvin, trivial");
  // (A phone's first line repeats the creditor, and its fold the state, so each is looked for where it shows.)
  const shown = (text: string) => vargaRow.getByText(text, { exact: true }).filter({ visible: true });
  await expect(shown("Elder Varga")).toHaveCSS("font-style", "italic");
  await expect(shown("Mireille Dauvin")).toHaveCSS("font-style", "normal");
  await expect(vargaRow).toContainText("Introduction");
  // A name that links to no character is flagged for review (#687), and the row says so.
  await expect(shown("Flagged")).toBeVisible();

  // One of the three is called in: it leaves the open boons for the settled. A click on its row opens it.
  await boons.row("Mireille Dauvin owes Anselm Roque, minor").first().click();
  const owed = boons.detail("Mireille Dauvin owes Anselm Roque, minor");
  await expect(owed).toContainText("Secret");
  await owed.getByRole("button", { name: "Settle" }).click();
  const settle = owed.getByRole("form", { name: "Settle: Mireille Dauvin owes Anselm Roque" });
  await settle.getByLabel(/^Called in/).check();
  await settle.getByLabel("Note (optional)").fill("Called in for a favour at court");
  await settle.getByRole("button", { name: "Settle it" }).click();
  await expect(l.getByRole("tab", { name: /^Open/ })).toContainText("(3)");
  await l.getByRole("tab", { name: /^Settled/ }).click();
  await expect(boons.rows).toHaveCount(1);
  await expect(boons.row("Mireille Dauvin owes Anselm Roque, minor")).toContainText("Settled: called in");
  // The chevron opens it too, from the keyboard.
  await boons.row("Mireille Dauvin owes Anselm Roque, minor").getByRole("button", { name: "Details: Mireille Dauvin owes Anselm Roque, minor" }).click();
  const settledLog = boons.detail("Mireille Dauvin owes Anselm Roque, minor").getByRole("list", { name: "Log of Mireille Dauvin owes Anselm Roque" });
  await expect(settledLog).toContainText("Elysium, 3 October");
  await expect(settledLog).toContainText("Called in for a favour at court");

  // The trivial boon was typed in wrong: an edit, with why, keeps what changed in its log.
  await l.getByRole("tab", { name: /^Open/ }).click();
  await expect(boons.rows).toHaveCount(3);
  await boons.row("Elder Varga owes Mireille Dauvin, trivial").click();
  const varga = boons.detail("Elder Varga owes Mireille Dauvin, trivial");
  await varga.getByRole("button", { name: "Edit" }).click();
  const edit = varga.getByRole("form", { name: "Edit: Elder Varga owes Mireille Dauvin" });
  await edit.getByLabel("Kind").selectOption("minor");
  await edit.getByLabel("Why the edit").fill("Typed in wrong");
  await edit.getByRole("button", { name: "Save", exact: true }).click();
  const edited = boons.detail("Elder Varga owes Mireille Dauvin, minor");
  await expect(edited.getByRole("list", { name: "Log of Elder Varga owes Mireille Dauvin" })).toContainText("Kind: Trivial → Minor");

  // Anselm trades one of his to Elder Varga: the boon keeps its history.
  await boons.row("Mireille Dauvin owes Anselm Roque, minor").first().click();
  const held = boons.detail("Mireille Dauvin owes Anselm Roque, minor");
  await held.getByRole("button", { name: "Trade" }).click();
  const trade = held.getByRole("form", { name: "Trade: Mireille Dauvin owes Anselm Roque" });
  await trade.getByRole("combobox", { name: "Traded to" }).fill("Elder Varga");
  await trade.getByRole("listbox", { name: "Characters" }).getByRole("option", { name: /name only/ }).click();
  await trade.getByRole("button", { name: "Record the trade" }).click();
  const traded = boons.detail("Mireille Dauvin owes Elder Varga, minor");
  await expect(traded.getByRole("list", { name: "Log of Mireille Dauvin owes Elder Varga" })).toContainText("Creditor: Anselm Roque → Elder Varga");

  // On Mireille's sheet, staff see what she owes and is owed, with a way into the ledger.
  await l.goto(`/characters/${mireille}`);
  const card = l.getByRole("listitem", { name: `Boons in Ledger of Debts ${run}` });
  await expect(card).toContainText("Owes: 2 minor");
  await expect(card).toContainText("Is owed: 1 minor");
  await card.getByRole("link", { name: "In the boon ledger" }).click();
  await expect(ledgerOf(l).rows).toHaveCount(3);

  // Her player isn't shown her boons (that comes with #686), and can't open the ledger.
  const p = player.page;
  const mine = await p.request.get(`/api/characters/${mireille}/boons`);
  expect((await mine.json()).troupes).toEqual([]);
  const refused = await p.request.get(`/api/troupes/${troupe.id}/boons`);
  expect(refused.status()).toBe(403);
});

test("the ledger shows a hundred boons a page, with Previous and Next, and the page in the URL (#978)", async ({ browser }) => {
  const custodian = await person(browser, "pager-custodian");
  makeCustodian(custodian.email);
  const lead = await person(browser, "pager-lead");
  const headers = { "X-Horatio": "1" };
  const send = async (page: Page, method: "POST" | "PUT", url: string, data: object = {}) => {
    const response = await page.request.fetch(url, { method, headers, data });
    expect(response.status(), await response.text()).toBeLessThan(300);
    return response.json();
  };
  await custodian.page.reload();
  const troupe = await send(custodian.page, "POST", "/api/troupes", { name: `Ledger by the Page ${run}`, lead_handle: lead.handle });
  const l = lead.page;
  await send(l, "PUT", `/api/troupes/${troupe.id}/boon-ledger`, { on: true });
  // 140 boons, twenty a month from January to July: July's are the newest.
  const rows = [1, 2, 3, 4, 5, 6, 7].map((month) => ({
    debtor: { name: `Debtor of month ${month}` },
    creditor: { name: "Hesper Calloway" },
    kind: "minor",
    made_on: `2026-0${month}-01`,
    reason: `Favour of month ${month}`,
    count: 20,
  }));
  await send(l, "POST", `/api/troupes/${troupe.id}/boons`, { boons: rows, note: "" });

  await l.goto(`/troupes/${troupe.id}/boons`);
  const boons = ledgerOf(l);
  const pages = l.getByRole("navigation", { name: "Pages of boons" });
  await expect(pages).toContainText("1 to 100 of 140");
  await expect(boons.rows).toHaveCount(100);
  await expect(boons.row("Debtor of month 7 owes Hesper Calloway, minor")).toHaveCount(20);
  await expect(pages.getByRole("button", { name: "Previous" })).toBeDisabled();

  // The next page has the oldest 40, and the URL says which page it is.
  await pages.getByRole("button", { name: "Next" }).click();
  await expect(pages).toContainText("101 to 140 of 140");
  await expect(l).toHaveURL(/[?&]page=2\b/);
  await expect(boons.rows).toHaveCount(40);
  await expect(boons.row("Debtor of month 1 owes Hesper Calloway, minor")).toHaveCount(20);
  await expect(boons.row("Debtor of month 7 owes Hesper Calloway, minor")).toHaveCount(0);
  await expect(pages.getByRole("button", { name: "Next" })).toBeDisabled();
  // A reload keeps the page.
  await l.reload();
  await expect(pages).toContainText("101 to 140 of 140");
  await expect(boons.rows).toHaveCount(40);
  // Back to the first page.
  await pages.getByRole("button", { name: "Previous" }).click();
  await expect(pages).toContainText("1 to 100 of 140");
  await expect(l).not.toHaveURL(/page=/);

  // Another view starts from its first page; one that fits on a page needs no pager.
  await pages.getByRole("button", { name: "Next" }).click();
  await expect(l).toHaveURL(/[?&]page=2\b/);
  await l.getByRole("tab", { name: /^All/ }).click();
  await expect(l).not.toHaveURL(/page=/);
  await expect(pages).toContainText("1 to 100 of 140");
  await l.getByRole("tab", { name: /^Settled/ }).click();
  await expect(l.getByText("None here.")).toBeVisible();
  await expect(pages).toHaveCount(0);
  // An old link past the last page shows the last there is.
  await l.goto(`/troupes/${troupe.id}/boons?page=9`);
  await expect(pages).toContainText("101 to 140 of 140");
  await expect(l).toHaveURL(/[?&]page=2\b/);
});

test("staff write a passage of story on a side of a boon, cut to a line, and its other side's player reads it as written (#990)", async ({ browser }) => {
  const custodian = await person(browser, "boonstory-custodian");
  makeCustodian(custodian.email);
  const lead = await person(browser, "boonstory-lead");
  const player = await person(browser, "boonstory-player");
  const headers = { "X-Horatio": "1" };
  const send = async (page: Page, method: "POST" | "PUT", url: string, data: object = {}) => {
    const response = await page.request.fetch(url, { method, headers, data });
    expect(response.status(), await response.text()).toBeLessThan(300);
    return response.json();
  };
  await custodian.page.reload();
  const troupe = await send(custodian.page, "POST", "/api/troupes", { name: `Debts in Story ${run}`, lead_handle: lead.handle });
  await backstoryOptional(custodian.page, troupe.id);
  const build = { ...ATTRIBUTES_AND_FOCUSES, backgrounds: [["Fame", 3], ["Herd", 2], ["Generation", 1]] as [string, number][], disciplines: [["Celerity", 2], ["Potence", 1], ["Presence", 1]] as [string, number][] };
  const lisette = await builtVampire(player.page, "Lisette Crane", "Brujah", build);
  const asked = await send(player.page, "POST", `/api/characters/${lisette}/home-troupe`, { troupe_id: troupe.id });
  await send(lead.page, "POST", `/api/approvals/${asked.id}/approve`);
  await send(lead.page, "PUT", `/api/troupes/${troupe.id}/boon-ledger`, { on: true });
  await send(lead.page, "PUT", `/api/troupes/${troupe.id}/boon-players`, { see: "owed", settle: false });
  // 600 characters of the plot where the debtor's name would be.
  const story = "The debt was written in silver on the night the river froze, and sealed. ".repeat(9).slice(0, 600).trim();

  // The lead registers it: the picker's last choice is someone not in Horatio, which takes any text.
  const l = lead.page;
  await l.goto(`/troupes/${troupe.id}/boons`);
  await l.getByRole("button", { name: "Register boons" }).click();
  const entry = l.getByRole("form", { name: "Register boons" });
  const row = entry.getByRole("listitem", { name: "Boon 1" });
  await row.getByRole("combobox", { name: "Debtor" }).click();
  await row.getByRole("listbox", { name: "Characters" }).getByRole("option", { name: "Someone not in Horatio…" }).click();
  const text = row.getByRole("textbox", { name: "Debtor" });
  await expect(text).toBeFocused();
  await expect(text).toHaveAttribute("maxlength", "2000");
  await expect(row.getByText("Its other side's player sees this as written.")).toBeVisible();
  await text.fill(story);
  await row.getByRole("combobox", { name: "Creditor" }).fill("Lisette");
  await row.getByRole("listbox", { name: "Characters" }).getByRole("option", { name: /Lisette Crane/ }).click();
  await row.getByLabel("Reason").fill("Passage across the frozen river");
  await entry.getByRole("button", { name: "Register the boon" }).click();
  await expect(l.getByText("Registered a boon.")).toBeVisible();

  // In the ledger, one line, in italics as a name only, all of it on hover (#975); its detail has it in full, and
  // opened to edit, it is there to change.
  const line = ledgerOf(l).table.getByRole("row", { name: /^The debt was written in silver/ });
  await expect(line).toHaveCount(1);
  await expect(line.locator(`[title="${story}"]`).filter({ visible: true }).first()).toHaveCSS("font-style", "italic");
  await line.click();
  const detail = l.getByRole("region", { name: /^Boon: The debt was written in silver/ });
  await expect(detail.getByText(story, { exact: true })).toBeVisible();
  await detail.getByRole("button", { name: "Edit" }).click();
  await expect(detail.getByRole("textbox", { name: "Debtor" })).toHaveValue(story);
  await detail.getByRole("button", { name: "Cancel" }).click();

  // Lisette's player reads it as written: a line of it, and all of it under "more".
  const p = player.page;
  await p.goto(`/play/characters/${lisette}?tab=boons`);
  const owed = p.getByRole("region", { name: "Owed to Lisette Crane" }).getByRole("listitem").filter({ hasText: "Passage across the frozen river" });
  await expect(owed).toContainText(story.slice(0, 40));
  const more = owed.getByRole("button", { name: /^Read all of/ });
  await more.click();
  await expect(p.locator(`[id="${await more.getAttribute("aria-controls")}"]`)).toHaveText(story);
});

test("staff export the ledger from its ⋯ menu: this view or the whole ledger, as a CSV file or a spreadsheet (#986)", async ({ browser }) => {
  const custodian = await person(browser, "bexport-custodian");
  makeCustodian(custodian.email);
  const lead = await person(browser, "bexport-lead");
  const headers = { "X-Horatio": "1" };
  const send = async (page: Page, method: "POST" | "PUT", url: string, data: object = {}) => {
    const response = await page.request.fetch(url, { method, headers, data });
    expect(response.status(), await response.text()).toBeLessThan(300);
    return response.json();
  };
  await custodian.page.reload();
  const troupe = await send(custodian.page, "POST", "/api/troupes", { name: `Debts Exported ${run}`, lead_handle: lead.handle });
  await send(lead.page, "PUT", `/api/troupes/${troupe.id}/boon-ledger`, { on: true });
  // Names only on either side, and a reason a spreadsheet would run as a formula.
  const boon = (debtor: string, creditor: string, kind: string, reason: string) => ({ debtor: { name: debtor }, creditor: { name: creditor }, kind, made_on: "2026-10-03", reason });
  await send(lead.page, "POST", `/api/troupes/${troupe.id}/boons`, {
    boons: [boon("Odile Marchand", "Rufus Kett", "major", "=2+2"), boon("Rufus Kett", "Odile Marchand", "minor", "Directions")],
  });

  const l = lead.page;
  await l.goto(`/troupes/${troupe.id}`);
  await troupeTab(l, "Boons");
  const ledger = ledgerOf(l);
  await expect(ledger.rows).toHaveCount(2);
  await l.getByLabel("Kind", { exact: true }).selectOption({ label: "Major" });
  await expect(ledger.rows).toHaveCount(1);

  const { readFile } = await import("node:fs/promises");
  const exported = async (item: string) => {
    await l.getByRole("button", { name: "More for the ledger" }).click();
    const downloading = l.waitForEvent("download");
    await l.getByRole("menuitem", { name: item }).click();
    return downloading;
  };
  // This view: the major boon only, its formula kept as text, in a file Excel reads as UTF-8.
  const view = await exported("This view (CSV)");
  expect(view.suggestedFilename()).toMatch(/^debts-exported-.*-boons-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = (await readFile(await view.path(), "utf8")).trimEnd().split("\r\n");
  expect(csv[0]).toMatch(/^\uFEFFOwed By,Owed To,Type,Date,Reason,Stipulation,State,/);
  expect(csv).toHaveLength(2);
  expect(csv[1]).toMatch(/^Odile Marchand,Rufus Kett,Major,2026-10-03,'=2\+2,,Standing,No,/);

  // The whole ledger, as a spreadsheet.
  const whole = await exported("Whole ledger (spreadsheet)");
  expect(whole.suggestedFilename()).toMatch(/-boons-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const book = await readFile(await whole.path());
  expect(book.subarray(0, 2).toString()).toBe("PK");

  // Each export is in the troupe's log.
  const log = await (await l.request.get(`/api/troupes/${troupe.id}/log`)).json();
  const messages = log.map((e: { message: string }) => e.message);
  expect(messages).toContain("bexport-lead exported part of the boon ledger as a CSV file (1 boon).");
  expect(messages).toContain("bexport-lead exported the whole boon ledger as a spreadsheet (2 boons).");
});

test("staff see the boon standings: each character's net by the troupe's weights, which they can change", async ({ browser }) => {
  const custodian = await person(browser, "bstand-custodian");
  makeCustodian(custodian.email);
  const lead = await person(browser, "bstand-lead");
  const headers = { "X-Horatio": "1" };
  const send = async (page: Page, method: "POST" | "PUT", url: string, data: object = {}) => {
    const response = await page.request.fetch(url, { method, headers, data });
    expect(response.status(), await response.text()).toBeLessThan(300);
    return response.json();
  };
  await custodian.page.reload();
  const troupe = await send(custodian.page, "POST", "/api/troupes", { name: `Standing of Debts ${run}`, lead_handle: lead.handle });
  const l = lead.page;
  const isolde = await send(l, "POST", `/api/troupes/${troupe.id}/npcs`, { name: "Isolde Fenwright" });
  const casimir = await send(l, "POST", `/api/troupes/${troupe.id}/npcs`, { name: "Casimir Wode" });
  await send(l, "PUT", `/api/troupes/${troupe.id}/boon-ledger`, { on: true });
  const owes = (debtor: string, creditor: string, kind: string) => ({ debtor: { character_id: debtor }, creditor: { character_id: creditor }, kind, made_on: "2026-10-03" });
  await send(l, "POST", `/api/troupes/${troupe.id}/boons`, { boons: [owes(isolde.id, casimir.id, "major"), owes(casimir.id, isolde.id, "minor")] });

  // Under Court › Boons, Standings: Casimir is owed a major and owes a minor.
  await l.goto(`/troupes/${troupe.id}`);
  await troupeTab(l, "Boons");
  await l.getByRole("navigation", { name: "Boons", exact: true }).getByRole("link", { name: "Standings", exact: true }).click();
  await expect(l).toHaveURL(new RegExp(`/troupes/${troupe.id}/boons/standings$`));
  const standing = l.getByRole("table", { name: "Standing by character" });
  await expect(standing.getByRole("row", { name: /Casimir Wode/ })).toContainText("+2");
  await expect(standing.getByRole("row", { name: /Isolde Fenwright/ })).toContainText("−2");
  await expect(l.getByRole("table", { name: "Owing each other" })).toContainText("Isolde Fenwright");
  // Each total says what it counts, under its number (#919).
  await expect(l.getByRole("definition").filter({ hasText: "Standing, with everyone on them in play." })).toBeVisible();

  // The troupe weighs a major boon at 4: the sums follow.
  await l.getByRole("button", { name: "Edit the weights" }).click();
  await l.getByLabel("Major").fill("4");
  await l.getByRole("button", { name: "Save", exact: true }).click();
  await expect(l.getByText("The boon weights are saved.")).toBeVisible();
  await expect(standing.getByRole("row", { name: /Casimir Wode/ })).toContainText("+3");
  await expect(l.getByText(/Major 4/)).toBeVisible();
});

test("on a phone the boon standings fold into blocks, nothing sideways with 20 long names; from sm up they are tables (#914)", async ({ browser }) => {
  const custodian = await person(browser, "bfold914-cust");
  makeCustodian(custodian.email);
  const lead = await person(browser, "bfold914-lead");
  const headers = { "X-Horatio": "1" };
  const send = async (page: Page, method: "POST" | "PUT", url: string, data: object = {}) => {
    const response = await page.request.fetch(url, { method, headers, data });
    expect(response.status(), await response.text()).toBeLessThan(300);
    return response.json();
  };
  await custodian.page.reload();
  const troupe = await send(custodian.page, "POST", "/api/troupes", { name: `Ledger of Long Names ${run}`, lead_handle: lead.handle });
  const l = lead.page;
  const names = Array.from({ length: 20 }, (_, i) =>
    i === 0 ? "Wolfeschlegelsteinhausenbergerdorffvoralternwarengewissenhaft" : `Bartholomew Featherstonehaugh-Cholmondeley of Wolverhampton ${i + 1}`,
  );
  const npcs: { id: string }[] = [];
  for (const name of names) npcs.push(await send(l, "POST", `/api/troupes/${troupe.id}/npcs`, { name }));
  await send(l, "PUT", `/api/troupes/${troupe.id}/boon-ledger`, { on: true });
  // Each owes the next a major boon, and the first two owe each other.
  const owes = (debtor: { id: string }, creditor: { id: string }, kind: string) => ({ debtor: { character_id: debtor.id }, creditor: { character_id: creditor.id }, kind, made_on: "2026-10-03" });
  await send(l, "POST", `/api/troupes/${troupe.id}/boons`, { boons: [...npcs.map((n, i) => owes(n, npcs[(i + 1) % 20], "major")), owes(npcs[1], npcs[0], "minor")] });

  const phone = test.info().project.name === "phone";
  if (phone) await l.setViewportSize({ width: 375, height: 800 });
  await l.goto(`/troupes/${troupe.id}/boons/standings`);
  const standing = l.getByRole("table", { name: "Standing by character" });
  await expect(standing.locator("tbody tr")).toHaveCount(20);
  await expect(standing.getByText(names[0], { exact: true })).toBeVisible();
  await expect(l.getByRole("table", { name: "Owing each other" })).toContainText(names[0]);
  // Against the viewport, not innerWidth: a phone widens its layout to fit what is too wide.
  expect(await l.evaluate(() => document.documentElement.scrollWidth)).toBe(l.viewportSize()!.width);
  // The net, under the name on a phone and in its column from sm up, both read in words.
  const first = standing.getByRole("row", { name: new RegExp(names[0]) });
  await expect(first).toContainText("+1");
  if (phone) await expect(first.getByText("Net:", { exact: true })).toBeVisible();
  else {
    await expect(standing.getByRole("columnheader", { name: "Net" })).toBeVisible();
    await expect(first.getByRole("cell", { name: "owed 1 more than they owe" })).toBeVisible();
  }
  await l.screenshot(shots("boon-standings-long-names"));
});

test("a Disgraced creditor's boons need not be repaid, and staff register the boon an apology owes for a slip (#694)", async ({ browser }) => {
  const custodian = await person(browser, "bslip-custodian");
  makeCustodian(custodian.email);
  const lead = await person(browser, "bslip-lead");
  const headers = { "X-Horatio": "1" };
  const send = async (page: Page, method: "POST" | "PUT", url: string, data: object = {}) => {
    const response = await page.request.fetch(url, { method, headers, data });
    expect(response.status(), await response.text()).toBeLessThan(300);
    return response.json();
  };
  await custodian.page.reload();
  const troupe = await send(custodian.page, "POST", "/api/troupes", { name: `Slips and Debts ${run}`, lead_handle: lead.handle });
  const l = lead.page;
  const camarilla = async (name: string) => {
    const npc = await send(l, "POST", `/api/troupes/${troupe.id}/npcs`, { name, wizard: false });
    await send(l, "PUT", `/api/characters/${npc.id}/npc/ratings`, { category: "sect", name: "Camarilla", rating: null, detail: "" });
    return npc.id as string;
  };
  const corvin = await camarilla("Corvin Ashgrave");
  const maelis = await camarilla("Maelis Thorne");
  await send(l, "PUT", `/api/troupes/${troupe.id}/boon-ledger`, { on: true });
  await send(l, "POST", `/api/troupes/${troupe.id}/boons`, {
    boons: [{ debtor: { character_id: maelis }, creditor: { character_id: corvin }, kind: "minor", made_on: "2026-10-03", reason: "Safe passage" }],
  });
  await send(l, "POST", `/api/characters/${corvin}/status`, { name: "Disgraced", patron_text: "Prince Aurelian", reason: "Broke the Masquerade" });

  // The ledger says Maelis's boon to Corvin need not be repaid while he is Disgraced.
  await l.goto(`/troupes/${troupe.id}/boons`);
  const boons = ledgerOf(l);
  await expect(boons.row("Maelis Thorne owes Corvin Ashgrave, minor")).toContainText("Disgraced");
  await boons.row("Maelis Thorne owes Corvin Ashgrave, minor").click();
  await expect(boons.detail("Maelis Thorne owes Corvin Ashgrave, minor")).toContainText("Need not be repaid while Corvin Ashgrave is Disgraced (p. 316).");

  // On Corvin's status, staff register the major boon his apology owes the Prince.
  await l.goto(`/characters/${corvin}/status`);
  const card = l.locator("section").filter({ has: l.getByRole("heading", { name: "Status", exact: true }) });
  await card.getByRole("listitem", { name: "Disgraced" }).getByRole("button", { name: "Apology boon…" }).click();
  const form = card.getByRole("form", { name: "Apology boon for a slip while Disgraced" });
  await expect(form.getByLabel("Owed to: whoever was wronged")).toHaveValue("Prince Aurelian");
  await form.getByRole("button", { name: "Register a major boon" }).click();
  await expect(l.getByText("Registered a major boon owed by Corvin Ashgrave.")).toBeVisible();
  await l.goto(`/troupes/${troupe.id}/boons`);
  await expect(boons.row("Corvin Ashgrave owes Prince Aurelian, major")).toContainText("An apology for a slip while Disgraced");
});

test("staff see the boon statistics: the ledger over time, who owes whom, between clans and at each game", async ({ browser }) => {
  const custodian = await person(browser, "bstats-custodian");
  makeCustodian(custodian.email);
  const lead = await person(browser, "bstats-lead");
  const headers = { "X-Horatio": "1" };
  const send = async (page: Page, method: "POST" | "PUT", url: string, data: object = {}) => {
    const response = await page.request.fetch(url, { method, headers, data });
    expect(response.status(), await response.text()).toBeLessThan(300);
    return response.json();
  };
  await custodian.page.reload();
  const troupe = await send(custodian.page, "POST", "/api/troupes", { name: `Debts Charted ${run}`, lead_handle: lead.handle });
  const l = lead.page;
  const wendeline = await send(l, "POST", `/api/troupes/${troupe.id}/npcs`, { name: "Wendeline Krause" });
  const thaddeus = await send(l, "POST", `/api/troupes/${troupe.id}/npcs`, { name: "Thaddeus Grue" });
  await send(l, "PUT", `/api/troupes/${troupe.id}/boon-ledger`, { on: true });
  const owes = (debtor: object, creditor: object, kind: string) => ({ debtor, creditor, kind, made_on: "2026-10-03" });
  await send(l, "POST", `/api/troupes/${troupe.id}/boons`, {
    boons: [owes({ character_id: wendeline.id }, { character_id: thaddeus.id }, "major"), owes({ name: "The Grey Countess" }, { character_id: wendeline.id }, "minor")],
  });

  // The old address of Boon statistics, from before it joined Boons (#780), still leads there.
  await l.goto(`/troupes/${troupe.id}/boon-statistics`);
  await expect(l).toHaveURL(new RegExp(`/troupes/${troupe.id}/boons/statistics$`));
  // Under Court › Boons, Statistics: each of the four charts, every one with its table.
  await l.goto(`/troupes/${troupe.id}`);
  await troupeTab(l, "Boons");
  await l.getByRole("navigation", { name: "Boons", exact: true }).getByRole("link", { name: "Statistics", exact: true }).click();
  for (const title of ["Boons registered", "Who owes whom", "Debt between clans", "Boons at each game"]) {
    await expect(l.getByRole("figure", { name: title })).toBeVisible();
  }
  // Open debt over time by weight, read as a table: the major (3) and the minor (1) stand this month.
  await l.getByRole("radio", { name: "Open debt" }).click();
  await l.getByRole("radio", { name: "Weight" }).click();
  const overTime = l.getByRole("figure", { name: "Open debt over time" });
  await overTime.getByRole("button", { name: "Show as table" }).click();
  await expect(overTime.getByRole("table").getByRole("row").last().getByRole("cell").last()).toHaveText("4");

  // The network shows both debts, and filtering to the name-only party keeps only hers.
  const web = l.getByRole("figure", { name: "Who owes whom" });
  await expect(web.getByRole("img", { name: /Thaddeus Grue/ })).toBeVisible();
  await expect(web.getByText(/2 of 2 debts shown/)).toBeVisible();
  await l.getByRole("combobox", { name: "Clan", exact: true }).selectOption("Name only");
  await expect(web.getByText(/1 of 2 debts shown/)).toBeVisible();
  await expect(web.getByRole("img", { name: /Thaddeus Grue/ })).toHaveCount(0);
  await expect(web.getByRole("img", { name: /The Grey Countess/ })).toBeVisible();
});

test("in the Play View's Boons tab a player reports a boon, sees what the troupe lets them, and only the creditor's player settles it (#686)", async ({ browser }) => {
  const custodian = await person(browser, "boontab-custodian");
  makeCustodian(custodian.email);
  const lead = await person(browser, "boontab-lead");
  const creditor = await person(browser, "boontab-creditor");
  const debtor = await person(browser, "boontab-debtor");
  const headers = { "X-Horatio": "1" };
  const send = async (page: Page, method: "POST" | "PUT", url: string, data: object = {}) => {
    const response = await page.request.fetch(url, { method, headers, data });
    expect(response.status(), await response.text()).toBeLessThan(300);
    return response.json();
  };
  await custodian.page.reload();
  const troupe = await send(custodian.page, "POST", "/api/troupes", { name: `Debts Told ${run}`, lead_handle: lead.handle });
  await backstoryOptional(custodian.page, troupe.id);
  const build = { ...ATTRIBUTES_AND_FOCUSES, backgrounds: [["Fame", 3], ["Herd", 2], ["Generation", 1]] as [string, number][], disciplines: [["Celerity", 2], ["Potence", 1], ["Presence", 1]] as [string, number][] };
  const home = async (page: Page, name: string) => {
    const id = await builtVampire(page, name, "Brujah", build);
    const asked = await send(page, "POST", `/api/characters/${id}/home-troupe`, { troupe_id: troupe.id });
    await send(lead.page, "POST", `/api/approvals/${asked.id}/approve`);
    return id;
  };
  const isolde = await home(creditor.page, "Isolde Marrow");
  const tobiah = await home(debtor.page, "Tobiah Venn");
  await send(lead.page, "PUT", `/api/troupes/${troupe.id}/boon-ledger`, { on: true });

  // By default a player sees only the form: Isolde's player reports that Tobiah owes her.
  const c = creditor.page;
  await c.goto(`/play/characters/${isolde}?tab=boons`);
  const tab = c.getByRole("region", { name: "Boons" });
  const report = tab.getByRole("form", { name: "Report a boon" });
  await expect(report).toBeVisible();
  await expect(tab.getByRole("region", { name: "Owed to Isolde Marrow" })).toHaveCount(0);
  await report.getByLabel("They owe Isolde Marrow").check();
  await report.getByLabel("Who").selectOption({ label: "Tobiah Venn" });
  await report.getByLabel("Kind").selectOption("major");
  await report.getByLabel("Reason").fill("Shelter before dawn");
  await report.getByRole("button", { name: "Report the boon" }).click();
  await expect(c.getByText(`Reported to Debts Told ${run}'s ledger: Tobiah Venn owes Isolde Marrow a major boon.`)).toBeVisible();

  // The lead lets players see what they owe and are owed, and creditors settle.
  const l = lead.page;
  await l.goto(`/troupes/${troupe.id}/boons#settings`);
  await tabSettings(l, "Boons");
  await l.getByRole("radio", { name: /^Also what they're owed/ }).check();
  await expect(l.getByText("Saved what players see of the boon ledger.")).toBeVisible();
  await l.getByRole("switch", { name: /^Players mark boons owed to them settled/ }).check();
  await expect(l.getByRole("switch", { name: /^Players mark boons owed to them settled/ })).toBeChecked();

  // Tobiah's player sees what he owes, with no way to settle it.
  const d = debtor.page;
  await d.goto(`/play/characters/${tobiah}?tab=boons`);
  const owes = d.getByRole("region", { name: "Tobiah Venn owes" });
  const debt = owes.getByRole("listitem", { name: "Major boon to Isolde Marrow" });
  await expect(debt).toContainText("Shelter before dawn");
  await expect(debt.getByRole("button", { name: "Settle" })).toHaveCount(0);

  // Isolde's player sees it owed to her, and forgives it.
  await c.reload();
  const owed = c.getByRole("region", { name: "Owed to Isolde Marrow" });
  const held = owed.getByRole("listitem", { name: "Major boon from Tobiah Venn" });
  await expect(held).toBeVisible();
  await c.screenshot(shots("play-boons"));
  await held.getByRole("button", { name: "Settle" }).click();
  const settle = held.getByRole("form", { name: "Settle the boon" });
  await settle.getByLabel(/^Forgiven/).check();
  await settle.getByLabel("Note (optional)").fill("For old times");
  await settle.getByRole("button", { name: "Mark it settled" }).click();
  await expect(owed.getByText("No boons in the ledger are owed to Isolde Marrow.")).toBeVisible();
  await owed.getByText("Settled (1)").click();
  // With the day it was settled, a date and not NaN (#998).
  await expect(owed.getByRole("listitem", { name: "Major boon from Tobiah Venn" })).toContainText(/Settled: forgiven, \d{1,2} [A-Z][a-z]{2} \d{4}\. For old times\./);

  // In the ledger, staff see it was done as Isolde.
  await l.goto(`/troupes/${troupe.id}/boons`);
  await l.getByRole("tab", { name: /^Settled/ }).click();
  await ledgerOf(l).row("Tobiah Venn owes Isolde Marrow, major").click();
  const log = ledgerOf(l).detail("Tobiah Venn owes Isolde Marrow, major").getByRole("list", { name: "Log of Tobiah Venn owes Isolde Marrow" });
  await expect(log).toContainText("as Isolde Marrow");
  await expect(log).toContainText("For old times");
});

test("a creditor with Social Nobility, repaid a boon, gives its debtor Gallant from the Play View (#693)", async ({ browser }) => {
  const custodian = await person(browser, "gallant-custodian");
  makeCustodian(custodian.email);
  const lead = await person(browser, "gallant-lead");
  const creditor = await person(browser, "gallant-creditor");
  const debtor = await person(browser, "gallant-debtor");
  const headers = { "X-Horatio": "1" };
  const send = async (page: Page, method: "GET" | "POST" | "PUT", url: string, data: object = {}) => {
    const response = await page.request.fetch(url, { method, headers, ...(method === "GET" ? {} : { data }) });
    expect(response.status(), await response.text()).toBeLessThan(300);
    return response.json();
  };
  await custodian.page.reload();
  const troupe = await send(custodian.page, "POST", "/api/troupes", { name: `Repaid in Full ${run}`, lead_handle: lead.handle });
  await backstoryOptional(custodian.page, troupe.id);
  // Two Camarilla Brujah, built through the API and accepted home: Corvane has Social Nobility.
  const home = async (page: Page, name: string, merits: [string, number][]) => {
    const { id } = await send(page, "POST", "/api/characters", { splat: "vampire", name });
    await send(page, "PUT", `/api/characters/${id}/traits`, { category: "clan", name: "Brujah", rating: null });
    await send(page, "PUT", `/api/characters/${id}/traits`, { category: "sect", name: "Camarilla", rating: null });
    const build: Record<string, [string, number][]> = {
      ...ATTRIBUTES_AND_FOCUSES,
      backgrounds: [["Fame", 3], ["Herd", 2], ["Generation", 1]],
      disciplines: [["Celerity", 2], ["Potence", 1], ["Presence", 1]],
      ...(merits.length ? { merits } : {}),
    };
    for (const [category, picks] of Object.entries(build))
      await send(page, "PUT", `/api/characters/${id}/creation/categories/${category}`, { picks: picks.map(([n, rating]) => ({ name: n, rating })) });
    await send(page, "POST", `/api/characters/${id}/creation/complete`);
    const asked = await send(page, "POST", `/api/characters/${id}/home-troupe`, { troupe_id: troupe.id });
    await send(lead.page, "POST", `/api/approvals/${asked.id}/approve`);
    return id as string;
  };
  const corvane = await home(creditor.page, "Lady Corvane", [["Social Nobility", 3]]);
  const hesk = await home(debtor.page, "Hesk Arlow", []);
  await send(lead.page, "PUT", `/api/troupes/${troupe.id}/boon-ledger`, { on: true });
  await send(lead.page, "PUT", `/api/troupes/${troupe.id}/boon-players`, { see: "owed", settle: true });
  await send(lead.page, "POST", `/api/troupes/${troupe.id}/boons`, {
    boons: [{ debtor: { character_id: hesk }, creditor: { character_id: corvane }, kind: "minor", made_on: "2026-10-03", reason: "A word with the Prince" }],
    note: "",
  });

  // Corvane's player calls the boon in, and is offered Gallant for Hesk.
  const c = creditor.page;
  await c.goto(`/play/characters/${corvane}?tab=boons`);
  const owed = c.getByRole("region", { name: "Owed to Lady Corvane" });
  const held = owed.getByRole("listitem", { name: "Minor boon from Hesk Arlow" });
  await held.getByRole("button", { name: "Settle" }).click();
  const settle = held.getByRole("form", { name: "Settle the boon" });
  await settle.getByLabel(/^Called in/).check();
  await settle.getByRole("button", { name: "Mark it settled" }).click();
  await owed.getByText("Settled (1)").click();
  const repaid = owed.getByRole("listitem", { name: "Minor boon from Hesk Arlow" });
  const offer = repaid.getByRole("group", { name: "Gallant offered" });
  await expect(offer).toContainText("Give Hesk Arlow Gallant for repaying it? The creditor has Social Nobility (p. 405).");
  await offer.getByRole("button", { name: "Give Gallant" }).click();
  await expect(offer).toHaveCount(0);

  // Hesk holds Gallant, from Corvane; the boon's log says it was given, as Corvane.
  const found = await send(debtor.page, "GET", `/api/characters/${hesk}/status`);
  expect(found.held.map((h: { name: string }) => h.name)).toEqual(["Gallant"]);
  const l = lead.page;
  await l.goto(`/troupes/${troupe.id}/boons`);
  await l.getByRole("tab", { name: /^Settled/ }).click();
  await ledgerOf(l).row("Hesk Arlow owes Lady Corvane, minor").click();
  const log = ledgerOf(l).detail("Hesk Arlow owes Lady Corvane, minor").getByRole("list", { name: "Log of Hesk Arlow owes Lady Corvane" });
  await expect(log).toContainText("Gallant given");
  await expect(log).toContainText("as Lady Corvane");
});

test("held for review, a player's report waits, flagged for its unlinked name, until staff accept it (#687)", async ({ browser }) => {
  const custodian = await person(browser, "brev-custodian");
  makeCustodian(custodian.email);
  const lead = await person(browser, "brev-lead");
  const player = await person(browser, "brev-player");
  const headers = { "X-Horatio": "1" };
  const send = async (page: Page, method: "POST" | "PUT", url: string, data: object = {}) => {
    const response = await page.request.fetch(url, { method, headers, data });
    expect(response.status(), await response.text()).toBeLessThan(300);
    return response.json();
  };
  await custodian.page.reload();
  const troupe = await send(custodian.page, "POST", "/api/troupes", { name: `Debts Weighed ${run}`, lead_handle: lead.handle });
  await backstoryOptional(custodian.page, troupe.id);
  const build = { ...ATTRIBUTES_AND_FOCUSES, backgrounds: [["Fame", 3], ["Herd", 2], ["Generation", 1]] as [string, number][], disciplines: [["Celerity", 2], ["Potence", 1], ["Presence", 1]] as [string, number][] };
  const corvin = await builtVampire(player.page, "Corvin Ashby", "Brujah", build);
  const asked = await send(player.page, "POST", `/api/characters/${corvin}/home-troupe`, { troupe_id: troupe.id });
  await send(lead.page, "POST", `/api/approvals/${asked.id}/approve`);
  await send(lead.page, "PUT", `/api/troupes/${troupe.id}/boon-ledger`, { on: true });

  // The lead holds reports for review.
  const l = lead.page;
  await l.goto(`/troupes/${troupe.id}/boons#settings`);
  const hold = (await tabSettings(l, "Boons")).getByRole("switch", { name: /^Boons players report wait for review/ });
  await hold.check();
  await expect(l.getByText("Boons players report now wait for review.")).toBeVisible();
  await expect(hold).toBeChecked();

  // Corvin's player reports that someone not on the list owes him.
  const p = player.page;
  await p.goto(`/play/characters/${corvin}?tab=boons`);
  const tab = p.getByRole("region", { name: "Boons" });
  const report = tab.getByRole("form", { name: "Report a boon" });
  await report.getByLabel("They owe Corvin Ashby").check();
  await report.getByLabel("Who").selectOption({ label: "Someone else…" });
  await report.getByLabel("Their name").fill("Mysterious Stranger");
  await report.getByLabel("Reason").fill("A ride across the river");
  await report.getByRole("button", { name: "Report the boon" }).click();
  await expect(p.getByText(`Sent to Debts Weighed ${run}'s staff for review: Mysterious Stranger owes Corvin Ashby a minor boon.`)).toBeVisible();
  const reports = tab.getByRole("list", { name: "Your reports" });
  await expect(reports).toContainText("Mysterious Stranger owes Corvin Ashby a minor boon");
  await expect(reports).toContainText(`Waiting for Debts Weighed ${run}'s staff to review it.`);

  // The lead sees it waiting, flagged for its name, and accepts it.
  await l.goto(`/troupes/${troupe.id}/boons`);
  await l.getByRole("tab", { name: /^To review/ }).click();
  const row = l.getByRole("list", { name: "Boons to review" }).getByRole("listitem", { name: "To review: Mysterious Stranger owes Corvin Ashby, minor" });
  await expect(row).toContainText("Name not linked (debtor, Mysterious Stranger): No character in the troupe has this name.");
  await expect(row.getByText("Waits for review").first()).toBeVisible();
  await row.getByRole("button", { name: "Review" }).click();
  await row.getByRole("button", { name: "Accept", exact: true }).click();
  const accept = row.getByRole("form", { name: "Accept: Mysterious Stranger owes Corvin Ashby" });
  await accept.getByLabel("Note (optional)").fill("Confirmed with the Harpy");
  await accept.getByRole("button", { name: "Accept it" }).click();
  await expect(l.getByText("Accepted: Mysterious Stranger owes Corvin Ashby.")).toBeVisible();
  await expect(l.getByText("Nothing waits for review, and no boon is flagged.")).toBeVisible();

  // It stands in the ledger, with its review in its log; and the report is gone from the player's tab.
  await l.getByRole("tab", { name: /^Open/ }).click();
  await ledgerOf(l).row("Mysterious Stranger owes Corvin Ashby, minor").click();
  const log = ledgerOf(l).detail("Mysterious Stranger owes Corvin Ashby, minor").getByRole("list", { name: "Log of Mysterious Stranger owes Corvin Ashby" });
  await expect(log).toContainText("Reported for review");
  await expect(log).toContainText("Accepted");
  await expect(log).toContainText("Confirmed with the Harpy");
  await p.reload();
  await expect(p.getByRole("region", { name: "Boons" }).getByRole("form", { name: "Report a boon" })).toBeVisible();
  await expect(p.getByRole("list", { name: "Your reports" })).toHaveCount(0);
});

test("the Harpy keeps the ledger from the Play View as their character, and never sees what an edit changed (#688)", async ({ browser }) => {
  const custodian = await person(browser, "bharpy-custodian");
  makeCustodian(custodian.email);
  const lead = await person(browser, "bharpy-lead");
  const harpy = await person(browser, "bharpy-harpy");
  const player = await person(browser, "bharpy-player");
  const headers = { "X-Horatio": "1" };
  const send = async (page: Page, method: "POST" | "PUT", url: string, data: object = {}) => {
    const response = await page.request.fetch(url, { method, headers, data });
    expect(response.status(), await response.text()).toBeLessThan(300);
    return response.json();
  };
  await custodian.page.reload();
  const troupe = await send(custodian.page, "POST", "/api/troupes", { name: `Debts Kept ${run}`, lead_handle: lead.handle });
  await backstoryOptional(custodian.page, troupe.id);
  const build = { ...ATTRIBUTES_AND_FOCUSES, backgrounds: [["Fame", 3], ["Herd", 2], ["Generation", 1]] as [string, number][], disciplines: [["Celerity", 2], ["Potence", 1], ["Presence", 1]] as [string, number][] };
  const home = async (page: Page, name: string) => {
    const id = await builtVampire(page, name, "Brujah", build);
    await send(page, "PUT", `/api/characters/${id}/traits`, { category: "sect", name: "Camarilla", rating: null });
    const asked = await send(page, "POST", `/api/characters/${id}/home-troupe`, { troupe_id: troupe.id });
    await send(lead.page, "POST", `/api/approvals/${asked.id}/approve`);
    return id;
  };
  const philippa = await home(harpy.page, "Philippa Quill");
  const edric = await home(player.page, "Edric Thorne");
  await send(lead.page, "PUT", `/api/troupes/${troupe.id}/boon-ledger`, { on: true });
  await send(lead.page, "PUT", `/api/troupes/${troupe.id}/characters/${philippa}/titles`, { titles: ["Harpy"] });

  // The lead gives the Harpy the full ledger.
  const l = lead.page;
  await l.goto(`/troupes/${troupe.id}/boons#settings`);
  const full = (await tabSettings(l, "Boons")).getByRole("radio", { name: /^The full ledger/ });
  await full.check();
  await expect(l.getByText("Saved: The Harpy keeps the full ledger, and reviews the boons players report.")).toBeVisible();
  await expect(full).toBeChecked();

  // Philippa's player opens the ledger from her Play View's Boons tab, and registers a boon.
  const h = harpy.page;
  await h.goto(`/play/characters/${philippa}?tab=boons`);
  const card = h.getByRole("region", { name: "Boons" }).getByText(`Philippa Quill, Harpy of Debts Kept ${run}`);
  await expect(card).toBeVisible();
  await h.getByRole("link", { name: "Open the boon ledger" }).click();
  await expect(h.getByRole("heading", { name: "The boon ledger" })).toBeVisible();
  await expect(h.getByText(`As Harpy of Debts Kept ${run}.`)).toBeVisible();
  await h.getByRole("button", { name: "Register boons" }).click();
  const entry = h.getByRole("form", { name: "Register boons" });
  await entry.getByLabel("Date for new rows").fill("2026-10-03");
  const row = entry.getByRole("listitem", { name: "Boon 1" });
  await row.getByRole("combobox", { name: "Debtor" }).fill("Edric");
  await row.getByRole("listbox", { name: "Characters" }).getByRole("option", { name: /Edric Thorne/ }).click();
  await row.getByRole("combobox", { name: "Creditor" }).fill("Lady Ashgrove");
  await row.getByRole("listbox", { name: "Characters" }).getByRole("option", { name: /name only/ }).click();
  await row.getByLabel("Reason").fill("Safe passage");
  await entry.getByRole("button", { name: "Register the boon" }).click();
  await expect(h.getByText("Registered a boon.")).toBeVisible();

  // She corrects it, with a note: her log shows the edit as hers, not what it changed.
  const boons = ledgerOf(h);
  await boons.row("Edric Thorne owes Lady Ashgrove, minor").click();
  const debt = boons.detail("Edric Thorne owes Lady Ashgrove, minor");
  await debt.getByRole("button", { name: "Edit" }).click();
  const edit = debt.getByRole("form", { name: "Edit: Edric Thorne owes Lady Ashgrove" });
  await expect(edit.getByLabel("Staff note")).toHaveCount(0);
  await edit.getByLabel("Kind").selectOption("major");
  await edit.getByLabel("Why the edit").fill("Misheard at Elysium");
  await edit.getByRole("button", { name: "Save", exact: true }).click();
  const theirs = boons.detail("Edric Thorne owes Lady Ashgrove, major");
  const theirLog = theirs.getByRole("list", { name: "Log of Edric Thorne owes Lady Ashgrove" });
  await expect(theirLog).toContainText("Misheard at Elysium");
  await expect(theirLog).toContainText("Philippa Quill");
  await expect(theirLog).not.toContainText("Kind: Minor → Major");
  await h.screenshot(shots("harpy-ledger"));

  // The lead sees the same edit, what it changed, and that Philippa made it.
  await l.goto(`/troupes/${troupe.id}/boons`);
  await ledgerOf(l).row("Edric Thorne owes Lady Ashgrove, major").click();
  const staffLog = ledgerOf(l).detail("Edric Thorne owes Lady Ashgrove, major").getByRole("list", { name: "Log of Edric Thorne owes Lady Ashgrove" });
  await expect(staffLog).toContainText("Kind: Minor → Major");
  await expect(staffLog).toContainText("as Philippa Quill");

  // Edric meets Final Death, and his player keeps him off the Who's Who (#975): staff see "Dead" beside his
  // name; the Harpy goes by what the court knows, and the court hasn't heard.
  await send(player.page, "POST", `/api/characters/${edric}/retire`, { reason: "final_death", note: "", listed: false });
  await l.reload();
  await l.getByRole("tab", { name: /^Departed/ }).click();
  await expect(ledgerOf(l).row("Edric Thorne owes Lady Ashgrove, major").getByText("Dead", { exact: true }).filter({ visible: true })).toBeVisible();
  await h.reload();
  const atCourt = ledgerOf(h).row("Edric Thorne owes Lady Ashgrove, major");
  await expect(atCourt).toBeVisible();
  await expect(atCourt.getByText("Dead", { exact: true })).toHaveCount(0);
});

test("the Harpy gives a Lesser Harpy add-only access: they register a boon as their character but can't edit it, then may settle but not correct it, and the Harpy, kept from it, doesn't see who did (#689, #984, #992)", async ({ browser }) => {
  const custodian = await person(browser, "btalon-custodian");
  makeCustodian(custodian.email);
  const lead = await person(browser, "btalon-lead");
  const harpy = await person(browser, "btalon-harpy");
  const talon = await person(browser, "btalon-talon");
  const headers = { "X-Horatio": "1" };
  const send = async (page: Page, method: "POST" | "PUT", url: string, data: object = {}) => {
    const response = await page.request.fetch(url, { method, headers, data });
    expect(response.status(), await response.text()).toBeLessThan(300);
    return response.json();
  };
  await custodian.page.reload();
  const troupe = await send(custodian.page, "POST", "/api/troupes", { name: `Talons Kept ${run}`, lead_handle: lead.handle });
  await backstoryOptional(custodian.page, troupe.id);
  const build = { ...ATTRIBUTES_AND_FOCUSES, backgrounds: [["Fame", 3], ["Herd", 2], ["Generation", 1]] as [string, number][], disciplines: [["Celerity", 2], ["Potence", 1], ["Presence", 1]] as [string, number][] };
  const home = async (page: Page, name: string) => {
    const id = await builtVampire(page, name, "Brujah", build);
    await send(page, "PUT", `/api/characters/${id}/traits`, { category: "sect", name: "Camarilla", rating: null });
    const asked = await send(page, "POST", `/api/characters/${id}/home-troupe`, { troupe_id: troupe.id });
    await send(lead.page, "POST", `/api/approvals/${asked.id}/approve`);
    return id;
  };
  const morwen = await home(harpy.page, "Morwen Vale");
  const wren = await home(talon.page, "Wren Ashby");
  await send(lead.page, "PUT", `/api/troupes/${troupe.id}/boon-ledger`, { on: true });
  await send(lead.page, "PUT", `/api/troupes/${troupe.id}/boon-harpy`, { access: "full" });
  await send(lead.page, "PUT", `/api/troupes/${troupe.id}/characters/${morwen}/titles`, { titles: ["Harpy"] });

  // The lead lets the Harpy give others access.
  const l = lead.page;
  await l.goto(`/troupes/${troupe.id}/boons#settings`);
  const lets = (await tabSettings(l, "Boons")).getByRole("checkbox", { name: /^The Harpy may give others access to the ledger/ });
  await lets.check();
  await expect(l.getByText("Saved: the Harpy may give others access to the ledger, as Lesser Harpies.")).toBeVisible();
  // And keeps what Lesser Harpies change from the Harpy (#992).
  const sees = (await tabSettings(l, "Boons")).getByRole("switch", { name: /^The Harpy sees what their talons change/ });
  await expect(sees).toBeChecked();
  await sees.click();
  await expect(l.getByText("Saved: what talons change is kept from the Harpy.")).toBeVisible();
  await expect(sees).not.toBeChecked();

  // Morwen's player makes Wren a Lesser Harpy who may add boons, nothing more.
  const h = harpy.page;
  await h.goto(`/play/characters/${morwen}/ledger`);
  await h.getByLabel("Make a Lesser Harpy").selectOption({ label: "Wren Ashby" });
  const may = h.getByRole("group", { name: "What they may do" });
  await expect(may.getByRole("checkbox", { name: "Add boons" })).toBeChecked();
  await expect(may.getByRole("checkbox", { name: "Correct boons" })).not.toBeChecked();
  await expect(may.getByRole("checkbox", { name: "Settle and move boons" })).not.toBeChecked();
  await h.getByRole("button", { name: "Give access" }).click();
  await expect(h.getByText("Wren Ashby has access to the ledger.")).toBeVisible();
  await expect(h.getByRole("list", { name: "Lesser Harpies" })).toContainText("Wren Ashby sees the ledger and adds boons");
  // With who gave it and the day, a date and not "NaN Nov 2026" (#998).
  await expect(h.getByRole("list", { name: "Lesser Harpies" })).toContainText(/Given by Morwen Vale, \d{1,2} [A-Z][a-z]{2} \d{4}/);

  // Wren's player opens the ledger from her Play View, and registers a boon as Wren.
  const t = talon.page;
  await t.goto(`/play/characters/${wren}?tab=boons`);
  await expect(t.getByRole("region", { name: "Boons" }).getByText(`Wren Ashby, Lesser Harpy of Talons Kept ${run}`)).toBeVisible();
  await t.getByRole("link", { name: "Open the boon ledger" }).click();
  await expect(t.getByText(`As a Lesser Harpy of Talons Kept ${run}.`)).toBeVisible();
  await t.getByRole("button", { name: "Register boons" }).click();
  const entry = t.getByRole("form", { name: "Register boons" });
  await entry.getByLabel("Date for new rows").fill("2026-10-03");
  const row = entry.getByRole("listitem", { name: "Boon 1" });
  await row.getByRole("combobox", { name: "Debtor" }).fill("Wren");
  await row.getByRole("listbox", { name: "Characters" }).getByRole("option", { name: /Wren Ashby/ }).click();
  await row.getByRole("combobox", { name: "Creditor" }).fill("Lady Morrow");
  await row.getByRole("listbox", { name: "Characters" }).getByRole("option", { name: /name only/ }).click();
  await row.getByLabel("Reason").fill("A word at court");
  await entry.getByRole("button", { name: "Register the boon" }).click();
  await expect(t.getByText("Registered a boon.")).toBeVisible();

  // She can open it, but not edit, settle or void it.
  await ledgerOf(t).row("Wren Ashby owes Lady Morrow, minor").click();
  const debt = ledgerOf(t).detail("Wren Ashby owes Lady Morrow, minor");
  await expect(debt.getByRole("list", { name: "Log of Wren Ashby owes Lady Morrow" })).toContainText("Wren Ashby");
  await expect(debt.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await expect(debt.getByRole("button", { name: "Settle" })).toHaveCount(0);
  await t.screenshot(shots("talon-ledger"));

  // The Harpy sees the boon, but not that Wren registered it (#992).
  const ledger = await (await h.request.get(`/api/troupes/${troupe.id}/boons`, { params: { view: "all" } })).json();
  const [registered] = ledger.boons;
  const opened = await (await h.request.get(`/api/troupes/${troupe.id}/boons/${registered.id}`)).json();
  expect(opened.events.map((e: { kind: string; as_character: string | null }) => [e.kind, e.as_character])).toEqual([["registered", null]]);

  // Morwen's player lets her settle and move boons too, but still not correct them (#984).
  await h
    .getByRole("group", { name: "What Wren Ashby may do" })
    .getByRole("checkbox", { name: "Settle and move boons" })
    .check();
  await expect(h.getByRole("list", { name: "Lesser Harpies" })).toContainText("Wren Ashby sees the ledger, adds boons and settles them");
  await t.reload();
  await ledgerOf(t).row("Wren Ashby owes Lady Morrow, minor").click();
  await expect(debt.getByRole("button", { name: "Settle" })).toBeVisible();
  await expect(debt.getByRole("button", { name: "Trade" })).toBeVisible();
  await expect(debt.getByRole("button", { name: "Edit" })).toHaveCount(0);
});

test("staff declare a Boonbreaker: their open boons are made void, both ways, and they hold Disgraced while the mark stands (#717)", async ({ browser }) => {
  const custodian = await person(browser, "bbreak-custodian");
  makeCustodian(custodian.email);
  const lead = await person(browser, "bbreak-lead");
  const headers = { "X-Horatio": "1" };
  const send = async (page: Page, method: "POST" | "PUT", url: string, data: object = {}) => {
    const response = await page.request.fetch(url, { method, headers, data });
    expect(response.status(), await response.text()).toBeLessThan(300);
    return response.json();
  };
  await custodian.page.reload();
  const troupe = await send(custodian.page, "POST", "/api/troupes", { name: `Broken Promises ${run}`, lead_handle: lead.handle });
  const l = lead.page;
  // Ottavia, a Camarilla NPC, owes Lucan a boon and is owed one by him.
  const ottavia = await send(l, "POST", `/api/troupes/${troupe.id}/npcs`, { name: "Ottavia Sterne", wizard: false });
  await send(l, "PUT", `/api/characters/${ottavia.id}/npc/ratings`, { category: "sect", name: "Camarilla", rating: null, detail: "" });
  const lucan = await send(l, "POST", `/api/troupes/${troupe.id}/npcs`, { name: "Lucan Mireaux", wizard: false });
  await send(l, "PUT", `/api/troupes/${troupe.id}/boon-ledger`, { on: true });
  const owes = (debtor: string, creditor: string, kind: string, reason: string) => ({
    debtor: { character_id: debtor },
    creditor: { character_id: creditor },
    kind,
    made_on: "2026-10-03",
    reason,
  });
  await send(l, "POST", `/api/troupes/${troupe.id}/boons`, {
    boons: [owes(ottavia.id, lucan.id, "major", "Passage through the docks"), owes(lucan.id, ottavia.id, "minor", "A quiet word")],
  });

  await l.goto(`/troupes/${troupe.id}`);
  await troupeTab(l, "Boons");
  await expect(l.getByText("No Boonbreakers.")).toBeVisible();

  // Before declaring it, staff see what it makes void.
  await l.getByRole("button", { name: "Declare a Boonbreaker" }).click();
  const declare = l.getByRole("form", { name: "Declare a Boonbreaker" });
  await declare.getByLabel("Who").selectOption({ label: "Ottavia Sterne" });
  await expect(declare.getByRole("status")).toHaveText("This makes 2 boons void: 1 owed by them, 1 owed to them.");
  await declare.getByLabel("The boon they refused (optional)").selectOption({ label: "Ottavia Sterne owes Lucan Mireaux, major: Passage through the docks" });
  await declare.getByLabel("What they refused, and when").fill("Refused the Harpy at Elysium, 7 November");
  await declare.getByRole("button", { name: "Declare them a Boonbreaker" }).click();

  const mark = l.getByRole("list", { name: "Boonbreakers" }).getByRole("listitem", { name: "Ottavia Sterne, Boonbreaker" });
  await expect(mark).toContainText("2 boons made void · holds Disgraced for it");
  await expect(mark).toContainText("Refused: Ottavia Sterne owes Lucan Mireaux, major");
  await expect(l.getByRole("tab", { name: /^Open/ })).toContainText("(0)");
  await l.getByRole("tab", { name: /^Void/ }).click();
  const voided = ledgerOf(l).row("Ottavia Sterne owes Lucan Mireaux, major");
  await expect(voided).toContainText("Boonbreaker");
  await expect(voided).toContainText("Void");
  await l.screenshot(shots("boonbreaker-declared"));

  // Disgraced, on her status, for as long as the mark stands.
  await l.goto(`/characters/${ottavia.id}/status`);
  const card = l.locator("section").filter({ has: l.getByRole("heading", { name: "Status", exact: true }) });
  await expect(card.getByRole("listitem", { name: "Disgraced" })).toContainText("While a Boonbreaker (p. 397).");
});

test("the Harpy audits a character's boons and gives it to another, whose player reads it as it stood (#690)", async ({ browser }) => {
  const custodian = await person(browser, "baudit-custodian");
  makeCustodian(custodian.email);
  const lead = await person(browser, "baudit-lead");
  const harpy = await person(browser, "baudit-harpy");
  const reader = await person(browser, "baudit-reader");
  const headers = { "X-Horatio": "1" };
  const send = async (page: Page, method: "POST" | "PUT", url: string, data: object = {}) => {
    const response = await page.request.fetch(url, { method, headers, data });
    expect(response.status(), await response.text()).toBeLessThan(300);
    return response.json();
  };
  await custodian.page.reload();
  const troupe = await send(custodian.page, "POST", "/api/troupes", { name: `Audits Kept ${run}`, lead_handle: lead.handle });
  await backstoryOptional(custodian.page, troupe.id);
  const build = { ...ATTRIBUTES_AND_FOCUSES, backgrounds: [["Fame", 3], ["Herd", 2], ["Generation", 1]] as [string, number][], disciplines: [["Celerity", 2], ["Potence", 1], ["Presence", 1]] as [string, number][] };
  const home = async (page: Page, name: string) => {
    const id = await builtVampire(page, name, "Brujah", build);
    await send(page, "PUT", `/api/characters/${id}/traits`, { category: "sect", name: "Camarilla", rating: null });
    const asked = await send(page, "POST", `/api/characters/${id}/home-troupe`, { troupe_id: troupe.id });
    await send(lead.page, "POST", `/api/approvals/${asked.id}/approve`);
    return id;
  };
  const isolde = await home(harpy.page, "Isolde Fenwick");
  const corin = await home(reader.page, "Corin Halloway");
  await send(lead.page, "PUT", `/api/troupes/${troupe.id}/boon-ledger`, { on: true });
  await send(lead.page, "PUT", `/api/troupes/${troupe.id}/boon-harpy`, { access: "full" });
  await send(lead.page, "PUT", `/api/troupes/${troupe.id}/characters/${isolde}/titles`, { titles: ["Harpy"] });
  const debt = { debtor: { character_id: isolde }, creditor: { name: "Lady Morrow" }, kind: "major", made_on: "2026-10-03", reason: "A secret kept" };
  await send(lead.page, "POST", `/api/troupes/${troupe.id}/boons`, { boons: [debt], note: "" });

  // Isolde's player, as the Harpy, audits Isolde's boons for Corin from the ledger.
  const h = harpy.page;
  await h.goto(`/play/characters/${isolde}/ledger`);
  await h.getByLabel("Audit", { exact: true }).selectOption({ label: "Isolde Fenwick" });
  await h.getByLabel("Give it to", { exact: true }).selectOption({ label: "Corin Halloway" });
  await h.getByRole("button", { name: "Make the audit" }).click();
  await expect(h.getByText("Audited Isolde Fenwick's boons, and gave it to Corin Halloway.")).toBeVisible();
  await expect(h.getByRole("list", { name: "Audits" })).toContainText("given to Corin Halloway");

  // Corin's player finds it in the Play View's Boons tab and reads it.
  const r = reader.page;
  await r.goto(`/play/characters/${corin}?tab=boons`);
  await r.getByRole("list", { name: "Audits" }).getByRole("link", { name: "Isolde Fenwick's boons" }).click();
  await expect(r.getByRole("heading", { name: "Boon audit · Isolde Fenwick" })).toBeVisible();
  await expect(r.getByText("owes 1 (weighing 3) · is owed 0")).toBeVisible();
  const owes = r.getByRole("region", { name: "Boons Isolde Fenwick owes" });
  await expect(owes).toContainText("Lady Morrow");
  await expect(owes).toContainText("A secret kept");
  await expect(owes).toContainText("Standing");
  await r.screenshot(shots("boon-audit"));
});

test("where the troupe allows it, the Harpy reads the boon standings and statistics, with who has left as the court knows it (#749)", async ({ browser }) => {
  const custodian = await person(browser, "hstand-custodian");
  makeCustodian(custodian.email);
  const lead = await person(browser, "hstand-lead");
  const harpy = await person(browser, "hstand-harpy");
  const player = await person(browser, "hstand-player");
  const headers = { "X-Horatio": "1" };
  const send = async (page: Page, method: "POST" | "PUT", url: string, data: object = {}) => {
    const response = await page.request.fetch(url, { method, headers, data });
    expect(response.status(), await response.text()).toBeLessThan(300);
    return response.json();
  };
  await custodian.page.reload();
  const troupe = await send(custodian.page, "POST", "/api/troupes", { name: `Court Remembers ${run}`, lead_handle: lead.handle });
  await backstoryOptional(custodian.page, troupe.id);
  const build = { ...ATTRIBUTES_AND_FOCUSES, backgrounds: [["Fame", 3], ["Herd", 2], ["Generation", 1]] as [string, number][], disciplines: [["Celerity", 2], ["Potence", 1], ["Presence", 1]] as [string, number][] };
  const home = async (page: Page, name: string) => {
    const id = await builtVampire(page, name, "Brujah", build);
    await send(page, "PUT", `/api/characters/${id}/traits`, { category: "sect", name: "Camarilla", rating: null });
    const asked = await send(page, "POST", `/api/characters/${id}/home-troupe`, { troupe_id: troupe.id });
    await send(lead.page, "POST", `/api/approvals/${asked.id}/approve`);
    return id;
  };
  const oriel = await home(harpy.page, "Oriel Vane");
  const tamsin = await home(player.page, "Tamsin Rook");
  const silas = await home(player.page, "Silas Crane");
  await send(lead.page, "PUT", `/api/troupes/${troupe.id}/boon-ledger`, { on: true });
  await send(lead.page, "PUT", `/api/troupes/${troupe.id}/characters/${oriel}/titles`, { titles: ["Harpy"] });
  const owes = (debtor: string, creditor: string) => ({ debtor: { character_id: debtor }, creditor: { character_id: creditor }, kind: "minor", made_on: "2026-10-03", reason: "Information" });
  await send(lead.page, "POST", `/api/troupes/${troupe.id}/boons`, { boons: [owes(tamsin, oriel), owes(silas, oriel)], note: "" });
  // Silas's player stops, and lists him under No longer with us: the court knows he's gone, never that his player stopped.
  await send(player.page, "POST", `/api/characters/${silas}/retire`, { reason: "inactive", note: "", listed: true });

  // The lead gives the Harpy the full ledger, then the standings and statistics too.
  const l = lead.page;
  await l.goto(`/troupes/${troupe.id}/boons#settings`);
  await tabSettings(l, "Boons");
  await l.getByRole("radio", { name: /^The full ledger/ }).check();
  await expect(l.getByText("Saved: The Harpy keeps the full ledger, and reviews the boons players report.")).toBeVisible();
  const reads = l.getByRole("switch", { name: /^The Harpy also reads the boon standings and statistics/ });
  await reads.check();
  await expect(l.getByText("Saved: the Harpy reads the boon standings and statistics.")).toBeVisible();
  await expect(reads).toBeChecked();

  // Oriel's player opens the standings from her ledger page.
  const h = harpy.page;
  await h.goto(`/play/characters/${oriel}/ledger`);
  await expect(h.getByText(`As Harpy of Court Remembers ${run}.`)).toBeVisible();
  await h.getByRole("group", { name: "Show" }).getByRole("button", { name: "Standings" }).click();
  await expect(h.getByText("Who has left is shown as the court knows it.")).toBeVisible();
  await h.getByRole("radio", { name: "Everyone" }).check();
  const standing = h.getByRole("table", { name: "Standing by character" });
  await expect(standing).toContainText("Silas Crane (retired)");
  await expect(standing).toContainText("Tamsin Rook");
  await expect(h.locator("main")).not.toContainText("Inactive");
  // The weights read only: changing them is the staff's.
  await expect(h.getByRole("button", { name: "Edit the weights" })).toHaveCount(0);
  await h.screenshot(shots("harpy-standings"));

  await h.getByRole("group", { name: "Show" }).getByRole("button", { name: "Statistics" }).click();
  await expect(h.getByRole("heading", { name: "Boon statistics" })).toBeVisible();
  await expect(h.locator("main")).not.toContainText("Inactive");
});
