"""A Lesser Harpy's right to correct boons split from settling and moving them (issue
#984): `can_settle` beside `can_edit`, set to what `can_edit` was, so no one loses
anything.

Revision ID: 0230
Revises: 0229
Create Date: 2026-11-15 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0230"
down_revision: str | None = "0229"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "boon_talons",
        sa.Column("can_settle", sa.Boolean(), server_default="false", nullable=False),
    )
    op.execute("UPDATE boon_talons SET can_settle = can_edit")


def downgrade() -> None:
    op.drop_column("boon_talons", "can_settle")
