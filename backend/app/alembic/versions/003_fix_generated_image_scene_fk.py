"""fix GeneratedImage FK from scenestate to scene

Revision ID: 003_fix_generated_image_scene_fk
Revises: 002_add_scene_table
Create Date: 2025-01-02
"""
from alembic import op


# revision identifiers, used by Alembic.
revision = '003_fix_generated_image_scene_fk'
down_revision = '002_add_scene_table'
branch_labels = None
depends_on = None


def upgrade():
    # Drop old FK to scenestate
    op.drop_constraint("generatedimage_scene_id_fkey", "generatedimage", type_="foreignkey")
    # Create new FK to scene
    op.create_foreign_key(
        "generatedimage_scene_id_fkey",
        "generatedimage", "scene",
        ["scene_id"], ["id"],
        ondelete="SET NULL",
    )


def downgrade():
    op.drop_constraint("generatedimage_scene_id_fkey", "generatedimage", type_="foreignkey")
    op.create_foreign_key(
        "generatedimage_scene_id_fkey",
        "generatedimage", "scenestate",
        ["scene_id"], ["id"],
        ondelete="SET NULL",
    )
