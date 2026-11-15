"""Who sees which lines of a boon's log (#992): a Harpy only what was done since they
took the title, by them, another holder of it, or (where the troupe lets them) a
Lesser Harpy; a Lesser Harpy only their own; staff's state changes but never their
edits, links or flags; staff everything; players nothing of any edit, anywhere."""

import json
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.api_helpers import Person, Troupe, sign_up
from tests.test_api_boon_audits import Audits
from tests.test_api_boon_harpy import ok
from tests.test_api_boon_standings import at_home
from tests.test_api_boons import named, row


class Sight(Audits):
    """The Court with the full ledger, Lesser Harpies on, and Iris one who may add,
    correct and settle boons."""

    def __init__(self, troupe: Troupe) -> None:
        super().__init__(troupe)
        ok(self.setting(True))
        ok(super(Audits, self).give(self.iris, can_add=True, can_edit=True, can_settle=True))

    def log(self, boon: dict[str, Any], by: Person | None = None) -> list[dict[str, Any]]:
        return ok(self.get(boon, by=by))["events"]

    def sees_talons(self, on: bool, by: Person | None = None) -> Any:
        return (by or self.troupe.storyteller).client.put(
            f"/troupes/{self.troupe.id}/boon-talons-setting",
            json={"on": True, "harpy_sees": on},
        )


@pytest.fixture
def court(client_for: Callable[[], TestClient], session: Session) -> Sight:
    return Sight(Troupe(client_for, session))


def kinds(log: list[dict[str, Any]]) -> list[str]:
    return [line["kind"] for line in log]


def notes(log: list[dict[str, Any]]) -> list[str]:
    return [line["note"] for line in log]


# --- a new Harpy --------------------------------------------------------------------------


def test_a_new_harpy_reads_nothing_the_harpy_before_them_changed(court: Sight) -> None:
    hestia = court.harpy_player
    edited = court.one(court.agnes, court.bram)
    settled = court.one(court.bram, court.agnes)
    theirs = ok(court.register(row(court.agnes, court.bram), by=hestia, note="At Elysium"), 201)[0]
    ok(court.edit(edited, by=hestia, reason="Secrecy", note="Hestia's private reasons"))
    ok(court.act(settled, "settle", by=hestia, how="called_in", note="Paid at the Rack"))
    assert kinds(court.log(edited, by=hestia)) == ["registered", "edited"]

    # The title passes to Hugo.
    court.give_title(court.hestia, [])
    court.give_title(court.hugo, ["Harpy"])
    hugo = court.hugo_player

    assert kinds(court.log(edited, by=hugo)) == ["registered"]
    assert "Hestia's private reasons" not in json.dumps(ok(court.get(edited, by=hugo)))
    # The settled boon still says so, and its closing note: that's the ledger, not its log.
    seen = ok(court.get(settled, by=hugo))
    assert kinds(seen["events"]) == ["registered"]
    assert (seen["state"], seen["closed_note"]) == ("settled", "Paid at the Rack")
    # Hestia's own boon shows it was registered, not by whom, nor her note.
    [first] = court.log(theirs, by=hugo)
    assert (first["kind"], first["as_character"], first["note"]) == ("registered", None, "")
    # Hugo's own edit shows to him.
    ok(court.edit(edited, by=hugo, reason="Discretion", note="Hugo's correction"))
    assert notes(court.log(edited, by=hugo)) == ["", "Hugo's correction"]
    assert court.log(edited, by=hugo)[-1]["as_character"] == "Hugo"
    # Staff see all of it, with the changes.
    staff = court.log(edited)
    assert notes(staff) == ["", "Hestia's private reasons", "Hugo's correction"]
    assert all(line["changes"] for line in staff[1:])
    assert court.log(theirs)[0]["as_character"] == "Hestia"


def test_a_harpy_who_regains_the_title_starts_again(court: Sight) -> None:
    hestia = court.harpy_player
    boon = court.one(court.agnes, court.bram)
    ok(court.edit(boon, by=hestia, reason="Secrecy", note="First time round"))
    court.give_title(court.hestia, [])

    court.give_title(court.hestia, ["Harpy"])

    assert kinds(court.log(boon, by=hestia)) == ["registered"]


def test_each_of_several_harpies_sees_the_others_only_from_their_own_start(
    court: Sight,
) -> None:
    hestia = court.harpy_player
    boon = court.one(court.agnes, court.bram)
    ok(court.edit(boon, by=hestia, reason="Secrecy", note="Before Selene"))
    second = sign_up(court.troupe.client_for, "harpy-992-b")
    selene = at_home(court.troupe, second, "Selene", "Ventrue")
    court.give_title(selene, ["Master Harpy"])

    ok(court.edit(boon, by=hestia, reason="Discretion", note="After Selene"))
    ok(court.edit(boon, by=second, reason="Shelter", note="Selene's own"))

    assert notes(court.log(boon, by=second)) == ["", "After Selene", "Selene's own"]
    assert notes(court.log(boon, by=hestia)) == [
        "",
        "Before Selene",
        "After Selene",
        "Selene's own",
    ]


# --- Lesser Harpies -----------------------------------------------------------------------


def test_a_lesser_harpy_sees_only_their_own_lines(court: Sight) -> None:
    iris = court.iris_player
    boon = court.one(court.agnes, court.bram)
    ok(court.edit(boon, by=court.harpy_player, reason="Secrecy", note="The Harpy's"))
    ok(court.edit(boon, by=iris, reason="Discretion", note="Iris's"))
    hers = ok(court.register(row(court.bram, court.agnes), by=court.harpy_player), 201)[0]

    assert notes(court.log(boon, by=iris)) == ["", "Iris's"]
    # The Harpy's own boon shows only that it was registered.
    [first] = court.log(hers, by=iris)
    assert first["as_character"] is None
    # The Harpy sees both, with the troupe's default.
    assert notes(court.log(boon, by=court.harpy_player)) == ["", "The Harpy's", "Iris's"]


