"""Exporting the boon ledger (#986): its columns, named as the troupe's sheet names them,
with staff's own; a CSV file with the UTF-8 mark and no formulas; a spreadsheet; the
ledger's view and filters; only the troupe's storytellers and assistant storytellers;
and each export in the troupe's log. The Harpy (#987) exports only where the troupe
lets them, a Lesser Harpy only if the Harpy lets them too, and either's export holds
only what their ledger shows them."""

import csv
import io
import json
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

import openpyxl
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from horatio.boon_export import COLUMNS, STAFF_COLUMNS
from tests.api_helpers import Person, Troupe
from tests.test_api_boon_harpy import Court, ok
from tests.test_api_boon_harpy_standings import Gone
from tests.test_api_boon_talons import Talons
from tests.test_api_boons import Ledger, named, row

HEADER = [*COLUMNS, *STAFF_COLUMNS]
# A Harpy's: no staff's columns, nor the game (staff alone see games).
HARPY_HEADER = [c for c in COLUMNS if c != "Game"]


@pytest.fixture
def ledger(client_for: Callable[[], TestClient], session: Session) -> Ledger:
    return Ledger(Troupe(client_for, session))


@pytest.fixture
def court(client_for: Callable[[], TestClient], session: Session) -> Court:
    return Court(Troupe(client_for, session))


def export(ledger: Ledger, by: Person | None = None, **query: Any) -> Any:
    return (by or ledger.troupe.storyteller).client.get(
        f"/troupes/{ledger.troupe.id}/boon-export", params=query
    )


@pytest.fixture
def gone(client_for: Callable[[], TestClient], session: Session) -> Gone:
    return Gone(Troupe(client_for, session))


@pytest.fixture
def talons(client_for: Callable[[], TestClient], session: Session) -> Talons:
    return Talons(Troupe(client_for, session))


def rows(response: Any, header: list[str] = HEADER) -> list[dict[str, str]]:
    """The CSV file's rows by column, after checking it starts with the UTF-8 mark."""
    assert response.status_code == 200, response.text
    text = response.content.decode("utf-8")
    assert text.startswith("﻿")
    lines = list(csv.reader(io.StringIO(text[1:])))
    assert lines[0] == header
    return [dict(zip(lines[0], line, strict=True)) for line in lines[1:]]


def test_a_boon_exports_with_the_sheets_columns_and_staffs_own(ledger: Ledger) -> None:
    ledger.one(
        ledger.agnes,
        named("Lucien of Paris"),
        kind="major",
        reason="Safe passage",
        conditions="Cannot be traded",
        notify_on_trade=True,
        staff_note="Check with the Prince's player",
    )
    settled = ledger.one(ledger.bram, ledger.vidal, made_on="2026-09-12")
    done = ledger.act(settled, "settle", how="called_in", note="Called in at Elysium")
    assert done.status_code == 200, done.text

    response = export(ledger)

    assert response.headers["content-type"].startswith("text/csv")
    today = datetime.now(UTC).date().isoformat()
    disposition = response.headers["content-disposition"]
    assert disposition.startswith("attachment;")
    assert f"-boons-{today}.csv" in disposition
    found = rows(response)
    # Newest first.
    first, second = found
    assert first == {
        **first,
        "Owed By": "Agnes",
        "Owed To": "Lucien of Paris",
        "Type": "Major",
        "Date": "2026-10-03",
        "Reason": "Safe passage",
        "Stipulation": "Cannot be traded",
        "State": "Standing",
        "Settled": "No",
        "Settled How": "",
        "Settled Date": "",
        "Flag": "Name not linked",
        "Debtor Status": "Active",
        "Creditor Status": "",
        "If Traded Tell Debtor": "Yes",
        "Game": "",
        "Registered": today,
        "Staff Note": "Check with the Prince's player",
        "Entered By": "storyteller",
        "Linked Debtor": "Yes",
        "Linked Creditor": "No",
    }
    assert first["ID"]
    assert second["Owed By"] == "Bram"
    assert second["Owed To"] == "Vidal"
    assert second["Date"] == "2026-09-12"
    assert (second["State"], second["Settled"], second["Settled How"]) == (
        "Settled",
        "Yes",
        "Called in",
    )
    assert second["Settled Date"] == today
    assert second["Settled Notes"] == "Called in at Elysium"
    assert second["ID"] == settled["id"]
    # A display name, never an email.
    assert "@example.com" not in response.text


