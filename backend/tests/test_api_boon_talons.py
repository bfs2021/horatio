"""Lesser Harpies, or talons (#689): the troupe's setting, the Harpy giving others access
to the boon ledger as their character with what each may do (add, correct, settle,
audit; #984), each permission alone against every boon endpoint, the access belonging
to the office when the Harpy changes, staff seeing who has what and taking it away, and
a Lesser Harpy never seeing what only staff see (MET: VTM p. 379)."""

import json
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.api_helpers import Person, Troupe, sign_up
from tests.test_api_boon_harpy import Court, hold, ok, report
from tests.test_api_boon_standings import at_home
from tests.test_api_boons import named, row


class Talons(Court):
    """The Court, with its Harpy given the full ledger, and Iris, played by a fifth
    player, holding the Lesser Harpy title; Hugo, a sixth player's, holds none."""

    def __init__(self, troupe: Troupe) -> None:
        super().__init__(troupe)
        ok(self.access("full"))
        self.iris_player = sign_up(troupe.client_for, "talon-689")
        self.iris = at_home(troupe, self.iris_player, "Iris", "Malkavian")
        self.give_title(self.iris, ["Lesser Harpy"])
        self.hugo_player = sign_up(troupe.client_for, "hugo-689")
        self.hugo = at_home(troupe, self.hugo_player, "Hugo", "Ventrue")

    @property
    def talons(self) -> str:
        return f"/troupes/{self.troupe.id}/boon-talons"

    def setting(self, on: bool, word: str = "Lesser Harpies", by: Person | None = None) -> Any:
        return (by or self.troupe.storyteller).client.put(
            f"/troupes/{self.troupe.id}/boon-talons-setting", json={"on": on, "word": word}
        )

    def give(self, character: str, by: Person | None = None, **can: bool) -> Any:
        return (by or self.harpy_player).client.put(f"{self.talons}/{character}", json=can)

    def ledgers(self, character: str, player: Person) -> list[Any]:
        return ok(player.client.get(f"/characters/{character}/harpy-ledgers"))


@pytest.fixture
def court(client_for: Callable[[], TestClient], session: Session) -> Talons:
    return Talons(Troupe(client_for, session))


# --- the setting --------------------------------------------------------------------------


def test_only_staff_let_the_harpy_give_access_and_only_with_the_full_ledger(court: Talons) -> None:
    harpy = court.harpy_player
    assert harpy.client.get(court.talons).status_code == 403
    for person in (court.troupe.assistant, court.troupe.player, harpy):
        assert court.setting(True, by=person).status_code == 403
    assert court.setting(True, word="Minions").status_code == 422

    changed = ok(court.setting(True, word="Talons"))

    assert (changed["boon_talons"], changed["boon_talon_word"]) == (True, "Talons")
    assert (
        "storyteller set the Harpy may give others access to the ledger, as Talons."
        in court.messages()
    )
    listed = ok(harpy.client.get(court.talons))
    assert (listed["enabled"], listed["word"], listed["role"]) == (True, "Talons", "harpy")
    # Below the full ledger, the Harpy gives no one access.
    ok(court.access("submissions"))
    assert harpy.client.get(court.talons).status_code == 403
    shared = ok(court.troupe.lead.client.get(f"/troupes/{court.troupe.id}/settings-share"))
    assert "boon_talon_word" in json.dumps(shared["document"])


def test_lesser_harpy_title_holders_are_offered_first_and_the_harpy_not_at_all(
    court: Talons,
) -> None:
    ok(court.setting(True))

    choices = ok(court.harpy_player.client.get(court.talons))["choices"]

    names = [(c["name"], c["lesser_harpy"]) for c in choices]
    assert names[0] == ("Iris", True)
    assert ("Hugo", False) in names
    assert "Hestia" not in {c["name"] for c in choices}
    # NPCs aren't offered: a Lesser Harpy works from their player's Play View.
    assert "Vidal" not in {c["name"] for c in choices}
    assert court.give(court.hestia, can_add=True).status_code == 422
    assert court.give(court.vidal, can_add=True).status_code == 422


