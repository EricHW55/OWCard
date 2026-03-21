/* 백엔드와 일치하는 타입 정의 */

export type Role = 'tank' | 'dealer' | 'healer';
export type Zone = 'main' | 'side';
export type Phase = 'waiting' | 'mulligan' | 'placement' | 'action' | 'game_over';

export interface FieldCard {
  uid: string;
  template_id: number;
  name: string;
  role: Role;
  max_hp: number;
  current_hp: number;
  attack: number;
  defense: number;
  attack_range: number;
  zone: Zone;
  statuses: StatusEffect[];
  skill_cooldowns: Record<string, number>;
  skill_damages: Record<string, any>;
  skill_meta: Record<string, { name: string; cooldown?: number }>;
  placed_this_turn: boolean;
  extra: Record<string, any>;
}

export interface StatusEffect {
  name: string;
  duration: number;
  source: string;
  visible: boolean;
  tags: string[];
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
  skill_meta: Record<string, { name: string; cooldown?: number }>;
  description: string;
  is_spell?: boolean;
  extra?: Record<string, any>;
}

export interface FieldState {
  main: FieldCard[];
  side: FieldCard[];
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
  placement_cost_used: number;
}

export interface GameState {
  game_id: string;
  phase: Phase;
  turn: number;
  round: number;
  current_player: number | null;
  is_my_turn: boolean;
  my_state: PlayerState;
  opponent_state: PlayerState;
  winner: number | null;
  commander_skill_limit: number;
}

export interface WSMessage {
  event: string;
  [key: string]: any;
}