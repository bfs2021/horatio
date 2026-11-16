"""Import a troupe's boon ledger from LotsLarp's old spreadsheet (#989), from Custodian ›
Tools. The custodian uploads the sheet downloaded as .xlsx, reads the dry run's report,
and imports it. Two of its tabs are read:

- **Master**: a boon a row, its columns found by their headings (Owed By, Owed To
  (Creditor), Type, Date, Reason, Stipulation, Comments, Input Date, Input Email,
  Settled, Settled Date, Settled Notes, Flag, Unique ID, Response ID);
- **Characters**: each character's Canonical Name and Alias 1 to Alias 11, so a boon
  that names a character by an alias finds it.

**Flagged for Harpy** gives its Review Comments to the flag of the row they are about.
The other tabs are worked out from Master by formulas, and aren't read.

Each row becomes a boon:
- **Type** is its kind; a row of any other type is reported and not imported;
- **Date** is the night it was made, **Reason** its reason, **Stipulation** its
  conditions (wording about notifying, "notify me", also tells its debtor's player when
  it is traded), and **Comments** its staff note;
- **Settled** makes it settled: called in, or forgiven where Settled Notes say so, on
  Settled Date (else Input Date, else its own date), with Settled Notes as the note.
  Settled Notes on a row not settled go to its staff note;
- **Flag** raises a flag on it, for review;
- **Owed By** and **Owed To** are matched to the troupe's characters by name, by any
  alias the Characters tab gives, or by a name a character had before, ignoring case,
  spacing, quotes and a trailing "(D)". A name that matches no one, or more than one,
  or text that is no name at all, is kept as written, a name only, for staff to link;
- **Input Email** is never kept: where it is an account's here, the boon is entered by
  that account, and otherwise by no one. No email goes in the report or the log.

The row's Unique ID (else its Response ID, else "row 12") is kept as the boon's
`source_ref`: running the import again updates the boons it made and adds new rows.
A boon changed in Horatio since it was imported (anything in its log but the import's
own line) is left as it is, and reported. Imported boons send no notifications and no
Gallant; each has one line in its log, "Imported from the spreadsheet", dated from its
Input Date, and the import is one entry in the troupe's log.

The sheet is read in memory, and never kept.
"""

import csv
import io
import re
import uuid
from collections import defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, time
from typing import Any
from zoneinfo import ZoneInfo

import openpyxl
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from horatio import audit, boons
from horatio.boon_reviews import characters_of
from horatio.import_influence_log import (
    DEFAULT_TIMEZONE,
    CannotImport,
    Cell,
    Row,
    SheetDate,
    nearest,
    parse_date,
)
from horatio.models import AuditEvent, Boon, BoonEvent, BoonFlag, Character, Troupe, User

# The most a sheet uploaded may weigh. LotsLarp's, with every tab, is a few megabytes.
MAX_UPLOAD = 20 * 1024 * 1024

# The tabs read, by their names, and the columns read, by their headings: lower case,
# without anything in brackets ("Owed To (Creditor)" is "owed to").
MASTER = "master"
CHARACTERS = "characters"
FLAGGED = "flagged for harpy"
OWED_BY = "owed by"
OWED_TO = "owed to"
TYPE = "type"
DATE = "date"
REASON = "reason"
STIPULATION = "stipulation"
COMMENTS = "comments"
INPUT_DATE = "input date"
INPUT_EMAIL = "input email"
SETTLED = "settled"
SETTLED_DATE = "settled date"
SETTLED_NOTES = "settled notes"
FLAG = "flag"
UNIQUE_ID = "unique id"
RESPONSE_ID = "response id"
CANONICAL = "canonical name"
REVIEW_COMMENTS = "review comments"
# A row with none of these filled is blank: a formula filled down past the last boon.
CONTENT = (OWED_BY, OWED_TO, TYPE, DATE, REASON, STIPULATION, COMMENTS)

IMPORTED = "Imported from the spreadsheet"
CHANGED = "it was changed in Horatio since it was imported"
FLAGGED_NOTE = "Flagged in the spreadsheet."
# A side of a boon the sheet leaves blank: a boon needs someone on each side.
BLANK = "(blank in the spreadsheet)"
TRUE = {"true", "yes", "y", "x", "1", "settled", "flagged"}
NOTIFY = re.compile(r"\bnotif", re.IGNORECASE)
FORGIVEN = re.compile(r"\bforg[ia]v", re.IGNORECASE)
QUOTES = re.compile("[\"'`‘’“”]")
DEPARTED_MARK = re.compile(r"\(\s*d\s*\)$", re.IGNORECASE)
# How a name was matched: by its own name, by an alias, or not at all.
MATCHED = "matched"
ALIAS = "alias"
UNMATCHED = "unmatched"
AMBIGUOUS = "ambiguous"