# --- what each may do ---------------------------------------------------------------------


def test_an_add_only_lesser_harpy_sees_and_adds_but_never_edits(court: Talons) -> None:
    ok(court.setting(True))
    iris = court.iris_player
    standing = court.one(court.agnes, court.bram, staff_note="Bram's player asked.")
    assert iris.client.get(court.path).status_code == 403

    given = ok(court.give(court.iris, can_add=True))

    talon = given["talons"][0]
    assert (talon["name"], talon["can_add"], talon["can_edit"]) == ("Iris", True, False)
    assert talon["given_by"] == "Hestia"
    assert "harpy-688 as Hestia made Iris a Lesser Harpy, to see the ledger and add boons." in (
        court.messages()
    )
    # They see the ledger, as a Harpy does: no staff note.
    seen = court.ledger(by=iris)["boons"]
    assert [b["staff_note"] for b in seen] == [""]
    opened = ok(court.get(standing, by=iris))
    assert opened["staff_note"] == ""
    # They add, as their character.
    made = ok(court.register(row(court.bram, court.agnes), by=iris), 201)
    line = ok(court.get(made[0]))["events"][0]
    assert (line["as_character"], line["by"]) == ("Iris", "talon-689")
    # They don't edit, settle, or review.
    assert court.edit(standing, by=iris, reason="New", note="Fixed").status_code == 403
    assert court.act(standing, "settle", by=iris, how="called_in", note="").status_code == 403
    assert iris.client.get(court.queue).status_code == 404
    # The Play View takes them to the ledger, with what they may do.
    ledgers = court.ledgers(court.iris, iris)
    assert [(lg["role"], lg["can_add"], lg["can_edit"], lg["can_review"]) for lg in ledgers] == [
        ("talon", True, False, False)
    ]
    assert ledgers[0]["talon_word"] == "Lesser Harpy"


def test_a_correct_only_lesser_harpy_corrects_but_never_settles_or_reviews(
    court: Talons,
) -> None:
    ok(court.setting(True))
    iris = court.iris_player
    standing = court.one(court.agnes, court.bram)
    ok(court.give(court.iris, can_edit=True))

    edited = ok(court.edit(standing, by=iris, reason="Discretion", note="Wrong reason"))

    line = edited["events"][-1]
    assert (line["kind"], line["as_character"]) == ("edited", "Iris")
    # What an edit changed is for storytellers and assistant storytellers alone.
    assert not line.get("changes")
    assert ok(court.get(edited))["events"][-1]["changes"]
    assert court.act(standing, "settle", by=iris, how="called_in", note="").status_code == 403
    assert iris.client.get(court.queue).status_code == 404
    assert court.register(row(court.bram, court.agnes), by=iris).status_code == 403
    ledgers = court.ledgers(court.iris, iris)
    assert [(lg["can_edit"], lg["can_settle"], lg["can_review"]) for lg in ledgers] == [
        (True, False, False)
    ]


def test_a_settle_only_lesser_harpy_settles_and_reviews_but_never_corrects(
    court: Talons,
) -> None:
    ok(court.setting(True))
    iris = court.iris_player
    standing = court.one(court.agnes, court.bram)
    ok(court.give(court.iris, can_settle=True))

    settled = ok(court.act(standing, "settle", by=iris, how="called_in", note=""))

    line = settled["events"][-1]
    assert (line["kind"], line["as_character"]) == ("settled", "Iris")
    assert ok(iris.client.get(court.queue))["boons"] == []
    assert court.edit(standing, by=iris, reason="New", note="Fixed").status_code == 403
    ledgers = court.ledgers(court.iris, iris)
    assert [(lg["can_edit"], lg["can_settle"], lg["can_review"]) for lg in ledgers] == [
        (False, True, True)
    ]