def test_with_the_option_off_the_harpy_reads_nothing_a_lesser_harpy_did(court: Sight) -> None:
    iris = court.iris_player
    assert court.sees_talons(False, by=court.troupe.assistant).status_code == 403
    changed = ok(court.sees_talons(False))
    assert changed["boon_harpy_sees_talons"] is False
    assert (
        "storyteller set the Harpy not to see what their Lesser Harpies change." in court.messages()
    )
    shared = ok(court.troupe.lead.client.get(f"/troupes/{court.troupe.id}/settings-share"))
    assert "boon_harpy_sees_talons" in json.dumps(shared["document"])
    edited = court.one(court.agnes, court.bram)
    settled = court.one(court.bram, court.agnes)
    made = ok(court.register(row(court.agnes, court.bram), by=iris, note="Iris's word"), 201)[0]
    ok(court.edit(edited, by=iris, reason="Secrecy", note="Iris's edit"))
    ok(court.act(settled, "settle", by=iris, how="called_in", note="Iris's settling"))
    hestia = court.harpy_player

    assert kinds(court.log(edited, by=hestia)) == ["registered"]
    assert kinds(court.log(settled, by=hestia)) == ["registered"]
    assert court.log(made, by=hestia)[0]["as_character"] is None
    for boon in (edited, settled, made):
        assert "Iris's" not in json.dumps(ok(court.get(boon, by=hestia))["events"])
    # The Harpy's audit is the ledger as it stands, with nothing of its log.
    audit = ok(court.make(court.agnes, by=hestia), 201)
    assert "Iris's" not in json.dumps(audit)
    # Iris and staff still see it; switched on, so does the Harpy.
    assert notes(court.log(edited, by=iris)) == ["", "Iris's edit"]
    assert "Iris's edit" in notes(court.log(edited))
    ok(court.sees_talons(True))
    assert notes(court.log(edited, by=hestia)) == ["", "Iris's edit"]
    assert notes(court.log(made, by=hestia)) == ["Iris's word"]


# --- staff --------------------------------------------------------------------------------


def test_staff_edits_links_and_flags_are_kept_from_the_harpy_and_lesser_harpies(
    court: Sight,
) -> None:
    boon = court.one(named("The Hermit"), court.bram)
    ok(court.edit(boon, reason="Secrecy", note="Staff's edit"))
    ok(court.act(boon, "link", side="debtor", character_id=court.agnes, note="Staff's link"))
    ok(court.act(boon, "flags", note="Staff's flag"), 201)
    ok(court.act(boon, "trade", creditor=named("Grove"), note="Traded at court"))
    ok(court.act(boon, "settle", how="called_in", note="Called in"))
    ok(court.act(boon, "reopen", note="Settled by mistake"))
    ok(court.act(boon, "void", note="Never stood"))

    for person in (court.harpy_player, court.iris_player):
        seen = ok(court.get(boon, by=person))
        assert kinds(seen["events"]) == ["registered", "traded", "settled", "reopened", "voided"]
        assert all(line["by"] is None and line["as_character"] is None for line in seen["events"])
        assert "Staff's" not in json.dumps(seen["events"])
        # The flag waiting for a ruling still shows, but not who raised it.
        assert [(f["note"], f["raised_by"]) for f in seen["flags"]] == [("Staff's flag", None)]
    queued = ok(court.harpy_player.client.get(court.queue))["boons"]
    assert [f["raised_by"] for b in queued for f in b["flags"]] == [None]
    assert kinds(court.log(boon)) == [
        "registered",
        "edited",
        "linked",
        "flagged",
        "traded",
        "settled",
        "reopened",
        "voided",
    ]
    # No word of it reaches the Harpy's player.
    told = ok(court.harpy_player.client.get("/notifications"))["items"]
    assert "Staff's" not in json.dumps(told)


# --- players ------------------------------------------------------------------------------


def test_players_never_see_that_a_boon_was_edited(court: Sight) -> None:
    ok(
        court.troupe.storyteller.client.put(
            f"/troupes/{court.troupe.id}/boon-players", json={"see": "owed", "settle": True}
        )
    )
    owes = court.one(court.agnes, court.bram)
    owed = court.one(court.bram, court.agnes)
    ok(court.edit(owes, reason="Secrecy", note="Staff's edit"))
    ok(court.edit(owed, by=court.harpy_player, reason="Shelter", note="The Harpy's edit"))
    ok(court.edit(owed, by=court.iris_player, reason="Herbs", note="Iris's edit"))
    made = ok(court.make(court.agnes, by=court.harpy_player, given_to=court.agnes), 201)
    player = court.troupe.player

    responses = [
        player.client.get(f"/characters/{court.agnes}/boons"),
        player.client.get(f"/characters/{court.agnes}/play-boons"),
        player.client.get(f"/characters/{court.agnes}/boon-audits"),
        player.client.get(f"/boon-audits/{made['id']}"),
        player.client.get("/notifications"),
    ]

    for response in responses:
        text = json.dumps(ok(response))
        assert '"edited"' not in text, response.url
        assert "edit" not in text.replace("credit", ""), response.url
    # They see the boons as they now stand.
    tab = ok(responses[1])
    assert [b["reason"] for b in tab["owes"]] == ["Secrecy"]
    assert [b["reason"] for b in tab["owed"]] == ["Herbs"]