# --- reading the sheet --------------------------------------------------------------------


def heading(value: Cell) -> str:
    """A column's heading, for finding it: "Owed To (Creditor)" is "owed to"."""
    text = re.sub(r"\([^)]*\)", " ", str(value or ""))
    return " ".join(text.split()).casefold()


def tab_rows(name: str, table: Iterable[Sequence[Cell]], needs: set[str]) -> list[Row]:
    """The rows under the tab's heading row, the first of its first ten that has every
    heading in `needs`. A heading the tab repeats is read from its first column."""
    headings: list[str] | None = None
    rows: list[Row] = []
    for number, values in enumerate(table, start=1):
        if headings is None:
            found = [heading(v) for v in values]
            if needs <= set(found):
                headings = found
            elif number >= 10:
                break
            continue
        cells: dict[str, Cell] = {}
        for h, v in zip(headings, values, strict=False):
            if h and h not in cells:
                cells[h] = v
        rows.append(Row(number, cells))
    if headings is None:
        wanted = ", ".join(sorted(needs))
        raise CannotImport(f"The {name} tab has no heading row with {wanted}.")
    return rows


@dataclass
class Workbook:
    master: list[Row]
    characters: list[Row] | None
    flagged: list[Row] | None


def read_workbook(data: bytes) -> Workbook:
    """The sheet's Master tab, and its Characters and Flagged for Harpy tabs if it has
    them."""
    try:
        book = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    except Exception as error:  # openpyxl raises several kinds for a file it can't read
        raise CannotImport(f"That isn't a spreadsheet Horatio can read (.xlsx): {error}") from None
    try:
        sheets = {" ".join(s.title.split()).casefold(): s for s in book.worksheets}

        def rows(name: str, needs: set[str]) -> list[Row] | None:
            sheet = sheets.get(name)
            if sheet is None:
                return None
            return tab_rows(sheet.title, sheet.iter_rows(values_only=True), needs)

        master = rows(MASTER, {OWED_BY, OWED_TO, TYPE, DATE})
        if master is None:
            raise CannotImport("The spreadsheet has no Master tab.")
        return Workbook(
            master=master,
            characters=rows(CHARACTERS, {CANONICAL}),
            flagged=rows(FLAGGED, {REVIEW_COMMENTS}),
        )
    finally:
        book.close()


def written(row: Row, column: str) -> str:
    """The cell as written, without the space around it; its lines kept."""
    value = row.cells.get(column)
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    if isinstance(value, datetime | date):
        return value.isoformat()
    return str(value).strip()


def ticked(value: Cell) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, int | float):
        return value == 1
    return str(value or "").strip().casefold() in TRUE


def key_of(row: Row) -> tuple[str, str]:
    """The row's key for running the import again, and what it is: its Unique ID, else
    its Response ID, else its row number."""
    for column, what in ((UNIQUE_ID, "Unique ID"), (RESPONSE_ID, "Response ID")):
        if found := row.text(column):
            return found, what
    return f"row {row.number}", "row"


# Times written as text: "3/14/2024 21:15:07", "2024-03-14 21:15".
TIME = re.compile(r"^(.*?)[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]m)?$", re.IGNORECASE)


def moment(value: Cell, zone: ZoneInfo) -> datetime | None:
    """A date, with its time if it has one, in `zone`: a spreadsheet's own, or text in
    one of the sheet's ways with a year. None when there is no date, or no year."""
    if isinstance(value, datetime):
        return value if value.tzinfo is not None else value.replace(tzinfo=zone)
    if isinstance(value, date):
        return datetime.combine(value, time(), zone)
    text = " ".join(str(value or "").split())
    at = time()
    if found := TIME.match(text):
        hour, minute, half = int(found[2]), int(found[3]), (found[5] or "").casefold()
        if half == "pm" and hour < 12:
            hour += 12
        elif half == "am" and hour == 12:
            hour = 0
        if hour < 24 and minute < 60:
            text, at = found[1], time(hour, minute, int(found[4] or 0))
    day = parse_date(text) if text else None
    if day is None or day.year is None or (on := day.on(day.year)) is None:
        return None
    return datetime.combine(on, at, zone)


