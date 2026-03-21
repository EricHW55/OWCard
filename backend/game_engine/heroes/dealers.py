"""
딜러 영웅 스킬.

다양한 타겟팅 패턴 예시:
  - 위도우메이커: 거리 무시 (명사수) + 확률 헤드샷
  - 바스티온: 폼 전환 (강습/수색)
  - 메이: 패시브 빙결 부활
  - 캐서디/리퍼: 거리별 데미지 감소
  - 에코: 점착폭탄 (지연 데미지)
  - 시메트라: 카드 이동 + 차징 공격
"""
from __future__ import annotations
from typing import TYPE_CHECKING
import random

from game_engine.skill_registry import register_skill, register_passive
from game_engine.status_effects import (
    FrozenRevive, Airborne, Burrowed, Stealth, Burn,
    StickyBomb, Charging, RangeModifier,
)

if TYPE_CHECKING:
    from game_engine.field import FieldCard
    from game_engine.engine import GameState


# ═══════════════════════════════════════════════════════
#  위도우메이커
# ═══════════════════════════════════════════════════════

@register_passive("widowmaker")
def widowmaker_passive(card: FieldCard, game: GameState) -> dict:
    """명사수: 거리 영향 안 받음 → 사거리를 99로 설정."""
    card.base_attack_range = 99
    return {"passive": "명사수"}


