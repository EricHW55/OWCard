import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BattleLogActor, BattleLogEntry, CardVisualEffect, FieldCard, FieldState, HandCard, StatusEffect } from '../../types/game';
import type { TutorialTooltipData } from '../../components/TutorialTooltip';
import type { AnnouncerData } from '../../components/GameAnnouncer';
import { TUTORIAL_CARDS, TUTORIAL_OPPONENT_HAND, TUTORIAL_PLAYER_HAND, TUTORIAL_SCRIPT, type TutorialCardDefinition, type TutorialScriptAction } from './tutorialScript';
import { getCardArtCandidates, getCardImageSrc } from '../../utils/heroImage';

type Side = 'player' | 'opponent';
type TutorialPlayer = {
  hand: HandCard[];
  field: FieldState;
  drawPile: HandCard[];
  placementUsed: number;
  placementLimit: number;
  mulliganDone: boolean;
};

type TutorialPlayers = {
  bottom: TutorialPlayer;
  top: TutorialPlayer;
};

const emptyField = (): FieldState => ({ main: [], side: [] });
const cloneHandCard = (key: string): HandCard => ({ ...TUTORIAL_CARDS[key] });
const uidToKey = (uid: string) => Object.keys(TUTORIAL_CARDS).find((key) => TUTORIAL_CARDS[key].uid === uid) || '';
type AutoTutorialStep = Extract<TutorialScriptAction, { delayMs: number }>;
const isAutoStep = (step?: TutorialScriptAction): step is AutoTutorialStep => !!step && step.type.startsWith('auto_');

function makeFieldCard(def: TutorialCardDefinition, zone: 'main' | 'side', slotIndex?: 0 | 1): FieldCard {
  return {
    hero_key: def.hero_key,
    is_spell: false,
    cost: def.cost,
    hp: def.hp,
    uid: def.uid,
    template_id: def.id,
    name: def.fieldName || def.name,
    role: def.role,
    description: def.description,
    max_hp: def.hp,
    current_hp: def.hp,
    attack: def.base_attack,
    defense: def.base_defense,
    attack_range: zone === 'side' ? Math.max(1, def.base_attack_range + 1) : def.base_attack_range,
    zone,
    statuses: [],
    skill_cooldowns: {},
    skill_damages: def.skill_damages,
    skill_meta: def.skill_meta,
    placed_this_turn: true,
    acted_this_turn: false,
    extra: {
      ...(def.extra || {}),
      _hero_key: def.hero_key,
      ...(zone === 'main' && slotIndex !== undefined ? { slot_index: slotIndex } : {}),
    },
  };
}

function allCards(field: FieldState): FieldCard[] {
  return [...field.main, ...field.side];
}

function removeDead(field: FieldState): FieldState {
  return {
    main: field.main.filter((card) => card.current_hp > 0),
    side: field.side.filter((card) => card.current_hp > 0),
  };
}

function setPlacedReady(field: FieldState): FieldState {
  return {
    main: field.main.map((card) => ({ ...card, placed_this_turn: false, acted_this_turn: false })),
    side: field.side.map((card) => ({ ...card, placed_this_turn: false, acted_this_turn: false })),
  };
}

function toActor(card: FieldCard | HandCard | null | undefined, fallbackName = '대상'): BattleLogActor {
  return {
    name: String(card?.name || fallbackName),
    heroKey: String((card as any)?.hero_key || (card as any)?.extra?._hero_key || ''),
    isSpell: !!(card as any)?.is_spell,
  };
}

