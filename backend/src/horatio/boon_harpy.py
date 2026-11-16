"""The Harpy and the troupe's boon ledger (#688; MET: VTM p. 379).

The Harpy keeps the boon registry in play. In Horatio, the Harpy is whoever holds
the Harpy title in the troupe, under any of its names (a Master Harpy is a Harpy);
with several holders, each has the access. Access goes with the title: a character
who stops holding it, or retires, stops having it at once.

The troupe says how far the Harpy reaches into its ledger (`ACCESS`):
- "none": the ledger is its staff's alone;
- "submissions": the review queue (#687), and word of each boon its players report;
- "full": the whole ledger, to register, edit, trade, pass on, settle, void and
  reopen boons as its staff do, and its review queue.

The Harpy works from the Play View, as their character: what they do is logged on
the boon as done by that character. They never see what a line of its log changed
(only the troupe's storytellers and assistant storytellers do,
horatio.boons.sees_changes), nor a boon's staff note, nor who entered a boon out of
game, nor why a character retired.

`keeper` is the one check of who may work the ledger, and as whom: the troupe's
running staff, a Harpy within the troupe's setting, or a Lesser Harpy (a talon) the
Harpy gave access (horatio.boon_talons, #689). It answers for one `need`:
- "submissions": the review queue (#687);
- "view": seeing the whole ledger;
- "add": registering boons;
- "edit": correcting them: what one says, and linking a name on it to a character;
- "settle": trading, passing on, settling, voiding and reopening them, and answering
  a status loss or Gallant (#984);
- "audit": auditing a character's boons (#690);
- "export": exporting the ledger as they see it (horatio.boon_export, #987): staff
  always; a Harpy with the full ledger only where the troupe lets them
  (`boon_harpy_export`), and a Lesser Harpy only if the Harpy also let them.
Audits (#690), Gallant's offers (#693) and Boonbreakers (#717) are meant to ask it too.

A Harpy or a Lesser Harpy learns who has left only as the court knows it
(horatio.court_knows, #749): their `Keeper` carries the troupe's Who's Who listing,
and every view of the ledger they read goes by it. The troupe may also let them read
its boon standings and statistics (`reads_standings`), by the same rule.
**A boon's log** (#992; `in_sight`, `log_for`): a Harpy quietly altering the ledger is
part of the game, so a Harpy or a Lesser Harpy reads only the lines within their own
sight. Each line keeps who it was done as (`BoonEvent.role`):
- a Harpy sees what was done since they took the title (the start of their current
  holding of it: `Keeper.began`), by themselves, by another holder of the title, and,
  where the troupe lets them (`boon_harpy_sees_talons`), by a Lesser Harpy. Nothing
  done before, by them or anyone holding the office then; a Harpy who loses the title
  and regains it starts again;
- a Lesser Harpy sees only what they did themselves;
- what staff did shows when the ledger's state changed (traded, passed on, settled,
  voided, reopened, accepted or rejected, Gallant answered), without who did it, but
  never their edits, their linking of a name, nor the flags they raised or cleared;
- what a player did in the Play View (reporting a boon, settling one owed to them,
  answering Gallant) shows.
A boon's first line (registered, or submitted and then accepted) always shows; outside
their sight, without who did it or the note. The boon itself shows as it now stands.
Staff see every line; players see none (they never read a boon's log).
"""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from horatio import audit, boons, court_knows, notifications, titles
from horatio.models import Boon, BoonEvent, BoonTalon, Character, CharacterTitle, Troupe, User
from horatio.sheets import unprocessable

# The title whose holders keep the registry (p. 379), by its main name.
HARPY = "Harpy"
# How far the Harpy reaches into the ledger, least first.
ACCESS = {
    "none": "no access to the ledger",
    "submissions": "the review queue, and word of each boon players report",
    "full": "the full ledger, to register, edit and settle boons",
}
RANK = {level: n for n, level in enumerate(ACCESS)}
# What working the ledger can take (`keeper`'s `need`).
NEEDS = ("submissions", "view", "add", "edit", "settle", "audit", "export")
EVERYTHING = frozenset(NEEDS)
# What a Harpy may do, by the troupe's setting.
HARPY_CAN = {
    "none": frozenset[str](),
    "submissions": frozenset({"submissions"}),
    "full": EVERYTHING,
}


