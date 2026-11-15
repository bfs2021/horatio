"""The Harpy may export the boon ledger (issue #987): a troupe setting, and a Lesser
Harpy's right to export it too, given by the Harpy. Both start off.

Revision ID: 0236
Revises: 0235
Create Date: 2026-11-15 20:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0236"
down_revision: str | None = "0235"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "troupes",
        sa.Column("boon_harpy_export", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column(
        "boon_talons",
        sa.Column("can_export", sa.Boolean(), server_default="false", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("boon_talons", "can_export")
    op.drop_column("troupes", "boon_harpy_export")
