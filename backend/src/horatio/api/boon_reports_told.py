"""Whether you are told of each boon players report to a troupe's ledger
(horatio.boon_reports_told, #1018): your own choice, as one of its running staff, or
as its Harpy or a Lesser Harpy who approves reported boons. Each person reads and
changes only their own."""

import uuid
from typing import Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from horatio import boon_reports_told
from horatio.auth.deps import CurrentUser, DbSession
from horatio.models import Troupe, User

router = APIRouter(tags=["boons"])


class BoonReportsToldOut(BaseModel):
    # As running staff, you asked to be told; None if you aren't its running staff.
    staff: bool | None = None
    # As its Harpy, or a Lesser Harpy who approves reported boons, you are told; None
    # if you are neither.
    keeper: bool | None = None


class BoonReportsToldIn(BaseModel):
    on: bool
    # Which of your choices: as staff, or as the Harpy or a Lesser Harpy.
    role: Literal["staff", "keeper"]


def found(db: DbSession, troupe_id: uuid.UUID) -> Troupe:
    troupe = db.get(Troupe, troupe_id)
    if troupe is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such troupe.")
    return troupe


def told_out(db: DbSession, user: User, troupe: Troupe) -> BoonReportsToldOut:
    return BoonReportsToldOut(
        staff=boon_reports_told.staff_told(db, user, troupe),
        keeper=boon_reports_told.keeper_told(db, user, troupe),
    )


@router.get("/troupes/{troupe_id}/boon-reports-told")
def get_boon_reports_told(
    troupe_id: uuid.UUID, db: DbSession, user: CurrentUser
) -> BoonReportsToldOut:
    """Whether you are told of each boon the troupe's players report, as staff and as
    its Harpy or a Lesser Harpy."""
    return told_out(db, user, found(db, troupe_id))


@router.put("/troupes/{troupe_id}/boon-reports-told")
def set_boon_reports_told(
    troupe_id: uuid.UUID, body: BoonReportsToldIn, db: DbSession, user: CurrentUser
) -> BoonReportsToldOut:
    """Choose whether you are told of each boon the troupe's players report: as its
    running staff (off to start with), or as its Harpy or a Lesser Harpy who approves
    reported boons (on to start with)."""
    troupe = found(db, troupe_id)
    if body.role == "staff":
        if not boon_reports_told.is_staff(db, user, troupe):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You don't run this troupe.")
        boon_reports_told.set_staff(db, user, troupe, body.on)
    elif not boon_reports_told.set_keeper(db, user, troupe, body.on):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Only the Harpy, or a Lesser Harpy who approves reported boons, chooses this.",
        )
    db.commit()
    return told_out(db, user, troupe)
