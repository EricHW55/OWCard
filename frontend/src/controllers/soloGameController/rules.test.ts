import type { FieldCard, GameState } from '../../types/game';
import {
  buildSoloPlayersView,
  getSoloActionableUids,
  getSoloOutcome,
  hasSoloStatusEffect,
  oppositeSide,
  resolveActiveSideFromState,
  shouldClearSoloSpellAfterAction,
  shouldKeepSoloTargetingAfterAction,
} from './rules';

const fieldCard = (overrides: Partial<FieldCard> = {}): FieldCard => ({
  uid: 'c1',
  template_id: 1,
  name: 'Tracer',
  role: 'dealer',
  description: '',
  max_hp: 10,
  current_hp: 10,
  attack: 1,
  defense: 0,
  attack_range: 1,
  zone: 'main',
  statuses: [],
  skill_cooldowns: {},
  skill_damages: {},
  skill_meta: {},
  placed_this_turn: false,
  acted_this_turn: false,
  extra: {},
  ...overrides,
});

const gameState = (overrides: Partial<GameState> = {}): GameState => ({
  game_id: 'solo-1',
  phase: 'action',
  turn: 1,
  round: 1,
  current_player: 1,
  is_my_turn: true,
  my_state: {
    player_id: 1,
    username: 'bottom',
    hand_count: 0,
    hand: [],
    draw_pile_count: 3,
    trash_count: 0,
    trash: [],
    field: { main: [fieldCard()], side: [] },
    mulligan_done: true,
    placement_cost_used: 0,
  },
  opponent_state: {
    player_id: 2,
    username: 'top',
    hand_count: 0,
    hand: [],
    draw_pile_count: 4,
    trash_count: 0,
    trash: [],
    field: { main: [], side: [] },
    mulligan_done: true,
    placement_cost_used: 0,
  },
  winner: null,
  commander_skill_limit: 1,
  ...overrides,
});

describe('solo game rules', () => {
  test('normal turn progression resolves the active side from server state', () => {
    expect(resolveActiveSideFromState(gameState({ current_player: 1 }), 'bottom')).toBe('bottom');
    expect(resolveActiveSideFromState(gameState({ current_player: 2 }), 'bottom')).toBe('top');
    expect(oppositeSide('top')).toBe('bottom');
  });

  test('skill availability excludes cards that already acted or were placed this turn', () => {
    const field = {
      main: [
        fieldCard({ uid: 'ready' }),
        fieldCard({ uid: 'acted', acted_this_turn: true }),
        fieldCard({ uid: 'placed', placed_this_turn: true }),
      ],
      side: [],
    };
    expect(getSoloActionableUids({ phase: 'action', activeSide: 'bottom', side: 'bottom', field })).toEqual(['ready']);
    expect(getSoloActionableUids({ phase: 'placement', activeSide: 'bottom', side: 'bottom', field })).toEqual([]);
  });

  test('status effect application and removal can be checked without mode-specific logic', () => {
    const frozen = fieldCard({ statuses: [{ name: 'frozen', duration: 1, source: 'mei', visible: true, tags: [] }] });
    const expired = fieldCard({ statuses: [{ name: 'frozen', duration: 0, source: 'mei', visible: true, tags: [] }] });
    expect(hasSoloStatusEffect(frozen, 'frozen')).toBe(true);
    expect(hasSoloStatusEffect(expired, 'frozen')).toBe(false);
  });

  test('winner side is derived from game-over state', () => {
    expect(getSoloOutcome(gameState({ phase: 'game_over', winner: 1 }), 'bottom')).toEqual({ isGameOver: true, winnerSide: 'bottom' });
    expect(getSoloOutcome(gameState({ phase: 'game_over', winner: 2 }), 'bottom')).toEqual({ isGameOver: true, winnerSide: 'top' });
    expect(getSoloOutcome(gameState({ phase: 'action', winner: null }), 'bottom')).toEqual({ isGameOver: false, winnerSide: null });
  });

  test('shared state projection preserves the active-side hand and hides opponent hand', () => {
    const players = buildSoloPlayersView(gameState(), 'bottom');
    expect(players.bottom.drawPile).toHaveLength(3);
    expect(players.top.drawPile).toHaveLength(4);
    expect(players.top.hand).toEqual([]);
  });

  test('shared state projection preserves pending spell choices for the active side', () => {
    const pendingSpell = {
      type: 'spell_maximilian_select' as const,
      hero_key: 'spell_maximilian',
      title: '막시밀리앙',
      options: [{ index: 0, name: 'Tracer', role: 'dealer' }],
    };
    const players = buildSoloPlayersView(gameState({
      my_state: {
        ...gameState().my_state,
        pending_spell: pendingSpell,
      },
    }), 'bottom');

    expect(players.bottom.pending_spell).toEqual(pendingSpell);
    expect(players.bottom.pendingSpell).toEqual(pendingSpell);
  });

  test('abnormal spell result only keeps pending spell when target selection is required', () => {
    expect(shouldClearSoloSpellAfterAction('place_card', { needs_target: true })).toBe(false);
    expect(shouldClearSoloSpellAfterAction('place_card', { needs_choice: true })).toBe(false);
    expect(shouldClearSoloSpellAfterAction('place_card', { needs_target: false })).toBe(true);
    expect(shouldClearSoloSpellAfterAction('use_skill', {})).toBe(true);
    expect(shouldKeepSoloTargetingAfterAction('place_card', { needs_target: true })).toBe(true);
    expect(shouldKeepSoloTargetingAfterAction('place_card', { needs_choice: true })).toBe(true);
    expect(shouldKeepSoloTargetingAfterAction('execute_spell', { needs_target: true })).toBe(false);
  });
});
