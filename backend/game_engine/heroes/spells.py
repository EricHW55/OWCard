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

from game_engine.skill_registry import register_skill
from game_engine.status_effects import (
    SkillSilence, HealBlock, ExtraHP, AttackBuff,
    DamageReduction, Immortality, Reflect, Burn,
)

if TYPE_CHECKING:
    from game_engine.field import FieldCard, Zone
    from game_engine.engine import GameState


# ═══════════════════════════════════════════════════════════
#  즉시 사용 스킬
# ═══════════════════════════════════════════════════════════


@register_skill("spell_thorn_volley", "skill_1")
def spell_thorn_volley(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """가시 소나기: 한 세로줄에 있는 모든 적의 스킬을 봉쇄."""
    if not target:
        return {"success": False, "message": "대상 열을 선택하세요"}

    enemy_field = game.get_enemy_field(caster)
    column = enemy_field.get_column(target)
    logs = []
    for card in column:
        card.add_status(SkillSilence(duration=1, source_uid="spell"))
        logs.append({"target": card.uid, "silenced": True})

    return {"success": True, "skill": "가시 소나기", "affected": logs}


@register_skill("spell_blizzard", "skill_1")
def spell_blizzard(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """눈보라: 한 가로줄(본대 or 사이드)을 얼려서 한턴 스킬 사용 불가."""
    from game_engine.field import Zone
    if not target:
        return {"success": False, "message": "영역을 선택하세요 (본대/사이드의 카드 클릭)"}

    enemy_field = game.get_enemy_field(caster)
    zone = target.zone
    targets = enemy_field.get_row(zone)
    logs = []
    for card in targets:
        card.add_status(SkillSilence(duration=1, source_uid="spell"))
        logs.append({"target": card.uid, "frozen": True})

    return {"success": True, "skill": "눈보라", "zone": zone.value, "affected": logs}


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


@register_skill("spell_biotic_grenade", "skill_1")
def spell_biotic_grenade(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """생체 수류탄: 한 영역(사이드/본대)에 2딜 + 힐밴."""
    from game_engine.field import Zone
    if not target:
        return {"success": False, "message": "영역을 선택하세요"}

    enemy_field = game.get_enemy_field(caster)
    zone = target.zone
    targets = enemy_field.get_row(zone)
    logs = []
    for card in targets:
        dmg_log = card.take_damage(2)
        card.add_status(HealBlock(duration=1, source_uid="spell"))
        logs.append({"target": card.uid, "damage": dmg_log, "heal_blocked": True})

    enemy_field.remove_dead()
    return {"success": True, "skill": "생체 수류탄", "affected": logs}


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
    아군 전체에 공격력 버프로 구현."""
    my_field = game.get_my_field(caster)
    allies = my_field.all_cards()
    logs = []
    for ally in allies:
        # 공격력을 현재 값만큼 추가 (= 2배)
        ally.add_status(AttackBuff(
            value=ally.attack,  # 현재 공격력만큼 추가
            duration=1,
            source_uid="spell",
            tags=["buff", "amp_matrix"],
        ))
        logs.append({"target": ally.uid, "attack_doubled": True})

    return {"success": True, "skill": "증폭 매트릭스", "affected": logs}


@register_skill("spell_nano_boost", "skill_1")
def spell_nano_boost(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """나노 강화제: 아군 한명 공격력 +50%, 피해감소 50%. 영구."""
    if not target:
        return {"success": False, "message": "강화할 아군을 선택하세요"}

    # 공격력 50% 증가 (영구)
    bonus = max(1, target.attack // 2)
    target.add_status(AttackBuff(
        value=bonus,
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
        "attack_bonus": bonus,
        "damage_reduction": 50,
    }


@register_skill("spell_bob", "skill_1")
def spell_bob(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """B.O.B: 탱커 위치에 밥(체력30)을 배치.
    밥은 특수 FieldCard로 생성."""
    import uuid
    from game_engine.field import FieldCard as FC, Role, Zone

    my_field = game.get_my_field(caster)

    # 탱커 자리가 비어있어야 함
    if not my_field.can_place_main(Role.TANK):
        return {"success": False, "message": "탱커 자리가 이미 차있습니다"}

    bob = FC(
        uid=uuid.uuid4().hex[:8],
        template_id=-1,  # 특수 유닛
        name="B.O.B",
        role=Role.TANK,
        max_hp=30,
        base_attack=0,
        base_defense=0,
        base_attack_range=1,
        zone=Zone.MAIN,
    )
    my_field.place_card(bob, Zone.MAIN)

    return {"success": True, "skill": "B.O.B", "bob_uid": bob.uid, "bob_hp": 30}


@register_skill("spell_duplicate", "skill_1")
def spell_duplicate(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """복제: 상대 카드 하나를 복제해서 내 필드에 배치.
    해당 역할군 자리가 없으면 사용 불가."""
    import uuid
    from game_engine.field import FieldCard as FC

    if not target:
        return {"success": False, "message": "복제할 상대 카드를 선택하세요"}

    my_field = game.get_my_field(caster)

    # 역할군 자리 체크
    if target.zone.value == "main":
        if not my_field.can_place_main(target.role):
            return {"success": False, "message": f"{target.role.value} 자리가 이미 차있습니다"}
    else:
        if not my_field.can_place_side(target.role):
            return {"success": False, "message": "사이드 자리가 이미 차있습니다"}

    clone = FC(
        uid=uuid.uuid4().hex[:8],
        template_id=target.template_id,
        name=f"{target.name} (복제)",
        role=target.role,
        max_hp=target.max_hp,
        base_attack=target.base_attack,
        base_defense=target.base_defense,
        base_attack_range=target.base_attack_range,
        zone=target.zone,
        skills=dict(target.skills),
        skill_damages=dict(target.skill_damages),
    )
    clone.current_hp = target.current_hp
    my_field.place_card(clone, target.zone)

    return {"success": True, "skill": "복제", "cloned": target.name, "clone_uid": clone.uid}


@register_skill("spell_riptire", "skill_1")
def spell_riptire(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """죽이는 타이어: 단일 15딜."""
    if not target:
        return {"success": False, "message": "대상을 선택하세요"}

    result = target.take_damage(15)
    enemy_field = game.get_enemy_field(caster)
    enemy_field.remove_dead()

    return {"success": True, "skill": "죽이는 타이어", "damage_log": result}


@register_skill("spell_seismic_slam", "skill_1")
def spell_seismic_slam(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """지각 충격: 상대 필드 전체에 5딜."""
    enemy_field = game.get_enemy_field(caster)
    targets = enemy_field.all_cards()
    logs = []
    for card in targets:
        dmg_log = card.take_damage(5)
        logs.append({"target": card.uid, "damage": dmg_log})

    enemy_field.remove_dead()
    return {"success": True, "skill": "지각 충격", "affected": logs}


@register_skill("spell_dragonblade", "skill_1")
def spell_dragonblade(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """갈라내는 칼날: 한 세로줄 전체에 10딜."""
    if not target:
        return {"success": False, "message": "대상 열을 선택하세요"}

    enemy_field = game.get_enemy_field(caster)
    column = enemy_field.get_column(target)
    logs = []
    for card in column:
        dmg_log = card.take_damage(10)
        logs.append({"target": card.uid, "damage": dmg_log})

    enemy_field.remove_dead()
    return {"success": True, "skill": "갈라내는 칼날", "affected": logs}


@register_skill("spell_orbital_ray", "skill_1")
def spell_orbital_ray(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """궤도 광선: 아군 전체 3힐 + 한턴 공격 +2."""
    my_field = game.get_my_field(caster)
    allies = my_field.all_cards()
    logs = []
    for ally in allies:
        healed = ally.heal(3)
        ally.add_status(AttackBuff(
            value=2, duration=1, source_uid="spell", tags=["buff"],
        ))
        logs.append({"target": ally.uid, "healed": healed, "attack_buffed": 2})

    return {"success": True, "skill": "궤도 광선", "affected": logs}


@register_skill("spell_emp", "skill_1")
def spell_emp(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """EMP: 상대의 설치 스킬(install 태그) 모두 비활성화."""
    enemy_field = game.get_enemy_field(caster)
    removed_count = 0
    logs = []
    for card in enemy_field.all_cards():
        to_remove = [s for s in card.statuses if "install" in s.tags]
        for s in to_remove:
            card.remove_status(s.name)
            removed_count += 1
            logs.append({"target": card.uid, "removed": s.name})

    return {"success": True, "skill": "EMP", "removed_count": removed_count, "affected": logs}


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
    사망 시 체력 1 보장. 2턴 유지."""
    if not target:
        return {"success": False, "message": "아군을 선택하세요"}

    target.add_status(Immortality(
        duration=2,
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
    """강철 덫: 상대 빈칸에 설치.
    상대가 카드를 내려놓으면 4딜 + 한턴 비활성화.
    이건 엔진의 place_card에서 체크해야 함."""
    # 덫은 필드에 직접 설치하는 방식 → 엔진에서 별도 처리
    enemy_field = game.get_enemy_field(caster)

    # 덫 정보를 적 필드에 저장
    if not hasattr(enemy_field, 'traps'):
        enemy_field.traps = []
    enemy_field.traps.append({
        "damage": 4,
        "silence_duration": 1,
        "source": "spell",
    })

    return {"success": True, "skill": "강철 덫", "message": "상대 필드에 덫 설치 완료"}


@register_skill("spell_caduceus_staff", "skill_1")
def spell_caduceus_staff(caster: FieldCard, target: FieldCard, game: GameState) -> dict:
    """카두세우스 지팡이 (공버프): 아군에게 부착 (상대에게 보임).
    공격력 +3. 영구."""
    if not target:
        return {"success": False, "message": "아군을 선택하세요"}

    target.add_status(AttackBuff(
        name="caduceus_staff",
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