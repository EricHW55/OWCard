"""
카드 템플릿 모델 (v2).

스킬 "동작"은 game_engine/heroes/ 코드에 있고,
DB에는 "숫자"만 저장합니다.

밸런스 패치 = DB의 숫자만 수정
메커니즘 변경 = heroes/ 코드 수정
"""
from sqlalchemy import Column, Integer, String, Text, Boolean, JSON
from database import Base


class CardTemplate(Base):
    __tablename__ = "card_templates"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # ── 기본 정보 ─────────────────────────────
    hero_key = Column(String(50), unique=True, nullable=False)  # "reinhardt", "dva" 등 (코드와 연결)
    name = Column(String(50), nullable=False)                    # "라인하르트", "디바" (표시용)
    role = Column(String(10), nullable=False)                    # "tank", "dealer", "healer"
    description = Column(Text, default="")
    image_url = Column(String(255), default="")

    # ── 스탯 (밸런스 패치 대상) ────────────────
    hp = Column(Integer, nullable=False)
    cost = Column(Integer, nullable=False, default=1)   # 배치 코스트 (탱커=2, 나머지=1)
    base_attack = Column(Integer, default=0)             # 기본 공격력
    base_defense = Column(Integer, default=0)
    base_attack_range = Column(Integer, default=1)

    # ── 스킬 데미지 (JSON) ────────────────────
    # 각 스킬의 숫자값만 저장. 형태는 영웅마다 다를 수 있음.
    # 예: {"skill_1": 6}
    # 예: {"skill_1": 6, "skill_2": [8, 5, 3, 1]}  (거리별)
    # 예: {"skill_1": {"heal": 5, "damage": 3}}     (아나 힐/딜 겸용)
    skill_damages = Column(JSON, default={})

    # ── 스킬 메타 (쿨다운, 사용 횟수 등) ──────
    # 예: {"skill_1": {"cooldown": 2}, "skill_2": {"cooldown": 0, "uses": 1}}
    skill_meta = Column(JSON, default={})

    # ── 기타 ──────────────────────────────────
    is_spell = Column(Boolean, default=False)  # 스킬 카드 여부
    extra = Column(JSON, default={})           # 영웅별 추가 데이터 (폼 정보 등)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "hero_key": self.hero_key,
            "name": self.name,
            "role": self.role,
            "description": self.description,
            "image_url": self.image_url,
            "hp": self.hp,
            "cost": self.cost,
            "base_attack": self.base_attack,
            "base_defense": self.base_defense,
            "base_attack_range": self.base_attack_range,
            "skill_damages": self.skill_damages,
            "skill_meta": self.skill_meta,
            "is_spell": self.is_spell,
            "extra": self.extra,
        }

    def to_game_dict(self) -> dict:
        """게임 엔진에 넘길 때 사용하는 형태."""
        return {
            "id": self.id,
            "hero_key": self.hero_key,
            "name": self.name,
            "role": self.role,
            "hp": self.hp,
            "cost": self.cost,
            "attack": self.base_attack,
            "defense": self.base_defense,
            "attack_range": self.base_attack_range,
            "skill_damages": self.skill_damages or {},
            "skill_meta": self.skill_meta or {},
            "is_spell": self.is_spell,
            "extra": self.extra or {},
        }