def cut(text: str, what: str, notes: list[str]) -> str:
    """The text, cut to the longest the ledger takes, saying so."""
    if len(text) <= boons.LONGEST_TEXT:
        return text
    notes.append(f"{what} was cut to {boons.LONGEST_TEXT:,} characters")
    return text[: boons.LONGEST_TEXT - 1].rstrip() + "…"


@dataclass
class Line:
    """A row of Master, read as a boon."""

    ref: str
    row: int
    debtor: str
    creditor: str
    kind: str
    made_on: date
    reason: str
    conditions: str
    notify_on_trade: bool
    staff_note: str
    settled_how: str | None
    closed_at: datetime | None
    closed_note: str
    # The flag's note, if the row is flagged.
    flag: str | None
    entered_at: datetime | None
    # Who entered it, lower case: only ever matched to an account, never kept.
    email: str
    notes: list[str] = field(default_factory=list)


@dataclass
class RowNote:
    """A row, by its key, and something about it: why it was skipped, say."""

    row: str
    note: str


def kind_of(text: str) -> str | None:
    """ "Minor", "minor boon", "Life Boon" is its kind."""
    word = re.sub(r"\s+boons?$", "", " ".join(text.split()).casefold())
    return word if word in boons.KINDS else None


def odd_dates(entered_at: datetime | None, closed_at: datetime | None, today: date) -> list[str]:
    """What looks wrong in a row's dates, likely a typo, for the custodian to check: an
    Input Date or a settled day still to come, or a settled day before its Input Date.
    The row is imported as it is (#1020)."""
    found: list[str] = []
    if entered_at is not None and entered_at.date() > today:
        found.append("its Input Date is in the future")
    if closed_at is not None and closed_at.date() > today:
        found.append("its Settled Date is in the future")
    if entered_at is not None and closed_at is not None and closed_at.date() < entered_at.date():
        found.append("its Settled Date is before its Input Date")
    return found


def read_lines(book: Workbook, zone: ZoneInfo) -> tuple[list[Line], list[RowNote]]:
    """Master's rows as boons, and the rows skipped with why. A blank row is neither."""
    comments: dict[str, str] = {}
    for row in book.flagged or []:
        ref, _ = key_of(row)
        if note := written(row, REVIEW_COMMENTS):
            comments.setdefault(ref, note)
    lines: list[Line] = []
    skipped: list[RowNote] = []
    seen: dict[str, int] = {}
    today = datetime.now(zone).date()
    for row in book.master:
        if not any(row.text(c) for c in CONTENT):
            continue
        ref, what = key_of(row)
        if ref in seen:
            skipped.append(RowNote(ref, f"row {row.number} has the {what} of row {seen[ref]}"))
            continue
        seen[ref] = row.number
        type_text = row.text(TYPE)
        kind = kind_of(type_text)
        if kind is None:
            reason = f"its type, {type_text!r}," if type_text else "it has no type, so it"
            skipped.append(RowNote(ref, f"{reason} isn't trivial, minor, major, blood or life"))
            continue
        notes: list[str] = []
        entered_at = moment(row.cells.get(INPUT_DATE), zone)
        made = row.cells.get(DATE)
        if isinstance(made, datetime | date):
            made_on: date | None = made.date() if isinstance(made, datetime) else made
        else:
            stamp = moment(made, zone)
            sheet_date: SheetDate | None = parse_date(row.text(DATE)) if stamp is None else None
            if stamp is not None:
                made_on = stamp.date()
            elif sheet_date is not None and sheet_date.year is None and entered_at is not None:
                made_on = nearest(sheet_date, entered_at.date())
            else:
                made_on = None
        if made_on is None:
            if entered_at is None:
                problem = f"can't read its date, {row.text(DATE)!r}" if row.text(DATE) else ""
                skipped.append(RowNote(ref, problem or "it has no date, nor an Input Date"))
                continue
            made_on = entered_at.date()
            notes.append("its date is its Input Date, as its Date is blank or can't be read")
        debtor = cut(written(row, OWED_BY), "Owed By", notes) or BLANK
        creditor = cut(written(row, OWED_TO), "Owed To", notes) or BLANK
        conditions = cut(written(row, STIPULATION), "the stipulation", notes)
        settled_notes = written(row, SETTLED_NOTES)
        staff_note = written(row, COMMENTS)
        settled = ticked(row.cells.get(SETTLED))
        closed_at: datetime | None = None
        if settled:
            closed_at = (
                moment(row.cells.get(SETTLED_DATE), zone)
                or entered_at
                or datetime.combine(made_on, time(), zone)
            )
        elif settled_notes:
            staff_note = "\n\n".join(t for t in (staff_note, settled_notes) if t)
        notes += odd_dates(entered_at, closed_at, today)
        flag = None
        if ticked(row.cells.get(FLAG)):
            flag = cut(comments.get(ref, FLAGGED_NOTE), "the review comment", notes)
        lines.append(
            Line(
                ref=ref,
                row=row.number,
                debtor=debtor,
                creditor=creditor,
                kind=kind,
                made_on=made_on,
                reason=cut(written(row, REASON), "the reason", notes),
                conditions=conditions,
                notify_on_trade=bool(NOTIFY.search(conditions)),
                staff_note=cut(staff_note, "the staff note", notes),
                settled_how=(
                    ("forgiven" if FORGIVEN.search(settled_notes) else "called_in")
                    if settled
                    else None
                ),
                closed_at=closed_at,
                closed_note=cut(settled_notes, "the settled notes", notes) if settled else "",
                flag=flag,
                entered_at=entered_at,
                email=row.text(INPUT_EMAIL).casefold(),
                notes=notes,
            )
        )
    return lines, skipped


