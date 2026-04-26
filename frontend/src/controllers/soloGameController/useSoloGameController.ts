import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BattleLogActor, BattleLogEntry, FieldCard, GameState, HandCard } from '../../types/game';
import useAnnouncerQueue from '../../hooks/useAnnouncerQueue';
import { createSoloAdapter } from '../adapters/soloAdapter';
import type { UnifiedGameAction } from '../gameModeAdapter';
import { getHeroKey, useAnnouncerHelpers } from '../shared/gamePresentation';
import { ONLINE_GAME_UI_PRESET } from '../shared/gameUiPreset';
import { useGameFlowState } from '../shared/gameFlowState';
import { useMulliganCinematic } from '../shared/useMulliganCinematic';
import { useServerGameEventPresentation } from '../shared/useServerGameEventPresentation';
import { useSharedGameFlowActions } from '../shared/useSharedGameFlowActions';
import { normalizeGameError } from '../shared/gameErrorPolicy';
import { createSoloHttpTransport } from './transport';
import { getSoloActionableUids, getSoloPhaseSubtitle, buildSoloPlayersView, resolveActiveSideFromState } from './rules';
import { SOLO_UI } from './constants';
import type { SoloSide, SoloTransport } from './types';
import { useSoloActionRunner } from './useSoloActionRunner';
import { phaseLabel } from '../../utils/ui';

