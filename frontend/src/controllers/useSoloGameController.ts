import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FieldCard, FieldState, HandCard, Role } from '../types/game';
import { getApiBase } from '../api/ws';
import useAnnouncerQueue from '../hooks/useAnnouncerQueue';

type Side = 'top' | 'bottom';
type SoloPhase = 'mulligan' | 'placement' | 'action' | 'game_over';

type CardTemplate = {
  id: number;
  hero_key: string;
  name: string;
  role: Role;
  hp?: number;
  cost?: number;
  base_attack?: number;
  base_defense?: number;
  base_attack_range?: number;
  skill_damages?: Record<string, any>;
  skill_meta?: Record<string, { name: string; cooldown?: number; description?: string }>;
  description?: string;
  is_spell?: boolean;
};

type SoloPlayerState = {
  side: Side;
  drawPile: HandCard[];
  hand: HandCard[];
  field: FieldState;
  trash: HandCard[];
  placementUsed: number;
  mulliganDone: boolean;
};

const INITIAL_DRAW = 10;

function shuffle<T>(list: T[]): T[] {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function drawCards(state: SoloPlayerState, amount: number): SoloPlayerState {
  if (amount <= 0 || state.drawPile.length === 0) return state;
  const drawAmount = Math.min(amount, state.drawPile.length);
  const drawn = state.drawPile.slice(0, drawAmount);
  return {
    ...state,
    drawPile: state.drawPile.slice(drawAmount),
    hand: [...state.hand, ...drawn],
  };
}

function toFieldCard(card: HandCard, side: Side): FieldCard {
  return {
    uid: `${side}-${card.hero_key}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    template_id: card.id,
    hero_key: card.hero_key,
    name: card.name,
    role: card.role,
    description: card.description,
    max_hp: card.hp,
    current_hp: card.hp,
    attack: card.base_attack,
    defense: card.base_defense,
    attack_range: card.base_attack_range,
    zone: 'main',
    statuses: [],
    skill_cooldowns: {},
    skill_damages: card.skill_damages || {},
    skill_meta: card.skill_meta || {},
    placed_this_turn: true,
    acted_this_turn: false,
    extra: {},
  };
}

function canPlaceToZone(field: FieldState, role: Role, zone: 'main' | 'side') {
  const totalRoleCount = [...field.main, ...field.side].filter((c) => c.role === role).length;
  if (role === 'tank' && totalRoleCount >= 1) return false;

  if (zone === 'main') {
    if (role === 'tank') return field.main.filter((c) => c.role === 'tank').length < 1;
    if (role === 'dealer') return field.main.filter((c) => c.role === 'dealer').length < 2;
    if (role === 'healer') return field.main.filter((c) => c.role === 'healer').length < 2;
    return false;
  }
  return !field.side.some((c) => c.role === role);
}

function phaseLabel(phase: SoloPhase): string {
  if (phase === 'mulligan') return '멀리건';
  if (phase === 'placement') return '배치';
  if (phase === 'action') return '행동';
  return '종료';
}

function getPlacementCost(card: HandCard): number {
  const raw = Number(card.cost ?? 1);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

function getSpellEffectAmount(card: HandCard, type: 'damage' | 'heal'): number {
  const values: number[] = [];
  Object.values(card.skill_damages || {}).forEach((entry: any) => {
    const raw = entry?.[type];
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) values.push(raw);
  });
  return values.length ? Math.max(...values) : 3;
}

export function useSoloGameController() {
  const apiBase = getApiBase();
  const { announcerData, enqueueAnnouncer, closeAnnouncer } = useAnnouncerQueue();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [players, setPlayers] = useState<Record<Side, SoloPlayerState> | null>(null);
  const [activeSide, setActiveSide] = useState<Side>('bottom');
  const [phase, setPhase] = useState<SoloPhase>('mulligan');
  const [selectedHandIdx, setSelectedHandIdx] = useState<number | null>(null);
  const [selectedFieldUid, setSelectedFieldUid] = useState<string | null>(null);
  const [selectedMulligan, setSelectedMulligan] = useState<number[]>([]);
  const [mulliganAnimatingIndex, setMulliganAnimatingIndex] = useState<number | null>(null);
  const [mulliganCinematicCard, setMulliganCinematicCard] = useState<HandCard | null>(null);
  const [isMulliganCinematicActive, setIsMulliganCinematicActive] = useState(false);
  const [detailCard, setDetailCard] = useState<FieldCard | HandCard | null>(null);
  const [actionMode, setActionMode] = useState<string | null>(null);
  const [pendingSpellCard, setPendingSpellCard] = useState<HandCard | null>(null);

  const enemySide: Side = activeSide === 'bottom' ? 'top' : 'bottom';
  const activePlayer = players?.[activeSide] || null;
  const enemyPlayer = players?.[enemySide] || null;

  const selectedHandCard = useMemo(() => {
    if (!activePlayer || selectedHandIdx === null) return null;
    return activePlayer.hand[selectedHandIdx] || null;
  }, [activePlayer, selectedHandIdx]);

  const selectedMyFieldCard = useMemo(() => {
    if (!activePlayer || !selectedFieldUid) return null;
    return [...activePlayer.field.main, ...activePlayer.field.side].find((c) => c.uid === selectedFieldUid) || null;
  }, [activePlayer, selectedFieldUid]);

  const selectedHeroKey = selectedMyFieldCard?.hero_key || '';
  const selectedChargeLevel = 0;

  useEffect(() => {
    enqueueAnnouncer({
      type: 'phase',
      title: phaseLabel(phase),
      subtitle: activeSide === 'bottom' ? '아래쪽 턴' : '위쪽 턴',
      duration: 1200,
    });
  }, [phase, activeSide, enqueueAnnouncer]);

  useEffect(() => {
    const run = async () => {
      try {
        const playerIdRaw = sessionStorage.getItem('player_id');
        if (!playerIdRaw) {
          setError('로그인이 필요합니다.');
          setLoading(false);
          return;
        }

        const [cardsRes, decksRes] = await Promise.all([
          fetch(`${apiBase}/cards/`),
          fetch(`${apiBase}/decks/player/${Number(playerIdRaw)}`),
        ]);

        if (!cardsRes.ok || !decksRes.ok) {
          throw new Error('카드/덱 정보를 불러오지 못했습니다.');
        }

        const templates = (await cardsRes.json()) as CardTemplate[];
        const decks = (await decksRes.json()) as Array<{ id: number; cards: Array<{ card_template_id: number; quantity: number }> }>;
        if (!decks.length) throw new Error('덱이 없습니다. 덱 빌더에서 덱을 구성해 주세요.');

        const byId = new Map<number, CardTemplate>(templates.map((c) => [c.id, c]));
        const deck = decks[0];

        const baseDeck: HandCard[] = [];
        deck.cards.forEach((entry) => {
          const t = byId.get(entry.card_template_id);
          if (!t) return;
          for (let i = 0; i < entry.quantity; i += 1) {
            baseDeck.push({
              id: t.id,
              hero_key: t.hero_key,
              name: t.name,
              role: t.role,
              hp: t.hp || 1,
              cost: t.cost || 1,
              base_attack: t.base_attack || 0,
              base_defense: t.base_defense || 0,
              base_attack_range: t.base_attack_range || 1,
              skill_damages: t.skill_damages || {},
              skill_meta: t.skill_meta || {},
              description: t.description || '',
              is_spell: t.is_spell,
            });
          }
        });

        const make = (side: Side): SoloPlayerState => ({
          side,
          drawPile: shuffle(baseDeck),
          hand: [],
          field: { main: [], side: [] },
          trash: [],
          placementUsed: 0,
          mulliganDone: false,
        });

        const top = drawCards(make('top'), INITIAL_DRAW);
        const bottom = drawCards(make('bottom'), INITIAL_DRAW);

        setPlayers({ top, bottom });
        setPhase('mulligan');
        setActiveSide('bottom');
      } catch (e: any) {
        setError(e.message || '초기화 실패');
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [apiBase]);

  const confirmMulligan = useCallback(() => {
    if (!players || !activePlayer || phase !== 'mulligan') return;
    const targetIndex = selectedMulligan[0];
    const targetCard = activePlayer.hand[targetIndex];
    if (typeof targetIndex === 'number' && targetCard) {
      setMulliganAnimatingIndex(targetIndex);
      setMulliganCinematicCard(targetCard);
      setIsMulliganCinematicActive(true);
    }

    setSelectedMulligan([]);
    setSelectedHandIdx(null);
    setSelectedFieldUid(null);

    window.setTimeout(() => {
      setPlayers((prev) => {
        if (!prev) return prev;
        const cur = prev[activeSide];
        const selectedSet = new Set(selectedMulligan);
        const keep = cur.hand.filter((_, idx) => !selectedSet.has(idx));
        const back = cur.hand.filter((_, idx) => selectedSet.has(idx));
        const shuffled = shuffle([...cur.drawPile, ...back]);
        const redrawn = shuffled.slice(0, back.length);

        return {
          ...prev,
          [activeSide]: {
            ...cur,
            hand: [...keep, ...redrawn],
            drawPile: shuffled.slice(back.length),
            mulliganDone: true,
          },
        };
      });

      setMulliganAnimatingIndex(null);
      setMulliganCinematicCard(null);
      setIsMulliganCinematicActive(false);

      const nextSide: Side = activeSide === 'bottom' ? 'top' : 'bottom';
      if (!players[nextSide].mulliganDone) {
        setActiveSide(nextSide);
        return;
      }

      setPhase('placement');
      setActiveSide('bottom');
    }, 1420);
  }, [players, activePlayer, phase, activeSide, selectedMulligan]);
  const runMulligan = confirmMulligan;

  const skipMulligan = useCallback(() => {
    if (!players || !activePlayer || phase !== 'mulligan') return;

    setPlayers((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [activeSide]: {
          ...prev[activeSide],
          mulliganDone: true,
        },
      };
    });

    setSelectedMulligan([]);
    setSelectedHandIdx(null);
    setSelectedFieldUid(null);

    const nextSide: Side = activeSide === 'bottom' ? 'top' : 'bottom';
    if (!players[nextSide].mulliganDone) {
      setActiveSide(nextSide);
      return;
    }

    setPhase('placement');
    setActiveSide('bottom');
  }, [players, activePlayer, phase, activeSide]);

  useEffect(() => {
    if (!players || phase !== 'mulligan') return;
    if (players.top.mulliganDone && players.bottom.mulliganDone) {
      setPhase('placement');
      setActiveSide('bottom');
    }
  }, [players, phase]);

  const placeCard = useCallback((zone: 'main' | 'side', slotIndex?: 0 | 1) => {
    if (!players || !activePlayer || phase !== 'placement' || selectedHandIdx === null) return;
    const card = activePlayer.hand[selectedHandIdx];
    if (!card || card.is_spell) return;

    if (!canPlaceToZone(activePlayer.field, card.role, zone)) {
      enqueueAnnouncer({ type: 'phase', title: '배치 불가', subtitle: `해당 위치에 ${card.role} 배치 불가`, duration: 1200 });
      return;
    }

    const placementCost = getPlacementCost(card);

    if ((activePlayer.placementUsed + placementCost) > 2) {
      enqueueAnnouncer({ type: 'phase', title: '배치 제한', subtitle: '턴당 2장까지만 배치 가능', duration: 1200 });
      return;
    }

    const nextFieldCard = {
      ...toFieldCard(card, activeSide),
      zone,
      extra: {
        slot_index: zone === 'main' ? (slotIndex ?? 0) : 0,
      },
    };

    setPlayers((prev) => {
      if (!prev) return prev;
      const cur = prev[activeSide];
      const nextField: FieldState = {
        main: zone === 'main' ? [...cur.field.main, nextFieldCard] : cur.field.main,
        side: zone === 'side' ? [...cur.field.side, nextFieldCard] : cur.field.side,
      };
      return {
        ...prev,
        [activeSide]: {
          ...cur,
          hand: cur.hand.filter((_, idx) => idx !== selectedHandIdx),
          field: nextField,
          placementUsed: cur.placementUsed + placementCost,
        },
      };
    });

    enqueueAnnouncer({ type: 'phase', title: card.name, subtitle: `${zone === 'main' ? '본대' : '사이드'} 배치`, duration: 1000 });
    setSelectedHandIdx(null);
  }, [players, activePlayer, phase, selectedHandIdx, activeSide, enqueueAnnouncer]);
  const handlePlace = placeCard;

  const useSelectedSpell = useCallback(() => {
    if (!players || !activePlayer || phase !== 'placement' || selectedHandIdx === null) return;
    const card = activePlayer.hand[selectedHandIdx];
    if (!card?.is_spell) return;
    const myFieldCount = activePlayer.field.main.length + activePlayer.field.side.length;
    if (myFieldCount === 0) {
      enqueueAnnouncer({ type: 'phase', title: '최소 배치 필요', subtitle: '필드에 카드를 1장 이상 먼저 배치하세요', duration: 1500 });
      return;
    }

    const placementCost = getPlacementCost(card);
    if ((activePlayer.placementUsed + placementCost) > 2) {
      enqueueAnnouncer({ type: 'phase', title: '배치 제한', subtitle: '턴당 2코스트까지만 사용 가능', duration: 1200 });
      return;
    }

    setPlayers((prev) => {
      if (!prev) return prev;
      const cur = prev[activeSide];
      return {
        ...prev,
        [activeSide]: {
          ...cur,
          hand: cur.hand.filter((_, idx) => idx !== selectedHandIdx),
          placementUsed: cur.placementUsed + placementCost,
          trash: [...cur.trash, card],
        },
      };
    });

    setPendingSpellCard(card);
    setActionMode('spell');
    setSelectedHandIdx(null);
    setSelectedFieldUid(null);
    enqueueAnnouncer({ type: 'phase', title: card.name, subtitle: '대상 카드를 선택하세요', duration: 1000 });
  }, [players, activePlayer, phase, selectedHandIdx, activeSide, enqueueAnnouncer]);

  const cancelPendingSpell = useCallback(() => {
    setPendingSpellCard(null);
    setActionMode(null);
  }, []);

  const cancelSelectedHand = useCallback(() => {
    setSelectedHandIdx(null);
  }, []);

  const endPlacement = useCallback(() => {
    if (phase !== 'placement') return;
    setPhase('action');
    setSelectedHandIdx(null);
    setPendingSpellCard(null);
    setActionMode(null);
  }, [phase]);

  const executeSkill = useCallback((skillKey: string, targetUid?: string) => {
    if (!players || !activePlayer || !enemyPlayer || !selectedMyFieldCard || phase !== 'action') return;
    if (selectedMyFieldCard.acted_this_turn || selectedMyFieldCard.placed_this_turn) return;

    const targets = [...enemyPlayer.field.main, ...enemyPlayer.field.side];
    if (!targets.length) {
      enqueueAnnouncer({ type: 'phase', title: '대상 없음', subtitle: '상대 필드에 카드가 없습니다.', duration: 1200 });
      return;
    }

    const target = targets.find((c) => c.uid === targetUid) || targets[0];
    const skillName = selectedMyFieldCard.skill_meta?.[skillKey]?.name || skillKey;
    const damage = Math.max(1, selectedMyFieldCard.attack || 1);

    setPlayers((prev) => {
      if (!prev) return prev;
      const markActed = (field: FieldState): FieldState => ({
        main: field.main.map((c) => (c.uid === selectedMyFieldCard.uid ? { ...c, acted_this_turn: true } : c)),
        side: field.side.map((c) => (c.uid === selectedMyFieldCard.uid ? { ...c, acted_this_turn: true } : c)),
      });

      const hit = (field: FieldState): FieldState => {
        const apply = (c: FieldCard) => (c.uid === target.uid ? { ...c, current_hp: c.current_hp - damage } : c);
        return {
          main: field.main.map(apply).filter((c) => c.current_hp > 0),
          side: field.side.map(apply).filter((c) => c.current_hp > 0),
        };
      };

      return {
        ...prev,
        [activeSide]: { ...prev[activeSide], field: markActed(prev[activeSide].field) },
        [enemySide]: { ...prev[enemySide], field: hit(prev[enemySide].field) },
      };
    });

    enqueueAnnouncer({
      type: 'skill',
      title: skillName,
      subtitle: `${selectedMyFieldCard.name} 사용`,
      description: selectedMyFieldCard.skill_meta?.[skillKey]?.description || '',
      heroKey: selectedMyFieldCard.hero_key,
      imageName: selectedMyFieldCard.name,
      duration: 1700,
    });
    setActionMode(null);
  }, [players, activePlayer, enemyPlayer, selectedMyFieldCard, phase, activeSide, enemySide, enqueueAnnouncer]);

  const prepareSkill = useCallback((skillKey: string) => {
    if (phase !== 'action') return;
    setActionMode(skillKey);
  }, [phase]);

  const endTurn = useCallback(() => {
    if (!players || phase === 'mulligan' || phase === 'game_over') return;
    const nextSide: Side = activeSide === 'bottom' ? 'top' : 'bottom';

    setPlayers((prev) => {
      if (!prev) return prev;
      const resetField = (field: FieldState): FieldState => ({
        main: field.main.map((c) => ({ ...c, acted_this_turn: false, placed_this_turn: false })),
        side: field.side.map((c) => ({ ...c, acted_this_turn: false, placed_this_turn: false })),
      });

      const next = { ...prev };
      next[nextSide] = drawCards({ ...next[nextSide], placementUsed: 0, field: resetField(next[nextSide].field) }, 1);
      return next;
    });

    setActiveSide(nextSide);
    setPhase('placement');
    setSelectedFieldUid(null);
    setSelectedHandIdx(null);
    setActionMode(null);
    setPendingSpellCard(null);
  }, [players, phase, activeSide]);

  const handleEndMainButton = useCallback(() => {
    if (phase === 'placement') {
      endPlacement();
      return;
    }
    if (phase === 'action') {
      endTurn();
    }
  }, [phase, endPlacement, endTurn]);

  const handleHandClick = useCallback((card: HandCard, index: number) => {
    if (phase === 'mulligan') {
      setSelectedMulligan((prev) => (
          prev.includes(index)
              ? prev.filter((v) => v !== index)
              : [...prev, index].slice(0, 2)
      ));
      return;
    }

    if (selectedHandIdx === index) {
      setDetailCard(card);
      setSelectedHandIdx(null);
      setPendingSpellCard(null);
      if (actionMode === 'spell') setActionMode(null);
      return;
    }

    setSelectedHandIdx(index);
    setSelectedFieldUid(null);
    setPendingSpellCard(null);
    if (actionMode === 'spell') setActionMode(null);
  }, [phase, selectedHandIdx, actionMode]);

  const handleFieldClick = useCallback((card: FieldCard, isOpponent: boolean) => {
    if (phase === 'placement' && actionMode === 'spell' && pendingSpellCard) {
      const allMine = [...(activePlayer?.field.main || []), ...(activePlayer?.field.side || [])];
      const isMyCard = allMine.some((c) => c.uid === card.uid);
      const amount = getSpellEffectAmount(pendingSpellCard, isMyCard ? 'heal' : 'damage');

      setPlayers((prev) => {
        if (!prev) return prev;
        const ownerSide: Side = isMyCard ? activeSide : enemySide;
        const patch = (field: FieldState): FieldState => {
          const apply = (c: FieldCard) => {
            if (c.uid !== card.uid) return c;
            if (isMyCard) return { ...c, current_hp: Math.min(c.max_hp, c.current_hp + amount) };
            return { ...c, current_hp: c.current_hp - amount };
          };
          return {
            main: field.main.map(apply).filter((c) => c.current_hp > 0),
            side: field.side.map(apply).filter((c) => c.current_hp > 0),
          };
        };
        return {
          ...prev,
          [ownerSide]: {
            ...prev[ownerSide],
            field: patch(prev[ownerSide].field),
          },
        };
      });

      enqueueAnnouncer({
        type: 'phase',
        title: pendingSpellCard.name,
        subtitle: isMyCard ? `${card.name} 회복` : `${card.name} 공격`,
        duration: 1100,
      });
      setPendingSpellCard(null);
      setActionMode(null);
      return;
    }

    if (isOpponent && phase === 'action' && actionMode) {
      executeSkill(actionMode, card.uid);
      return;
    }

    if (isOpponent) {
      setDetailCard(card);
      return;
    }

    if (selectedFieldUid === card.uid) {
      setDetailCard(card);
      setSelectedFieldUid(null);
      return;
    }

    setSelectedFieldUid(card.uid);
    setSelectedHandIdx(null);
    setActionMode(null);
    setPendingSpellCard(null);
  }, [phase, actionMode, pendingSpellCard, activePlayer, activeSide, enemySide, selectedFieldUid, executeSkill, enqueueAnnouncer]);

  const canActTop = phase === 'action' && activeSide === 'top'
    ? [...(players?.top.field.main || []), ...(players?.top.field.side || [])].filter((c) => !c.acted_this_turn && !c.placed_this_turn).map((c) => c.uid)
    : [];

  const canActBottom = phase === 'action' && activeSide === 'bottom'
    ? [...(players?.bottom.field.main || []), ...(players?.bottom.field.side || [])].filter((c) => !c.acted_this_turn && !c.placed_this_turn).map((c) => c.uid)
    : [];

  const fieldSkills = selectedMyFieldCard && phase === 'action' && !selectedMyFieldCard.placed_this_turn && !selectedMyFieldCard.acted_this_turn
      ? Object.entries(selectedMyFieldCard.skill_meta || {})
          .filter(([key]) => key.startsWith('skill_'))
          .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
          .map(([key, meta]) => ({
            key,
            name: (meta as any)?.name || key,
            description: (meta as any)?.description || '',
            onCooldown: false,
            cdLeft: 0,
          }))
    : [];

  const showContextPanel =
      (phase === 'mulligan' && !!activePlayer && !activePlayer.mulliganDone)
      || fieldSkills.length > 0
      || phase === 'placement'

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
    pendingSpellCard,
    showContextPanel,
    confirmMulligan,
    runMulligan,
    skipMulligan,
    placeCard,
    handlePlace,
    useSelectedSpell,
    cancelSelectedHand,
    cancelPendingSpell,
    endPlacement,
    executeSkill,
    endTurn,
    handleEndMainButton,
    prepareSkill,
    setActionMode,
    handleHandClick,
    handleFieldClick,
  };
}

export default useSoloGameController;
