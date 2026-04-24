import type { GameModeAdapter, UnifiedGameAction, UnifiedGameEvent, UnifiedGameViewModel } from '../gameModeAdapter';
import { createGameActionDispatcher } from '../../utils/gameActionDispatcher';

export function createOnlineAdapter(params: {
    getViewModel: () => UnifiedGameViewModel;
    sendAction: (action: UnifiedGameAction) => Promise<void> | void;
    subscribeEvent?: (handler: (event: UnifiedGameEvent) => void) => () => void;
}): GameModeAdapter {
    const dispatch = createGameActionDispatcher({ send: params.sendAction });
    return {
        getViewModel: params.getViewModel,
        dispatch,
        subscribe: (handler) => params.subscribeEvent?.(handler) || (() => {}),
    };
}