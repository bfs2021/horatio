"""Importing a troupe's boon ledger from its old spreadsheet (#989), from a made-up
workbook in the sheet's own shape: every name, row and email here is invented."""

import io
import uuid
from collections.abc import Callable, Sequence
from datetime import UTC, date, datetime
from typing import Any

import openpyxl
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from horatio import boons
from horatio.import_boons import BLANK, FLAGGED_NOTE, IMPORTED, plain
from horatio.models import AuditEvent, Boon, BoonEvent, BoonFlag, Notification
from tests.api_helpers import Person, Troupe, sign_up
from tests.test_api_downtimes import member_character

# The Master tab's headings, with an unnamed column between, as the sheet has.
MASTER = [
    "Owed By", None, "Owed To (Creditor)", "Type", "Date", "Reason", "Stipulation",
    "Comments", "Input Date", "Input Email", "Settled", "Settled Date", "Settled Notes",
    "Flag", "Unique ID", "Response ID", None, "Debtor Status", "Creditor Status",
]  # fmt: skip
STORY = (
    "Whosoever reads this line of the ledger owes the night itself a debt, written in"
    " the old hand of the keeper of the rolls. " * 6
).strip()


def boon_row(
    owed_by: Any = "",
    owed_to: Any = "",
    kind: Any = "Minor",
    on: Any = date(2024, 3, 14),
    reason: str = "",
    stipulation: str = "",
    comments: str = "",
    entered: Any = None,
    email: str = "",
    settled: Any = False,
    settled_on: Any = None,
    settled_notes: str = "",
    flag: Any = False,
    unique: str = "",
    response: str = "",
) -> list[Any]:
    return [
        owed_by, "x", owed_to, kind, on, reason, stipulation, comments, entered, email,
        settled, settled_on, settled_notes, flag, unique, response, "", "Active", "Active",
    ]  # fmt: skip


def workbook(
    master: Sequence[Sequence[Any]],
    characters: Sequence[Sequence[Any]] = (),
    flagged: Sequence[Sequence[Any]] = (),
    with_characters: bool = True,
) -> bytes:
    """The sheet as downloaded: Master under a title row, Characters, Flagged for
    Harpy, and a tab worked out from them, which the import ignores."""
    book = openpyxl.Workbook()
    sheet = book.active
    assert sheet is not None
    sheet.title = "Master"
    sheet.append(["The Boon Ledger of a made-up domain"])
    sheet.append(MASTER)
    for row in master:
        sheet.append(list(row))
    if with_characters:
        tab = book.create_sheet("Characters")
        tab.append(
            ["Canonical Name", "Status", "Clan", "Player", *[f"Alias {n}" for n in range(1, 12)]]
        )
        for row in characters:
            tab.append(list(row))
    tab = book.create_sheet("Flagged for Harpy")
    tab.append(["Owed By", "Owed To", "Unique ID", "Review Comments"])
    for row in flagged:
        tab.append(list(row))
    book.create_sheet("Standings").append(["Character", "Owed", "Owes"])
    out = io.BytesIO()
    book.save(out)
    return out.getvalue()


class Domain:
    """A troupe keeping a boon ledger: Agnes (the player's), Bram (another player's,
    called Bramwell before a rename) and the NPC Vidal."""

    def __init__(self, troupe: Troupe) -> None:
        self.troupe = troupe
        self.session = troupe.session
        self.other = sign_up(troupe.client_for, "other")
        self.agnes = uuid.UUID(member_character(troupe, troupe.player, "Agnes"))
        self.bram = uuid.UUID(member_character(troupe, self.other, "Bramwell"))
        renamed = self.other.client.patch(f"/characters/{self.bram}", json={"name": "Bram"})
        assert renamed.status_code == 200, renamed.text
        made = troupe.lead.client.post(f"/troupes/{troupe.id}/npcs", json={"name": "Vidal"})
        assert made.status_code == 201, made.text
        self.vidal = uuid.UUID(made.json()["id"])
        switched = troupe.storyteller.client.put(
            f"/troupes/{troupe.id}/boon-ledger", json={"on": True}
        )
        assert switched.status_code == 200, switched.text

    def upload(self, data: bytes, dry_run: bool, by: Person | None = None) -> Any:
        return (by or self.troupe.custodian).client.post(
            f"/boon-imports/{self.troupe.id}",
            params={"dry_run": dry_run},
            files={"file": ("ledger.xlsx", data, "application/octet-stream")},
        )

    def run(self, data: bytes, dry_run: bool = False) -> dict[str, Any]:
        done = self.upload(data, dry_run)
        assert done.status_code == 200, done.text
        return done.json()

    def boons(self) -> dict[str, Boon]:
        self.session.expire_all()
        found = self.session.scalars(
            select(Boon).where(Boon.troupe_id == uuid.UUID(self.troupe.id))
        )
        return {b.source_ref or str(b.id): b for b in found}

    def log(self, boon: Boon) -> list[BoonEvent]:
        return list(self.session.scalars(select(BoonEvent).where(BoonEvent.boon_id == boon.id)))

    def flags(self, boon: Boon) -> list[BoonFlag]:
        return list(
            self.session.scalars(
                select(BoonFlag).where(BoonFlag.boon_id == boon.id, BoonFlag.cleared_at.is_(None))
            )
        )


