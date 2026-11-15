"""Exporting the boon ledger (#986, horatio.boon_export): its boons, or those in one view
narrowed as the ledger narrows them, as a CSV file or a spreadsheet, for the troupe's
running staff. Each export goes in the troupe's log."""

import uuid
from dataclasses import replace
from datetime import UTC, date, datetime
from typing import Annotated, Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from horatio import audit, boon_export, boon_ledger, boons, preferences
from horatio.api.boons import Kind, Order, Sort, View, characters_of, users_of
from horatio.api.downtimes import staff_troupe
from horatio.auth.deps import CurrentUser, DbSession
from horatio.models import Boon, ScheduledGame, Troupe, User
from horatio.permissions import TroupeAction

router = APIRouter(tags=["boons"])

Format = Literal["csv", "xlsx"]
# How the log names each format.
FORMAT_NAMES = {"csv": "a CSV file", "xlsx": "a spreadsheet"}


def zone_of(user: User) -> ZoneInfo:
    try:
        return ZoneInfo(preferences.read(user).time_zone or "UTC")
    except (KeyError, ValueError):
        return ZoneInfo("UTC")


def chosen(
    db: DbSession, troupe: Troupe, view: str, filters: boon_ledger.Filters, sort: str, order: str
) -> list[Boon]:
    """The troupe's boons in the view, narrowed and sorted as the ledger's list has them
    (horatio.boon_ledger, #978), every page of it at once. Staff see who has left as it
    is, not as the court knows it."""
    where = boon_ledger.narrowing(troupe.id, filters)
    left = boon_ledger.gone(db, troupe.id)
    query = select(Boon).where(*where, boon_ledger.in_view(view, left))
    return list(db.scalars(boon_ledger.ordered(query, sort, order)))


@router.get(
    "/troupes/{troupe_id}/boon-export",
    response_class=Response,
    responses={
        200: {
            "content": {
                media: {"schema": {"type": "string", "format": "binary"}}
                for _, media in boon_export.FORMATS.values()
            }
        }
    },
)
def export_boons(
    troupe_id: uuid.UUID,
    db: DbSession,
    user: CurrentUser,
    file_format: Annotated[Format, Query(alias="format")] = "csv",
    view: View = "all",
    character_id: uuid.UUID | None = None,
    name: str = "",
    q: Annotated[str, Query(max_length=boons.LONGEST_NAME)] = "",
    kind: Annotated[list[Kind] | None, Query()] = None,
    made_from: date | None = None,
    made_to: date | None = None,
    flagged: bool = False,
    game_id: uuid.UUID | None = None,
    sort: Sort = "date",
    direction: Order | None = None,
) -> Response:
    """For the troupe's storytellers and assistant storytellers: its boon ledger as a
    CSV file or a spreadsheet, newest first. With no view or filters, every boon;
    otherwise those in the view (open, departed, settled, void, pending or all),
    narrowed and sorted as the ledger's list has them (horatio.api.boons.troupe_boons,
    #978): to a character or a name, a search (`q`), some kinds, the nights between
    two dates, the flagged, or a game; by date, debtor, creditor or kind. Every page
    at once. The export goes in the troupe's log."""
    troupe = staff_troupe(db, user, troupe_id, TroupeAction.MANAGE_BOONS)
    if not boons.can_manage(db, user, troupe) or not boons.tracked(troupe):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This troupe doesn't keep a boon ledger.")
    filters = boon_ledger.Filters(
        character_id=character_id,
        name=name.strip(),
        q=q.strip(),
        kinds=kind or (),
        made_from=made_from,
        made_to=made_to,
        flagged=flagged,
        game_id=game_id,
    )
    order = direction or ("desc" if sort == "date" else "asc")
    found = chosen(db, troupe, view, filters, sort, order)
    games = {b.game_id for b in found} - {None}
    zone = zone_of(user)
    known = boon_export.Known(
        characters=characters_of(db, found),
        users=users_of(db, (b.submitted_by for b in found)),
        flags=boon_export.flags_of(db, (b.id for b in found)),
        games={
            g.id: g.starts_at
            for g in db.scalars(select(ScheduledGame).where(ScheduledGame.id.in_(games)))
        }
        if games
        else {},
        zone=zone,
    )
    rows = [boon_export.row(b, known, staff=True) for b in found]
    # Narrowed by anything at all: kinds are a list, so compared on their own.
    filtered = view != "all" or bool(kind) or replace(filters, kinds=()) != boon_ledger.Filters()
    audit.record(
        db,
        user,
        "boon.exported",
        troupe_id=troupe.id,
        count=len(rows),
        format=FORMAT_NAMES[file_format],
        filtered=filtered,
        what="part of the boon ledger" if filtered else "the whole boon ledger",
        shown=f"{len(rows)} boon{'' if len(rows) == 1 else 's'}",
    )
    db.commit()
    today = datetime.now(UTC).astimezone(zone).date()
    headers = {
        "Content-Disposition": "attachment; filename="
        f'"{boon_export.file_name(troupe.name, today, file_format)}"'
    }
    media = boon_export.FORMATS[file_format][1]
    if file_format == "csv":
        return StreamingResponse(
            boon_export.csv_lines(rows, staff=True), media_type=media, headers=headers
        )
    return Response(boon_export.workbook(rows, staff=True), media_type=media, headers=headers)