def test_a_cell_a_spreadsheet_would_run_is_kept_as_text(ledger: Ledger) -> None:
    for reason in ('=HYPERLINK("http://x")', "+1", "-2 favours", "@SUM(A1)", "Plain"):
        ledger.one(ledger.agnes, ledger.bram, reason=reason)

    reasons = {r["Reason"] for r in rows(export(ledger))}

    assert reasons == {'\'=HYPERLINK("http://x")', "'+1", "'-2 favours", "'@SUM(A1)", "Plain"}


def test_the_spreadsheet_has_one_sheet_a_bold_frozen_header_and_a_filter(
    ledger: Ledger,
) -> None:
    ledger.one(ledger.agnes, ledger.bram, reason="=1+1")

    response = export(ledger, format="xlsx")

    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert ".xlsx" in response.headers["content-disposition"]
    book = openpyxl.load_workbook(io.BytesIO(response.content))
    assert len(book.worksheets) == 1
    sheet = book.worksheets[0]
    assert [c.value for c in sheet[1]] == HEADER
    assert all(c.font.bold for c in sheet[1])
    assert sheet.freeze_panes == "A2"
    assert sheet.auto_filter.ref == sheet.dimensions
    line = {h: c for h, c in zip(HEADER, sheet[2], strict=True)}
    # Text, never a formula.
    assert line["Reason"].value == "=1+1"
    assert line["Reason"].data_type == "s"
    # Read back as a moment at midnight.
    assert line["Date"].value == datetime(2026, 10, 3)
    assert line["Date"].number_format == "yyyy-mm-dd"
    assert line["Owed By"].value == "Agnes"


def test_the_ledgers_view_and_filters_narrow_the_export(ledger: Ledger) -> None:
    ledger.one(ledger.agnes, ledger.bram, kind="trivial", made_on="2026-08-01")
    ledger.one(ledger.bram, ledger.vidal, kind="major", made_on="2026-09-01")
    ledger.one(named("Lucien"), ledger.agnes, kind="minor", made_on="2026-10-01")
    voided = ledger.one(ledger.vidal, ledger.agnes, kind="blood", made_on="2026-10-02")
    assert ledger.act(voided, "void", note="Entered twice").status_code == 200

    def debtors(**query: Any) -> list[str]:
        return [r["Owed By"] for r in rows(export(ledger, **query))]

    # No filters: the whole ledger, void ones too.
    assert debtors() == ["Vidal", "Lucien", "Bram", "Agnes"]
    assert debtors(view="open") == ["Lucien", "Bram", "Agnes"]
    assert debtors(view="void") == ["Vidal"]
    assert debtors(kind=["trivial", "major"]) == ["Bram", "Agnes"]
    assert debtors(character_id=ledger.bram) == ["Bram", "Agnes"]
    assert debtors(name="lucien") == ["Lucien"]
    assert debtors(made_from="2026-08-15", made_to="2026-10-01") == ["Lucien", "Bram"]
    assert debtors(view="settled") == []
    # As the ledger's list has them since #978: a search, the flagged, and a sort.
    assert debtors(q="calloway") == []
    assert debtors(q="LUC") == ["Lucien"]
    assert debtors(flagged=True) == ["Lucien"]
    assert debtors(sort="debtor") == ["Agnes", "Bram", "Lucien", "Vidal"]
    assert debtors(sort="kind", direction="desc") == ["Vidal", "Bram", "Lucien", "Agnes"]
    assert debtors(view="open", sort="date", direction="asc") == ["Agnes", "Bram", "Lucien"]

    messages = ledger.messages()
    assert "storyteller exported the whole boon ledger as a CSV file (4 boons)." in messages
    assert "storyteller exported part of the boon ledger as a CSV file (1 boon)." in messages
    # Sorting alone narrows nothing.
    assert (
        messages.count("storyteller exported the whole boon ledger as a CSV file (4 boons).") == 3
    )


