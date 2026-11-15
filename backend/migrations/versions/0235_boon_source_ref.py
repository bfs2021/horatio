"""A boon imported from a troupe's old spreadsheet keeps the row it came from (#989), so
the import can be run again without making it twice: unique in its troupe when set.

Revision ID: 0235
Revises: 0231
Create Date: 2026-11-15 18:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0235"
down_revision: str | None = "0231"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("boons", sa.Column("source_ref", sa.String(), nullable=True))
    op.create_index(
        "uq_boons_troupe_source_ref",
        "boons",
        ["troupe_id", "source_ref"],
        unique=True,
        postgresql_where=sa.text("source_ref is not null"),
    )


def downgrade() -> None:
    op.drop_index("uq_boons_troupe_source_ref", table_name="boons")
    op.drop_column("boons", "source_ref")