# --- matching names -----------------------------------------------------------------------


def plain(name: str) -> str:
    """A name, for matching: "  Agnes  'the Wren' (D)" is "agnes the wren"."""
    name = DEPARTED_MARK.sub("", QUOTES.sub("", name).strip())
    return " ".join(name.split()).casefold()


@dataclass
class Found:
    how: str
    character: Character | None


class Names:
    """The troupe's characters by every name they go by in Horatio (their own, and any
    they had before a rename), and the Characters tab's aliases."""

    def __init__(self, db: Session, troupe: Troupe, characters: Sequence[Row] | None) -> None:
        found = characters_of(db, troupe)
        self.characters = {c.id: c for c in found}
        self.horatio: dict[str, set[uuid.UUID]] = defaultdict(set)
        for c in found:
            self.horatio[plain(c.name)].add(c.id)
        renamed = select(AuditEvent.character_id, AuditEvent.data).where(
            AuditEvent.action == "character.renamed",
            AuditEvent.character_id.in_(list(self.characters)),
        )
        for character_id, data in db.execute(renamed):
            if character_id is not None and isinstance(data.get("from_name"), str):
                self.horatio[plain(data["from_name"])].add(character_id)
        # Each name the Characters tab gives, with the others of the same character.
        self.aliases: dict[str, set[str]] = defaultdict(set)
        for row in characters or []:
            names = {plain(row.text(CANONICAL))}
            names |= {plain(row.text(h)) for h in row.cells if h.startswith("alias")}
            names.discard("")
            for name in names:
                self.aliases[name] |= names
        self.cache: dict[str, Found] = {}

    def find(self, name: str) -> Found:
        key = plain(name)
        if key not in self.cache:
            self.cache[key] = self.look(key)
        return self.cache[key]

    def look(self, key: str) -> Found:
        if not key or key == plain(BLANK):
            return Found(UNMATCHED, None)
        direct = self.horatio.get(key, set())
        if len(direct) == 1:
            return Found(MATCHED, self.characters[next(iter(direct))])
        if direct:
            return Found(AMBIGUOUS, None)
        by_alias = set().union(*(self.horatio.get(n, set()) for n in self.aliases.get(key, ())))
        if len(by_alias) == 1:
            return Found(ALIAS, self.characters[next(iter(by_alias))])
        return Found(AMBIGUOUS if by_alias else UNMATCHED, None)


# --- the report ---------------------------------------------------------------------------


@dataclass
class KindCount:
    kind: str
    standing: int = 0
    settled: int = 0


@dataclass
class NameCount:
    """A name the sheet gives, as first written, and how it was matched: to a
    character by its name or an alias, or kept as written, matching no one or more than
    one. With how many boons name it."""

    name: str
    how: str
    character_id: uuid.UUID | None
    character_name: str | None
    boons: int


