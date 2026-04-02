"""
필드 시스템 (v2).

FieldCard: 상태 효과 훅이 통합된 카드 인스턴스.
  - 데미지 받을 때 → 모든 상태 효과의 on_take_damage 순서대로 호출
  - 사망 시 → on_death 호출 → 메이 빙결, 디바 송하나 등 처리
  - 타겟 선택 시 → on_before_targeted → 은신/잠복 체크

Field: 본대/사이드 관리 + 거리 시스템.
  - 본대: 탱커(거리1) > 딜러(거리2) > 힐러(거리3), 빈 역할은 당겨짐
  - 사이드: 기본적으로 사거리 +1 느낌으로 공격 가능
"""
from __future__ import annotations
from dataclasses import dataclass, field as dc_field
from typing import Optional, Callable
from enum import Enum

from game_engine.status_effects import StatusEffect


# ═══════════════════════════════════════════════════════
#  기본 타입
# ═══════════════════════════════════════════════════════

class Role(str, Enum):
    TANK = "tank"
    DEALER = "dealer"
    HEALER = "healer"


class Zone(str, Enum):
    MAIN = "main"
    SIDE = "side"


ROLE_ORDER = {Role.TANK: 0, Role.DEALER: 1, Role.HEALER: 2}


# ═══════════════════════════════════════════════════════
#  FieldCard — 필드 위 카드 인스턴스
# ═══════════════════════════════════════════════════════

