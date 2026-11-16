"""Stock NPCs carry equipment (issue #1043): their home troupe's staff give them
items, take them back and move them to other characters, as for any NPC; a player
can't. A Stock NPC has no traits for an item to act on, so its test pool (rating
× 2, MET: VTM p. 490) stays as it is, and its Play View lists what it carries."""

import uuid
from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.api_helpers import Troupe
from tests.test_api_downtimes import member_character
from tests.test_api_equipment_passing import discard, equipment_of, give_to, history, names
from tests.test_api_play import send, tap, view
from tests.test_api_play_stock import stock_npc
from tests.test_api_renames import character_log
from tests.test_api_troupe_equipment import DAGGER, RIFLE, give, given, listed, path


@pytest.fixture
def troupe(client_for: Callable[[], TestClient], session: Session) -> Troupe:
    return Troupe(client_for, session)


def test_staff_give_a_stock_npc_an_item_take_it_back_and_move_another(troupe: Troupe) -> None:
    wolf = stock_npc(troupe, "werewolf", 3)
    agnes = member_character(troupe, troupe.player, "Agnes")

    dagger = given(troupe, wolf, **DAGGER)
    rifle = given(troupe, wolf, **RIFLE)

    assert (dagger["character_name"], dagger["character_kind"]) == ("Bites-the-Hand", "npc")
    # The troupe's tab links the holder to its Stock NPC page by this.
    assert dagger["character_npc_form"] == "stock"
    assert dagger["facts"]["aggravated_against"] == ["werewolves and others vulnerable to silver"]
    held = equipment_of(troupe.storyteller, wolf)
    assert [i["name"] for i in held["items"]] == ["Hunting rifle", "Silver Dagger"]
    assert held["can_give"] is True
    assert held["can_pass"] is True
    # The troupe's tab lists it among the characters to give to, and its items.
    holders = troupe.storyteller.client.get(path(troupe)).json()["characters"]
    assert ("Bites-the-Hand", "npc") in [(c["name"], c["kind"]) for c in holders]
    assert {i["character_name"] for i in listed(troupe)} == {"Bites-the-Hand"}
    assert character_log(troupe.storyteller, wolf)[0] == (
        "storyteller gave Bites-the-Hand Hunting rifle (ranged weapon: Accurate, Long Range)."
    )
    # Its printed sheet lists them, as anyone's does.
    printed = troupe.storyteller.client.get(
        f"/troupes/{troupe.id}/print", params={"characters": [wolf]}
    )
    assert printed.status_code == 200, printed.text
    assert [i["name"] for i in printed.json()[0]["equipment"]] == ["Hunting rifle", "Silver Dagger"]

    taken = troupe.storyteller.client.post(
        f"{path(troupe)}/{dagger['id']}/take-back", json={"reason": "Lost in the fight"}
    )
    assert taken.status_code == 200, taken.text
    assert taken.json()["history"][-1]["summary"] == "Taken back from Bites-the-Hand"

    moved = give_to(troupe.storyteller, wolf, rifle, agnes, "Looted")
    assert moved.status_code == 200, moved.text
    assert names(troupe.storyteller, wolf) == []
    assert names(troupe.player, agnes) == ["Hunting rifle"]
    assert history(troupe, rifle)[-1] == ("Given by Bites-the-Hand to Agnes", "Looted")

    # And back again, from the troupe's staff.
    back = give_to(troupe.storyteller, agnes, rifle, wolf)
    assert back.status_code == 200, back.text
    assert names(troupe.storyteller, wolf) == ["Hunting rifle"]


def test_a_player_neither_gives_a_stock_npc_an_item_nor_takes_one(troupe: Troupe) -> None:
    wolf = stock_npc(troupe, "werewolf", 3)
    agnes = member_character(troupe, troupe.player, "Agnes")
    rifle = given(troupe, wolf, **RIFLE)
    dagger = given(troupe, agnes, **DAGGER)

    assert give(troupe, wolf, by=troupe.player, **DAGGER).status_code == 403
    # A player gives only to PCs and titled NPCs.
    refused = give_to(troupe.player, agnes, dagger, wolf)
    assert refused.status_code == 422
    assert "A player gives equipment to" in refused.json()["detail"]
    # Nor gives or discards the Stock NPC's own, nor takes it back.
    assert give_to(troupe.player, wolf, rifle, agnes).status_code in (403, 404)
    assert discard(troupe.player, wolf, rifle).status_code in (403, 404)
    taken = troupe.player.client.post(
        f"{path(troupe)}/{rifle['id']}/take-back", json={"reason": "Mine"}
    )
    assert taken.status_code == 403
    assert names(troupe.storyteller, wolf) == ["Hunting rifle"]


def test_its_play_view_lists_what_it_carries_and_its_pool_stays(troupe: Troupe) -> None:
    wolf = stock_npc(troupe, "werewolf", 3)
    before = view(troupe.storyteller, wolf)
    assert before["stock_items"] == []
    given(troupe, wolf, **DAGGER, staff_note="Stolen")
    given(troupe, wolf, **RIFLE)

    after = view(troupe.storyteller, wolf)
    # The book's sample Stock NPCs list equipment beside a pool of rating x 2 (Vol. 2
    # pp. 319-325): the stat block doesn't change.
    assert after["stock"]["stats"] == before["stock"]["stats"]
    assert after["stock"]["stats"]["pool"] == 6
    carried = {i["name"]: i for i in after["stock_items"]}
    assert sorted(carried) == ["Hunting rifle", "Silver Dagger"]
    assert carried["Hunting rifle"]["facts"]["damage"] == 2
    assert [q["play"] for q in carried["Hunting rifle"]["qualities"]][0]
    assert carried["Silver Dagger"]["facts"]["aggravated_against"] == [
        "werewolves and others vulnerable to silver"
    ]
    # Kept on phones with the Play View: no staff note.
    assert carried["Silver Dagger"]["staff_note"] is None
    # A sheeted character's items are its Equipment tab's, not here.
    agnes = member_character(troupe, troupe.player, "Agnes")
    given(troupe, agnes, **DAGGER)
    assert view(troupe.player, agnes)["stock_items"] == []


def test_a_stock_npc_discards_an_item_from_its_play_view_with_undo(troupe: Troupe) -> None:
    wolf = stock_npc(troupe, "werewolf", 3)
    rifle = given(troupe, wolf, **RIFLE)
    dropped = tap(f"item:{rifle['id']}", -1, at=1)

    state = send(troupe.storyteller, wolf, dropped)
    assert state["log"][0]["text"] == "Discarded Hunting rifle"
    assert state["stock_items"] == []
    assert names(troupe.storyteller, wolf) == []

    undo = {
        "id": str(uuid.uuid4()),
        "happened_at": tap(at=2)["happened_at"],
        "kind": "undo",
        "undoes": dropped["id"],
    }
    undone = send(troupe.storyteller, wolf, undo)
    assert [i["name"] for i in undone["stock_items"]] == ["Hunting rifle"]