@dataclass(frozen=True)
class Keeper:
    """Someone who may work the troupe's ledger: its running staff (no character), a
    Harpy, or a Lesser Harpy, as their character, with what they may do (`can`). A
    Harpy's or Lesser Harpy's `court` is who the troupe's Who's Who lists as gone
    (horatio.court_knows.listed); None for staff, who see why anyone left."""

    character: Character | None
    can: frozenset[str] = EVERYTHING
    # "staff", "harpy" or "talon".
    role: str = "staff"
    court: frozenset[uuid.UUID] | None = None
    # For a Harpy, when their current holding of the title began, as (when, id) of the
    # title: what in a boon's log came after it is within their sight (#992). Ids are
    # UUID v7, so they keep the order things were made in, even within one moment.
    began: tuple[datetime, uuid.UUID] | None = None
    # For a Harpy, whether they see what their Lesser Harpies change (#992).
    sees_talons: bool = True

    @property
    def staff(self) -> bool:
        return self.character is None


def access(troupe: Troupe) -> str:
    return troupe.boon_harpy


def set_access(db: Session, user: User, troupe: Troupe, level: str) -> None:
    """How far the Harpy reaches into the troupe's ledger. Logged if it changes."""
    if level not in ACCESS:
        raise unprocessable(f"The Harpy has one of {', '.join(ACCESS)}.")
    if troupe.boon_harpy == level:
        return
    troupe.boon_harpy = level
    audit.record(db, user, "house.boon_harpy", troupe_id=troupe.id, setting=ACCESS[level])


def set_sees_talons(db: Session, user: User, troupe: Troupe, on: bool) -> None:
    """Whether the Harpy sees, in a boon's log, what their Lesser Harpies change (#992).
    Logged if it changes."""
    if troupe.boon_harpy_sees_talons == on:
        return
    troupe.boon_harpy_sees_talons = on
    audit.record(
        db,
        user,
        "house.boon_harpy_sees_talons",
        troupe_id=troupe.id,
        setting="to see" if on else "not to see",
        word=troupe.boon_talon_word,
    )


def set_standings(db: Session, user: User, troupe: Troupe, on: bool) -> None:
    """Whether the Harpy with the full ledger also reads the troupe's boon standings and
    statistics (#749), with departures as the court knows them. Logged if it changes."""
    if troupe.boon_harpy_standings == on:
        return
    troupe.boon_harpy_standings = on
    audit.record(
        db,
        user,
        "house.boon_harpy_standings",
        troupe_id=troupe.id,
        setting="let the Harpy read" if on else "kept from the Harpy",
    )


def set_export(db: Session, user: User, troupe: Troupe, on: bool) -> None:
    """Whether the Harpy with the full ledger may export it (#987). Logged if it
    changes."""
    if troupe.boon_harpy_export == on:
        return
    troupe.boon_harpy_export = on
    audit.record(
        db,
        user,
        "house.boon_harpy_export",
        troupe_id=troupe.id,
        setting="let the Harpy export" if on else "stopped the Harpy exporting",
    )


def exports(troupe: Troupe) -> bool:
    """Whether the troupe's setting lets its Harpy export the ledger: only with the full
    ledger. Lesser Harpies the Harpy lets export follow it."""
    return troupe.boon_harpy_export and reaches(troupe, "full")


def within(troupe: Troupe, can: frozenset[str]) -> frozenset[str]:
    """What a Harpy or a Lesser Harpy may do, less exporting where the troupe doesn't
    let the Harpy export."""
    return can if exports(troupe) else can - {"export"}


