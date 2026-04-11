"""
스킬 카드.

두 종류:
  1. 즉시 사용 스킬: 쓰면 효과 발동 → TRASH
  2. 설치 스킬: 아군/적 빈칸에 부착 → 조건 충족 시 발동 → TRASH

스킬 카드는 배치 코스트 1을 소모하며, 필드에 남지 않습니다.
엔진에서 place_card 시 is_spell=True면 스킬 함수를 바로 실행합니다.
"""
from __future__ import annotations
from typing import TYPE_CHECKING

from game_engine.skill_registry import register_skill, get_passive
from game_engine.status_effects import (
    SkillSilence, HealBlock, ExtraHP, AttackBuff,
    DamageReduction, Immortality, Reflect, Burn,
    FrozenState, GravityFluxAirborne, HealMultiplier, DamageMultiplier
)

if TYPE_CHECKING:
    from game_engine.field import FieldCard, Zone
    from game_engine.engine import GameState


# ═══════════════════════════════════════════════════════════
#  즉시 사용 스킬
# ═══════════════════════════════════════════════════════════


@register_skill("spell_thorn_volley", "skill_1")
def spell_thorn_volley(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """가시 소나기: 한 세로줄에 있는 모든 적의 스킬을 봉쇄하고 3 피해."""
    if not target:
        return {"success": False, "message": "대상 열을 선택하세요"}

    enemy_field = game.get_enemy_field(caster)
    column = enemy_field.get_column(target)
    dmg = game.get_skill_damage(caster, "skill_1")
    logs = []
    for card in column:
        card.add_status(SkillSilence(duration=1, source_uid="spell"))
        dmg_log = card.take_damage(dmg)
        logs.append({"target": card.uid, "silenced": True, "damage": dmg_log})


    enemy_field.remove_dead()

    return {"success": True, "skill": "가시 소나기", "damage": dmg, "affected": logs}


@register_skill("spell_blizzard", "skill_1")
def spell_blizzard(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """눈보라: 선택한 영역 내 가로줄(같은 역할군) 전체를 상대 턴 종료시까지 빙결."""
    if not target:
        return {"success": False, "message": "영역의 대상을 선택하세요"}

    enemy_field = game.get_enemy_field(caster)
    targets = enemy_field.get_role_row_in_zone(target.role, target.zone)

    logs = []
    for card in targets:
        # duration=1 이면 상대 필드의 turn_end 시점에 해제됨
        card.add_status(FrozenState(duration=1, source_uid="spell"))
        logs.append({"target": card.uid, "frozen": True})

    return {
        "success": True,
        "skill": "눈보라",
        "zone": target.zone.value,
        "target_role": target.role.value,
        "affected": logs,
    }
    

@register_skill("spell_earthshatter", "skill_1")
def spell_earthshatter(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """대지분쇄: 사이드 or 본대 중 한 곳, 모든 적 스킬 봉쇄."""
    from game_engine.field import Zone
    if not target:
        return {"success": False, "message": "영역을 선택하세요"}

    enemy_field = game.get_enemy_field(caster)
    zone = target.zone
    targets = enemy_field.get_row(zone)
    logs = []
    for card in targets:
        card.add_status(SkillSilence(duration=1, source_uid="spell"))
        logs.append({"target": card.uid, "silenced": True})

    return {"success": True, "skill": "대지분쇄", "zone": zone.value, "affected": logs}


@register_skill("spell_gravity_flux", "skill_1")
def spell_gravity_flux(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """중력붕괴: 선택한 영역의 모든 적을 에어본, 턴 종료 시 최대체력의 절반 피해."""
    if not target:
        return {"success": False, "message": "영역을 선택하세요"}

    enemy_field = game.get_enemy_field(caster)
    enemy_player = game.get_enemy_player(caster)
    my_player = game.get_my_player(caster)
    if not enemy_player or not my_player:
        return {"success": False, "message": "플레이어 찾기 실패"}

    targets = enemy_field.get_row(target.zone)
    if not targets:
        return {"success": True, "skill": "중력붕괴", "zone": target.zone.value, "affected": []}

    logs = []
    target_uids = []
    for card in targets:
        card.add_status(GravityFluxAirborne(duration=-1, source_uid="spell"))
        target_uids.append(card.uid)
        logs.append({"target": card.uid, "airborne": True})

    game._engine.pending_end_turn_effects.append({
        "kind": "gravity_flux",
        "trigger_player_id": my_player.player_id,
        "target_player_id": enemy_player.player_id,
        "target_uids": target_uids,
    })

    return {"success": True, "skill": "중력붕괴", "zone": target.zone.value, "affected": logs}



@register_skill("spell_biotic_grenade", "skill_1")
def spell_biotic_grenade(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """생체 수류탄: 한 영역(사이드/본대)에 2딜 + 힐밴."""
    from game_engine.field import Zone
    if not target:
        return {"success": False, "message": "영역을 선택하세요"}

    enemy_field = game.get_enemy_field(caster)
    zone = target.zone
    targets = enemy_field.get_row(zone)
    dmg = game.get_skill_damage(caster, "skill_1")
    logs = []
    for card in targets:
        dmg_log = card.take_damage(dmg)
        card.add_status(HealBlock(duration=1, source_uid="spell"))
        logs.append({"target": card.uid, "damage": dmg_log, "heal_blocked": True})

    enemy_field.remove_dead()
    return {"success": True, "skill": "생체 수류탄", "damage": dmg, "affected": logs}


@register_skill("spell_rescue", "skill_1")
def spell_rescue(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """구원의 손길: TRASH에서 카드 하나를 패로 가져옴."""
    my_player = game.get_my_player(caster)
    if not my_player:
        return {"success": False, "message": "플레이어 찾기 실패"}
    if not my_player.trash:
        return {"success": False, "message": "트래시에 카드가 없습니다"}

    trash_index = caster.extra.get("_trash_index")
    if trash_index is None:
        return {"success": False, "message": "가져올 트래시 카드를 선택하세요"}
    if trash_index < 0 or trash_index >= len(my_player.trash):
        return {"success": False, "message": "잘못된 트래시 카드 선택"}

    rescued = my_player.trash.pop(trash_index)
    my_player.hand.append(rescued)
    return {
        "success": True,
        "skill": "구원의 손길",
        "rescued": rescued.get("name", "unknown"),
        "card": rescued,
    }


@register_skill("spell_sound_barrier", "skill_1")
def spell_sound_barrier(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """소리방벽: 모든 아군이 2턴 동안 20 추가체력."""
    my_field = game.get_my_field(caster)
    allies = my_field.all_cards()
    logs = []
    for ally in allies:
        ally.add_status(ExtraHP(value=20, duration=2, source_uid="spell"))
        logs.append({"target": ally.uid, "extra_hp": 20})

    return {"success": True, "skill": "소리방벽", "affected": logs}


@register_skill("spell_amp_matrix", "skill_1")
def spell_amp_matrix(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """증폭 매트릭스: 한턴 동안 딜량과 힐량 2배.
    아군 전체 스킬 피해/치유 배율 버프로 구현."""
    my_field = game.get_my_field(caster)
    allies = my_field.all_cards()
    logs = []
    for ally in allies:
        # 스킬 피해 배율 2배
        ally.add_status(DamageMultiplier(
            value=2.0,
            duration=1,
            source_uid="spell",
            tags=["buff", "amp_matrix"],
        ))
        ally.add_status(HealMultiplier(
            value=2.0,
            duration=1,
            source_uid="spell",
            tags=["buff", "amp_matrix"],
        ))
        logs.append({"target": ally.uid, "attack_doubled": True, "heal_doubled": True})

    return {"success": True, "skill": "증폭 매트릭스", "affected": logs}


@register_skill("spell_nano_boost", "skill_1")
def spell_nano_boost(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """나노 강화제: 아군 한명 스킬 피해량 +50%, 피해감소 50%. 영구."""
    if not target:
        return {"success": False, "message": "강화할 아군을 선택하세요"}

    # 스킬 피해량 50% 증가 (영구)
    target.add_status(DamageMultiplier(
        value=1.5,
        duration=-1,  # 영구
        source_uid="spell",
        tags=["buff", "nano"],
    ))

    # 피해 감소 50% (영구)
    target.add_status(DamageReduction(
        percent=50,
        duration=-1,
        source_uid="spell",
        tags=["buff", "nano"],
    ))

    return {
        "success": True,
        "skill": "나노 강화제",
        "target": target.uid,
        "attack_bonus": 1.5,
        "damage_reduction": 50,
    }


@register_skill("spell_bob", "skill_1")
def spell_bob(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """B.O.B: 탱커 위치에 밥(체력30)을 배치.
    밥은 특수 FieldCard로 생성."""
    import uuid
    from game_engine.field import FieldCard as FC, Role, Zone

    my_field = game.get_my_field(caster)

    has_main_tank = any(c.alive and c.role == Role.TANK for c in my_field.main_cards)
    has_any_side = any(c.alive for c in my_field.side_cards)
    has_side_tank = any(c.alive and c.role == Role.TANK for c in my_field.side_cards)
    place_zone = Zone.MAIN
    if has_main_tank:
        # 본대 탱커가 이미 있으면 사이드 탱커 슬롯(비어 있을 때)으로 소환한다.
        if has_any_side or has_side_tank:
            return {"success": False, "message": "B.O.B를 배치할 빈 탱커 자리가 없습니다"}
        place_zone = Zone.SIDE

    bob = FC(
        uid=uuid.uuid4().hex[:8],
        template_id=-1,  # 특수 유닛
        name="B.O.B",
        role=Role.TANK,
        max_hp=30,
        base_attack=0,
        base_defense=0,
        base_attack_range=1,
        zone=place_zone,
    )
    # 특수 소환 유닛: 일반 역할군 제한 카운트에서 제외
    bob.extra["is_token"] = True
    my_field.force_place_card(bob, place_zone)

    return {"success": True, "skill": "B.O.B", "bob_uid": bob.uid, "bob_hp": 30, "zone": place_zone.value}


@register_skill("spell_duplicate", "skill_1")
def spell_duplicate(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """복제: 상대 카드 하나를 복제해서 내 필드에 배치.
    복제로 생성된 카드는 일반 역할군 자리 제한을 무시한다."""
    import uuid
    from game_engine.field import FieldCard as FC, Zone, Role

    if not target:
        return {"success": False, "message": "복제할 상대 카드를 선택하세요"}

    my_player = game.get_my_player(caster)
    my_field = game.get_my_field(caster)
    if not my_player:
        return {"success": False, "message": "플레이어 찾기 실패"}

    requested_zone = caster.extra.get("_zone")
    if requested_zone in (Zone.MAIN.value, Zone.SIDE.value):
        place_zone = Zone(requested_zone)
    else:
        preferred_zone = target.zone
        place_zone = preferred_zone if preferred_zone in (Zone.MAIN, Zone.SIDE) else Zone.MAIN

    clone = FC(
        uid=uuid.uuid4().hex[:8],
        template_id=target.template_id,
        name=f"{target.name} (복제)",
        role=target.role,
        max_hp=target.max_hp,
        base_attack=target.base_attack,
        base_defense=target.base_defense,
        base_attack_range=target.base_attack_range,
        description=target.description,
        zone=place_zone,
        skills=dict(target.skills),
        skill_damages=dict(target.skill_damages),
        skill_meta=dict(target.skill_meta),
        extra=dict(target.extra),
    )
    clone.extra["_hero_key"] = target.extra.get("_hero_key", target.name.lower())
    # 복제 카드는 일반 역할군 제한 카운트에서 제외한다.
    clone.extra["is_token"] = True
    clone.current_hp = target.current_hp

    def _can_place_duplicate(zone: Zone) -> bool:
        if zone == Zone.MAIN:
            main_limits = {Role.TANK: 1, Role.DEALER: 2, Role.HEALER: 2}
            alive_same_role = sum(1 for c in my_field.main_cards if c.alive and c.role == clone.role)
            return alive_same_role < main_limits[clone.role]

        alive_side = [c for c in my_field.side_cards if c.alive]
        if clone.role == Role.TANK:
            return len(alive_side) == 0
        has_side_tank = any(c.role == Role.TANK for c in alive_side)
        has_same_role = any(c.role == clone.role for c in alive_side)
        return (not has_side_tank) and (not has_same_role)

    if not _can_place_duplicate(place_zone):
        return {"success": False, "message": "선택한 위치에 복제 카드를 배치할 수 없습니다"}

    my_field.force_place_card(clone, place_zone)

    passive_result = {}
    passive_fn = get_passive(clone.extra.get("_hero_key", ""))
    engine = getattr(game, "_engine", None)
    if passive_fn:
        passive_result = passive_fn(clone, game) or {}
        if engine and "summon_token" in passive_result:
            spec = passive_result["summon_token"]
            token = engine._summon_token(my_player, spec, spec.get("zone", clone.zone.value))
            if token:
                passive_result["summoned"] = token.to_dict()
            else:
                passive_result["summon_failed"] = True
        if "needs_choice" in passive_result:
            my_player.pending_passive = passive_result["needs_choice"]

    return {
        "success": True,
        "skill": "복제",
        "cloned": target.name,
        "clone_uid": clone.uid,
        "zone": place_zone.value,
        "card": clone.to_dict(),
        "passive_triggered": passive_result if passive_result else None,
    }


@register_skill("spell_riptire", "skill_1")
def spell_riptire(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """죽이는 타이어: 단일 15딜."""
    if not target:
        return {"success": False, "message": "대상을 선택하세요"}

    damage = game.get_skill_damage(caster, "skill_1")
    result = target.take_damage(damage)
    enemy_field = game.get_enemy_field(caster)
    enemy_field.remove_dead()

    return {"success": True, "skill": "죽이는 타이어", "damage": damage, "damage_log": result}


@register_skill("spell_seismic_slam", "skill_1")
def spell_seismic_slam(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """지각 충격: 상대 필드 전체에 5딜."""
    enemy_field = game.get_enemy_field(caster)
    targets = enemy_field.all_cards()
    damage = game.get_skill_damage(caster, "skill_1")
    logs = []
    for card in targets:
        dmg_log = card.take_damage(damage, ignore_barrier=True)
        logs.append({"target": card.uid, "damage": dmg_log})

    enemy_field.remove_dead()
    return {"success": True, "skill": "지각 충격", "damage": damage, "affected": logs}


@register_skill("spell_dragonblade", "skill_1")
def spell_dragonblade(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """갈라내는 칼날: 한 세로줄 전체의 보호효과를 파괴한 뒤 7딜."""
    if not target:
        return {"success": False, "message": "대상 열을 선택하세요"}

    enemy_field = game.get_enemy_field(caster)
    column = enemy_field.get_column(target)
    damage = game.get_skill_damage(caster, "skill_1")
    logs = []

    def break_protection(card: FieldCard) -> dict:
        broken = {
            "barrier_broken": False,
            "particle_barrier_broken": False,
            "extra_hp_removed": 0,
        }

        barrier = card.get_status("barrier")
        if barrier:
            broken["barrier_broken"] = True
            card.remove_status("barrier")

        particle = card.get_status("particle_barrier")
        if particle:
            broken["particle_barrier_broken"] = True
            card.remove_status("particle_barrier")

        extra_hp = card.get_status("extra_hp")
        if extra_hp:
            broken["extra_hp_removed"] = int(getattr(extra_hp, "value", 0) or 0)
            card.remove_status("extra_hp")

        return broken

    for card in column:
        broken = break_protection(card)
        dmg_log = card.take_damage(damage)
        logs.append({"target": card.uid, "broken": broken, "damage": dmg_log})

    enemy_field.remove_dead()
    return {
        "success": True,
        "skill": "갈라내는 칼날",
        "damage": damage,
        "affected": logs,
    }

@register_skill("spell_orbital_ray", "skill_1")
def spell_orbital_ray(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """궤도 광선: 아군 전체 힐 + 한턴 공격 버프 (수치는 DB skill_1 기준)."""
    my_field = game.get_my_field(caster)
    allies = my_field.all_cards()
    skill_data = game.get_skill_damage(caster, "skill_1", apply_attack_buff=False)
    if isinstance(skill_data, dict):
        heal_amount = int(skill_data.get("heal", 3) or 0)
        attack_buff = int(skill_data.get("attack_buff", 2) or 0)
    else:
        heal_amount = int(skill_data or 3)
        attack_buff = 2
    logs = []
    for ally in allies:
        healed = ally.heal(heal_amount)
        ally.add_status(AttackBuff(
            value=attack_buff, duration=1, source_uid="spell", tags=["buff"],
        ))
        logs.append({"target": ally.uid, "healed": healed, "attack_buffed": attack_buff})

    return {"success": True, "skill": "궤도 광선", "affected": logs}


@register_skill("spell_emp", "skill_1")
def spell_emp(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """EMP:
    - 상대 설치 효과(install 태그) 제거
    - 상대 방벽(barrier, particle_barrier) 제거 (추가체력은 유지)
    - 상대 설치물 토큰(토르비욘 포탑/일리아리 힐 포탑) 파괴
    - 상대 강철 덫 큐 비우기
    """
    enemy_field = game.get_enemy_field(caster)
    removed_count = 0
    broken_barriers = 0
    destroyed_tokens = 0
    cleared_traps = 0
    logs = []
    
    for card in enemy_field.all_cards():
        # 1) 설치 효과 제거 (불사장치/튕겨내기/카두세우스 지팡이 공버프 등)
        to_remove = [s for s in card.statuses if "install" in s.tags]
        for s in to_remove:
            card.remove_status(s.name)
            removed_count += 1
            logs.append({"target": card.uid, "removed": s.name})

        # 2) 방벽만 제거 (추가체력 extra_hp는 건드리지 않음)
        if card.remove_status("barrier"):
            broken_barriers += 1
            logs.append({"target": card.uid, "removed": "barrier"})
        if card.remove_status("particle_barrier"):
            broken_barriers += 1
            logs.append({"target": card.uid, "removed": "particle_barrier"})

        # 3) 설치물 토큰 파괴 (딜을 넣어 파괴)
        token_kind = card.extra.get("token_kind")
        if token_kind in ("torbjorn_turret", "illari_pylon") and card.current_hp > 0:
            dmg_log = card.take_damage(max(card.current_hp, 99), ignore_barrier=True)
            destroyed_tokens += 1
            logs.append({"target": card.uid, "destroyed_token": token_kind, "damage_log": dmg_log})

    # 4) 강철 덫 무효화
    traps = getattr(enemy_field, "traps", None)
    if isinstance(traps, list) and traps:
        cleared_traps = len(traps)
        traps.clear()

    enemy_field.remove_dead()

    return {
        "success": True,
        "skill": "EMP",
        "removed_count": removed_count,
        "broken_barriers": broken_barriers,
        "destroyed_tokens": destroyed_tokens,
        "cleared_traps": cleared_traps,
        "affected": logs,
    }


# ═══════════════════════════════════════════════════════════
#  설치 스킬 (아군/적에게 부착, 조건 시 발동)
# ═══════════════════════════════════════════════════════════


@register_skill("spell_sleep_dart", "skill_1")
def spell_sleep_dart(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """수면총: 상대 카드 한장을 한턴 행동불가."""
    if not target:
        return {"success": False, "message": "대상을 선택하세요"}

    target.add_status(SkillSilence(
        name="sleep",
        duration=1,
        source_uid="spell",
        tags=["debuff", "cc", "install"],
    ))
    return {"success": True, "skill": "수면총", "target": target.uid}


@register_skill("spell_immortality_field", "skill_1")
def spell_immortality_field(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """불사장치: 아군에게 부착 (상대에게 안 보임).
     발동 전까지 영구 대기, 발동 후 2턴 유지."""
    if not target:
        return {"success": False, "message": "아군을 선택하세요"}

    target.add_status(Immortality(
        duration=-1,
        source_uid="spell",
        visible_to_opponent=False,
        tags=["buff", "install"],
    ))
    return {"success": True, "skill": "불사장치", "target": target.uid, "hidden": True}


@register_skill("spell_deflect", "skill_1")
def spell_deflect(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """튕겨내기: 아군에게 부착 (상대에게 안 보임).
    치명적 공격을 반사."""
    if not target:
        return {"success": False, "message": "아군을 선택하세요"}

    target.add_status(Reflect(
        duration=-1,  # 발동될 때까지 영구
        source_uid="spell",
        visible_to_opponent=False,
        tags=["buff", "install"],
    ))
    return {"success": True, "skill": "튕겨내기", "target": target.uid, "hidden": True}


@register_skill("spell_steel_trap", "skill_1")
def spell_steel_trap(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """강철 덫: 상대 필드에 설치. 다음으로 배치되는 적 1장에 4딜 + 다음 턴까지 스킬 봉쇄."""
    enemy_field = game.get_enemy_field(caster)
    damage = game.get_skill_damage(caster, "skill_1")

    if not hasattr(enemy_field, "traps"):
        enemy_field.traps = []

    enemy_field.traps.append({
        "kind": "steel_trap",
        "damage": damage,
        # 이번 턴 종료에 한 번 줄고, 다음 턴까지 막으려면 2가 필요
        "silence_duration": 2,
        "source": "spell",
    })

    return {
        "success": True,
        "skill": "강철 덫",
        "damage": damage,
        "message": "상대가 다음 카드를 배치하면 덫이 발동합니다",
    }


@register_skill("spell_caduceus_staff", "skill_1")
def spell_caduceus_staff(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """카두세우스 지팡이 (공버프): 아군에게 부착 (상대에게 보임).
    공격력 +3. 영구."""
    if not target:
        return {"success": False, "message": "아군을 선택하세요"}

    target.add_status(AttackBuff(
        # name="caduceus_staff",
        value=3,
        duration=-1,
        source_uid="spell",
        visible_to_opponent=True,
        tags=["buff", "install"],
    ))
    return {"success": True, "skill": "카두세우스 지팡이", "target": target.uid, "attack_bonus": 3}


@register_skill("spell_maximilian", "skill_1")
def spell_maximilian(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """막시밀리앙: 덱에서 원하는 카드 1장을 패로 가져옴."""
    my_player = game.get_my_player(caster)
    if not my_player:
        return {"success": False, "message": "플레이어 찾기 실패"}
    if not my_player.draw_pile:
        return {"success": False, "message": "덱이 비어있습니다"}

    draw_index = caster.extra.get("_draw_index")
    if draw_index is None:
        return {"success": False, "message": "가져올 덱 카드를 선택하세요"}
    if draw_index < 0 or draw_index >= len(my_player.draw_pile):
        return {"success": False, "message": "잘못된 덱 카드 선택"}

    drawn = my_player.draw_pile.pop(draw_index)
    my_player.hand.append(drawn)
    return {
        "success": True,
        "skill": "막시밀리앙",
        "drawn_card": drawn.get("name", "unknown"),
        "card": drawn,
    }

    drawn = my_player.draw_pile.pop(0)
    my_player.hand.append(drawn)
    return {
        "success": True,
        "skill": "막시밀리앙",
        "drawn_card": drawn.get("name", "unknown"),
    }