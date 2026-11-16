"""Who is told of the boons players report (issue #1018), each by their own choice:
staff who ask (`boon_report_staff`, a row each, none to start with), the Harpy
(`character_titles.boon_reports_told`, on for each holding of the title) and a Lesser
Harpy who approves reported boons (`boon_talons.told_of_reports`, on). Everyone told
until now stays told.

Revision ID: 0238
Revises: 0237
Create Date: 2026-11-16 10:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0238"
down_revision: str | None = "0237"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "character_titles",
        sa.Column("boon_reports_told", sa.Boolean(), server_default="true", nullable=False),
    )
    op.add_column(
        "boon_talons",
        sa.Column("told_of_reports", sa.Boolean(), server_default="true", nullable=False),
    )
    op.create_table(
        "boon_report_staff",
        sa.Column("troupe_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["troupe_id"], ["troupes.id"], name=op.f("fk_boon_report_staff_troupe_id_troupes")
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_boon_report_staff_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_boon_report_staff")),
        sa.UniqueConstraint("troupe_id", "user_id", name=op.f("uq_boon_report_staff_troupe_id")),
    )
    op.create_index(
        op.f("ix_boon_report_staff_troupe_id"), "boon_report_staff", ["troupe_id"], unique=False
    )
    op.create_index(
        op.f("ix_boon_report_staff_user_id"), "boon_report_staff", ["user_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_boon_report_staff_user_id"), table_name="boon_report_staff")
    op.drop_index(op.f("ix_boon_report_staff_troupe_id"), table_name="boon_report_staff")
    op.drop_table("boon_report_staff")
    op.drop_column("boon_talons", "told_of_reports")
    op.drop_column("character_titles", "boon_reports_told")
