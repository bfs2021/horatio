"""Exporting the boon ledger (#986, horatio.boon_export): its boons, or those in one view
narrowed as the ledger narrows them, as a CSV file or a spreadsheet, for the troupe's
running staff. Each export goes in the troupe's log."""

import uuid
from collections.abc import Iterable
from datetime import UTC, date, datetime
from typing import Annotated, Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from horatio import audit, boon_export, boons, preferences
from horatio.api.boons import Kind, View, characters_of, users_of
from horatio.api.downtimes import staff_troupe
from horatio.auth.deps import CurrentUser, DbSession
from horatio.models import Boon, Character, ScheduledGame, Troupe, User
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
    db: DbSession,
    troupe: Troupe,
    view: str,
    character_id: uuid.UUID | None,
    name: str,
    kinds: Iterable[str],
    made_from: date | None,
    made_to: date | None,
) -> tuple[list[Boon], dict[uuid.UUID, Character]]:
    """The troupe's boons in the view, narrowed as the ledger's list narrows them
    (horatio.api.boons.troupe_boons), newest first; and the characters on them."""
    every = list(
        db.scalars(
            select(Boon)
            .where(Boon.troupe_id == troupe.id)
            .order_by(Boon.made_on.desc(), Boon.created_at.desc(), Boon.id.desc())
        )
    )
    characters = characters_of(db, every)
    wanted = name.strip().casefold()
    of_kinds = set(kinds)

    def matches(b: Boon) -> bool:
        if character_id is not None and character_id not in (b.debtor_id, b.creditor_id):
            return False
        if wanted and wanted not in (b.debtor_name.casefold(), b.creditor_name.casefold()):
            return False
        if of_kinds and b.kind not in of_kinds:
            return False
        if made_from is not None and b.made_on < made_from:
            return False
        return made_to is None or b.made_on <= made_to

    return [b for b in every if matches(b) and boons.in_view(b, characters, view)], characters


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
    kind: Annotated[list[Kind] | None, Query()] = None,
    made_from: date | None = None,
    made_to: date | None = None,
) -> Response:
    """For the troupe's storytellers and assistant storytellers: its boon ledger as a
    CSV file or a spreadsheet, newest first. With no view or filters, every boon;
    otherwise those in the view (open, departed, settled, void, pending or all),
    narrowed as the ledger narrows them: to a character or a name, to some kinds, or
    to the nights between two dates. The export goes in the troupe's log."""
    troupe = staff_troupe(db, user, troupe_id, TroupeAction.MANAGE_BOONS)
    if not boons.can_manage(db, user, troupe) or not boons.tracked(troupe):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This troupe doesn't keep a boon ledger.")
    kinds = kind or []
    found, characters = chosen(db, troupe, view, character_id, name, kinds, made_from, made_to)
    games = {b.game_id for b in found} - {None}
    zone = zone_of(user)
    known = boon_export.Known(
        characters=characters,
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
    filtered = (
        view != "all"
        or character_id is not None
        or bool(name.strip())
        or bool(kinds)
        or made_from is not None
        or made_to is not None
    )
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
