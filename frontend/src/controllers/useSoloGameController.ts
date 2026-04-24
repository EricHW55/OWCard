import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FieldCard, GameState, HandCard } from '../types/game';
import { getApiBase } from '../api/ws';
import useAnnouncerQueue from '../hooks/useAnnouncerQueue';
import { mapSoloStateFromOnline, Side } from './soloOnlineBridge';
import { createSoloAdapter } from './adapters/soloAdapter';
import type { UnifiedGameAction } from './gameModeAdapter';
import { getHeroKey, getSkillDescriptionFromCard, useAnnouncerHelpers } from './shared/gamePresentation';
import { ONLINE_GAME_UI_PRESET } from './shared/gameUiPreset';
import { computeActionableUids, useGameFlowState } from './shared/gameFlowState';
import { useMulliganCinematic } from './shared/useMulliganCinematic';
import { useSharedGameFlowActions } from './shared/useSharedGameFlowActions';
import { handleSpellPlayedPlacementUi } from './shared/onlineActionPresentation';
import {
  handleSwiftStrikeResetPresentation,
  showDeathPassiveNotice,
  showPassiveNoticeFromLog,
  showReactivePassiveFromStateDiff,
} from './shared/gameEventPresentation';

type SoloState = {
  top: { hand: HandCard[]; field: any; drawPile: HandCard[]; mulliganDone: boolean; placementUsed: number };
  bottom: { hand: HandCard[]; field: any; drawPile: HandCard[]; mulliganDone: boolean; placementUsed: number };
};
async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body?.detail || body?.message || '요청 실패';
  } catch {
    return `요청 실패 (${res.status})`;
  }
}

