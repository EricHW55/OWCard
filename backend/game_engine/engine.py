"""
게임 엔진 (v2).

GameState: 스킬 함수에 전달되는 게임 상태 객체.
  - get_skill_damage(caster, skill_key) → DB에서 읽은 데미지값
  - get_my_field(card) → 이 카드가 속한 필드
  - get_enemy_field(card) → 상대 필드
  - get_distance_between(a, b) → 두 카드 사이 거리

GameEngine: 게임 인스턴스 관리.
  - 턴 흐름: 멀리건 → 동전던지기 → (배치→액션→턴종료) 반복
  - 스킬 사용 시 레지스트리에서 함수 조회 → 실행
"""
from __future__ import annotations
import random
import uuid
from enum import Enum
from dataclasses import dataclass, field as dc_field
from typing import Any, Optional

from game_engine.field import Field, FieldCard, Role, Zone
from game_engine.skill_registry import get_skill, get_passive, get_hero_skills
from game_engine.status_effects import SkillSilence
from config import DECK_SIZE, HAND_SIZE, MAX_MULLIGAN, CARDS_PER_TURN


class GamePhase(str, Enum):
    WAITING = "waiting"
    MULLIGAN = "mulligan"
    PLACEMENT = "placement"
    ACTION = "action"
    GAME_OVER = "game_over"


# ═══════════════════════════════════════════════════════
#  PlayerState — 한 플레이어의 인게임 상태
# ═══════════════════════════════════════════════════════

@dataclass
class PlayerState:
    player_id: int
    username: str
    deck: list[dict] = dc_field(default_factory=list)
    hand: list[dict] = dc_field(default_factory=list)
    draw_pile: list[dict] = dc_field(default_factory=list)
    trash: list[dict] = dc_field(default_factory=list)
    field: Field = dc_field(default_factory=Field)
    mulligan_done: bool = False
    mulligan_used: int = 0
    placement_cost_used: int = 0
    connected: bool = False
    commander_skill_uses: int = 0
    pending_passive: Optional[dict] = None
    pending_spell: Optional[dict] = None

    def to_dict(self, reveal_hand: bool = True) -> dict:
        return {
            "player_id": self.player_id,
            "username": self.username,
            "hand_count": len(self.hand),
            "hand": list(self.hand) if reveal_hand else [],
            "draw_pile_count": len(self.draw_pile),
            "trash_count": len(self.trash),
            "trash": [{"name": c.get("name", "?"), "role": c.get("role", "?")} for c in self.trash] if reveal_hand else [],
            "field": self.field.to_dict(for_opponent=not reveal_hand),
            "mulligan_done": self.mulligan_done,
            "mulligan_used": self.mulligan_used,
            "placement_cost_used": self.placement_cost_used,
            "pending_passive": self.pending_passive if reveal_hand else None,
            "pending_spell": self.pending_spell if reveal_hand else None,
        }
        

# ═══════════════════════════════════════════════════════
#  GameState — 스킬 함수에 전달되는 헬퍼 객체
# ═══════════════════════════════════════════════════════

class GameState:
    """스킬 함수가 게임 상태에 접근하기 위한 인터페이스.

    스킬 함수 시그니처:
      fn(caster: FieldCard, target: FieldCard | None, game: GameState) -> dict
    """

    def __init__(self, engine: GameEngine):
        self._engine = engine

    # def get_skill_damage(self, caster: FieldCard, skill_key: str):
    #     """DB에서 읽어온 스킬 데미지값."""
    #     return caster.skill_damages.get(skill_key, 0)

    def _get_attack_buff_value(self, caster: FieldCard) -> int:
        return sum(
            int(getattr(status, "value", 0) or 0)
            for status in caster.statuses
            if status.name == "attack_buff"
        )

    def _get_damage_multiplier(self, caster: FieldCard) -> float:
        multiplier = 1.0
        for status in caster.statuses:
            if status.name != "damage_multiplier":
                continue
            multiplier *= float(getattr(status, "value", 1.0) or 1.0)
        return max(0.0, multiplier)

    def _apply_damage_modifiers(self, value: Any, attack_bonus: int, multiplier: float) -> Any:
        if attack_bonus == 0 and abs(multiplier - 1.0) < 1e-9:
            return value

        if isinstance(value, dict):
            patched = dict(value)
            for k, v in value.items():
                lowered = str(k).lower()
                if "damage" in lowered and "heal" not in lowered:
                    patched[k] = self._apply_damage_modifiers(v, attack_bonus, multiplier)
            return patched
        if isinstance(value, list):
            return [self._apply_damage_modifiers(v, attack_bonus, multiplier) for v in value]
        if isinstance(value, tuple):
            return tuple(self._apply_damage_modifiers(v, attack_bonus, multiplier) for v in value)
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return max(0, int(value * multiplier + attack_bonus))
        return value

    def get_skill_damage(self, caster: FieldCard, skill_key: str, *, apply_attack_buff: bool = True):
        """DB에서 읽어온 스킬 데미지값.

        apply_attack_buff=True일 때는 attack_buff 상태값을 데미지 계산에 반영한다.
        """
        base_value = caster.skill_damages.get(skill_key, 0)
        if not apply_attack_buff:
            return base_value
        attack_bonus = self._get_attack_buff_value(caster)
        damage_multiplier = self._get_damage_multiplier(caster)
        return self._apply_damage_modifiers(base_value, attack_bonus, damage_multiplier)
    
    def get_my_field(self, card: FieldCard) -> Field:
        """이 카드가 속한 플레이어의 필드."""
        for ps in self._engine.players.values():
            if ps.field.find_card(card.uid):
                return ps.field
        return Field()

    def get_enemy_field(self, card: FieldCard) -> Field:
        """상대 플레이어의 필드."""
        my_pid = None
        for pid, ps in self._engine.players.items():
            if ps.field.find_card(card.uid):
                my_pid = pid
                break
        for pid, ps in self._engine.players.items():
            if pid != my_pid:
                return ps.field
        return Field()

    def get_my_player(self, card: FieldCard) -> Optional[PlayerState]:
        """이 카드의 소유 플레이어."""
        for ps in self._engine.players.values():
            if ps.field.find_card(card.uid):
                return ps
        return None

    def get_enemy_player(self, card: FieldCard) -> Optional[PlayerState]:
        """상대 플레이어."""
        my_pid = None
        for pid, ps in self._engine.players.items():
            if ps.field.find_card(card.uid):
                my_pid = pid
                break
        for pid, ps in self._engine.players.items():
            if pid != my_pid:
                return ps
        return None

    def get_distance_between(self, a: FieldCard, b: FieldCard) -> int:
        """두 카드 사이 거리 (같은 필드면 레이어 차이, 다른 필드면 레이어 합)."""
        enemy_field = self.get_enemy_field(a)
        return enemy_field.get_distance(b)

    def draw_cards(self, card: FieldCard, count: int) -> list[dict]:
        """카드 드로우."""
        ps = self.get_my_player(card)
        if not ps:
            return []
        drawn = []
        for _ in range(count):
            if ps.draw_pile:
                drawn.append(ps.draw_pile.pop(0))
        ps.hand.extend(drawn)
        return drawn

    def get_actual_slot_index(self, target: FieldCard, damage_table, *, side_as_front: bool = False) -> int:
        if not isinstance(damage_table, (list, tuple)) or not damage_table:
            return 0
        if target.zone == Zone.SIDE:
            return 0 if side_as_front else len(damage_table) - 1
        role_index = {
            Role.TANK: 0,
            Role.DEALER: 1,
            Role.HEALER: 2,
        }
        return min(role_index.get(target.role, len(damage_table) - 1), len(damage_table) - 1)
    
    def get_shotgun_slot_index(self, _attacker: FieldCard, target: FieldCard, damage_table) -> int:
        """산탄형 공격 인덱스 계산.
        - 기본은 역할군(탱커/딜러/힐러) 기반 데미지 슬롯.
        - 4칸 테이블([근접,중,원,최원])만 사이드 칸 페널티를 적용.
        - Hooked면 풀딜(탱커 인덱스).
        - Pulled/Airborne은 각각 1단계 더 가까운 딜.
        - Side 여부와 무관하게 역할군 기준으로 계산한다.
          (이미 get_actual_slot_index에서 가장 먼 슬롯으로 계산됨)
        """
        if not isinstance(damage_table, (list, tuple)) or not damage_table:
            return 0

        role_index = {
            Role.TANK: 0,
            Role.DEALER: 1,
            Role.HEALER: 2,
        }
        idx = min(role_index.get(target.role, len(damage_table) - 1), len(damage_table) - 1)

        if target.has_status("hooked"):
            return 0

        step_bonus = 0
        if target.has_status("pulled"):
            step_bonus += 1
        if target.has_status("airborne") or target.has_status("gravity_flux_airborne"):
            step_bonus += 1

        idx = max(0, idx - step_bonus)
        return min(idx, len(damage_table) - 1)


