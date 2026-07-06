"""add relation fields to evidence table

Revision ID: 007_add_evidence_relation
Revises: 006_add_chaos_level
Create Date: 2026-06-04
"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


revision = '007_add_evidence_relation'
down_revision = '006_add_chaos_level'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("evidence",
        sa.Column("related_evidence_id", sa.Integer(), nullable=True))
    op.add_column("evidence",
        sa.Column("relation_type", sa.String(30), nullable=True))

    op.create_foreign_key(
        "fk_evidence_related_id",
        "evidence", "evidence",
        ["related_evidence_id"], ["id"],
        ondelete="SET NULL"
    )


def downgrade():
    op.drop_constraint("fk_evidence_related_id", "evidence", type_="foreignkey")
    op.drop_column("evidence", "relation_type")
    op.drop_column("evidence", "related_evidence_id")
