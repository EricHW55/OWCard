import type { BattleLogEntry, GameState, KillFeedItem } from '../types/game';

export type GameMode = 'online' | 'solo' | 'tutorial';

export type UnifiedGameEvent =
    | { type: 'skill_used'; actorName?: string; skillName: string; heroKey?: string; isSpell?: boolean }
    | { type: 'coin_toss'; actorName?: string; result?: 'heads' | 'tails' | string; success?: boolean }
    | { type: 'headshot_toss'; actorName?: string; skillName?: string; heroKey?: string; headshot: boolean }
    | { type: 'damage'; sourceUid?: string; targetUid?: string; amount: number }
    | { type: 'heal'; sourceUid?: string; targetUid?: string; amount: number }
    | { type: 'kill_feed'; killerName?: string; victimName?: string; killerUid?: string; victimUid?: string }
    | { type: 'phase_changed'; phase: string; turn?: number; isMyTurn?: boolean };

export type UnifiedGameAction = {
    action: 'place_card' | 'use_skill' | 'execute_spell' | 'end_turn' | 'end_placement' | 'mulligan' | 'skip_mulligan' | 'resolve_passive_choice' | string;
    [key: string]: unknown;
};

export type UnifiedGameViewModel = {
    mode: GameMode;
    gameState: GameState | null;
    phase: string;
    isMyTurn?: boolean;
    logs?: BattleLogEntry[];
    killFeed?: KillFeedItem[];
};

export interface GameModeAdapter {
    getViewModel(): UnifiedGameViewModel;
    dispatch(action: UnifiedGameAction): Promise<void>;
    subscribe(handler: (event: UnifiedGameEvent) => void): () => void;
}