export function useTutorialGameController() {
  const [players, setPlayers] = useState<TutorialPlayers>(() => ({
    bottom: {
      hand: TUTORIAL_PLAYER_HAND.map(cloneHandCard),
      field: emptyField(),
      drawPile: [],
      placementUsed: 0,
      placementLimit: 1,
      mulliganDone: true,
    },
    top: {
      hand: TUTORIAL_OPPONENT_HAND.map(cloneHandCard),
      field: emptyField(),
      drawPile: [],
      placementUsed: 0,
      placementLimit: 2,
      mulliganDone: true,
    },
  }));
  const [phase, setPhase] = useState<'placement' | 'action' | 'game_over'>('placement');
  const [round, setRound] = useState(1);
  const [activeSide, setActiveSide] = useState<Side>('player');
  const [stepIndex, setStepIndex] = useState(0);
  const [tooltip, setTooltip] = useState<TutorialTooltipData | null>(null);
  const [selectedHandIdx, setSelectedHandIdx] = useState<number | null>(null);
  const [selectedFieldUid, setSelectedFieldUid] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<string | null>(null);
  const [detailCard, setDetailCard] = useState<FieldCard | HandCard | null>(null);
  const [logs, setLogs] = useState<BattleLogEntry[]>([]);
  const [cardEffects, setCardEffects] = useState<Record<string, CardVisualEffect>>({});
  const [announcerData, setAnnouncerData] = useState<AnnouncerData | null>(null);
  const [busy, setBusy] = useState(false);
  const timersRef = useRef<number[]>([]);
  const logSeqRef = useRef(0);

  const currentStep = TUTORIAL_SCRIPT[stepIndex];
  const bottom = players.bottom;
  const selectedHandCard = selectedHandIdx !== null ? bottom.hand[selectedHandIdx] || null : null;
  const selectedMyFieldCard = allCards(bottom.field).find((card) => card.uid === selectedFieldUid) || null;
  const expectedHint = currentStep && 'hint' in currentStep ? currentStep.hint : (busy ? '상대가 행동 중입니다.' : '');

  const pushLog = useCallback((entry: Omit<BattleLogEntry, 'id'>) => {
    setLogs((prev) => [...prev.slice(-199), { ...entry, id: `tutorial-log-${Date.now()}-${logSeqRef.current++}` }]);
  }, []);

  const showPhaseAnnouncer = useCallback((title: string, subtitle?: string, duration = 1500) => {
    setAnnouncerData({ type: 'phase', title, subtitle, duration });
  }, []);

  const showBlocked = useCallback((text = expectedHint || '지금은 튜토리얼이 안내하는 행동만 할 수 있습니다.') => {
    pushLog({ type: 'system', team: 'neutral', text });
  }, [expectedHint, pushLog]);

  const flashEffect = useCallback((uid: string, damage?: number) => {
    setCardEffects((prev) => ({ ...prev, [uid]: { floatingDamage: damage, hpTransitionMs: 450, destroying: false } }));
    const timerId = window.setTimeout(() => {
      setCardEffects((prev) => {
        const next = { ...prev };
        delete next[uid];
        return next;
      });
    }, 850);
    timersRef.current.push(timerId);
  }, []);

  const advance = useCallback(() => {
    setTooltip(null);
    setSelectedHandIdx(null);
    setSelectedFieldUid(null);
    setActionMode(null);
    setStepIndex((prev) => prev + 1);
  }, []);

  const findCardWithOwner = useCallback((uid: string): { owner: Side; card: FieldCard } | null => {
    const mine = allCards(players.bottom.field).find((card) => card.uid === uid);
    if (mine) return { owner: 'player', card: mine };
    const enemy = allCards(players.top.field).find((card) => card.uid === uid);
    if (enemy) return { owner: 'opponent', card: enemy };
    return null;
  }, [players.bottom.field, players.top.field]);

  const mutateCard = useCallback((uid: string, updater: (card: FieldCard) => FieldCard) => {
    setPlayers((prev) => {
      const updateField = (field: FieldState): FieldState => ({
        main: field.main.map((card) => card.uid === uid ? updater(card) : card),
        side: field.side.map((card) => card.uid === uid ? updater(card) : card),
      });
      return {
        bottom: { ...prev.bottom, field: removeDead(updateField(prev.bottom.field)) },
        top: { ...prev.top, field: removeDead(updateField(prev.top.field)) },
      };
    });
  }, []);

  const applyDamage = useCallback((source: FieldCard, target: FieldCard, amount: number, team: 'my' | 'opponent') => {
    let dealt = amount;
    mutateCard(target.uid, (card) => {
      let remaining = amount;
      const statuses = card.statuses.map((status) => {
        if (status.name !== 'extra_hp' || !remaining) return status;
        const extraHp = Number((status as any).extra_hp || 0);
        const absorbed = Math.min(extraHp, remaining);
        remaining -= absorbed;
        return { ...status, extra_hp: Math.max(0, extraHp - absorbed) };
      }).filter((status) => status.name !== 'extra_hp' || Number((status as any).extra_hp || 0) > 0);
      dealt = remaining;
      return { ...card, statuses, current_hp: Math.max(0, card.current_hp - remaining) };
    });
    flashEffect(target.uid, amount);
    pushLog({
      type: 'damage',
      team,
      actor: toActor(source),
      skillName: Object.values(source.skill_meta || {})[0]?.name || '스킬',
      target: toActor(target),
      damage: amount,
    });
    if (dealt >= target.current_hp) {
      pushLog({ type: 'destroy', team: target.uid.startsWith('tut-reaper') || target.uid === 'tut-hazard' ? 'opponent' : 'my', actor: toActor(target), text: `${target.name} 제거` });
    }
  }, [flashEffect, mutateCard, pushLog]);

  const applyHeal = useCallback((source: FieldCard, target: FieldCard, amount: number) => {
    mutateCard(target.uid, (card) => ({ ...card, current_hp: Math.min(card.max_hp, card.current_hp + amount) }));
    flashEffect(target.uid, -amount);
    pushLog({ type: 'heal', team: 'my', actor: toActor(source), skillName: '생체 소총', target: toActor(target), damage: amount });
  }, [flashEffect, mutateCard, pushLog]);

  const markActed = useCallback((uid: string) => {
    mutateCard(uid, (card) => ({ ...card, acted_this_turn: true }));
  }, [mutateCard]);

  const executeSkill = useCallback((casterUid: string, targetUid: string, team: 'my' | 'opponent') => {
    const casterInfo = findCardWithOwner(casterUid);
    const targetInfo = findCardWithOwner(targetUid);
    if (!casterInfo || !targetInfo) return;
    const caster = casterInfo.card;
    const target = targetInfo.card;
    if (caster.uid === 'tut-ana' && targetInfo.owner === 'player') {
      applyHeal(caster, target, 5);
    } else {
      const key = uidToKey(caster.uid);
      let damage = TUTORIAL_CARDS[key]?.tutorialDamage || 5;
      if (caster.uid === 'tut-ana' && target.uid === 'tut-reaper-2') damage = target.current_hp;
      applyDamage(caster, target, damage, team);
      if (target.uid === 'tut-hazard' && target.current_hp > damage && team === 'my') {
        const retaliation = 2;
        mutateCard(caster.uid, (card) => ({ ...card, current_hp: Math.max(0, card.current_hp - retaliation) }));
        flashEffect(caster.uid, retaliation);
        pushLog({ type: 'damage', team: 'opponent', actor: toActor(target), skillName: '가시 반격', target: toActor(caster), damage: retaliation });
      }
    }
    markActed(caster.uid);
  }, [applyDamage, applyHeal, findCardWithOwner, flashEffect, markActed, mutateCard, pushLog]);

  const placeCardByKey = useCallback((owner: Side, cardKey: string, zone: 'main' | 'side', slotIndex?: 0 | 1) => {
    const def = TUTORIAL_CARDS[cardKey];
    if (!def) return;
    const fieldCard = makeFieldCard(def, zone, slotIndex);
    setPlayers((prev) => {
      const sideKey = owner === 'player' ? 'bottom' : 'top';
      const player = prev[sideKey];
      return {
        ...prev,
        [sideKey]: {
          ...player,
          hand: player.hand.filter((card) => card.id !== def.id),
          field: {
            ...player.field,
            [zone]: [...player.field[zone], fieldCard],
          },
          placementUsed: player.placementUsed + def.cost,
        },
      };
    });
    pushLog({ type: 'placement', team: owner === 'player' ? 'my' : 'opponent', actor: toActor(fieldCard), text: `${fieldCard.name} 배치` });
  }, [pushLog]);

  const executeSpell = useCallback((cardKey: string) => {
    const spell = TUTORIAL_CARDS[cardKey];
    const extraHp: StatusEffect = { name: 'extra_hp', duration: 2, source: spell.hero_key, visible: true, tags: ['buff'], extra_hp: 15 };
    setPlayers((prev) => ({
      ...prev,
      bottom: {
        ...prev.bottom,
        hand: prev.bottom.hand.filter((card) => card.id !== spell.id),
        placementUsed: prev.bottom.placementUsed + spell.cost,
        field: {
          main: prev.bottom.field.main.map((card) => ({ ...card, statuses: [...card.statuses, { ...extraHp }] })),
          side: prev.bottom.field.side.map((card) => ({ ...card, statuses: [...card.statuses, { ...extraHp }] })),
        },
      },
    }));
    pushLog({ type: 'skill', team: 'my', actor: toActor(spell), skillName: spell.name });
  }, [pushLog]);

  useEffect(() => () => {
    timersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    timersRef.current = [];
  }, []);

  useEffect(() => {
    const step = TUTORIAL_SCRIPT[stepIndex];
    if (!step) return;
    if (step.type === 'tooltip') {
      setBusy(false);
      setTooltip(step.tooltip);
      return;
    }
    if (step.type === 'victory') {
      setPhase('game_over');
      setBusy(false);
      setTooltip(step.tooltip);
      return;
    }
    if (!isAutoStep(step)) {
      setBusy(false);
      return;
    }

    setBusy(true);
    const timerId = window.setTimeout(() => {
      if (step.type === 'auto_place') {
        setActiveSide('opponent');
        setPhase('placement');
        showPhaseAnnouncer('상대 배치 단계', '튜토리얼 대본에 따라 상대가 행동합니다.', 1500);
        placeCardByKey('opponent', step.cardKey, step.zone, step.slotIndex);
      } else if (step.type === 'auto_end_placement') {
        setPhase('action');
        setPlayers((prev) => ({ ...prev, top: { ...prev.top, field: setPlacedReady(prev.top.field), placementUsed: 0 } }));
        pushLog({ type: 'turn', team: 'neutral', text: '상대 전투 단계' });
        showPhaseAnnouncer('상대 전투 단계', '상대 영웅이 스킬을 사용합니다.', 1500);
      } else if (step.type === 'auto_skill') {
        setPhase('action');
        executeSkill(step.casterUid, step.targetUid, 'opponent');
      } else if (step.type === 'auto_end_turn') {
        setActiveSide('player');
        setPhase('placement');
        setRound((prev) => prev + 1);
        setPlayers((prev) => ({
          bottom: { ...prev.bottom, field: setPlacedReady(prev.bottom.field), placementUsed: 0, placementLimit: 2 },
          top: { ...prev.top, field: setPlacedReady(prev.top.field), placementUsed: 0 },
        }));
        pushLog({ type: 'turn_end', team: 'opponent', text: '상대 턴 종료' });
        showPhaseAnnouncer('내 배치 단계', `${round + 1}턴을 시작합니다.`, 1500);
      }
      setBusy(false);
      setStepIndex((prev) => prev + 1);
    }, step.delayMs);
    timersRef.current.push(timerId);
  }, [executeSkill, placeCardByKey, pushLog, round, showPhaseAnnouncer, stepIndex]);

  const handleHandClick = useCallback((card: HandCard, index: number) => {
    if (tooltip || busy || activeSide !== 'player') {
      showBlocked();
      return;
    }
    if (currentStep?.type !== 'player_place' && currentStep?.type !== 'player_spell') {
      showBlocked();
      return;
    }
    const expected = TUTORIAL_CARDS[currentStep.cardKey];
    if (card.id !== expected.id) {
      showBlocked(currentStep.hint);
      return;
    }
    setSelectedHandIdx((prev) => prev === index ? null : index);
    setSelectedFieldUid(null);
    setActionMode(null);
  }, [activeSide, busy, currentStep, showBlocked, tooltip]);

  const handlePlace = useCallback((zone: 'main' | 'side', slotIndex?: 0 | 1) => {
    if (tooltip || busy || currentStep?.type !== 'player_place' || selectedHandIdx === null) {
      showBlocked();
      return;
    }
    const selected = bottom.hand[selectedHandIdx];
    const expected = TUTORIAL_CARDS[currentStep.cardKey];
    if (!selected || selected.id !== expected.id || zone !== currentStep.zone || (currentStep.slotIndex !== undefined && slotIndex !== currentStep.slotIndex)) {
      showBlocked(currentStep.hint);
      return;
    }
    placeCardByKey('player', currentStep.cardKey, zone, slotIndex);
    advance();
  }, [advance, bottom.hand, busy, currentStep, placeCardByKey, selectedHandIdx, showBlocked, tooltip]);

  const useSelectedSpell = useCallback(() => {
    if (tooltip || busy || currentStep?.type !== 'player_spell' || selectedHandIdx === null) {
      showBlocked();
      return;
    }
    const selected = bottom.hand[selectedHandIdx];
    const expected = TUTORIAL_CARDS[currentStep.cardKey];
    if (!selected || selected.id !== expected.id) {
      showBlocked(currentStep.hint);
      return;
    }
    executeSpell(currentStep.cardKey);
    advance();
  }, [advance, bottom.hand, busy, currentStep, executeSpell, selectedHandIdx, showBlocked, tooltip]);

  const handleEndMainButton = useCallback(() => {
    if (tooltip || busy) {
      showBlocked();
      return;
    }
    if (currentStep?.type === 'player_end_placement') {
      setPhase('action');
      setPlayers((prev) => ({ ...prev, bottom: { ...prev.bottom, field: setPlacedReady(prev.bottom.field), placementUsed: 0 } }));
      pushLog({ type: 'turn', team: 'neutral', text: '전투 단계' });
      showPhaseAnnouncer('전투 단계', '배치한 영웅의 스킬을 사용할 수 있습니다.', 1500);
      advance();
      return;
    }
    if (currentStep?.type === 'player_end_turn') {
      setActiveSide('opponent');
      setPhase('placement');
      setPlayers((prev) => ({ ...prev, top: { ...prev.top, placementUsed: 0 } }));
      pushLog({ type: 'turn_end', team: 'my', text: '턴 종료' });
      showPhaseAnnouncer('상대 턴', '잠시 후 상대가 자동으로 행동합니다.', 1500);
      advance();
      return;
    }
    showBlocked();
  }, [advance, busy, currentStep, pushLog, showBlocked, showPhaseAnnouncer, tooltip]);

  const prepareSkill = useCallback((skillKey: string) => {
    if (tooltip || busy || currentStep?.type !== 'player_skill' || !selectedMyFieldCard || selectedMyFieldCard.uid !== currentStep.casterUid || skillKey !== 'skill_1') {
      showBlocked(currentStep && 'hint' in currentStep ? currentStep.hint : undefined);
      return;
    }
    setActionMode(skillKey);
  }, [busy, currentStep, selectedMyFieldCard, showBlocked, tooltip]);

  const handleFieldClick = useCallback((card: FieldCard, isOpponent: boolean) => {
    if (tooltip || busy || activeSide !== 'player') {
      showBlocked();
      return;
    }
    if (currentStep?.type !== 'player_skill') {
      if (!isOpponent) setDetailCard(card);
      else showBlocked();
      return;
    }
    if (!selectedFieldUid) {
      if (card.uid !== currentStep.casterUid || isOpponent) {
        showBlocked(currentStep.hint);
        return;
      }
      setSelectedFieldUid(card.uid);
      setActionMode(null);
      return;
    }
    if (selectedFieldUid !== currentStep.casterUid || !actionMode) {
      showBlocked(currentStep.hint);
      return;
    }
    if (card.uid !== currentStep.targetUid) {
      showBlocked(currentStep.hint);
      return;
    }
    executeSkill(currentStep.casterUid, currentStep.targetUid, 'my');
    advance();
  }, [actionMode, activeSide, advance, busy, currentStep, executeSkill, selectedFieldUid, showBlocked, tooltip]);

  const selectedHeroKey = selectedMyFieldCard?.hero_key || selectedMyFieldCard?.extra?._hero_key || '';
  const fieldSkills = useMemo(() => {
    if (!selectedMyFieldCard || currentStep?.type !== 'player_skill' || selectedMyFieldCard.uid !== currentStep.casterUid || phase !== 'action') return [];
    return Object.entries(selectedMyFieldCard.skill_meta || {})
      .filter(([key]) => key.startsWith('skill_'))
      .map(([key, meta]: any) => ({
        key,
        name: meta?.name || key,
        description: meta?.description || '',
        onCooldown: false,
        cdLeft: 0,
      }));
  }, [currentStep, phase, selectedMyFieldCard]);

  const tutorialHandHighlightId = (
    activeSide === 'player'
    && !tooltip
    && !busy
    && (currentStep?.type === 'player_place' || currentStep?.type === 'player_spell')
  ) ? TUTORIAL_CARDS[currentStep.cardKey]?.id : null;

  const tutorialFieldHighlightUids = (() => {
    if (activeSide !== 'player' || tooltip || busy || currentStep?.type !== 'player_skill') return [];
    if (selectedFieldUid === currentStep.casterUid && actionMode) return [currentStep.targetUid];
    return [currentStep.casterUid];
  })();

  const tutorialPlacementSlot = (() => {
    if (activeSide !== 'player' || tooltip || busy || currentStep?.type !== 'player_place') return null;
    const expected = TUTORIAL_CARDS[currentStep.cardKey];
    if (!expected) return null;
    return {
      zone: currentStep.zone,
      role: expected.role,
      slotIndex: currentStep.slotIndex ?? 0,
    };
  })();

  const canActBottom = tutorialFieldHighlightUids.filter((uid) => allCards(players.bottom.field).some((card) => card.uid === uid));
  const canActTop = tutorialFieldHighlightUids.filter((uid) => allCards(players.top.field).some((card) => card.uid === uid));

  return {
    loading: false,
    error: null,
    announcerData,
    closeAnnouncer: () => setAnnouncerData(null),
    players,
    phase,
    round,
    activeSide,
    activePlayer: players.bottom,
    selectedHandIdx,
    selectedHandCard,
    selectedFieldUid,
    selectedMyFieldCard,
    selectedHeroKey,
    selectedFieldImageCandidates: selectedMyFieldCard ? [...getCardArtCandidates(selectedMyFieldCard), getCardImageSrc(selectedMyFieldCard)] : [],
    fieldSkills,
    actionMode,
    actionModeLabel: selectedMyFieldCard && actionMode ? selectedMyFieldCard.skill_meta?.[actionMode]?.name || actionMode : null,
    showContextPanel: fieldSkills.length > 0 || !!selectedHandCard?.is_spell,
    expectedHint,
    tooltip,
    cardEffects,
    tutorialHandHighlightId,
    tutorialPlacementSlot,
    canActTop,
    canActBottom,
    logs,
    detailCard,
    setDetailCard,
    handleHandClick,
    handlePlace,
    useSelectedSpell,
    cancelSelectedHand: () => setSelectedHandIdx(null),
    handleEndMainButton,
    prepareSkill,
    cancelSkillSelection: () => {
      setSelectedFieldUid(null);
      setActionMode(null);
    },
    handleFieldClick,
    readTooltip: advance,
  };
}

export default useTutorialGameController;
