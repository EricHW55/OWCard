import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BattleLogActor, BattleLogEntry, CardVisualEffect, FieldCard, GameState, HandCard, KillFeedItem } from '../../types/game';
import { GameSocket, buildWsUrl } from '../../api/ws';
import useAnnouncerQueue from '../../hooks/useAnnouncerQueue';
import { normalizeErrorMessage, phaseLabel, phaseSubtitle } from '../../utils/ui';
import { createOnlineAdapter } from '../adapters/onlineAdapter';
import type { UnifiedGameAction } from '../gameModeAdapter';
import {
  buildHeadshotCoinFaces,
  buildOpponentSkillCue,
  buildSpectatorSkillCue,
  collectAllFieldCards,
  collectFatalUids,
  collectDamageMap,
  findFieldCardByUid,
  getHeroKey,
  getSkillDescriptionFromCard,
  pushSkillActionLogs as pushSharedSkillActionLogs,
  resolveHeadshotOutcome,
  useAnnouncerHelpers,
} from '../shared/gamePresentation';
import {
  handlePassiveTriggeredUi,
  handleSpellPlayedPlacementUi,
  pushPlacementActionLogs,
} from '../shared/onlineActionPresentation';
import {
  handleSwiftStrikeResetPresentation,
  showDeathPassiveNotice as showSharedDeathPassiveNotice,
  showPassiveNoticeFromLog as showSharedPassiveNoticeFromLog,
  showReactivePassiveFromStateDiff as showSharedReactivePassiveFromStateDiff,
} from '../shared/gameEventPresentation';
import { ONLINE_GAME_UI_PRESET } from '../shared/gameUiPreset';
import { useGameFlowState } from '../shared/gameFlowState';
import { useMulliganCinematic } from '../shared/useMulliganCinematic';
import { useSharedGameFlowActions } from '../shared/useSharedGameFlowActions';
import { DAMAGE_FLOAT_MS, DESTROY_ANIMATION_MS, HP_ANIMATION_MS } from './constants';
import { getSession } from './session';
import { mapSpectatorStateToGameState } from './spectatorState';
import type { ColumnChoice, HeadshotCoinTossEvent, KillSide } from './types';

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
  const [killFeed, setKillFeed] = useState<KillFeedItem[]>([]);
  const [headshotCoinTossEvent, setHeadshotCoinTossEvent] = useState<HeadshotCoinTossEvent | null>(null);
  const [renderGs, setRenderGs] = useState<GameState | null>(null);
  const [cardEffects, setCardEffects] = useState<Record<string, CardVisualEffect>>({});


  const wsRef = useRef<GameSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const manualCloseRef = useRef(false);
  const phaseStampRef = useRef('');
  const gsRef = useRef<GameState | null>(null);
  const pendingSpellNameRef = useRef<string | null>(null);
  const pendingSpellCardRef = useRef<any | null>(null);
  const announcerDataRef = useRef(announcerData);
  const deferredGameStateRef = useRef<any | null>(null);
  const processGameStateRef = useRef<((msg: any) => void) | null>(null);
  const headshotCinematicActiveRef = useRef(false);
  const pendingDamageMapRef = useRef<Record<string, number>>({});
  const uiTimersRef = useRef<number[]>([]);
  const pendingKillContextRef = useRef<{
    killerName: string;
    killerHeroKey?: string;
    killerIsSpell?: boolean;
    killerTeam: KillSide;
    victimTeam: KillSide;
    createdAt: number;
    fatalUids: string[];
  } | null>(null);
  const battleLogSeqRef = useRef(0);

  const pushBattleLog = useCallback((entry: Omit<BattleLogEntry, 'id'>) => {
    const id = `battle-log-${Date.now()}-${battleLogSeqRef.current++}`;
    setLogs((prev) => [...prev.slice(-199), { ...entry, id }]);
  }, []);

  const addLog = useCallback((msg: string) => {
    pushBattleLog({ type: 'system', team: 'neutral', text: msg, turn: gsRef.current?.turn });
  }, [pushBattleLog]);

  const toActor = useCallback((card: any, fallbackName?: string): BattleLogActor => ({
    name: String(card?.name || fallbackName || '?????놁쓬'),
    heroKey: getHeroKey(card),
    isSpell: !!card?.is_spell,
  }), []);

  const pushSkillActionLogs = useCallback((params: {
    team: 'my' | 'opponent';
    actorCard?: any;
    actorName?: string;
    skillName?: string;
    result: any;
    targetPool: any[];
  }) => {
    pushSharedSkillActionLogs({
      ...params,
      getTurn: () => gsRef.current?.turn,
      pushBattleLog,
      toActor,
    });
  }, [pushBattleLog, toActor]);

  const { showPhaseChange, showSystemNotice, showSkillUse, showSkillUseAfterPlacement } = useAnnouncerHelpers({
    enqueueAnnouncer,
    uiTimersRef,
    announcerDataRef,
    placementDelayMs: ONLINE_GAME_UI_PRESET.timings.placementCinematicMs,
    phaseDurationMs: ONLINE_GAME_UI_PRESET.timings.phaseChangeMs,
    systemNoticeDurationMs: ONLINE_GAME_UI_PRESET.timings.systemNoticeMs,
    skillUseDurationMs: ONLINE_GAME_UI_PRESET.timings.skillUseMs,
  });

  const queueHeadshotCoinToss = useCallback((payload: {
    actorName: string;
    skillName: string;
    heroKey: string;
    headshot: boolean;
    isMine: boolean;
    delayMs?: number;
  }) => {
    const emit = () => {
      headshotCinematicActiveRef.current = true;
      setHeadshotCoinTossEvent({
        id: Date.now() + Math.floor(Math.random() * 1000),
        actorName: payload.actorName,
        skillName: payload.skillName,
        heroKey: payload.heroKey,
        headshot: !!payload.headshot,
        faces: buildHeadshotCoinFaces(!!payload.headshot),
        isMine: payload.isMine,
      });
    };
    if ((payload.delayMs || 0) <= 0) {
      emit();
      return;
    }
    const timerId = window.setTimeout(emit, payload.delayMs || 0);
    uiTimersRef.current.push(timerId);
  }, []);

  const completeHeadshotCoinToss = useCallback(() => {
    headshotCinematicActiveRef.current = false;
    setHeadshotCoinTossEvent(null);
    const activeAnnouncer = announcerDataRef.current;
    const isBlockingSkillAnnouncer = !!activeAnnouncer && activeAnnouncer.type === 'skill' && !activeAnnouncer.nonBlocking;
    if (!isBlockingSkillAnnouncer && deferredGameStateRef.current && processGameStateRef.current) {
      const deferred = deferredGameStateRef.current;
      deferredGameStateRef.current = null;
      processGameStateRef.current(deferred);
    }
  }, []);

  const flushDeferredGameStateIfReady = useCallback(() => {
    const activeAnnouncer = announcerDataRef.current;
    const isBlockingSkillAnnouncer = !!activeAnnouncer && activeAnnouncer.type === 'skill' && !activeAnnouncer.nonBlocking;
    if (isBlockingSkillAnnouncer) return;
    if (headshotCinematicActiveRef.current) return;
    if (!deferredGameStateRef.current || !processGameStateRef.current) return;
    const deferred = deferredGameStateRef.current;
    deferredGameStateRef.current = null;
    processGameStateRef.current(deferred);
  }, []);

  useEffect(() => {
    announcerDataRef.current = announcerData;
    flushDeferredGameStateIfReady();
  }, [announcerData, flushDeferredGameStateIfReady]);

  const pushKillFeedByUids = useCallback((uids: string[], nextState: any) => {
    const context = pendingKillContextRef.current;
    if (!context || uids.length === 0) return;
    const prev = gsRef.current;
    if (!prev) return;
    const prevAllCards = [
      ...(prev?.my_state?.field?.main || []),
      ...(prev?.my_state?.field?.side || []),
      ...(prev?.opponent_state?.field?.main || []),
      ...(prev?.opponent_state?.field?.side || []),
    ];
    const nextAllCards = [
      ...(nextState?.my_state?.field?.main || []),
      ...(nextState?.my_state?.field?.side || []),
      ...(nextState?.opponent_state?.field?.main || []),
      ...(nextState?.opponent_state?.field?.side || []),
    ];
    const nextAlive = new Set(nextAllCards.map((card: any) => card.uid));
    const victimCards = uids
        .map((uid) => prevAllCards.find((card: any) => card.uid === uid))
        .filter((card: any) => !!card && !nextAlive.has(card.uid));

    if (victimCards.length === 0) return;
    victimCards.forEach((victim: any) => {
      pushBattleLog({
        type: 'destroy',
        team: context.victimTeam === 'my' ? 'my' : 'opponent',
        turn: gsRef.current?.turn,
        actor: toActor(victim, victim?.name || '?곸썒'),
        text: `${victim?.name || '?곸썒'} ?뚭눼`,
      });
    });

    setKillFeed((prevFeed) => {
      const createdAt = Date.now();
      const items = victimCards.map((victim: any, idx: number): KillFeedItem => ({
        id: `${createdAt}-${victim.uid}-${idx}`,
        killer: {
          name: context.killerName,
          hero_key: context.killerHeroKey,
          is_spell: context.killerIsSpell,
          team: context.killerTeam,
        },
        victim: {
          name: victim.name || '?곸썒',
          hero_key: getHeroKey(victim),
          is_spell: !!victim?.is_spell,
          team: context.victimTeam,
        },
        createdAt: createdAt + idx,
        duration: 5000,
      }));
      return [...items, ...prevFeed].slice(0, 6);
    });
  }, [pushBattleLog, toActor]);

  const dismissKillFeedItem = useCallback((id: string) => {
    setKillFeed((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const showPassiveNoticeFromLog = useCallback((entry: any, owner: 'my' | 'opponent') => {
    showSharedPassiveNoticeFromLog({
      entry,
      owner,
      gameState: gsRef.current,
      showSkillUseAfterPlacement,
      showSystemNotice,
    });
  }, [showSkillUseAfterPlacement, showSystemNotice]);

  const showDeathPassiveNotice = useCallback((result: any) => {
    showSharedDeathPassiveNotice({
      result,
      gameState: gsRef.current,
      showSkillUse,
      showSystemNotice,
    });
  }, [showSkillUse, showSystemNotice]);

  const showReactivePassiveFromStateDiff = useCallback((prevState: any, nextState: any) => {
    showSharedReactivePassiveFromStateDiff({
      prevState,
      nextState,
      showSkillUse,
    });
  }, [showSkillUse]);
  useEffect(() => { gsRef.current = gs; }, [gs]);
  useEffect(() => { pendingSpellNameRef.current = pendingSpellName; }, [pendingSpellName]);

  useEffect(() => {
    if (!gs) return;
    const stamp = `${gs.round}-${gs.turn}-${gs.phase}-${gs.is_my_turn ? 'me' : 'opp'}`;
    if (phaseStampRef.current === stamp) return;
    phaseStampRef.current = stamp;
    showPhaseChange(phaseLabel(gs.phase), phaseSubtitle(gs.phase, gs.is_my_turn), 1600);
  }, [gs, showPhaseChange]);

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
          addLog(wasReconnecting ? '재연결 성공' : '소켓 연결됨');
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
            addLog('소켓 끊김 - ' + Math.round(delay / 1000) + '초 후 재연결 시도');
            reconnectTimerRef.current = window.setTimeout(() => {
              reconnectTimerRef.current = null;
              connectWs();
            }, delay);
          }
        }),
        ws.on('pong', () => {}),
        ws.on('game_state', (msg: any) => {
          const processGameState = (gameStateMsg: any) => {
            const prevState = gsRef.current;
            const prevTurn = Number(prevState?.turn ?? 0);
            const nextTurn = Number(gameStateMsg?.state?.turn ?? 0);
            if (nextTurn > 0 && nextTurn !== prevTurn) {
              pushBattleLog({
                type: 'turn',
                team: 'neutral',
                turn: nextTurn,
                text: nextTurn + '턴',
              });
            }
            if (pendingKillContextRef.current?.createdAt) {
              const pendingUids = pendingKillContextRef.current.fatalUids || [];
              if (pendingUids.length > 0) pushKillFeedByUids(pendingUids, gameStateMsg.state);
              pendingKillContextRef.current = null;
            }
            showReactivePassiveFromStateDiff(prevState, gameStateMsg.state);
            setGs(gameStateMsg.state);
            setRenderGs((prevRender) => {
              if (!prevRender) return gameStateMsg.state;
              const prevCards = collectAllFieldCards(prevRender);
              const nextCards = collectAllFieldCards(gameStateMsg.state);
              const nextUidSet = new Set(nextCards.map((c: any) => c.uid));
              const removedCards = prevCards.filter((c: any) => !nextUidSet.has(c.uid));
              const hasRemoved = removedCards.length > 0;
              if (!hasRemoved) return gameStateMsg.state;

              const ghostBySide = (sideKey: 'my_state' | 'opponent_state') => {
                const baseMain = [...(gameStateMsg.state as any)?.[sideKey]?.field?.main || []];
                const baseSide = [...(gameStateMsg.state as any)?.[sideKey]?.field?.side || []];
                const prevMain = [...(prevRender as any)?.[sideKey]?.field?.main || []];
                const prevSide = [...(prevRender as any)?.[sideKey]?.field?.side || []];
                const aliveMain = new Set(baseMain.map((c: any) => c.uid));
                const aliveSide = new Set(baseSide.map((c: any) => c.uid));
                const deadMain = prevMain.filter((c: any) => !aliveMain.has(c.uid)).map((c: any) => ({ ...c, current_hp: 0 }));
                const deadSide = prevSide.filter((c: any) => !aliveSide.has(c.uid)).map((c: any) => ({ ...c, current_hp: 0 }));
                return { main: [...baseMain, ...deadMain], side: [...baseSide, ...deadSide] };
              };

              const killDelay = window.setTimeout(() => setRenderGs(gameStateMsg.state), DESTROY_ANIMATION_MS + 50);
              uiTimersRef.current.push(killDelay);
              return {
                ...gameStateMsg.state,
                my_state: { ...gameStateMsg.state.my_state, field: ghostBySide('my_state') },
                opponent_state: { ...gameStateMsg.state.opponent_state, field: ghostBySide('opponent_state') },
              };
            });

            const damageMap = pendingDamageMapRef.current;
            const prevAll = collectAllFieldCards(prevState);
            const nextAll = collectAllFieldCards(gameStateMsg.state);
            const nextByUid = new Map(nextAll.map((c: any) => [c.uid, c]));
            const removedUidSet = new Set(prevAll.map((c: any) => c.uid).filter((uid) => !nextByUid.has(uid)));
            const effectPatch: Record<string, CardVisualEffect> = {};
            Object.entries(damageMap).forEach(([uid, damage]) => {
              effectPatch[uid] = {
                floatingDamage: damage,
                hpTransitionMs: HP_ANIMATION_MS,
                destroying: removedUidSet.has(uid),
              };
            });
            removedUidSet.forEach((uid) => {
              if (effectPatch[uid]) return;
              effectPatch[uid] = {
                hpTransitionMs: HP_ANIMATION_MS,
                destroying: true,
              };
            });
            if (Object.keys(effectPatch).length > 0) {
              setCardEffects((prev) => ({ ...prev, ...effectPatch }));
              const clearTimer = window.setTimeout(() => {
                setCardEffects((prev) => {
                  const next = { ...prev };
                  Object.keys(effectPatch).forEach((uid) => delete next[uid]);
                  return next;
                });
              }, Math.max(DAMAGE_FLOAT_MS, DESTROY_ANIMATION_MS) + 120);
              uiTimersRef.current.push(clearTimer);
            }
            pendingDamageMapRef.current = {};
            const serverPendingPassive = gameStateMsg?.state?.my_state?.pending_passive ?? gameStateMsg?.state?.my_state?.pendingPassive ?? null;
            const serverPendingSpellChoice = gameStateMsg?.state?.my_state?.pending_spell ?? gameStateMsg?.state?.my_state?.pendingSpell ?? null;
            if (serverPendingPassive) setLocalPendingPassive(null);
            if (serverPendingSpellChoice) setLocalPendingSpellChoice(null);
            if (!serverPendingPassive && !serverPendingSpellChoice && gameStateMsg?.state?.phase !== 'placement') {
              setLocalPendingPassive(null);
              setLocalPendingSpellChoice(null);
              setColumnChoice(null);
            }
          };
          processGameStateRef.current = processGameState;
          const activeAnnouncer = announcerDataRef.current;
          const isBlockingSkillAnnouncer = !!activeAnnouncer && activeAnnouncer.type === 'skill' && !activeAnnouncer.nonBlocking;
          if (isBlockingSkillAnnouncer || headshotCinematicActiveRef.current) {
            deferredGameStateRef.current = msg;
            return;
          }
          processGameState(msg);
        }),
        ws.on('spectator_state', (msg: any) => {
          const mapped = mapSpectatorStateToGameState(msg?.state);
          if (!mapped) return;
          setGs(mapped);
          setRenderGs(mapped);
        }),
        ws.on('game_action', (msg: any) => {
          pendingDamageMapRef.current = collectDamageMap(msg?.result || {});
          if (isSpectator) {
            const cue = buildSpectatorSkillCue(msg, gsRef.current);
            if (cue) {
              showSkillUse({
                skillName: cue.title,
                description: cue.description || '',
                heroKey: cue.heroKey || '',
                imageName: cue.imageName,
                subtitle: cue.subtitle,
                isSpell: !!cue.isSpell,
                duration: 3200,
              });
            }
          }
          const mapped = mapSpectatorStateToGameState(msg?.spectator_state);
          if (!mapped) return;
          setGs(mapped);
          setRenderGs(mapped);
        }),
        ws.on('action_result', (msg: any) => {
          const result = msg?.result || {};
          pendingDamageMapRef.current = collectDamageMap(result);
          const latestMyState = gsRef.current?.my_state as any;
          const myHand = latestMyState?.hand || [];
          const myCasterCard = findFieldCardByUid(latestMyState, msg?.caster_uid) || result?.caster || null;
          const spellName = result?.card?.name || result?.skill_name || result?.skill || myHand.find((c: any) => c.hero_key === result?.hero_key)?.name || pendingSpellNameRef.current || '?ㅽ궗 移대뱶';
          const actorName = myCasterCard?.name || result?.caster_name || result?.caster?.name || result?.card?.name || '?곸썒';
          const resolvedSkillName = result?.skill_name || result?.skill || null;
          const fatalUids = Array.from(collectFatalUids(result));
          const isSpellKill = msg.action === 'execute_spell' || !!result?.card?.is_spell || String(result?.hero_key || '').startsWith('spell_');
          const killHeroKey = isSpellKill
              ? (result?.hero_key || result?.card?.hero_key || '')
              : (getHeroKey(myCasterCard) || result?.caster?.hero_key || '');
          if (msg.action === 'use_skill' || msg.action === 'execute_spell') {
            const targetPool = [
              ...(gsRef.current?.opponent_state?.field?.main || []),
              ...(gsRef.current?.opponent_state?.field?.side || []),
              ...(gsRef.current?.my_state?.field?.main || []),
              ...(gsRef.current?.my_state?.field?.side || []),
            ];
            pushSkillActionLogs({
              team: 'my',
              actorCard: myCasterCard || result?.card,
              actorName,
              skillName: resolvedSkillName || spellName,
              result,
              targetPool,
            });
          }
          pendingKillContextRef.current = {
            killerName: actorName,
            killerHeroKey: killHeroKey,
            killerIsSpell: isSpellKill,
            killerTeam: 'my',
            victimTeam: 'opponent',
            createdAt: Date.now(),
            fatalUids,
          };
          if (msg.action === 'end_turn') {
            pushBattleLog({ type: 'turn_end', team: 'my', turn: gsRef.current?.turn, text: '????醫낅즺' });
          }
          pushPlacementActionLogs({
            action: msg.action,
            result,
            team: 'my',
            turn: gsRef.current?.turn,
            myHand,
            spellName,
            toActor,
            pushBattleLog,
          });

          handleSpellPlayedPlacementUi({
            action: msg.action,
            result,
            spellName: resolvedSkillName || spellName,
            addLog,
            showSystemNotice,
            setPendingSpellCard: (card) => {
              pendingSpellCardRef.current = card;
            },
            setPendingSpell,
            setPendingSpellName,
            setActionMode,
            setColumnChoice,
            setLocalPendingSpellChoice,
            resetDuplicateTarget: () => {},
            showSkillUse,
            myHand,
            uiPreset: ONLINE_GAME_UI_PRESET,
          });

          handlePassiveTriggeredUi({
            result,
            actorName,
            myCasterCard,
            msgHeroKey: msg?.hero_key,
            addLog,
            showSystemNotice,
            showSkillUseAfterPlacement,
            setLocalPendingPassive,
            uiPreset: ONLINE_GAME_UI_PRESET,
          });
          if (msg.action === 'resolve_passive_choice') {
            setLocalPendingPassive(null);
            if (result?.card?.name) {
              addLog('패시브 처리: ' + result.card.name);
              showSystemNotice(result.card.name, '패시브 처리', 1300);
            }
          }

          [ ...(result?.turn_start_logs || []), ...(result?.turn_end_logs || []) ].forEach((entry: any) => showPassiveNoticeFromLog(entry, 'my'));
          showDeathPassiveNotice(result);

          if (msg.action === 'use_skill' && resolvedSkillName) {
            const casterCard = myCasterCard;
            const casterHeroKey = getHeroKey(casterCard) || String(result?.caster_hero_key || result?.caster?.hero_key || msg?.hero_key || '').toLowerCase();
            const headshotOutcome = resolveHeadshotOutcome(result);
            const shouldShowHeadshotCoinToss =
                typeof headshotOutcome === 'boolean'
                && (casterHeroKey === 'widowmaker' || casterHeroKey === 'hanzo');
            const handledSwiftStrikeReset = handleSwiftStrikeResetPresentation({
              result,
              msg,
              casterCard,
              actorName,
              resolvedSkillName,
              showSkillUse,
              setSelectedHandIdx,
              setColumnChoice,
              setSelectedFieldUid,
              setActionMode,
              addLog,
            });
            if (!handledSwiftStrikeReset) {
              showSkillUse({
                skillName: resolvedSkillName,
                description: getSkillDescriptionFromCard(casterCard, msg?.skill_key || result?.skill_key || result?.skill),
                heroKey: getHeroKey(casterCard) || String(result?.caster?.hero_key || msg?.hero_key || ''),
                imageName: casterCard?.name || result?.caster_name || result?.caster?.name || actorName,
                subtitle: result?.caster_name || casterCard?.name || actorName,
                isSpell: false,
                duration: 3200,
                onDone: shouldShowHeadshotCoinToss
                    ? () => {
                      queueHeadshotCoinToss({
                        actorName: result?.caster_name || casterCard?.name || actorName,
                        skillName: resolvedSkillName,
                        heroKey: casterHeroKey,
                        headshot: !!headshotOutcome,
                        isMine: true,
                      });
                    }
                    : undefined,
              });
            }
          }
          if (msg.action === 'execute_spell') {
            setLocalPendingSpellChoice(null);
            if (resolvedSkillName && !result?.hidden) {
              const spellCard = myHand.find((c: any) => c.hero_key === result?.hero_key)
                  || result?.card
                  || pendingSpellCardRef.current;
              showSkillUse({ skillName: resolvedSkillName, description: getSkillDescriptionFromCard(spellCard), heroKey: result?.hero_key || spellCard?.hero_key || '', imageName: spellCard?.name || resolvedSkillName, isSpell: true, duration: 3200 });
            }
            pendingSpellCardRef.current = null;
          }
          if (msg.action === 'execute_spell' && typeof result?.rescued === 'string') showSystemNotice(result.rescued, 'TRASH 복귀', 1400);
          if (msg.action === 'execute_spell' && typeof result?.drawn_card === 'string') showSystemNotice(result.drawn_card, '드로우', 1400);
        }),
        ws.on('opponent_action', (msg: any) => {
          const result = msg?.result || {};
          pendingDamageMapRef.current = collectDamageMap(result);
          const oppState = gsRef.current?.opponent_state as any;
          const opponentCasterCard = findFieldCardByUid(oppState, msg?.caster_uid) || result?.caster || null;
          const opponentCasterHeroKey = getHeroKey(opponentCasterCard);
          const cue = buildOpponentSkillCue(msg, gsRef.current?.opponent_state, opponentCasterHeroKey);
          const opponentName = opponentCasterCard?.name || result?.caster_name || cue?.subtitle?.replace(/ ?ъ슜$/, '') || '?곷?';
          const opponentHeroKey = getHeroKey(opponentCasterCard) || String(result?.caster_hero_key || result?.caster?.hero_key || msg?.hero_key || '').toLowerCase();
          const headshotOutcome = resolveHeadshotOutcome(result);
          const shouldShowOpponentHeadshotCoinToss =
              msg.action === 'use_skill'
              && typeof headshotOutcome === 'boolean'
              && (opponentHeroKey === 'widowmaker' || opponentHeroKey === 'hanzo');
          if (msg.action === 'use_skill' || msg.action === 'execute_spell') {
            const targetPool = [
              ...(gsRef.current?.my_state?.field?.main || []),
              ...(gsRef.current?.my_state?.field?.side || []),
              ...(gsRef.current?.opponent_state?.field?.main || []),
              ...(gsRef.current?.opponent_state?.field?.side || []),
            ];
            pushSkillActionLogs({
              team: 'opponent',
              actorCard: opponentCasterCard || result?.card,
              actorName: opponentName,
              skillName: result?.skill_name || result?.skill || cue?.title || '?ㅽ궗',
              result,
              targetPool,
            });
          }
          if (cue) showSkillUse({
            skillName: cue.title,
            description: cue.description || '',
            heroKey: cue.heroKey || '',
            imageName: cue.imageName,
            subtitle: cue.subtitle,
            isSpell: !!cue.isSpell,
            duration: 3200,
            onDone: shouldShowOpponentHeadshotCoinToss
                ? () => {
                  queueHeadshotCoinToss({
                    actorName: result?.caster_name || opponentCasterCard?.name || opponentName,
                    skillName: result?.skill_name || result?.skill || cue.title || '?ㅽ궗',
                    heroKey: opponentHeroKey,
                    headshot: !!headshotOutcome,
                    isMine: false,
                  });
                }
                : undefined,
          });
          if (shouldShowOpponentHeadshotCoinToss && !cue) {
            queueHeadshotCoinToss({
              actorName: result?.caster_name || opponentCasterCard?.name || opponentName,
              skillName: result?.skill_name || result?.skill || '?ㅽ궗',
              heroKey: opponentHeroKey,
              headshot: !!headshotOutcome,
              isMine: false,
            });
          }
          const fatalUids = Array.from(collectFatalUids(result));
          const isSpellKill = cue?.isSpell || msg.action === 'execute_spell' || !!result?.card?.is_spell || String(result?.hero_key || '').startsWith('spell_');
          const killHeroKey = isSpellKill
              ? (cue?.heroKey || result?.hero_key || result?.card?.hero_key || '')
              : (getHeroKey(opponentCasterCard) || result?.caster?.hero_key || '');
          pendingKillContextRef.current = {
            killerName: opponentName,
            killerHeroKey: killHeroKey,
            killerIsSpell: isSpellKill,
            killerTeam: 'opponent',
            victimTeam: 'my',
            createdAt: Date.now(),
            fatalUids,
          };
          if (msg.action === 'end_turn') {
            pushBattleLog({ type: 'turn_end', team: 'opponent', turn: gsRef.current?.turn, text: '?곷? ??醫낅즺' });
          }
          pushPlacementActionLogs({
            action: msg.action,
            result,
            team: 'opponent',
            turn: gsRef.current?.turn,
            toActor,
            pushBattleLog,
          });
          if (result?.passive_triggered?.passive) {
            const passiveSource = findFieldCardByUid(gsRef.current?.opponent_state, result?.card_uid)
                || opponentCasterCard
                || result?.caster
                || result?.card
                || null;
            showSkillUseAfterPlacement({
              skillName: result.passive_triggered.passive,
              subtitle: '상대 패시브',
              description: result?.passive_triggered?.message || '',
              heroKey: getHeroKey(passiveSource) || opponentCasterHeroKey || result?.card?.hero_key || result?.hero_key || '',
              imageName: passiveSource?.name || result?.caster_name || opponentCasterCard?.name || '?곷?',
              isSpell: false,
              duration: 3000,
            });
          }
          [ ...(result?.turn_start_logs || []), ...(result?.turn_end_logs || []) ].forEach((entry: any) => showPassiveNoticeFromLog(entry, 'opponent'));
          showDeathPassiveNotice(result);
        }),
        ws.on('phase_change', (msg: any) => addLog(msg.message || ('phase ' + msg.phase))),
        ws.on('game_over', (msg: any) => {
          const isWinner = !isSpectator && Number(msg?.winner) === Number(session?.player_id);
          addLog('게임 종료: ' + (msg.winner_name ?? msg.winner));
          setReconnecting(false);
          showPhaseChange(
              isSpectator ? '게임 종료' : (isWinner ? '승리' : '패배'),
              String(msg.winner_name ?? msg.winner ?? '승자 미정'),
              isSpectator ? 2000 : 2800,
          );
        }),
        ws.on('bo3_round_end', (msg: any) => {
          const round = Number(msg?.round || 0);
          const winnerName = msg?.winner_name || ('P' + msg?.winner);
          const nextRound = Number(msg?.next_round || round + 1);
          addLog('BO3 ' + round + '라운드 종료 - ' + winnerName + ' 승리. ' + nextRound + '라운드 준비');
          showPhaseChange('라운드 종료', winnerName + ' 승리 - 다음 라운드 준비', 2200);
        }),
        ws.on('bo3_round_started', (msg: any) => {
          const round = Number(msg?.round || 0);
          addLog('BO3 ' + round + '라운드 시작');
          showPhaseChange(round + '라운드', '전투 시작', 1600);
        }),
        ws.on('opponent_disconnected', () => addLog('상대 연결 끊김')),
        ws.on('player_reconnected', () => addLog('상대가 재연결했습니다')),
        ws.on('error', (msg: any) => {
          const shortMessage = normalizeErrorMessage(msg?.message);
          addLog('오류: ' + shortMessage);
          showSystemNotice('행동 불가', shortMessage, 2600);
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
  }, [session, gameId, isSpectator, addLog, showPhaseChange, showSkillUse, showSkillUseAfterPlacement, showSystemNotice, showPassiveNoticeFromLog, showDeathPassiveNotice, pushKillFeedByUids, showReactivePassiveFromStateDiff, queueHeadshotCoinToss, pushBattleLog, pushSkillActionLogs, toActor]);

  const send = useCallback((data: Record<string, unknown>) => {
    if (isSpectator) return;
    if (wsRef.current?.connected) { wsRef.current.send(data); return; }
    addLog('?꾩넚 ?ㅽ뙣(誘몄뿰寃?');
  }, [addLog, isSpectator]);

  const onlineAdapter = useMemo(() => createOnlineAdapter({
    getViewModel: () => ({
      mode: 'online',
      gameState: gs,
      phase: gs?.phase || 'loading',
      isMyTurn: gs?.is_my_turn,
      logs,
      killFeed,
    }),
    sendAction: async (action: UnifiedGameAction) => {
      send(action as Record<string, unknown>);
    },
  }), [gs, logs, killFeed, send]);

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

  const displayState = renderGs || gs;
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
    clearPendingSpellCard: () => {
      pendingSpellCardRef.current = null;
    },
  });

  return {
    session, gs, announcerData, closeAnnouncer, connected, reconnecting, logs, my, opp, phase, isMyTurn,
    cardEffects,
    selectedHandIdx, selectedMulligan, selectedFieldUid, selectedHandCard, selectedMyFieldCard, detailCard,
    mulliganAnimatingIndex, mulliganCinematicCard, mulliganReplacementCard, isMulliganCinematicActive,
    actionMode, pendingSpell, pendingSpellName, pendingPassive, pendingSpellChoice, columnChoice, enemyColumns: availableColumns,
    selectedHeroKey, selectedChargeLevel, actionModeLabel, canActUids, fieldSkills, showContextPanel, killFeed, dismissKillFeedItem,
    headshotCoinTossEvent, completeHeadshotCoinToss,
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