@dataclass
class Duplicate:
    """Rows that look alike, or a row like a boon in the ledger already (`in_ledger`)."""

    rows: list[str]
    what: str
    in_ledger: bool = False


@dataclass
class Report:
    dry_run: bool
    troupe_id: uuid.UUID
    troupe_name: str
    ledger_on: bool
    # Rows read as boons, and rows skipped.
    rows: int = 0
    added: int = 0
    updated: int = 0
    unchanged: int = 0
    kinds: list[KindCount] = field(default_factory=list)
    names: list[NameCount] = field(default_factory=list)
    skipped: list[RowNote] = field(default_factory=list)
    duplicates: list[Duplicate] = field(default_factory=list)
    notes: list[RowNote] = field(default_factory=list)
    flagged: int = 0
    # Boons entered by someone with an account here, by their Input Email.
    by_account: int = 0
    # Said of the sheet as a whole.
    general: list[str] = field(default_factory=list)


HOW = {
    MATCHED: "Matched",
    ALIAS: "Matched by alias",
    UNMATCHED: "Kept as written: matches no character",
    AMBIGUOUS: "Kept as written: more than one character goes by it",
}


def as_csv(report: Report) -> str:
    """The report as a spreadsheet: a line for each thing it says."""
    out = io.StringIO()
    sheet = csv.writer(out)
    sheet.writerow(["Section", "Row", "Name", "Detail", "Boons"])
    done = "Would be" if report.dry_run else "Were"
    sheet.writerow(["Summary", "", "", "Rows read as boons", report.rows])
    for what, count in (
        ("added", report.added),
        ("updated", report.updated),
        ("unchanged", report.unchanged),
    ):
        sheet.writerow(["Summary", "", "", f"{done} {what}", count])
    sheet.writerow(["Summary", "", "", "Rows skipped", len(report.skipped)])
    sheet.writerow(["Summary", "", "", "Flagged for review", report.flagged])
    sheet.writerow(["Summary", "", "", "Entered by an account here", report.by_account])
    for line in report.general:
        sheet.writerow(["Summary", "", "", line, ""])
    for k in report.kinds:
        sheet.writerow(["By kind", "", boons.KINDS[k.kind], "Standing", k.standing])
        sheet.writerow(["By kind", "", boons.KINDS[k.kind], "Settled", k.settled])
    for n in report.names:
        detail = HOW[n.how] + (f": {n.character_name}" if n.character_name else "")
        sheet.writerow(["Name", "", n.name, detail, n.boons])
    for s in report.skipped:
        sheet.writerow(["Skipped", s.row, "", s.note, ""])
    for d in report.duplicates:
        what = "Like a boon in the ledger already" if d.in_ledger else "Rows alike"
        sheet.writerow(["Likely duplicate", ", ".join(d.rows), "", f"{what}: {d.what}", ""])
    for n in report.notes:
        sheet.writerow(["Note", n.row, "", n.note, ""])
    return out.getvalue()


# --- importing ----------------------------------------------------------------------------


@dataclass
class Planned:
    line: Line
    debtor: boons.Party
    creditor: boons.Party
    submitted_by: uuid.UUID | None
    boon: Boon | None


def party_key(party: boons.Party) -> tuple[str, str]:
    if party.character is not None:
        return ("character", str(party.character.id))
    return ("name", plain(party.name))


def alike_key(debtor: boons.Party, creditor: boons.Party, kind: str, on: date, reason: str):
    return (party_key(debtor), party_key(creditor), kind, on, " ".join(reason.split()).casefold())


def short(text: str, most: int = 60) -> str:
    """The first line of a long text, for saying which boon is meant."""
    text = " ".join(text.split())
    return text if len(text) <= most else text[: most - 1].rstrip() + "…"


def describe(debtor: boons.Party, creditor: boons.Party, kind: str, on: date) -> str:
    return (
        f"{short(debtor.shown)} owes {short(creditor.shown)} {boons.a_boon(kind)}"
        f" of {boons.when(on)}"
    )