def reads_standings(troupe: Troupe) -> bool:
    """Whether the troupe's setting lets its Harpy read the standings and statistics:
    only with the full ledger. Lesser Harpies who may see the ledger follow it."""
    return troupe.boon_harpy_standings and reaches(troupe, "full")


def harpies(db: Session, troupe: Troupe) -> list[Character]:
    """The characters holding the Harpy title in the troupe, under any of its names,
    who are still in play there."""
    names = titles.office_names(titles.title_data(db, troupe.id), HARPY)
    found: dict[object, Character] = {}
    for character, _ in titles.holders_of(db, troupe.id, names):
        if character.status != "retired" and boons.in_troupe(db, troupe, character):
            found.setdefault(character.id, character)
    return list(found.values())


def harpy_of(db: Session, user: User, troupe: Troupe) -> Character | None:
    """The user's own character that is a Harpy in the troupe, if any (the first by
    name, should they play two)."""
    return next((c for c in harpies(db, troupe) if c.player_id == user.id), None)


def offices_of(db: Session, character: Character) -> list[Troupe]:
    """The troupes keeping a ledger the Harpy reaches into, where the character holds
    the Harpy title and is in play: where its player works the ledger as it."""
    if character.status == "retired":
        return []
    found: list[Troupe] = []
    held = db.execute(
        select(CharacterTitle.troupe_id, CharacterTitle.name).where(
            CharacterTitle.character_id == character.id
        )
    ).all()
    for troupe_id in dict.fromkeys(t for t, _ in held):
        troupe = db.get(Troupe, troupe_id)
        if troupe is None or not boons.tracked(troupe) or troupe.archived_at is not None:
            continue
        if troupe.boon_harpy == "none" or not boons.in_troupe(db, troupe, character):
            continue
        names = titles.office_names(titles.title_data(db, troupe.id), HARPY)
        if any(n in names for t, n in held if t == troupe_id):
            found.append(troupe)
    return sorted(found, key=lambda t: t.name)


def began(db: Session, troupe: Troupe, character: Character) -> tuple[datetime, uuid.UUID] | None:
    """When the character's current holding of the Harpy title in the troupe began, as
    (when, id) of the title held; None if they hold none."""
    names = titles.office_names(titles.title_data(db, troupe.id), HARPY)
    found = db.execute(
        select(CharacterTitle.created_at, CharacterTitle.id)
        .where(
            CharacterTitle.troupe_id == troupe.id,
            CharacterTitle.character_id == character.id,
            CharacterTitle.name.in_(names),
        )
        .order_by(CharacterTitle.created_at, CharacterTitle.id)
        .limit(1)
    ).first()
    return (found[0], found[1]) if found is not None else None


def reaches(troupe: Troupe, need: str) -> bool:
    """Whether the troupe's setting gives the Harpy `need`: "submissions" or "full"."""
    return RANK[troupe.boon_harpy] >= RANK[need]


def keeper(db: Session, user: User, troupe: Troupe, need: str = "view") -> Keeper | None:
    """Who `user` works the troupe's ledger as, for `need` (one of `NEEDS`): its
    running staff; one of their characters that holds the Harpy title, where the
    troupe's setting reaches that far; or one of their characters the Harpy gave
    access (a Lesser Harpy, horatio.boon_talons), for what that access allows. None
    for anyone else, or while the troupe keeps no ledger."""
    if need not in NEEDS:
        raise ValueError(f"No such need: {need}")
    if boons.can_manage(db, user, troupe):
        return Keeper(None)
    if not boons.tracked(troupe) or troupe.archived_at is not None:
        return None
    harpy = harpy_of(db, user, troupe)
    if harpy is not None and need in within(troupe, HARPY_CAN[troupe.boon_harpy]):
        return Keeper(
            harpy,
            within(troupe, HARPY_CAN[troupe.boon_harpy]),
            "harpy",
            court_knows.listed(db, troupe),
            began=began(db, troupe, harpy),
            sees_talons=troupe.boon_harpy_sees_talons,
        )
    from horatio import boon_talons  # imports this module

    found = boon_talons.talon_of(db, user, troupe)
    can = within(troupe, boon_talons.can(found[1])) if found is not None else frozenset[str]()
    if found is not None and need in can:
        return Keeper(found[0], can, "talon", court_knows.listed(db, troupe))
    return None


