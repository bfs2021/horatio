"""The boon ledger a page at a time (#978): `limit` and `offset`, `total` beside the
views' counts, a stable order across pages (ties broken by id), the search, kinds,
flags and sorts done in the database, and a Harpy's pages following what the court
knows (horatio.court_knows). Seeded with 5,000 boons, as a real troupe's sheet holds."""

import time
import uuid
from collections.abc import Callable, Iterator
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import insert
from sqlalchemy.orm import Session

import horatio.api.boons as boons_api
from horatio.boons import KINDS
from horatio.models import Boon
from tests.api_helpers import Person, Troupe
from tests.test_api_boon_harpy import ok
from tests.test_api_boon_harpy_standings import Gone
from tests.test_api_boons import named, row

SEEDED = 5000


@pytest.fixture
def gone(client_for: Callable[[], TestClient], session: Session) -> Gone:
    return Gone(Troupe(client_for, session))


def seed(gone: Gone, session: Session, count: int = SEEDED) -> None:
    """`count` boons among the Court's characters and two names only, over forty nights,
    so many share a night: one in ten settled, one in ten void, the rest standing."""
    characters = (gone.agnes, gone.bram, gone.cosima, gone.dario, gone.vidal)
    sides: list[tuple[uuid.UUID | None, str]] = [(uuid.UUID(c), "") for c in characters]
    sides += [(None, "Grove"), (None, "Ottilie")]
    kinds = list(KINDS)
    rows: list[dict[str, Any]] = []
    for i in range(count):
        debtor = sides[i % len(sides)]
        creditor = sides[(i // len(sides) + i + 1) % len(sides)]
        if creditor == debtor:
            creditor = sides[(sides.index(debtor) + 1) % len(sides)]
        state = "settled" if i % 10 == 0 else "void" if i % 10 == 1 else "registered"
        rows.append(
            {
                "troupe_id": uuid.UUID(gone.troupe.id),
                "debtor_id": debtor[0],
                "debtor_name": debtor[1],
                "creditor_id": creditor[0],
                "creditor_name": creditor[1],
                "kind": kinds[i % len(kinds)],
                "made_on": date(2026, 1, 1) + timedelta(days=i % 40),
                "reason": f"Favour {i}",
                "conditions": "",
                "state": state,
                "settled_how": "forgiven" if state == "settled" else None,
                "closed_at": datetime.now(UTC) if state != "registered" else None,
            }
        )
    session.execute(insert(Boon), rows)


def pages(gone: Gone, view: str, by: Person | None = None, **query: Any) -> Iterator[Any]:
    """Every page of the view, 500 boons at a time."""
    offset = 0
    while True:
        found = gone.ledger(view, by=by, limit=500, offset=offset, **query)
        yield found
        offset += 500
        if offset >= found["total"]:
            return


def every(gone: Gone, view: str, by: Person | None = None, **query: Any) -> list[Any]:
    found = [b for p in pages(gone, view, by, **query) for b in p["boons"]]
    assert len({b["id"] for b in found}) == len(found), "a boon on two pages"
    return found


def names(boon: dict[str, Any]) -> set[str]:
    return {boon["debtor"]["name"], boon["creditor"]["name"]}


def test_the_ledger_pages_its_boons_in_a_stable_order(
    gone: Gone, session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    seed(gone, session)
    built = 0
    original = boons_api.boon_out

    def counted(*args: Any, **kwargs: Any) -> Any:
        nonlocal built
        built += 1
        return original(*args, **kwargs)

    monkeypatch.setattr(boons_api, "boon_out", counted)
    started = time.perf_counter()
    first = gone.ledger("open")
    print(f"\nfirst page of {first['total']} open boons: {time.perf_counter() - started:.3f}s")

    # A hundred by default, and only those are built.
    assert len(first["boons"]) == 100
    assert built == 100
    whole = SEEDED + 3
    assert first["counts"]["all"] == whole
    assert first["total"] == first["counts"]["open"]
    assert first["counts"]["settled"] == SEEDED // 10
    assert first["counts"]["void"] == SEEDED // 10
    assert "characters" not in first
    assert len(gone.ledger("all", limit=500)["boons"]) == 500
    started = time.perf_counter()
    last = gone.ledger("all", limit=100, offset=whole - 3)
    print(f"last page of all: {time.perf_counter() - started:.3f}s")
    assert last["total"] == whole
    assert len(last["boons"]) == 3
    assert gone.ledger("all", offset=whole)["boons"] == []
    for limit in (0, 501):
        refused = gone.troupe.storyteller.client.get(gone.path, params={"limit": limit})
        assert refused.status_code == 422, refused.text

    # Newest first, every boon once across the pages, ties broken by id.
    found = every(gone, "all")
    assert len(found) == whole
    keys = [(b["made_on"], b["submitted_at"], uuid.UUID(b["id"])) for b in found]
    assert keys == sorted(keys, reverse=True)
    # Forty nights seeded, and the night of the three registered first.
    assert len({b["made_on"] for b in found}) == 41
    oldest = every(gone, "all", direction="asc")
    assert [b["id"] for b in oldest] == [b["id"] for b in reversed(found)]

    # By kind, trivial to life; alike, newest first, then by id.
    weight = {k: i for i, k in enumerate(KINDS)}
    by_kind = every(gone, "settled", sort="kind")
    assert len(by_kind) == SEEDED // 10
    keys = [(-weight[b["kind"]], b["made_on"], uuid.UUID(b["id"])) for b in by_kind]
    assert keys == sorted(keys, reverse=True)

    # By either side's name, a character's or a name only.
    by_debtor = every(gone, "void", sort="debtor", direction="desc")
    debtors = [b["debtor"]["name"].casefold() for b in by_debtor]
    assert debtors == sorted(debtors, reverse=True)
    assert {"grove", "agnes"} <= set(debtors)
    creditors = [b["creditor"]["name"].casefold() for b in every(gone, "void", sort="creditor")]
    assert creditors == sorted(creditors)


def test_a_harpy_s_pages_never_hold_what_the_court_doesn_t_know(
    gone: Gone, session: Session
) -> None:
    ok(gone.access("full"))
    gone.leave_three_ways()
    seed(gone, session)
    harpy = gone.harpy_player

    theirs = every(gone, "open", by=harpy)
    staff = every(gone, "open")

    # The court knows Bram and Dario are gone, not Cosima: her boons stay open to them.
    assert not any(names(b) & {"Bram", "Dario"} for b in theirs)
    assert any("Cosima" in names(b) for b in theirs)
    # Staff know Cosima's Final Death; Bram's player stopping says nothing in game.
    assert not any(names(b) & {"Cosima", "Dario"} for b in staff)
    assert any("Bram" in names(b) for b in staff)
    assert all(b["departed"] is False for b in theirs)
    assert "inactive" not in str(theirs)
    departed = every(gone, "departed", by=harpy)
    assert all(names(b) & {"Bram", "Dario"} for b in departed)
    counts = gone.ledger("open", by=harpy)["counts"]
    assert (counts["open"], counts["departed"]) == (len(theirs), len(departed))
    assert counts["all"] == gone.ledger("open")["counts"]["all"]


def test_the_ledger_searches_names_reasons_and_conditions(gone: Gone) -> None:
    ok(gone.access("full"))
    harpy = gone.harpy_player
    grove = gone.one(
        named("Grove of Thorns"),
        gone.agnes,
        reason="Silence at Elysium",
        conditions="Cannot be traded",
        staff_note="Plot hook",
        made_on="2026-10-10",
    )
    under = gone.one(gone.vidal, gone.cosima, kind="blood", reason="50% of a_haven")

    def found(q: str, by: Person | None = None, **query: Any) -> list[str]:
        return [b["id"] for b in gone.ledger("all", by=by, q=q, **query)["boons"]]

    for by in (None, harpy):
        # A name only, any part, ignoring case; a character's name; the reason; the conditions.
        assert found("thorns", by) == [grove["id"]]
        assert found("AGNES", by)[0] == grove["id"]
        assert set(found("agn", by)) == {grove["id"], *(b["id"] for b in agnes_s(gone))}
        assert found("elysium", by) == [grove["id"]]
        assert found("traded", by) == [grove["id"]]
        # Never the staff note, which a Harpy doesn't see.
        assert found("plot hook", by) == []
        # % and _ are only themselves.
        assert found("50%", by) == [under["id"]]
        assert found("a_h", by) == [under["id"]]
        assert found("%", by) == [under["id"]]
    narrowed = gone.ledger("open", q="cosima")
    assert narrowed["total"] == narrowed["counts"]["open"] == 2
    assert narrowed["counts"]["all"] == 2


def agnes_s(gone: Gone) -> list[Any]:
    return [b for b in gone.ledger("all")["boons"] if "Agnes" in names(b)]


def test_the_ledger_narrows_to_kinds_flags_and_a_game(gone: Gone) -> None:
    trivial = gone.one(gone.agnes, gone.bram, kind="trivial")
    major = gone.one(gone.agnes, gone.bram, kind="major", reason="Shelter")
    ok(
        gone.troupe.storyteller.client.post(
            f"{gone.path}/{trivial['id']}/flags", json={"note": "Check the night"}
        ),
        201,
    )

    kinds = gone.ledger("all", kind=["trivial", "major"], character_id=gone.agnes)
    # Cosima's major boon to Agnes too.
    assert sorted(b["kind"] for b in kinds["boons"]) == ["major", "major", "trivial"]
    assert kinds["total"] == 3
    raised = gone.ledger("all", flagged=True)
    assert [b["id"] for b in raised["boons"]] == [trivial["id"]]
    assert raised["boons"][0]["flagged"] is True
    assert raised["counts"]["all"] == 1
    assert gone.ledger("all", game_id=str(uuid.uuid4()))["total"] == 0
    assert major["id"] in {b["id"] for b in gone.ledger("all", sort="kind")["boons"]}


def test_the_characters_to_name_are_read_once_apart_from_the_pages(gone: Gone) -> None:
    ok(gone.access("full"))
    assert {"Agnes", "Bram", "Vidal"} <= gone.choices()
    assert "Vidal" not in gone.choices(by=gone.harpy_player)
    refused = gone.troupe.player.client.get(f"/troupes/{gone.troupe.id}/boon-characters")
    assert refused.status_code in (403, 404)


def test_registered_in_one_go_they_still_page_by_id(gone: Gone) -> None:
    made = gone.register(*(row(gone.agnes, named(f"Guest {i}")) for i in range(5)))
    assert made.status_code == 201, made.text
    ids = [b["id"] for p in range(4) for b in gone.ledger("all", limit=2, offset=p * 2)["boons"]]
    assert len(set(ids)) == len(ids) == 8