def test_the_spreadsheet_export_is_logged_too(ledger: Ledger) -> None:
    ledger.one(ledger.agnes, ledger.bram)
    assert export(ledger, format="xlsx", view="open").status_code == 200

    assert (
        "storyteller exported part of the boon ledger as a spreadsheet (1 boon)."
        in ledger.messages()
    )


def test_only_storytellers_and_assistant_storytellers_export(court: Court) -> None:
    ok = court.access("full")
    assert ok.status_code == 200, ok.text
    court.one(court.agnes, court.bram)
    # The Harpy with the full ledger reads it, but doesn't export it unless the troupe
    # lets them (#987).
    assert court.harpy_player.client.get(court.path).status_code == 200

    for person in (court.harpy_player, court.troupe.player, court.troupe.narrator):
        refused = export(court, by=person)
        assert refused.status_code == 403, refused.text
    for person in (court.troupe.assistant, court.troupe.lead):
        assert len(rows(export(court, by=person))) == 1


def test_no_ledger_no_export(ledger: Ledger) -> None:
    ledger.register(row(ledger.agnes, ledger.bram))
    assert ledger.switch(False).status_code == 200

    assert export(ledger).status_code == 404


# --- the Harpy (#987) ---------------------------------------------------------------------


def harpy_export(court: Court, on: bool, access: str = "full", by: Person | None = None) -> Any:
    return (by or court.troupe.storyteller).client.put(
        f"/troupes/{court.troupe.id}/boon-harpy", json={"access": access, "export": on}
    )


def test_the_harpy_exports_only_where_the_troupe_lets_them(gone: Gone) -> None:
    harpy = gone.harpy_player
    ok(gone.access("full"))
    ledgers = f"/characters/{gone.hestia}/harpy-ledgers"
    # Off by default.
    shown = ok(gone.troupe.storyteller.client.get(f"/troupes/{gone.troupe.id}"))
    assert shown["boon_harpy_export"] is False
    assert export(gone, by=harpy).status_code == 403
    assert ok(harpy.client.get(ledgers))[0]["can_export"] is False
    for person in (gone.troupe.assistant, gone.troupe.player, harpy):
        assert harpy_export(gone, True, by=person).status_code == 403

    changed = ok(harpy_export(gone, True))

    assert changed["boon_harpy_export"] is True
    assert "storyteller let the Harpy export the boon ledger." in gone.messages()
    assert ok(harpy.client.get(ledgers))[0]["can_export"] is True
    assert len(rows(export(gone, by=harpy), HARPY_HEADER)) == 3
    assert "harpy-688 as Hestia exported the whole boon ledger as a CSV file (3 boons)." in (
        gone.messages()
    )
    # Players and narrators still can't.
    for person in (gone.troupe.player, gone.troupe.narrator):
        assert export(gone, by=person).status_code == 403
    shared = ok(gone.troupe.lead.client.get(f"/troupes/{gone.troupe.id}/settings-share"))
    assert "boon_harpy_export" in json.dumps(shared["document"])
    # Only with the full ledger, and off again when staff say so.
    ok(gone.access("submissions"))
    assert export(gone, by=harpy).status_code == 403
    ok(harpy_export(gone, False))
    assert "storyteller stopped the Harpy exporting the boon ledger." in gone.messages()
    assert export(gone, by=harpy).status_code == 403