export function useSoloGameController(options?: { transport?: SoloTransport }) {
  const transport = useMemo(() => options?.transport || createSoloHttpTransport(), [options?.transport]);
  const { announcerData, enqueueAnnouncer, closeAnnouncer } = useAnnouncerQueue();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [soloGameId, setSoloGameId] = useState<string | null>(null);
  const [gs, setGs] = useState<GameState | null>(null);
  const [activeSide, setActiveSide] = useState<SoloSide>('bottom');

  const [selectedHandIdx, setSelectedHandIdx] = useState<number | null>(null);
  const [selectedFieldUid, setSelectedFieldUid] = useState<string | null>(null);
  const [selectedMulligan, setSelectedMulligan] = useState<number[]>([]);
  const [detailCard, setDetailCard] = useState<FieldCard | HandCard | null>(null);
  const [actionMode, setActionMode] = useState<string | null>(null);
  const [pendingSpell, setPendingSpell] = useState<string | null>(null);
  const [pendingSpellName, setPendingSpellName] = useState<string | null>(null);
  const [localPendingPassive, setLocalPendingPassive] = useState<any | null>(null);
  const [localPendingSpellChoice, setLocalPendingSpellChoice] = useState<any | null>(null);
  const [columnChoice, setColumnChoice] = useState<{
    source: 'skill' | 'spell';
    heroKey?: string;
    skillKey?: string;
    skillName: string;
    targetSide: 'my' | 'opponent';
  } | null>(null);

  const uiTimersRef = useRef<number[]>([]);
  const announcerDataRef = useRef(announcerData);
  const gsRef = useRef<GameState | null>(null);
  const battleLogSeqRef = useRef(0);
  const startedRef = useRef(false);
  const [logs, setLogs] = useState<BattleLogEntry[]>([]);

  const pushBattleLog = useCallback((entry: Omit<BattleLogEntry, 'id'>) => {
    const id = `solo-log-${Date.now()}-${battleLogSeqRef.current++}`;
    setLogs((prev) => [...prev.slice(-199), { ...entry, id }]);
  }, []);

  const addLog = useCallback((msg: string) => {
    pushBattleLog({ type: 'system', team: 'neutral', text: msg, turn: gsRef.current?.turn });
  }, [pushBattleLog]);

  const toActor = useCallback((card: any, fallbackName?: string): BattleLogActor => ({
    name: String(card?.name || fallbackName || '이름 없음'),
    heroKey: getHeroKey(card),
    isSpell: !!card?.is_spell,
  }), []);

  const { showPhaseChange, showSystemNotice, showSkillUse, showSkillUseAfterPlacement } = useAnnouncerHelpers({
    enqueueAnnouncer,
    uiTimersRef,
    announcerDataRef,
    placementDelayMs: ONLINE_GAME_UI_PRESET.timings.placementCinematicMs,
    phaseDurationMs: ONLINE_GAME_UI_PRESET.timings.phaseChangeMs,
    systemNoticeDurationMs: ONLINE_GAME_UI_PRESET.timings.systemNoticeMs,
    skillUseDurationMs: ONLINE_GAME_UI_PRESET.timings.skillUseMs,
  });
  const soloPhaseLabel = useCallback((value: any) => phaseLabel(String(value)), []);
  const soloPhaseSubtitle = useCallback((_phase: any, isMyTurn?: boolean) => (isMyTurn ? '내 턴' : '상대 턴'), []);

  const gameEvents = useServerGameEventPresentation({
    gameState: gs,
    setGameState: setGs,
    gameStateRef: gsRef,
    announcerData,
    announcerDataRef,
    uiTimersRef,
    pendingSpellName,
    addLog,
    pushBattleLog,
    toActor,
    showPhaseChange,
    showSystemNotice,
    showSkillUse,
    showSkillUseAfterPlacement,
    setSelectedHandIdx,
    setSelectedFieldUid,
    setActionMode,
    setColumnChoice,
    setPendingSpell,
    setPendingSpellName,
    setLocalPendingPassive,
    setLocalPendingSpellChoice,
    phaseLabel: soloPhaseLabel,
    phaseSubtitle: soloPhaseSubtitle,
    uiPreset: ONLINE_GAME_UI_PRESET,
  });
  const soloEventHandlers = useMemo(() => ({
    handleActionResultMessage: gameEvents.handleActionResultMessage,
    handleGameStateMessage: gameEvents.handleGameStateMessage,
    clearPendingSpellCard: gameEvents.clearPendingSpellCard,
  }), [
    gameEvents.clearPendingSpellCard,
    gameEvents.handleActionResultMessage,
    gameEvents.handleGameStateMessage,
  ]);
  const soloEventHandlersRef = useRef(soloEventHandlers);

  useEffect(() => {
    soloEventHandlersRef.current = soloEventHandlers;
  }, [soloEventHandlers]);

  const players = useMemo(
      () => (gs ? buildSoloPlayersView(gs, activeSide) : null),
      [activeSide, gs],
  );
  const phase = gs?.phase || 'waiting';
  const activePlayer = players?.[activeSide] || null;
  const opponentPlayer = players ? players[activeSide === 'top' ? 'bottom' : 'top'] : null;
  const pendingPassive = ((activePlayer as any)?.pending_passive ?? (activePlayer as any)?.pendingPassive ?? localPendingPassive ?? null) as any;
  const pendingSpellChoice = ((activePlayer as any)?.pending_spell ?? (activePlayer as any)?.pendingSpell ?? localPendingSpellChoice ?? null) as any;

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
    pendingSpell,
    columnChoice,
    pendingPassive,
    pendingSpellChoice,
  });

  const {
    mulliganAnimatingIndex,
    mulliganCinematicCard,
    mulliganReplacementCard,
    isMulliganCinematicActive,
    beginMulliganCinematic,
    completeMulliganCinematic,
  } = useMulliganCinematic(activePlayer?.hand);

  const dispatchSoloAction = useSoloActionRunner({
    soloGameId,
    activeSide,
    transport,
    gameEvents: soloEventHandlers,
    setActiveSide,
    setSelectedHandIdx,
    setSelectedFieldUid,
    setActionMode,
    setColumnChoice,
    setPendingSpell,
    setPendingSpellName,
    showSystemNotice,
    resolveActiveSide: resolveActiveSideFromState,
  });

  const soloAdapter = useMemo(() => createSoloAdapter({
    getViewModel: () => ({
      mode: 'solo',
      gameState: gs,
      phase,
      isMyTurn: true,
      logs,
      killFeed: gameEvents.killFeed,
    }),
    sendAction: dispatchSoloAction,
  }), [dispatchSoloAction, gameEvents.killFeed, gs, logs, phase]);

  const dispatchAction = useCallback(async (action: UnifiedGameAction) => {
    await soloAdapter.dispatch(action);
  }, [soloAdapter]);

  const refreshBySide = useCallback(async (gameId: string, side: SoloSide) => {
    try {
      const nextState = await transport.refresh(gameId, side);
      soloEventHandlers.handleGameStateMessage({ state: nextState });
      setActiveSide(resolveActiveSideFromState(nextState, side));
    } catch (err) {
      showSystemNotice('상태 갱신 실패', normalizeGameError((err as Error)?.message), SOLO_UI.errorNoticeMs);
    }
  }, [showSystemNotice, soloEventHandlers, transport]);

  useEffect(() => {
    if (startedRef.current) return undefined;
    startedRef.current = true;
    let disposed = false;
    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        const pid = Number(sessionStorage.getItem('player_id') || 0);
        if (!pid) throw new Error('로그인이 필요합니다');
        const start = await transport.start(pid);
        if (disposed) return;
        setSoloGameId(start.soloGameId);
        soloEventHandlersRef.current.handleGameStateMessage({ state: start.state });
        setActiveSide('bottom');
      } catch (err) {
        if (!disposed) setError(normalizeGameError((err as Error)?.message, '솔로 모드 초기화 실패'));
      } finally {
        if (!disposed) setLoading(false);
      }
    };
    run();
    return () => {
      disposed = true;
      uiTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      uiTimersRef.current = [];
    };
  }, [transport]);

  useEffect(() => {
    if (!gs) return;
    showPhaseChange(phaseLabel(phase), getSoloPhaseSubtitle(activeSide), SOLO_UI.phaseNoticeMs);
  }, [activeSide, gs, phase, showPhaseChange]);

  const canActTop = getSoloActionableUids({ phase, activeSide, side: 'top', field: players?.top.field });
  const canActBottom = getSoloActionableUids({ phase, activeSide, side: 'bottom', field: players?.bottom.field });

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
      pendingSpell,
      pendingSpellName,
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
      setLocalPendingPassive,
      setLocalPendingSpellChoice,
    },
    selectedHandCard,
    selectedMyFieldCard: selectedMyFieldCard as FieldCard | null,
    allMyField: allMyField as FieldCard[],
    pendingPassive,
    pendingSpellChoice,
    sendAction: (action) => { void dispatchAction(action as UnifiedGameAction); },
    addLog,
    showSystemNotice,
    beginMulliganCinematic,
    clearPendingSpellCard: gameEvents.clearPendingSpellCard,
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
    pendingSpellCard: null as HandCard | null,
    pendingSpell,
    pendingSpellName,
    pendingPassive,
    pendingSpellChoice,
    columnChoice,
    enemyColumns: availableColumns,
    showContextPanel,
    duplicateTargetUid: sharedActions.duplicateTargetUid,
    duplicateTargetRole: sharedActions.duplicateTargetRole,
    duplicateTargetName: sharedActions.duplicateTargetName,
    killFeed: gameEvents.killFeed,
    cardEffects: gameEvents.cardEffects,
    headshotCoinTossEvent: gameEvents.headshotCoinTossEvent,
    completeHeadshotCoinToss: gameEvents.completeHeadshotCoinToss,
    confirmMulligan: sharedActions.runMulligan,
    runMulligan: sharedActions.runMulligan,
    skipMulligan: sharedActions.skipMulligan,
    completeMulliganCinematic,
    placeCard,
    handlePlace: placeCard,
    useSelectedSpell: sharedActions.useSelectedSpell,
    cancelSelectedHand: sharedActions.cancelSelectedHand,
    cancelPendingSpell: sharedActions.cancelPendingSpell,
    resolveMercy: sharedActions.resolveMercy,
    skipMercy: sharedActions.skipMercy,
    skipJetpackCat: sharedActions.skipJetpackCat,
    resolveSpellChoice: sharedActions.resolveSpellChoice,
    endPlacement,
    executeSkill: (skillKey: string, targetUid?: string) => {
      if (!selectedMyFieldCard) return;
      void dispatchAction({ action: 'use_skill', caster_uid: selectedMyFieldCard.uid, skill_key: skillKey, target_uid: targetUid });
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
    dismissKillFeedItem: gameEvents.dismissKillFeedItem,
    logs,
    refreshBySide,
  };
}

export default useSoloGameController;
