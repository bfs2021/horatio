"""Exporting the boon ledger (#986): its columns, named as the troupe's sheet names them,
with staff's own; a CSV file with the UTF-8 mark and no formulas; a spreadsheet; the
ledger's view and filters; only the troupe's storytellers and assistant storytellers;
and each export in the troupe's log."""

import csv
import io
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

import openpyxl
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from horatio.boon_export import COLUMNS, STAFF_COLUMNS
from tests.api_helpers import Person, Troupe
from tests.test_api_boon_harpy import Court
from tests.test_api_boons import Ledger, named, row

HEADER = [*COLUMNS, *STAFF_COLUMNS]


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


def rows(response: Any) -> list[dict[str, str]]:
    """The CSV file's rows by column, after checking it starts with the UTF-8 mark."""
    assert response.status_code == 200, response.text
    text = response.content.decode("utf-8")
    assert text.startswith("﻿")
    lines = list(csv.reader(io.StringIO(text[1:])))
    assert lines[0] == HEADER
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
    # The Harpy with the full ledger reads it, but doesn't export it (#987 may let them).
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