def test_the_harpy_s_export_holds_only_what_their_ledger_shows(gone: Gone) -> None:
    """Exported as staff and as the Harpy from the same boons: every field the Harpy
    doesn't see is missing from theirs, and their rows read as their ledger does."""
    ok(harpy_export(gone, True))
    noted = gone.one(
        gone.agnes,
        named("Lucien of Paris"),
        kind="major",
        reason="Safe passage",
        staff_note="Lucien's player is the Prince's",
    )
    edited = gone.edit(noted, reason="Safe passage home", note="Typo in the reason")
    assert edited.status_code == 200, edited.text
    gone.leave_three_ways()
    harpy = gone.harpy_player

    staff_response = export(gone)
    harpy_response = export(gone, by=harpy)
    staff = {r["ID"]: r for r in rows(staff_response)}
    theirs = {r["ID"]: r for r in rows(harpy_response, HARPY_HEADER)}

    assert staff.keys() == theirs.keys()
    text = harpy_response.content.decode("utf-8")
    # No staff note, no one who entered a boon out of game, no edit and its note.
    assert "Lucien's player is the Prince's" in staff_response.content.decode("utf-8")
    assert "Lucien's player is the Prince's" not in text
    assert "storyteller" not in text
    assert "Typo in the reason" not in text
    assert "Safe passage home" in text
    # Each side's status as the court knows it, never why someone really left: Bram's
    # player stopped (listed), Cosima's Final Death isn't known, Dario's off-field is.
    statuses = {r["Owed By"]: r["Debtor Status"] for r in theirs.values()}
    assert statuses == {
        "Agnes": "Active",
        "Bram": "Retired",
        "Cosima": "Active",
        "Dario": "Off-field",
    }
    assert {r["Owed By"]: r["Debtor Status"] for r in staff.values()} == {
        **statuses,
        "Bram": "Inactive",
        "Cosima": "Final Death",
    }
    assert "Inactive" not in text
    assert "Final Death" not in text
    # A name staff haven't linked shows as its name.
    lucien = theirs[noted["id"]]
    assert (lucien["Owed To"], lucien["Creditor Status"]) == ("Lucien of Paris", "")
    # Everything else as staff have it.
    same = [c for c in HARPY_HEADER if "Status" not in c]
    for found, mine in theirs.items():
        assert [staff[found][c] for c in same] == [mine[c] for c in same]
    # And as their ledger shows it, from the same reading of each boon.
    listed = {b["id"]: b for b in gone.ledger("all", by=harpy)["boons"]}
    assert {i: (b["debtor"]["name"], b["creditor"]["name"]) for i, b in listed.items()} == {
        i: (r["Owed By"], r["Owed To"]) for i, r in theirs.items()
    }
    # The ledger's views go by what the court knows too: Cosima stands at court.
    departed = rows(export(gone, by=harpy, view="departed"), HARPY_HEADER)
    assert sorted(r["Owed By"] for r in departed) == ["Bram", "Dario"]
    # The spreadsheet has the same columns.
    book = openpyxl.load_workbook(io.BytesIO(export(gone, by=harpy, format="xlsx").content))
    assert [c.value for c in book.worksheets[0][1]] == HARPY_HEADER


def test_a_lesser_harpy_exports_only_if_the_harpy_lets_them(talons: Talons) -> None:
    ok(talons.setting(True))
    ok(harpy_export(talons, True))
    talons.one(talons.agnes, talons.bram, staff_note="Staff only")
    iris = talons.iris_player
    listed = ok(talons.harpy_player.client.get(talons.talons))
    assert listed["exports"] is True

    ok(talons.give(talons.iris, can_add=True))

    assert export(talons, by=iris).status_code == 403
    assert talons.ledgers(talons.iris, iris)[0]["can_export"] is False

    given = ok(talons.give(talons.iris, can_add=True, can_export=True))

    assert given["talons"][0]["can_export"] is True
    assert (
        "harpy-688 as Hestia let Iris, a Lesser Harpy, see the ledger, add boons and export"
        " the ledger." in talons.messages()
    )
    assert talons.ledgers(talons.iris, iris)[0]["can_export"] is True
    found = rows(export(talons, by=iris), HARPY_HEADER)
    assert [r["Owed By"] for r in found] == ["Agnes"]
    assert "Staff only" not in export(talons, by=iris).content.decode("utf-8")
    assert "talon-689 as Iris exported the whole boon ledger as a CSV file (1 boon)." in (
        talons.messages()
    )
    # Only while the troupe lets the Harpy export.
    ok(harpy_export(talons, False))
    assert export(talons, by=iris).status_code == 403
    assert talons.ledgers(talons.iris, iris)[0]["can_export"] is False
    assert ok(talons.harpy_player.client.get(talons.talons))["exports"] is False


# --- the workbook shaped like the old sheet (#988) ----------------------------------------

TABS = ["Master", "Active", "Departed", "Settled", "Flagged"]
GREEN, RED = "FFD9EAD3", "FFF4CCCC"


