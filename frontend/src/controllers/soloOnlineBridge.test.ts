import { computeSoloActionableUids, mapSoloStateFromOnline } from './soloOnlineBridge';
import type { GameState } from '../types/game';

const baseState: GameState = {
    game_id: 'g',
    phase: 'action',
    turn: 1,
    round: 1,
    current_player: 1,
    is_my_turn: true,
    my_state: {
        player_id: 1,
        username: 'b',
        hand_count: 1,
        hand: [{ id: 1, hero_key: 'a', name: 'A', role: 'dealer', hp: 1, cost: 1, base_attack: 1, base_defense: 0, base_attack_range: 1, skill_damages: {}, skill_meta: {}, description: '' }],
        draw_pile_count: 20,
        trash_count: 0,
        trash: [],
        field: { main: [{ uid: 'm1', template_id: 1, name: 'M', role: 'dealer', description: '', max_hp: 5, current_hp: 5, attack: 1, defense: 0, attack_range: 1, zone: 'main', statuses: [], skill_cooldowns: {}, skill_damages: {}, skill_meta: {}, placed_this_turn: false, acted_this_turn: false, extra: {} }], side: [] },
        mulligan_done: false,
        placement_cost_used: 0,
    },
    opponent_state: {
        player_id: 2,
        username: 't',
        hand_count: 1,
        hand: [],
        draw_pile_count: 20,
        trash_count: 0,
        trash: [],
        field: { main: [{ uid: 'o1', template_id: 2, name: 'O', role: 'tank', description: '', max_hp: 5, current_hp: 5, attack: 1, defense: 0, attack_range: 1, zone: 'main', statuses: [], skill_cooldowns: {}, skill_damages: {}, skill_meta: {}, placed_this_turn: false, acted_this_turn: false, extra: {} }], side: [] },
        mulligan_done: false,
        placement_cost_used: 0,
    },
    winner: null,
    commander_skill_limit: 1,
};

test('active side hand ownership switches while board stays fixed', () => {
    const bottomView = mapSoloStateFromOnline(baseState, 'bottom');
    expect(bottomView.bottom.hand).toHaveLength(1);
    expect(bottomView.top.field.main[0].uid).toBe('o1');

    const topView = mapSoloStateFromOnline(baseState, 'top');
    expect(topView.top.hand).toHaveLength(1);
    expect(topView.bottom.field.main[0].uid).toBe('o1');
});

test('actionable uids only enabled for current active side', () => {
    const uidsBottom = computeSoloActionableUids('action', 'bottom', 'bottom', baseState.my_state.field);
    const uidsTopBlocked = computeSoloActionableUids('action', 'bottom', 'top', baseState.opponent_state.field);
    expect(uidsBottom).toEqual(['m1']);
    expect(uidsTopBlocked).toEqual([]);
});