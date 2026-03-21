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


# ═══════════════════════════════════════════════════════
#  윈스턴
# ═══════════════════════════════════════════════════════

@register_skill("winston", "skill_1")
def winston_tesla(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """테슬라 캐논: 단일 4딜."""
    if not target:
        return {"success": False, "message": "대상이 필요합니다"}
    damage = game.get_skill_damage(caster, "skill_1")
    result = target.take_damage(damage)
    return {"success": True, "skill": "테슬라 캐논", "damage_log": result}


@register_skill("winston", "skill_2")
def winston_barrier(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """방벽 생성기: 아군에게 영구 방벽 5 부여."""
    actual = target or caster
    actual.add_status(Barrier(barrier_hp=5, duration=-1, source_uid=caster.uid))
    return {"success": True, "skill": "방벽 생성기", "target": actual.uid}


# ═══════════════════════════════════════════════════════
#  레킹볼
# ═══════════════════════════════════════════════════════

@register_passive("wrecking_ball")
def wrecking_ball_passive(card: FieldCard, game: GameState) -> dict:
    """갈고리: 스킬 전 본대/사이드 이동 가능."""
    return {"passive": "갈고리"}


@register_skill("wrecking_ball", "skill_1")
def wrecking_ball_piledriver(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """파일드라이버: 6딜."""
    if not target:
        return {"success": False, "message": "대상이 필요합니다"}
    damage = game.get_skill_damage(caster, "skill_1")
    result = target.take_damage(damage)
    return {"success": True, "skill": "파일드라이버", "damage_log": result}


# ═══════════════════════════════════════════════════════
#  둠피스트
# ═══════════════════════════════════════════════════════

@register_skill("doomfist", "skill_1")
def doomfist_rocket_punch(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """로켓 펀치: 대상 5딜 + 뒤 카드 3딜."""
    if not target:
        return {"success": False, "message": "대상이 필요합니다"}
    damages = game.get_skill_damage(caster, "skill_1")  # [5, 3]
    main_dmg = damages[0] if isinstance(damages, list) else damages
    behind_dmg = damages[1] if isinstance(damages, list) and len(damages) > 1 else 0

    result = target.take_damage(main_dmg)
    logs = [{"target": target.uid, "damage_log": result}]

    # 뒤 카드에도 데미지
    if behind_dmg > 0:
        enemy_field = game.get_enemy_field(caster)
        layers = enemy_field._main_layers()
        target_dist = enemy_field.get_distance(target)
        for layer in layers:
            for c in layer:
                if enemy_field.get_distance(c) == target_dist + 1:
                    behind_result = c.take_damage(behind_dmg)
                    logs.append({"target": c.uid, "behind_damage": behind_result})

    return {"success": True, "skill": "로켓 펀치", "damage_logs": logs}


@register_skill("doomfist", "skill_2")
def doomfist_power_block(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """파워블락: 피해 감소 + 강화 펀치 활성화."""
    from game_engine.status_effects import DamageReduction
    caster.add_status(DamageReduction(percent=50, duration=1, source_uid=caster.uid))
    caster.extra["empowered_punch"] = True
    return {"success": True, "skill": "파워블락"}


# ═══════════════════════════════════════════════════════
#  시그마
# ═══════════════════════════════════════════════════════

@register_skill("sigma", "skill_1")
def sigma_barrier(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """실험용 방벽: 도발 + 내구도 10 방벽."""
    from game_engine.status_effects import Taunt
    caster.add_status(Barrier(barrier_hp=10, duration=-1, source_uid=caster.uid))
    caster.add_status(Taunt(duration=-1, source_uid=caster.uid))
    return {"success": True, "skill": "실험용 방벽"}


@register_skill("sigma", "skill_2")
def sigma_accretion(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """초재생: 방벽 내구도 5 회복."""
    barrier = caster.get_status("barrier")
    if barrier:
        barrier.barrier_hp = min(barrier.barrier_hp + 5, 10)
    return {"success": True, "skill": "초재생", "barrier_hp": barrier.barrier_hp if barrier else 0}


# ═══════════════════════════════════════════════════════
#  라마트라
# ═══════════════════════════════════════════════════════

@register_skill("ramattra", "skill_1")
def ramattra_vortex(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """탐식의 소용돌이: 한 역할군에게 사거리-1 + 2딜 (일반 폼)."""
    if caster.extra.get("form") == "nemesis":
        return {"success": False, "message": "일반 폼에서만 사용 가능"}
    if not target:
        return {"success": False, "message": "대상이 필요합니다"}
    from game_engine.status_effects import Knockback
    damage = game.get_skill_damage(caster, "skill_1")
    result = target.take_damage(damage)
    target.add_status(Knockback(value=1, duration=1, source_uid=caster.uid))
    return {"success": True, "skill": "탐식의 소용돌이", "damage_log": result}


@register_skill("ramattra", "skill_2")
def ramattra_form_change(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """폼 체인지: 일반↔네메시스 전환."""
    if caster.extra.get("form") == "nemesis":
        caster.extra["form"] = "normal"
        caster.max_hp -= 10
        caster.current_hp = min(caster.current_hp, caster.max_hp)
        return {"success": True, "skill": "폼 체인지", "form": "normal"}
    else:
        caster.extra["form"] = "nemesis"
        caster.max_hp += 10
        caster.current_hp += 10
        return {"success": True, "skill": "폼 체인지", "form": "nemesis"}


@register_skill("ramattra", "skill_3")
def ramattra_block(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """막기: 50% 피해감소 (네메시스 폼)."""
    if caster.extra.get("form") != "nemesis":
        return {"success": False, "message": "네메시스 폼에서만 사용 가능"}
    from game_engine.status_effects import DamageReduction
    caster.add_status(DamageReduction(percent=50, duration=1, source_uid=caster.uid))
    return {"success": True, "skill": "막기"}