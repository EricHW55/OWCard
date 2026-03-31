"""힐러 영웅 스킬 (전체 13종)."""
from __future__ import annotations
from typing import TYPE_CHECKING
import random
from game_engine.skill_registry import register_skill, register_passive
from game_engine.status_effects import (
    RangeModifier, Knockback, HealAmplify, HealBlock, SkillSilence, DiscordOrb,
)
if TYPE_CHECKING:
    from game_engine.field import FieldCard
    from game_engine.engine import GameState

# ── 아나 ──────────────────────────────────
@register_skill("ana", "skill_1")
def ana_biotic(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target: return {"success": False, "message": "대상 필요"}
    vals = game.get_skill_damage(caster, "skill_1")
    my = game.get_my_field(caster)
    if my.find_card(target.uid):
        return {"success": True, "skill": "생체 소총 (힐)", "healed": target.heal(vals["heal"])}
    return {"success": True, "skill": "생체 소총 (딜)", "damage_log": target.take_damage(vals["damage"])}

# ── 루시우 ────────────────────────────────
@register_skill("lucio", "skill_1")
def lucio_volume(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    from game_engine.field import Zone
    my = game.get_my_field(caster)
    vals = game.get_skill_damage(caster, "skill_1")
    if caster.zone == Zone.MAIN:
        allies = my.get_row(Zone.MAIN)
        logs = [{"uid": a.uid, "healed": a.heal(vals["heal"])} for a in allies]
        return {"success": True, "skill": "볼륨업-힐", "healed": logs}
    else:
        allies = my.get_row(Zone.SIDE)
        for a in allies:
            a.add_status(RangeModifier(value=1, duration=1, source_uid=caster.uid))
        return {"success": True, "skill": "볼륨업-이속", "boosted": len(allies)}

@register_skill("lucio", "skill_2")
def lucio_soundwave(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target: return {"success": False, "message": "대상 필요"}
    target.add_status(Knockback(value=1, duration=1, source_uid=caster.uid))
    return {"success": True, "skill": "소리 파동", "target": target.uid}

# ── 키리코 ────────────────────────────────
@register_passive("kiriko")
def kiriko_passive(card: FieldCard, game: GameState) -> dict:
    card.extra["swift_step_threshold"] = 4
    return {"passive": "순보"}

@register_skill("kiriko", "skill_1")
def kiriko_skill(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    from game_engine.field import Zone
    vals = game.get_skill_damage(caster, "skill_1")
    if caster.zone == Zone.MAIN:
        if not target: return {"success": False, "message": "힐 대상 선택"}
        return {"success": True, "skill": "힐부적", "healed": target.heal(vals["heal"])}
    else:
        if not target: return {"success": False, "message": "공격 대상 선택"}
        return {"success": True, "skill": "쿠나이", "damage_log": target.take_damage(vals["damage"])}

# ── 모이라 ────────────────────────────────
@register_skill("moira", "skill_1")
def moira_grasp(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    ch = caster.extra.get("biotic_charges", 0)
    if ch <= 0: return {"success": False, "message": "충전 필요 (생체 구슬)"}
    heal = game.get_skill_damage(caster, "skill_1")
    my = game.get_my_field(caster)
    col = my.get_column(caster)
    logs = [{"uid": a.uid, "healed": a.heal(heal)} for a in col]
    caster.extra["biotic_charges"] = ch - 1
    return {"success": True, "skill": "생체 손아귀", "healed": logs}

@register_skill("moira", "skill_2")
def moira_orb(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target: return {"success": False, "message": "대상 필요"}
    result = target.take_damage(game.get_skill_damage(caster, "skill_2"))
    caster.extra["biotic_charges"] = caster.extra.get("biotic_charges", 0) + 1
    return {"success": True, "skill": "생체 구슬", "damage_log": result, "charges": caster.extra["biotic_charges"]}

# ── 젠야타 ────────────────────────────────
@register_skill("zenyatta", "skill_1")
def zenyatta_discord(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target: return {"success": False, "message": "대상 필요"}
    target.add_status(DiscordOrb(duration=1, bonus_damage=2, source_uid=caster.uid))
    return {"success": True, "skill": "부조화", "target": target.uid}

@register_skill("zenyatta", "skill_2")
def zenyatta_harmony(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target: return {"success": False, "message": "대상 필요"}
    # return {"success": True, "skill": "조화", "healed": target.heal(game.get_skill_damage(caster, "skill_2"))}
    return {"success": True, "skill": "조화", "healed": target.heal(game.get_skill_damage(caster, "skill_2", apply_attack_buff=False))}

# ── 우양 ──────────────────────────────────
@register_skill("wuyang", "skill_1")
def wuyang_wave(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target: return {"success": False, "message": "대상 필요"}
    my = game.get_my_field(caster)
    if my.find_card(target.uid):
        target.add_status(HealAmplify(value=2, duration=1, source_uid=caster.uid))
        return {"success": True, "skill": "수호의 파도 (힐증)", "target": target.uid}
    target.add_status(Knockback(value=1, duration=1, source_uid=caster.uid))
    return {"success": True, "skill": "수호의 파도 (넉백)", "target": target.uid}

@register_skill("wuyang", "skill_2")
def wuyang_heal(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target: return {"success": False, "message": "대상 필요"}
    # return {"success": True, "skill": "회복의 물결", "healed": target.heal(game.get_skill_damage(caster, "skill_2"))}
    return {"success": True, "skill": "회복의 물결", "healed": target.heal(game.get_skill_damage(caster, "skill_2", apply_attack_buff=False))}

# ── 미즈키 ────────────────────────────────
@register_skill("mizuki", "skill_1")
def mizuki_chains(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target: return {"success": False, "message": "대상 필요"}
    from game_engine.field import Zone
    if target.zone != Zone.SIDE: return {"success": False, "message": "사이드만 가능"}
    target.add_status(SkillSilence(duration=1, source_uid=caster.uid))
    return {"success": True, "skill": "속박사슬", "target": target.uid}

@register_skill("mizuki", "skill_2")
def mizuki_kasa(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    my = game.get_my_field(caster)
    allies = my.all_cards()
    if not allies: return {"success": False, "message": "아군 없음"}
    heals = [0] * len(allies)
    for _ in range(5):
        heals[random.randint(0, len(allies) - 1)] += 1
    logs = [{"uid": allies[i].uid, "healed": allies[i].heal(h)} for i, h in enumerate(heals) if h > 0]
    return {"success": True, "skill": "치유의 삿갓", "healed": logs}

# ── 바티스트 ──────────────────────────────
@register_skill("baptiste", "skill_1")
def baptiste_launcher(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target:
        return {"success": False, "message": "힐 대상 선택"}

    my = game.get_my_field(caster)
    if not my.find_card(target.uid):
        return {"success": False, "message": "아군만 회복할 수 있습니다"}

    heal = game.get_skill_damage(caster, "skill_1", apply_attack_buff=False)
    row = my.get_role_row_in_zone(target.role, target.zone)
    logs = [{"uid": a.uid, "healed": a.heal(heal)} for a in row]

    return {
        "success": True,
        "skill": "생체탄 발사기",
        "target_role": target.role.value,
        "zone": target.zone.value,
        "healed": logs,
    }
    
@register_skill("baptiste", "skill_2")
def baptiste_attack(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target: return {"success": False, "message": "대상 필요"}
    return {"success": True, "skill": "공격", "damage_log": target.take_damage(game.get_skill_damage(caster, "skill_2"))}

# ── 메르시 ────────────────────────────────
@register_passive("mercy")
def mercy_passive(card: FieldCard, game: GameState) -> dict:
    ps = game.get_my_player(card)
    options = []
    if ps:
        options = [
            {
                "index": i,
                "name": c.get("name", "?"),
                "role": c.get("role", "?"),
                "hero_key": c.get("hero_key", ""),
            }
            for i, c in enumerate(ps.trash)
            if not c.get("is_spell", False)
        ]
    if not options:
        return {"passive": "부활", "message": "부활 가능한 영웅 카드 없음"}
    return {
        "passive": "부활",
        "needs_choice": {
            "type": "mercy_resurrect",
            "source_uid": card.uid,
            "options": options,
        },
    }

@register_skill("mercy", "skill_1")
def mercy_staff(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target: return {"success": False, "message": "대상 필요"}
    return {"success": True, "skill": "카두세우스 지팡이", "healed": target.heal(game.get_skill_damage(caster, "skill_1", apply_attack_buff=False))}

# ── 브리기테 ──────────────────────────────
@register_passive("brigitte")
def brigitte_passive(card: FieldCard, game: GameState) -> dict:
    """격려: 배치 시 + 매턴 시작 시 아군 모두 2힐."""
    heal_amount = int(card.extra.get("inspire_heal", 2) or 2)
    card.extra["inspire_heal"] = heal_amount
    my = game.get_my_field(card)
    logs = []
    for a in my.all_cards():
        # if a.uid == card.uid:
        #     continue
        healed = a.heal(heal_amount)
        logs.append({"uid": a.uid, "healed": healed})
    return {
        "passive": "격려",
        "triggered": True,
        "heal_amount": heal_amount,
        "healed": logs,
    }
    #     if healed > 0:
    #         logs.append({"uid": a.uid, "healed": healed})
    # return {"passive": "격려", "healed": logs}

@register_skill("brigitte", "skill_1")
def brigitte_repair(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target: return {"success": False, "message": "대상 필요"}
    return {"success": True, "skill": "수리팩", "healed": target.heal(game.get_skill_damage(caster, "skill_1", apply_attack_buff=False))}

# ── 일리아리 ──────────────────────────────
@register_passive("illari")
def illari_passive(card: FieldCard, game: GameState) -> dict:
    from game_engine.field import Zone
    if card.zone != Zone.MAIN:
        return {"passive": "힐포탑 설치", "message": "본대에서만 설치 가능"}
    return {
        "passive": "힐포탑 설치",
        "summon_token": {
            "hero_key": "illari_pylon",
            "name": "힐 포탑",
            "role": "healer",
            "hp": card.extra.get("turret_hp", 3),
            "attack": 0,
            "defense": 0,
            "attack_range": 1,
            "description": "내 턴 시작 시 가장 체력이 낮은 아군 1명 치유.",
            "skill_damages": {"auto": card.extra.get("turret_heal", 3)},
            "skill_meta": {},
            "extra": {
                "is_token": True,
                "token_kind": "illari_pylon",
                "heal": card.extra.get("turret_heal", 3),
                "parent_uid": card.uid,
            },
            "zone": card.zone.value,
        },
    }

@register_skill("illari", "skill_1")
def illari_solar(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target: return {"success": False, "message": "대상 필요"}
    return {"success": True, "skill": "태양 소총", "damage_log": target.take_damage(game.get_skill_damage(caster, "skill_1"))}

# ── 주노 ──────────────────────────────────
@register_passive("juno")
def juno_passive(card: FieldCard, game: GameState) -> dict:
    my = game.get_my_field(card)
    for a in my.all_cards():
        a.add_status(RangeModifier(value=1, duration=1, source_uid=card.uid))
    return {"passive": "하이퍼링"}

@register_skill("juno", "skill_1")
def juno_torpedoes(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target:
        return {"success": False, "message": "힐 대상 선택"}

    my = game.get_my_field(caster)
    if not my.find_card(target.uid):
        return {"success": False, "message": "아군만 회복할 수 있습니다"}

    heal = game.get_skill_damage(caster, "skill_1", apply_attack_buff=False)
    row = my.get_role_row(target.role, include_side=True)
    logs = [{"uid": a.uid, "healed": a.heal(heal)} for a in row]

    return {
        "success": True,
        "skill": "펄사어뢰",
        "target_role": target.role.value,
        "healed": logs,
    }

# ── 제트팩 캣 ─────────────────────────────
@register_passive("jetpack_cat")
def jetpack_cat_passive(card: FieldCard, game: GameState) -> dict:
    ps = game.get_my_player(card)
    options = []
    if ps:
        options = [
            {"index": i, "name": c.get("name", "?"), "role": c.get("role", "?")}
            for i, c in enumerate(ps.hand)
            # if not c.get("is_spell", False)
            if (not c.get("is_spell", False)) and c.get("role") != "tank"
        ]
    if not options:
        # return {"passive": "생명줄", "message": "추가 배치할 영웅 카드 없음"}
        return {"passive": "생명줄", "message": "견인 가능한 영웅 카드(탱커 제외) 없음"}
    return {
        "passive": "생명줄",
        "needs_choice": {
            "type": "jetpack_cat_extra_place",
            "source_uid": card.uid,
            "options": options,
        },
    }

@register_skill("jetpack_cat", "skill_1")
def jetpack_cat_nyan(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target: return {"success": False, "message": "대상 필요"}
    return {"success": True, "skill": "생체 냥냥탄", "healed": target.heal(game.get_skill_damage(caster, "skill_1", apply_attack_buff=False))}