def workbook(court: Court, by: Person | None = None) -> openpyxl.Workbook:
    response = (by or court.troupe.storyteller).client.get(
        f"/troupes/{court.troupe.id}/boon-workbook"
    )
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    today = datetime.now(UTC).date().isoformat()
    assert f'-boon-ledger-{today}.xlsx"' in response.headers["content-disposition"]
    return openpyxl.load_workbook(io.BytesIO(response.content))


def lines(sheet: Any) -> list[dict[str, Any]]:
    """The tab's first table by column, after checking its header is bold and frozen
    with a filter over the whole table."""
    header = [c.value for c in sheet[1]]
    found: list[dict[str, Any]] = []
    for cells in sheet.iter_rows(min_row=2):
        if cells[0].value is None:
            break
        found.append({h: c for h, c in zip(header, cells, strict=False) if h is not None})
    assert all(c.font.bold for c in sheet[1] if c.value is not None)
    assert sheet.freeze_panes == "A2"
    last = sheet.cell(row=1, column=len([h for h in header if h is not None])).column_letter
    assert sheet.auto_filter.ref == f"A1:{last}{len(found) + 1}"
    return found


def values(line: dict[str, Any]) -> dict[str, Any]:
    return {h: c.value for h, c in line.items()}


def tint(line: dict[str, Any]) -> str | None:
    fill = line["Owed By"].fill
    return fill.start_color.rgb if fill.fill_type == "solid" else None


def sheet_ledger(gone: Gone) -> dict[str, Any]:
    """Gone's ledger, with a settled boon, a void one, one flagged by hand and one to
    a name only (flagged by Horatio), after Bram, Cosima and Dario leave."""
    settled = gone.one(gone.vidal, gone.agnes, kind="minor")
    assert gone.act(settled, "settle", how="forgiven").status_code == 200
    voided = gone.one(gone.agnes, gone.vidal, kind="blood")
    assert gone.act(voided, "void", note="Entered twice").status_code == 200
    by_hand = gone.one(gone.agnes, gone.vidal, kind="trivial", reason="A favour at Elysium")
    ok(
        gone.troupe.storyteller.client.post(
            f"{gone.path}/{by_hand['id']}/flags", json={"note": "Check the night"}
        ),
        201,
    )
    named_only = gone.one(gone.vidal, named("Lucien of Paris"), kind="major")
    gone.leave_three_ways()
    return {"settled": settled, "void": voided, "by_hand": by_hand, "named": named_only}


def test_the_workbook_has_the_sheets_tabs_as_the_ledger_counts_them(gone: Gone) -> None:
    made = sheet_ledger(gone)

    book = workbook(gone)

    assert book.sheetnames == [*TABS, "Standings"]
    tabs = {name: lines(book[name]) for name in TABS}
    counts = gone.ledger("all")["counts"]
    assert len(tabs["Master"]) == counts["all"] == 7
    assert len(tabs["Active"]) == counts["open"]
    assert len(tabs["Departed"]) == counts["departed"]
    assert len(tabs["Settled"]) == counts["settled"] == 1
    assert len(tabs["Flagged"]) == gone.ledger("all", flagged=True)["total"] == 2
    # The export's columns, newest first, as the CSV file has them.
    assert [c.value for c in book["Master"][1]] == HEADER
    exported = rows(export(gone))
    assert [line["ID"].value for line in tabs["Master"]] == [r["ID"] for r in exported]
    # Each view's tab holds the boons its view does.
    for tab, view in (("Active", "open"), ("Departed", "departed"), ("Settled", "settled")):
        listed = {b["id"] for b in gone.ledger(view)["boons"]}
        assert {line["ID"].value for line in tabs[tab]} == listed
    # Settled green, naming someone gone pale red, the rest untinted.
    assert [tint(line) for line in tabs["Settled"]] == [GREEN]
    assert {tint(line) for line in tabs["Departed"]} == {RED}
    assert {tint(line) for line in tabs["Active"]} == {None}
    assert all(c.fill.start_color.rgb == RED for c in tabs["Departed"][0].values())
    # The flagged, with what each flag says.
    assert [c.value for c in book["Flagged"][1]] == [*HEADER, "Flag Comment"]
    flagged = {line["ID"].value: values(line) for line in tabs["Flagged"]}
    assert flagged.keys() == {made["by_hand"]["id"], made["named"]["id"]}
    assert flagged[made["by_hand"]["id"]]["Flag"] == "Flagged"
    assert flagged[made["by_hand"]["id"]]["Flag Comment"] == "Check the night"
    assert flagged[made["named"]["id"]]["Flag"] == "Name not linked"
    assert flagged[made["named"]["id"]]["Flag Comment"]
    assert "storyteller exported the whole boon ledger as a workbook (7 boons)." in (
        gone.messages()
    )


