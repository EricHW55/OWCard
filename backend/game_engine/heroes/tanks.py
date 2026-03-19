"""
탱커 영웅 스킬.

각 함수의 시그니처:
  스킬: fn(caster: FieldCard, target: FieldCard | None, game: GameState) -> dict
  패시브: fn(card: FieldCard, game: GameState) -> dict

game 객체를 통해 필드, 상대 필드, DB 데미지값 등에 접근.
"""
from __future__ import annotations
from typing import TYPE_CHECKING

from game_engine.skill_registry import register_skill, register_passive
from game_engine.status_effects import (
    Barrier, Exposed, ParticleBarrier, AttackBuff, ExtraHP,
)

if TYPE_CHECKING:
    from game_engine.field import FieldCard
    from game_engine.engine import GameState


# ═══════════════════════════════════════════════════════
#  라인하르트
# ═══════════════════════════════════════════════════════

@register_passive("reinhardt")
def reinhardt_passive(card: FieldCard, game: GameState) -> dict:
    """배치 시 자신에게 15 내구도 방벽 생성. 방벽이 패싱 공격 차단."""
    barrier_hp = 15  # 나중에 DB에서 읽을 수도 있음
    card.add_status(Barrier(
        barrier_hp=barrier_hp,
        blocks_passthrough=True,  # 선제 공격 예외 스킬 차단
        duration=-1,              # 파괴될 때까지 영구
        source_uid=card.uid,
    ))
    return {"barrier_created": barrier_hp}


@register_skill("reinhardt", "skill_1")
def reinhardt_fire_strike(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """화염강타: 방벽을 무시하는 데미지."""
    if not target:
        return {"success": False, "message": "대상이 필요합니다"}

    damage = game.get_skill_damage(caster, "skill_1")  # DB에서 6
    result = target.take_damage(damage, ignore_barrier=True)

    return {
        "success": True,
        "skill": "화염강타",
        "damage_log": result,
    }


# ═══════════════════════════════════════════════════════
#  디바
# ═══════════════════════════════════════════════════════

@register_passive("dva")
def dva_passive(card: FieldCard, game: GameState) -> dict:
    """메카 상태로 시작. extra에 폼 정보 저장."""
    card.extra["form"] = "mech"
    card.extra["hana_survive_turns"] = 0
    return {}


@register_skill("dva", "skill_1")
def dva_booster(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """부스터: 탱커 패싱 공격 + 다음 턴 나도 패싱당함.
    디바의 skill_damages["skill_1"] = 6"""
    if caster.extra.get("form") != "mech":
        return {"success": False, "message": "메카 상태에서만 사용 가능"}
    if not target:
        return {"success": False, "message": "대상이 필요합니다"}

    damage = game.get_skill_damage(caster, "skill_1")
    result = target.take_damage(damage)

    # 나도 다음 턴 패싱당함
    caster.add_status(Exposed(duration=1, source_uid=caster.uid))

    return {
        "success": True,
        "skill": "부스터",
        "damage_log": result,
        "self_exposed": True,
    }


@register_skill("dva", "skill_2")
def dva_micro_missiles(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """마이크로 미사일: 거리에 따라 데미지 감소.
    디바의 skill_damages["skill_2"] = [8, 5, 3, 1] (거리1~4)"""
    if caster.extra.get("form") != "mech":
        return {"success": False, "message": "메카 상태에서만 사용 가능"}
    if not target:
        return {"success": False, "message": "대상이 필요합니다"}

    damage_table = game.get_skill_damage(caster, "skill_2")  # [8, 5, 3, 1]
    distance = game.get_distance_between(caster, target)
    idx = min(distance - 1, len(damage_table) - 1)
    damage = damage_table[idx]

    result = target.take_damage(damage)
    return {
        "success": True,
        "skill": "마이크로 미사일",
        "distance": distance,
        "damage_log": result,
    }


# ═══════════════════════════════════════════════════════
#  자리야
# ═══════════════════════════════════════════════════════

@register_skill("zarya", "skill_1")
def zarya_particle_barrier(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """입자 방벽: 첫 공격 무효화. 공격 받으면 자리야 딜 증가.
    자기 자신 또는 아군에게 사용 가능."""
    actual_target = target or caster

    actual_target.add_status(ParticleBarrier(
        duration=2,  # 공격 안 받으면 1턴 유지
        source_uid=caster.uid,
    ))
    return {
        "success": True,
        "skill": "입자 방벽",
        "target": actual_target.uid,
    }


@register_skill("zarya", "skill_2")
def zarya_particle_cannon(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """입자포: 기본 5 데미지. 입자 방벽이 공격받았으면 +3."""
    if not target:
        return {"success": False, "message": "대상이 필요합니다"}

    base_damage = game.get_skill_damage(caster, "skill_2")  # 5
    bonus = caster.extra.get("particle_bonus", 0)  # 방벽 맞았으면 +3
    damage = base_damage + bonus

    result = target.take_damage(damage)
    return {
        "success": True,
        "skill": "입자포",
        "base_damage": base_damage,
        "bonus": bonus,
        "damage_log": result,
    }


# ═══════════════════════════════════════════════════════
#  정커퀸
# ═══════════════════════════════════════════════════════

@register_skill("junkerqueen", "skill_1")
def junkerqueen_jagged_blade(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """톱니칼: 약한 딜 + 상대 카드를 한칸 앞으로 당김."""
    if not target:
        return {"success": False, "message": "대상이 필요합니다"}

    damage = game.get_skill_damage(caster, "skill_1")  # 3
    result = target.take_damage(damage)

    # TODO: 상대 카드를 한 칸 앞으로 당기는 로직
    # game.pull_forward(target) 같은 형태로 엔진에서 처리

    return {
        "success": True,
        "skill": "톱니칼",
        "damage_log": result,
        "pull_forward": True,
    }


@register_skill("junkerqueen", "skill_2")
def junkerqueen_commanding_shout(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """지휘의 외침: 주위 아군에게 추가체력 2."""
    allies = game.get_my_field(caster).all_cards()
    logs = []
    for ally in allies:
        ally.add_status(ExtraHP(value=2, duration=2, source_uid=caster.uid))
        logs.append({"target": ally.uid, "extra_hp": 2})

    return {
        "success": True,
        "skill": "지휘의 외침",
        "affected": logs,
    }
