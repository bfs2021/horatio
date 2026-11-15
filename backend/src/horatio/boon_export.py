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

The whole ledger can also go out as a workbook shaped like the troupe's old sheet
(#988, `book`): Master, Active, Departed, Settled and Flagged tabs of the same rows, and
the Standings, each tab's header frozen with a filter on it, settled boons tinted green
and those naming someone gone pale red, as the sheet had them.
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
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.worksheet import Worksheet
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
# The workbook's (#988): the Flagged tab's last column, and the Standings tab's two
# tables, each character's place and the open boons by kind.
FLAGGED_COLUMNS = ("Flag Comment",)
STANDINGS_COLUMNS = (
    "Character",
    "Status",
    "Owes",
    "Owes Weight",
    "Owed",
    "Owed Weight",
    "Net",
)
KIND_COLUMNS = ("Type", "Weight", "Open Boons", "Total Weight")
# Its rows' tints, as the sheet's: a settled boon green, one naming someone gone pale red
# (opaque: the first two digits).
SETTLED_TINT = "FFD9EAD3"
DEPARTED_TINT = "FFF4CCCC"

Cell = str | date
# What a spreadsheet's cell holds: a boon's cells, or the standings' sums.
Value = Cell | int | float


@dataclass(frozen=True)
class Table:
    """Rows under a header, each row tinted or not (`tints`, a fill colour or None)."""

    header: Sequence[str]
    rows: Sequence[Sequence[Value]]
    tints: Sequence[str | None] = ()


@dataclass(frozen=True)
class Tab:
    """A sheet of the workbook: its first table's header frozen with a filter on it,
    any more below it after an empty row."""

    title: str
    tables: Sequence[Table]


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


def comments_of(db: Session, found: Iterable[uuid.UUID]) -> dict[uuid.UUID, str]:
    """What the flags still raised on the boons say: what Horatio found, or why someone
    flagged it, oldest first. Never who raised it, which a Harpy doesn't see."""
    said: dict[uuid.UUID, list[str]] = {}
    for f in boon_reviews.raised(db, found):
        words = " ".join(w for w in (f.detail.strip(), f.note.strip()) if w)
        if words:
            said.setdefault(f.boon_id, []).append(words)
    return {b: "; ".join(w) for b, w in said.items()}


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
    return book([Tab("Boons", [Table(header(staff), rows)])])


def book(tabs: Sequence[Tab]) -> bytes:
    """A spreadsheet of these tabs, in order."""
    out_book = openpyxl.Workbook()
    first = out_book.active
    assert first is not None  # a new workbook has one sheet
    out_book.remove(first)
    for tab in tabs:
        written(out_book.create_sheet(tab.title), tab.tables)
    out = io.BytesIO()
    out_book.save(out)
    return out.getvalue()


def written(sheet: Worksheet, tables: Sequence[Table]) -> None:
    """The tables down the sheet, the first one's header frozen with a filter over it,
    every header bold, and widths to fit (up to `WIDEST`)."""
    widths: dict[int, int] = {}
    top = 1
    for n, table in enumerate(tables):
        if n:
            top += 1  # an empty row between tables
        for i, name in enumerate(table.header, start=1):
            cell = sheet.cell(row=top, column=i, value=name)
            cell.font = Font(bold=True)
            widths[i] = max(widths.get(i, 0), len(name))
        for at, line in enumerate(table.rows, start=top + 1):
            tint = table.tints[at - top - 1] if table.tints else None
            fill = PatternFill("solid", start_color=tint) if tint else None
            for i, value in enumerate(line, start=1):
                cell = sheet.cell(row=at, column=i, value=value)
                if isinstance(value, date):
                    cell.number_format = "yyyy-mm-dd"
                elif isinstance(value, str) and value.startswith("="):
                    # openpyxl takes text starting with "=" for a formula: keep it text.
                    cell.data_type = "s"
                if fill is not None:
                    cell.fill = fill
                wide = 10 if isinstance(value, date) else len(str(value))
                widths[i] = max(widths.get(i, 0), wide)
        if n == 0:
            last = top + len(table.rows)
            sheet.freeze_panes = "A2"
            sheet.auto_filter.ref = f"A1:{get_column_letter(len(table.header))}{last}"
        top += len(table.rows) + 1
    for i, width in widths.items():
        sheet.column_dimensions[get_column_letter(i)].width = min(width, WIDEST) + 2


def file_name(troupe_name: str, day: date, file_format: str, what: str = "boons") -> str:
    """ "court-of-ashes-boons-2026-11-15.csv"."""
    slug = re.sub(r"[^a-z0-9]+", "-", troupe_name.lower()).strip("-")[:60].strip("-")
    return f"{slug or 'troupe'}-{what}-{day.isoformat()}.{FORMATS[file_format][0]}"
