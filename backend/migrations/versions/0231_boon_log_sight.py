"""Who sees which lines of a boon's log (issue #992): each line keeps who it was done
as (staff, a Harpy, a Lesser Harpy or a player), and the troupe says whether its Harpy
sees what their Lesser Harpies change.

Lines from before are sorted from what is known of them: none done as a character
were staff's; one done as a character who held the Harpy title (under either of its
book names) at the time was the Harpy's; one done as a character the Harpy has given
access to the ledger was a Lesser Harpy's; any other was a player's, in the Play View.

Revision ID: 0231
Revises: 0230
Create Date: 2026-11-15 16:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0231"
down_revision: str | None = "0230"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "troupes",
        sa.Column("boon_harpy_sees_talons", sa.Boolean(), server_default="true", nullable=False),
    )
    op.add_column(
        "boon_events", sa.Column("role", sa.String(), server_default="staff", nullable=False)
    )
    op.create_check_constraint(
        op.f("ck_boon_events_role"), "boon_events", "role in ('staff', 'harpy', 'talon', 'player')"
    )
    op.execute("update boon_events set role = 'player' where as_character_id is not null")
    op.execute(
        "update boon_events e set role = 'talon' from boons b, boon_talons t"
        " where e.boon_id = b.id and t.troupe_id = b.troupe_id"
        " and t.character_id = e.as_character_id"
    )
    op.execute(
        "update boon_events e set role = 'harpy' from boons b, title_holdings h"
        " where e.boon_id = b.id and h.troupe_id = b.troupe_id"
        " and h.character_id = e.as_character_id"
        " and h.name in ('Harpy', 'Master Harpy')"
        " and h.began_at <= e.created_at and (h.ended_at is null or h.ended_at >= e.created_at)"
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_boon_events_role"), "boon_events", type_="check")
    op.drop_column("boon_events", "role")
    op.drop_column("troupes", "boon_harpy_sees_talons")