def tell(db: Session, troupe: Troupe, made: Sequence[Boon], reporter: Character) -> None:
    """Word to each Harpy's player of boons a player just reported, where the troupe
    gives the Harpy the review queue or more. Not to the reporter's own player. It
    links to the ledger's To review tab while the boons wait there (#1011)."""
    if not made or not boons.tracked(troupe) or troupe.boon_harpy == "none":
        return
    first = made[0]
    debtor, creditor = boons.parties(db, first)
    waits = " It waits for review." if first.state == "pending" else ""
    what = boons.a_boon(first.kind, len(made))
    # The ledger's first tab is at its own address: the ledger with the full ledger,
    # else To review, the only one (HarpyLedgerPage).
    tab = "/review" if waits and reaches(troupe, "full") else ""
    for harpy in harpies(db, troupe):
        if harpy.kind != "pc" or harpy.player_id is None or harpy.player_id == reporter.player_id:
            continue
        notifications.notify(
            db,
            [harpy.player_id],
            "boon.reported",
            f"{reporter.name} reported {what} to the ledger: {debtor.shown} owes"
            f" {creditor.shown} ({boons.when(first.made_on)}).{waits}",
            f"/play/characters/{harpy.id}/ledger{tab}",
            troupe_id=troupe.id,
            character_id=harpy.id,
        )


# --- a boon's log (#992) ------------------------------------------------------------------

# What staff do that a Harpy or a Lesser Harpy still sees: the ledger's state changing.
# Not staff's edits, linking of a name, or flags raised and cleared.
STAFF_SHOWN = frozenset(
    {
        "registered",
        "submitted",
        "accepted",
        "rejected",
        "traded",
        "passed_on",
        "settled",
        "voided",
        "reopened",
        "gallant_given",
        "gallant_declined",
    }
)


def acting_as(db: Session, troupe: Troupe, character: Character | None) -> str:
    """Who a line of a boon's log is done as, for `BoonEvent.role`: "staff" (no
    character); "harpy", a character holding the Harpy title where the troupe gives the
    Harpy access; "talon", one the Harpy gave access (horatio.boon_talons); else
    "player", in the Play View."""
    if character is None:
        return "staff"
    if troupe.boon_harpy != "none" and began(db, troupe, character) is not None:
        return "harpy"
    from horatio import boon_talons  # imports this module

    if boon_talons.enabled(troupe) and db.scalar(
        select(BoonTalon.id).where(
            BoonTalon.troupe_id == troupe.id, BoonTalon.character_id == character.id
        )
    ):
        return "talon"
    return "player"


def in_sight(keeper: Keeper, line: BoonEvent) -> bool:
    """Whether `keeper` sees the line of a boon's log, with who did it and its note."""
    if keeper.staff:
        return True
    if line.role == "staff":
        return line.kind in STAFF_SHOWN
    if line.role == "player":
        return True
    mine = keeper.character is not None and line.as_character_id == keeper.character.id
    if keeper.role != "harpy":
        return mine
    if keeper.began is None or (line.created_at, line.id) < keeper.began:
        return False
    return mine or line.role == "harpy" or keeper.sees_talons


def log_for(keeper: Keeper, lines: Sequence[BoonEvent]) -> list[tuple[BoonEvent, bool]]:
    """The lines of a boon's log `keeper` reads, each with whether it is in their sight.
    Its first line (registered, or submitted and then accepted) always shows; outside
    their sight, without who did it or its note. Any other line outside it doesn't."""
    out: list[tuple[BoonEvent, bool]] = []
    for n, line in enumerate(lines):
        seen = in_sight(keeper, line)
        if seen or n == 0 or line.kind == "accepted":
            out.append((line, seen))
    return out