@pytest.fixture
def domain(client_for: Callable[[], TestClient], session: Session) -> Domain:
    return Domain(Troupe(client_for, session))


CHARACTERS = [
    ["Vidal", "Active", "Toreador", "A made-up player", "The Fox", "V."],
    ["Agnes", "Active", "Brujah", "Another made-up player", "Aggie"],
]
FLAGGED = [["", "Bram", "U4", "Check who owes this: the Harpy's note"]]


def rows(domain: Domain) -> list[list[Any]]:
    return [
        boon_row("agnes ", "  BRAM", "Minor", date(2024, 3, 14), "For safe passage",
                 "Notify the debtor if it is traded", "Watch this one",
                 datetime(2024, 3, 15, 21, 15), domain.troupe.storyteller.email.upper(),
                 unique="U1"),
        boon_row("'The Fox' (D)", " aggie ", "Major boon", date(2024, 4, 1), "A favour at court",
                 settled="TRUE", settled_on=date(2024, 5, 1),
                 settled_notes="Paid in full at Elysium", unique="U2"),
        boon_row("Vidal", "Old Tom", "trivial", date(2024, 4, 2), "Directions",
                 entered="4/3/2024 20:30:00", settled=True,
                 settled_notes="Tom forgave it", unique="U3"),
        boon_row("", "Bram", "Blood", "June 7 2024", "Blood given", flag=True, unique="U4"),
        boon_row(STORY, "The Moon", "Life", date(2024, 6, 8), "A passage of the plot",
                 comments="Story text, on purpose", settled_notes="Called in? Not yet",
                 flag="TRUE", unique="U5"),
        boon_row("Bramwell", "Agnes", "Minor", date(2024, 6, 9), "Old name",
                 email="nobody-here@example.com", response="R-77"),
        boon_row("Agnes", "Bram", "Minor", date(2024, 3, 14), "for safe passage"),
        boon_row("Agnes", "Bram", "Favour", date(2024, 6, 10), unique="U8"),
        boon_row("Bram", "Agnes", "Minor", date(2024, 6, 11), unique="U1"),
        boon_row("Agnes", "Aggie", "Minor", date(2024, 6, 12), unique="U10"),
        [None] * len(MASTER),
        boon_row("Agnes", "Bram", "Minor", None, unique="U11"),
    ]  # fmt: skip


