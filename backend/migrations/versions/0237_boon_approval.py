"""The Harpy's approval queue (issue #993): the kinds of boon players report that go
straight into the ledger (`troupes.boon_auto_accept`, none to start with, so every one
waits as before), and a Lesser Harpy's right to approve reported boons
(`boon_talons.can_review`), apart from settling and moving them. It is set to what
`can_settle` was, which carried reviewing until now, so no one loses anything.

Revision ID: 0237
Revises: 0236
Create Date: 2026-11-15 22:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0237"
down_revision: str | None = "0236"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "troupes",
        sa.Column(
            "boon_auto_accept",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="[]",
            nullable=False,
        ),
    )
    op.add_column(
        "boon_talons",
        sa.Column("can_review", sa.Boolean(), server_default="false", nullable=False),
    )
    op.execute("UPDATE boon_talons SET can_review = can_settle")


def downgrade() -> None:
    op.drop_column("boon_talons", "can_review")
    op.drop_column("troupes", "boon_auto_accept")