# ═══════════════════════════════════════════════════════
#  GameEngine — 게임 인스턴스
# ═══════════════════════════════════════════════════════

class GameEngine:

    def __init__(self, game_id: str):
        self.game_id = game_id
        self.players: dict[int, PlayerState] = {}
        self.player_order: list[int] = []
        self.current_turn_index: int = 0
        self.turn_number: int = 0
        self.round_number: int = 1  # 라운드 (지휘관 스킬 횟수 결정)
        self.phase: GamePhase = GamePhase.WAITING
        self.winner: Optional[int] = None
        self.action_log: list[dict] = []
        
        self.pending_end_turn_effects: list[dict] = []
        
        # 스킬 함수 호출용 헬퍼
        self.state = GameState(self)

    @property
    def current_player_id(self) -> int:
        return self.player_order[self.current_turn_index]

    @property
    def opponent_player_id(self) -> int:
        return self.player_order[1 - self.current_turn_index]


    def _spell_requires_choice(self, hero_key: str) -> bool:
        return hero_key in {"spell_rescue", "spell_maximilian"}

    def _spell_needs_board_target(self, hero_key: str) -> bool:
        return hero_key in {
            "spell_thorn_volley", "spell_blizzard", "spell_earthshatter",
            "spell_biotic_grenade", "spell_nano_boost", "spell_duplicate",
            "spell_riptire", "spell_dragonblade", "spell_sleep_dart",
            "spell_immortality_field", "spell_deflect", "spell_caduceus_staff",
            "spell_gravity_flux",
        }

    def _build_spell_choice(self, ps: PlayerState, hero_key: str) -> dict:
        if hero_key == "spell_rescue":
            options = [
                {
                    "index": i,
                    "name": c.get("name", "?"),
                    "role": c.get("role", "?"),
                    "hero_key": c.get("hero_key", ""),
                    "is_spell": bool(c.get("is_spell", False)),
                }
                for i, c in enumerate(ps.trash)
            ]
            return {
                "type": "spell_rescue_select",
                "hero_key": hero_key,
                "title": "구원의 손길",
                "options": options,
            }

        if hero_key == "spell_maximilian":
            options = [
                {
                    "index": i,
                    "name": c.get("name", "?"),
                    "role": c.get("role", "?"),
                    "hero_key": c.get("hero_key", ""),
                    "is_spell": bool(c.get("is_spell", False)),
                }
                for i, c in enumerate(ps.draw_pile)
            ]
            return {
                "type": "spell_maximilian_select",
                "hero_key": hero_key,
                "title": "막시밀리앙",
                "options": options,
            }

        return {"type": "unknown", "hero_key": hero_key, "options": []}


    def _get_spell_template_data(self, ps: PlayerState, hero_key: str) -> dict:
        """현재 사용한 스펠 카드의 원본 템플릿 데이터 검색."""
        sources = [ps.hand, ps.trash, ps.deck, ps.draw_pile]
        for src in sources:
            for card in src:
                if card.get("hero_key") == hero_key and card.get("is_spell", False):
                    return dict(card)
        return {
            "id": -1,
            "hero_key": hero_key,
            "name": hero_key,
            "role": "spell",
            "hp": 0,
            "base_attack": 0,
            "base_defense": 0,
            "base_attack_range": 0,
            "description": "",
            "skill_damages": {},
            "skill_meta": {},
            "extra": {},
            "is_spell": True,
        }

    def _execute_spell_effect(self, ps: PlayerState, hero_key: str, *, target: FieldCard | None = None,
                              trash_index: int | None = None, draw_index: int | None = None,
                              zone: str | None = None) -> dict:
        spell_fn = get_skill(hero_key, "skill_1")
        if not spell_fn:
            return {"error": f"Spell function not found: {hero_key}"}

        spell_card = self._get_spell_template_data(ps, hero_key)
        dummy_caster = FieldCard(
            uid="spell_dummy",
            template_id=spell_card.get("id", -1),
            name=spell_card.get("name", hero_key),
            role=Role.DEALER,
            max_hp=0,
            base_attack=0,
            base_defense=0,
            base_attack_range=0,
            description=spell_card.get("description", ""),
            skill_damages=dict(spell_card.get("skill_damages", {})),
            skill_meta=dict(spell_card.get("skill_meta", {})),
            extra={
                **dict(spell_card.get("extra", {})),
                "_hero_key": hero_key,
                "_trash_index": trash_index,
                "_draw_index": draw_index,
                "_zone": zone,
                "is_spell": True,
            },
        )
        ps.field.main_cards.append(dummy_caster)
        try:
            result = spell_fn(dummy_caster, target, self.state)
        finally:
            ps.field.main_cards = [c for c in ps.field.main_cards if c.uid != "spell_dummy"]
        return result


    def _finalize_deaths(self, *player_states: PlayerState):
        seen: set[int] = set()
        for ps in player_states:
            if not ps or ps.player_id in seen:
                continue
            seen.add(ps.player_id)
            self._process_reactive_passives(ps)
            self._collect_dead_to_trash(ps)
            
    
    def _process_reactive_passives(self, ps: PlayerState):
        for card in list(ps.field.side_cards):
            if not card.alive:
                continue
            hero_key = card.extra.get("_hero_key", "")
            if hero_key != "kiriko":
                continue
            threshold = int(card.extra.get("swift_step_threshold", 4) or 4)
            if card.current_hp > threshold:
                continue
            ps.field.move_card(card, Zone.MAIN)

    # ── 플레이어 등록 ─────────────────────────

    def add_player(self, player_id: int, username: str, deck_cards: list[dict]) -> bool:
        if len(self.players) >= 2 or player_id in self.players:
            return False
        if len(deck_cards) != DECK_SIZE:
            return False
        self.players[player_id] = PlayerState(
            player_id=player_id, username=username, deck=deck_cards,
        )
        self.player_order.append(player_id)
        return True

    # ── 게임 시작 ─────────────────────────────

    def start_game(self) -> dict:
        if len(self.players) != 2:
            return {"error": "Need 2 players"}
        for ps in self.players.values():
            shuffled = list(ps.deck)
            random.shuffle(shuffled)
            ps.hand = shuffled[:HAND_SIZE]
            ps.draw_pile = shuffled[HAND_SIZE:]
        self.phase = GamePhase.MULLIGAN
        return {"phase": self.phase.value}

    # ── 멀리건 ────────────────────────────────

    def mulligan(self, player_id: int, card_indices: list[int]) -> dict:
        ps = self.players.get(player_id)
        if not ps or self.phase != GamePhase.MULLIGAN:
            return {"error": "Not in mulligan phase"}
        if ps.mulligan_done:
            return {"error": "Already done"}
        remaining = MAX_MULLIGAN - ps.mulligan_used
        if len(card_indices) > remaining:
            return {"error": f"Max {remaining} cards"}

        replaced = 0
        for idx in sorted(card_indices, reverse=True):
            if 0 <= idx < len(ps.hand) and ps.draw_pile:
                old = ps.hand.pop(idx)
                ps.draw_pile.append(old)
                ps.hand.insert(idx, ps.draw_pile.pop(0))
                replaced += 1

        ps.mulligan_used += replaced
        ps.mulligan_done = ps.mulligan_used >= MAX_MULLIGAN or len(card_indices) == 0
        if all(p.mulligan_done for p in self.players.values()):
            return self._coin_flip()
        remaining_after = max(0, MAX_MULLIGAN - ps.mulligan_used)
        message = "Waiting for opponent" if ps.mulligan_done else f"Mulligan remaining: {remaining_after}"
        return {"phase": self.phase.value, "message": message, "remaining": remaining_after}

    def skip_mulligan(self, player_id: int) -> dict:
        return self.mulligan(player_id, [])

    def _coin_flip(self) -> dict:
        first_idx = random.randint(0, 1)
        self.current_turn_index = first_idx
        self.turn_number = 1
        self.phase = GamePhase.PLACEMENT
        fid = self.player_order[first_idx]
        return {
            "phase": self.phase.value,
            "coin_result": "heads" if first_idx == 0 else "tails",
            "first_player": fid,
            "first_player_name": self.players[fid].username,
            "turn": self.turn_number,
        }

    def _build_field_card(self, card_data: dict, zone: Zone, *, placed_this_turn: bool = True) -> FieldCard:
        hero_name = card_data.get("hero_key", card_data.get("name", "").lower())
        return FieldCard(
            uid=uuid.uuid4().hex[:8],
            template_id=card_data.get("id", 0),
            name=card_data["name"],
            role=Role(card_data["role"]),
            max_hp=card_data.get("hp", card_data.get("max_hp", 1)),
            base_attack=card_data.get("attack", card_data.get("base_attack", 0)),
            base_defense=card_data.get("defense", card_data.get("base_defense", 0)),
            base_attack_range=card_data.get("attack_range", card_data.get("base_attack_range", 1)),
            description=card_data.get("description", ""),
            zone=zone,
            placed_this_turn=placed_this_turn,
            skills=get_hero_skills(hero_name),
            skill_damages=card_data.get("skill_damages", {}),
            skill_meta=card_data.get("skill_meta", {}),
            extra={**card_data.get("extra", {}), "_hero_key": hero_name},
        )

    def _summon_token(self, ps: PlayerState, token_data: dict, zone: str | Zone) -> Optional[FieldCard]:
        token_zone = zone if isinstance(zone, Zone) else Zone(zone)
        fc = self._build_field_card(token_data, token_zone, placed_this_turn=True)
        fc.extra["is_token"] = True
        if not ps.field.place_card(fc, token_zone):
            return None
        return fc

    def _apply_place_passive(self, ps: PlayerState, fc: FieldCard, hero_name: str) -> dict:
        passive_result = {}
        passive_fn = get_passive(hero_name)
        if passive_fn:
            passive_result = passive_fn(fc, self.state) or {}
            if "summon_token" in passive_result:
                spec = passive_result["summon_token"]
                token = self._summon_token(ps, spec, spec.get("zone", fc.zone.value))
                if token:
                    passive_result["summoned"] = token.to_dict()
                else:
                    passive_result["summon_failed"] = True
            if "needs_choice" in passive_result:
                ps.pending_passive = passive_result["needs_choice"]
        return passive_result

    def _place_from_hand_free(self, ps: PlayerState, hand_index: int, zone: str, *, trigger_passive: bool = True) -> dict:
        if hand_index < 0 or hand_index >= len(ps.hand):
            return {"error": "Invalid hand index"}
        card_data = ps.hand[hand_index]
        if card_data.get("is_spell", False):
            return {"error": "스킬 카드는 추가 배치할 수 없음"}
        target_zone = Zone(zone)
        hero_name = card_data.get("hero_key", card_data["name"].lower())
        fc = self._build_field_card(card_data, target_zone, placed_this_turn=True)
        if not ps.field.place_card(fc, target_zone):
            return {"error": f"Cannot place {card_data['role']} in {zone}"}
        ps.hand.pop(hand_index)
        result = {
            "success": True,
            "type": "card_placed",
            "card_uid": fc.uid,
            "card": fc.to_dict(),
            "zone": zone,
            "placement_cost_used": ps.placement_cost_used,
            "free_place": True,
        }
        if trigger_passive:
            passive_result = self._apply_place_passive(ps, fc, hero_name)
            if passive_result:
                result["passive_triggered"] = passive_result
        self._check_game_over()
        return result

    def _find_place_zone_for_role(self, ps: PlayerState, role: str, preferred: Optional[Zone] = None) -> Optional[Zone]:
        role_enum = Role(role)
        checks: list[Zone] = []
        if preferred:
            checks.append(preferred)
        for z in (Zone.MAIN, Zone.SIDE):
            if z not in checks:
                checks.append(z)
        for z in checks:
            if z == Zone.MAIN and ps.field.can_place_main(role_enum):
                return z
            if z == Zone.SIDE and ps.field.can_place_side(role_enum):
                return z
        return None

    def _process_auto_structures(self, ps: PlayerState) -> list[dict]:
        logs: list[dict] = []
        opp = self.players[self.opponent_player_id] if self.current_player_id in self.players else None
        if not opp:
            return logs
        for card in list(ps.field.all_cards()):
            kind = card.extra.get("token_kind")
            if kind == "torbjorn_turret":
                targets = opp.field.get_all_targetable(card)
                if targets:
                    target = targets[0]
                    dmg = card.extra.get("damage", card.skill_damages.get("auto", 2))
                    result = target.take_damage(dmg)
                    logs.append({"type": "auto_turret", "source_uid": card.uid, "source_name": card.name, "target_uid": target.uid, "damage_log": result})
            elif kind == "illari_pylon":
                allies = [a for a in ps.field.all_cards() if a.current_hp < a.max_hp]
                if allies:
                    target = max(allies, key=lambda c: (c.max_hp - c.current_hp, c.max_hp))
                    heal = card.extra.get("heal", card.skill_damages.get("auto", 3))
                    healed = target.heal(heal)
                    logs.append({"type": "auto_heal", "source_uid": card.uid, "source_name": card.name, "target_uid": target.uid, "healed": healed})
        opp.field.remove_dead()
        ps.field.remove_dead()
        return logs
    
    def _apply_particle_barrier_trigger(self, damage_log: dict | None) -> None:
        if not isinstance(damage_log, dict):
            return
        zarya_uid = str(damage_log.get("trigger_zarya_buff") or "")
        if not zarya_uid:
            return
        for player in self.players.values():
            zarya = player.field.find_card(zarya_uid)
            if not zarya:
                continue
            zarya.extra["particle_barrier_charge"] = 1
            zarya.extra["zarya_charge"] = 1
            break
        
    def _process_turn_start_hero_passives(self, ps: PlayerState) -> list[dict]:
        logs: list[dict] = []
        for card in list(ps.field.all_cards()):
            hero_key = card.extra.get("_hero_key", "")
            if hero_key != "brigitte":
                continue
            passive_fn = get_passive(hero_key)
            if not passive_fn:
                continue
            passive_result = passive_fn(card, self.state) or {}
            logs.append({
                "type": "turn_start_passive",
                "hero_key": hero_key,
                "source_uid": card.uid,
                "result": passive_result,
            })
        return logs


    def _trigger_field_traps(self, ps: PlayerState, placed_card: FieldCard) -> dict | None:
        """필드에 설치된 강철 덫 처리. 현재는 다음 배치 카드 1장에 발동."""
        traps = getattr(ps.field, "traps", None)
        if not traps:
            return None

        trap = traps.pop(0)
        damage = int(trap.get("damage", 0) or 0)
        silence_duration = int(trap.get("silence_duration", 2) or 2)

        damage_log = placed_card.take_damage(damage) if damage > 0 else None
        placed_card.add_status(SkillSilence(
            duration=silence_duration,
            source_uid=trap.get("source", "spell"),
            tags=["debuff", "cc", "install", "trap"],
        ))
        self._collect_dead_to_trash(ps)

        return {
            "type": "steel_trap",
            "target_uid": placed_card.uid,
            "damage": damage,
            "silence_duration": silence_duration,
            "damage_log": damage_log,
        }

    def resolve_passive_choice(self, player_id: int, *, trash_index: Optional[int] = None,
                               hand_index: Optional[int] = None, zone: Optional[str] = None,
                               skip: bool = False) -> dict:
        ps = self.players.get(player_id)
        if not ps:
            return {"error": "Player not found"}
        pending = ps.pending_passive
        if not pending:
            return {"error": "진행 중인 패시브 선택 없음"}

        if skip:
            skipped = pending.get("type")
            ps.pending_passive = None
            return {"success": True, "type": "passive_skipped", "passive": skipped}

        passive_type = pending.get("type")
        if passive_type == "mercy_resurrect":
            if trash_index is None or trash_index < 0 or trash_index >= len(ps.trash):
                return {"error": "잘못된 트래시 선택"}
            source = ps.field.find_card(pending.get("source_uid", ""))
            preferred = source.zone if source else Zone.MAIN
            card_data = dict(ps.trash[trash_index])
            place_zone = self._find_place_zone_for_role(ps, card_data.get("role", "dealer"), preferred)
            if not place_zone:
                return {"error": "부활시킬 자리가 없음"}
            revived = self._build_field_card(card_data, place_zone, placed_this_turn=True)
            if not ps.field.place_card(revived, place_zone):
                return {"error": "부활 배치 실패"}
            ps.trash.pop(trash_index)
            if source:
                source.extra["resurrected_uid"] = revived.uid
            ps.pending_passive = None
            self._log("passive", player_id, {"type": passive_type, "card_uid": revived.uid})
            self._check_game_over()
            return {"success": True, "type": "passive_resolved", "passive": passive_type, "card": revived.to_dict(), "zone": place_zone.value}

        if passive_type == "jetpack_cat_extra_place":
            if hand_index is None or zone not in ("main", "side"):
                return {"error": "추가 배치할 카드와 위치를 선택하세요"}
            if hand_index < 0 or hand_index >= len(ps.hand):
                return {"error": "잘못된 손패 선택"}
            selected = ps.hand[hand_index]
            if selected.get("is_spell", False):
                return {"error": "스킬 카드는 견인할 수 없습니다"}
            if selected.get("role") == "tank":
                return {"error": "탱커는 제트팩 캣으로 견인할 수 없습니다"}
            ps.pending_passive = None
            result = self._place_from_hand_free(ps, hand_index, zone, trigger_passive=True)
            if "error" in result:
                ps.pending_passive = pending
                return result
            self._log("passive", player_id, {"type": passive_type, **result})
            return {"success": True, "type": "passive_resolved", "passive": passive_type, **result}

        return {"error": f"지원하지 않는 패시브 선택: {passive_type}"}

    # ── 배치 ──────────────────────────────────

    def place_card(self, player_id: int, hand_index: int, zone: str) -> dict:
        if player_id != self.current_player_id or self.phase != GamePhase.PLACEMENT:
            return {"error": "Not your turn / wrong phase"}

        ps = self.players[player_id]
        if ps.pending_passive:
            return {"error": "패시브 선택을 먼저 완료하세요"}
        if ps.pending_spell:
            return {"error": "스킬 카드 선택을 먼저 완료하세요"}
        if hand_index < 0 or hand_index >= len(ps.hand):
            return {"error": "Invalid hand index"}

        card_data = ps.hand[hand_index]
        cost = card_data.get("cost", 1)
        if ps.placement_cost_used + cost > CARDS_PER_TURN:
            return {"error": f"Placement full ({ps.placement_cost_used}/{CARDS_PER_TURN})"}

        # 스킬 카드는 즉시 사용 / 선택 대기 처리
        if card_data.get("is_spell", False):
            hero_key = card_data.get("hero_key", "")
            if self._spell_requires_choice(hero_key):
                preview = self._build_spell_choice(ps, hero_key)
                if not preview.get("options"):
                    empty_msg = "트래시가 비어있습니다" if hero_key == "spell_rescue" else "덱이 비어있습니다"
                    return {"error": empty_msg}

            ps.hand.pop(hand_index)
            ps.placement_cost_used += cost
            ps.trash.append(card_data)

            if self._spell_requires_choice(hero_key):
                pending = self._build_spell_choice(ps, hero_key)
                ps.pending_spell = pending
                return {
                    "success": True,
                    "type": "spell_played",
                    "card": card_data,
                    "hero_key": hero_key,
                    "needs_target": False,
                    "needs_choice": True,
                    "choice": pending,
                    "placement_cost_used": ps.placement_cost_used,
                }

            if self._spell_needs_board_target(hero_key):
                return {
                    "success": True,
                    "type": "spell_played",
                    "card": card_data,
                    "hero_key": hero_key,
                    "needs_target": True,
                    "placement_cost_used": ps.placement_cost_used,
                }

            spell_result = self._execute_spell_effect(ps, hero_key)
            opp = self.players[self.opponent_player_id]
            if spell_result.get("skill") and not spell_result.get("skill_name"):
                spell_result["skill_name"] = spell_result["skill"]
            self._finalize_deaths(opp, ps)
            payload = {
                "success": True,
                "type": "spell_played",
                "card": card_data,
                "hero_key": hero_key,
                "needs_target": False,
                "placement_cost_used": ps.placement_cost_used,
                "skill_name": spell_result.get("skill", card_data.get("name", hero_key)),
                **spell_result,
            }
            self._log("spell", player_id, {"hero_key": hero_key, **payload})
            self._check_game_over()
            return payload

        target_zone = Zone(zone)
        hero_name = card_data.get("hero_key", card_data["name"].lower())
        fc = self._build_field_card(card_data, target_zone, placed_this_turn=True)
        if not ps.field.place_card(fc, target_zone):
            return {"error": f"Cannot place {card_data['role']} in {zone}"}

        ps.hand.pop(hand_index)
        ps.placement_cost_used += cost

        trap_result = self._trigger_field_traps(ps, fc)
        passive_result = self._apply_place_passive(ps, fc, hero_name) if fc.alive else {}
        result = {
            "success": True, "type": "card_placed",
            "card_uid": fc.uid, "card": fc.to_dict(),
            "zone": zone, "placement_cost_used": ps.placement_cost_used,
        }
        if trap_result:
            result["trap_triggered"] = trap_result
        if passive_result:
            result["passive_triggered"] = passive_result

        self._log("place", player_id, result)
        self._check_game_over()
        return result

    def end_placement(self, player_id: int) -> dict:
        if player_id != self.current_player_id or self.phase != GamePhase.PLACEMENT:
            return {"error": "Not your turn / wrong phase"}
        ps = self.players[player_id]
        if ps.pending_passive:
            return {"error": "패시브 선택을 먼저 완료하세요"}
        if ps.pending_spell:
            return {"error": "스킬 카드 선택을 먼저 완료하세요"}
        if ps.field.is_empty() and len(ps.hand) > 0:
            return {"error": "Must place at least 1 card when field is empty"}
        self.phase = GamePhase.ACTION
        return {"phase": self.phase.value}

    # ── 스킬 카드 실행 ───────────────────────

    def execute_spell(self, player_id: int, hero_key: str,
                  target_uid: str | None = None,
                  trash_index: int | None = None,
                  draw_index: int | None = None,
                  zone: str | None = None) -> dict:
        """스킬 카드 효과 실행."""
        if player_id != self.current_player_id:
            return {"error": "Not your turn"}

        ps = self.players[player_id]
        if ps.pending_passive:
            return {"error": "패시브 선택을 먼저 완료하세요"}
        opp = self.players[self.opponent_player_id]

        pending = getattr(ps, "pending_spell", None)
        if pending:
            if pending.get("hero_key") != hero_key:
                return {"error": "선택 중인 스킬 카드와 다릅니다"}
        elif hero_key in {"spell_rescue", "spell_maximilian"}:
            return {"error": "선택 중인 스킬 카드가 없습니다"}

        # websocket 라우터가 draw_index / trash_index를 직접 안 넘기는 경우 대비
        # target_uid에 실어 보낸 특수 토큰도 같이 파싱한다.
        if isinstance(target_uid, str):
            if target_uid.startswith("__draw__:") and draw_index is None:
                try:
                    draw_index = int(target_uid.split(":", 1)[1])
                    target_uid = None
                except (TypeError, ValueError):
                    return {"error": "잘못된 덱 카드 선택"}
            elif target_uid.startswith("__trash__:") and trash_index is None:
                try:
                    trash_index = int(target_uid.split(":", 1)[1])
                    target_uid = None
                except (TypeError, ValueError):
                    return {"error": "잘못된 트래시 카드 선택"}

        if pending:
            pending_type = pending.get("type")
            if pending_type == "spell_maximilian_select" and draw_index is None:
                return {"error": "가져올 덱 카드를 선택하세요"}
            if pending_type == "spell_rescue_select" and trash_index is None:
                return {"error": "가져올 트래시 카드를 선택하세요"}

        target = None
        if target_uid:
            target = ps.field.find_card(target_uid) or opp.field.find_card(target_uid)

        # 최신 엔진이면 이 헬퍼를 쓰고,
        # 구버전 엔진이면 아래 dummy caster fallback을 사용하면 된다.
        if hasattr(self, "_execute_spell_effect"):
            result = self._execute_spell_effect(
                ps,
                hero_key,
                target=target,
                trash_index=trash_index,
                draw_index=draw_index,
                zone=zone,
            )
        else:
            spell_fn = get_skill(hero_key, "skill_1")
            if not spell_fn:
                return {"error": f"Spell function not found: {hero_key}"}

            spell_card = self._get_spell_template_data(ps, hero_key)
            dummy_caster = FieldCard(
                uid="spell_dummy",
                template_id=spell_card.get("id", -1),
                name=spell_card.get("name", hero_key),
                role=Role.DEALER,
                max_hp=0,
                base_attack=0,
                base_defense=0,
                base_attack_range=0,
                description=spell_card.get("description", ""),
                skill_damages=dict(spell_card.get("skill_damages", {})),
                skill_meta=dict(spell_card.get("skill_meta", {})),
                extra={
                    **dict(spell_card.get("extra", {})),
                    "_hero_key": hero_key,
                    "_trash_index": trash_index,
                    "_draw_index": draw_index,
                    "_zone": zone,
                    "is_spell": True,
                },
            )
            ps.field.main_cards.append(dummy_caster)
            try:
                result = spell_fn(dummy_caster, target, self.state)
            finally:
                ps.field.main_cards = [c for c in ps.field.main_cards if c.uid != "spell_dummy"]

        if result.get("skill") and not result.get("skill_name"):
            result["skill_name"] = result["skill"]

        if hasattr(self, "_finalize_deaths"):
            self._finalize_deaths(opp, ps)
        else:
            opp.field.remove_dead()
            ps.field.remove_dead()

        if result.get("success") and hasattr(ps, "pending_spell"):
            ps.pending_spell = None

        self._log("spell", player_id, {"hero_key": hero_key, **result})
        self._check_game_over()
        return result

    def _get_skill_range_override(self, caster: FieldCard, skill_key: str) -> int | None:
        hero_key = str(caster.extra.get("_hero_key", "")).lower()
        if hero_key == "dva" and skill_key == "skill_1":
            return 2
        if hero_key == "junkerqueen" and skill_key == "skill_1":
            return 3
        if hero_key == "roadhog" and skill_key == "skill_1": 
            return 3
        if hero_key == "ashe" and skill_key == "skill_2":
            return 3
        if hero_key == "sojourn" and skill_key == "skill_2":
            # 차징샷은 대상이 속한 세로줄 전체를 타격하므로 사실상 거리 제한 없음.
            return 3
        
        return None

    # ── 액션: 스킬 사용 ──────────────────────

    def use_skill(self, player_id: int, caster_uid: str,
                  skill_key: str, target_uid: str | None = None) -> dict:
        """스킬 사용. 레지스트리에서 함수를 찾아 실행."""
        if player_id != self.current_player_id or self.phase != GamePhase.ACTION:
            return {"error": "Not your turn / wrong phase"}

        ps = self.players[player_id]
        if ps.pending_passive:
            return {"error": "패시브 선택을 먼저 완료하세요"}
        if ps.pending_spell:
            return {"error": "스킬 카드 선택을 먼저 완료하세요"}
        opp = self.players[self.opponent_player_id]

        caster = ps.field.find_card(caster_uid)
        if not caster:
            return {"error": "Caster not found"}

        can_use, reason = caster.can_use_skill(skill_key)
        if not can_use:
            return {"error": reason}

        # 대상 찾기 (아군 또는 적군)
        target = None
        is_enemy_target = False
        if target_uid:
            # 아군인지 적군인지 판단
            ally = ps.field.find_card(target_uid)
            enemy = opp.field.find_card(target_uid)
            if ally:
                target = ally
                is_enemy_target = False
            elif enemy:
                target = enemy
                is_enemy_target = True

        # 적군 대상이면 사거리 검증
        if target and is_enemy_target:
            range_override = self._get_skill_range_override(caster, skill_key)
            hero_key = str(caster.extra.get("_hero_key", "")).lower()
            ignore_taunt_for_targeting = hero_key == "sojourn" and skill_key == "skill_2"
            valid_targets = opp.field.get_all_targetable(
                caster,
                override_range=range_override,
                apply_taunt=not ignore_taunt_for_targeting,
            )
            valid_target_uids = {c.uid for c in valid_targets}
            shown_range = range_override if range_override is not None else caster.attack_range
            if target.uid not in valid_target_uids:
                reachable_targets = opp.field.get_all_targetable(caster, override_range=range_override, apply_taunt=False)
                reachable_target_uids = {c.uid for c in reachable_targets}
                if (not ignore_taunt_for_targeting) and target.uid in reachable_target_uids and any(c.has_status("taunt") for c in reachable_targets):
                    return {"error": "도발 효과로 인해 해당 대상을 지정할 수 없습니다"}
                return {"error": f"사거리 밖의 대상입니다 (사거리: {shown_range})"}
        elif target and not is_enemy_target:
            # 힐러는 자기 자신을 직접 타겟팅해서 스킬을 사용할 수 없다.
            caster_role = getattr(caster.role, "value", caster.role)
            if caster.uid == target.uid and str(caster_role).lower() == "healer":
                return {"error": "힐러는 자기 자신을 대상으로 스킬을 사용할 수 없습니다"}

        # 스킬 함수 실행
        skill_fn = caster.skills.get(skill_key)
        if not skill_fn:
            return {"error": "Skill function not found"}

        result = skill_fn(caster, target, self.state)
        # 프론트 announcer/killfeed에서 안정적으로 시전자 이미지를 매핑할 수 있도록
        # 스킬 사용 결과에 시전자 메타데이터를 항상 포함한다.
        result.setdefault("caster_uid", caster.uid)
        result.setdefault("caster_name", caster.name)
        result.setdefault("caster_hero_key", caster.extra.get("_hero_key", ""))
        result.setdefault("skill_key", skill_key)
        if result.get("skill") and not result.get("skill_name"):
            result["skill_name"] = result["skill"]

        if result.get("success"):
            # 이번 턴 행동 완료 표시
            caster.acted_this_turn = True

            # 쿨다운 설정
            cd = result.get("cooldown", 0)
            if cd > 0:
                caster.skill_cooldowns[skill_key] = cd
            # 사용 횟수 차감
            if skill_key in caster.skill_uses:
                caster.skill_uses[skill_key] -= 1

            # 반사 데미지 처리
            for target_card_logs in [result.get("damage_log", {})]:
                if isinstance(target_card_logs, dict) and target_card_logs.get("reflected"):
                    reflect_dmg = target_card_logs["reflected"]
                    caster.take_raw_damage(reflect_dmg)
                    result["reflected_to_caster"] = reflect_dmg
                self._apply_particle_barrier_trigger(target_card_logs)
            if result.get("swift_strike_reset"):
                caster.acted_this_turn = False

        # 사망 처리
        self._finalize_deaths(opp, ps)

        self._log("skill", player_id, result)
        self._check_game_over()
        return result

    # ── 액션: 기본 공격 ──────────────────────

    def basic_attack(self, player_id: int, attacker_uid: str, target_uid: str) -> dict:
        if player_id != self.current_player_id or self.phase != GamePhase.ACTION:
            return {"error": "Not your turn / wrong phase"}

        ps = self.players[player_id]
        if ps.pending_passive:
            return {"error": "패시브 선택을 먼저 완료하세요"}
        if ps.pending_spell:
            return {"error": "스킬 카드 선택을 먼저 완료하세요"}
        opp = self.players[self.opponent_player_id]

        attacker = ps.field.find_card(attacker_uid)
        if not attacker:
            return {"error": "Attacker not found"}
        if attacker.placed_this_turn:
            return {"error": "Placed this turn"}
        if attacker.acted_this_turn:
            return {"error": "Already acted"}
        if attacker.has_status("frozen_state"):
            return {"error": "빙결 상태"}

        target = opp.field.find_card(target_uid)
        if not target:
            return {"error": "Target not found"}

        # 공격 가능 검증
        valid = opp.field.get_all_targetable(attacker)
        if target_uid not in {c.uid for c in valid}:
            return {"error": "Target not in range"}

        # on_before_targeted 체크
        for s in target.statuses:
            res = s.on_before_targeted(target, attacker)
            if res.get("untargetable"):
                return {"error": "Target is untargetable"}

        result = target.take_damage(attacker.attack)
        self._apply_particle_barrier_trigger(result)

        # 반사 처리
        if result.get("reflected"):
            attacker.take_raw_damage(result["reflected"])

        self._finalize_deaths(opp, ps)

        log = {"success": True, "type": "basic_attack",
               "attacker": attacker_uid, "damage_log": result}
        self._log("attack", player_id, log)
        self._check_game_over()
        return log

    # ── 턴 종료 ───────────────────────────────

    def end_turn(self, player_id: int) -> dict:
        if player_id != self.current_player_id:
            return {"error": "Not your turn"}
        if self.phase not in (GamePhase.PLACEMENT, GamePhase.ACTION):
            return {"error": "Cannot end turn now"}

        ps = self.players[player_id]
        if ps.pending_passive:
            return {"error": "패시브 선택을 먼저 완료하세요"}
        if ps.pending_spell:
            return {"error": "스킬 카드 선택을 먼저 완료하세요"}
        opp = self.players[self.opponent_player_id]

        # 턴 종료 처리 (화상 데미지 등)
        turn_end_logs = ps.field.process_all_turn_end()
        ps.placement_cost_used = 0
        turn_end_logs.extend(self._process_pending_end_turn_effects(player_id))

        # 양쪽 사망 카드 → 각자 트래시로 (전체 카드 데이터 저장)
        self._collect_dead_to_trash(ps)
        self._collect_dead_to_trash(opp)

        # 턴 교대
        self.current_turn_index = 1 - self.current_turn_index
        new_ps = self.players[self.current_player_id]
        new_ps.field.mark_all_available()
        new_ps.placement_cost_used = 0

        # 새 턴 시작 처리 (점착폭탄 터짐 등)
        turn_start_logs = new_ps.field.process_all_turn_start()
        turn_start_logs.extend(self._process_turn_start_hero_passives(new_ps))
        turn_start_logs.extend(self._process_auto_structures(new_ps))
        # 시작 처리에서 죽은 카드도 트래시로
        self._collect_dead_to_trash(new_ps)
        self._collect_dead_to_trash(
            self.players[[pid for pid in self.players if pid != self.current_player_id][0]]
        )

        if self.current_turn_index == 0:
            self.turn_number += 1
            if self.turn_number % 2 == 1:
                self.round_number += 1

        self.phase = GamePhase.PLACEMENT

        self._check_game_over()
        return {
            "phase": self.phase.value,
            "current_player": self.current_player_id,
            "turn": self.turn_number,
            "round": self.round_number,
            "turn_end_logs": turn_end_logs,
            "turn_start_logs": turn_start_logs,
        }

    def _collect_dead_to_trash(self, ps: PlayerState):
        """사망 카드를 필드에서 제거하고 트래시에 전체 데이터로 저장."""
        dead = ps.field.remove_dead()
        for d in dead:
            if d.extra.get("is_token"):
                continue
            # 원본 덱 데이터를 찾아서 트래시에 저장 (구원의 손길로 복구 가능)
            original = None
            for card_data in ps.deck:
                if card_data.get("id") == d.template_id:
                    original = dict(card_data)  # 복사본
                    break
            if original:
                ps.trash.append(original)
            else:
                # 원본을 못 찾으면 기본 정보라도 저장
                ps.trash.append({
                    "id": d.template_id,
                    "hero_key": d.name.lower(),
                    "name": d.name,
                    "role": d.role.value,
                    "hp": d.max_hp,
                })
                
    def _process_pending_end_turn_effects(self, trigger_player_id: int) -> list[dict]:
        import math

        logs = []
        remaining = []

        for eff in self.pending_end_turn_effects:
            if eff.get("trigger_player_id") != trigger_player_id:
                remaining.append(eff)
                continue

            if eff.get("kind") != "gravity_flux":
                remaining.append(eff)
                continue

            target_ps = self.players.get(eff.get("target_player_id"))
            if not target_ps:
                continue

            for uid in eff.get("target_uids", []):
                card = target_ps.field.find_card(uid)
                if not card or not card.alive:
                    continue

                if card.has_status("gravity_flux_airborne"):
                    dmg = math.ceil(card.max_hp / 2)
                    dmg_log = card.take_damage(dmg)
                    card.remove_status("gravity_flux_airborne")
                    logs.append({
                        "type": "gravity_flux",
                        "target_uid": uid,
                        "damage_log": dmg_log,
                        "damage": dmg,
                    })

            self._collect_dead_to_trash(target_ps)

        self.pending_end_turn_effects = remaining
        return logs

    # ── 지휘관 스킬 ──────────────────────────

    def get_commander_skill_limit(self) -> int:
        """현재 라운드에서 지휘관 스킬 사용 가능 횟수.
        1라운드=0, 2라운드=1, 3라운드=2..."""
        return max(0, self.round_number - 1)

    # ── 유틸 ──────────────────────────────────

    def _check_game_over(self):
        for pid, ps in self.players.items():
            opp_id = [p for p in self.players if p != pid][0]
            opp = self.players[opp_id]
            if opp.field.is_empty() and len(opp.hand) == 0:
                self.winner = pid
                self.phase = GamePhase.GAME_OVER

    def _log(self, action_type: str, player_id: int, data: dict):
        self.action_log.append({
            "turn": self.turn_number,
            "player_id": player_id,
            "action": action_type,
            "data": data,
        })

    def get_state(self, for_player_id: int) -> dict:
        ps = self.players.get(for_player_id)
        opp_ids = [pid for pid in self.players if pid != for_player_id]
        opp = self.players[opp_ids[0]] if opp_ids else None
        return {
            "game_id": self.game_id,
            "phase": self.phase.value,
            "turn": self.turn_number,
            "round": self.round_number,
            "current_player": self.current_player_id if self.player_order else None,
            "is_my_turn": for_player_id == self.current_player_id if self.player_order else False,
            "my_state": ps.to_dict(reveal_hand=True) if ps else None,
            "opponent_state": opp.to_dict(reveal_hand=False) if opp else None,
            "winner": self.winner,
            "commander_skill_limit": self.get_commander_skill_limit(),
        }

    def get_spectator_state(self) -> dict:
        return {
            "game_id": self.game_id,
            "phase": self.phase.value,
            "turn": self.turn_number,
            "round": self.round_number,
            "current_player": self.current_player_id if self.player_order else None,
            "players": {pid: ps.to_dict(reveal_hand=False) for pid, ps in self.players.items()},
            "winner": self.winner,
            "action_log": self.action_log[-20:],
        }