def run(
    db: Session,
    user: User,
    troupe: Troupe,
    book: Workbook,
    *,
    dry_run: bool,
    zone: ZoneInfo | None = None,
) -> Report:
    """Import the sheet into the troupe's ledger, in the session's transaction, or with
    `dry_run` say what it would do and change nothing."""
    zone = zone or ZoneInfo(DEFAULT_TIMEZONE)
    report = Report(
        dry_run=dry_run, troupe_id=troupe.id, troupe_name=troupe.name, ledger_on=troupe.boons
    )
    if book.characters is None:
        report.general.append("The spreadsheet has no Characters tab, so no alias was used.")
    lines, report.skipped = read_lines(book, zone)
    names = Names(db, troupe, book.characters)
    made = {
        b.source_ref: b
        for b in db.scalars(
            select(Boon).where(Boon.troupe_id == troupe.id, Boon.source_ref.is_not(None))
        )
    }
    touched = changed_since(db, [b.id for b in made.values()])
    emails = {line.email for line in lines if line.email}
    accounts = dict(
        db.execute(
            select(func.lower(User.email), User.id).where(
                func.lower(User.email).in_(emails), User.merged_into_id.is_(None)
            )
        ).all()
        if emails
        else []
    )

    planned: list[Planned] = []
    counted: dict[str, tuple[str, Found, int]] = {}
    for line in lines:
        boon = made.get(line.ref)
        if boon is not None and boon.id in touched:
            report.skipped.append(RowNote(line.ref, CHANGED))
            continue
        found = (names.find(line.debtor), names.find(line.creditor))
        debtor = boons.Party(found[0].character, "" if found[0].character else line.debtor)
        creditor = boons.Party(found[1].character, "" if found[1].character else line.creditor)
        if boons.same_party(debtor, creditor):
            report.skipped.append(RowNote(line.ref, f"{debtor.shown} is on both sides"))
            continue
        for text, f in ((line.debtor, found[0]), (line.creditor, found[1])):
            key = plain(text) or text
            first, _, count = counted.get(key, (text, f, 0))
            counted[key] = (first, f, count + 1)
        planned.append(Planned(line, debtor, creditor, accounts.get(line.email), boon))

    report.rows = len(planned) + len(report.skipped)
    kinds = {k: KindCount(k) for k in boons.KINDS}
    for p in planned:
        if p.line.settled_how:
            kinds[p.line.kind].settled += 1
        else:
            kinds[p.line.kind].standing += 1
        report.flagged += p.line.flag is not None
        report.by_account += p.submitted_by is not None
        report.notes += [RowNote(p.line.ref, n) for n in p.line.notes]
    report.kinds = [k for k in kinds.values() if k.standing or k.settled]
    report.names = sorted(
        (
            NameCount(
                name=first,
                how=f.how,
                character_id=f.character.id if f.character else None,
                character_name=f.character.name if f.character else None,
                boons=count,
            )
            for first, f, count in counted.values()
        ),
        key=lambda n: (list(HOW).index(n.how), n.name.casefold()),
    )
    report.duplicates = duplicates(db, troupe, planned)

    earlier = [p.boon.id for p in planned if p.boon is not None]
    flags = import_flags(db, earlier)
    firsts = {
        e.boon_id: e for e in db.scalars(select(BoonEvent).where(BoonEvent.boon_id.in_(earlier)))
    }
    new: list[Planned] = []
    for p in planned:
        if p.boon is None:
            report.added += 1
            new.append(p)
            continue
        flag, first = flags.get(p.boon.id), firsts[p.boon.id]
        if differs(p, flag, first):
            report.updated += 1
            if not dry_run:
                update(p, flag, first, db)
        else:
            report.unchanged += 1
    if not dry_run:
        add(db, user, troupe, new)
        audit.record(
            db,
            user,
            "boon.imported",
            troupe_id=troupe.id,
            added=report.added,
            updated=report.updated,
            unchanged=report.unchanged,
            skipped=len(report.skipped),
        )
    return report


def changed_since(db: Session, ids: Sequence[uuid.UUID]) -> set[uuid.UUID]:
    """The imported boons changed in Horatio since: anything in their log but the
    import's own line, or not even that."""
    if not ids:
        return set()
    counts = (
        select(
            BoonEvent.boon_id,
            func.count(),
            func.bool_and(BoonEvent.kind == "registered"),
        )
        .where(BoonEvent.boon_id.in_(ids))
        .group_by(BoonEvent.boon_id)
    )
    untouched = {boon_id for boon_id, n, registered in db.execute(counts) if n == 1 and registered}
    return set(ids) - untouched


