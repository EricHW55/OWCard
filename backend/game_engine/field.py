"""
필드 시스템 (v2).

FieldCard: 상태 효과 훅이 통합된 카드 인스턴스.
  - 데미지 받을 때 → 모든 상태 효과의 on_take_damage 순서대로 호출
  - 사망 시 → on_death 호출 → 메이 빙결, 디바 송하나 등 처리
  - 타겟 선택 시 → on_before_targeted → 은신/잠복 체크

Field: 본대/사이드 관리 + 거리 시스템.
  - 본대: 탱커(거리1) > 딜러(거리2) > 힐러(거리3), 빈 역할은 당겨짐
  - 사이드: 한 단계 무시 공격 가능
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
    uid: str                       # 게임 내 고유 ID
    template_id: int               # DB 카드 ID
    name: str
    role: Role
    max_hp: int
    base_attack: int               # DB에서 읽은 기본 공격력
    base_defense: int
    base_attack_range: int
    description: str = ""          # 카드 설명 (프론트 표시용)
    zone: Zone = Zone.MAIN

    # ── 인게임 상태 ───────────────────────────
    current_hp: int = 0
    statuses: list[StatusEffect] = dc_field(default_factory=list)
    placed_this_turn: bool = True  # 이번 턴에 놓였으면 스킬 못 씀
    acted_this_turn: bool = False  # 이번 턴에 스킬을 이미 썼으면 True

    # ── 스킬 함수 연결 ────────────────────────
    # {"skill_1": callable, "skill_2": callable, "passive": callable}
    skills: dict[str, Callable] = dc_field(default_factory=dict)
    skill_cooldowns: dict[str, int] = dc_field(default_factory=dict)
    skill_uses: dict[str, int] = dc_field(default_factory=dict)

    # ── 스킬 데미지 (DB에서 로드, 밸런스 패치용) ──
    skill_damages: dict[str, any] = dc_field(default_factory=dict)
    # 예: {"skill_1": 6, "skill_2": [8, 5, 3, 1]}

    # ── 스킬 메타 (이름, 쿨다운 등 — 프론트에 전달) ──
    skill_meta: dict[str, dict] = dc_field(default_factory=dict)
    # 예: {"skill_1": {"name": "화염강타", "cooldown": 0}}

    # ── 추가 데이터 (폼 체인지, 포탑 등) ──────
    extra: dict = dc_field(default_factory=dict)
    # 예: {"form": "normal", "turret_uid": "xxx", "charge_level": 0}

    def __post_init__(self):
        if self.current_hp == 0:
            self.current_hp = self.max_hp

    # ── 생존 여부 ─────────────────────────────

    @property
    def alive(self) -> bool:
        return self.current_hp > 0

    # ── 상태 효과 관리 ────────────────────────

    def add_status(self, status: StatusEffect) -> dict:
        """상태 효과 추가. 중복 불가면 기존 것 교체."""
        if not status.stackable:
            self.statuses = [s for s in self.statuses if s.name != status.name]
        self.statuses.append(status)
        return status.on_apply(self)

    def remove_status(self, name: str) -> Optional[StatusEffect]:
        """이름으로 상태 효과 제거."""
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
        """특정 태그를 가진 상태 효과가 있는지."""
        return any(tag in s.tags for s in self.statuses)

    # ── 전투 수치 (상태 효과 반영) ────────────

    @property
    def attack(self) -> int:
        """현재 공격력 = 기본 + 모든 attack_buff."""
        mod = sum(s.value for s in self.statuses if s.name == "attack_buff")
        return max(0, self.base_attack + mod)

    @property
    def attack_range(self) -> int:
        """현재 사거리 = 기본 + range_modifier - knockback."""
        mod = sum(s.value for s in self.statuses if s.name == "range_modifier")
        knockback = sum(s.value for s in self.statuses if s.name == "knockback")
        return max(1, self.base_attack_range + mod - knockback)

    @property
    def is_silenced(self) -> bool:
        return self.has_status("skill_silence")

    @property
    def is_targetable(self) -> bool:
        """공격 대상으로 선택 가능한지."""
        for s in self.statuses:
            if s.name in ("stealth", "burrowed", "frozen_state"):
                return False
        return True

    # ── 데미지 처리 (상태 효과 훅 체인) ───────

    def take_damage(self, damage: int, **kwargs) -> dict:
        """데미지를 받는 전체 과정.

        1. 모든 상태 효과의 on_take_damage를 순서대로 호출
        2. 최종 데미지 적용
        3. 사망 체크 → on_death 호출

        kwargs: ignore_barrier=True (화염강타), source_uid="xxx" 등
        """
        log = {"original_damage": damage, "target": self.uid}
        current_damage = damage

        # 1단계: 상태 효과가 데미지 수정
        for status in list(self.statuses):
            result = status.on_take_damage(self, current_damage, **kwargs)
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

        # 2단계: 최종 데미지 적용
        current_damage = max(0, current_damage)
        self.current_hp = max(0, self.current_hp - current_damage)
        log["final_damage"] = current_damage
        log["remaining_hp"] = self.current_hp

        # 3단계: 후처리
        for s in list(self.statuses):
            s.on_after_damage(self, current_damage)

        # 4단계: 사망 체크
        if self.current_hp <= 0:
            death_result = self._process_death()
            log.update(death_result)

        return log

    def take_raw_damage(self, damage: int) -> dict:
        """상태 효과 무시 직접 데미지 (화상, 폭탄 등)."""
        self.current_hp = max(0, self.current_hp - damage)
        log = {"raw_damage": damage, "remaining_hp": self.current_hp}
        if self.current_hp <= 0:
            death_result = self._process_death()
            log.update(death_result)
        return log

    def _process_death(self) -> dict:
        """사망 처리. 상태 효과가 죽음을 막을 수 있음."""
        for status in list(self.statuses):
            result = status.on_death(self)
            if result.get("prevent_death"):
                if "set_hp" in result:
                    self.current_hp = result["set_hp"]
                return {"death_prevented": True, "by": status.name, **result}
        return {"died": True}

    # ── 힐 처리 ───────────────────────────────

    def heal(self, amount: int) -> int:
        """힐. 힐차단/힐증폭 체크."""
        if self.has_status("heal_block"):
            return 0
        amp = sum(s.value for s in self.statuses if s.name == "heal_amplify")
        actual = amount + amp
        before = self.current_hp
        self.current_hp = min(self.max_hp, self.current_hp + actual)
        return self.current_hp - before

    # ── 턴 관리 ───────────────────────────────

    def process_turn_start(self) -> list[dict]:
        logs = []
        for s in list(self.statuses):
            result = s.on_turn_start(self)
            if result:
                logs.append({"status": s.name, **result})
        return logs

    def process_turn_end(self) -> list[dict]:
        logs = []
        # 1. 턴 종료 효과 (화상 등)
        for s in list(self.statuses):
            result = s.on_turn_end(self)
            if result:
                logs.append({"status": s.name, **result})
        # 2. duration 감소 + 만료 제거
        expired = [s for s in self.statuses if s.tick()]
        for s in expired:
            s.on_remove(self)
            self.statuses.remove(s)
            logs.append({"status_expired": s.name})
        # 3. 쿨다운 감소
        for sk in list(self.skill_cooldowns.keys()):
            self.skill_cooldowns[sk] -= 1
            if self.skill_cooldowns[sk] <= 0:
                del self.skill_cooldowns[sk]
        return logs

    # ── 스킬 사용 가능 체크 ───────────────────

    def can_use_skill(self, skill_key: str) -> tuple[bool, str]:
        if self.placed_this_turn:
            return False, "이번 턴에 배치한 카드"
        if self.acted_this_turn:
            return False, "이번 턴에 이미 행동함"
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

    # ── 직렬화 ────────────────────────────────

    def to_dict(self, for_opponent: bool = False) -> dict:
        statuses = []
        for s in self.statuses:
            if for_opponent and not s.visible_to_opponent:
                continue
            statuses.append(s.to_dict())
        return {
            "uid": self.uid,
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

    # ── 기본 유틸 ─────────────────────────────

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

    # ── 배치 ──────────────────────────────────

    def _count_role(self, cards: list[FieldCard], role: Role) -> int:
        return sum(1 for c in cards if c.role == role and c.alive)

    def can_place_main(self, role: Role) -> bool:
        main_limits = {Role.TANK: 1, Role.DEALER: 2, Role.HEALER: 2}
        total_limits = {Role.TANK: 2, Role.DEALER: 2, Role.HEALER: 2}  # 본대+사이드 합산
        main_count = self._count_role(self.main_cards, role)
        total_count = main_count + self._count_role(self.side_cards, role)
        return main_count < main_limits[role] and total_count < total_limits[role]

    def can_place_side(self, role: Role) -> bool:
        alive = self._alive(self.side_cards)
        # 사이드 기본 규칙: 탱커 1명 단독 or 딜러+힐러 각 1명
        if role == Role.TANK:
            if len(alive) > 0:
                return False
        else:
            has_tank = any(c.role == Role.TANK for c in alive)
            if has_tank:
                return False
            if self._count_role(self.side_cards, role) > 0:
                return False
        # 총량 제한: 딜러/힐러는 본대+사이드 합쳐서 2장까지
        total_limits = {Role.TANK: 2, Role.DEALER: 2, Role.HEALER: 2}
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

    def move_card(self, card: FieldCard, to_zone: Zone) -> bool:
        """사이드↔본대 이동 (레킹볼, 시메트라 등)."""
        if card.zone == to_zone:
            return False
        if to_zone == Zone.MAIN:
            if not self.can_place_main(card.role):
                return False
            self.side_cards = [c for c in self.side_cards if c.uid != card.uid]
            self.main_cards.append(card)
        else:
            if not self.can_place_side(card.role):
                return False
            self.main_cards = [c for c in self.main_cards if c.uid != card.uid]
            self.side_cards.append(card)
        card.zone = to_zone
        return True

    # ── 거리 / 레이어 ────────────────────────

    def _main_layers(self) -> list[list[FieldCard]]:
        """본대를 역할 순서대로 레이어로 나눔."""
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
        alive_targetables = [c for c in layer if c.is_targetable]
        if not alive_targetables:
            return False

        for card in alive_targetables:
            ignore = False
            for s in card.statuses:
                res = s.on_before_targeted(card, attacker)
                if res.get("ignore_as_blocker"):
                    ignore = True
                    break
            if not ignore:
                return False
        return True


    def get_targetable_from_main(self, attacker: FieldCard, override_range: int | None = None) -> list[FieldCard]:
        atk_range = override_range if override_range is not None else attacker.attack_range

        bypass = 0
        for s in attacker.statuses:
            result = s.on_before_attack(attacker, None)
            bypass += result.get("bypass_distance", 0)
        effective_range = atk_range + bypass

        layers = self._main_layers()

        taunt_cards = [
            c for layer in layers for c in layer
            if c.has_status("taunt") and c.is_targetable
        ]
        if taunt_cards:
            return taunt_cards

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

        return result


    def get_all_targetable(self, attacker: FieldCard, override_range: int | None = None) -> list[FieldCard]:
        if attacker.zone == Zone.MAIN:
            targets = self.get_targetable_from_main(attacker, override_range=override_range)
        else:
            targets = self.get_targetable_from_side(attacker)
        targets += self.get_side_targets()
        seen = set()
        return [t for t in targets if not (t.uid in seen or seen.add(t.uid))]

    # def get_targetable_from_main(self, attacker: FieldCard) -> list[FieldCard]:
    #     """본대에서 공격 시: 사거리 내 + 도발 체크 + 타겟 가능 체크."""
    #     atk_range = attacker.attack_range

    #     # bypass_distance 체크 (프레야, 벤처 등)
    #     bypass = 0
    #     for s in attacker.statuses:
    #         result = s.on_before_attack(attacker, None)
    #         bypass += result.get("bypass_distance", 0)
    #     effective_range = atk_range + bypass

    #     layers = self._main_layers()

    #     # 도발 체크
    #     taunt_cards = [
    #         c for layer in layers for c in layer
    #         if c.has_status("taunt") and c.is_targetable
    #     ]
    #     if taunt_cards:
    #         return taunt_cards

    #     result = []
    #     for i, layer in enumerate(layers):
    #         if (i + 1) <= effective_range:
    #             result.extend(c for c in layer if c.is_targetable)
    #         else:
    #             break
    #     return result

    def get_targetable_from_side(self, attacker: FieldCard) -> list[FieldCard]:
        """사이드에서 본대 공격 시: 한 단계 무시."""
        layers = self._main_layers()

        # 도발 체크
        taunt_cards = [
            c for layer in layers for c in layer
            if c.has_status("taunt") and c.is_targetable
        ]
        if taunt_cards:
            return taunt_cards

        if len(layers) <= 1:
            return [c for layer in layers for c in layer if c.is_targetable]
        result = []
        for layer in layers[1:]:
            result.extend(c for c in layer if c.is_targetable)
        return result

    def get_side_targets(self) -> list[FieldCard]:
        return [c for c in self._alive(self.side_cards) if c.is_targetable]

    # def get_all_targetable(self, attacker: FieldCard) -> list[FieldCard]:
    #     """공격자 위치에 따른 모든 가능 대상."""
    #     if attacker.zone == Zone.MAIN:
    #         targets = self.get_targetable_from_main(attacker)
    #     else:
    #         targets = self.get_targetable_from_side(attacker)
    #     targets += self.get_side_targets()
    #     seen = set()
    #     return [t for t in targets if not (t.uid in seen or seen.add(t.uid))]

    # ── 특수 타겟팅 (스킬용) ──────────────────

    def get_column(self, card: FieldCard) -> list[FieldCard]:
        """같은 세로줄(열): 같은 역할군 + 사이드."""
        col = [c for c in self._alive(self.main_cards) if c.role == card.role]
        col += self._alive(self.side_cards)
        return col

    def get_row(self, zone: Zone) -> list[FieldCard]:
        """같은 가로줄(행): 본대 전체 or 사이드 전체."""
        if zone == Zone.MAIN:
            return self._alive(self.main_cards)
        return self._alive(self.side_cards)

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

    # ── 직렬화 ────────────────────────────────

    def to_dict(self, for_opponent: bool = False) -> dict:
        return {
            "main": [c.to_dict(for_opponent) for c in self._alive(self.main_cards)],
            "side": [c.to_dict(for_opponent) for c in self._alive(self.side_cards)],
        }