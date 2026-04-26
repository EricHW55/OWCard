import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BattleLogActor,
  BattleLogEntry,
  CardVisualEffect,
  GameState,
  KillFeedItem,
} from '../../types/game';
import {
  buildHeadshotCoinFaces,
  buildOpponentSkillCue,
  buildSpectatorSkillCue,
  collectAllFieldCards,
  collectDamageMap,
  collectFatalUids,
  findFieldCardByUid,
  getHeroKey,
  getSkillDescriptionFromCard,
  pushSkillActionLogs as pushSharedSkillActionLogs,
  resolveHeadshotOutcome,
} from './gamePresentation';
import {
  handlePassiveTriggeredUi,
  handleSpellPlayedPlacementUi,
  pushPlacementActionLogs,
} from './onlineActionPresentation';
import {
  handleSwiftStrikeResetPresentation,
  showDeathPassiveNotice as showSharedDeathPassiveNotice,
  showPassiveNoticeFromLog as showSharedPassiveNoticeFromLog,
  showReactivePassiveFromStateDiff as showSharedReactivePassiveFromStateDiff,
} from './gameEventPresentation';
import { ONLINE_GAME_UI_PRESET, type GameUiPreset } from './gameUiPreset';

type KillSide = 'my' | 'opponent';

type PushBattleLog = (entry: Omit<BattleLogEntry, 'id'>) => void;
type ToActor = (card: any, fallbackName?: string) => BattleLogActor;
type ShowSystemNotice = (title: string, subtitle?: string, duration?: number) => void;
type ShowPhaseChange = (title: string, subtitle: string, duration?: number) => void;
type ShowSkillUsePayload = {
  skillName: string;
  subtitle?: string;
  description?: string;
  heroKey?: string;
  imageName?: string;
  isSpell?: boolean;
  duration?: number;
  nonBlocking?: boolean;
  onDone?: () => void;
};
type ShowSkillUse = (payload: ShowSkillUsePayload) => void;

export type HeadshotCoinTossEvent = {
  id: number;
  actorName: string;
  skillName: string;
  heroKey: string;
  headshot: boolean;
  faces: ['front' | 'back', 'front' | 'back'];
  isMine: boolean;
};

export type ServerGameEventPresentationParams = {
  gameState: GameState | null;
  setGameState: (state: GameState | null) => void;
  gameStateRef: React.MutableRefObject<GameState | null>;
  announcerData: any;
  announcerDataRef: React.MutableRefObject<any>;
  uiTimersRef: React.MutableRefObject<number[]>;
  pendingSpellName: string | null;
  addLog: (message: string) => void;
  pushBattleLog: PushBattleLog;
  toActor: ToActor;
  showPhaseChange: ShowPhaseChange;
  showSystemNotice: ShowSystemNotice;
  showSkillUse: ShowSkillUse;
  showSkillUseAfterPlacement: ShowSkillUse;
  setSelectedHandIdx: (value: number | null) => void;
  setSelectedFieldUid: (value: string | null) => void;
  setActionMode: (value: string | null) => void;
  setColumnChoice: (value: any | null) => void;
  setPendingSpell: (value: string | null) => void;
  setPendingSpellName: (value: string | null) => void;
  setLocalPendingPassive: (value: any | null) => void;
  setLocalPendingSpellChoice: (value: any | null) => void;
  phaseLabel: (phase: any) => string;
  phaseSubtitle: (phase: any, isMyTurn?: boolean) => string;
  mapSpectatorState?: (state: any) => GameState | null;
  uiPreset?: GameUiPreset;
  hpAnimationMs?: number;
  destroyAnimationMs?: number;
  damageFloatMs?: number;
};

