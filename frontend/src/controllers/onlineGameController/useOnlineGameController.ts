import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BattleLogActor, BattleLogEntry, FieldCard, GameState, HandCard } from '../../types/game';
import { GameSocket, buildWsUrl } from '../../api/ws';
import useAnnouncerQueue from '../../hooks/useAnnouncerQueue';
import { normalizeErrorMessage, phaseLabel, phaseSubtitle } from '../../utils/ui';
import { createOnlineAdapter } from '../adapters/onlineAdapter';
import type { UnifiedGameAction } from '../gameModeAdapter';
import {
  getHeroKey,
  useAnnouncerHelpers,
} from '../shared/gamePresentation';
import { ONLINE_GAME_UI_PRESET } from '../shared/gameUiPreset';
import { useGameFlowState } from '../shared/gameFlowState';
import { useMulliganCinematic } from '../shared/useMulliganCinematic';
import { useSharedGameFlowActions } from '../shared/useSharedGameFlowActions';
import { useServerGameEventPresentation } from '../shared/useServerGameEventPresentation';
import { DAMAGE_FLOAT_MS, DESTROY_ANIMATION_MS, HP_ANIMATION_MS } from './constants';
import { getSession } from './session';
import { mapSpectatorStateToGameState } from './spectatorState';
import type { ColumnChoice } from './types';

