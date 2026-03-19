"""
게임 엔진 패키지.

import 순서 중요:
  1. status_effects (기본 상태 효과 클래스들)
  2. field (FieldCard, Field — status_effects 사용)
  3. skill_registry (스킬 함수 등록 시스템)
  4. heroes (영웅별 스킬 함수 — 등록)
  5. engine (GameEngine — 모든 것을 조합)
"""
from game_engine.status_effects import StatusEffect
from game_engine.field import Field, FieldCard, Role, Zone
from game_engine.skill_registry import get_skill, get_passive, get_hero_skills
from game_engine.engine import GameEngine, GameState, GamePhase

# 영웅 스킬 등록 (import 시 자동 실행)
import game_engine.heroes

__all__ = [
    "StatusEffect", "Field", "FieldCard", "Role", "Zone",
    "GameEngine", "GameState", "GamePhase",
    "get_skill", "get_passive", "get_hero_skills",
]