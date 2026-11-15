"""The custodian's import of a troupe's boon ledger from its old spreadsheet
(horatio.import_boons, #989): upload the sheet for a dry run, read its report, and
upload it again to import it. The sheet is read in memory and never kept."""

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from pydantic import BaseModel, ConfigDict

from horatio import import_boons
from horatio.api.tools import custodians_troupe
from horatio.auth.deps import CurrentUser, DbSession
from horatio.import_influence_log import CannotImport

router = APIRouter(prefix="/boon-imports", tags=["custodian"])


class Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class KindCountOut(Out):
    kind: Literal["trivial", "minor", "major", "blood", "life"]
    standing: int
    settled: int


class NameCountOut(Out):
    name: str
    how: Literal["matched", "alias", "unmatched", "ambiguous"]
    character_id: uuid.UUID | None
    character_name: str | None
    boons: int


class RowNoteOut(Out):
    row: str
    note: str


class DuplicateOut(Out):
    rows: list[str]
    what: str
    in_ledger: bool


class BoonImportOut(Out):
    dry_run: bool
    troupe_id: uuid.UUID
    troupe_name: str
    # Whether the troupe keeps a boon ledger: off, the boons don't show until it is on.
    ledger_on: bool
    rows: int
    added: int
    updated: int
    unchanged: int
    kinds: list[KindCountOut]
    names: list[NameCountOut]
    skipped: list[RowNoteOut]
    duplicates: list[DuplicateOut]
    notes: list[RowNoteOut]
    flagged: int
    by_account: int
    general: list[str]
    # All of it as a spreadsheet, to download.
    csv: str = ""


@router.post("/{troupe_id}")
def import_ledger(
    troupe_id: uuid.UUID,
    db: DbSession,
    user: CurrentUser,
    file: Annotated[UploadFile, File(description="The spreadsheet, downloaded as .xlsx.")],
    dry_run: bool = True,
) -> BoonImportOut:
    """Import the spreadsheet into the troupe's boon ledger, or, with `dry_run`, say
    what importing it would do and change nothing. The custodian only."""
    troupe = custodians_troupe(db, user, troupe_id)
    data = file.file.read(import_boons.MAX_UPLOAD + 1)
    if len(data) > import_boons.MAX_UPLOAD:
        raise HTTPException(
            status.HTTP_413_CONTENT_TOO_LARGE,
            f"The spreadsheet is over {import_boons.MAX_UPLOAD // (1024 * 1024)} MB.",
        )
    try:
        book = import_boons.read_workbook(data)
        report = import_boons.run(db, user, troupe, book, dry_run=dry_run)
    except CannotImport as error:
        db.rollback()
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(error)) from None
    if dry_run:
        db.rollback()
    else:
        db.commit()
    out = BoonImportOut.model_validate(report)
    out.csv = import_boons.as_csv(report)
    return out
