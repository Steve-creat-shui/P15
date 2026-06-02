"""add closeup_strategy and reference_preview_path to generatedimage

Revision ID: 004_add_closeup_fields
Revises: 003_fix_generated_image_scene_fk
Create Date: 2025-01-03
"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = '004_add_closeup_fields'
down_revision = '003_fix_generated_image_scene_fk'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("generatedimage", sa.Column("closeup_strategy", sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    op.add_column("generatedimage", sa.Column("reference_preview_path", sqlmodel.sql.sqltypes.AutoString(), nullable=True))


def downgrade():
    op.drop_column("generatedimage", "reference_preview_path")
    op.drop_column("generatedimage", "closeup_strategy")
