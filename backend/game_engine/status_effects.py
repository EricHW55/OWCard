"""
상태 효과 시스템.

모든 상태 효과(버프, 디버프, 특수 상태)는 StatusEffect를 상속받아
필요한 훅(hook)만 오버라이드합니다.

훅 호출 시점:
  on_apply()          → 효과가 카드에 적용될 때
  on_turn_start()     → 이 카드의 턴이 시작될 때
  on_before_attack()  → 이 카드가 공격하기 전 (공격력 수정 등)
  on_before_targeted()→ 이 카드가 공격 대상으로 선택될 때 (회피, 은신 등)
  on_take_damage()    → 이 카드가 데미지를 받을 때 (방벽, 감소, 반사 등)
  on_after_damage()   → 데미지 받은 후 처리 (자리야 입자 방벽 등)
  on_death()          → 이 카드가 죽을 때 (메이 빙결, 디바 송하나 등)
  on_turn_end()       → 턴 끝날 때 (화상 데미지 등)
  on_remove()         → 효과가 제거될 때 (정리)

사용 예:
  card.add_status(Frozen(duration=1, revive_hp=card.max_hp // 2))
  card.add_status(Airborne(duration=1))
  card.add_status(Barrier(hp=15, blocks_passthrough=True))
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Optional

if TYPE_CHECKING:
    from game_engine.field import FieldCard


@dataclass
class StatusEffect:
    """상태 효과 기본 클래스. 모든 상태 효과가 이걸 상속."""
    name: str                          # "frozen", "airborne", "barrier" 등
    duration: int = -1                 # 남은 턴 (-1 = 영구, 0이 되면 제거)
    source_uid: str = ""               # 누가 건 효과인지
    stackable: bool = False            # 같은 이름 중복 가능 여부
    visible_to_opponent: bool = True   # 상대에게 보이는지
    tags: list[str] = field(default_factory=list)  # 분류 태그: ["buff", "debuff", "cc", "movement"]

    # ── 훅 메서드들 (필요한 것만 오버라이드) ─────

    def on_apply(self, card: FieldCard) -> dict:
        """효과 적용 시."""
        return {}

    def on_turn_start(self, card: FieldCard) -> dict:
        """카드의 턴 시작 시."""
        return {}

    def on_before_attack(self, card: FieldCard, target: FieldCard) -> dict:
        """이 카드가 공격 전. 공격력 수정, 추가 효과 등.
        반환값에 "cancel": True 넣으면 공격 취소."""
        return {}

    def on_before_targeted(self, card: FieldCard, attacker: FieldCard) -> dict:
        """이 카드가 공격 대상으로 선택될 때.
        반환값에 "untargetable": True 넣으면 타겟 불가."""
        return {}

    def on_take_damage(self, card: FieldCard, damage: int, **kwargs) -> dict:
        """데미지 받을 때. 반환값에 "damage": 수정된값 넣으면 데미지 변경.
        "absorbed": True 면 데미지 완전 흡수.
        "reflect": 값 이면 반사."""
        return {"damage": damage}

    def on_after_damage(self, card: FieldCard, damage_taken: int) -> dict:
        """데미지 받은 후 처리."""
        return {}

    def on_death(self, card: FieldCard) -> dict:
        """사망 시. 반환값에 "prevent_death": True 면 죽음 방지."""
        return {}

    def on_turn_end(self, card: FieldCard) -> dict:
        """턴 끝날 때."""
        return {}

    def on_remove(self, card: FieldCard) -> dict:
        """효과 제거 시."""
        return {}

    def tick(self) -> bool:
        """duration 감소. 만료되면 True 반환."""
        if self.duration == -1:
            return False  # 영구 효과
        self.duration -= 1
        return self.duration <= 0

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "duration": self.duration,
            "source": self.source_uid,
            "visible": self.visible_to_opponent,
            "tags": self.tags,
        }


# ═══════════════════════════════════════════════════════
#  구체적인 상태 효과들
# ═══════════════════════════════════════════════════════

# ── 방벽 계열 ─────────────────────────────────────────

@dataclass
class Barrier(StatusEffect):
    """방벽: 별도 내구도를 가진 보호막.
    라인하르트(15, 패싱 방어), 윈스턴(5, 영구), 시그마(10, 도발) 등."""
    name: str = "barrier"
    barrier_hp: int = 0
    barrier_max_hp: int = 0
    blocks_passthrough: bool = False  # 패싱 공격도 막는지 (라인하르트)
    has_taunt: bool = False           # 방벽이 살아있는 동안만 도발 부여
    tags: list[str] = field(default_factory=lambda: ["barrier"])

    def on_apply(self, card):
        self.barrier_max_hp = self.barrier_hp
        if self.has_taunt and not card.has_status("taunt"):
            card.add_status(Taunt(duration=-1, source_uid=self.source_uid))
        return {"barrier_hp": self.barrier_hp, "has_taunt": self.has_taunt}

    def on_take_damage(self, card, damage, **kwargs):
        if self.barrier_hp <= 0:
            return {"damage": damage}
        ignore_barrier = kwargs.get("ignore_barrier", False)
        if ignore_barrier:
            return {"damage": damage}
        # 방벽이 HP가 남아있으면 모든 데미지를 흡수 (넘치는 데미지도 흡수)
        self.barrier_hp = max(0, self.barrier_hp - damage)
        if self.barrier_hp <= 0:
            card.remove_status(self.name)
        return {"damage": 0, "barrier_absorbed": damage, "barrier_hp": self.barrier_hp}

    def on_remove(self, card):
        if self.has_taunt:
            card.remove_status("taunt")
        return {}

    def to_dict(self):
        d = super().to_dict()
        d["barrier_hp"] = self.barrier_hp
        d["barrier_max_hp"] = self.barrier_max_hp
        d["has_taunt"] = self.has_taunt
        return d


@dataclass
class ParticleBarrier(StatusEffect):
    """자리야 입자 방벽: 첫 공격 무효화 + 공격 시 자리야 딜 증가."""
    name: str = "particle_barrier"
    was_hit: bool = False
    source_uid: str = ""
    visible_to_opponent: bool = False
    tags: list[str] = field(default_factory=lambda: ["barrier", "buff"])

    def on_take_damage(self, card, damage, **kwargs):
        if not self.was_hit:
            self.was_hit = True
            card.remove_status(self.name)
            return {
                "damage": 0,
                "absorbed": True,
                "particle_barrier_broken": True,
                "trigger_zarya_buff": self.source_uid if card.uid != self.source_uid else "",
            }
        return {"damage": damage}

    def on_turn_start(self, card):
        if not self.was_hit:
            # 공격 안 받으면 상대 턴 종료 시점(내 턴 시작)에 해제
            card.remove_status(self.name)
            return {"expired": True}
        return {}
    
    def to_dict(self):
        d = super().to_dict()
        d["was_hit"] = self.was_hit
        return d


# ── 이동/위치 계열 ────────────────────────────────────

@dataclass
class Airborne(StatusEffect):
    """공중 상태 (프레야): 한 칸 무시 공격 가능 + 피격 쉬움."""
    name: str = "airborne"
    duration: int = 2  # 이번 턴 + 상대 턴 → 다음 내 턴 시작에 사용 가능
    tags: list[str] = field(default_factory=lambda: ["movement"])

    def on_before_attack(self, card, target):
        return {"bypass_distance": 1}

    def on_before_targeted(self, card, attacker):
        return {"distance_modifier": -1}  # 피격 사거리 줄어듦 (더 쉽게 맞음)


@dataclass
class GravityFluxAirborne(StatusEffect):
    """중력붕괴 전용 에어본: 턴 종료시까지 공중에 뜨며, 종료 시 엔진이 피해를 처리한다."""
    name: str = "gravity_flux_airborne"
    duration: int = -1
    tags: list[str] = field(default_factory=lambda: ["movement", "cc", "spell"])

    def on_before_attack(self, card, target):
        return {"bypass_distance": 1}

    def on_before_targeted(self, card, attacker):
        return {"distance_modifier": -1}


@dataclass
class Stealth(StatusEffect):
    """은신 (솜브라): 타겟팅 제외 + 힐.
    단, 같은 역할군에 혼자면 힐러가 공격당할 위험."""
    name: str = "stealth"
    duration: int = 1
    heal_amount: int = 3
    tags: list[str] = field(default_factory=lambda: ["movement", "buff"])

    def on_apply(self, card):
        card.heal(self.heal_amount)
        return {"healed": self.heal_amount}

    def on_before_targeted(self, card, attacker):
        return {"untargetable": True}


@dataclass
class Burrowed(StatusEffect):
    """잠복 (벤처): 타겟팅 제외 + 다음 턴 한 칸 무시 공격."""
    name: str = "burrowed"
    duration: int = 2  # 이번 턴 + 상대 턴 → 다음 내 턴에 공격
    tags: list[str] = field(default_factory=lambda: ["movement"])

    def on_before_targeted(self, card, attacker):
        return {"untargetable": True}

    def on_before_attack(self, card, target):
        return {"bypass_distance": 1}


@dataclass
class Exposed(StatusEffect):
    """노출 (디바 부스터 후): 다음 상대 턴 동안 이 카드는 앞라인을 막지 못함."""
    name: str = "exposed"
    duration: int = 2
    tags: list[str] = field(default_factory=lambda: ["debuff"])

    def on_before_targeted(self, card, attacker):
        # 자신도 조금 더 쉽게 맞고, 뒤 라인도 패싱 가능하게 만듦
        return {"distance_modifier": -1, "ignore_as_blocker": True}


@dataclass
class Knockback(StatusEffect):
    """넉백 (우양 등): 사거리 -1."""
    name: str = "knockback"
    duration: int = 1
    value: int = 1
    tags: list[str] = field(default_factory=lambda: ["debuff", "cc"])
    

@dataclass
class Pulled(StatusEffect):
    """끌어당겨짐: 공격자 입장에서 이 카드까지의 거리 -value."""
    name: str = "pulled"
    duration: int = 1
    value: int = 1
    tags: list[str] = field(default_factory=lambda: ["debuff", "cc", "movement"])

    def on_before_targeted(self, card, attacker):
        return {"distance_modifier": -self.value}


@dataclass
class Hooked(StatusEffect):
    """갈고리: 이번 턴 거의 모든 아군이 거리 무시 수준으로 노릴 수 있게 함."""
    name: str = "hooked"
    duration: int = 1
    tags: list[str] = field(default_factory=lambda: ["debuff", "cc", "movement"])

    def on_before_targeted(self, card, attacker):
        return {"distance_modifier": -99}


# ── 공격/방어 수정 ────────────────────────────────────

@dataclass
class AttackBuff(StatusEffect):
    """공격력 증감."""
    name: str = "attack_buff"
    value: int = 0   # +면 버프, -면 디버프
    stackable: bool = True
    tags: list[str] = field(default_factory=lambda: ["buff"])

    def on_before_attack(self, card, target):
        return {"attack_modifier": self.value}
    
    
@dataclass
class DamageMultiplier(StatusEffect):
    """스킬 피해 배율 증감. value=2.0이면 2배, value=1.5면 50% 증가."""
    name: str = "damage_multiplier"
    value: float = 1.0
    stackable: bool = True
    tags: list[str] = field(default_factory=lambda: ["buff"])


@dataclass
class RangeModifier(StatusEffect):
    """사거리 증감 (루시우 소리파동 등)."""
    name: str = "range_modifier"
    value: int = 0
    tags: list[str] = field(default_factory=lambda: ["debuff"])


@dataclass
class DamageReduction(StatusEffect):
    """피해 감소 (라마트라 막기, 나노 강화 등). percent=50 이면 50% 감소."""
    name: str = "damage_reduction"
    percent: int = 0
    tags: list[str] = field(default_factory=lambda: ["buff"])

    def on_take_damage(self, card, damage, **kwargs):
        barrier = card.get_status("barrier")
        if barrier and getattr(barrier, "barrier_hp", 0) > 0 and not kwargs.get("ignore_barrier", False):
            return {"damage": damage}
        reduced = int(damage * (1 - self.percent / 100))
        return {"damage": reduced}


@dataclass
class NextTurnStartDamageReduction(DamageReduction):
    """다음 자신의 턴 시작 시 해제되는 피해 감소."""
    name: str = "next_turn_start_damage_reduction"
    duration: int = -1
    tags: list[str] = field(default_factory=lambda: ["buff"])

    def on_turn_start(self, card):
        card.remove_status(self.name)
        return {"expired": True}


@dataclass
class HealBlock(StatusEffect):
    """힐 차단 (생체 수류탄)."""
    name: str = "heal_block"
    duration: int = 1
    tags: list[str] = field(default_factory=lambda: ["debuff"])


@dataclass
class HealAmplify(StatusEffect):
    """힐 증폭 (우양): 받는 힐량 +value."""
    name: str = "heal_amplify"
    value: int = 2
    tags: list[str] = field(default_factory=lambda: ["buff"])


@dataclass
class HealMultiplier(StatusEffect):
    """힐 배율 (증폭 매트릭스): 받는 힐량에 배율 적용."""
    name: str = "heal_multiplier"
    value: float = 2.0
    stackable: bool = True
    tags: list[str] = field(default_factory=lambda: ["buff"])


@dataclass
class DiscordOrb(StatusEffect):
    """부조화: 이 카드는 받는 피해가 +bonus_damage 증가."""
    name: str = "discord"
    duration: int = 1
    bonus_damage: int = 2
    tags: list[str] = field(default_factory=lambda: ["debuff"])

    def on_take_damage(self, card, damage, **kwargs):
        return {"damage": max(0, damage + self.bonus_damage)}

    def to_dict(self):
        d = super().to_dict()
        d["bonus_damage"] = self.bonus_damage
        return d


@dataclass
class Taunt(StatusEffect):
    """도발: 이 카드를 우선 공격해야 함."""
    name: str = "taunt"
    tags: list[str] = field(default_factory=lambda: ["cc"])


@dataclass
class SkillSilence(StatusEffect):
    """스킬 봉쇄 (가시 소나기, 미즈키 속박 등): 스킬 사용 불가."""
    name: str = "skill_silence"
    duration: int = 1
    tags: list[str] = field(default_factory=lambda: ["debuff", "cc"])


@dataclass
class Burn(StatusEffect):
    """화상 (애쉬 다이너마이트): 매턴 데미지."""
    name: str = "burn"
    damage_per_turn: int = 2
    tags: list[str] = field(default_factory=lambda: ["debuff", "dot"])

    def on_turn_end(self, card):
        damage_log = card.take_damage(self.damage_per_turn, source_uid=self.source_uid, damage_kind="status_dot")
        return {"burn_damage": self.damage_per_turn, "damage_log": damage_log}


@dataclass
class StickyBomb(StatusEffect):
    """점착폭탄 (에코): 상대 턴 종료 시 폭발."""
    name: str = "sticky_bomb"
    duration: int = 1
    explode_damage: int = 4
    tags: list[str] = field(default_factory=lambda: ["debuff"])

    def on_turn_end(self, card):
        # 상대 턴 종료 시점에 2턴 뒤 폭발 느낌
        if self.duration <= 1:
            damage_log = card.take_damage(self.explode_damage, source_uid=self.source_uid, damage_kind="status_explode")
            self.duration = 0
            return {"exploded": True, "damage": self.explode_damage, "damage_log": damage_log}
        return {}


# ── 생존 계열 ─────────────────────────────────────────

@dataclass
class FrozenState(StatusEffect):
    """빙결 상태: 무적 + 행동 불가 + 앞라인 차단 해제.

    - 일반 빙결: 현재 HP 유지, 한 턴 동안 얼어 있다가 턴 종료 시 해제
    - 메이 패시브 빙결: HP 1로 얼어 있다가 다음 내 턴 시작에 지정 HP로 부활
    """
    name: str = "frozen_state"
    duration: int = 1
    revive_hp: int | None = None
    set_frozen_hp: int | None = None
    thaw_on_turn_start: bool = False
    visible_to_opponent: bool = True
    tags: list[str] = field(default_factory=lambda: ["debuff", "cc", "frozen"])

    def on_apply(self, card):
        if self.set_frozen_hp is not None:
            card.current_hp = max(1, min(card.max_hp, self.set_frozen_hp))
        return {
            "frozen": True,
            "current_hp": card.current_hp,
            "revive_hp": self.revive_hp,
        }

    def on_before_targeted(self, card, attacker):
        return {"untargetable": True, "ignore_as_blocker": True}

    def on_take_damage(self, card, damage, **kwargs):
        return {"absorbed": True, "damage": 0}

    def on_turn_start(self, card):
        if not self.thaw_on_turn_start:
            return {}

        revive_hp = self.revive_hp
        if revive_hp is not None:
            card.current_hp = min(card.max_hp, max(1, revive_hp))
            card.remove_status(self.name)
            return {"revived": True, "hp": card.current_hp}

        card.remove_status(self.name)
        return {"thawed": True}

    def to_dict(self):
        d = super().to_dict()
        d["revive_hp"] = self.revive_hp
        d["thaw_on_turn_start"] = self.thaw_on_turn_start
        return d


@dataclass
class FrozenRevive(StatusEffect):
    """메이 급속 빙결: 최초 사망 시 HP 1로 얼고, 다음 내 턴 시작에 반피로 부활."""
    name: str = "frozen_revive"
    duration: int = -1
    revive_hp: int = 0
    used: bool = False
    tags: list[str] = field(default_factory=lambda: ["passive"])

    def on_death(self, card):
        if self.used:
            return {}

        self.used = True
        revive_hp = max(1, self.revive_hp)
        if not card.has_status("frozen_state"):
            card.add_status(FrozenState(
                duration=-1,
                revive_hp=revive_hp,
                set_frozen_hp=1,
                thaw_on_turn_start=True,
                source_uid=self.source_uid,
            ))
        card.remove_status(self.name)
        return {
            "prevent_death": True,
            "enter_frozen": True,
            "frozen_turns": 1,
            "revive_hp": revive_hp,
            "set_hp": 1,
        }


@dataclass
class Immortality(StatusEffect):
    """불사장치: 설치 후 영구 대기, 최초 발동 후 2턴 동안 치명타 시 체력 1 보장."""
    name: str = "immortality"
    duration: int = -1
    activated: bool = False
    visible_to_opponent: bool = False  # 상대에게 안 보임
    tags: list[str] = field(default_factory=lambda: ["buff"])

    def on_death(self, card):
        # 최초 발동 전에는 영구 대기, 발동 시점부터 2턴 카운트 시작
        if not self.activated:
            self.activated = True
            self.duration = 2
            self.visible_to_opponent = True
        return {"prevent_death": True, "set_hp": 1}


@dataclass
class Reflect(StatusEffect):
    """튕겨내기: 치명타 반사. 1회성."""
    name: str = "reflect"
    visible_to_opponent: bool = False
    tags: list[str] = field(default_factory=lambda: ["buff"])

    def on_take_damage(self, card, damage, **kwargs):
        if card.current_hp - damage <= 0:
            # 발동 즉시 소모
            card.remove_status(self.name)
            return {"damage": 0, "reflect": damage}
        return {"damage": damage}
    
    def on_death(self, card):
        # 지속/상태 효과로 인한 치명 피해에도 1회 생존 보장
        card.remove_status(self.name)
        return {"prevent_death": True, "set_hp": 1}


@dataclass
class ExtraHP(StatusEffect):
    """추가 체력 (소리방벽, 정커퀸 지휘의 외침 등)."""
    name: str = "extra_hp"
    value: int = 0
    tags: list[str] = field(default_factory=lambda: ["buff"])

    def on_take_damage(self, card, damage, **kwargs):
        if self.value <= 0:
            return {"damage": damage}
        # 추가체력도 방벽처럼 모든 데미지 흡수
        self.value = max(0, self.value - damage)
        if self.value <= 0:
            self.duration = 0
        return {"damage": 0, "extra_hp_absorbed": damage}

    def to_dict(self):
        d = super().to_dict()
        d["extra_hp"] = self.value
        return d


@dataclass
class MechDestruction(StatusEffect):
    name: str = "mech_destruction"
    duration: int = -1
    hana_hp: int = 5
    used: bool = False
    visible_to_opponent: bool = False
    tags: list[str] = field(default_factory=lambda: ["passive"])
    
    def _apply_hana_form(self, card: FieldCard) -> None:
        hana_profile = dict(card.extra.get("hana_profile", {}))
        card.extra["form"] = "hana"
        card.extra["_hero_key"] = hana_profile.get("hero_key", "hana_song")
        card.name = hana_profile.get("name", "송하나")
        card.max_hp = int(hana_profile.get("hp", self.hana_hp) or self.hana_hp)
        card.base_attack_range = int(hana_profile.get("attack_range", 1) or 1)
        card.skill_damages = dict(hana_profile.get("skill_damages", card.skill_damages))
        card.skill_meta = dict(hana_profile.get("skill_meta", card.skill_meta))
        from game_engine.skill_registry import get_hero_skills
        card.skills = get_hero_skills(card.extra["_hero_key"])
        card.skill_cooldowns["skill_2"] = max(2, int(card.skill_cooldowns.get("skill_2", 0) or 0))
        card.current_hp = min(card.current_hp, card.max_hp)

    def restore_mech(self, card: FieldCard) -> None:
        mech_profile = dict(card.extra.get("mech_profile", {}))
        card.extra["form"] = "mech"
        card.extra["_hero_key"] = mech_profile.get("hero_key", "dva")
        card.name = mech_profile.get("name", "디바")
        card.max_hp = int(mech_profile.get("hp", 20) or 20)
        card.base_attack_range = int(mech_profile.get("attack_range", 1) or 1)
        card.skill_damages = dict(mech_profile.get("skill_damages", card.skill_damages))
        card.skill_meta = dict(mech_profile.get("skill_meta", card.skill_meta))
        from game_engine.skill_registry import get_hero_skills
        card.skills = get_hero_skills(card.extra["_hero_key"])
        card.skill_cooldowns.pop("skill_2", None)
        card.current_hp = card.max_hp
        self.used = False

    def on_death(self, card):
        if not self.used and card.extra.get("form") == "mech":
            self.used = True
            self._apply_hana_form(card)
            return {
                "prevent_death": True,
                "set_hp": self.hana_hp,
                "summon": "hana_song",
            }
        return {}
    

@dataclass
class Charging(StatusEffect):
    """차징 (소전): 단계별 공격력 증가."""
    name: str = "charging"
    duration: int = -1  # 영구
    level: int = 0
    max_level: int = 3
    tags: list[str] = field(default_factory=lambda: ["buff"])

    def charge(self):
        if self.level < self.max_level:
            self.level += 1

    def reset(self):
        self.level = 0
        
    
@dataclass
class OrisaFortifyPassive(StatusEffect):
    """오리사 방어강화: 체력 10 이하일 때 디버프 정화 + 상태이상 면역 + 50% 피해 감소."""
    name: str = "orisa_fortify_passive"
    duration: int = -1
    reduction_percent: int = 50
    hp_threshold: int = 10
    active: bool = False
    tags: list[str] = field(default_factory=lambda: ["passive", "buff"])

    def _default_clear_list(self) -> list[str]:
        return [
            "knockback", "pulled", "frozen_state", "burn", "discord",
            "heal_block", "range_modifier", "hooked", "gravity_flux_airborne",
            "airborne",
        ]

    def _sync_state(self, card: FieldCard) -> None:
        should_activate = card.current_hp <= self.hp_threshold
        if should_activate == self.active:
            return
        self.active = should_activate
        if self.active:
            clear_list = card.extra.get("fortify_clear_debuffs") or self._default_clear_list()
            removed = card.clear_statuses_by_name(list(clear_list))
            card.extra["fortify_removed_statuses"] = removed
            immunity = {str(n).lower() for n in clear_list}
            card.extra["status_immunity"] = sorted(immunity)
        else:
            card.extra["status_immunity"] = []

    def on_apply(self, card: FieldCard) -> dict:
        self._sync_state(card)
        return {"active": self.active}

    def on_turn_start(self, card: FieldCard) -> dict:
        self._sync_state(card)
        return {"active": self.active}

    def on_hp_changed(self, card: FieldCard) -> dict:
        self._sync_state(card)
        return {"active": self.active}

    def on_take_damage(self, card: FieldCard, damage: int, **kwargs) -> dict:
        self._sync_state(card)
        if not self.active:
            return {"damage": damage}
        reduced = int(damage * (1 - self.reduction_percent / 100))
        return {"damage": reduced}

    def to_dict(self):
        d = super().to_dict()
        d["active"] = self.active
        d["reduction_percent"] = self.reduction_percent
        d["hp_threshold"] = self.hp_threshold
        return d