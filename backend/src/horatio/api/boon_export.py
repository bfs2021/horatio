"""Exporting the boon ledger (#986, horatio.boon_export): its boons, or those in one view
narrowed as the ledger narrows them, as a CSV file or a spreadsheet, for the troupe's
running staff; and for its Harpy, as their character, where the troupe lets them, and a
Lesser Harpy the Harpy lets (#987). Each export goes in the troupe's log."""

import uuid
from dataclasses import replace
from datetime import UTC, date, datetime
from typing import Annotated, Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Query, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from horatio import audit, boon_export, boon_ledger, boonbreakers, boons, preferences
from horatio.api.boons import (
    BoonOut,
    BoonPartyOut,
    Kind,
    Order,
    Sort,
    View,
    boon_out,
    characters_of,
    ledger_troupe,
    standing_disgraced,
    users_of,
)
from horatio.auth.deps import CurrentUser, DbSession
from horatio.boon_export import Cell, yes
from horatio.boon_harpy import Keeper
from horatio.models import Boon, ScheduledGame, Troupe, User

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
    keeper: Keeper,
    view: str,
    filters: boon_ledger.Filters,
    sort: str,
    order: str,
) -> list[Boon]:
    """The troupe's boons in the view, narrowed and sorted as the ledger's list has them
    for `keeper` (horatio.boon_ledger, #978), every page of it at once. Staff see who
    has left as it is; a Harpy, as the court knows it."""
    where = boon_ledger.narrowing(troupe.id, filters)
    left = boon_ledger.gone(db, troupe.id, keeper.court)
    query = select(Boon).where(*where, boon_ledger.in_view(view, left))
    return list(db.scalars(boon_ledger.ordered(query, sort, order)))


def row(shown: BoonOut, known: boon_export.Known, game_id: uuid.UUID | None) -> dict[str, Cell]:
    """The boon as one row, by column: made from the boon as the ledger's list gives it
    to the one exporting (`boon_out` with their keeper), so a Harpy's export holds no
    more than their ledger shows them. Pick the columns with boon_export.header."""

    def day(at: datetime | None) -> Cell:
        return at.astimezone(known.zone).date() if at is not None else ""

    def status(party: BoonPartyOut) -> str:
        return boons.STANDINGS.get(party.standing or "", "")

    how = boons.SETTLED.get(shown.settled_how or "", "")
    return {
        "Owed By": shown.debtor.name,
        "Owed To": shown.creditor.name,
        "Type": boons.KINDS.get(shown.kind, shown.kind),
        "Date": shown.made_on,
        "Reason": shown.reason,
        "Stipulation": shown.conditions,
        "State": boons.STATES.get(shown.state, shown.state),
        "Settled": yes(shown.state == "settled"),
        "Settled How": how[:1].upper() + how[1:],
        "Settled Date": day(shown.closed_at),
        "Settled Notes": shown.closed_note,
        "Flag": "; ".join(known.flags.get(shown.id, ())),
        "Debtor Status": status(shown.debtor),
        "Creditor Status": status(shown.creditor),
        "If Traded Tell Debtor": yes(shown.notify_on_trade),
        "Game": day(known.games.get(game_id)) if game_id else "",
        "Registered": day(shown.submitted_at),
        "ID": str(shown.id),
        "Staff Note": shown.staff_note,
        "Entered By": shown.submitted_by or "",
        "Linked Debtor": yes(shown.debtor.character_id is not None),
        "Linked Creditor": yes(shown.creditor.character_id is not None),
    }


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
    CSV file or a spreadsheet, newest first. For its Harpy with the full ledger, where
    the troupe lets them, and a Lesser Harpy the Harpy lets (#987): as their ledger
    shows it to them, without staff's columns or the game. With no view or filters, every boon;
    otherwise those in the view (open, departed, settled, void, pending or all),
    narrowed and sorted as the ledger's list has them (horatio.api.boons.troupe_boons,
    #978): to a character or a name, a search (`q`), some kinds, the nights between
    two dates, the flagged, or a game; by date, debtor, creditor or kind. Every page
    at once. The export goes in the troupe's log."""
    troupe, keeper = ledger_troupe(db, user, troupe_id, "export")
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
    found = chosen(db, troupe, keeper, view, filters, sort, order)
    games = {b.game_id for b in found} - {None} if keeper.staff else set()
    zone = zone_of(user)
    known = boon_export.Known(
        flags=boon_export.flags_of(db, (b.id for b in found)),
        games={
            g.id: g.starts_at
            for g in db.scalars(select(ScheduledGame).where(ScheduledGame.id.in_(games)))
        }
        if games
        else {},
        zone=zone,
    )
    # As the ledger's list has them (horatio.api.boons.troupe_boons).
    characters = characters_of(db, found)
    users = users_of(db, (b.submitted_by for b in found))
    disgraced = standing_disgraced(db, found)
    marks = boonbreakers.marked(db, troupe.id)
    columns = boon_export.header(keeper.staff)
    rows = [
        [cells[c] for c in columns]
        for cells in (
            row(
                boon_out(b, characters, users, disgraced, keeper=keeper, marked=marks),
                known,
                b.game_id,
            )
            for b in found
        )
    ]
    # Narrowed by anything at all: kinds are a list, so compared on their own.
    filtered = view != "all" or bool(kind) or replace(filters, kinds=()) != boon_ledger.Filters()
    audit.record(
        db,
        user,
        "boon.exported",
        troupe_id=troupe.id,
        acting=f" as {keeper.character.name}" if keeper.character is not None else "",
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
            boon_export.csv_lines(rows, staff=keeper.staff), media_type=media, headers=headers
        )
    return Response(
        boon_export.workbook(rows, staff=keeper.staff), media_type=media, headers=headers
    )
