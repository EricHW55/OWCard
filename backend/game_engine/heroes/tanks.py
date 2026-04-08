"""탱커 영웅 스킬 (전체 11종)."""
from __future__ import annotations
from typing import TYPE_CHECKING
from game_engine.skill_registry import register_skill, register_passive
from game_engine.status_effects import (
    Barrier, Exposed, ParticleBarrier, AttackBuff, ExtraHP,
    NextTurnStartDamageReduction, Knockback, Taunt, Pulled, Hooked, Airborne,
    Burn, OrisaFortifyPassive, HealBlock
)
if TYPE_CHECKING:
    from game_engine.field import FieldCard
    from game_engine.engine import GameState

# ── 라인하르트 ────────────────────────────
@register_passive("reinhardt")
def reinhardt_passive(card: FieldCard, game: GameState) -> dict:
    card.add_status(Barrier(barrier_hp=15, blocks_passthrough=True, has_taunt=True, duration=-1, source_uid=card.uid))
    return {"barrier_created": 15, "taunt": True}

@register_skill("reinhardt", "skill_1")
def reinhardt_fire_strike(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target: return {"success": False, "message": "대상 필요"}
    result = target.take_damage(game.get_skill_damage(caster, "skill_1"), ignore_barrier=True)
    return {"success": True, "skill": "화염강타", "damage_log": result}

# ── 윈스턴 ────────────────────────────────
@register_skill("winston", "skill_1")
def winston_tesla(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    from game_engine.field import Zone, Role

    if not target:
        return {"success": False, "message": "대상 필요"}
    if target.zone == Zone.SIDE:
        return {"success": False, "message": "테슬라 캐논은 본대 가로줄만 공격 가능"}

    enemy = game.get_enemy_field(caster)
    targets = enemy.get_role_row(target.role, include_side=False)
    dmg = game.get_skill_damage(caster, "skill_1")
    logs = []
    for card in targets:
        logs.append({"target": card.uid, "damage_log": card.take_damage(dmg)})
    return {"success": True, "skill": "테슬라 캐논", "affected": logs, "target_role": target.role.value if isinstance(target.role, Role) else str(target.role)}

@register_skill("winston", "skill_2")
def winston_barrier(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    t = target or caster
    t.add_status(Barrier(barrier_hp=5, duration=-1, source_uid=caster.uid))
    return {"success": True, "skill": "방벽 생성기", "target": t.uid}

# ── 디바 ──────────────────────────────────
@register_passive("dva")
def dva_passive(card: FieldCard, game: GameState) -> dict:
    card.extra["form"] = "mech"
    card.extra["mech_profile"] = {
        "hero_key": "dva",
        "name": card.name,
        "hp": card.max_hp,
        "attack_range": card.base_attack_range,
        "skill_damages": dict(card.skill_damages),
        "skill_meta": dict(card.skill_meta),
    }
    card.extra["hana_profile"] = {
        "hero_key": "hana_song",
        "name": "송하나",
        "hp": card.extra.get("hana_hp", 5),
        "attack_range": 1,
        "skill_damages": {"skill_1": 1},
        "skill_meta": {
            "skill_1": {"name": "광선총", "cooldown": 0, "description": "사거리 1에서 1 피해를 준다."},
            "skill_2": {"name": "메카 호출", "cooldown": 0, "description": "송하나 상태에서 2턴 이후 메카를 다시 호출한다."},
        },
    }
    from game_engine.status_effects import MechDestruction
    card.add_status(MechDestruction(hana_hp=card.extra.get("hana_hp", 5), source_uid=card.uid))
    return {"mech_form": True}

@register_skill("dva", "skill_1")
def dva_booster(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if caster.extra.get("form") != "mech":
        return {"success": False, "message": "메카만 가능"}
    if not target:
        return {"success": False, "message": "대상 필요"}

    result = target.take_damage(game.get_skill_damage(caster, "skill_1"))
    caster.remove_status("exposed")
    caster.add_status(Exposed(duration=2, source_uid=caster.uid))

    return {
        "success": True,
        "skill": "부스터",
        "damage_log": result,
        "message": "다음 상대 턴까지 패싱당함",
    }

@register_skill("dva", "skill_2")
def dva_micro_missiles(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if caster.extra.get("form") != "mech":
        return {"success": False, "message": "메카만 가능"}
    if not target:
        return {"success": False, "message": "대상 필요"}

    dmg_table = game.get_skill_damage(caster, "skill_2")
    idx = game.get_shotgun_slot_index(caster, target, dmg_table)
    dmg = dmg_table[idx]
    result = target.take_damage(dmg)

    return {
        "success": True,
        "skill": "마이크로 미사일",
        "slot_index": idx,
        "damage_log": result,
    }
    
@register_skill("hana_song", "skill_1")
def hana_light_gun(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target:
        return {"success": False, "message": "대상 필요"}
    result = target.take_damage(1)
    return {"success": True, "skill": "광선총", "damage_log": result}

@register_skill("hana_song", "skill_2")
def hana_call_mech(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if caster.extra.get("form") != "hana":
        return {"success": False, "message": "송하나만 가능"}
    status = caster.get_status("mech_destruction")
    if status is None:
        return {"success": False, "message": "메카 파괴 패시브 없음"}
    status.restore_mech(caster)
    return {"success": True, "skill": "메카 호출", "restore_mech": True}

# ── 자리야 ────────────────────────────────
@register_skill("zarya", "skill_1")
def zarya_particle_barrier(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    t = target or caster
    t.add_status(ParticleBarrier(duration=-1, source_uid=caster.uid))
    return {"success": True, "skill": "입자 방벽", "target": t.uid}

@register_skill("zarya", "skill_2")
def zarya_particle_cannon(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target: return {"success": False, "message": "대상 필요"}
    base = game.get_skill_damage(caster, "skill_2")
    charge = max(
        int(caster.extra.get("particle_bonus", 0) or 0),
        int(caster.extra.get("particle_barrier_charge", 0) or 0),
        int(caster.extra.get("zarya_charge", 0) or 0),
    )
    bonus = charge * 2
    result = target.take_damage(base + bonus)
    if charge > 0:
        caster.extra["particle_bonus"] = 0
        caster.extra["particle_barrier_charge"] = 0
        caster.extra["zarya_charge"] = 0
    return {"success": True, "skill": "입자포", "base": base, "bonus": bonus, "damage_log": result}

# ── 레킹볼 ────────────────────────────────
@register_skill("wrecking_ball", "skill_1")
def wrecking_ball_hook(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    from game_engine.field import Zone

    if not target:
        return {"success": False, "message": "대상 필요"}

    my_field = game.get_my_field(caster)
    to_zone = Zone.SIDE if caster.zone == Zone.MAIN else Zone.MAIN
    moved = my_field.move_card_with_options(
        caster,
        to_zone,
        ignore_limits=False,
        ignore_side_limit=(to_zone == Zone.SIDE),
    )
    if not moved:
        if to_zone == Zone.SIDE:
            return {"success": False, "message": "행동 불가: 사이드 자리가 꽉 찼습니다"}
        return {"success": False, "message": "행동 불가: 본대 탱커 자리가 꽉 찼습니다"}
    
    result = target.take_damage(game.get_skill_damage(caster, "skill_1"))
    
    return {"success": True, "skill": "갈고리", "moved_to": caster.zone.value, "damage_log": result}
    
@register_skill("wrecking_ball", "skill_2")
def wrecking_ball_piledriver(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target:
        return {"success": False, "message": "대상 필요"}
    result = target.take_damage(game.get_skill_damage(caster, "skill_2"))
    target.add_status(Airborne(duration=1, source_uid=caster.uid))
    return {"success": True, "skill": "파일드라이버", "damage_log": result, "airborne": True}

# ── 정커퀸 ────────────────────────────────
@register_skill("junkerqueen", "skill_1")
def junkerqueen_jagged(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target:
        return {"success": False, "message": "대상 필요"}

    result = target.take_damage(game.get_skill_damage(caster, "skill_1"))
    target.add_status(Pulled(value=1, duration=1, source_uid=caster.uid))

    return {
        "success": True,
        "skill": "톱니칼",
        "damage_log": result,
        "pulled": True,
    }

@register_skill("junkerqueen", "skill_2")
def junkerqueen_shout(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    allies = game.get_my_field(caster).all_cards()
    for a in allies:
        a.add_status(ExtraHP(value=2, duration=2, source_uid=caster.uid))
    return {"success": True, "skill": "지휘의 외침", "affected": len(allies)}

# ── 둠피스트 ──────────────────────────────
@register_skill("doomfist", "skill_1")
def doomfist_punch(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target:
        return {"success": False, "message": "대상 필요"}

    empowered = bool(caster.extra.pop("empowered_punch", False))
    enemy = game.get_enemy_field(caster)
    td = enemy.get_distance(target)
    
    if empowered:
        dmg = game.get_skill_damage(caster, "skill_1_empowered")
        result = target.take_damage(dmg)
        for layer in enemy._main_layers():
            for c in layer:
                if enemy.get_distance(c) == td + 1:
                    c.take_damage(dmg)
        return {"success": True, "skill": "강화 로켓 펀치", "damage_log": result}

    dmgs = game.get_skill_damage(caster, "skill_1")
    main_d = dmgs[0] if isinstance(dmgs, list) else dmgs
    behind_d = dmgs[1] if isinstance(dmgs, list) and len(dmgs) > 1 else 0
    result = target.take_damage(main_d)
    if behind_d > 0:
        for layer in enemy._main_layers():
            for c in layer:
                if enemy.get_distance(c) == td + 1:
                    c.take_damage(behind_d)
    return {"success": True, "skill": "로켓 펀치", "damage_log": result}

@register_skill("doomfist", "skill_2")
def doomfist_block(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    # 강화 펀치는 1회만 저장(중복 파워블락으로 중첩되지 않음)
    caster.remove_status("next_turn_start_damage_reduction")
    caster.add_status(NextTurnStartDamageReduction(percent=50, source_uid=caster.uid))
    caster.extra["empowered_punch"] = True
    return {"success": True, "skill": "파워블락"}

# ── 시그마 ────────────────────────────────
@register_skill("sigma", "skill_1")
def sigma_barrier(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    caster.add_status(Barrier(barrier_hp=10, duration=-1, source_uid=caster.uid))
    caster.add_status(Taunt(duration=-1, source_uid=caster.uid))
    return {"success": True, "skill": "실험용 방벽"}

@register_skill("sigma", "skill_2")
def sigma_regen(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    b = caster.get_status("barrier")
    if b: b.barrier_hp = min(b.barrier_hp + 5, 10)
    return {"success": True, "skill": "초재생", "barrier_hp": b.barrier_hp if b else 0}

# ── 라마트라 ──────────────────────────────
@register_skill("ramattra", "skill_1")
def ramattra_vortex(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if caster.extra.get("form") == "nemesis": return {"success": False, "message": "일반 폼만"}
    if not target: return {"success": False, "message": "대상 필요"}
    result = target.take_damage(game.get_skill_damage(caster, "skill_1"))
    target.add_status(Knockback(value=1, duration=1, source_uid=caster.uid))
    return {"success": True, "skill": "탐식의 소용돌이", "damage_log": result}

@register_skill("ramattra", "skill_2")
def ramattra_form(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if caster.extra.get("form") == "nemesis":
        caster.extra["form"] = "normal"
        caster.max_hp -= 10
        caster.current_hp = min(caster.current_hp, caster.max_hp)
        return {"success": True, "skill": "폼 체인지", "form": "normal"}
    caster.extra["form"] = "nemesis"
    caster.max_hp += 10; caster.current_hp += 10
    return {"success": True, "skill": "폼 체인지", "form": "nemesis"}

@register_skill("ramattra", "skill_3")
def ramattra_block(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if caster.extra.get("form") != "nemesis": return {"success": False, "message": "네메시스만"}
    caster.remove_status("next_turn_start_damage_reduction")
    caster.add_status(NextTurnStartDamageReduction(percent=50, source_uid=caster.uid))
    return {"success": True, "skill": "막기"}

# ── 도미나 (신규) ─────────────────────────
@register_skill("domina", "skill_1")
def domina_crystal(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """수정 발사: 탱커 무시, 딜러진만 광역 3딜. 딜러 없으면 0."""
    from game_engine.field import Role
    enemy = game.get_enemy_field(caster)
    dealer_cards = [c for c in enemy.all_cards() if c.role == Role.DEALER]
    dmg = game.get_skill_damage(caster, "skill_1")
    logs = []
    for c in dealer_cards:
        r = c.take_damage(dmg)
        logs.append({"target": c.uid, "damage_log": r})
    return {"success": True, "skill": "수정 발사", "affected": logs}

@register_skill("domina", "skill_2")
def domina_barrier(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """방벽 배열: 자신에게 내구도4 방벽 + 도발."""
    # caster.add_status(Barrier(barrier_hp=4, duration=-1, source_uid=caster.uid))
    # caster.add_status(Taunt(duration=-1, source_uid=caster.uid))
    caster.add_status(Barrier(barrier_hp=4, has_taunt=True, duration=-1, source_uid=caster.uid))
    return {"success": True, "skill": "방벽 배열"}

# ── 로드호그 (신규) ───────────────────────
@register_skill("roadhog", "skill_1")
def roadhog_hook(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """갈고리: 사거리 3, 적 1명 지정. 이번 턴 아군이 거의 거리 무시로 공격 가능."""
    if not target:
        return {"success": False, "message": "대상 필요"}

    target.add_status(Hooked(duration=1, source_uid=caster.uid))
    return {
        "success": True,
        "skill": "갈고리",
        "hooked": target.uid,
    }

@register_skill("roadhog", "skill_2")
def roadhog_breather(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """숨돌리기: 자힐 5. HP 15 이하에서만 사용 가능."""
    threshold = caster.extra.get("heal_threshold", 15)
    if caster.current_hp > threshold:
        return {"success": False, "message": f"피 {threshold} 이상이면 사용할 수 없습니다"}
    heal_amt = game.get_skill_damage(caster, "skill_2", apply_attack_buff=False)
    healed = caster.heal(heal_amt)
    return {"success": True, "skill": "숨돌리기", "healed": healed}


# ── 마우가 (신규) ───────────────────────
@register_passive("mauga")
def mauga_passive(card: FieldCard, game: GameState) -> dict:
    return {"lifesteal_vs_burn": True}


def _mauga_heal_from_burn_damage(caster: FieldCard, target: FieldCard, damage_log: dict) -> int:
    if not target.has_status("burn"):
        return 0
    dealt = int(damage_log.get("final_damage", 0) or 0)
    if dealt <= 0:
        return 0
    return caster.heal(dealt)


@register_skill("mauga", "skill_1")
def mauga_gunny(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target:
        return {"success": False, "message": "대상 필요"}

    result = target.take_damage(game.get_skill_damage(caster, "skill_1"))
    target.add_status(Burn(
        damage_per_turn=max(2, int(caster.extra.get("burn_damage", 2))),
        duration=int(caster.extra.get("burn_duration", 3)),
        source_uid=caster.uid,
    ))
    healed = _mauga_heal_from_burn_damage(caster, target, result)
    return {"success": True, "skill": "화염기관포 거니", "damage_log": result, "healed": healed}


@register_skill("mauga", "skill_2")
def mauga_chacha(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target:
        return {"success": False, "message": "대상 필요"}

    base = game.get_skill_damage(caster, "skill_2")
    dmg = base * 2 if target.has_status("burn") else base
    result = target.take_damage(dmg)
    healed = _mauga_heal_from_burn_damage(caster, target, result)
    return {"success": True, "skill": "촉발기관포 차차", "damage_log": result, "damage": dmg, "healed": healed}


# ── 오리사 (신규) ───────────────────────
@register_passive("orisa")
def orisa_passive(card: FieldCard, game: GameState) -> dict:
    card.add_status(OrisaFortifyPassive(source_uid=card.uid))
    return {"fortify_passive": True}


def _orisa_has_javelin_bonus_target(enemy_field, target) -> bool:
    from game_engine.field import Role

    if target.role == Role.TANK:
        return len(enemy_field.get_role_row_in_zone(Role.DEALER, target.zone)) > 0
    if target.role == Role.DEALER:
        return len(enemy_field.get_role_row_in_zone(Role.HEALER, target.zone)) > 0
    return False


@register_skill("orisa", "skill_1")
def orisa_javelin(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target:
        return {"success": False, "message": "대상 필요"}

    enemy = game.get_enemy_field(caster)
    base = game.get_skill_damage(caster, "skill_1")
    bonus = 2 if _orisa_has_javelin_bonus_target(enemy, target) else 0
    result = target.take_damage(base + bonus)
    return {"success": True, "skill": "투창", "damage_log": result, "bonus_damage": bonus}


# ── 해저드 (신규) ───────────────────────
@register_passive("hazard")
def hazard_passive(card: FieldCard, game: GameState) -> dict:
    """날카로운 저항: 피격 시 공격자에게 2 반격."""
    card.extra["hazard_retaliate"] = int(card.extra.get("hazard_retaliate", 2) or 2)
    card.extra["hazard_wall_hp"] = int(card.extra.get("hazard_wall_hp", 6) or 6)
    return {"passive": "날카로운 저항", "retaliate_damage": card.extra["hazard_retaliate"]}


@register_skill("hazard", "skill_1")
def hazard_thorn_wall(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """가시벽: 상대 필드(본대/사이드)의 빈 칸에 내구도 6 벽 설치. 한 번에 하나만 유지."""
    from game_engine.field import FieldCard as FC, Role, Zone
    import uuid

    zone = str(caster.extra.get("_skill_target_zone") or "main").lower()
    role_raw = str(caster.extra.get("_skill_target_role") or "").lower()
    slot_raw = caster.extra.get("_skill_target_slot_index")
    slot_index = int(slot_raw) if slot_raw is not None else None

    if zone not in {Zone.MAIN.value, Zone.SIDE.value}:
        return {"success": False, "message": "가시벽 설치 위치는 main 또는 side 여야 합니다"}
    if role_raw not in {"tank", "dealer", "healer"}:
        return {"success": False, "message": "설치할 역할군을 선택하세요 (tank/dealer/healer)"}
    if zone == Zone.MAIN.value:
        if role_raw == "tank" and slot_index not in (None, 0):
            return {"success": False, "message": "탱커 칸은 슬롯 0만 선택할 수 있습니다"}
        if role_raw in {"dealer", "healer"} and slot_index not in (0, 1):
            return {"success": False, "message": "딜러/힐러는 슬롯 0 또는 1을 선택해야 합니다"}
    elif slot_index not in (None, 0):
        return {"success": False, "message": "사이드 칸은 슬롯 0만 선택할 수 있습니다"}

    role = Role(role_raw)
    slot = 0 if slot_index is None else int(slot_index)
    target_zone = Zone(zone)

    enemy_field = game.get_enemy_field(caster)
    hp = int(caster.extra.get("hazard_wall_hp", 6) or 6)

    cards_in_zone = enemy_field.main_cards if target_zone == Zone.MAIN else enemy_field.side_cards
    for card in cards_in_zone:
        if not card.alive:
            continue
        if card.role != role:
            continue
        card_slot = int(card.extra.get("slot_index", 0) or 0)
        if card_slot == slot:
            return {"success": False, "message": "선택한 칸이 비어있지 않습니다"}

    existing_walls = [
        c for c in enemy_field.main_cards
        if c.alive and c.extra.get("token_kind") == "hazard_wall" and c.extra.get("source_uid") == caster.uid
    ]
    for wall in existing_walls:
        wall.current_hp = 0
    enemy_field.remove_dead()

    wall = FC(
        uid=uuid.uuid4().hex[:8],
        template_id=-1,
        name="가시벽",
        role=role,
        max_hp=hp,
        base_attack=0,
        base_defense=0,
        base_attack_range=1,
        zone=Zone.MAIN,
        description="해저드 설치물",
    )
    wall.extra["is_token"] = True
    wall.extra["token_kind"] = "hazard_wall"
    wall.extra["source_uid"] = caster.uid
    wall.extra["_hero_key"] = "hazard_wall"
    wall.extra["slot_index"] = slot
    wall.zone = target_zone
    wall.add_status(Exposed(duration=-1, source_uid=caster.uid))
    wall.add_status(HealBlock(duration=-1, source_uid=caster.uid))

    if target_zone == Zone.MAIN:
        enemy_field.main_cards.append(wall)
    else:
        enemy_field.side_cards.append(wall)

    return {
        "success": True,
        "skill": "가시벽",
        "cooldown": 2,
        "wall_uid": wall.uid,
        "wall_hp": hp,
        "zone": target_zone.value,
        "role": role.value,
        "slot_index": slot,
    }


@register_skill("hazard", "skill_2")
def hazard_lunge(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target:
        return {"success": False, "message": "대상 필요"}
    result = target.take_damage(game.get_skill_damage(caster, "skill_2"))
    return {"success": True, "skill": "덤벼들기", "damage_log": result}