def import_flags(db: Session, ids: Sequence[uuid.UUID]) -> dict[uuid.UUID, BoonFlag]:
    """The flag an earlier import raised on each boon: raised by no one."""
    if not ids:
        return {}
    return {
        f.boon_id: f
        for f in db.scalars(
            select(BoonFlag).where(
                BoonFlag.boon_id.in_(ids),
                BoonFlag.kind == "hand",
                BoonFlag.raised_by.is_(None),
                BoonFlag.cleared_at.is_(None),
            )
        )
    }


def duplicates(db: Session, troupe: Troupe, planned: Sequence[Planned]) -> list[Duplicate]:
    """Rows alike (the same sides, kind, night and reason), and rows like a boon already
    in the ledger that the import didn't make and isn't void."""
    groups: dict[Any, list[Planned]] = defaultdict(list)
    for p in planned:
        line = p.line
        groups[alike_key(p.debtor, p.creditor, line.kind, line.made_on, line.reason)].append(p)
    found = [
        Duplicate(
            [p.line.ref for p in group],
            describe(group[0].debtor, group[0].creditor, group[0].line.kind, group[0].line.made_on),
        )
        for group in groups.values()
        if len(group) > 1
    ]
    ledger = db.scalars(
        select(Boon).where(
            Boon.troupe_id == troupe.id, Boon.source_ref.is_(None), Boon.state != "void"
        )
    )
    for boon in ledger:
        debtor, creditor = boons.parties(db, boon)
        group = groups.get(alike_key(debtor, creditor, boon.kind, boon.made_on, boon.reason), [])
        if group:
            found.append(
                Duplicate(
                    [p.line.ref for p in group],
                    describe(debtor, creditor, boon.kind, boon.made_on),
                    in_ledger=True,
                )
            )
    return found


def fields(p: Planned) -> dict[str, Any]:
    """What the boon says, from its row."""
    line = p.line
    return {
        "debtor_id": p.debtor.character.id if p.debtor.character else None,
        "debtor_name": p.debtor.name,
        "creditor_id": p.creditor.character.id if p.creditor.character else None,
        "creditor_name": p.creditor.name,
        "kind": line.kind,
        "made_on": line.made_on,
        "reason": line.reason,
        "conditions": line.conditions,
        "notify_on_trade": line.notify_on_trade,
        "staff_note": line.staff_note,
        "state": "settled" if line.settled_how else "registered",
        "settled_how": line.settled_how,
        "closed_at": line.closed_at,
        "closed_note": line.closed_note,
        "submitted_by": p.submitted_by,
    }


def differs(p: Planned, flag: BoonFlag | None, first: BoonEvent) -> bool:
    """Whether the row says something other than the boon an earlier import made."""
    assert p.boon is not None
    if any(getattr(p.boon, k) != v for k, v in fields(p).items()):
        return True
    if (flag.note if flag else None) != p.line.flag:
        return True
    return p.line.entered_at is not None and first.created_at != p.line.entered_at


def add(db: Session, user: User, troupe: Troupe, planned: Sequence[Planned]) -> None:
    """The new boons, each with its line in its log and its flag, written together."""
    made = [Boon(troupe_id=troupe.id, source_ref=p.line.ref, **fields(p)) for p in planned]
    for boon, p in zip(made, planned, strict=True):
        if p.line.entered_at is not None:
            boon.created_at = p.line.entered_at
    db.add_all(made)
    db.flush()
    for boon, p in zip(made, planned, strict=True):
        line = boons.event(db, user, boon, "registered", IMPORTED, role="staff")
        if p.line.entered_at is not None:
            line.created_at = p.line.entered_at
        if p.line.flag is not None:
            db.add(BoonFlag(boon_id=boon.id, kind="hand", note=p.line.flag))


def update(p: Planned, flag: BoonFlag | None, first: BoonEvent, db: Session) -> None:
    """The boon an earlier import made, as the row says now."""
    boon = p.boon
    assert boon is not None
    for k, v in fields(p).items():
        setattr(boon, k, v)
    if p.line.entered_at is not None:
        boon.created_at = first.created_at = p.line.entered_at
    if p.line.flag is None and flag is not None:
        db.delete(flag)
    elif p.line.flag is not None and flag is None:
        db.add(BoonFlag(boon_id=boon.id, kind="hand", note=p.line.flag))
    elif p.line.flag is not None and flag is not None:
        flag.note = p.line.flag
