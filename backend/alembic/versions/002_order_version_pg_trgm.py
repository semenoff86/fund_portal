"""Add OrderDocument.version / is_active and enable pg_trgm.

Revision ID: 002_order_version_pg_trgm
Revises: 001_initial_schema
Create Date: 2026-07-16

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002_order_version_pg_trgm"
down_revision: Union[str, None] = "001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.add_column(
        "order_documents",
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
    )
    op.add_column(
        "order_documents",
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
    )
    op.create_index("ix_order_documents_is_active", "order_documents", ["is_active"], unique=False)

    # Trigram indexes for hybrid / fuzzy search on knowledge base
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_order_documents_title_trgm "
        "ON order_documents USING gin (title gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_order_documents_content_trgm "
        "ON order_documents USING gin (content_text gin_trgm_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_order_documents_content_trgm")
    op.execute("DROP INDEX IF EXISTS ix_order_documents_title_trgm")
    op.drop_index("ix_order_documents_is_active", table_name="order_documents")
    op.drop_column("order_documents", "is_active")
    op.drop_column("order_documents", "version")
