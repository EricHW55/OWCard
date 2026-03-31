"""탱커 영웅 스킬 (전체 11종)."""
from __future__ import annotations
from typing import TYPE_CHECKING
from game_engine.skill_registry import register_skill, register_passive
from game_engine.status_effects import (
    Barrier, Exposed, ParticleBarrier, AttackBuff, ExtraHP,
    DamageReduction, Knockback, Taunt, Pulled, Hooked,
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
    card.extra["hana_survive_turns"] = 0
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
    idx = game.get_actual_slot_index(target, dmg_table, side_as_front=True)
    dmg = dmg_table[idx]
    result = target.take_damage(dmg)

    return {
        "success": True,
        "skill": "마이크로 미사일",
        "slot_index": idx,
        "damage_log": result,
    }

# ── 자리야 ────────────────────────────────
@register_skill("zarya", "skill_1")
def zarya_particle_barrier(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    t = target or caster
    t.add_status(ParticleBarrier(duration=2, source_uid=caster.uid))
    return {"success": True, "skill": "입자 방벽", "target": t.uid}

@register_skill("zarya", "skill_2")
def zarya_particle_cannon(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target: return {"success": False, "message": "대상 필요"}
    base = game.get_skill_damage(caster, "skill_2")
    bonus = caster.extra.get("particle_bonus", 0)
    result = target.take_damage(base + bonus)
    return {"success": True, "skill": "입자포", "base": base, "bonus": bonus, "damage_log": result}

# ── 레킹볼 ────────────────────────────────
@register_passive("wrecking_ball")
def wrecking_ball_passive(card: FieldCard, game: GameState) -> dict:
    return {"passive": "갈고리"}

@register_skill("wrecking_ball", "skill_1")
def wrecking_ball_piledriver(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    if not target: return {"success": False, "message": "대상 필요"}
    result = target.take_damage(game.get_skill_damage(caster, "skill_1"))
    return {"success": True, "skill": "파일드라이버", "damage_log": result}

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
    # if not target: return {"success": False, "message": "대상 필요"}
    # empowered = caster.extra.pop("empowered_punch", False)
    # if empowered:
    #     dmg = game.get_skill_damage(caster, "skill_1_empowered")
    #     result = target.take_damage(dmg)
    #     # 뒤 카드도 같은 데미지
    #     enemy = game.get_enemy_field(caster)
    #     td = enemy.get_distance(target)
    #     for layer in enemy._main_layers():
    #         for c in layer:
    #             if enemy.get_distance(c) == td + 1:
    #                 c.take_damage(dmg)
    #     return {"success": True, "skill": "강화 로켓 펀치", "damage_log": result}
    # else:
    #     dmgs = game.get_skill_damage(caster, "skill_1")
    #     main_d = dmgs[0] if isinstance(dmgs, list) else dmgs
    #     behind_d = dmgs[1] if isinstance(dmgs, list) and len(dmgs) > 1 else 0
    #     result = target.take_damage(main_d)
    #     if behind_d > 0:
    #         enemy = game.get_enemy_field(caster)
    #         td = enemy.get_distance(target)
    #         for layer in enemy._main_layers():
    #             for c in layer:
    #                 if enemy.get_distance(c) == td + 1:
    #                     c.take_damage(behind_d)
    #     return {"success": True, "skill": "로켓 펀치", "damage_log": result}
    if not target:
        return {"success": False, "message": "대상 필요"}

    # 파워블락 여부와 관계없이 고정된 강화 펀치 데미지 테이블을 사용한다.
    # (중첩 상태에서 타격 범위/피해량이 의도치 않게 확장되는 현상 방지)
    caster.extra.pop("empowered_punch", None)
    dmg = game.get_skill_damage(caster, "skill_1_empowered")
    result = target.take_damage(dmg)

    enemy = game.get_enemy_field(caster)
    td = enemy.get_distance(target)
    for layer in enemy._main_layers():
        for c in layer:
            if enemy.get_distance(c) == td + 1:
                c.take_damage(dmg)

    return {"success": True, "skill": "강화 로켓 펀치", "damage_log": result}

@register_skill("doomfist", "skill_2")
def doomfist_block(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    caster.add_status(DamageReduction(percent=50, duration=1, source_uid=caster.uid))
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
    caster.add_status(DamageReduction(percent=50, duration=1, source_uid=caster.uid))
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
        return {"success": False, "message": f"HP {threshold} 이하에서만 사용 가능"}
    heal_amt = game.get_skill_damage(caster, "skill_2", apply_attack_buff=False)
    healed = caster.heal(heal_amt)
    return {"success": True, "skill": "숨돌리기", "healed": healed}