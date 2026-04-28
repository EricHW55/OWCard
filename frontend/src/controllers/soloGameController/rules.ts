import type { FieldCard, FieldState, GameState, HandCard } from '../../types/game';
import { computeActionableUids } from '../shared/gameFlowState';
import type { SoloPlayersView, SoloSide } from './types';

export function oppositeSide(side: SoloSide): SoloSide {
  return side === 'bottom' ? 'top' : 'bottom';
}

export function resolveActiveSideFromState(state: GameState, currentSide: SoloSide): SoloSide {
  return state.current_player === state.my_state.player_id ? currentSide : oppositeSide(currentSide);
}

export function buildSoloPlayersView(state: GameState, activeSide: SoloSide): SoloPlayersView {
  const my = state.my_state;
  const opponent = state.opponent_state;
  const ownView = {
    hand: my.hand || [],
    field: my.field,
    drawPile: new Array(my.draw_pile_count || 0).fill(null) as HandCard[],
    mulliganDone: !!my.mulligan_done,
    placementUsed: my.placement_cost_used || 0,
    placementLimit: Number(my.placement_limit ?? 2),
    pending_passive: my.pending_passive ?? my.pendingPassive ?? null,
    pendingPassive: my.pendingPassive ?? my.pending_passive ?? null,
    pending_spell: my.pending_spell ?? my.pendingSpell ?? null,
    pendingSpell: my.pendingSpell ?? my.pending_spell ?? null,
  };
  const opponentView = {
    hand: [],
    field: opponent.field,
    drawPile: new Array(opponent.draw_pile_count || 0).fill(null) as HandCard[],
    mulliganDone: !!opponent.mulligan_done,
    placementUsed: opponent.placement_cost_used || 0,
    placementLimit: Number(opponent.placement_limit ?? 2),
    pending_passive: opponent.pending_passive ?? opponent.pendingPassive ?? null,
    pendingPassive: opponent.pendingPassive ?? opponent.pending_passive ?? null,
    pending_spell: opponent.pending_spell ?? opponent.pendingSpell ?? null,
    pendingSpell: opponent.pendingSpell ?? opponent.pending_spell ?? null,
  };
  return activeSide === 'bottom'
      ? { bottom: ownView, top: opponentView }
      : { top: ownView, bottom: opponentView };
}

export function getSoloActionableUids(params: {
  phase: string;
  activeSide: SoloSide;
  side: SoloSide;
  field?: FieldState | null;
}): string[] {
  return computeActionableUids({
    phase: params.phase,
    isMyTurn: params.activeSide === params.side,
    field: params.field,
  });
}

export function shouldClearSoloSpellAfterAction(action: string, result: any): boolean {
  return action !== 'place_card' || !(result?.needs_target || result?.needs_choice);
}

export function shouldKeepSoloTargetingAfterAction(action: string, result: any): boolean {
  return action === 'place_card' && !!(result?.needs_target || result?.needs_choice);
}

export function getSoloPhaseSubtitle(activeSide: SoloSide): string {
  return activeSide === 'bottom' ? '아래쪽 플레이어' : '위쪽 플레이어';
}

export function getSoloOutcome(state: GameState | null, activeSide: SoloSide): {
  isGameOver: boolean;
  winnerSide: SoloSide | null;
} {
  if (!state || state.phase !== 'game_over' || state.winner == null) {
    return { isGameOver: false, winnerSide: null };
  }
  const winnerSide = state.winner === state.my_state.player_id ? activeSide : oppositeSide(activeSide);
  return { isGameOver: true, winnerSide };
}

export function hasSoloStatusEffect(card: FieldCard | null | undefined, statusName: string): boolean {
  return !!card?.statuses?.some((status) => status.name === statusName && status.duration !== 0);
}