def test_audit_alone_is_kept_for_audits(court: Talons) -> None:
    ok(court.setting(True))
    ok(court.give(court.iris, can_audit=True))

    ledgers = court.ledgers(court.iris, court.iris_player)

    assert [
        (lg["can_add"], lg["can_edit"], lg["can_settle"], lg["can_audit"]) for lg in ledgers
    ] == [(False, False, False, True)]
    assert court.register(row(court.bram, court.agnes), by=court.iris_player).status_code == 403


# --- each right alone, against every boon endpoint (#984) ----------------------------------


def standing(court: Talons) -> dict[str, Any]:
    return court.one(court.agnes, court.bram)


def closed(court: Talons) -> dict[str, Any]:
    boon = standing(court)
    ok(court.act(boon, "void", note="Entered twice"))
    return boon


def pending(court: Talons) -> dict[str, Any]:
    """A boon a player reported, waiting for review (the troupe holds reports)."""
    report(court, court.agnes, court.troupe.player, court.bram)
    queue = ok(court.troupe.storyteller.client.get(court.queue))["boons"]
    return next(b for b in queue if b["state"] == "pending")


def flagged(court: Talons) -> dict[str, Any]:
    raised = ok(court.act(standing(court), "flags", note="Which night?"), 201)
    return raised["flags"][0]


Call = Callable[[Talons, Person], Any]

# Each endpoint, with the right it asks of a Lesser Harpy ("view": any of them;
# "harpy": none, it is the Harpy's own), and a call to it as one.
ENDPOINTS: dict[str, tuple[str, Call]] = {
    "see the ledger": ("view", lambda c, p: p.client.get(c.path)),
    "open a boon": ("view", lambda c, p: c.get(standing(c), by=p)),
    "register": ("add", lambda c, p: c.register(row(c.bram, c.agnes), by=p)),
    "edit": ("edit", lambda c, p: c.edit(standing(c), by=p, reason="New", note="Fixed")),
    "link a name": (
        "edit",
        lambda c, p: c.act(
            c.one(named("A stranger"), c.agnes), "link", by=p, side="debtor", character_id=c.bram
        ),
    ),
    "trade": (
        "settle",
        lambda c, p: c.act(standing(c), "trade", by=p, creditor={"character_id": c.hugo}),
    ),
    "pass on": (
        "settle",
        lambda c, p: c.act(standing(c), "pass-on", by=p, side="debtor", to=named("A broodmate")),
    ),
    "settle": ("settle", lambda c, p: c.act(standing(c), "settle", by=p, how="called_in")),
    "void": ("settle", lambda c, p: c.act(standing(c), "void", by=p, note="Entered twice")),
    "reopen": ("settle", lambda c, p: c.act(closed(c), "reopen", by=p, note="It stands")),
    "status loss": ("settle", lambda c, p: c.act(standing(c), "status-loss", by=p, taken=False)),
    "Gallant": ("settle", lambda c, p: c.act(standing(c), "gallant", by=p, give=False)),
    "the review queue": ("settle", lambda c, p: p.client.get(c.queue)),
    "accept": ("settle", lambda c, p: c.act(pending(c), "accept", by=p)),
    "reject": ("settle", lambda c, p: c.act(pending(c), "reject", by=p, reason="Not so")),
    "flag": ("settle", lambda c, p: c.act(standing(c), "flags", by=p, note="Which night?")),
    "clear a flag": (
        "settle",
        lambda c, p: p.client.post(
            f"/troupes/{c.troupe.id}/boon-flags/{flagged(c)['id']}/clear", json={"note": ""}
        ),
    ),
    "audit": (
        "audit",
        lambda c, p: p.client.post(
            f"/troupes/{c.troupe.id}/boon-audits", json={"character_id": c.agnes}
        ),
    ),
    "declare a Boonbreaker": (
        "harpy",
        lambda c, p: p.client.post(
            f"/troupes/{c.troupe.id}/boonbreakers", json={"character_id": c.bram, "note": "Lied"}
        ),
    ),
}
# Allowed, but with nothing to answer on a plain standing boon.
NOTHING_TO_ANSWER = {"status loss", "Gallant"}


