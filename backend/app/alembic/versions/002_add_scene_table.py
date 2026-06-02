"""add scene table and scene_id to evidence

Revision ID: 002_add_scene_table
Revises: 0079b395838d
Create Date: 2025-01-01
"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from sqlalchemy.sql import text


# revision identifiers, used by Alembic.
revision = '002_add_scene_table'
down_revision = '0079b395838d'
branch_labels = None
depends_on = None


def upgrade():
    # 1. 创建 scene 表
    op.create_table(
        "scene",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("case_id", sa.Integer(), sa.ForeignKey("case.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
        sa.Column("room_type", sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False, server_default="unknown"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    # 2. evidence 表新增 scene_id（nullable，ON DELETE SET NULL）
    op.add_column("evidence", sa.Column("scene_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_evidence_scene_id",
        "evidence", "scene",
        ["scene_id"], ["id"],
        ondelete="SET NULL"
    )

    # 3. scenestate 表新增 scene_id（nullable）
    op.add_column("scenestate", sa.Column("scene_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_scenestate_scene_id",
        "scenestate", "scene",
        ["scene_id"], ["id"],
        ondelete="SET NULL"
    )

    # ⭐ 4. 数据补全：为每个已有 case 创建默认场景
    # 这步确保旧数据迁移后不处于中间状态
    conn = op.get_bind()

    # 查出所有有证据的 case_id
    existing_cases = conn.execute(
        text("SELECT DISTINCT case_id FROM evidence WHERE scene_id IS NULL")
    ).fetchall()

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)

    for row in existing_cases:
        case_id = row[0]
        # 为该 case 插入默认场景（使用 RETURNING 获取自增 id）
        result = conn.execute(
            text("""
                INSERT INTO scene (case_id, name, room_type, sort_order, created_at, updated_at)
                VALUES (:case_id, '案发现场', 'unknown', 0, :now, :now)
                RETURNING id
            """),
            {"case_id": case_id, "now": now}
        )
        scene_id = result.fetchone()[0]

        # 将该 case 下所有 NULL 的证据指向这个默认场景
        conn.execute(
            text("""
                UPDATE evidence
                SET scene_id = :scene_id
                WHERE case_id = :case_id AND scene_id IS NULL
            """),
            {"scene_id": scene_id, "case_id": case_id}
        )


def downgrade():
    op.drop_constraint("fk_scenestate_scene_id", "scenestate", type_="foreignkey")
    op.drop_column("scenestate", "scene_id")
    op.drop_constraint("fk_evidence_scene_id", "evidence", type_="foreignkey")
    op.drop_column("evidence", "scene_id")
    op.drop_table("scene")