@dataclass
class FieldCard:
    """필드에 놓인 카드 한 장. 모든 인게임 상호작용의 단위."""

    # ── 기본 정보 (DB에서 로드) ────────────────
    uid: str
    template_id: int
    name: str
    role: Role
    max_hp: int
    base_attack: int
    base_defense: int
    base_attack_range: int
    description: str = ""
    zone: Zone = Zone.MAIN

    # ── 인게임 상태 ───────────────────────────
    current_hp: int = 0
    statuses: list[StatusEffect] = dc_field(default_factory=list)
    placed_this_turn: bool = True
    acted_this_turn: bool = False

    # ── 스킬 함수 연결 ────────────────────────
    skills: dict[str, Callable] = dc_field(default_factory=dict)
    skill_cooldowns: dict[str, int] = dc_field(default_factory=dict)
    skill_uses: dict[str, int] = dc_field(default_factory=dict)

    # ── 스킬 데미지 / 메타 ────────────────────
    skill_damages: dict[str, any] = dc_field(default_factory=dict)
    skill_meta: dict[str, dict] = dc_field(default_factory=dict)

    # ── 추가 데이터 ───────────────────────────
    extra: dict = dc_field(default_factory=dict)

    def __post_init__(self):
        if self.current_hp == 0:
            self.current_hp = self.max_hp

    @property
    def alive(self) -> bool:
        return self.current_hp > 0

    def add_status(self, status: StatusEffect) -> dict:
        if not status.stackable:
            self.statuses = [s for s in self.statuses if s.name != status.name]
        self.statuses.append(status)
        return status.on_apply(self)

    def remove_status(self, name: str) -> Optional[StatusEffect]:
        for i, s in enumerate(self.statuses):
            if s.name == name:
                removed = self.statuses.pop(i)
                removed.on_remove(self)
                return removed
        return None

    def has_status(self, name: str) -> bool:
        return any(s.name == name for s in self.statuses)

    def get_status(self, name: str) -> Optional[StatusEffect]:
        for s in self.statuses:
            if s.name == name:
                return s
        return None

    def has_tag(self, tag: str) -> bool:
        return any(tag in s.tags for s in self.statuses)

    @property
    def attack(self) -> int:
        mod = sum(s.value for s in self.statuses if s.name == "attack_buff")
        return max(0, self.base_attack + mod)

    @property
    def attack_range(self) -> int:
        mod = sum(s.value for s in self.statuses if s.name == "range_modifier")
        knockback = sum(s.value for s in self.statuses if s.name == "knockback")
        return max(1, self.base_attack_range + mod - knockback)

    @property
    def is_silenced(self) -> bool:
        return self.has_status("skill_silence") or self.has_status("frozen_state")

    @property
    def is_targetable(self) -> bool:
        for s in self.statuses:
            if s.name in ("stealth", "burrowed", "frozen_state"):
                return False
        return True

    def take_damage(self, damage: int, **kwargs) -> dict:
        log = {"original_damage": damage, "target": self.uid}
        current_damage = damage

        for status in list(self.statuses):
            result = status.on_take_damage(self, current_damage, **kwargs)
            if result.get("particle_barrier_broken"):
                log["particle_barrier_broken"] = True
                self.extra["particle_barrier_break_seq"] = int(self.extra.get("particle_barrier_break_seq", 0) or 0) + 1
            trigger_uid = result.get("trigger_zarya_buff")
            if trigger_uid:
                log["trigger_zarya_buff"] = trigger_uid
            if result.get("absorbed"):
                log["absorbed_by"] = status.name
                log["final_damage"] = 0
                for s in self.statuses:
                    s.on_after_damage(self, 0)
                return log
            if result.get("reflect"):
                log["reflected"] = result["reflect"]
                log["reflect_by"] = status.name
                log["final_damage"] = 0
                return log
            current_damage = result.get("damage", current_damage)

        current_damage = max(0, current_damage)
        self.current_hp = max(0, self.current_hp - current_damage)
        log["final_damage"] = current_damage
        log["remaining_hp"] = self.current_hp

        for s in list(self.statuses):
            s.on_after_damage(self, current_damage)

        if self.current_hp <= 0:
            death_result = self._process_death()
            log.update(death_result)

        return log

    def take_raw_damage(self, damage: int) -> dict:
        self.current_hp = max(0, self.current_hp - damage)
        log = {"raw_damage": damage, "remaining_hp": self.current_hp}
        if self.current_hp <= 0:
            death_result = self._process_death()
            log.update(death_result)
        return log

    def _process_death(self) -> dict:
        for status in list(self.statuses):
            result = status.on_death(self)
            if result.get("prevent_death"):
                if "set_hp" in result:
                    self.current_hp = result["set_hp"]
                return {"death_prevented": True, "by": status.name, **result}
        return {"died": True}

    def heal(self, amount: int) -> int:
        if self.has_status("heal_block") or self.has_status("frozen_state"):
            return 0
        amp = sum(s.value for s in self.statuses if s.name == "heal_amplify")
        # actual = amount + amp
        mult = 1.0
        for s in self.statuses:
            if s.name == "heal_multiplier":
                mult *= float(getattr(s, "value", 1.0))
        actual = int((amount + amp) * mult)
        before = self.current_hp
        self.current_hp = min(self.max_hp, self.current_hp + actual)
        return self.current_hp - before

    def process_turn_start(self) -> list[dict]:
        logs = []
        for s in list(self.statuses):
            result = s.on_turn_start(self)
            if result:
                logs.append({"status": s.name, **result})
        return logs

    def process_turn_end(self) -> list[dict]:
        logs = []
        for s in list(self.statuses):
            result = s.on_turn_end(self)
            if result:
                logs.append({"status": s.name, **result})

        expired = [s for s in self.statuses if s.tick()]
        for s in expired:
            s.on_remove(self)
            self.statuses.remove(s)
            logs.append({"status_expired": s.name})

        for sk in list(self.skill_cooldowns.keys()):
            self.skill_cooldowns[sk] -= 1
            if self.skill_cooldowns[sk] <= 0:
                del self.skill_cooldowns[sk]

        return logs

    def can_use_skill(self, skill_key: str) -> tuple[bool, str]:
        if self.placed_this_turn:
            return False, "이번 턴에 배치한 카드"
        if self.acted_this_turn:
            return False, "이번 턴에 이미 행동함"
        if self.has_status("frozen_state"):
            return False, "빙결 상태"
        if self.is_silenced:
            return False, "스킬 봉쇄 상태"
        if skill_key not in self.skills:
            return False, "스킬 없음"
        if skill_key in self.skill_cooldowns:
            return False, f"쿨다운 {self.skill_cooldowns[skill_key]}턴"
        uses = self.skill_uses.get(skill_key)
        if uses is not None and uses <= 0:
            return False, "횟수 소진"
        return True, ""

    def to_dict(self, for_opponent: bool = False) -> dict:
        statuses = []
        for s in self.statuses:
            if for_opponent and not s.visible_to_opponent:
                continue
            statuses.append(s.to_dict())
        return {
            "uid": self.uid,
            "hero_key": self.extra.get("_hero_key", ""),
            "template_id": self.template_id,
            "name": self.name,
            "role": self.role.value,
            "description": self.description,
            "max_hp": self.max_hp,
            "current_hp": self.current_hp,
            "attack": self.attack,
            "defense": self.base_defense,
            "attack_range": self.attack_range,
            "zone": self.zone.value,
            "statuses": statuses,
            "skill_cooldowns": dict(self.skill_cooldowns),
            "skill_damages": self.skill_damages,
            "skill_meta": self.skill_meta,
            "placed_this_turn": self.placed_this_turn,
            "acted_this_turn": self.acted_this_turn,
            "extra": self.extra,
        }


