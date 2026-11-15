"""The boon ledger's totals (#977): the whole ledger counted beside each page, whatever
the search, for the strip above the table: how many boons in each view, and the open
ones by kind. They match the standings' and the statistics' for the same troupe, and
for a Harpy go by what the court knows (horatio.court_knows)."""

from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from horatio.boons import KINDS
from tests.api_helpers import Person, Troupe
from tests.test_api_boon_harpy import hold, ok, report
from tests.test_api_boon_harpy_standings import Gone
from tests.test_api_boon_paging import seed


@pytest.fixture
def gone(client_for: Callable[[], TestClient], session: Session) -> Gone:
    return Gone(Troupe(client_for, session))


def the_same_as_the_statistics(gone: Gone, totals: dict[str, Any], by: Person | None) -> None:
    """`totals` are what the standings and the statistics say of the same ledger, as
    `by` reads them."""
    views = totals["views"]
    kinds = {k["kind"]: k["count"] for k in totals["open_by_kind"]}
    # Every kind, lightest first, none left out for having no boons.
    assert list(kinds) == list(KINDS)

    standings = ok(gone.standings(by=by))
    assert {v: views[v] for v in ("open", "departed", "settled", "pending")} == {
        v: standings["totals"][v] for v in ("open", "departed", "settled", "pending")
    }
    assert kinds == {line["kind"]: line["count"] for line in standings["by_kind"]}

    # Open debt over time, by kind: what stands at the end of this month.
    active = ok(gone.statistics(by=by))
    month = max(m["month"] for m in active["by_entered"])
    assert kinds == {m["kind"]: m["open"] for m in active["by_entered"] if m["month"] == month}
    # Who owes whom: every open boon between two parties in play.
    assert sum(link["count"] for link in active["links"]) == views["open"]

    # With everyone, the departed boons are owed too, and every settling is counted.
    everyone = ok(gone.statistics(by=by, scope="everyone"))
    assert sum(link["count"] for link in everyone["links"]) == views["open"] + views["departed"]
    assert sum(m["settled"] for m in everyone["by_entered"]) == views["settled"]


def test_the_totals_count_the_whole_ledger_as_the_statistics_do(
    gone: Gone, session: Session
) -> None:
    ok(gone.access("full"))
    hold(gone)
    report(gone, gone.agnes, gone.troupe.player, gone.bram)
    gone.leave_three_ways()
    seed(gone, session, count=400)

    whole = gone.ledger("open")
    totals = whole["totals"]
    assert totals["views"] == whole["counts"]
    assert totals["views"]["pending"] == 1
    assert all(totals["views"][v] > 0 for v in ("open", "departed", "settled", "void"))
    the_same_as_the_statistics(gone, totals, None)

    # A search, kinds or another view narrow the page and its counts, never the totals.
    narrowed = gone.ledger("settled", q="cosima", kind=["minor"])
    assert narrowed["counts"]["all"] < whole["counts"]["all"]
    assert narrowed["totals"] == totals


def test_a_harpy_s_totals_go_by_what_the_court_knows(gone: Gone, session: Session) -> None:
    ok(gone.option("full", True))
    gone.leave_three_ways()
    seed(gone, session, count=400)
    harpy = gone.harpy_player

    theirs = gone.ledger("open", by=harpy)["totals"]
    staff = gone.ledger("open")["totals"]

    # Staff know of Cosima's Final Death, which the court hasn't heard of, and the court
    # knows Bram is gone, without why: the same boons, split another way.
    assert theirs["views"]["open"] != staff["views"]["open"]
    assert theirs["views"]["all"] == staff["views"]["all"]
    assert theirs["views"]["open"] + theirs["views"]["departed"] == (
        staff["views"]["open"] + staff["views"]["departed"]
    )
    the_same_as_the_statistics(gone, theirs, harpy)