export function useOnlineGameController(gameId: string, options?: { spectate?: boolean }) {
  const isSpectator = !!options?.spectate;
  const session = useMemo(() => getSession(), []);
  const { announcerData, enqueueAnnouncer, closeAnnouncer } = useAnnouncerQueue();

  const [gs, setGs] = useState<GameState | null>(null);
  const [selectedHandIdx, setSelectedHandIdx] = useState<number | null>(null);
  const [selectedFieldUid, setSelectedFieldUid] = useState<string | null>(null);
  const [selectedMulligan, setSelectedMulligan] = useState<number[]>([]);
  const [actionMode, setActionMode] = useState<string | null>(null);
  const [detailCard, setDetailCard] = useState<FieldCard | HandCard | null>(null);
  const [logs, setLogs] = useState<BattleLogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [pendingSpell, setPendingSpell] = useState<string | null>(null);
  const [pendingSpellName, setPendingSpellName] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [localPendingPassive, setLocalPendingPassive] = useState<any | null>(null);
  const [localPendingSpellChoice, setLocalPendingSpellChoice] = useState<any | null>(null);
  const [columnChoice, setColumnChoice] = useState<ColumnChoice | null>(null);


  const wsRef = useRef<GameSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const manualCloseRef = useRef(false);
  const gsRef = useRef<GameState | null>(null);
  const announcerDataRef = useRef(announcerData);
  const uiTimersRef = useRef<number[]>([]);
  const battleLogSeqRef = useRef(0);

  const pushBattleLog = useCallback((entry: Omit<BattleLogEntry, 'id'>) => {
    const id = `battle-log-${Date.now()}-${battleLogSeqRef.current++}`;
    setLogs((prev) => [...prev.slice(-199), { ...entry, id }]);
  }, []);

  const addLog = useCallback((msg: string) => {
    pushBattleLog({ type: 'system', team: 'neutral', text: msg, turn: gsRef.current?.turn });
  }, [pushBattleLog]);
  const addLogRef = useRef(addLog);

  const toActor = useCallback((card: any, fallbackName?: string): BattleLogActor => ({
    name: String(card?.name || fallbackName || '?????놁쓬'),
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
  const showPhaseChangeRef = useRef(showPhaseChange);
  const showSystemNoticeRef = useRef(showSystemNotice);

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
    phaseLabel,
    phaseSubtitle,
    mapSpectatorState: mapSpectatorStateToGameState,
    uiPreset: ONLINE_GAME_UI_PRESET,
    hpAnimationMs: HP_ANIMATION_MS,
    destroyAnimationMs: DESTROY_ANIMATION_MS,
    damageFloatMs: DAMAGE_FLOAT_MS,
  });
  const {
    handleGameStateMessage,
    handleSpectatorStateMessage,
    handleGameActionMessage,
    handleActionResultMessage,
    handleOpponentActionMessage,
  } = gameEvents;
  const handleGameStateMessageRef = useRef(handleGameStateMessage);
  const handleSpectatorStateMessageRef = useRef(handleSpectatorStateMessage);
  const handleGameActionMessageRef = useRef(handleGameActionMessage);
  const handleActionResultMessageRef = useRef(handleActionResultMessage);
  const handleOpponentActionMessageRef = useRef(handleOpponentActionMessage);

  useEffect(() => {
    handleGameStateMessageRef.current = handleGameStateMessage;
    handleSpectatorStateMessageRef.current = handleSpectatorStateMessage;
    handleGameActionMessageRef.current = handleGameActionMessage;
    handleActionResultMessageRef.current = handleActionResultMessage;
    handleOpponentActionMessageRef.current = handleOpponentActionMessage;
    addLogRef.current = addLog;
    showPhaseChangeRef.current = showPhaseChange;
    showSystemNoticeRef.current = showSystemNotice;
  }, [
    handleGameStateMessage,
    handleSpectatorStateMessage,
    handleGameActionMessage,
    handleActionResultMessage,
    handleOpponentActionMessage,
    addLog,
    showPhaseChange,
    showSystemNotice,
  ]);

  useEffect(() => {
    if (!gameId) return;
    if (!isSpectator && !session) return;
    manualCloseRef.current = false;
    let localWs: GameSocket | null = null;
    let offFns: Array<() => void> = [];

    const clearHeartbeat = () => {
      if (heartbeatRef.current) {
        window.clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
    const cleanupSocket = () => {
      offFns.forEach((off) => { try { off(); } catch {} });
      offFns = [];
      clearHeartbeat();
      if (localWs) { try { localWs.disconnect(); } catch {} localWs = null; }
      wsRef.current = null;
    };
    const startHeartbeat = () => {
      clearHeartbeat();
      heartbeatRef.current = window.setInterval(() => {
        if (wsRef.current?.connected) {
          try { wsRef.current.send({ action: 'ping' }); } catch {}
        }
      }, 15000);
    };

    const connectWs = () => {
      if (manualCloseRef.current) return;
      cleanupSocket();
      const ws = new GameSocket();
      localWs = ws;
      wsRef.current = ws;
      if (isSpectator) {
        ws.connect(buildWsUrl(`/ws/spectate/${gameId}`, {}));
      } else {
        ws.connect(buildWsUrl(`/ws/game/${gameId}`, { token: session!.token, player_id: session!.player_id }));
      }

      offFns = [
        ws.on('_connected', () => {
          const wasReconnecting = reconnectAttemptRef.current > 0;
          setConnected(true);
          setReconnecting(false);
          clearReconnectTimer();
          reconnectAttemptRef.current = 0;
          addLogRef.current(wasReconnecting ? '재연결 성공' : '소켓 연결됨');
          if (!isSpectator) ws.send({ action: 'get_state' });
          startHeartbeat();
        }),
        ws.on('_disconnected', () => {
          setConnected(false);
          clearHeartbeat();
          if (manualCloseRef.current) return;
          setReconnecting(true);
          if (!reconnectTimerRef.current) {
            const attempt = reconnectAttemptRef.current + 1;
            const delay = Math.min(1000 * (2 ** (attempt - 1)), 5000);
            reconnectAttemptRef.current = attempt;
            addLogRef.current('소켓 끊김 - ' + Math.round(delay / 1000) + '초 후 재연결 시도');
            reconnectTimerRef.current = window.setTimeout(() => {
              reconnectTimerRef.current = null;
              connectWs();
            }, delay);
          }
        }),
        ws.on('pong', () => {}),
        ws.on('game_state', (msg: any) => handleGameStateMessageRef.current(msg)),
        ws.on('spectator_state', (msg: any) => handleSpectatorStateMessageRef.current(msg)),
        ws.on('game_action', (msg: any) => handleGameActionMessageRef.current(msg, { isSpectator })),
        ws.on('action_result', (msg: any) => handleActionResultMessageRef.current(msg)),
        ws.on('opponent_action', (msg: any) => handleOpponentActionMessageRef.current(msg)),
        ws.on('phase_change', (msg: any) => addLogRef.current(msg.message || ('phase ' + msg.phase))),
        ws.on('game_over', (msg: any) => {
          const isWinner = !isSpectator && Number(msg?.winner) === Number(session?.player_id);
          addLogRef.current('게임 종료: ' + (msg.winner_name ?? msg.winner));
          setReconnecting(false);
          showPhaseChangeRef.current(
              isSpectator ? '게임 종료' : (isWinner ? '승리' : '패배'),
              String(msg.winner_name ?? msg.winner ?? '승자 미정'),
              isSpectator ? 2000 : 2800,
          );
        }),
        ws.on('bo3_round_end', (msg: any) => {
          const round = Number(msg?.round || 0);
          const winnerName = msg?.winner_name || ('P' + msg?.winner);
          const nextRound = Number(msg?.next_round || round + 1);
          addLogRef.current('BO3 ' + round + '라운드 종료 - ' + winnerName + ' 승리. ' + nextRound + '라운드 준비');
          showPhaseChangeRef.current('라운드 종료', winnerName + ' 승리 - 다음 라운드 준비', 2200);
        }),
        ws.on('bo3_round_started', (msg: any) => {
          const round = Number(msg?.round || 0);
          addLogRef.current('BO3 ' + round + '라운드 시작');
          showPhaseChangeRef.current(round + '라운드', '전투 시작', 1600);
        }),
        ws.on('opponent_disconnected', () => addLogRef.current('상대 연결 끊김')),
        ws.on('player_reconnected', () => addLogRef.current('상대가 재연결했습니다')),
        ws.on('error', (msg: any) => {
          const shortMessage = normalizeErrorMessage(msg?.message);
          addLogRef.current('오류: ' + shortMessage);
          showSystemNoticeRef.current('행동 불가', shortMessage, 2600);
        }),
      ];
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !manualCloseRef.current) {
        if (!wsRef.current?.connected && !reconnectTimerRef.current) {
          setReconnecting(true);
          reconnectTimerRef.current = window.setTimeout(() => {
            reconnectTimerRef.current = null;
            connectWs();
          }, 150);
        }
      }
    };

    connectWs();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      manualCloseRef.current = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      uiTimersRef.current.forEach((tid) => window.clearTimeout(tid));
      uiTimersRef.current = [];
      offFns.forEach((off) => { try { off(); } catch {} });
      if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
      if (localWs) { try { localWs.disconnect(); } catch {} }
      wsRef.current = null;
    };
  }, [
    session,
    gameId,
    isSpectator,
  ]);

  const send = useCallback((data: Record<string, unknown>) => {
    if (isSpectator) return;
    if (wsRef.current?.connected) { wsRef.current.send(data); return; }
    addLogRef.current('?꾩넚 ?ㅽ뙣(誘몄뿰寃?');
  }, [isSpectator]);

  const onlineAdapter = useMemo(() => createOnlineAdapter({
    getViewModel: () => ({
      mode: 'online',
      gameState: gs,
      phase: gs?.phase || 'loading',
      isMyTurn: gs?.is_my_turn,
      logs,
      killFeed: gameEvents.killFeed,
    }),
    sendAction: async (action: UnifiedGameAction) => {
      send(action as Record<string, unknown>);
    },
  }), [gs, logs, gameEvents.killFeed, send]);

  const dispatchAction = useCallback((action: UnifiedGameAction) => {
    void onlineAdapter.dispatch(action);
  }, [onlineAdapter]);

  const leaveGame = useCallback(() => {
    manualCloseRef.current = true;
    if (!gs) return;
    if (gs.phase === 'game_over') {
      dispatchAction({ action: 'cleanup_game' });
      return;
    }
    dispatchAction({ action: 'leave_game' });
  }, [gs, dispatchAction]);

  const surrenderGame = useCallback(() => {
    if (gs && gs.phase !== 'game_over') dispatchAction({ action: 'surrender' });
  }, [gs, dispatchAction]);
  const submitBo3Deck = useCallback((deckCardIds: number[]) => {
    send({ action: 'submit_bo3_deck', deck_card_ids: deckCardIds });
  }, [send]);
  const chooseBo3FirstPlayer = useCallback((choice: 'first' | 'second') => {
    send({ action: 'bo3_choose_first', choice });
  }, [send]);

  const displayState = gameEvents.renderGameState || gs;
  const my = displayState?.my_state || null;
  const opp = displayState?.opponent_state || null;
  const phase = gs?.phase || 'loading';
  const isMyTurn = !!gs?.is_my_turn;

  const pendingPassive = ((my as any)?.pending_passive ?? (my as any)?.pendingPassive ?? (gs as any)?.my_state?.pending_passive ?? localPendingPassive ?? null) as any;
  const pendingSpellChoice = ((my as any)?.pending_spell ?? (my as any)?.pendingSpell ?? (gs as any)?.my_state?.pending_spell ?? localPendingSpellChoice ?? null) as any;

  const {
    selectedHandCard,
    allMyField,
    selectedMyFieldCard,
    availableColumns,
    selectedHeroKey,
    selectedChargeLevel,
    actionModeLabel,
    canActUids,
    fieldSkills,
    showContextPanel,
  } = useGameFlowState({
    my,
    opponent: opp,
    phase,
    isMyTurn,
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
  } = useMulliganCinematic(my?.hand);

  const sharedActions = useSharedGameFlowActions({
    my,
    opponentField: opp?.field,
    phase,
    isMyTurn,
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
    selectedMyFieldCard,
    allMyField,
    pendingPassive,
    pendingSpellChoice,
    sendAction: send,
    addLog,
    showSystemNotice,
    beginMulliganCinematic,
    clearPendingSpellCard: gameEvents.clearPendingSpellCard,
  });

  return {
    session, gs, announcerData, closeAnnouncer, connected, reconnecting, logs, my, opp, phase, isMyTurn,
    cardEffects: gameEvents.cardEffects,
    selectedHandIdx, selectedMulligan, selectedFieldUid, selectedHandCard, selectedMyFieldCard, detailCard,
    mulliganAnimatingIndex, mulliganCinematicCard, mulliganReplacementCard, isMulliganCinematicActive,
    actionMode, pendingSpell, pendingSpellName, pendingPassive, pendingSpellChoice, columnChoice, enemyColumns: availableColumns,
    selectedHeroKey, selectedChargeLevel, actionModeLabel, canActUids, fieldSkills, showContextPanel, killFeed: gameEvents.killFeed, dismissKillFeedItem: gameEvents.dismissKillFeedItem,
    headshotCoinTossEvent: gameEvents.headshotCoinTossEvent, completeHeadshotCoinToss: gameEvents.completeHeadshotCoinToss,
    handleHandClick: sharedActions.handleHandClick,
    handleFieldClick: sharedActions.handleFieldClick,
    handlePlace: sharedActions.handlePlace,
    prepareSkill: sharedActions.prepareSkill,
    runMulligan: sharedActions.runMulligan,
    skipMulligan: sharedActions.skipMulligan,
    completeMulliganCinematic,
    selectColumn: sharedActions.selectColumn,
    cancelColumnChoice: sharedActions.cancelColumnChoice,
    cancelPendingSpell: sharedActions.cancelPendingSpell,
    useSelectedSpell: sharedActions.useSelectedSpell,
    cancelSelectedHand: sharedActions.cancelSelectedHand,
    resolveMercy: sharedActions.resolveMercy,
    skipMercy: sharedActions.skipMercy,
    skipJetpackCat: sharedActions.skipJetpackCat,
    resolveSpellChoice: sharedActions.resolveSpellChoice,
    handleEndMainButton: sharedActions.handleEndMainButton,
    leaveGame, surrenderGame,
    submitBo3Deck, chooseBo3FirstPlayer,
    setDetailCard, setSelectedFieldUid, setActionMode, setColumnChoice, setPendingSpell, setPendingSpellName,
    duplicateTargetUid: sharedActions.duplicateTargetUid,
    duplicateTargetRole: sharedActions.duplicateTargetRole,
    duplicateTargetName: sharedActions.duplicateTargetName,
    canSelectEmptySlot: sharedActions.canSelectEmptySlot,
    handleEmptySlotSelect: sharedActions.handleEmptySlotSelect,
  };
}

export default useOnlineGameController;
