"""
힐러 영웅 스킬.

힐 패턴 예시:
  - 아나: 단일 힐/딜 겸용
  - 루시우: 위치에 따라 다른 효과 (본대=광역힐, 사이드=이속)
  - 키리코: 위치에 따라 스킬이 바뀜 (본대=힐, 사이드=딜)
  - 모이라: 차징식 (딜 → 힐 충전)
  - 젠야타: 부조화(적 디버프) + 조화(아군 힐)
"""
from __future__ import annotations
from typing import TYPE_CHECKING

from game_engine.skill_registry import register_skill, register_passive
from game_engine.status_effects import (
    RangeModifier, Knockback, HealAmplify, HealBlock, SkillSilence,
)

if TYPE_CHECKING:
    from game_engine.field import FieldCard
    from game_engine.engine import GameState


# ═══════════════════════════════════════════════════════
#  아나
# ═══════════════════════════════════════════════════════

@register_skill("ana", "skill_1")
def ana_biotic_rifle(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """생체 소총: 아군이면 힐, 적이면 딜.
    skill_damages["skill_1"] = {"heal": 5, "damage": 3}"""
    if not target:
        return {"success": False, "message": "대상이 필요합니다"}

    values = game.get_skill_damage(caster, "skill_1")  # {"heal": 5, "damage": 3}

    # 아군인지 적군인지 판단
    my_field = game.get_my_field(caster)
    is_ally = my_field.find_card(target.uid) is not None

    if is_ally:
        healed = target.heal(values["heal"])
        return {"success": True, "skill": "생체 소총 (힐)", "healed": healed}
    else:
        result = target.take_damage(values["damage"])
        return {"success": True, "skill": "생체 소총 (딜)", "damage_log": result}


# ═══════════════════════════════════════════════════════
#  루시우
# ═══════════════════════════════════════════════════════

@register_skill("lucio", "skill_1")
def lucio_volume_up(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """볼륨업: 본대에 있으면 광역힐, 사이드에 있으면 이속(한칸 무시).
    skill_damages["skill_1"] = {"heal": 2}"""
    from game_engine.field import Zone

    my_field = game.get_my_field(caster)
    values = game.get_skill_damage(caster, "skill_1")

    if caster.zone == Zone.MAIN:
        # 본대: 영역 전부 소량힐
        allies = my_field.get_row(Zone.MAIN)
        logs = []
        for ally in allies:
            healed = ally.heal(values["heal"])
            logs.append({"target": ally.uid, "healed": healed})
        return {"success": True, "skill": "볼륨업-힐", "healed": logs}
    else:
        # 사이드: 이속 → 사이드 아군이 한칸 무시 가능
        allies = my_field.get_row(Zone.SIDE)
        logs = []
        for ally in allies:
            ally.add_status(RangeModifier(
                value=1, duration=1, source_uid=caster.uid,
            ))
            logs.append({"target": ally.uid, "speed_boost": True})
        return {"success": True, "skill": "볼륨업-이속", "boosted": logs}


@register_skill("lucio", "skill_2")
def lucio_soundwave(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """소리 파동: 맞은 상대는 사거리 -1."""
    if not target:
        return {"success": False, "message": "대상이 필요합니다"}

    target.add_status(Knockback(
        value=1, duration=1, source_uid=caster.uid,
    ))
    return {"success": True, "skill": "소리 파동", "target": target.uid}


# ═══════════════════════════════════════════════════════
#  키리코
# ═══════════════════════════════════════════════════════

@register_passive("kiriko")
def kiriko_passive(card: FieldCard, game: GameState) -> dict:
    """순보: 사이드에서 체력 4 이하 → 본대로 자동 이동."""
    # on_take_damage 후에 엔진에서 체크
    card.extra["swift_step_threshold"] = 4
    return {"passive": "순보"}


@register_skill("kiriko", "skill_1")
def kiriko_skill(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """본대: 힐부적 (단일 4힐), 사이드: 쿠나이 (5딜).
    skill_damages["skill_1"] = {"heal": 4, "damage": 5}"""
    from game_engine.field import Zone

    values = game.get_skill_damage(caster, "skill_1")

    if caster.zone == Zone.MAIN:
        if not target:
            return {"success": False, "message": "힐 대상을 선택하세요"}
        healed = target.heal(values["heal"])
        return {"success": True, "skill": "힐부적", "healed": healed}
    else:
        if not target:
            return {"success": False, "message": "공격 대상을 선택하세요"}
        result = target.take_damage(values["damage"])
        return {"success": True, "skill": "쿠나이", "damage_log": result}


# ═══════════════════════════════════════════════════════
#  모이라
# ═══════════════════════════════════════════════════════

@register_skill("moira", "skill_1")
def moira_biotic_grasp_heal(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """생체 손아귀: 세로열 힐 5. 생체 구슬로 충전해야 사용 가능.
    skill_damages["skill_1"] = 5"""
    charges = caster.extra.get("biotic_charges", 0)
    if charges <= 0:
        return {"success": False, "message": "충전이 필요합니다 (생체 구슬 사용)"}

    heal_amount = game.get_skill_damage(caster, "skill_1")
    my_field = game.get_my_field(caster)
    column = my_field.get_column(caster)

    logs = []
    for ally in column:
        healed = ally.heal(heal_amount)
        logs.append({"target": ally.uid, "healed": healed})

    caster.extra["biotic_charges"] = charges - 1
    return {"success": True, "skill": "생체 손아귀", "healed": logs}


@register_skill("moira", "skill_2")
def moira_biotic_orb(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """생체 구슬: 2 딜 + 충전 1 획득.
    skill_damages["skill_2"] = 2"""
    if not target:
        return {"success": False, "message": "대상이 필요합니다"}

    damage = game.get_skill_damage(caster, "skill_2")
    result = target.take_damage(damage)

    # 충전 획득
    caster.extra["biotic_charges"] = caster.extra.get("biotic_charges", 0) + 1

    return {
        "success": True,
        "skill": "생체 구슬",
        "damage_log": result,
        "charges": caster.extra["biotic_charges"],
    }


# ═══════════════════════════════════════════════════════
#  젠야타
# ═══════════════════════════════════════════════════════

@register_skill("zenyatta", "skill_1")
def zenyatta_discord(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """부조화: 상대에게 들어가는 딜량 +2 (1턴)."""
    if not target:
        return {"success": False, "message": "대상이 필요합니다"}

    from game_engine.status_effects import AttackBuff
    # 대상이 받는 데미지를 증가시키는 디버프 (DamageAmplify로 구현)
    target.add_status(AttackBuff(
        name="discord",
        value=-2,  # 방어력 감소로 구현 (데미지 +2와 동일 효과)
        duration=1,
        source_uid=caster.uid,
        tags=["debuff"],
    ))
    return {"success": True, "skill": "부조화", "target": target.uid}


@register_skill("zenyatta", "skill_2")
def zenyatta_harmony(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """조화: 단일 힐 3. skill_damages["skill_2"] = 3"""
    if not target:
        return {"success": False, "message": "대상이 필요합니다"}
    heal_amount = game.get_skill_damage(caster, "skill_2")
    healed = target.heal(heal_amount)
    return {"success": True, "skill": "조화", "healed": healed}


# ═══════════════════════════════════════════════════════
#  우양
# ═══════════════════════════════════════════════════════

@register_skill("lifeweaver", "skill_1")
def lifeweaver_rejuvenating_dash(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """수호의 파도: 세로 2칸. 아군이면 힐증, 적이면 넉백.
    세로로 선착순 두 칸이 맞음."""
    # TODO: 세로줄 타겟팅은 엔진에서 계산 필요
    # 임시로 단일 대상 처리
    if not target:
        return {"success": False, "message": "대상이 필요합니다"}

    my_field = game.get_my_field(caster)
    is_ally = my_field.find_card(target.uid) is not None

    if is_ally:
        target.add_status(HealAmplify(value=2, duration=1, source_uid=caster.uid))
        return {"success": True, "skill": "수호의 파도 (힐증)", "target": target.uid}
    else:
        target.add_status(Knockback(value=1, duration=1, source_uid=caster.uid))
        return {"success": True, "skill": "수호의 파도 (넉백)", "target": target.uid}


@register_skill("lifeweaver", "skill_2")
def lifeweaver_healing_blossom(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """회복의 물결: 단일 힐 3. skill_damages["skill_2"] = 3"""
    if not target:
        return {"success": False, "message": "대상이 필요합니다"}
    healed = target.heal(game.get_skill_damage(caster, "skill_2"))
    return {"success": True, "skill": "회복의 물결", "healed": healed}


# ═══════════════════════════════════════════════════════
#  미즈키
# ═══════════════════════════════════════════════════════

@register_skill("mizuki", "skill_1")
def mizuki_binding_chains(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """속박사슬: 상대 사이드 카드 한턴 스킬 봉쇄."""
    if not target:
        return {"success": False, "message": "대상이 필요합니다"}
    from game_engine.field import Zone
    if target.zone != Zone.SIDE:
        return {"success": False, "message": "사이드 카드만 대상 가능"}

    target.add_status(SkillSilence(duration=1, source_uid=caster.uid))
    return {"success": True, "skill": "속박사슬", "target": target.uid}


@register_skill("mizuki", "skill_2")
def mizuki_healing_kasa(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """치유의 삿갓: 총 5 힐이 랜덤 배분.
    1명=5, 2명=2+3, 3명=2+2+1, 5명=1씩"""
    import random

    my_field = game.get_my_field(caster)
    allies = my_field.all_cards()
    total_heal = 5

    if not allies:
        return {"success": False, "message": "힐할 아군이 없습니다"}

    # 랜덤 배분
    heals = [0] * len(allies)
    for _ in range(total_heal):
        idx = random.randint(0, len(allies) - 1)
        heals[idx] += 1

    logs = []
    for i, ally in enumerate(allies):
        if heals[i] > 0:
            healed = ally.heal(heals[i])
            logs.append({"target": ally.uid, "healed": healed})

    return {"success": True, "skill": "치유의 삿갓", "healed": logs}


# ═══════════════════════════════════════════════════════
#  바티스트
# ═══════════════════════════════════════════════════════

@register_skill("baptiste", "skill_1")
def baptiste_biotic_launcher(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """생체탄 발사기: 가로줄 광역 힐 3."""
    my_field = game.get_my_field(caster)
    allies = my_field.get_row(caster.zone)
    heal_amount = game.get_skill_damage(caster, "skill_1")
    logs = []
    for ally in allies:
        healed = ally.heal(heal_amount)
        logs.append({"target": ally.uid, "healed": healed})
    return {"success": True, "skill": "생체탄 발사기", "healed": logs}


@register_skill("baptiste", "skill_2")
def baptiste_attack(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """공격: 3딜."""
    if not target:
        return {"success": False, "message": "대상이 필요합니다"}
    damage = game.get_skill_damage(caster, "skill_2")
    result = target.take_damage(damage)
    return {"success": True, "skill": "공격", "damage_log": result}


# ═══════════════════════════════════════════════════════
#  메르시
# ═══════════════════════════════════════════════════════

@register_passive("mercy")
def mercy_passive(card: FieldCard, game: GameState) -> dict:
    """부활: 트래시에서 카드 1장 소생 (엔진에서 처리)."""
    card.extra["resurrect_used"] = False
    return {"passive": "부활"}


@register_skill("mercy", "skill_1")
def mercy_caduceus(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """카두세우스 지팡이: 단일 힐 3."""
    if not target:
        return {"success": False, "message": "힐 대상을 선택하세요"}
    heal_amount = game.get_skill_damage(caster, "skill_1")
    healed = target.heal(heal_amount)
    return {"success": True, "skill": "카두세우스 지팡이", "healed": healed}


# ═══════════════════════════════════════════════════════
#  브리기테
# ═══════════════════════════════════════════════════════

@register_passive("brigitte")
def brigitte_passive(card: FieldCard, game: GameState) -> dict:
    """격려: 주위 아군에게 1 힐."""
    my_field = game.get_my_field(card)
    for ally in my_field.all_cards():
        if ally.uid != card.uid:
            ally.heal(1)
    return {"passive": "격려"}


@register_skill("brigitte", "skill_1")
def brigitte_repair_pack(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """수리팩: 거리 무관 단일 힐 3."""
    if not target:
        return {"success": False, "message": "힐 대상을 선택하세요"}
    heal_amount = game.get_skill_damage(caster, "skill_1")
    healed = target.heal(heal_amount)
    return {"success": True, "skill": "수리팩", "healed": healed}


# ═══════════════════════════════════════════════════════
#  일리아리 (힐러)
# ═══════════════════════════════════════════════════════

@register_skill("illari", "skill_1")
def illari_solar_rifle(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """태양 소총: 5딜."""
    if not target:
        return {"success": False, "message": "대상이 필요합니다"}
    damage = game.get_skill_damage(caster, "skill_1")
    result = target.take_damage(damage)
    return {"success": True, "skill": "태양 소총", "damage_log": result}


# ═══════════════════════════════════════════════════════
#  주노
# ═══════════════════════════════════════════════════════

@register_passive("juno")
def juno_passive(card: FieldCard, game: GameState) -> dict:
    """하이퍼링: 배치 시 아군 사거리+1."""
    my_field = game.get_my_field(card)
    for ally in my_field.all_cards():
        ally.add_status(RangeModifier(value=1, duration=1, source_uid=card.uid))
    return {"passive": "하이퍼링"}


@register_skill("juno", "skill_1")
def juno_torpedoes(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """펄사어뢰: 같은 열 모두에게 3힐."""
    my_field = game.get_my_field(caster)
    column = my_field.get_column(caster)
    heal_amount = game.get_skill_damage(caster, "skill_1")
    logs = []
    for ally in column:
        healed = ally.heal(heal_amount)
        logs.append({"target": ally.uid, "healed": healed})
    return {"success": True, "skill": "펄사어뢰", "healed": logs}


# ═══════════════════════════════════════════════════════
#  제트팩 캣
# ═══════════════════════════════════════════════════════

@register_skill("jetpack_cat", "skill_1")
def jetpack_cat_nyanbullet(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """생체 냥냥탄: 단일 힐 3."""
    if not target:
        return {"success": False, "message": "힐 대상을 선택하세요"}
    heal_amount = game.get_skill_damage(caster, "skill_1")
    healed = target.heal(heal_amount)
    return {"success": True, "skill": "생체 냥냥탄", "healed": healed}