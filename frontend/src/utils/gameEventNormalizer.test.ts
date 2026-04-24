import { normalizeOnlineWsMessage, normalizeSoloActionResponse } from './gameEventNormalizer';

describe('gameEventNormalizer', () => {
    test('normalizes online ws message into unified events', () => {
        const events = normalizeOnlineWsMessage({
            type: 'game_state',
            state: { phase: 'action', turn: 3, is_my_turn: true },
            caster_name: '애쉬',
            skill_name: '헤드샷',
            result: {
                caster_uid: 'c1',
                headshot: true,
                coin_result: 'heads',
                damage_map: { t1: 4, t2: -2 },
                destroyed_uids: ['t1'],
            },
        });

        expect(events).toEqual(expect.arrayContaining([
            { type: 'phase_changed', phase: 'action', turn: 3, isMyTurn: true },
            expect.objectContaining({ type: 'skill_used', skillName: '헤드샷', actorName: '애쉬' }),
            expect.objectContaining({ type: 'headshot_toss', headshot: true }),
            expect.objectContaining({ type: 'coin_toss', result: 'heads', success: true }),
            { type: 'damage', targetUid: 't1', amount: 4 },
            { type: 'heal', targetUid: 't2', amount: 2 },
            { type: 'kill_feed', killerUid: 'c1', victimUid: 't1' },
        ]));
    });

    test('normalizes solo action response into unified events', () => {
        const events = normalizeSoloActionResponse({
            state: { phase: 'action', turn: 2, is_my_turn: false },
            payload: { action: 'use_skill' },
            result: {
                caster_name: '메르시',
                skill_name: '치유 광선',
                damage_map: { ally_1: -5 },
            },
        });

        expect(events).toEqual(expect.arrayContaining([
            { type: 'phase_changed', phase: 'action', turn: 2, isMyTurn: false },
            expect.objectContaining({ type: 'skill_used', actorName: '메르시', skillName: '치유 광선' }),
            { type: 'heal', targetUid: 'ally_1', amount: 5 },
        ]));
    });
});