@pytest.mark.parametrize("right", ["add", "edit", "settle", "audit"])
def test_each_right_alone_reaches_its_endpoints_and_no_others(court: Talons, right: str) -> None:
    ok(court.setting(True))
    hold(court)
    ok(court.harpy_player.client.put(f"{court.talons}/{court.iris}", json={f"can_{right}": True}))

    for name, (needs, call) in ENDPOINTS.items():
        code = call(court, court.iris_player).status_code
        if needs in ("view", right):
            answered = code < 300 or (name in NOTHING_TO_ANSWER and code == 409)
            assert answered, f"{right} alone: {name} gave {code}"
        else:
            assert code in (403, 404), f"{right} alone: {name} gave {code}"


def test_the_harpy_changes_and_takes_away_access(court: Talons) -> None:
    ok(court.setting(True))
    ok(court.give(court.iris, can_add=True))

    changed = ok(
        court.give(court.iris, can_add=True, can_edit=True, can_settle=True, can_audit=True)
    )

    assert changed["talons"][0]["can_settle"] is True
    assert changed["talons"][0]["can_audit"] is True
    assert (
        "harpy-688 as Hestia let Iris, a Lesser Harpy, see the ledger, add boons, correct them,"
        " settle them and perform audits." in court.messages()
    )
    ok(court.give(court.iris, can_settle=True))
    assert (
        "harpy-688 as Hestia let Iris, a Lesser Harpy, see the ledger and settle boons."
        in court.messages()
    )
    taken = ok(court.harpy_player.client.delete(f"{court.talons}/{court.iris}"))
    assert taken["talons"] == []
    assert "harpy-688 as Hestia took away Iris's access as a Lesser Harpy." in court.messages()
    assert court.iris_player.client.get(court.path).status_code == 403
    assert court.ledgers(court.iris, court.iris_player) == []


# --- the office ---------------------------------------------------------------------------


def test_access_belongs_to_the_office_when_the_harpy_changes(court: Talons) -> None:
    ok(court.setting(True))
    ok(court.give(court.iris, can_add=True))
    court.give_title(court.hestia, [])
    court.give_title(court.hugo, ["Harpy"])

    listed = ok(court.hugo_player.client.get(court.talons))

    assert [t["name"] for t in listed["talons"]] == ["Iris"]
    assert listed["talons"][0]["given_by"] == "Hestia"
    assert court.harpy_player.client.get(court.talons).status_code == 403
    # Iris keeps working the ledger until the new Harpy says otherwise.
    assert court.ledger(by=court.iris_player)["boons"] == []
    ok(court.give(court.iris, by=court.hugo_player, can_add=True, can_edit=True))
    assert ok(court.hugo_player.client.get(court.talons))["talons"][0]["given_by"] == "Hugo"


def test_staff_see_who_has_what_and_take_it_away_but_never_give_it(court: Talons) -> None:
    ok(court.setting(True))
    ok(court.give(court.iris, can_add=True))
    staff = court.troupe.storyteller

    listed = ok(staff.client.get(court.talons))

    assert listed["role"] == "staff"
    assert [t["name"] for t in listed["talons"]] == ["Iris"]
    assert listed["choices"] == []
    assert court.give(court.hugo, by=staff, can_add=True).status_code == 403
    ok(staff.client.delete(f"{court.talons}/{court.iris}"))
    assert court.iris_player.client.get(court.path).status_code == 403
    assert "storyteller took away Iris's access as a Lesser Harpy." in court.messages()


def test_switching_the_setting_off_suspends_access_and_keeps_the_list(court: Talons) -> None:
    ok(court.setting(True))
    ok(court.give(court.iris, can_add=True))

    ok(court.setting(False))

    assert court.iris_player.client.get(court.path).status_code == 403
    assert ok(court.troupe.storyteller.client.get(court.talons))["enabled"] is False
    ok(court.setting(True))
    assert court.ledger(by=court.iris_player)["boons"] == []