def test_every_mapping_from_the_sheet(domain: Domain) -> None:
    data = workbook(rows(domain), CHARACTERS, FLAGGED)
    sent_before = domain.session.scalar(select(func.count()).select_from(Notification))
    report = domain.run(data)
    found = domain.boons()

    # Matched ignoring case and spacing; stipulation, comments and who entered it.
    u1 = found["U1"]
    assert (u1.debtor_id, u1.debtor_name) == (domain.agnes, "")
    assert (u1.creditor_id, u1.creditor_name) == (domain.bram, "")
    assert (u1.kind, u1.made_on, u1.reason) == ("minor", date(2024, 3, 14), "For safe passage")
    assert u1.conditions == "Notify the debtor if it is traded"
    assert u1.notify_on_trade is True
    assert u1.staff_note == "Watch this one"
    assert u1.state == "registered" and u1.closed_at is None
    assert str(u1.submitted_by) == domain.troupe.storyteller.id
    [line] = domain.log(u1)
    assert (line.kind, line.note, line.role) == ("registered", IMPORTED, "staff")
    assert str(line.actor_id) == domain.troupe.custodian.id
    assert line.created_at.astimezone(UTC) == datetime(2024, 3, 16, 1, 15, tzinfo=UTC)

    # By alias, with quotes and "(D)"; settled, called in, on its Settled Date.
    u2 = found["U2"]
    assert (u2.debtor_id, u2.creditor_id, u2.kind) == (domain.vidal, domain.agnes, "major")
    assert (u2.state, u2.settled_how) == ("settled", "called_in")
    assert u2.closed_note == "Paid in full at Elysium"
    assert u2.closed_at is not None and u2.closed_at.astimezone(UTC).date() == date(2024, 5, 1)

    # Forgiven, as its notes say, on its Input Date; Old Tom kept as written.
    u3 = found["U3"]
    assert (u3.creditor_id, u3.creditor_name) == (None, "Old Tom")
    assert (u3.state, u3.settled_how) == ("settled", "forgiven")
    assert u3.closed_at == datetime(2024, 4, 4, 0, 30, tzinfo=UTC)

    # A blank side, a date written as text, and the Harpy's review comment on its flag.
    u4 = found["U4"]
    assert (u4.debtor_id, u4.debtor_name) == (None, BLANK)
    assert u4.made_on == date(2024, 6, 7)
    assert [(f.kind, f.note) for f in domain.flags(u4)] == [
        ("hand", "Check who owes this: the Harpy's note")
    ]

    # Story text kept as written; settled notes on a boon still standing go to staff.
    u5 = found["U5"]
    assert (u5.debtor_id, u5.debtor_name) == (None, STORY)
    assert u5.creditor_name == "The Moon"
    assert u5.staff_note == "Story text, on purpose\n\nCalled in? Not yet"
    assert u5.state == "registered"
    assert [f.note for f in domain.flags(u5)] == [FLAGGED_NOTE]

    # By a name it had before; an email with no account here enters it as no one.
    r77 = found["R-77"]
    assert (r77.debtor_id, r77.creditor_id) == (domain.bram, domain.agnes)
    assert r77.submitted_by is None

    # A row with neither id is kept by its number.
    assert found["row 9"].reason == "for safe passage"
    assert len(found) == 7

    assert report["rows"] == 11
    assert (report["added"], report["updated"], report["unchanged"]) == (7, 0, 0)
    assert {k["kind"]: (k["standing"], k["settled"]) for k in report["kinds"]} == {
        "trivial": (0, 1),
        "minor": (3, 0),
        "major": (0, 1),
        "blood": (1, 0),
        "life": (1, 0),
    }
    assert (report["flagged"], report["by_account"]) == (2, 1)
    skipped = {s["row"]: s["note"] for s in report["skipped"]}
    assert skipped == {
        "U8": "its type, 'Favour', isn't trivial, minor, major, blood or life",
        "U1": "row 11 has the Unique ID of row 3",
        "U10": "Agnes is on both sides",
        "U11": "it has no date, nor an Input Date",
    }
    names = {plain(n["name"]): (n["how"], n["character_name"], n["boons"]) for n in report["names"]}
    assert names["agnes"] == ("matched", "Agnes", 3)
    assert names["bram"] == ("matched", "Bram", 3)
    assert names["bramwell"] == ("matched", "Bram", 1)
    assert names["the fox"] == ("alias", "Vidal", 1)
    assert names["aggie"] == ("alias", "Agnes", 1)
    assert names["old tom"] == ("unmatched", None, 1)
    assert names[plain(BLANK)] == ("unmatched", None, 1)
    assert names[plain(STORY)] == ("unmatched", None, 1)
    [twins] = report["duplicates"]
    assert twins["rows"] == ["U1", "row 9"] and not twins["in_ledger"]
    assert twins["what"] == "Agnes owes Bram a minor boon of 14 Mar 2024"

    # No email anywhere in the report, and nobody told of anything.
    assert "example.com" not in report["csv"] and "example.com" not in str(report)
    assert "Skipped,U8,," in report["csv"]
    sent_after = domain.session.scalar(select(func.count()).select_from(Notification))
    assert sent_after == sent_before

    # One entry in the troupe's log for the whole import, with no email in it.
    log = list(
        domain.session.scalars(
            select(AuditEvent).where(
                AuditEvent.troupe_id == uuid.UUID(domain.troupe.id),
                AuditEvent.action.startswith("boon."),
            )
        )
    )
    assert [e.action for e in log] == ["boon.imported"]
    assert log[0].data == {"added": 7, "updated": 0, "unchanged": 0, "skipped": 4}
    messages = domain.troupe.lead.client.get(f"/troupes/{domain.troupe.id}/log").json()
    assert any(
        m["message"] == "custodian imported the boon ledger from the spreadsheet: 7 added,"
        " 0 updated, 0 unchanged, 4 rows skipped."
        for m in messages
    )