# ═══════════════════════════════════════════════════════
#  Field — 한 플레이어의 필드
# ═══════════════════════════════════════════════════════

@dataclass
class Field:
    main_cards: list[FieldCard] = dc_field(default_factory=list)
    side_cards: list[FieldCard] = dc_field(default_factory=list)

    def _alive(self, cards: list[FieldCard]) -> list[FieldCard]:
        return [c for c in cards if c.alive]

    def all_cards(self) -> list[FieldCard]:
        return self._alive(self.main_cards) + self._alive(self.side_cards)

    def is_empty(self) -> bool:
        return len(self.all_cards()) == 0

    def find_card(self, uid: str) -> Optional[FieldCard]:
        for c in self.main_cards + self.side_cards:
            if c.uid == uid:
                return c
        return None

    def _count_role(self, cards: list[FieldCard], role: Role) -> int:
        return sum(1 for c in cards if c.role == role and c.alive and not c.extra.get("is_token"))

    def can_place_main(self, role: Role) -> bool:
        main_limits = {Role.TANK: 1, Role.DEALER: 2, Role.HEALER: 2}
        total_limits = {Role.TANK: 1, Role.DEALER: 2, Role.HEALER: 2}
        main_count = self._count_role(self.main_cards, role)
        total_count = main_count + self._count_role(self.side_cards, role)
        return main_count < main_limits[role] and total_count < total_limits[role]

    def can_place_side(self, role: Role) -> bool:
        alive = [c for c in self._alive(self.side_cards) if not c.extra.get("is_token")]
        if role == Role.TANK:
            if len(alive) > 0:
                return False
        else:
            has_tank = any(c.role == Role.TANK for c in alive)
            if has_tank:
                return False
            if self._count_role(self.side_cards, role) > 0:
                return False

        total_limits = {Role.TANK: 1, Role.DEALER: 2, Role.HEALER: 2}
        total_count = self._count_role(self.main_cards, role) + self._count_role(self.side_cards, role)
        return total_count < total_limits[role]

    def place_card(self, card: FieldCard, zone: Zone) -> bool:
        if zone == Zone.MAIN:
            if not self.can_place_main(card.role):
                return False
            self.main_cards.append(card)
        else:
            if not self.can_place_side(card.role):
                return False
            self.side_cards.append(card)
        card.zone = zone
        return True
    
    def force_place_card(self, card: FieldCard, zone: Zone) -> None:
        """자리 제한을 무시하고 강제로 배치한다. (복제/특수 소환 전용)"""
        if zone == Zone.MAIN:
            self.main_cards.append(card)
        else:
            self.side_cards.append(card)
        card.zone = zone

    def move_card(self, card: FieldCard, to_zone: Zone, *, ignore_limits: bool = False) -> bool:
        if card.zone == to_zone:
            return False

        original_zone = card.zone
        original_main = list(self.main_cards)
        original_side = list(self.side_cards)

        if original_zone == Zone.MAIN:
            self.main_cards = [c for c in self.main_cards if c.uid != card.uid]
        else:
            self.side_cards = [c for c in self.side_cards if c.uid != card.uid]

        can_move = True if ignore_limits else (
            self.can_place_main(card.role) if to_zone == Zone.MAIN else self.can_place_side(card.role)
        )
        if not can_move:
            self.main_cards = original_main
            self.side_cards = original_side
            card.zone = original_zone
            return False

        if to_zone == Zone.MAIN:
            self.main_cards.append(card)
        else:
            self.side_cards.append(card)
        card.zone = to_zone
        return True

    def _main_layers(self) -> list[list[FieldCard]]:
        alive = sorted(self._alive(self.main_cards), key=lambda c: ROLE_ORDER[c.role])
        layers: list[list[FieldCard]] = []
        cur_role = None
        for c in alive:
            if c.role != cur_role:
                layers.append([])
                cur_role = c.role
            layers[-1].append(c)
        return layers

    def get_distance(self, card: FieldCard) -> int:
        for i, layer in enumerate(self._main_layers()):
            if any(c.uid == card.uid for c in layer):
                return i + 1
        return 99

    # ── 공격 대상 계산 ────────────────────────

    def _target_distance_modifier(self, attacker: FieldCard, target: FieldCard) -> int:
        mod = 0
        for s in target.statuses:
            res = s.on_before_targeted(target, attacker)
            mod += res.get("distance_modifier", 0)
        return mod

    def _layer_ignored_as_blocker(self, attacker: FieldCard, layer: list[FieldCard]) -> bool:
        alive_cards = [c for c in layer if c.alive]
        if not alive_cards:
            return False

        for card in alive_cards:
            ignore = not card.is_targetable
            for s in card.statuses:
                res = s.on_before_targeted(card, attacker)
                if res.get("ignore_as_blocker"):
                    ignore = True
                    break
            if not ignore:
                return False
        return True

    def get_targetable_from_main(self, attacker: FieldCard, override_range: int | None = None, apply_taunt: bool = True) -> list[FieldCard]:
        atk_range = override_range if override_range is not None else attacker.attack_range

        bypass = 0
        for s in attacker.statuses:
            result = s.on_before_attack(attacker, None)
            bypass += result.get("bypass_distance", 0)
        effective_range = atk_range + bypass

        layers = self._main_layers()

        result = []
        skipped_layers = 0

        for i, layer in enumerate(layers):
            layer_distance = (i + 1) - skipped_layers

            for c in layer:
                if not c.is_targetable:
                    continue
                target_distance = max(1, layer_distance + self._target_distance_modifier(attacker, c))
                if target_distance <= effective_range:
                    result.append(c)

            if self._layer_ignored_as_blocker(attacker, layer):
                skipped_layers += 1

        if apply_taunt:
            taunts = [c for c in result if c.has_status("taunt")]
            return taunts if taunts else result
        return result

    def get_targetable_from_side(self, attacker: FieldCard, override_range: int | None = None, apply_taunt: bool = True) -> list[FieldCard]:
        """
        사이드는 '앞줄 스킵'이 아니라 '사거리 +1' 느낌으로 처리.
        예: 사거리 1이면 탱커/딜러까지 가능.
        """
        atk_range = override_range if override_range is not None else attacker.attack_range

        bypass = 0
        for s in attacker.statuses:
            result = s.on_before_attack(attacker, None)
            bypass += result.get("bypass_distance", 0)
        effective_range = atk_range + 1 + bypass

        layers = self._main_layers()
        result = []

        for i, layer in enumerate(layers):
            layer_distance = i + 1
            for c in layer:
                if not c.is_targetable:
                    continue
                target_distance = max(1, layer_distance + self._target_distance_modifier(attacker, c))
                if target_distance <= effective_range:
                    result.append(c)

        if apply_taunt:
            taunts = [c for c in result if c.has_status("taunt")]
            return taunts if taunts else result
        return result

    def get_side_targets(self) -> list[FieldCard]:
        return [c for c in self._alive(self.side_cards) if c.is_targetable]

    def get_all_targetable(self, attacker: FieldCard, override_range: int | None = None, apply_taunt: bool = True) -> list[FieldCard]:
        if attacker.zone == Zone.MAIN:
            targets = self.get_targetable_from_main(attacker, override_range=override_range, apply_taunt=False)
        else:
            targets = self.get_targetable_from_side(attacker, override_range=override_range, apply_taunt=False)
        targets += self.get_side_targets()
        seen = set()
        deduped = [t for t in targets if not (t.uid in seen or seen.add(t.uid))]

        if apply_taunt:
            # 도발은 구역(본대/사이드)과 거리 계산보다 우선한다.
            # 즉, 상대 진영 어디에 있든 살아있는 도발 대상이 있으면 그 카드들만 타겟 가능.
            global_taunts = [c for c in self.all_cards() if c.alive and c.is_targetable and c.has_status("taunt")]
            if global_taunts:
                return global_taunts

        return deduped

    # ── 특수 타겟팅 (스킬용) ──────────────────

    def get_column(self, card: FieldCard) -> list[FieldCard]:
        """보드 세로줄 반환.

        - 사이드 카드 선택 시: 사이드 세로줄 전체
        - 본대 카드 선택 시: 좌/우 메인 열 관통
          (탱커는 단일 슬롯이므로 좌측 열로 취급)
        """
        if card.zone == Zone.SIDE:
            result: list[FieldCard] = []
            for role in (Role.TANK, Role.DEALER, Role.HEALER):
                side_card = next((c for c in self._alive(self.side_cards) if c.role == role), None)
                if side_card:
                    result.append(side_card)
            return result

        def alive_main(role: Role) -> list[FieldCard]:
            return [c for c in self._alive(self.main_cards) if c.role == role]

        if card.role == Role.TANK:
            column_index = 0
        else:
            same_role_cards = alive_main(card.role)
            column_index = 0
            for idx, c in enumerate(same_role_cards):
                if c.uid == card.uid:
                    column_index = idx
                    break

        result: list[FieldCard] = []
        tank_cards = alive_main(Role.TANK)
        if tank_cards:
            # 본대 세로줄(좌/우) 모두 단일 탱커 슬롯을 공유한다.
            result.append(tank_cards[0])
        for role in (Role.DEALER, Role.HEALER):
            role_cards = alive_main(role)
            if column_index < len(role_cards):
                result.append(role_cards[column_index])
        return result

    def get_role_row(self, role: Role, *, include_side: bool = True) -> list[FieldCard]:
        row = [c for c in self._alive(self.main_cards) if c.role == role]
        if include_side:
            row += [c for c in self._alive(self.side_cards) if c.role == role]
        return row

    def get_row(self, zone: Zone) -> list[FieldCard]:
        if zone == Zone.MAIN:
            return self._alive(self.main_cards)
        return self._alive(self.side_cards)
    
    def get_role_row_in_zone(self, role: Role, zone: Zone) -> list[FieldCard]:
        cards = self.main_cards if zone == Zone.MAIN else self.side_cards
        return [c for c in self._alive(cards) if c.role == role]

    def get_role_cards(self, role: Role) -> list[FieldCard]:
        return [c for c in self.all_cards() if c.role == role]

    def get_frontline(self) -> list[FieldCard]:
        layers = self._main_layers()
        return [c for c in layers[0] if c.is_targetable] if layers else []

    # ── 턴 처리 ───────────────────────────────

    def process_all_turn_start(self) -> list[dict]:
        logs = []
        for card in self.all_cards():
            logs.extend(card.process_turn_start())
        return logs

    def process_all_turn_end(self) -> list[dict]:
        logs = []
        for card in self.all_cards():
            logs.extend(card.process_turn_end())
        return logs

    def mark_all_available(self):
        for card in self.all_cards():
            card.placed_this_turn = False
            card.acted_this_turn = False

    def remove_dead(self) -> list[FieldCard]:
        dead = [c for c in self.main_cards + self.side_cards
                if not c.alive and not c.has_status("frozen_state")]
        self.main_cards = [c for c in self.main_cards
                           if c.alive or c.has_status("frozen_state")]
        self.side_cards = [c for c in self.side_cards
                           if c.alive or c.has_status("frozen_state")]
        return dead

    def to_dict(self, for_opponent: bool = False) -> dict:
        return {
            "main": [c.to_dict(for_opponent) for c in self._alive(self.main_cards)],
            "side": [c.to_dict(for_opponent) for c in self._alive(self.side_cards)],
        }