export function useSoloGameController() {
  const apiBase = getApiBase();
  const { announcerData, enqueueAnnouncer, closeAnnouncer } = useAnnouncerQueue();
  const uiTimersRef = useRef<number[]>([]);
  const { showPhaseChange, showSystemNotice, showSkillUse, showSkillUseAfterPlacement } = useAnnouncerHelpers({
    enqueueAnnouncer,
    uiTimersRef,
    placementDelayMs: ONLINE_GAME_UI_PRESET.timings.placementCinematicMs,
    phaseDurationMs: ONLINE_GAME_UI_PRESET.timings.phaseChangeMs,
    systemNoticeDurationMs: ONLINE_GAME_UI_PRESET.timings.systemNoticeMs,
    skillUseDurationMs: ONLINE_GAME_UI_PRESET.timings.skillUseMs,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [soloGameId, setSoloGameId] = useState<string | null>(null);
  const [gs, setGs] = useState<GameState | null>(null);
  const [activeSide, setActiveSide] = useState<Side>('bottom');

  const [selectedHandIdx, setSelectedHandIdx] = useState<number | null>(null);
  const [selectedFieldUid, setSelectedFieldUid] = useState<string | null>(null);
  const [selectedMulligan, setSelectedMulligan] = useState<number[]>([]);
  const [detailCard, setDetailCard] = useState<FieldCard | HandCard | null>(null);
  const [actionMode, setActionMode] = useState<string | null>(null);
  const [pendingSpellCard, setPendingSpellCard] = useState<HandCard | null>(null);
  const [pendingSpell, setPendingSpell] = useState<string | null>(null);
  const [pendingSpellName, setPendingSpellName] = useState<string | null>(null);
  const [localPendingSpellChoice, setLocalPendingSpellChoice] = useState<any | null>(null);
  const [columnChoice, setColumnChoice] = useState<{
    source: 'skill' | 'spell';
    heroKey?: string;
    skillKey?: string;
    skillName: string;
    targetSide: 'my' | 'opponent';
  } | null>(null);

  const players: SoloState | null = useMemo(() => (gs ? mapSoloStateFromOnline(gs, activeSide) : null), [gs, activeSide]);
  const phase = gs?.phase || 'waiting';
  const activePlayer = players?.[activeSide] || null;
  const opponentPlayer = players ? players[activeSide === 'top' ? 'bottom' : 'top'] : null;
  const {
    selectedHandCard,
    selectedMyFieldCard,
    selectedHeroKey,
    selectedChargeLevel,
    actionModeLabel,
    allMyField,
    fieldSkills,
    showContextPanel,
    availableColumns,
  } = useGameFlowState({
    my: activePlayer,
    opponent: opponentPlayer,
    phase,
    isMyTurn: true,
    selectedHandIdx,
    selectedFieldUid,
    actionMode,
    pendingSpell: pendingSpell || pendingSpellCard?.hero_key || null,
    columnChoice,
    pendingSpellChoice: localPendingSpellChoice,
  });
  const {
    mulliganAnimatingIndex,
    mulliganCinematicCard,
    mulliganReplacementCard,
    isMulliganCinematicActive,
    beginMulliganCinematic,
    completeMulliganCinematic,
  } = useMulliganCinematic(activePlayer?.hand);

  const refreshBySide = useCallback(async (gameId: string, side: Side) => {
    const res = await fetch(`${apiBase}/solo/${gameId}/state?side=${side}`);
    if (!res.ok) throw new Error(await readError(res));
    const body = await res.json();
    const nextGs = body.state as GameState;
    setGs(nextGs);
    setActiveSide(nextGs.current_player === nextGs.my_state.player_id ? side : (side === 'bottom' ? 'top' : 'bottom'));
  }, [apiBase]);

  const act = useCallback(async (payload: Record<string, any>) => {
    if (!soloGameId) return;
    const res = await fetch(`${apiBase}/solo/${soloGameId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ side: activeSide, payload }),
    });
    if (!res.ok) {
      showSystemNotice('실행 실패', await readError(res), 1200);
      return;
    }
    const previousState = gs;
    const body = await res.json();
    const result = body?.result || {};
    const nextState = body.state as GameState;
    const action = String(payload?.action || '');
    const spellName = result?.card?.name || result?.skill_name || result?.skill || selectedHandCard?.name || pendingSpellName || '스킬 카드';

    showReactivePassiveFromStateDiff({
      prevState: previousState,
      nextState,
      showSkillUse,
    });
    [ ...(result?.turn_start_logs || []), ...(result?.turn_end_logs || []) ].forEach((entry: any) => {
      showPassiveNoticeFromLog({
        entry,
        owner: 'my',
        gameState: previousState,
        showSkillUseAfterPlacement,
        showSystemNotice,
      });
    });
    showDeathPassiveNotice({
      result,
      gameState: previousState,
      showSkillUse,
      showSystemNotice,
    });
    handleSpellPlayedPlacementUi({
      action,
      result,
      spellName,
      addLog: () => {},
      showSystemNotice,
      setPendingSpellCard,
      setPendingSpell,
      setPendingSpellName,
      setActionMode,
      setColumnChoice,
      setLocalPendingSpellChoice,
      resetDuplicateTarget: () => {},
      showSkillUse,
      myHand: activePlayer?.hand || [],
      uiPreset: ONLINE_GAME_UI_PRESET,
    });

    let keepSelection = false;
    if (action === 'use_skill' && selectedMyFieldCard) {
      const resolvedSkillName = result?.skill_name || result?.skill || null;
      keepSelection = handleSwiftStrikeResetPresentation({
        result,
        msg: payload,
        casterCard: selectedMyFieldCard,
        actorName: selectedMyFieldCard.name,
        resolvedSkillName,
        showSkillUse,
        setSelectedHandIdx,
        setColumnChoice,
        setSelectedFieldUid,
        setActionMode,
        addLog: () => {},
      });
      if (!keepSelection && resolvedSkillName) {
        showSkillUse({
          skillName: resolvedSkillName,
          description: getSkillDescriptionFromCard(selectedMyFieldCard, payload?.skill_key || result?.skill_key || result?.skill),
          heroKey: getHeroKey(selectedMyFieldCard) || String(result?.caster?.hero_key || payload?.hero_key || ''),
          imageName: selectedMyFieldCard?.name || result?.caster_name || result?.caster?.name,
          subtitle: result?.caster_name || selectedMyFieldCard?.name,
          isSpell: false,
          duration: 3200,
        });
      }
    }

    setGs(body.state as GameState);
    setActiveSide(body.active_side as Side);
    if (!keepSelection) {
      setSelectedHandIdx(null);
      setSelectedFieldUid(null);
      setActionMode(null);
      setColumnChoice(null);
    }
    if (action !== 'place_card' || !result?.needs_target) {
      setPendingSpellCard(null);
      setPendingSpell(null);
      setPendingSpellName(null);
    }
  }, [apiBase, soloGameId, activeSide, gs, selectedMyFieldCard, selectedHandCard, pendingSpellName, activePlayer, showSkillUse, showSkillUseAfterPlacement, showSystemNotice]);

  const soloAdapter = useMemo(() => createSoloAdapter({
    getViewModel: () => ({ mode: 'solo', gameState: gs, phase: gs?.phase || 'waiting', isMyTurn: gs?.is_my_turn }),
    sendAction: async (action: UnifiedGameAction) => {
      await act(action as Record<string, any>);
    },
  }), [act, gs]);

  const dispatchAction = useCallback(async (action: UnifiedGameAction) => {
    await soloAdapter.dispatch(action);
  }, [soloAdapter]);

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        const pid = Number(sessionStorage.getItem('player_id') || 0);
        if (!pid) throw new Error('로그인이 필요합니다.');
        const startRes = await fetch(`${apiBase}/solo/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ player_id: pid }),
        });
        if (!startRes.ok) throw new Error(await readError(startRes));
        const start = await startRes.json();
        setSoloGameId(start.solo_game_id);
        setGs(start.state as GameState);
        setActiveSide('bottom');
      } catch (e: any) {
        setError(e?.message || '솔로 모드 초기화 실패');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [apiBase]);

  useEffect(() => {
    showPhaseChange(phase, activeSide === 'bottom' ? '아래쪽 턴' : '위쪽 턴');
  }, [phase, activeSide, showPhaseChange]);

  const canActTop = computeActionableUids({ phase, isMyTurn: activeSide === 'top', field: players?.top.field });
  const canActBottom = computeActionableUids({ phase, isMyTurn: activeSide === 'bottom', field: players?.bottom.field });

  const sharedActions = useSharedGameFlowActions({
    my: activePlayer,
    opponentField: opponentPlayer?.field,
    phase,
    isMyTurn: true,
    state: {
      selectedHandIdx,
      selectedFieldUid,
      selectedMulligan,
      actionMode,
      pendingSpell: pendingSpell || pendingSpellCard?.hero_key || null,
      pendingSpellName: pendingSpellName || pendingSpellCard?.name || null,
      columnChoice,
    },
    setters: {
      setSelectedHandIdx,
      setSelectedFieldUid,
      setSelectedMulligan,
      setActionMode,
      setPendingSpell,
      setPendingSpellName,
      setColumnChoice,
      setDetailCard,
      setLocalPendingSpellChoice,
    },
    selectedHandCard,
    selectedMyFieldCard: selectedMyFieldCard as FieldCard | null,
    allMyField: allMyField as FieldCard[],
    pendingSpellChoice: localPendingSpellChoice,
    sendAction: (action) => { void dispatchAction(action as UnifiedGameAction); },
    showSystemNotice,
    beginMulliganCinematic,
    clearPendingSpellCard: () => setPendingSpellCard(null),
    allowMulliganMultiSelect: true,
  });

  const placeCard = sharedActions.handlePlace;
  const endPlacement = () => { void dispatchAction({ action: 'end_placement' }); };
  const endTurn = () => { void dispatchAction({ action: 'end_turn' }); };
  return {
    loading,
    error,
    announcerData,
    closeAnnouncer,
    players,
    activeSide,
    phase,
    activePlayer,
    selectedHandIdx,
    selectedMulligan,
    mulliganAnimatingIndex,
    mulliganCinematicCard,
    mulliganReplacementCard,
    isMulliganCinematicActive,
    selectedFieldUid,
    selectedHandCard,
    selectedMyFieldCard,
    selectedHeroKey,
    selectedChargeLevel,
    detailCard,
    setDetailCard,
    canActTop,
    canActBottom,
    fieldSkills,
    actionMode,
    actionModeLabel,
    pendingSpellCard,
    columnChoice,
    enemyColumns: availableColumns,
    showContextPanel,
    confirmMulligan: sharedActions.runMulligan,
    runMulligan: sharedActions.runMulligan,
    skipMulligan: sharedActions.skipMulligan,
    completeMulliganCinematic,
    placeCard,
    handlePlace: placeCard,
    useSelectedSpell: sharedActions.useSelectedSpell,
    cancelSelectedHand: sharedActions.cancelSelectedHand,
    cancelPendingSpell: sharedActions.cancelPendingSpell,
    endPlacement,
    executeSkill: (skillKey: string, targetUid?: string) => {
      if (!selectedMyFieldCard) return;
      act({ action: 'use_skill', caster_uid: selectedMyFieldCard.uid, skill_key: skillKey, target_uid: targetUid });
    },
    endTurn,
    handleEndMainButton: sharedActions.handleEndMainButton,
    prepareSkill: sharedActions.prepareSkill,
    setActionMode,
    setColumnChoice,
    selectColumn: sharedActions.selectColumn,
    cancelColumnChoice: sharedActions.cancelColumnChoice,
    canSelectEmptySlot: sharedActions.canSelectEmptySlot,
    handleEmptySlotSelect: sharedActions.handleEmptySlotSelect,
    handleHandClick: sharedActions.handleHandClick,
    handleFieldClick: sharedActions.handleFieldClick,
    refreshBySide,
  };
}

export default useSoloGameController;