def test_the_standings_tab_is_the_standings(gone: Gone) -> None:
    sheet_ledger(gone)
    weights = ok(
        gone.troupe.storyteller.client.put(
            f"/troupes/{gone.troupe.id}/boon-weights",
            json={"trivial": 1, "minor": 2, "major": 4, "blood": 6, "life": 12},
        )
    )
    assert weights["minor"] == 2

    sheet = workbook(gone)["Standings"]

    standings = ok(gone.standings())
    places = [values(line) for line in lines(sheet)]
    assert [c.value for c in sheet[1]] == [
        "Character",
        "Status",
        "Owes",
        "Owes Weight",
        "Owed",
        "Owed Weight",
        "Net",
    ]
    assert len(places) == len(standings["characters"])
    assert [(p["Character"], p["Owes"], p["Owed"], p["Net"]) for p in places] == [
        (s["who"]["name"], s["owes_count"], s["owed_count"], s["net"])
        for s in standings["characters"]
    ]
    # Every boon owed is a boon in the Active tab.
    assert sum(p["Owes"] for p in places) == gone.ledger("all")["counts"]["open"]
    # Then, after an empty row, the open boons by kind with the troupe's weights.
    below = len(places) + 3
    assert [c.value for c in sheet[below]][:4] == ["Type", "Weight", "Open Boons", "Total Weight"]
    assert sheet[below][0].font.bold
    kinds = [[c.value for c in sheet[below + 1 + i]][:4] for i in range(5)]
    assert kinds == [
        [k["kind"].capitalize(), k["weight"], k["count"], k["total"]] for k in standings["by_kind"]
    ]
    assert [k[1] for k in kinds] == [1, 2, 4, 6, 12]


def test_the_harpy_s_workbook_holds_only_what_they_see(gone: Gone) -> None:
    sheet_ledger(gone)
    harpy = gone.harpy_player
    ok(gone.access("full"))
    path = f"/troupes/{gone.troupe.id}/boon-workbook"
    # Not until the troupe lets them export.
    assert harpy.client.get(path).status_code == 403
    for person in (gone.troupe.player, gone.troupe.narrator):
        assert person.client.get(path).status_code == 403
    ok(harpy_export(gone, True))

    book = workbook(gone, by=harpy)

    # No Standings unless the troupe lets them read them.
    assert book.sheetnames == TABS
    assert [c.value for c in book["Master"][1]] == HARPY_HEADER
    assert [c.value for c in book["Flagged"][1]] == [*HARPY_HEADER, "Flag Comment"]
    master = [values(line) for line in lines(book["Master"])]
    assert {r["ID"] for r in master} == {b["id"] for b in gone.ledger("all", by=harpy)["boons"]}
    # Who has left as the court knows it: Cosima's Final Death isn't known.
    departed = lines(book["Departed"])
    assert sorted(line["Owed By"].value for line in departed) == ["Bram", "Dario"]
    assert len(departed) == gone.ledger("all", by=harpy)["counts"]["departed"]
    cosima = next(line for line in lines(book["Active"]) if line["Owed By"].value == "Cosima")
    assert tint(cosima) is None
    assert "harpy-688 as Hestia exported the whole boon ledger as a workbook (7 boons)." in (
        gone.messages()
    )

    ok(gone.option("full", True))

    book = workbook(gone, by=harpy)
    assert book.sheetnames == [*TABS, "Standings"]
    theirs = ok(gone.standings(by=harpy))
    places = {line["Character"].value: values(line) for line in lines(book["Standings"])}
    assert places.keys() == {s["who"]["name"] for s in theirs["characters"]}
    assert places["Cosima"]["Status"] == "Active"
