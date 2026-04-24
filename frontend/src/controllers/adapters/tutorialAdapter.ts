import type { GameModeAdapter, UnifiedGameAction, UnifiedGameEvent, UnifiedGameViewModel } from '../gameModeAdapter';
import { createGameActionDispatcher } from '../../utils/gameActionDispatcher';

export type TutorialStep = {
    id: string;
    action?: UnifiedGameAction;
    manual_next?: boolean;
};

export function createTutorialAdapter(params: {
    getViewModel: () => UnifiedGameViewModel;
    sendAction: (action: UnifiedGameAction) => Promise<void> | void;
    steps: TutorialStep[];
}) {
    const listeners = new Set<(event: UnifiedGameEvent) => void>();
    const dispatch = createGameActionDispatcher({ send: params.sendAction });
    let pointer = 0;

    const notify = (event: UnifiedGameEvent) => listeners.forEach((handler) => handler(event));

    const runCurrentStep = async () => {
        const step = params.steps[pointer];
        if (!step) return;
        if (step.action) {
            await dispatch(step.action);
            notify({ type: 'phase_changed', phase: `tutorial_  step:${step.id}` });
        }
        if (!step.manual_next) {
            pointer += 1;
            await runCurrentStep();
        }
    };

    return {
        getViewModel: params.getViewModel,
        dispatch,
        subscribe: (handler: (event: UnifiedGameEvent) => void) => {
            listeners.add(handler);
            return () => listeners.delete(handler);
        },
        start: async () => {
            pointer = 0;
            await runCurrentStep();
        },
        manualNext: async () => {
            pointer += 1;
            await runCurrentStep();
        },
    } as GameModeAdapter & { start: () => Promise<void>; manualNext: () => Promise<void> };
}