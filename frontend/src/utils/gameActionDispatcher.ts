import type { UnifiedGameAction } from '../controllers/gameModeAdapter';

export type GameActionTransport = {
    send(action: UnifiedGameAction): Promise<unknown> | unknown;
};

export function createGameActionDispatcher(transport: GameActionTransport) {
    return async (action: UnifiedGameAction): Promise<void> => {
        await transport.send(action);
    };
}