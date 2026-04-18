/* 백엔드와 일치하는 타입 정의 */

export type Role = 'tank' | 'dealer' | 'healer';
export type Zone = 'main' | 'side';
export type Phase = 'waiting' | 'mulligan' | 'placement' | 'action' | 'game_over';

export type SkillMetaInfo = {
  name: string;
  cooldown?: number;
  description?: string;
};

export interface FieldCard {
  hero_key?: string;
  is_spell?: boolean;
  cost?: number;
  hp?: number;
  uid: string;
  template_id: number;
  name: string;
  role: Role;
  description: string;
  max_hp: number;
  current_hp: number;
  attack: number;
  defense: number;
  attack_range: number;
  zone: Zone;
  statuses: StatusEffect[];
  skill_cooldowns: Record<string, number>;
  skill_damages: Record<string, any>;
  skill_meta: Record<string, SkillMetaInfo>;
  placed_this_turn: boolean;
  acted_this_turn: boolean;
  extra: Record<string, any>;
}

export interface StatusEffect {
  name: string;
  duration: number;
  source: string;
  visible: boolean;
  tags: string[];
  barrier_hp?: number;
  barrier_max_hp?: number;
  extra_hp?: number;
  value?: number;
  was_hit?: boolean;
  active?: boolean;
  activated?: boolean;
  reduction_percent?: number;
  hp_threshold?: number;
}

export interface HandCard {
  id: number;
  hero_key: string;
  name: string;
  role: Role;
  hp: number;
  cost: number;
  base_attack: number;
  base_defense: number;
  base_attack_range: number;
  skill_damages: Record<string, any>;
  skill_meta: Record<string, SkillMetaInfo>;
  description: string;
  is_spell?: boolean;
  extra?: Record<string, any>;
}

export interface FieldState {
  main: FieldCard[];
  side: FieldCard[];
}

export interface PendingPassiveOption {
  index: number;
  name: string;
  role: string;
}

export interface PendingPassive {
  type: 'mercy_resurrect' | 'jetpack_cat_extra_place';
  source_uid: string;
  options?: PendingPassiveOption[];
}

export interface PlayerState {
  player_id: number;
  username: string;
  hand_count: number;
  hand: HandCard[];
  draw_pile_count: number;
  trash_count: number;
  trash: { name: string; role: string }[];
  field: FieldState;
  mulligan_done: boolean;
  mulligan_excluded_count?: number;
  placement_cost_used: number;
  placement_limit?: number;
  pending_passive?: PendingPassive | null;
}

export interface GameState {
  game_id: string;
  phase: Phase;
  turn: number;
  round: number;
  current_player: number | null;
  coin_result?: 'heads' | 'tails' | null;
  first_player?: number | null;
  is_my_turn: boolean;
  my_state: PlayerState;
  opponent_state: PlayerState;
  winner: number | null;
  commander_skill_limit: number;
  timer?: {
    initial_seconds?: number;
    increment_seconds?: number;
    my_remaining_seconds?: number;
    opponent_remaining_seconds?: number | null;
  };
  bo3?: {
    format: 'bo3';
    current_round: number;
    wins: Record<string, number>;
    max_wins: number;
    max_rounds: number;
    current_deck_template_ids?: number[];
    deck_edit_limit_per_break: number;
    awaiting_deck_submit: boolean;
    awaiting_first_player_choice: boolean;
    can_start_next_round: boolean;
    pending_round_result?: {
      winner: number;
      loser: number;
      round: number;
      wins: Record<string, number>;
    } | null;
  };
}

export interface WSMessage {
  event: string;
  [key: string]: any;
}

export interface KillFeedUnit {
  name: string;
  hero_key?: string;
  is_spell?: boolean;
  team: 'my' | 'opponent';
}

export interface KillFeedItem {
  id: string;
  killer: KillFeedUnit;
  victim: KillFeedUnit;
  createdAt: number;
  duration?: number;
}

export interface CardVisualEffect {
  floatingDamage?: number | null;
  hpTransitionMs?: number;
  destroying?: boolean;
}

export type BattleLogTeam = 'my' | 'opponent' | 'neutral';
export type BattleLogType = 'turn' | 'turn_end' | 'skill' | 'damage' | 'heal' | 'placement' | 'destroy' | 'system';

export interface BattleLogActor {
  name: string;
  heroKey?: string;
  isSpell?: boolean;
}

export interface BattleLogEntry {
  id: string;
  type: BattleLogType;
  team: BattleLogTeam;
  turn?: number;
  text?: string;
  actor?: BattleLogActor;
  skillName?: string;
  target?: BattleLogActor;
  damage?: number;
}