def test_a_dry_run_saves_nothing_and_reports_the_same(domain: Domain) -> None:
    data = workbook(rows(domain), CHARACTERS, FLAGGED)
    dry = domain.run(data, dry_run=True)
    assert dry["dry_run"] is True
    assert domain.boons() == {}
    assert (
        domain.session.scalars(select(AuditEvent).where(AuditEvent.action == "boon.imported")).all()
        == []
    )
    done = domain.run(data)
    assert done["dry_run"] is False
    for key in ("rows", "added", "updated", "unchanged", "kinds", "names", "skipped"):
        assert dry[key] == done[key], key
    assert "Would be added,7" in dry["csv"] and "Were added,7" in done["csv"]


def test_running_it_again_updates_adds_and_leaves_what_staff_changed(domain: Domain) -> None:
    first = rows(domain)
    domain.run(workbook(first, CHARACTERS, FLAGGED))
    before = domain.boons()

    # Staff edit U1 in Horatio; the sheet changes U3's reason and U4's flag, and gains a row.
    edited = domain.troupe.storyteller.client.patch(
        f"/troupes/{domain.troupe.id}/boons/{before['U1'].id}",
        json={"reason": "For safe passage through the docks", "note": "Clearer"},
    )
    assert edited.status_code == 200, edited.text
    second = [list(r) for r in first]
    second[0][5] = "Changed in the sheet too"
    second[2][5] = "Directions to the docks"
    second[3][13] = False
    second.append(boon_row("Vidal", "Agnes", "Minor", date(2024, 7, 1), "New", unique="U12"))
    report = domain.run(workbook(second, CHARACTERS, FLAGGED))

    assert (report["added"], report["updated"], report["unchanged"]) == (1, 2, 4)
    assert {"row": "U1", "note": "it was changed in Horatio since it was imported"} in report[
        "skipped"
    ]
    after = domain.boons()
    assert len(after) == len(before) + 1
    assert after["U1"].reason == "For safe passage through the docks"
    assert after["U3"].id == before["U3"].id
    assert after["U3"].reason == "Directions to the docks"
    assert domain.flags(after["U4"]) == []
    assert after["U12"].debtor_id == domain.vidal
    # Still one line in each log: the import's.
    assert [e.kind for e in domain.log(after["U3"])] == ["registered"]

    # Once more, unchanged: nothing to do but what staff changed.
    again = domain.run(workbook(second, CHARACTERS, FLAGGED))
    assert (again["added"], again["updated"], again["unchanged"]) == (0, 0, 7)


def test_a_name_added_since_is_linked_on_the_next_run(domain: Domain) -> None:
    sheet = [boon_row("Agnes", "Mystery Woman", "Minor", unique="U1")]
    first = domain.run(workbook(sheet, with_characters=False))
    assert "The spreadsheet has no Characters tab, so no alias was used." in first["general"]
    assert domain.boons()["U1"].creditor_name == "Mystery Woman"
    made = domain.troupe.lead.client.post(
        f"/troupes/{domain.troupe.id}/npcs", json={"name": "Mystery Woman"}
    )
    assert made.status_code == 201, made.text
    second = domain.run(workbook(sheet, with_characters=False))
    assert second["updated"] == 1
    assert str(domain.boons()["U1"].creditor_id) == made.json()["id"]


