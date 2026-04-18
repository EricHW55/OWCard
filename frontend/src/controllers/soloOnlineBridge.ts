import type { FieldCard, FieldState, GameState, HandCard, Phase } from '../types/game';
import { formatSkillValue } from '../utils/skillValue';

export type Side = 'top' | 'bottom';

export type SoloBridgePlayers = {
    top: { hand: HandCard[]; field: FieldState; drawPile: HandCard[]; mulliganDone: boolean; placementUsed: number };
    bottom: { hand: HandCard[]; field: FieldState; drawPile: HandCard[]; mulliganDone: boolean; placementUsed: number };
};

export function mapSoloStateFromOnline(gs: GameState, activeSide: Side): SoloBridgePlayers {
    const my = gs.my_state;
    const opp = gs.opponent_state;
    if (activeSide === 'bottom') {
        return {
            bottom: { hand: my.hand || [], field: my.field, drawPile: new Array(my.draw_pile_count || 0).fill(null) as HandCard[], mulliganDone: !!my.mulligan_done, placementUsed: my.placement_cost_used || 0 },
            top: { hand: [], field: opp.field, drawPile: new Array(opp.draw_pile_count || 0).fill(null) as HandCard[], mulliganDone: !!opp.mulligan_done, placementUsed: opp.placement_cost_used || 0 },
        };
    }
    return {
        top: { hand: my.hand || [], field: my.field, drawPile: new Array(my.draw_pile_count || 0).fill(null) as HandCard[], mulliganDone: !!my.mulligan_done, placementUsed: my.placement_cost_used || 0 },
        bottom: { hand: [], field: opp.field, drawPile: new Array(opp.draw_pile_count || 0).fill(null) as HandCard[], mulliganDone: !!opp.mulligan_done, placementUsed: opp.placement_cost_used || 0 },
    };
}

export function computeSoloActionableUids(phase: Phase, activeSide: Side, side: Side, field: FieldState): string[] {
    if (phase !== 'action' || activeSide !== side) return [];
    return [...(field.main || []), ...(field.side || [])]
        .filter((c) => !c.acted_this_turn && !c.placed_this_turn)
        .map((c) => c.uid);
}

export function computeSoloFieldSkills(phase: Phase, selectedCard: FieldCard | null, isCurrentSide: boolean) {
    if (!selectedCard || phase !== 'action' || !isCurrentSide || selectedCard.acted_this_turn || selectedCard.placed_this_turn) return [];
    return Object.entries(selectedCard.skill_meta || {})
        .filter(([key]) => key.startsWith('skill_'))
        .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
        .map(([key, meta]) => ({
            key,
            name: (meta as any)?.name || key,
            description: String((meta as any)?.description || ''),
            onCooldown: ((selectedCard.skill_cooldowns || {})[key] ?? 0) > 0,
            cdLeft: (selectedCard.skill_cooldowns || {})[key] ?? 0,
            valueText: formatSkillValue((selectedCard.skill_damages || {})[key]),
        }));
}