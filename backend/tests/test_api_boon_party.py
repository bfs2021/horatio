"""A character's own page of the boon ledger (#980): who they are, whether they have left
as the caller may know it, and what they owe and are owed, which agree with the
Standings tab for them, for staff and for a Harpy; and the ledger narrowed to one side
of them (`side`), what they owe or what they are owed. A name only works the same,
matched on the whole name, ignoring case."""

from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.api_helpers import Person, Troupe, new_character
from tests.test_api_boon_harpy import ok
from tests.test_api_boon_harpy_standings import Gone
from tests.test_api_boon_paging import every, seed

# Weights that don't add up evenly, so the sums are put to the test.
WEIGHTS = {"trivial": 0.1, "minor": 1.3, "major": 3, "blood": 7, "life": 12}


@pytest.fixture
def gone(client_for: Callable[[], TestClient], session: Session) -> Gone:
    return Gone(Troupe(client_for, session))


def party(gone: Gone, by: Person | None = None, **query: Any) -> Any:
    return (by or gone.troupe.storyteller).client.get(
        f"/troupes/{gone.troupe.id}/boon-party", params=query
    )


def a_ledger(gone: Gone, session: Session) -> None:
    """Hundreds of boons among the Court's characters and two names only, the troupe's
    own weights, and Bram, Cosima and Dario gone three ways."""
    ok(gone.troupe.storyteller.client.put(f"/troupes/{gone.troupe.id}/boon-weights", json=WEIGHTS))
    gone.leave_three_ways()
    seed(gone, session, count=300)


def as_the_standings_say(gone: Gone, by: Person | None, key: str, **query: Any) -> None:
    """The party's page agrees with the Standings tab, in both its scopes."""
    found = ok(party(gone, by=by, **query))
    for scope, suffix in (("active", ""), ("everyone", "_everyone")):
        standings = ok(gone.standings(by=by, scope=scope))["characters"]
        mine = next((s for s in standings if s["who"]["key"] == key), None)
        expected = (
            (mine["owes_count"], mine["owes"], mine["owed_count"], mine["owed"])
            if mine
            else (0, 0, 0, 0)
        )
        owes, owed = found[f"owes{suffix}"], found[f"owed{suffix}"]
        assert (owes["count"], owes["weight"], owed["count"], owed["weight"]) == expected, (
            key,
            scope,
        )


def test_a_character_s_totals_agree_with_the_standings_for_staff(
    gone: Gone, session: Session
) -> None:
    a_ledger(gone, session)
    for character in (gone.agnes, gone.bram, gone.cosima, gone.dario, gone.vidal):
        as_the_standings_say(gone, None, character, character_id=character)
    # A name only, by its whole name, any case.
    as_the_standings_say(gone, None, "name:grove", name="GROVE")
    # Some of it has left: the two scopes differ for someone who owes a departed one.
    agnes = ok(party(gone, character_id=gone.agnes))
    assert agnes["owes_everyone"]["count"] > agnes["owes"]["count"] > 0
    assert agnes["party"]["name"] == "Agnes"
    assert (agnes["can_audit"], agnes["sheet"]) == (True, True)


def test_a_harpy_s_totals_agree_with_their_standings_as_the_court_knows_it(
    gone: Gone, session: Session
) -> None:
    ok(gone.option("full", True))
    a_ledger(gone, session)
    harpy = gone.harpy_player
    for character in (gone.agnes, gone.bram, gone.cosima, gone.dario):
        as_the_standings_say(gone, harpy, character, character_id=character)
    as_the_standings_say(gone, harpy, "name:ottilie", name="ottilie")

    # Cosima's Final Death the court hasn't heard of: in play for the Harpy, not staff.
    theirs = ok(party(gone, by=harpy, character_id=gone.cosima))
    staff = ok(party(gone, character_id=gone.cosima))
    assert (theirs["party"]["standing"], theirs["party"]["left"]) == ("active", None)
    assert (staff["party"]["standing"], staff["party"]["left"]) == ("final_death", "dead")
    assert theirs["owes"]["count"] > staff["owes"]["count"]
    # Bram's player stopped: the court knows he's gone, not why.
    assert ok(party(gone, by=harpy, character_id=gone.bram))["party"]["standing"] == "retired"
    # The Harpy audits, with the full ledger; the sheet is staff's.
    assert (theirs["can_audit"], theirs["sheet"]) == (True, False)


def test_the_ledger_narrows_to_one_side_of_a_party(gone: Gone, session: Session) -> None:
    seed(gone, session, count=200)
    both = every(gone, "all", character_id=gone.agnes)
    owes = every(gone, "all", character_id=gone.agnes, side="debtor")
    owed = every(gone, "all", character_id=gone.agnes, side="creditor")
    assert owes and owed
    assert all(b["debtor"]["character_id"] == gone.agnes for b in owes)
    assert all(b["creditor"]["character_id"] == gone.agnes for b in owed)
    assert {b["id"] for b in owes} | {b["id"] for b in owed} == {b["id"] for b in both}
    # A name only, the whole name, any case; not a part of it.
    named = every(gone, "all", name="grove", side="creditor")
    assert named and all(b["creditor"]["name"] == "Grove" for b in named)
    assert gone.ledger("all", name="gro", side="creditor")["total"] == 0
    # Without a party, a side narrows nothing.
    assert gone.ledger("all", side="debtor")["total"] == gone.ledger("all")["total"]


def test_a_party_s_page_names_only_what_the_ledger_may_name(gone: Gone) -> None:
    # A character on no boon of the troupe's, and not one it may name: no such page.
    outsider = new_character(gone.troupe, gone.troupe.player, "Outsider", finished=False)
    assert party(gone, character_id=outsider).status_code == 404
    # One it may name, though on no boon yet: nothing owed either way.
    vidal = ok(party(gone, character_id=gone.vidal))
    assert (vidal["owes"]["count"], vidal["owed"]["count"]) == (0, 0)
    # A name only on no boon: as asked; never audited, and no sheet.
    nobody = ok(party(gone, name="  The Moon "))
    assert nobody["party"] == {**nobody["party"], "name": "The Moon", "character_id": None}
    assert (nobody["can_audit"], nobody["sheet"]) == (False, False)
    # A character or a name, one of them.
    assert party(gone).status_code == 422
    assert party(gone, character_id=gone.agnes, name="Grove").status_code == 422
    # Players don't read the ledger.
    assert party(gone, by=gone.troupe.player, character_id=gone.agnes).status_code == 403
