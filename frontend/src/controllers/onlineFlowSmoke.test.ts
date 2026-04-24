import { createGameActionDispatcher } from '../utils/gameActionDispatcher';

describe('online flow smoke', () => {
    test('placement -> skill -> end_turn dispatches without errors', async () => {
        const send = jest.fn(async () => undefined);
        const dispatch = createGameActionDispatcher({ send });

        await dispatch({ action: 'place_card', hand_index: 0, zone: 'main', slot_index: 0 });
        await dispatch({ action: 'use_skill', caster_uid: 'c1', skill_key: 'skill_1', target_uid: 't1' });
        await dispatch({ action: 'end_turn' });

        expect(send).toHaveBeenCalledTimes(3);
        expect(send).toHaveBeenNthCalledWith(1, expect.objectContaining({ action: 'place_card' }));
        expect(send).toHaveBeenNthCalledWith(2, expect.objectContaining({ action: 'use_skill' }));
        expect(send).toHaveBeenNthCalledWith(3, expect.objectContaining({ action: 'end_turn' }));
    });
});