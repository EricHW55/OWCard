"""딜러 영웅 스킬 (전체 17종)."""
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

# ── 바스티온 ──────────────────────────────
@register_skill("bastion", "skill_1")
def bastion_assault(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if caster.extra.get("last_mode") == "assault": return {"success": False, "message": "연속 사용 불가 (수색 먼저)"}
    if not target: return {"success": False, "message": "대상 필요"}
    result = target.take_damage(game.get_skill_damage(caster, "skill_1"))
    caster.extra["last_mode"] = "assault"
    return {"success": True, "skill": "설정: 강습", "damage_log": result}

@register_skill("bastion", "skill_2")
def bastion_recon(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target: return {"success": False, "message": "대상 필요"}
    result = target.take_damage(game.get_skill_damage(caster, "skill_2"))
    caster.extra["last_mode"] = "recon"
    return {"success": True, "skill": "설정: 수색", "damage_log": result}

# ── 프레야 ────────────────────────────────
@register_skill("freja", "skill_1")
def freja_updraft(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """
    상승기류
    - 에어본 3턴 유지 (내턴 -> 상대턴 -> 다음 내턴)
    - 재사용 시 지속시간 갱신
    """
    caster.remove_status("airborne")
    caster.add_status(Airborne(duration=3, source_uid=caster.uid))
    return {
        "success": True,
        "skill": "상승기류",
        "message": "에어본 상태 돌입 (내턴-니턴-내턴 유지)",
    }

@register_skill("freja", "skill_2")
def freja_lockon(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """
    정조준
    - 에어본 상태에서만 사용 가능
    - 8 데미지
    - 사용 후 에어본 해제
    """
    if not caster.has_status("airborne"):
        return {"success": False, "message": "에어본 상태에서만 사용 가능"}

    if not target:
        return {"success": False, "message": "대상 필요"}

    dmg = game.get_skill_damage(caster, "skill_2")
    result = target.take_damage(dmg)
    caster.remove_status("airborne")

    return {
        "success": True,
        "skill": "정조준",
        "damage_log": result,
        "message": "정조준 사용 후 착지",
    }

# ── 트레이서 ──────────────────────────────
@register_passive("tracer")
def tracer_passive(card: FieldCard, game: GameState) -> dict:
    card.base_attack_range += 1
    card.extra["last_hp"] = card.current_hp
    return {"passive": "점멸"}

@register_skill("tracer", "skill_1")
def tracer_pulse(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target: return {"success": False, "message": "대상 필요"}
    caster.extra["last_hp"] = caster.current_hp
    result = target.take_damage(game.get_skill_damage(caster, "skill_1"))
    return {"success": True, "skill": "펄스 쌍권총", "damage_log": result}

@register_skill("tracer", "skill_2")
def tracer_recall(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    last = caster.extra.get("last_hp", caster.current_hp)
    caster.current_hp = min(caster.max_hp, last)
    return {"success": True, "skill": "역행", "hp_restored_to": caster.current_hp}

# ── 위도우메이커 ──────────────────────────
@register_passive("widowmaker")
def widowmaker_passive(card: FieldCard, game: GameState) -> dict:
    card.base_attack_range = 99
    return {"passive": "명사수"}

@register_skill("widowmaker", "skill_1")
def widowmaker_kiss(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target: return {"success": False, "message": "대상 필요"}
    base = game.get_skill_damage(caster, "skill_1")
    hs = random.random() < 0.25
    result = target.take_damage(base * 3 if hs else base)
    return {"success": True, "skill": "죽음의 입맞춤", "headshot": hs, "damage_log": result}

# ── 한조 ──────────────────────────────────
@register_passive("hanzo")
def hanzo_passive(card: FieldCard, game: GameState) -> dict:
    card.base_attack_range = 99
    return {"passive": "명사수"}

@register_skill("hanzo", "skill_1")
def hanzo_storm(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target: return {"success": False, "message": "대상 필요"}
    base = game.get_skill_damage(caster, "skill_1")
    hs = random.random() < 0.25
    result = target.take_damage(base * 2 if hs else base)
    return {"success": True, "skill": "폭풍활", "headshot": hs, "damage_log": result}

# ── 벤처 ──────────────────────────────────
@register_skill("venture", "skill_1")
def venture_burrow(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if caster.extra.get("used_burrow_last"): return {"success": False, "message": "연속 사용 불가"}
    if caster.has_status("burrowed"):
        # 잠복 상태 → 한칸 무시 공격
        if not target: return {"success": False, "message": "대상 필요"}
        dmg = game.get_skill_damage(caster, "skill_1")
        result = target.take_damage(dmg)
        caster.remove_status("burrowed")
        caster.extra["used_burrow_last"] = True
        return {"success": True, "skill": "잠복 공격", "damage_log": result}
    caster.add_status(Burrowed(duration=2, source_uid=caster.uid))
    return {"success": True, "skill": "잠복"}

@register_skill("venture", "skill_2")
def venture_drill(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target: return {"success": False, "message": "대상 필요"}
    result = target.take_damage(game.get_skill_damage(caster, "skill_2"))
    caster.extra["used_burrow_last"] = False
    return {"success": True, "skill": "스마트 굴착기", "damage_log": result}

# ── 솜브라 ────────────────────────────────
@register_passive("sombra")
def sombra_passive(card: FieldCard, game: GameState) -> dict:
    # 배치 시 상대 설치 스킬 유무 탐지 (프론트에서 표시)
    enemy = game.get_enemy_field(card)
    has_install = any(any("install" in s.tags for s in c.statuses) for c in enemy.all_cards())
    return {"passive": "기회주의자", "enemy_has_install": has_install}

@register_skill("sombra", "skill_1")
def sombra_smg(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target: return {"success": False, "message": "대상 필요"}
    result = target.take_damage(game.get_skill_damage(caster, "skill_1"))
    caster.extra["used_stealth_last"] = False
    return {"success": True, "skill": "기관단총", "damage_log": result}

@register_skill("sombra", "skill_2")
def sombra_stealth(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if caster.extra.get("used_stealth_last"): return {"success": False, "message": "연속 불가"}
    caster.add_status(Stealth(heal_amount=3, duration=3, source_uid=caster.uid))
    healed = caster.heal(3)
    caster.extra["used_stealth_last"] = True
    return {"success": True, "skill": "은신", "healed": healed}

# ── 에코 ──────────────────────────────────
@register_skill("echo", "skill_1")
def echo_bombs(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target: return {"success": False, "message": "대상 필요"}
    dmgs = game.get_skill_damage(caster, "skill_1")
    result = target.take_damage(dmgs[0])
    target.add_status(StickyBomb(duration=1, explode_damage=dmgs[1], source_uid=caster.uid))
    return {"success": True, "skill": "점착폭탄", "damage_log": result, "bomb": dmgs[1]}

@register_skill("echo", "skill_2")
def echo_beam(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target: return {"success": False, "message": "대상 필요"}
    base = game.get_skill_damage(caster, "skill_2")
    dmg = int(base * 1.5) if target.current_hp <= target.max_hp / 2 else base
    result = target.take_damage(dmg)
    return {"success": True, "skill": "광선집중", "half_hp_bonus": dmg > base, "damage_log": result}

# ── 캐서디 ────────────────────────────────
@register_skill("cassidy", "skill_1")
def cassidy_fan(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target: return {"success": False, "message": "대상 필요"}
    tbl = game.get_skill_damage(caster, "skill_1")
    idx = game.get_actual_slot_index(target, tbl, side_as_front=True)
    dmg = tbl[idx]
    result = target.take_damage(dmg)
    return {"success": True, "skill": "난사", "slot_index": idx, "damage_log": result}

# ── 리퍼 ──────────────────────────────────
register_skill("reaper", "skill_1")
def reaper_hellfire(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target: return {"success": False, "message": "대상 필요"}
    tbl = game.get_skill_damage(caster, "skill_1")
    idx = game.get_actual_slot_index(target, tbl, side_as_front=True)
    dmg = tbl[idx]
    result = target.take_damage(dmg)
    return {"success": True, "skill": "헬파이어 샷건", "slot_index": idx, "damage_log": result}

# ── 메이 ──────────────────────────────────
@register_passive("mei")
def mei_passive(card: FieldCard, game: GameState) -> dict:
    card.add_status(FrozenRevive(revive_hp=card.max_hp // 2, source_uid=card.uid))
    return {"passive": "급속 빙결"}

@register_skill("mei", "skill_1")
def mei_blaster(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target: return {"success": False, "message": "대상 필요"}
    result = target.take_damage(game.get_skill_damage(caster, "skill_1"))
    return {"success": True, "skill": "냉각총", "damage_log": result}

# ── 애쉬 ──────────────────────────────────
@register_skill("ashe", "skill_1")
def ashe_viper(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target: return {"success": False, "message": "대상 필요"}
    result = target.take_damage(game.get_skill_damage(caster, "skill_1"))
    return {"success": True, "skill": "바이퍼", "damage_log": result}

@register_skill("ashe", "skill_2")
def ashe_dynamite(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    from game_engine.field import Zone
    enemy = game.get_enemy_field(caster)
    zone = target.zone if target else Zone.MAIN
    targets = enemy.get_row(zone)
    for c in targets:
        c.add_status(Burn(damage_per_turn=1, duration=3, source_uid=caster.uid))
    return {"success": True, "skill": "다이너마이트", "burned": len(targets)}

# ── 솔져:76 ──────────────────────────────
@register_skill("soldier76", "skill_1")
def soldier76_biotic(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if caster.extra.get("used_biotic_last"): return {"success": False, "message": "연속 불가"}
    my = game.get_my_field(caster)
    heal = game.get_skill_damage(caster, "skill_1")
    logs = [{"uid": a.uid, "healed": a.heal(heal)} for a in my.get_row(caster.zone)]
    caster.extra["used_biotic_last"] = True
    return {"success": True, "skill": "생체장", "healed": logs}

@register_skill("soldier76", "skill_2")
def soldier76_pulse(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target: return {"success": False, "message": "대상 필요"}
    caster.extra["used_biotic_last"] = False
    result = target.take_damage(game.get_skill_damage(caster, "skill_2"))
    return {"success": True, "skill": "펄스 소총", "damage_log": result}

# ── 시메트라 ──────────────────────────────
@register_skill("symmetra", "skill_1")
def symmetra_tp(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target: return {"success": False, "message": "이동할 아군 선택"}
    from game_engine.field import Zone
    my = game.get_my_field(caster)
    new_zone = Zone.SIDE if target.zone == Zone.MAIN else Zone.MAIN
    if my.move_card(target, new_zone):
        return {"success": True, "skill": "순간이동기", "moved": target.uid, "to": new_zone.value}
    return {"success": False, "message": "이동 불가"}

@register_skill("symmetra", "skill_2")
def symmetra_photon(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target: return {"success": False, "message": "대상 필요"}
    tbl = game.get_skill_damage(caster, "skill_2")
    last = caster.extra.get("photon_target")
    ch = caster.extra.get("photon_charge", 0)
    ch = min(ch + 1, len(tbl) - 1) if last == target.uid else 0
    result = target.take_damage(tbl[ch])
    caster.extra["photon_target"] = target.uid
    caster.extra["photon_charge"] = ch
    return {"success": True, "skill": "광자 발사기", "charge": ch, "damage_log": result}

# ── 토르비욘 ──────────────────────────────
@register_passive("torbjorn")
def torbjorn_passive(card: FieldCard, game: GameState) -> dict:
    from game_engine.field import Zone
    if card.zone != Zone.MAIN:
        return {"passive": "포탑 설치", "message": "본대에서만 설치 가능"}
    return {
        "passive": "포탑 설치",
        "summon_token": {
            "hero_key": "torbjorn_turret",
            "name": "토르비욘 포탑",
            "role": "dealer",
            "hp": card.extra.get("turret_hp", 5),
            "attack": 0,
            "defense": 0,
            "attack_range": 1,
            "description": "내 턴 시작 시 가까운 적 1명에게 자동 공격.",
            "skill_damages": {"auto": card.extra.get("turret_damage", 2)},
            "skill_meta": {},
            "extra": {
                "is_token": True,
                "token_kind": "torbjorn_turret",
                "damage": card.extra.get("turret_damage", 2),
                "parent_uid": card.uid,
            },
            "zone": card.zone.value,
        },
    }

@register_skill("torbjorn", "skill_1")
def torbjorn_rivet(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target: return {"success": False, "message": "대상 필요"}
    result = target.take_damage(game.get_skill_damage(caster, "skill_1"))
    return {"success": True, "skill": "대못 발사기", "damage_log": result}

@register_skill("torbjorn", "skill_2")
def torbjorn_hammer(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    healed = caster.heal(3)
    return {"success": True, "skill": "대장간 망치", "healed": healed}

# ── 소전 ──────────────────────────────────
@register_skill("sojourn", "skill_1")
def sojourn_rail(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target:
        return {"success": False, "message": "대상 필요"}

    result = target.take_damage(game.get_skill_damage(caster, "skill_1"))
    ch = min(caster.extra.get("charge_level", 0) + 1, 3)
    caster.extra["charge_level"] = ch
    return {
        "success": True,
        "skill": "레일건",
        "damage_log": result,
        "charge": ch,
        "charge_level": ch,
    }

@register_skill("sojourn", "skill_2")
def sojourn_charged(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target:
        return {"success": False, "message": "대상 필요"}

    ch = caster.extra.get("charge_level", 0)
    if ch <= 0:
        return {"success": False, "message": "충전 필요"}

    enemy = game.get_enemy_field(caster)
    tbl = game.get_skill_damage(caster, "skill_2")
    dmg = tbl[min(ch - 1, len(tbl) - 1)]
    column = enemy.get_column(target)
    logs = []
    for card in column:
        logs.append({"target": card.uid, "damage_log": card.take_damage(dmg)})

    caster.extra["charge_level"] = 0
    return {
        "success": True,
        "skill": "차징샷",
        "charge_used": ch,
        "charge_level": 0,
        "affected": logs,
        "column_size": len(column),
    }

# ── 엠레 (신규) ──────────────────────────
@register_skill("emre", "skill_1")
def emre_grenade(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """사이버 파편 수류탄: 6딜 + 랜덤 바운스 3딜."""
    if not target: return {"success": False, "message": "대상 필요"}
    dmgs = game.get_skill_damage(caster, "skill_1")  # [6, 3]
    main_d = dmgs[0] if isinstance(dmgs, list) else dmgs
    bounce_d = dmgs[1] if isinstance(dmgs, list) and len(dmgs) > 1 else 0
    result = target.take_damage(main_d)
    logs = [{"target": target.uid, "damage_log": result}]
    if bounce_d > 0:
        enemy = game.get_enemy_field(caster)
        others = [c for c in enemy.all_cards() if c.uid != target.uid and c.alive]
        if others:
            bounce_target = random.choice(others)
            br = bounce_target.take_damage(bounce_d)
            logs.append({"target": bounce_target.uid, "bounce_damage": br})
    return {"success": True, "skill": "사이버 파편 수류탄", "damage_logs": logs}