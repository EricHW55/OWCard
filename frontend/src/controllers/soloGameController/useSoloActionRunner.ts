import { useCallback } from 'react';
import type { GameState } from '../../types/game';
import type { UnifiedGameAction } from '../gameModeAdapter';
import { normalizeGameError } from '../shared/gameErrorPolicy';
import { shouldClearSoloSpellAfterAction } from './rules';
import { SOLO_UI } from './constants';
import type { SoloSide, SoloTransport } from './types';

export function useSoloActionRunner(params: {
  soloGameId: string | null;
  activeSide: SoloSide;
  transport: SoloTransport;
  gameEvents: {
    handleActionResultMessage: (msg: any) => void;
    handleGameStateMessage: (msg: any) => void;
    clearPendingSpellCard: () => void;
  };
  setActiveSide: (side: SoloSide) => void;
  setSelectedHandIdx: (value: number | null) => void;
  setSelectedFieldUid: (value: string | null) => void;
  setActionMode: (value: string | null) => void;
  setColumnChoice: (value: any | null) => void;
  setPendingSpell: (value: string | null) => void;
  setPendingSpellName: (value: string | null) => void;
  showSystemNotice: (title: string, subtitle?: string, duration?: number) => void;
  resolveActiveSide?: (state: GameState, currentSide: SoloSide) => SoloSide;
}) {
  const {
    soloGameId,
    activeSide,
    transport,
    gameEvents,
    setActiveSide,
    setSelectedHandIdx,
    setSelectedFieldUid,
    setActionMode,
    setColumnChoice,
    setPendingSpell,
    setPendingSpellName,
    showSystemNotice,
    resolveActiveSide,
  } = params;

  return useCallback(async (action: UnifiedGameAction) => {
    if (!soloGameId) return;
    try {
      const response = await transport.act(soloGameId, activeSide, action as Record<string, unknown>);
      const actionName = String(action?.action || '');
      gameEvents.handleActionResultMessage({
        ...action,
        result: response.result,
      });
      gameEvents.handleGameStateMessage({ state: response.state });
      setActiveSide(response.activeSide || resolveActiveSide?.(response.state, activeSide) || activeSide);

      setSelectedHandIdx(null);
      setSelectedFieldUid(null);
      setActionMode(null);
      setColumnChoice(null);

      if (shouldClearSoloSpellAfterAction(actionName, response.result)) {
        setPendingSpell(null);
        setPendingSpellName(null);
        gameEvents.clearPendingSpellCard();
      }
    } catch (error) {
      showSystemNotice('행동 실패', normalizeGameError((error as Error)?.message), SOLO_UI.errorNoticeMs);
    }
  }, [
    activeSide,
    gameEvents,
    setActionMode,
    setActiveSide,
    setColumnChoice,
    setPendingSpell,
    setPendingSpellName,
    setSelectedFieldUid,
    setSelectedHandIdx,
    showSystemNotice,
    soloGameId,
    transport,
    resolveActiveSide,
  ]);
}
