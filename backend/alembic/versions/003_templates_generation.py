"""Add Template.is_active/filename and User.position for DOCX generation.

Revision ID: 003_templates_generation
Revises: 002_order_version_pg_trgm
Create Date: 2026-07-20

Matches models:
  - User.position: String(128), nullable
  - Template.filename: String(255), nullable
  - Template.is_active: Boolean, server_default true, indexed
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003_templates_generation"
down_revision: Union[str, None] = "002_order_version_pg_trgm"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("position", sa.String(length=128), nullable=True))
    op.add_column("templates", sa.Column("filename", sa.String(255), nullable=True))
    op.add_column(
        "templates",
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
    )
    op.create_index("ix_templates_is_active", "templates", ["is_active"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_templates_is_active", table_name="templates")
    op.drop_column("templates", "is_active")
    op.drop_column("templates", "filename")
    op.drop_column("users", "position")
