"""add chaos_level to case table

Revision ID: 006_add_chaos_level
Revises: 005_add_case_style
Create Date: 2026-06-02
"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = '006_add_chaos_level'
down_revision = '005_add_case_style'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "case",
        sa.Column("chaos_level", sa.String(20), nullable=False, server_default="chaotic")
    )


def downgrade():
    op.drop_column("case", "chaos_level")