@register_skill("widowmaker", "skill_1")
def widowmaker_kiss(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """죽음의 입맞춤: 25% 확률 헤드샷 3배.
    skill_damages["skill_1"] = 4"""
    if not target:
        return {"success": False, "message": "대상이 필요합니다"}

    base_damage = game.get_skill_damage(caster, "skill_1")  # 4
    headshot = random.random() < 0.25
    damage = base_damage * 3 if headshot else base_damage

    result = target.take_damage(damage)
    return {
        "success": True,
        "skill": "죽음의 입맞춤",
        "headshot": headshot,
        "damage_log": result,
    }


# ═══════════════════════════════════════════════════════
#  바스티온
# ═══════════════════════════════════════════════════════

@register_skill("bastion", "skill_1")
def bastion_assault(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """설정: 강습. 높은 데미지, 연속 사용 불가.
    skill_damages["skill_1"] = 10"""
    if caster.extra.get("last_mode") == "assault":
        return {"success": False, "message": "연속 사용 불가 (수색 모드를 먼저 사용하세요)"}
    if not target:
        return {"success": False, "message": "대상이 필요합니다"}

    damage = game.get_skill_damage(caster, "skill_1")  # 10
    result = target.take_damage(damage)
    caster.extra["last_mode"] = "assault"

    return {
        "success": True,
        "skill": "설정: 강습",
        "damage_log": result,
    }


@register_skill("bastion", "skill_2")
def bastion_recon(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """설정: 수색. 약한 데미지 (기본 모드).
    skill_damages["skill_2"] = 2"""
    if not target:
        return {"success": False, "message": "대상이 필요합니다"}

    damage = game.get_skill_damage(caster, "skill_2")  # 2
    result = target.take_damage(damage)
    caster.extra["last_mode"] = "recon"

    return {
        "success": True,
        "skill": "설정: 수색",
        "damage_log": result,
    }


# ═══════════════════════════════════════════════════════
#  메이
# ═══════════════════════════════════════════════════════

@register_passive("mei")
def mei_passive(card: FieldCard, game: GameState) -> dict:
    """급속 빙결: 죽으면 한턴 얼음 → 반피 부활."""
    card.add_status(FrozenRevive(
        revive_hp=card.max_hp // 2,
        source_uid=card.uid,
    ))
    return {"passive": "급속 빙결"}


@register_skill("mei", "skill_1")
def mei_endothermic(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """냉각총. skill_damages["skill_1"] = 5"""
    if not target:
        return {"success": False, "message": "대상이 필요합니다"}

    damage = game.get_skill_damage(caster, "skill_1")
    result = target.take_damage(damage)
    return {"success": True, "skill": "냉각총", "damage_log": result}


# ═══════════════════════════════════════════════════════
#  프레야
# ═══════════════════════════════════════════════════════

@register_skill("pharah", "skill_1")
def pharah_skill(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """상승기류+정조준: 공중 상태로 전환. 다음 턴에 한칸 무시 공격.
    공중 상태에서는 피격 사거리 -1 (더 쉽게 맞음).
    skill_damages["skill_1"] = 8"""
    caster.add_status(Airborne(duration=1, source_uid=caster.uid))
    return {
        "success": True,
        "skill": "상승기류",
        "message": "다음 턴에 한칸 무시하고 공격 가능",
    }


# ═══════════════════════════════════════════════════════
#  벤처
# ═══════════════════════════════════════════════════════

@register_skill("venture", "skill_1")
def venture_burrow(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """잠복: 타겟팅 제외 + 다음 턴 한칸 무시 공격. 연속 사용 불가.
    skill_damages["skill_1"] = 7"""
    if caster.extra.get("used_burrow_last_turn"):
        return {"success": False, "message": "연속 사용 불가"}

    caster.add_status(Burrowed(duration=1, source_uid=caster.uid))
    caster.extra["used_burrow_last_turn"] = True
    return {"success": True, "skill": "잠복"}


@register_skill("venture", "skill_2")
def venture_drill(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """스마트 굴착기. skill_damages["skill_2"] = 3"""
    if not target:
        return {"success": False, "message": "대상이 필요합니다"}

    damage = game.get_skill_damage(caster, "skill_2")
    result = target.take_damage(damage)
    caster.extra["used_burrow_last_turn"] = False
    return {"success": True, "skill": "스마트 굴착기", "damage_log": result}


# ═══════════════════════════════════════════════════════
#  에코
# ═══════════════════════════════════════════════════════

@register_skill("echo", "skill_1")
def echo_sticky_bombs(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """점착폭탄: 즉시 4 + 다음턴 4 추가 폭발.
    skill_damages["skill_1"] = [4, 4]  (즉시, 폭발)"""
    if not target:
        return {"success": False, "message": "대상이 필요합니다"}

    damages = game.get_skill_damage(caster, "skill_1")  # [4, 4]
    immediate = damages[0]
    explode = damages[1]

    result = target.take_damage(immediate)
    target.add_status(StickyBomb(
        duration=1,
        explode_damage=explode,
        source_uid=caster.uid,
    ))
    return {
        "success": True,
        "skill": "점착폭탄",
        "immediate_damage": result,
        "bomb_attached": explode,
    }


@register_skill("echo", "skill_2")
def echo_focusing_beam(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """광선집중: 반피 이하면 1.5배 데미지.
    skill_damages["skill_2"] = 6"""
    if not target:
        return {"success": False, "message": "대상이 필요합니다"}

    base = game.get_skill_damage(caster, "skill_2")  # 6
    if target.current_hp <= target.max_hp / 2:
        damage = int(base * 1.5)  # 9
    else:
        damage = base

    result = target.take_damage(damage)
    return {
        "success": True,
        "skill": "광선집중",
        "half_hp_bonus": target.current_hp <= target.max_hp / 2,
        "damage_log": result,
    }


# ═══════════════════════════════════════════════════════
#  캐서디 (거리별 데미지 감소 패턴)
# ═══════════════════════════════════════════════════════

@register_skill("cassidy", "skill_1")
def cassidy_fan_the_hammer(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """난사: 탱커에 강하고 멀수록 약해짐.
    skill_damages["skill_1"] = [8, 4, 2]  (거리1~3)"""
    if not target:
        return {"success": False, "message": "대상이 필요합니다"}

    damage_table = game.get_skill_damage(caster, "skill_1")
    distance = game.get_distance_between(caster, target)
    idx = min(distance - 1, len(damage_table) - 1)
    damage = damage_table[idx]

    result = target.take_damage(damage)
    return {
        "success": True,
        "skill": "난사",
        "distance": distance,
        "damage_log": result,
    }


# ═══════════════════════════════════════════════════════
#  시메트라
# ═══════════════════════════════════════════════════════

@register_skill("symmetra", "skill_1")
def symmetra_teleporter(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """순간이동기: 아군을 사이드↔본대로 이동."""
    if not target:
        return {"success": False, "message": "이동할 아군을 선택하세요"}

    my_field = game.get_my_field(caster)
    from game_engine.field import Zone
    new_zone = Zone.SIDE if target.zone == Zone.MAIN else Zone.MAIN

    if my_field.move_card(target, new_zone):
        return {"success": True, "skill": "순간이동기", "moved": target.uid, "to": new_zone.value}
    return {"success": False, "message": "이동 불가 (자리 없음)"}


@register_skill("symmetra", "skill_2")
def symmetra_photon_projector(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """광자 발사기: 같은 대상 때릴수록 증가. 3턴에 걸쳐 2→4→8.
    skill_damages["skill_2"] = [2, 4, 8]"""
    if not target:
        return {"success": False, "message": "대상이 필요합니다"}

    damage_table = game.get_skill_damage(caster, "skill_2")  # [2, 4, 8]
    last_target = caster.extra.get("photon_target")
    charge = caster.extra.get("photon_charge", 0)

    if last_target == target.uid:
        charge = min(charge + 1, len(damage_table) - 1)
    else:
        charge = 0  # 대상 바뀌면 리셋

    damage = damage_table[charge]
    result = target.take_damage(damage)

    caster.extra["photon_target"] = target.uid
    caster.extra["photon_charge"] = charge

    return {
        "success": True,
        "skill": "광자 발사기",
        "charge_level": charge,
        "damage_log": result,
    }


# ═══════════════════════════════════════════════════════
#  애쉬
# ═══════════════════════════════════════════════════════

@register_skill("ashe", "skill_1")
def ashe_viper(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """바이퍼. skill_damages["skill_1"] = 6"""
    if not target:
        return {"success": False, "message": "대상이 필요합니다"}
    damage = game.get_skill_damage(caster, "skill_1")
    result = target.take_damage(damage)
    return {"success": True, "skill": "바이퍼", "damage_log": result}


@register_skill("ashe", "skill_2")
def ashe_dynamite(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """다이너마이트: 한 가로줄에 화상 (매턴 1 데미지).
    target으로 영역(zone)을 지정."""
    enemy_field = game.get_enemy_field(caster)
    from game_engine.field import Zone
    zone = Zone(target.zone) if target else Zone.MAIN
    targets = enemy_field.get_row(zone)

    logs = []
    for card in targets:
        card.add_status(Burn(
            damage_per_turn=1,
            duration=3,
            source_uid=caster.uid,
        ))
        logs.append({"target": card.uid, "burn_applied": True})

    return {
        "success": True,
        "skill": "다이너마이트",
        "affected": logs,
    }


# ═══════════════════════════════════════════════════════
#  솔져:76
# ═══════════════════════════════════════════════════════

@register_skill("soldier76", "skill_1")
def soldier76_biotic_field(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """생체장: 같은 가로줄 힐, 연속 사용 불가.
    skill_damages["skill_1"] = 3 (힐량)"""
    if caster.extra.get("used_biotic_last_turn"):
        return {"success": False, "message": "연속 사용 불가"}

    heal_amount = game.get_skill_damage(caster, "skill_1")
    my_field = game.get_my_field(caster)
    allies = my_field.get_row(caster.zone)

    logs = []
    for ally in allies:
        healed = ally.heal(heal_amount)
        logs.append({"target": ally.uid, "healed": healed})

    caster.extra["used_biotic_last_turn"] = True
    return {"success": True, "skill": "생체장", "healed": logs}


@register_skill("soldier76", "skill_2")
def soldier76_pulse_rifle(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """펄스 소총. skill_damages["skill_2"] = 6"""
    if not target:
        return {"success": False, "message": "대상이 필요합니다"}
    caster.extra["used_biotic_last_turn"] = False  # 리셋
    damage = game.get_skill_damage(caster, "skill_2")
    result = target.take_damage(damage)
    return {"success": True, "skill": "펄스 소총", "damage_log": result}


# ═══════════════════════════════════════════════════════
#  트레이서
# ═══════════════════════════════════════════════════════

@register_passive("tracer")
def tracer_passive(card: FieldCard, game: GameState) -> dict:
    """점멸: 한 단계 무시 공격 (사거리+1 효과)."""
    card.base_attack_range += 1
    card.extra["last_hp"] = card.current_hp
    return {"passive": "점멸"}


@register_skill("tracer", "skill_1")
def tracer_pulse(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """펄스 쌍권총: 5딜."""
    if not target:
        return {"success": False, "message": "대상이 필요합니다"}
    caster.extra["last_hp"] = caster.current_hp  # 역행용 저장
    damage = game.get_skill_damage(caster, "skill_1")
    result = target.take_damage(damage)
    return {"success": True, "skill": "펄스 쌍권총", "damage_log": result}


@register_skill("tracer", "skill_2")
def tracer_recall(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """역행: 이전 턴 체력으로 복구."""
    last_hp = caster.extra.get("last_hp", caster.current_hp)
    healed = max(0, last_hp - caster.current_hp)
    caster.current_hp = min(caster.max_hp, last_hp)
    return {"success": True, "skill": "역행", "restored_hp": healed}


# ═══════════════════════════════════════════════════════
#  한조
# ═══════════════════════════════════════════════════════

@register_passive("hanzo")
def hanzo_passive(card: FieldCard, game: GameState) -> dict:
    """명사수: 거리 무시."""
    card.base_attack_range = 99
    return {"passive": "명사수"}


@register_skill("hanzo", "skill_1")
def hanzo_storm_bow(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """폭풍활: 25% 헤드샷 2배. 기본 5딜."""
    if not target:
        return {"success": False, "message": "대상이 필요합니다"}
    import random
    base = game.get_skill_damage(caster, "skill_1")
    headshot = random.random() < 0.25
    damage = base * 2 if headshot else base
    result = target.take_damage(damage)
    return {"success": True, "skill": "폭풍활", "headshot": headshot, "damage_log": result}


# ═══════════════════════════════════════════════════════
#  솜브라
# ═══════════════════════════════════════════════════════

@register_passive("sombra")
def sombra_passive(card: FieldCard, game: GameState) -> dict:
    """기회주의자: 배치 시 상대 설치 스킬 유무 확인."""
    return {"passive": "기회주의자"}


@register_skill("sombra", "skill_1")
def sombra_smg(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """기관단총: 5딜."""
    if not target:
        return {"success": False, "message": "대상이 필요합니다"}
    damage = game.get_skill_damage(caster, "skill_1")
    result = target.take_damage(damage)
    return {"success": True, "skill": "기관단총", "damage_log": result}


@register_skill("sombra", "skill_2")
def sombra_stealth(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """은신: 타겟 제외 + 3힐. 연속 사용 불가."""
    if caster.extra.get("used_stealth_last"):
        return {"success": False, "message": "연속 사용 불가"}
    caster.add_status(Stealth(heal_amount=3, duration=1, source_uid=caster.uid))
    healed = caster.heal(3)
    caster.extra["used_stealth_last"] = True
    return {"success": True, "skill": "은신", "healed": healed}


# ═══════════════════════════════════════════════════════
#  리퍼
# ═══════════════════════════════════════════════════════

@register_skill("reaper", "skill_1")
def reaper_hellfire(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """헬파이어 샷건: 거리별 데미지 [8,4,1]."""
    if not target:
        return {"success": False, "message": "대상이 필요합니다"}
    damage_table = game.get_skill_damage(caster, "skill_1")
    distance = game.get_distance_between(caster, target)
    idx = min(distance - 1, len(damage_table) - 1)
    damage = damage_table[idx]
    result = target.take_damage(damage)
    return {"success": True, "skill": "헬파이어 샷건", "distance": distance, "damage_log": result}


# ═══════════════════════════════════════════════════════
#  토르비욘
# ═══════════════════════════════════════════════════════

@register_skill("torbjorn", "skill_1")
def torbjorn_rivet(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """대못 발사기: 4딜."""
    if not target:
        return {"success": False, "message": "대상이 필요합니다"}
    damage = game.get_skill_damage(caster, "skill_1")
    result = target.take_damage(damage)
    return {"success": True, "skill": "대못 발사기", "damage_log": result}


@register_skill("torbjorn", "skill_2")
def torbjorn_hammer(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """대장간 망치: 포탑 3hp 수리 (미구현 시 자힐)."""
    healed = caster.heal(3)
    return {"success": True, "skill": "대장간 망치", "healed": healed}


# ═══════════════════════════════════════════════════════
#  소전
# ═══════════════════════════════════════════════════════

@register_skill("sojourn", "skill_1")
def sojourn_railgun(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """레일건: 2딜 + 차징 1단계 충전."""
    if not target:
        return {"success": False, "message": "대상이 필요합니다"}
    damage = game.get_skill_damage(caster, "skill_1")
    result = target.take_damage(damage)
    charge = caster.extra.get("charge_level", 0)
    caster.extra["charge_level"] = min(charge + 1, 3)
    return {"success": True, "skill": "레일건", "damage_log": result, "charge": caster.extra["charge_level"]}


@register_skill("sojourn", "skill_2")
def sojourn_charged_shot(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """차징샷: 차징 단계별 데미지 [2,5,8]."""
    if not target:
        return {"success": False, "message": "대상이 필요합니다"}
    charge = caster.extra.get("charge_level", 0)
    if charge <= 0:
        return {"success": False, "message": "충전이 필요합니다"}
    damage_table = game.get_skill_damage(caster, "skill_2")
    idx = min(charge - 1, len(damage_table) - 1)
    damage = damage_table[idx]
    result = target.take_damage(damage)
    caster.extra["charge_level"] = 0
    return {"success": True, "skill": "차징샷", "charge_used": charge, "damage_log": result}