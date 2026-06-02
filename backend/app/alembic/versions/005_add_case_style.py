"""add style_description to case

Revision ID: 005_add_case_style
Revises: 004_add_closeup_fields
Create Date: 2026-06-01
"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = '005_add_case_style'
down_revision = '004_add_closeup_fields'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("case", sa.Column("style_description", sa.Text(), nullable=True))


def downgrade():
    op.drop_column("case", "style_description")
