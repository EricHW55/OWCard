"""
스킬 레지스트리.

모든 영웅의 스킬 함수를 등록하고 조회하는 중앙 시스템.

사용법:
  @register_skill("reinhardt", "skill_1")
  def reinhardt_fire_strike(caster, target, game):
      ...

  # 나중에 조회
  skill_fn = get_skill("reinhardt", "skill_1")
  result = skill_fn(caster, target, game)

  # 패시브 등록
  @register_passive("reinhardt")
  def reinhardt_passive(card, game):
      ...
"""
from __future__ import annotations
from typing import Callable, Optional

# 스킬 함수 저장소: {hero_name: {skill_key: callable}}
_SKILL_REGISTRY: dict[str, dict[str, Callable]] = {}

# 패시브 함수 저장소: {hero_name: callable}
_PASSIVE_REGISTRY: dict[str, Callable] = {}


def register_skill(hero_name: str, skill_key: str):
    """스킬 함수 데코레이터.

    @register_skill("reinhardt", "skill_1")
    def reinhardt_fire_strike(caster, target, game):
        ...
    """
    def decorator(fn: Callable):
        if hero_name not in _SKILL_REGISTRY:
            _SKILL_REGISTRY[hero_name] = {}
        _SKILL_REGISTRY[hero_name][skill_key] = fn
        return fn
    return decorator


def register_passive(hero_name: str):
    """패시브 함수 데코레이터.

    @register_passive("reinhardt")
    def reinhardt_passive(card, game):
        ...
    """
    def decorator(fn: Callable):
        _PASSIVE_REGISTRY[hero_name] = fn
        return fn
    return decorator


def get_skill(hero_name: str, skill_key: str) -> Optional[Callable]:
    return _SKILL_REGISTRY.get(hero_name, {}).get(skill_key)


def get_passive(hero_name: str) -> Optional[Callable]:
    return _PASSIVE_REGISTRY.get(hero_name)


def get_hero_skills(hero_name: str) -> dict[str, Callable]:
    """영웅의 모든 스킬 함수 반환."""
    return _SKILL_REGISTRY.get(hero_name, {})


def list_registered_heroes() -> list[str]:
    """등록된 모든 영웅 이름."""
    return list(set(list(_SKILL_REGISTRY.keys()) + list(_PASSIVE_REGISTRY.keys())))
