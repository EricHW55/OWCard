import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FieldCard, GameState, HandCard } from '../types/game';
import { getApiBase } from '../api/ws';
import useAnnouncerQueue from '../hooks/useAnnouncerQueue';
import { computeSoloActionableUids, computeSoloFieldSkills, mapSoloStateFromOnline, Side } from './soloOnlineBridge';
import { createSoloAdapter } from './adapters/soloAdapter';
import type { UnifiedGameAction } from './gameModeAdapter';

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

  const players: SoloState | null = useMemo(() => (gs ? mapSoloStateFromOnline(gs, activeSide) : null), [gs, activeSide]);
  const phase = gs?.phase || 'waiting';
  const activePlayer = players?.[activeSide] || null;

  const selectedHandCard = useMemo(() => {
    if (!activePlayer || selectedHandIdx === null) return null;
    return activePlayer.hand[selectedHandIdx] || null;
  }, [activePlayer, selectedHandIdx]);

  const selectedMyFieldCard = useMemo(() => {
    if (!players || !selectedFieldUid) return null;
    const field = players[activeSide].field;
    return [...field.main, ...field.side].find((c: any) => c.uid === selectedFieldUid) || null;
  }, [players, selectedFieldUid, activeSide]);

  const selectedHeroKey = selectedMyFieldCard?.hero_key || selectedMyFieldCard?.extra?._hero_key || '';
  const selectedChargeLevel = Number(selectedMyFieldCard?.extra?.charge_level || 0);

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
      enqueueAnnouncer({ type: 'phase', title: '실행 실패', subtitle: await readError(res), duration: 1200 });
      return;
    }
    const body = await res.json();
    setGs(body.state as GameState);
    setActiveSide(body.active_side as Side);
    setSelectedHandIdx(null);
    setSelectedFieldUid(null);
    setActionMode(null);
    setPendingSpellCard(null);
  }, [apiBase, soloGameId, activeSide, enqueueAnnouncer]);

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
    enqueueAnnouncer({ type: 'phase', title: phase, subtitle: activeSide === 'bottom' ? '아래쪽 턴' : '위쪽 턴', duration: 900 });
  }, [phase, activeSide, enqueueAnnouncer]);

  const handleHandClick = useCallback((card: HandCard, index: number) => {
    if (phase === 'mulligan') {
      setSelectedMulligan((prev) => (prev.includes(index) ? prev.filter((v) => v !== index) : [...prev, index].slice(0, 2)));
      return;
    }
    if (selectedHandIdx === index) {
      setDetailCard(card);
      setSelectedHandIdx(null);
      return;
    }
    setSelectedHandIdx(index);
    setSelectedFieldUid(null);
  }, [phase, selectedHandIdx]);

  const runMulligan = useCallback(() => {
    if (!selectedMulligan.length) return;
    void dispatchAction({ action: 'mulligan', card_indices: selectedMulligan.slice(0, 1) });
    setSelectedMulligan([]);
  }, [selectedMulligan, dispatchAction]);

  const skipMulligan = useCallback(() => {
    void dispatchAction({ action: 'skip_mulligan' });
    setSelectedMulligan([]);
  }, [dispatchAction]);

  const placeCard = useCallback((zone: 'main' | 'side', slotIndex?: 0 | 1) => {
    if (selectedHandIdx === null) return;
    void dispatchAction({ action: 'place_card', hand_index: selectedHandIdx, zone, slot_index: zone === 'main' ? slotIndex : undefined });
  }, [selectedHandIdx, dispatchAction]);

  const endPlacement = useCallback(() => { void dispatchAction({ action: 'end_placement' }); }, [dispatchAction]);
  const endTurn = useCallback(() => { void dispatchAction({ action: 'end_turn' }); }, [dispatchAction]);

  const handleEndMainButton = useCallback(() => {
    if (phase === 'placement') endPlacement();
    if (phase === 'action') endTurn();
  }, [phase, endPlacement, endTurn]);

  const prepareSkill = useCallback((skillKey: string) => setActionMode(skillKey), []);

  const handleFieldClick = useCallback((card: FieldCard, isOpponent: boolean) => {
    if (phase === 'placement' && selectedHandCard?.is_spell) {
      act({ action: 'execute_spell', hero_key: selectedHandCard.hero_key, target_uid: card.uid });
      return;
    }
    if (isOpponent && phase === 'action' && actionMode && selectedMyFieldCard) {
      act({ action: 'use_skill', caster_uid: selectedMyFieldCard.uid, skill_key: actionMode, target_uid: card.uid });
      return;
    }
    if (!isOpponent) {
      setSelectedFieldUid((prev) => (prev === card.uid ? null : card.uid));
      return;
    }
    setDetailCard(card);
  }, [phase, selectedHandCard, actionMode, selectedMyFieldCard, act])

  const useSelectedSpell = useCallback(() => {
    if (selectedHandCard?.is_spell) {
      setPendingSpellCard(selectedHandCard);
      setActionMode('spell');
    }
  }, [selectedHandCard]);

  const canActTop = computeSoloActionableUids(phase as any, activeSide, 'top', players?.top.field || { main: [], side: [] });
  const canActBottom = computeSoloActionableUids(phase as any, activeSide, 'bottom', players?.bottom.field || { main: [], side: [] });
  const fieldSkills = computeSoloFieldSkills(phase as any, selectedMyFieldCard as any, true);

  const showContextPanel = (phase === 'mulligan' && !!activePlayer && !activePlayer.mulliganDone)
      || fieldSkills.length > 0
      || phase === 'placement';

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
    mulliganAnimatingIndex: null,
    mulliganCinematicCard: null,
    mulliganReplacementCard: null,
    isMulliganCinematicActive: false,
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
    confirmMulligan: runMulligan,
    runMulligan,
    skipMulligan,
    completeMulliganCinematic: () => {},
    placeCard,
    handlePlace: placeCard,
    useSelectedSpell,
    cancelSelectedHand: () => setSelectedHandIdx(null),
    cancelPendingSpell: () => { setPendingSpellCard(null); setActionMode(null); },
    endPlacement,
    executeSkill: (skillKey: string, targetUid?: string) => {
      if (!selectedMyFieldCard) return;
      act({ action: 'use_skill', caster_uid: selectedMyFieldCard.uid, skill_key: skillKey, target_uid: targetUid });
    },
    endTurn,
    handleEndMainButton,
    prepareSkill,
    setActionMode,
    handleHandClick,
    handleFieldClick,
    refreshBySide,
  };
}

export default useSoloGameController;
