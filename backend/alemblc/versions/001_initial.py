"""initial tables v2 — function-based skills

Revision ID: 001_initial
Revises:
Create Date: 2026-03-18

변경점 (v1 대비):
  - card_templates: hero_key 추가, skill_damages/skill_meta(JSON) 추가
  - card_abilities 테이블 삭제 (스킬 동작은 코드에 있음)
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '001_initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 플레이어 ──────────────────────────────
    op.create_table(
        'players',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('username', sa.String(50), unique=True, nullable=False, index=True),
        sa.Column('hashed_password', sa.String(255), nullable=False),
        sa.Column('nickname', sa.String(50), nullable=False),
        sa.Column('wins', sa.Integer, default=0),
        sa.Column('losses', sa.Integer, default=0),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── 카드 템플릿 (숫자만 저장, 스킬 로직은 코드) ──
    op.create_table(
        'card_templates',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('hero_key', sa.String(50), unique=True, nullable=False),  # 코드와 연결
        sa.Column('name', sa.String(50), nullable=False),                    # 표시용 이름
        sa.Column('role', sa.String(10), nullable=False),
        sa.Column('description', sa.Text, server_default=''),
        sa.Column('image_url', sa.String(255), server_default=''),
        sa.Column('hp', sa.Integer, nullable=False),
        sa.Column('cost', sa.Integer, nullable=False, server_default='1'),
        sa.Column('base_attack', sa.Integer, server_default='0'),
        sa.Column('base_defense', sa.Integer, server_default='0'),
        sa.Column('base_attack_range', sa.Integer, server_default='1'),
        sa.Column('skill_damages', sa.JSON, nullable=True),  # {"skill_1": 6, "skill_2": [8,5,3,1]}
        sa.Column('skill_meta', sa.JSON, nullable=True),     # {"skill_1": {"cooldown": 2}}
        sa.Column('is_spell', sa.Boolean, server_default='false'),
        sa.Column('extra', sa.JSON, nullable=True),
    )

    # ── 덱 ────────────────────────────────────
    op.create_table(
        'decks',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('player_id', sa.Integer, sa.ForeignKey('players.id'), nullable=False),
        sa.Column('name', sa.String(100), nullable=False, server_default='My Deck'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── 덱 안의 카드 ─────────────────────────
    op.create_table(
        'deck_cards',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('deck_id', sa.Integer, sa.ForeignKey('decks.id'), nullable=False),
        sa.Column('card_template_id', sa.Integer, sa.ForeignKey('card_templates.id'), nullable=False),
        sa.Column('quantity', sa.Integer, server_default='1'),
    )


def downgrade() -> None:
    op.drop_table('deck_cards')
    op.drop_table('decks')
    op.drop_table('card_templates')
    op.drop_table('players')