def test_a_boon_like_one_in_the_ledger_is_reported(domain: Domain) -> None:
    registered = domain.troupe.storyteller.client.post(
        f"/troupes/{domain.troupe.id}/boons",
        json={
            "boons": [
                {
                    "debtor": {"character_id": str(domain.agnes)},
                    "creditor": {"character_id": str(domain.bram)},
                    "kind": "minor",
                    "made_on": "2024-03-14",
                    "reason": "For safe passage",
                }
            ]
        },
    )
    assert registered.status_code == 201, registered.text
    report = domain.run(
        workbook([boon_row("Agnes", "Bram", reason="For safe passage", unique="U1")]),
        dry_run=True,
    )
    assert report["duplicates"] == [
        {
            "rows": ["U1"],
            "what": "Agnes owes Bram a minor boon of 14 Mar 2024",
            "in_ledger": True,
        }
    ]


def test_only_the_custodian_imports(domain: Domain) -> None:
    data = workbook([boon_row("Agnes", "Bram", unique="U1")])
    troupe = domain.troupe
    for person in (troupe.lead, troupe.storyteller, troupe.player, troupe.stranger):
        for dry_run in (True, False):
            assert domain.upload(data, dry_run, by=person).status_code == 403, person.handle
    assert domain.boons() == {}
    missing = troupe.custodian.client.post(
        f"/boon-imports/{uuid.uuid4()}",
        files={"file": ("ledger.xlsx", data, "application/octet-stream")},
    )
    assert missing.status_code == 404


def test_what_cannot_be_imported_says_why(domain: Domain) -> None:
    not_a_sheet = domain.upload(b"Owed By,Owed To\nAgnes,Bram\n", dry_run=True)
    assert not_a_sheet.status_code == 422
    assert "isn't a spreadsheet Horatio can read" in not_a_sheet.json()["detail"]

    book = openpyxl.Workbook()
    assert book.active is not None
    book.active.title = "Active"
    out = io.BytesIO()
    book.save(out)
    no_master = domain.upload(out.getvalue(), dry_run=True)
    assert no_master.status_code == 422
    assert no_master.json()["detail"] == "The spreadsheet has no Master tab."


def test_dates_that_look_wrong_are_reported_and_imported_as_they_are(domain: Domain) -> None:
    book = workbook(
        [
            boon_row("Agnes", "Bram", entered=datetime(2099, 1, 1, 20), unique="U1"),
            boon_row("Agnes", "Bram", entered=datetime(2025, 6, 1, 21), settled=True,
                     settled_on=date(2024, 3, 1), unique="U2"),
            boon_row("Bram", "Agnes", entered=datetime(2024, 5, 1, 21), settled=True,
                     settled_on=date(2099, 2, 1), unique="U3"),
            # Settled the night it was typed in, earlier in the day: nothing to say.
            boon_row("Bram", "Agnes", entered=datetime(2024, 3, 15, 21, 15), settled=True,
                     settled_on=date(2024, 3, 15), unique="U4"),
        ]
    )  # fmt: skip

    report = domain.run(book, dry_run=True)

    assert [(n["row"], n["note"]) for n in report["notes"]] == [
        ("U1", "its Input Date is in the future"),
        ("U2", "its Settled Date is before its Input Date"),
        ("U3", "its Settled Date is in the future"),
    ]
    assert report["added"] == 4

    domain.run(book)
    statistics = domain.troupe.storyteller.client.get(
        f"/troupes/{domain.troupe.id}/boon-statistics", params={"scope": "everyone"}
    )
    assert statistics.status_code == 200, statistics.text


def test_a_long_text_is_cut_to_what_the_ledger_takes_and_reported(domain: Domain) -> None:
    long = "a" * (boons.LONGEST_TEXT + 50)
    report = domain.run(workbook([boon_row(long, "Bram", reason=long, unique="U1")]))
    boon = domain.boons()["U1"]
    assert len(boon.debtor_name) == len(boon.reason) == boons.LONGEST_TEXT
    assert boon.debtor_name.endswith("…")
    assert {n["note"] for n in report["notes"]} == {
        "Owed By was cut to 2,000 characters",
        "the reason was cut to 2,000 characters",
    }
