"""Reading the boon ledger a page at a time (#978): its views, narrowed by filters and a
search, in an order, counted, all in the database.

A troupe's ledger can hold thousands of boons, so the list never loads them all: the
filters, the search, the view and the order are SQL, and only one page of boons is
read whole. The one thing SQL can't answer alone is who has left play, which for a
Harpy (#688) depends on what the court knows (horatio.court_knows). That is read
first, as the few characters on the troupe's boons who are gone (`gone`), and the
views then ask only whether a boon names one of them.

The views (horatio.boons.VIEWS): open, standing with both parties still in play;
departed, standing but naming someone gone; settled; void; pending; or all.
"""

import uuid
from collections.abc import Collection
from dataclasses import dataclass
from datetime import date

from sqlalchemy import ColumnElement, Select, and_, case, false, func, not_, or_, select, true
from sqlalchemy.orm import Session, aliased

from horatio import boons
from horatio.models import Boon, BoonFlag, Character

# What the ledger sorts by: the night it was made (newest first by default), either
# side's name, or its kind by weight, trivial to life.
SORTS = ("date", "debtor", "creditor", "kind")
DIRECTIONS = ("asc", "desc")
# A page of the ledger: as many boons as asked for, at most `LONGEST_PAGE`.
PAGE = 100
LONGEST_PAGE = 500


@dataclass(frozen=True)
class Filters:
    """What narrows the ledger, before its view. Empty, nothing does.

    - `character_id`: boons the character is on, either side;
    - `name`: boons a name only is on, either side, the whole name, ignoring case;
    - `q`: boons whose debtor's or creditor's name (a character's or a name only),
      reason or conditions hold the text, ignoring case: never the staff note, which a
      Harpy doesn't see;
    - `kinds`: of any of these kinds;
    - `made_from`, `made_to`: made on or after, on or before these nights;
    - `flagged`: with a flag still raised for review (#687);
    - `game_id`: registered at this game (#702).
    """

    character_id: uuid.UUID | None = None
    name: str = ""
    q: str = ""
    kinds: Collection[str] = ()
    made_from: date | None = None
    made_to: date | None = None
    flagged: bool = False
    game_id: uuid.UUID | None = None


def narrowing(troupe_id: uuid.UUID, filters: Filters) -> list[ColumnElement[bool]]:
    """The troupe's boons that pass the filters, as conditions on Boon."""
    f = filters
    found: list[ColumnElement[bool]] = [Boon.troupe_id == troupe_id]
    if f.character_id is not None:
        found.append(or_(Boon.debtor_id == f.character_id, Boon.creditor_id == f.character_id))
    name = f.name.strip().lower()
    if name:
        found.append(
            or_(func.lower(Boon.debtor_name) == name, func.lower(Boon.creditor_name) == name)
        )
    text = f.q.strip()
    if text:
        found.append(holding(text))
    if f.kinds:
        found.append(Boon.kind.in_(list(f.kinds)))
    if f.made_from is not None:
        found.append(Boon.made_on >= f.made_from)
    if f.made_to is not None:
        found.append(Boon.made_on <= f.made_to)
    if f.flagged:
        raised = select(BoonFlag.boon_id).where(BoonFlag.cleared_at.is_(None))
        found.append(Boon.id.in_(raised))
    if f.game_id is not None:
        found.append(Boon.game_id == f.game_id)
    return found


def holding(text: str) -> ColumnElement[bool]:
    """Boons whose names, reason or conditions hold `text`, ignoring case. `%` and `_`
    in it are only themselves."""
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    pattern = f"%{escaped}%"
    characters = select(Character.id).where(Character.name.ilike(pattern, escape="\\"))
    return or_(
        Boon.debtor_name.ilike(pattern, escape="\\"),
        Boon.creditor_name.ilike(pattern, escape="\\"),
        Boon.debtor_id.in_(characters),
        Boon.creditor_id.in_(characters),
        Boon.reason.ilike(pattern, escape="\\"),
        Boon.conditions.ilike(pattern, escape="\\"),
    )


def gone(
    db: Session, troupe_id: uuid.UUID, court: Collection[uuid.UUID] | None = None
) -> frozenset[uuid.UUID]:
    """The characters on the troupe's boons who are gone from play: dead or off-field
    (horatio.boons.departed), or, with `court`, for a Harpy, as the court knows it.
    Only retired characters can be, so only they are read."""
    named = (
        select(Boon.debtor_id)
        .where(Boon.troupe_id == troupe_id)
        .union(select(Boon.creditor_id).where(Boon.troupe_id == troupe_id))
    )
    retired = db.scalars(
        select(Character).where(Character.status == "retired", Character.id.in_(named))
    )
    return frozenset(c.id for c in retired if boons.departed(c, court))


def naming(left: frozenset[uuid.UUID]) -> ColumnElement[bool]:
    """Boons that name one of these characters, either side."""
    if not left:
        return false()
    return or_(
        and_(Boon.debtor_id.is_not(None), Boon.debtor_id.in_(left)),
        and_(Boon.creditor_id.is_not(None), Boon.creditor_id.in_(left)),
    )


def in_view(view: str, left: frozenset[uuid.UUID]) -> ColumnElement[bool]:
    """The boons in one of the ledger's views, given who is `gone`."""
    if view == "all":
        return true()
    if view not in ("open", "departed"):
        return Boon.state == view
    named = naming(left)
    return and_(Boon.state == "registered", named if view == "departed" else not_(named))


def counts(
    db: Session, where: list[ColumnElement[bool]], left: frozenset[uuid.UUID]
) -> dict[str, int]:
    """How many of the boons are in each view, in one query."""
    found: dict[str, int] = dict.fromkeys(boons.VIEWS, 0)
    rows = db.execute(
        select(Boon.state, func.count(), func.count().filter(naming(left)))
        .where(*where)
        .group_by(Boon.state)
    )
    for state, every, departed in rows:
        if state == "registered":
            found["open"] += every - departed
            found["departed"] += departed
        else:
            found[state] += every
        found["all"] += every
    return found


def ordered(query: Select[Boon], sort: str, direction: str) -> Select[Boon]:
    """The boons in order: by `sort` (one of `SORTS`), `direction` ("asc" or "desc").
    Boons alike on that come newest first, then by id, so pages never overlap."""
    newest = (Boon.made_on.desc(), Boon.created_at.desc(), Boon.id.desc())
    if sort == "date":
        if direction == "desc":
            return query.order_by(*newest)
        return query.order_by(Boon.made_on, Boon.created_at, Boon.id)
    if sort == "kind":
        weight = case({k: i for i, k in enumerate(boons.KINDS)}, value=Boon.kind)
        key = weight
    else:
        who = aliased(Character)
        column = Boon.debtor_id if sort == "debtor" else Boon.creditor_id
        written = Boon.debtor_name if sort == "debtor" else Boon.creditor_name
        query = query.outerjoin(who, who.id == column)
        key = func.lower(func.coalesce(who.name, written))
    return query.order_by(key.desc() if direction == "desc" else key.asc(), *newest)


def page(
    db: Session,
    where: list[ColumnElement[bool]],
    sort: str = "date",
    direction: str = "desc",
    limit: int = PAGE,
    offset: int = 0,
) -> list[Boon]:
    """One page of the boons, in order."""
    query = ordered(select(Boon).where(*where), sort, direction)
    return list(db.scalars(query.limit(limit).offset(offset)))
