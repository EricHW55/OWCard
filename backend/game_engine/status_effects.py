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
    has_taunt: bool = False           # 도발 효과 (시그마)
    tags: list[str] = field(default_factory=lambda: ["barrier"])

    def on_apply(self, card):
        self.barrier_max_hp = self.barrier_hp
        return {"barrier_hp": self.barrier_hp}

    def on_take_damage(self, card, damage, **kwargs):
        if self.barrier_hp <= 0:
            return {"damage": damage}
        ignore_barrier = kwargs.get("ignore_barrier", False)
        if ignore_barrier:
            return {"damage": damage}
        # 방벽이 HP가 남아있으면 모든 데미지를 흡수 (넘치는 데미지도 흡수)
        self.barrier_hp = max(0, self.barrier_hp - damage)
        return {"damage": 0, "barrier_absorbed": damage, "barrier_hp": self.barrier_hp}

    def to_dict(self):
        d = super().to_dict()
        d["barrier_hp"] = self.barrier_hp
        d["barrier_max_hp"] = self.barrier_max_hp
        return d


@dataclass
class ParticleBarrier(StatusEffect):
    """자리야 입자 방벽: 첫 공격 무효화 + 공격 시 자리야 딜 증가."""
    name: str = "particle_barrier"
    was_hit: bool = False
    source_uid: str = ""
    tags: list[str] = field(default_factory=lambda: ["barrier", "buff"])

    def on_take_damage(self, card, damage, **kwargs):
        if not self.was_hit:
            self.was_hit = True
            self.duration = 0  # 맞으면 즉시 소멸
            return {"damage": 0, "absorbed": True, "trigger_zarya_buff": self.source_uid}
        return {"damage": damage}

    def on_turn_end(self, card):
        if not self.was_hit:
            # 공격 안 받으면 1턴 유지 후 파괴
            pass
        return {}


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
    """노출 (디바 부스터 후): 다음 턴 패싱 당함."""
    name: str = "exposed"
    duration: int = 1
    tags: list[str] = field(default_factory=lambda: ["debuff"])


@dataclass
class Knockback(StatusEffect):
    """넉백 (우양 등): 사거리 -1."""
    name: str = "knockback"
    duration: int = 1
    value: int = 1
    tags: list[str] = field(default_factory=lambda: ["debuff", "cc"])


# ── 공격/방어 수정 ────────────────────────────────────

@dataclass
class AttackBuff(StatusEffect):
    """공격력 증감."""
    name: str = "attack_buff"
    value: int = 0   # +면 버프, -면 디버프
    tags: list[str] = field(default_factory=lambda: ["buff"])

    def on_before_attack(self, card, target):
        return {"attack_modifier": self.value}


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
        reduced = int(damage * (1 - self.percent / 100))
        return {"damage": reduced}


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
    damage_per_turn: int = 1
    tags: list[str] = field(default_factory=lambda: ["debuff", "dot"])

    def on_turn_end(self, card):
        card.take_raw_damage(self.damage_per_turn)
        return {"burn_damage": self.damage_per_turn}


@dataclass
class StickyBomb(StatusEffect):
    """점착폭탄 (에코): 다음 턴에 추가 데미지."""
    name: str = "sticky_bomb"
    duration: int = 1
    explode_damage: int = 4
    tags: list[str] = field(default_factory=lambda: ["debuff"])

    def on_turn_start(self, card):
        if self.duration <= 1:
            card.take_raw_damage(self.explode_damage)
            return {"exploded": True, "damage": self.explode_damage}
        return {}


# ── 생존 계열 ─────────────────────────────────────────

@dataclass
class FrozenRevive(StatusEffect):
    """메이 급속 빙결: 사망 시 1턴 얼음 → 반피 부활."""
    name: str = "frozen_revive"
    duration: int = -1  # 패시브로 영구 보유
    revive_hp: int = 0
    used: bool = False
    tags: list[str] = field(default_factory=lambda: ["passive"])

    def on_death(self, card):
        if not self.used:
            self.used = True
            return {
                "prevent_death": True,
                "enter_frozen": True,
                "frozen_turns": 1,
                "revive_hp": self.revive_hp,
            }
        return {}


@dataclass
class Immortality(StatusEffect):
    """불사장치: 치명타 시 체력 1 보장."""
    name: str = "immortality"
    duration: int = 2
    visible_to_opponent: bool = False  # 상대에게 안 보임
    tags: list[str] = field(default_factory=lambda: ["buff"])

    def on_death(self, card):
        return {"prevent_death": True, "set_hp": 1}


@dataclass
class Reflect(StatusEffect):
    """튕겨내기: 치명타 반사."""
    name: str = "reflect"
    visible_to_opponent: bool = False
    tags: list[str] = field(default_factory=lambda: ["buff"])

    def on_take_damage(self, card, damage, **kwargs):
        if card.current_hp - damage <= 0:
            return {"damage": 0, "reflect": damage}
        return {"damage": damage}


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
    """디바 메카 파괴 → 송하나 변환. 패시브로 영구 보유."""
    name: str = "mech_destruction"
    duration: int = -1
    hana_hp: int = 5
    used: bool = False
    visible_to_opponent: bool = False
    tags: list[str] = field(default_factory=lambda: ["passive"])

    def on_death(self, card):
        if not self.used and card.extra.get("form") == "mech":
            self.used = True
            card.extra["form"] = "hana"
            card.extra["hana_survive_turns"] = 0
            return {
                "prevent_death": True,
                "set_hp": self.hana_hp,
                "transform": "hana_song",
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