export function useServerGameEventPresentation(params: ServerGameEventPresentationParams) {
  const {
    gameState,
    setGameState,
    gameStateRef,
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
    mapSpectatorState,
    uiPreset = ONLINE_GAME_UI_PRESET,
    hpAnimationMs = 500,
    destroyAnimationMs = 500,
    damageFloatMs = 800,
  } = params;

  const [renderGameState, setRenderGameState] = useState<GameState | null>(null);
  const [cardEffects, setCardEffects] = useState<Record<string, CardVisualEffect>>({});
  const [killFeed, setKillFeed] = useState<KillFeedItem[]>([]);
  const [headshotCoinTossEvent, setHeadshotCoinTossEvent] = useState<HeadshotCoinTossEvent | null>(null);

  const phaseStampRef = useRef('');
  const pendingSpellNameRef = useRef<string | null>(pendingSpellName);
  const pendingSpellCardRef = useRef<any | null>(null);
  const deferredGameStateRef = useRef<any | null>(null);
  const processGameStateRef = useRef<((msg: any) => void) | null>(null);
  const headshotCinematicActiveRef = useRef(false);
  const pendingDamageMapRef = useRef<Record<string, number>>({});
  const pendingKillContextRef = useRef<{
    killerName: string;
    killerHeroKey?: string;
    killerIsSpell?: boolean;
    killerTeam: KillSide;
    victimTeam: KillSide;
    createdAt: number;
    fatalUids: string[];
  } | null>(null);

  const pushSkillActionLogs = useCallback((actionParams: {
    team: 'my' | 'opponent';
    actorCard?: any;
    actorName?: string;
    skillName?: string;
    result: any;
    targetPool: any[];
  }) => {
    pushSharedSkillActionLogs({
      ...actionParams,
      getTurn: () => gameStateRef.current?.turn,
      pushBattleLog,
      toActor,
    });
  }, [gameStateRef, pushBattleLog, toActor]);

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
  }, [uiTimersRef]);

  const flushDeferredGameStateIfReady = useCallback(() => {
    const activeAnnouncer = announcerDataRef.current;
    const isBlockingSkillAnnouncer = !!activeAnnouncer && activeAnnouncer.type === 'skill' && !activeAnnouncer.nonBlocking;
    if (isBlockingSkillAnnouncer) return;
    if (headshotCinematicActiveRef.current) return;
    if (!deferredGameStateRef.current || !processGameStateRef.current) return;
    const deferred = deferredGameStateRef.current;
    deferredGameStateRef.current = null;
    processGameStateRef.current(deferred);
  }, [announcerDataRef]);

  const completeHeadshotCoinToss = useCallback(() => {
    headshotCinematicActiveRef.current = false;
    setHeadshotCoinTossEvent(null);
    flushDeferredGameStateIfReady();
  }, [flushDeferredGameStateIfReady]);

  const pushKillFeedByUids = useCallback((uids: string[], nextState: any) => {
    const context = pendingKillContextRef.current;
    if (!context || uids.length === 0) return;
    const prev = gameStateRef.current;
    if (!prev) return;
    const prevAllCards = collectAllFieldCards(prev);
    const nextAllCards = collectAllFieldCards(nextState);
    const nextAlive = new Set(nextAllCards.map((card: any) => card.uid));
    const victimCards = uids
        .map((uid) => prevAllCards.find((card: any) => card.uid === uid))
        .filter((card: any) => !!card && !nextAlive.has(card.uid));

    if (victimCards.length === 0) return;
    victimCards.forEach((victim: any) => {
      pushBattleLog({
        type: 'destroy',
        team: context.victimTeam === 'my' ? 'my' : 'opponent',
        turn: gameStateRef.current?.turn,
        actor: toActor(victim, victim?.name || '알 수 없음'),
        text: `${victim?.name || '알 수 없음'} 파괴됨`,
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
          name: victim.name || '알 수 없음',
          hero_key: getHeroKey(victim),
          is_spell: !!victim?.is_spell,
          team: context.victimTeam,
        },
        createdAt: createdAt + idx,
        duration: 5000,
      }));
      return [...items, ...prevFeed].slice(0, 6);
    });
  }, [gameStateRef, pushBattleLog, toActor]);

  const dismissKillFeedItem = useCallback((id: string) => {
    setKillFeed((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const showPassiveNoticeFromLog = useCallback((entry: any, owner: 'my' | 'opponent') => {
    showSharedPassiveNoticeFromLog({
      entry,
      owner,
      gameState: gameStateRef.current,
      showSkillUseAfterPlacement,
      showSystemNotice,
    });
  }, [gameStateRef, showSkillUseAfterPlacement, showSystemNotice]);

  const showDeathPassiveNotice = useCallback((result: any) => {
    showSharedDeathPassiveNotice({
      result,
      gameState: gameStateRef.current,
      showSkillUse,
      showSystemNotice,
    });
  }, [gameStateRef, showSkillUse, showSystemNotice]);

  const showReactivePassiveFromStateDiff = useCallback((prevState: any, nextState: any) => {
    showSharedReactivePassiveFromStateDiff({
      prevState,
      nextState,
      showSkillUse,
    });
  }, [showSkillUse]);

  const applyGameState = useCallback((nextState: GameState) => {
    const prevState = gameStateRef.current;
    const prevTurn = Number(prevState?.turn ?? 0);
    const nextTurn = Number(nextState?.turn ?? 0);
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
      if (pendingUids.length > 0) pushKillFeedByUids(pendingUids, nextState);
      pendingKillContextRef.current = null;
    }
    showReactivePassiveFromStateDiff(prevState, nextState);
    setGameState(nextState);
    setRenderGameState((prevRender) => {
      if (!prevRender) return nextState;
      const prevCards = collectAllFieldCards(prevRender);
      const nextCards = collectAllFieldCards(nextState);
      const nextUidSet = new Set(nextCards.map((card: any) => card.uid));
      const removedCards = prevCards.filter((card: any) => !nextUidSet.has(card.uid));
      if (removedCards.length === 0) return nextState;

      const ghostBySide = (sideKey: 'my_state' | 'opponent_state') => {
        const baseMain = [...((nextState as any)?.[sideKey]?.field?.main || [])];
        const baseSide = [...((nextState as any)?.[sideKey]?.field?.side || [])];
        const prevMain = [...((prevRender as any)?.[sideKey]?.field?.main || [])];
        const prevSide = [...((prevRender as any)?.[sideKey]?.field?.side || [])];
        const aliveMain = new Set(baseMain.map((card: any) => card.uid));
        const aliveSide = new Set(baseSide.map((card: any) => card.uid));
        const deadMain = prevMain.filter((card: any) => !aliveMain.has(card.uid)).map((card: any) => ({ ...card, current_hp: 0 }));
        const deadSide = prevSide.filter((card: any) => !aliveSide.has(card.uid)).map((card: any) => ({ ...card, current_hp: 0 }));
        return { main: [...baseMain, ...deadMain], side: [...baseSide, ...deadSide] };
      };

      const killDelay = window.setTimeout(() => setRenderGameState(nextState), destroyAnimationMs + 50);
      uiTimersRef.current.push(killDelay);
      return {
        ...nextState,
        my_state: { ...nextState.my_state, field: ghostBySide('my_state') },
        opponent_state: { ...nextState.opponent_state, field: ghostBySide('opponent_state') },
      };
    });

    const damageMap = pendingDamageMapRef.current;
    const prevAll = collectAllFieldCards(prevState);
    const nextAll = collectAllFieldCards(nextState);
    const nextByUid = new Map(nextAll.map((card: any) => [card.uid, card]));
    const removedUidSet = new Set(prevAll.map((card: any) => card.uid).filter((uid) => !nextByUid.has(uid)));
    const effectPatch: Record<string, CardVisualEffect> = {};
    Object.entries(damageMap).forEach(([uid, damage]) => {
      effectPatch[uid] = {
        floatingDamage: damage,
        hpTransitionMs: hpAnimationMs,
        destroying: removedUidSet.has(uid),
      };
    });
    removedUidSet.forEach((uid) => {
      if (effectPatch[uid]) return;
      effectPatch[uid] = {
        hpTransitionMs: hpAnimationMs,
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
      }, Math.max(damageFloatMs, destroyAnimationMs) + 120);
      uiTimersRef.current.push(clearTimer);
    }
    pendingDamageMapRef.current = {};
    const serverPendingPassive = (nextState as any)?.my_state?.pending_passive ?? (nextState as any)?.my_state?.pendingPassive ?? null;
    const serverPendingSpellChoice = (nextState as any)?.my_state?.pending_spell ?? (nextState as any)?.my_state?.pendingSpell ?? null;
    if (serverPendingPassive) setLocalPendingPassive(null);
    if (serverPendingSpellChoice) setLocalPendingSpellChoice(null);
    if (!serverPendingPassive && !serverPendingSpellChoice && nextState?.phase !== 'placement') {
      setLocalPendingPassive(null);
      setLocalPendingSpellChoice(null);
      setColumnChoice(null);
    }
  }, [
    damageFloatMs,
    destroyAnimationMs,
    gameStateRef,
    hpAnimationMs,
    pushBattleLog,
    pushKillFeedByUids,
    setColumnChoice,
    setGameState,
    setLocalPendingPassive,
    setLocalPendingSpellChoice,
    showReactivePassiveFromStateDiff,
    uiTimersRef,
  ]);

  const handleGameStateMessage = useCallback((msg: any) => {
    const processGameState = (gameStateMsg: any) => {
      if (!gameStateMsg?.state) return;
      applyGameState(gameStateMsg.state);
    };
    processGameStateRef.current = processGameState;
    const activeAnnouncer = announcerDataRef.current;
    const isBlockingSkillAnnouncer = !!activeAnnouncer && activeAnnouncer.type === 'skill' && !activeAnnouncer.nonBlocking;
    if (isBlockingSkillAnnouncer || headshotCinematicActiveRef.current) {
      deferredGameStateRef.current = msg;
      return;
    }
    processGameState(msg);
  }, [announcerDataRef, applyGameState]);

  const applyMappedState = useCallback((mapped: GameState | null) => {
    if (!mapped) return;
    setGameState(mapped);
    setRenderGameState(mapped);
  }, [setGameState]);

  const handleSpectatorStateMessage = useCallback((msg: any) => {
    if (!mapSpectatorState) return;
    applyMappedState(mapSpectatorState(msg?.state));
  }, [applyMappedState, mapSpectatorState]);

  const handleGameActionMessage = useCallback((msg: any, options?: { isSpectator?: boolean }) => {
    pendingDamageMapRef.current = collectDamageMap(msg?.result || {});
    if (options?.isSpectator) {
      const cue = buildSpectatorSkillCue(msg, gameStateRef.current);
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
    if (mapSpectatorState) applyMappedState(mapSpectatorState(msg?.spectator_state));
  }, [applyMappedState, gameStateRef, mapSpectatorState, showSkillUse]);

  const handleActionResultMessage = useCallback((msg: any) => {
    const result = msg?.result || {};
    pendingDamageMapRef.current = collectDamageMap(result);
    const latestMyState = gameStateRef.current?.my_state as any;
    const myHand = latestMyState?.hand || [];
    const myCasterCard = findFieldCardByUid(latestMyState, msg?.caster_uid) || result?.caster || null;
    const spellName = result?.card?.name || result?.skill_name || result?.skill || myHand.find((card: any) => card.hero_key === result?.hero_key)?.name || pendingSpellNameRef.current || '스킬 이름 미상';
    const actorName = myCasterCard?.name || result?.caster_name || result?.caster?.name || result?.card?.name || '알 수 없음';
    const resolvedSkillName = result?.skill_name || result?.skill || null;
    const fatalUids = Array.from(collectFatalUids(result));
    const isSpellKill = msg.action === 'execute_spell' || !!result?.card?.is_spell || String(result?.hero_key || '').startsWith('spell_');
    const killHeroKey = isSpellKill
        ? (result?.hero_key || result?.card?.hero_key || '')
        : (getHeroKey(myCasterCard) || result?.caster?.hero_key || '');
    if (msg.action === 'use_skill' || msg.action === 'execute_spell') {
      const targetPool = [
        ...(gameStateRef.current?.opponent_state?.field?.main || []),
        ...(gameStateRef.current?.opponent_state?.field?.side || []),
        ...(gameStateRef.current?.my_state?.field?.main || []),
        ...(gameStateRef.current?.my_state?.field?.side || []),
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
      pushBattleLog({ type: 'turn_end', team: 'my', turn: gameStateRef.current?.turn, text: '턴 종료' });
    }
    pushPlacementActionLogs({
      action: msg.action,
      result,
      team: 'my',
      turn: gameStateRef.current?.turn,
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
      uiPreset,
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
      uiPreset,
    });
    if (msg.action === 'resolve_passive_choice') {
      setLocalPendingPassive(null);
      if (result?.card?.name) {
        addLog('패시브 처리: ' + result.card.name);
        showSystemNotice(result.card.name, '패시브 처리', 1300);
      }
    }

    [...(result?.turn_start_logs || []), ...(result?.turn_end_logs || [])].forEach((entry: any) => showPassiveNoticeFromLog(entry, 'my'));
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
        const spellCard = myHand.find((card: any) => card.hero_key === result?.hero_key)
            || result?.card
            || pendingSpellCardRef.current;
        showSkillUse({ skillName: resolvedSkillName, description: getSkillDescriptionFromCard(spellCard), heroKey: result?.hero_key || spellCard?.hero_key || '', imageName: spellCard?.name || resolvedSkillName, isSpell: true, duration: 3200 });
      }
      pendingSpellCardRef.current = null;
    }
    if (msg.action === 'execute_spell' && typeof result?.rescued === 'string') showSystemNotice(result.rescued, 'TRASH 복귀', 1400);
    if (msg.action === 'execute_spell' && typeof result?.drawn_card === 'string') showSystemNotice(result.drawn_card, '새 카드 획득', 1400);
  }, [
    addLog,
    gameStateRef,
    pushBattleLog,
    pushSkillActionLogs,
    queueHeadshotCoinToss,
    setActionMode,
    setColumnChoice,
    setLocalPendingPassive,
    setLocalPendingSpellChoice,
    setPendingSpell,
    setPendingSpellName,
    setSelectedFieldUid,
    setSelectedHandIdx,
    showDeathPassiveNotice,
    showPassiveNoticeFromLog,
    showSkillUse,
    showSkillUseAfterPlacement,
    showSystemNotice,
    toActor,
    uiPreset,
  ]);

  const handleOpponentActionMessage = useCallback((msg: any) => {
    const result = msg?.result || {};
    pendingDamageMapRef.current = collectDamageMap(result);
    const oppState = gameStateRef.current?.opponent_state as any;
    const opponentCasterCard = findFieldCardByUid(oppState, msg?.caster_uid) || result?.caster || null;
    const opponentCasterHeroKey = getHeroKey(opponentCasterCard);
    const cue = buildOpponentSkillCue(msg, gameStateRef.current?.opponent_state, opponentCasterHeroKey);
    const opponentName = opponentCasterCard?.name || result?.caster_name || cue?.subtitle?.replace(' 사용', '') || '상대';
    const opponentHeroKey = getHeroKey(opponentCasterCard) || String(result?.caster_hero_key || result?.caster?.hero_key || msg?.hero_key || '').toLowerCase();
    const headshotOutcome = resolveHeadshotOutcome(result);
    const shouldShowOpponentHeadshotCoinToss =
        msg.action === 'use_skill'
        && typeof headshotOutcome === 'boolean'
        && (opponentHeroKey === 'widowmaker' || opponentHeroKey === 'hanzo');
    if (msg.action === 'use_skill' || msg.action === 'execute_spell') {
      const targetPool = [
        ...(gameStateRef.current?.my_state?.field?.main || []),
        ...(gameStateRef.current?.my_state?.field?.side || []),
        ...(gameStateRef.current?.opponent_state?.field?.main || []),
        ...(gameStateRef.current?.opponent_state?.field?.side || []),
      ];
      pushSkillActionLogs({
        team: 'opponent',
        actorCard: opponentCasterCard || result?.card,
        actorName: opponentName,
        skillName: result?.skill_name || result?.skill || cue?.title || '스킬',
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
              skillName: result?.skill_name || result?.skill || cue.title || '스킬',
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
        skillName: result?.skill_name || result?.skill || '스킬',
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
      pushBattleLog({ type: 'turn_end', team: 'opponent', turn: gameStateRef.current?.turn, text: '상대 턴 종료' });
    }
    pushPlacementActionLogs({
      action: msg.action,
      result,
      team: 'opponent',
      turn: gameStateRef.current?.turn,
      toActor,
      pushBattleLog,
    });
    if (result?.passive_triggered?.passive) {
      const passiveSource = findFieldCardByUid(gameStateRef.current?.opponent_state, result?.card_uid)
          || opponentCasterCard
          || result?.caster
          || result?.card
          || null;
      showSkillUseAfterPlacement({
        skillName: result.passive_triggered.passive,
        subtitle: '상대 패시브',
        description: result?.passive_triggered?.message || '',
        heroKey: getHeroKey(passiveSource) || opponentCasterHeroKey || result?.card?.hero_key || result?.hero_key || '',
        imageName: passiveSource?.name || result?.caster_name || opponentCasterCard?.name || '상대',
        isSpell: false,
        duration: 3000,
      });
    }
    [...(result?.turn_start_logs || []), ...(result?.turn_end_logs || [])].forEach((entry: any) => showPassiveNoticeFromLog(entry, 'opponent'));
    showDeathPassiveNotice(result);
  }, [
    gameStateRef,
    pushBattleLog,
    pushSkillActionLogs,
    queueHeadshotCoinToss,
    showDeathPassiveNotice,
    showPassiveNoticeFromLog,
    showSkillUse,
    showSkillUseAfterPlacement,
    toActor,
  ]);

  const clearPendingSpellCard = useCallback(() => {
    pendingSpellCardRef.current = null;
  }, []);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState, gameStateRef]);

  useEffect(() => {
    pendingSpellNameRef.current = pendingSpellName;
  }, [pendingSpellName]);

  useEffect(() => {
    announcerDataRef.current = announcerData;
    flushDeferredGameStateIfReady();
  }, [announcerData, announcerDataRef, flushDeferredGameStateIfReady]);

  useEffect(() => {
    if (!gameState) return;
    const stamp = `${gameState.round}-${gameState.turn}-${gameState.phase}-${gameState.is_my_turn ? 'me' : 'opp'}`;
    if (phaseStampRef.current === stamp) return;
    phaseStampRef.current = stamp;
    showPhaseChange(phaseLabel(gameState.phase), phaseSubtitle(gameState.phase, gameState.is_my_turn), 1600);
  }, [gameState, phaseLabel, phaseSubtitle, showPhaseChange]);

  return {
    renderGameState,
    cardEffects,
    killFeed,
    dismissKillFeedItem,
    headshotCoinTossEvent,
    completeHeadshotCoinToss,
    handleGameStateMessage,
    handleSpectatorStateMessage,
    handleGameActionMessage,
    handleActionResultMessage,
    handleOpponentActionMessage,
    showPassiveNoticeFromLog,
    showDeathPassiveNotice,
    showReactivePassiveFromStateDiff,
    queueHeadshotCoinToss,
    clearPendingSpellCard,
  };
}
