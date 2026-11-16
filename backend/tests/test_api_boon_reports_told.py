"""Who is told of the boons players report (#1018), each by their own choice: staff
only once they ask, the Harpy and a Lesser Harpy who approves reported boons until they
turn it off, and a new Harpy or Lesser Harpy starting on again. A Lesser Harpy who
may not approve reported boons is never told."""

from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.api_helpers import Person, Troupe
from tests.test_api_boon_harpy import hold, ok, report
from tests.test_api_boon_standings import at_home
from tests.test_api_boon_talons import Talons


@pytest.fixture
def court(client_for: Callable[[], TestClient], session: Session) -> Talons:
    """The Harpy has the full ledger, and may give Lesser Harpies access."""
    found = Talons(Troupe(client_for, session))
    ok(found.setting(True))
    return found


def told_path(court: Talons) -> str:
    return f"/troupes/{court.troupe.id}/boon-reports-told"


def choose(court: Talons, person: Person, role: str, on: bool) -> Any:
    return person.client.put(told_path(court), json={"on": on, "role": role})


def words(person: Person) -> list[dict[str, Any]]:
    """The word of reported boons in the person's bell."""
    items = ok(person.client.get("/notifications"))["items"]
    return [n for n in items if n["kind"] == "boon.reported"]


def test_staff_are_told_only_once_they_ask(court: Talons) -> None:
    storyteller, assistant = court.troupe.storyteller, court.troupe.assistant
    assert ok(storyteller.client.get(told_path(court))) == {"staff": False, "keeper": None}
    hold(court)
    report(court, court.agnes, court.troupe.player, court.bram)
    assert words(storyteller) == []
    assert words(assistant) == []

    assert ok(choose(court, storyteller, "staff", True)) == {"staff": True, "keeper": None}
    report(court, court.bram, court.other, court.agnes)

    [word] = words(storyteller)
    assert word["summary"] == (
        "Bram reported a minor boon to the ledger: Bram owes Agnes (3 Oct 2026). It waits for"
        " review."
    )
    assert word["link"] == f"/troupes/{court.troupe.id}/boons/review"
    # The choice is the storyteller's own: the assistant storyteller still isn't told.
    assert words(assistant) == []
    assert ok(assistant.client.get(told_path(court)))["staff"] is False
    # Only running staff choose it as staff.
    assert choose(court, court.troupe.player, "staff", True).status_code == 403
    assert ok(court.troupe.player.client.get(told_path(court))) == {
        "staff": None,
        "keeper": None,
    }

    ok(choose(court, storyteller, "staff", False))
    report(court, court.agnes, court.troupe.player, court.bram, kind="trivial")
    assert len(words(storyteller)) == 1


def test_staff_told_of_a_boon_that_went_straight_in_open_the_ledger(court: Talons) -> None:
    ok(choose(court, court.troupe.assistant, "staff", True))
    report(court, court.agnes, court.troupe.player, court.bram)

    [word] = words(court.troupe.assistant)
    assert word["link"] == f"/troupes/{court.troupe.id}/boons"


def test_the_harpy_is_told_until_they_turn_it_off(court: Talons) -> None:
    harpy = court.harpy_player
    assert ok(harpy.client.get(told_path(court))) == {"staff": None, "keeper": True}
    hold(court)
    report(court, court.agnes, court.troupe.player, court.bram)
    assert [w["link"] for w in words(harpy)] == [f"/play/characters/{court.hestia}/ledger/review"]
    # The Harpy isn't staff, and a storyteller has no Harpy to choose for.
    assert choose(court, harpy, "staff", False).status_code == 403
    assert choose(court, court.troupe.storyteller, "keeper", False).status_code == 403

    assert ok(choose(court, harpy, "keeper", False))["keeper"] is False
    report(court, court.bram, court.other, court.agnes)

    assert len(words(harpy)) == 1


def test_a_new_harpy_starts_told(court: Talons) -> None:
    harpy = court.harpy_player
    ok(choose(court, harpy, "keeper", False))
    court.give_title(court.hestia, [])
    court.give_title(court.hestia, ["Harpy"])

    assert ok(harpy.client.get(told_path(court)))["keeper"] is True
    report(court, court.agnes, court.troupe.player, court.bram)
    assert len(words(harpy)) == 1


def test_a_lesser_harpy_who_approves_reported_boons_is_told(court: Talons) -> None:
    iris, hugo = court.iris_player, court.hugo_player
    ok(court.give(court.iris, can_review=True))
    ok(court.give(court.hugo, can_add=True, can_settle=True))
    assert ok(iris.client.get(told_path(court)))["keeper"] is True
    # One who may not approve them is never told, and has nothing to choose.
    assert ok(hugo.client.get(told_path(court)))["keeper"] is None
    assert choose(court, hugo, "keeper", True).status_code == 403
    hold(court)

    report(court, court.agnes, court.troupe.player, court.bram)

    assert [w["link"] for w in words(iris)] == [f"/play/characters/{court.iris}/ledger/review"]
    assert words(hugo) == []

    ok(choose(court, iris, "keeper", False))
    report(court, court.bram, court.other, court.agnes)
    assert len(words(iris)) == 1
    # The Harpy's own choice is apart from theirs.
    assert len(words(court.harpy_player)) == 2


def test_a_lesser_harpy_starts_told_again_when_given_access_or_the_right(court: Talons) -> None:
    iris = court.iris_player
    ok(court.give(court.iris, can_review=True))
    ok(choose(court, iris, "keeper", False))
    # A change that keeps the right keeps their choice.
    ok(court.give(court.iris, can_review=True, can_add=True))
    assert ok(iris.client.get(told_path(court)))["keeper"] is False

    ok(court.give(court.iris, can_add=True))
    ok(court.give(court.iris, can_review=True))
    assert ok(iris.client.get(told_path(court)))["keeper"] is True

    ok(choose(court, iris, "keeper", False))
    ok(court.harpy_player.client.delete(f"{court.talons}/{court.iris}"))
    ok(court.give(court.iris, can_review=True))
    assert ok(iris.client.get(told_path(court)))["keeper"] is True


def test_someone_both_harpy_and_staff_is_told_once(court: Talons) -> None:
    """The lead storyteller plays a second Harpy, and asked to be told as staff too."""
    lead = court.troupe.lead
    livia = at_home(court.troupe, lead, "Livia", "Ventrue")
    court.give_title(livia, ["Harpy"])
    ok(choose(court, lead, "staff", True))
    assert ok(lead.client.get(told_path(court))) == {"staff": True, "keeper": True}
    hold(court)

    report(court, court.agnes, court.troupe.player, court.bram)

    assert [w["link"] for w in words(lead)] == [f"/play/characters/{livia}/ledger/review"]
