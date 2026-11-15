"""Exporting the boon ledger (#986): its boons as a CSV file or a spreadsheet, one row
each, for the troupe's running staff, and for the Harpy where the troupe lets them
(#987).

The columns are named as the troupe's own boon sheet names them, so the export reads
the same: who owes whom, the kind, the night, the reason and stipulation, where it
stands, how and when it was settled, its flags, how each side stands in play, the game
it was registered at, and its id. Staff's export adds the staff note, who entered it
(their display name, never an email) and whether each side is a character or a name
only (`staff`).

A Harpy's or a Lesser Harpy's export holds only what their ledger shows them: none of
staff's columns, nor the game (staff alone see games), and each side's status as the
court knows it. Its rows are made from the boons as the ledger's list gives them to the
one exporting (horatio.api.boons.boon_out, with their `Keeper`), so the two can't
drift apart: see horatio.api.boon_export.row.

Reasons and notes are written by players, so a cell that a spreadsheet would read as a
formula is kept as text: in a CSV, behind a `'`; in a spreadsheet, as a text cell.
Dates are `YYYY-MM-DD`; a moment (registered, settled, a game's start) is the day it
fell on where the person exporting is (their time zone setting, else UTC).
"""

import csv
import io
import re
import uuid
from collections.abc import Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date, datetime
from zoneinfo import ZoneInfo

import openpyxl
from openpyxl.styles import Font
from openpyxl.utils import get_column_letter
from sqlalchemy.orm import Session

from horatio import boon_reviews

# As the troupe's sheet names them.
COLUMNS = (
    "Owed By",
    "Owed To",
    "Type",
    "Date",
    "Reason",
    "Stipulation",
    "State",
    "Settled",
    "Settled How",
    "Settled Date",
    "Settled Notes",
    "Flag",
    "Debtor Status",
    "Creditor Status",
    "If Traded Tell Debtor",
    "Game",
    "Registered",
    "ID",
)
# Staff's export only: these after the sheet's, and the game among them.
STAFF_COLUMNS = ("Staff Note", "Entered By", "Linked Debtor", "Linked Creditor")
STAFF_ONLY = frozenset({"Game", *STAFF_COLUMNS})
FORMATS = {
    "csv": ("csv", "text/csv; charset=utf-8"),
    "xlsx": ("xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
}
# What a spreadsheet may run as a formula when a cell starts with it.
FORMULA = ("=", "+", "-", "@", "\t", "\r")
# The mark that tells a spreadsheet a CSV file is UTF-8.
BOM = "﻿"
# The widest a spreadsheet's column starts, in characters.
WIDEST = 50

Cell = str | date


@dataclass(frozen=True)
class Known:
    """What the rows need besides the boons as the ledger shows them."""

    # The flags still raised on each boon, in words.
    flags: Mapping[uuid.UUID, Sequence[str]] = field(default_factory=dict)
    # When each game the boons were registered at started.
    games: Mapping[uuid.UUID, datetime] = field(default_factory=dict)
    zone: ZoneInfo = field(default_factory=lambda: ZoneInfo("UTC"))


def flags_of(db: Session, found: Iterable[uuid.UUID]) -> dict[uuid.UUID, list[str]]:
    """The flags still raised on the boons, in words, oldest first."""
    words: dict[uuid.UUID, list[str]] = {}
    for f in boon_reviews.raised(db, found):
        words.setdefault(f.boon_id, []).append(boon_reviews.FLAGS.get(f.kind, f.kind))
    return words


def header(staff: bool) -> list[str]:
    return [c for c in (*COLUMNS, *STAFF_COLUMNS) if staff or c not in STAFF_ONLY]


def yes(on: bool) -> str:
    return "Yes" if on else "No"


def guarded(text: str) -> str:
    """Text a spreadsheet opening the CSV file will not run as a formula."""
    return f"'{text}" if text.startswith(FORMULA) else text


def csv_text(cell: Cell) -> str:
    return cell.isoformat() if isinstance(cell, date) else guarded(cell)


def csv_lines(rows: Iterable[Sequence[Cell]], staff: bool) -> Iterator[str]:
    """The CSV file a line at a time, starting with the mark that says it is UTF-8."""
    out = io.StringIO()
    writer = csv.writer(out)
    yield BOM
    for line in (header(staff), *rows):
        writer.writerow([csv_text(c) for c in line])
        yield out.getvalue()
        out.seek(0)
        out.truncate()


def workbook(rows: Sequence[Sequence[Cell]], staff: bool) -> bytes:
    """The spreadsheet: one sheet, its header row bold and frozen, with a filter on
    every column and widths to fit (up to `WIDEST`)."""
    book = openpyxl.Workbook()
    sheet = book.active
    assert sheet is not None  # a new workbook has one sheet
    sheet.title = "Boons"
    names = header(staff)
    sheet.append(names)
    for cell in sheet[1]:
        cell.font = Font(bold=True)
    widths = [len(n) for n in names]
    for line in rows:
        sheet.append(list(line))
        for i, value in enumerate(line):
            widths[i] = max(widths[i], 10 if isinstance(value, date) else len(value))
    for cells in sheet.iter_rows(min_row=2):
        for cell in cells:
            if isinstance(cell.value, date):
                cell.number_format = "yyyy-mm-dd"
            elif isinstance(cell.value, str) and cell.value.startswith("="):
                # openpyxl takes text starting with "=" for a formula: keep it text.
                cell.data_type = "s"
    for i, width in enumerate(widths, start=1):
        sheet.column_dimensions[get_column_letter(i)].width = min(width, WIDEST) + 2
    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = sheet.dimensions
    out = io.BytesIO()
    book.save(out)
    return out.getvalue()


def file_name(troupe_name: str, day: date, file_format: str) -> str:
    """ "court-of-ashes-boons-2026-11-15.csv"."""
    slug = re.sub(r"[^a-z0-9]+", "-", troupe_name.lower()).strip("-")[:60].strip("-")
    return f"{slug or 'troupe'}-boons-{day.isoformat()}.{FORMATS[file_format][0]}"
