import { useCallback, useState } from 'react';
import type { FieldCard, FieldState, HandCard } from '../../types/game';
import {
  getHeroKey,
  getSkillNameFromCard,
  getSymmetraTeleportBlockReason,
} from './gamePresentation';
import { canSelectHazardWallEmptySlot, resolveSkillPreparation } from './gameFlowRules';
import type { SharedColumnChoice } from './gameFlowState';

type SendAction = (action: Record<string, unknown>) => void;
type ShowSystemNotice = (title: string, subtitle?: string, duration?: number) => void;

export type GameFlowActionState = {
  selectedHandIdx: number | null;
  selectedFieldUid: string | null;
  selectedMulligan: number[];
  actionMode: string | null;
  pendingSpell: string | null;
  pendingSpellName: string | null;
  columnChoice: SharedColumnChoice | null;
};

export type GameFlowActionSetters = {
  setSelectedHandIdx: (value: number | null | ((prev: number | null) => number | null)) => void;
  setSelectedFieldUid: (value: string | null | ((prev: string | null) => string | null)) => void;
  setSelectedMulligan: (value: number[] | ((prev: number[]) => number[])) => void;
  setActionMode: (value: string | null) => void;
  setPendingSpell: (value: string | null) => void;
  setPendingSpellName: (value: string | null) => void;
  setColumnChoice: (value: SharedColumnChoice | null) => void;
  setDetailCard: (value: FieldCard | HandCard | null) => void;
  setLocalPendingPassive?: (value: any | null) => void;
  setLocalPendingSpellChoice?: (value: any | null) => void;
};

export function useSharedGameFlowActions(params: {
  my: { hand?: HandCard[]; field?: FieldState; mulligan_done?: boolean; mulliganDone?: boolean } | null;
  opponentField?: FieldState | null;
  phase: string;
  isMyTurn: boolean;
  state: GameFlowActionState;
  setters: GameFlowActionSetters;
  selectedHandCard: HandCard | null;
  selectedMyFieldCard: FieldCard | null;
  allMyField: FieldCard[];
  pendingPassive?: any;
  pendingSpellChoice?: any;
  sendAction: SendAction;
  addLog?: (message: string) => void;
  showSystemNotice: ShowSystemNotice;
  beginMulliganCinematic?: (index: number, card: HandCard, baselineHand: HandCard[]) => void;
  clearPendingSpellCard?: () => void;
  allowMulliganMultiSelect?: boolean;
  allowTargetOwnCardsWithSkills?: boolean;
  canAct?: (action: Record<string, unknown>) => boolean;
}) {
  const {
    my,
    opponentField,
    phase,
    isMyTurn,
    state,
    setters,
    selectedMyFieldCard,
    allMyField,
    pendingPassive,
    pendingSpellChoice,
    sendAction,
    addLog = () => {},
    showSystemNotice,
    beginMulliganCinematic,
    clearPendingSpellCard,
    allowMulliganMultiSelect = false,
    allowTargetOwnCardsWithSkills = true,
    canAct = () => true,
  } = params;

  const [duplicateTargetUid, setDuplicateTargetUid] = useState<string | null>(null);
  const [duplicateTargetRole, setDuplicateTargetRole] = useState<'tank' | 'dealer' | 'healer' | null>(null);
  const [duplicateTargetName, setDuplicateTargetName] = useState<string | null>(null);

  const clearSpellSelection = useCallback(() => {
    setters.setPendingSpell(null);
    setters.setPendingSpellName(null);
    clearPendingSpellCard?.();
  }, [clearPendingSpellCard, setters]);

  const clearDuplicateTarget = useCallback(() => {
    setDuplicateTargetUid(null);
    setDuplicateTargetRole(null);
    setDuplicateTargetName(null);
  }, []);

  const handleHandClick = useCallback((card: HandCard, index: number) => {
    if (!my) return;
    if (phase === 'mulligan') {
      setters.setSelectedMulligan((prev) => {
        if (!allowMulliganMultiSelect) {
          if (prev[0] === index) {
            setters.setDetailCard(card);
            return [];
          }
          return [index];
        }
        return prev.includes(index) ? prev.filter((value) => value !== index) : [...prev, index].slice(0, 2);
      });
      return;
    }
    if (pendingPassive?.type === 'jetpack_cat_extra_place') {
      if (card.is_spell) {
        addLog('스킬 카드는 추가 배치할 수 없음');
        return;
      }
      if (state.selectedHandIdx === index) {
        setters.setSelectedHandIdx(null);
        return;
      }
      setters.setSelectedHandIdx(index);
      setters.setSelectedFieldUid(null);
      setters.setActionMode(null);
      clearSpellSelection();
      return;
    }
    if (state.selectedHandIdx === index) {
      setters.setDetailCard(card);
      setters.setSelectedHandIdx(null);
      setters.setActionMode(null);
      setters.setColumnChoice(null);
      return;
    }
    setters.setSelectedHandIdx(index);
    setters.setSelectedFieldUid(null);
    setters.setActionMode(null);
    clearSpellSelection();
    setters.setColumnChoice(null);
  }, [addLog, allowMulliganMultiSelect, clearSpellSelection, my, pendingPassive, phase, setters, state.selectedHandIdx]);

  const canSelectEmptySlot = useCallback((slot: {
    zone: 'main' | 'side';
    role: 'tank' | 'dealer' | 'healer';
    slotIndex: 0 | 1;
    isOpponent: boolean;
  }) => canSelectHazardWallEmptySlot({
    caster: selectedMyFieldCard,
    actionMode: state.actionMode,
    opponentField,
    ...slot,
  }), [opponentField, selectedMyFieldCard, state.actionMode]);

  const handleEmptySlotSelect = useCallback((slot: {
    zone: 'main' | 'side';
    role: 'tank' | 'dealer' | 'healer';
    slotIndex: 0 | 1;
    isOpponent: boolean;
  }) => {
    if (!selectedMyFieldCard || !canSelectEmptySlot(slot)) return;
    if (!canAct({ action: 'use_skill', caster_uid: selectedMyFieldCard.uid, skill_key: 'skill_1', target_zone: slot.zone, target_role: slot.role, target_slot_index: slot.slotIndex })) return;
    sendAction({
      action: 'use_skill',
      caster_uid: selectedMyFieldCard.uid,
      skill_key: 'skill_1',
      target_zone: slot.zone,
      target_role: slot.role,
      target_slot_index: slot.slotIndex,
    });
    const roleLabel = slot.role === 'tank' ? '탱커' : slot.role === 'dealer' ? '딜러' : '힐러';
    addLog(selectedMyFieldCard.name + ' - 가시벽 (' + roleLabel + ' ' + (slot.slotIndex + 1) + '번 칸)');
    setters.setSelectedFieldUid(null);
    setters.setActionMode(null);
  }, [addLog, canAct, canSelectEmptySlot, selectedMyFieldCard, sendAction, setters]);

  const handleFieldClick = useCallback((card: FieldCard, isOpponent: boolean) => {
    if (state.columnChoice) {
      addLog('위 패널에서 열을 선택하세요');
      return;
    }
    if (state.actionMode === 'spell' && state.pendingSpell) {
      if (state.pendingSpell === 'spell_duplicate') {
        if (!isOpponent) {
          addLog('복제 대상은 상대 필드 카드만 선택할 수 있습니다');
          showSystemNotice('복제', '상대 필드의 대상을 선택하세요', 1200);
          return;
        }
        setDuplicateTargetUid(card.uid);
        setDuplicateTargetRole(card.role);
        setDuplicateTargetName(card.name);
        setters.setActionMode('duplicate_place');
        addLog('복제 대상 선택: ' + card.name + ' - 배치 위치 선택');
        showSystemNotice('복제', card.name + ' 선택 - 빈 위치를 클릭하세요', 1400);
        return;
      }
      const action = { action: 'execute_spell', hero_key: state.pendingSpell, target_uid: card.uid };
      if (!canAct(action)) return;
      sendAction(action);
      addLog('스킬 카드 -> ' + card.name);
      setters.setActionMode(null);
      setters.setColumnChoice(null);
      setters.setSelectedHandIdx(null);
      clearSpellSelection();
      return;
    }
    if (state.actionMode && state.actionMode !== 'spell' && state.selectedFieldUid) {
      const caster = allMyField.find((fieldCard) => fieldCard.uid === state.selectedFieldUid);
      if (caster) {
        if (state.actionMode === 'skill_1' && getHeroKey(caster) === 'hazard') {
          showSystemNotice('가시벽', '상대 본대의 빈 공간을 클릭하세요', 1500);
          return;
        }
        if (state.actionMode === 'skill_1' && !isOpponent && getHeroKey(caster) === 'symmetra') {
          const blockedReason = getSymmetraTeleportBlockReason(caster, card, my?.field);
          if (blockedReason) {
            showSystemNotice('행동 불가', blockedReason, 1800);
            addLog('오류: ' + blockedReason);
            setters.setActionMode(null);
            setters.setSelectedFieldUid(null);
            return;
          }
        }
        if (!allowTargetOwnCardsWithSkills && !isOpponent) {
          setters.setDetailCard(card);
          return;
        }
        const action = { action: 'use_skill', caster_uid: caster.uid, skill_key: state.actionMode, target_uid: card.uid };
        if (!canAct(action)) return;
        const skillName = getSkillNameFromCard(caster, state.actionMode);
        sendAction(action);
        addLog(caster.name + ' -> ' + card.name + ' (' + skillName + ')');
      }
      setters.setSelectedFieldUid(null);
      setters.setActionMode(null);
      return;
    }
    if (!isOpponent) {
      if (state.selectedFieldUid === card.uid) {
        setters.setDetailCard(card);
        setters.setSelectedFieldUid(null);
      } else {
        setters.setSelectedFieldUid(card.uid);
        setters.setSelectedHandIdx(null);
        setters.setActionMode(null);
        clearSpellSelection();
        setters.setColumnChoice(null);
      }
    } else {
      setters.setDetailCard(card);
    }
  }, [addLog, allMyField, allowTargetOwnCardsWithSkills, canAct, clearSpellSelection, my?.field, sendAction, setters, showSystemNotice, state]);

  const handlePlace = useCallback((zone: 'main' | 'side', slotIndex?: 0 | 1) => {
    if (!my || !isMyTurn || phase !== 'placement') return;
    if (state.pendingSpell === 'spell_duplicate' && state.actionMode === 'duplicate_place' && duplicateTargetUid) {
      const action = { action: 'execute_spell', hero_key: state.pendingSpell, target_uid: duplicateTargetUid, zone, slot_index: zone === 'main' ? slotIndex : undefined };
      if (!canAct(action)) return;
      sendAction(action);
      addLog('복제 배치: ' + (duplicateTargetName || '대상 카드') + ' -> ' + (zone === 'main' ? '본대' : '사이드'));
      setters.setActionMode(null);
      setters.setSelectedHandIdx(null);
      clearSpellSelection();
      clearDuplicateTarget();
      return;
    }
    if (state.selectedHandIdx === null) return;
    const card = my.hand?.[state.selectedHandIdx];
    if (!card) return;
    const myFieldCount = (my.field?.main?.length || 0) + (my.field?.side?.length || 0);
    if (card.is_spell && myFieldCount === 0) {
      addLog('필드에 카드가 없어 스킬 카드를 먼저 사용할 수 없음');
      showSystemNotice('최소 배치 필요', '필드에 카드를 1장 이상 먼저 배치하세요', 1700);
      return;
    }
    if (pendingPassive?.type === 'jetpack_cat_extra_place') {
      const action = { action: 'resolve_passive_choice', hand_index: state.selectedHandIdx, zone, slot_index: zone === 'main' ? slotIndex : undefined };
      if (!canAct(action)) return;
      sendAction(action);
      addLog(card.name + ' -> ' + (zone === 'main' ? '본대' : '사이드') + ' 추가 배치');
      setters.setSelectedHandIdx(null);
      return;
    }
    const action = { action: 'place_card', hand_index: state.selectedHandIdx, zone, slot_index: zone === 'main' ? slotIndex : undefined };
    if (!canAct(action)) return;
    sendAction(action);
    addLog(card.name + ' -> ' + (zone === 'main' ? '본대' : '사이드') + ' ' + (card.is_spell ? '사용' : '배치'));
    setters.setSelectedHandIdx(null);
  }, [addLog, canAct, clearDuplicateTarget, clearSpellSelection, duplicateTargetName, duplicateTargetUid, isMyTurn, my, pendingPassive, phase, sendAction, setters, showSystemNotice, state]);

  const prepareSkill = useCallback((skillKey: string) => {
    if (!selectedMyFieldCard) return;
    if (state.selectedHandIdx !== null || state.pendingSpell) {
      setters.setSelectedHandIdx(null);
      clearSpellSelection();
      clearDuplicateTarget();
    }
    const preparation = resolveSkillPreparation(selectedMyFieldCard, skillKey);
    if (preparation.kind === 'blocked') {
      addLog(selectedMyFieldCard.name + ' - ' + preparation.skillName + ' 불가 (' + preparation.reason + ')');
      showSystemNotice('행동 불가', preparation.reason, 1800);
      return;
    }
    if (preparation.kind === 'targetless') {
      const action = { action: 'use_skill', caster_uid: selectedMyFieldCard.uid, skill_key: skillKey };
      if (!canAct(action)) return;
      setters.setActionMode(null);
      setters.setColumnChoice(null);
      sendAction(action);
      addLog(selectedMyFieldCard.name + ' - ' + preparation.skillName + ' 즉시 사용');
      setters.setSelectedFieldUid(null);
      return;
    }
    if (preparation.kind === 'column') {
      if (preparation.reason) {
        addLog(preparation.reason);
        showSystemNotice('차징 부족', '레일건으로 먼저 충전하세요', 1200);
        return;
      }
      setters.setActionMode(null);
      setters.setColumnChoice({
        source: 'skill',
        heroKey: preparation.heroKey,
        skillKey,
        skillName: preparation.skillName,
        targetSide: 'opponent',
      });
      addLog(selectedMyFieldCard.name + ' - ' + preparation.skillName + ' 열 선택');
      showSystemNotice(preparation.skillName, '열을 선택하세요', 1000);
      return;
    }
    setters.setColumnChoice(null);
    setters.setActionMode(skillKey);
    addLog(selectedMyFieldCard.name + ' - ' + preparation.skillName + ' 준비');
    if (preparation.kind === 'hazard_wall') showSystemNotice(preparation.skillName, '상대 본대의 빈 공간을 클릭하세요', 1400);
    else showSystemNotice(preparation.skillName, selectedMyFieldCard.name + ' 준비', 900);
  }, [addLog, canAct, clearDuplicateTarget, clearSpellSelection, selectedMyFieldCard, sendAction, setters, showSystemNotice, state.pendingSpell, state.selectedHandIdx]);

  const runMulligan = useCallback(() => {
    const mulliganDone = !!(my?.mulligan_done ?? my?.mulliganDone);
    if (phase !== 'mulligan' || mulliganDone) {
      setters.setSelectedMulligan([]);
      return;
    }
    if (state.selectedMulligan.length === 0) return;
    const selectedIndices = allowMulliganMultiSelect ? state.selectedMulligan : state.selectedMulligan.slice(0, 1);
    const targetIndex = selectedIndices[0];
    const targetCard = my?.hand?.[targetIndex];
    if (typeof targetIndex === 'number' && targetCard) {
      beginMulliganCinematic?.(targetIndex, targetCard, my?.hand || []);
    }
    const action = { action: 'mulligan', card_indices: selectedIndices };
    if (!canAct(action)) return;
    sendAction(action);
    setters.setSelectedMulligan([]);
  }, [allowMulliganMultiSelect, beginMulliganCinematic, canAct, my, phase, sendAction, setters, state.selectedMulligan]);

  const skipMulligan = useCallback(() => {
    const mulliganDone = !!(my?.mulligan_done ?? my?.mulliganDone);
    if (phase !== 'mulligan' || mulliganDone) {
      setters.setSelectedMulligan([]);
      return;
    }
    const action = { action: 'skip_mulligan' };
    if (!canAct(action)) return;
    sendAction(action);
    setters.setSelectedMulligan([]);
  }, [canAct, my, phase, sendAction, setters]);

  const selectColumn = useCallback((repUid: string, label = '') => {
    if (state.columnChoice?.source === 'spell' && state.pendingSpell) {
      const action = { action: 'execute_spell', hero_key: state.pendingSpell, target_uid: repUid };
      if (!canAct(action)) return;
      sendAction(action);
      addLog(state.columnChoice.skillName + (label ? ' -> ' + label : ''));
      clearSpellSelection();
    } else if (state.columnChoice?.source === 'skill' && selectedMyFieldCard && state.columnChoice.skillKey) {
      const action = { action: 'use_skill', caster_uid: selectedMyFieldCard.uid, skill_key: state.columnChoice.skillKey, target_uid: repUid };
      if (!canAct(action)) return;
      sendAction(action);
      addLog(selectedMyFieldCard.name + (label ? ' -> ' + label : '') + ' (' + state.columnChoice.skillName + ')');
    }
    setters.setColumnChoice(null);
    setters.setActionMode(null);
    setters.setSelectedHandIdx(null);
  }, [addLog, canAct, clearSpellSelection, selectedMyFieldCard, sendAction, setters, state.columnChoice, state.pendingSpell]);

  const cancelColumnChoice = useCallback(() => {
    setters.setColumnChoice(null);
    clearSpellSelection();
  }, [clearSpellSelection, setters]);

  const cancelPendingSpell = useCallback(() => {
    setters.setActionMode(null);
    clearSpellSelection();
    clearDuplicateTarget();
  }, [clearDuplicateTarget, clearSpellSelection, setters]);

  const useSelectedSpell = useCallback(() => {
    handlePlace('main');
  }, [handlePlace]);

  const cancelSelectedHand = useCallback(() => {
    setters.setSelectedHandIdx(null);
  }, [setters]);

  const resolveMercy = useCallback((trashIndex: number) => {
    setters.setLocalPendingPassive?.(null);
    const action = { action: 'resolve_passive_choice', trash_index: trashIndex };
    if (!canAct(action)) return;
    sendAction(action);
  }, [canAct, sendAction, setters]);

  const skipMercy = useCallback(() => {
    setters.setLocalPendingPassive?.(null);
    const action = { action: 'resolve_passive_choice', skip: true };
    if (!canAct(action)) return;
    sendAction(action);
  }, [canAct, sendAction, setters]);

  const skipJetpackCat = useCallback(() => {
    setters.setSelectedHandIdx(null);
    setters.setLocalPendingPassive?.(null);
    const action = { action: 'resolve_passive_choice', skip: true };
    if (!canAct(action)) return;
    sendAction(action);
  }, [canAct, sendAction, setters]);

  const resolveSpellChoice = useCallback((index: number, mode: 'trash' | 'draw') => {
    if (!pendingSpellChoice?.hero_key) return;
    setters.setLocalPendingSpellChoice?.(null);
    const action = mode === 'trash'
        ? { action: 'execute_spell', hero_key: pendingSpellChoice.hero_key, trash_index: index }
        : { action: 'execute_spell', hero_key: pendingSpellChoice.hero_key, draw_index: index };
    if (!canAct(action)) return;
    sendAction(action);
  }, [canAct, pendingSpellChoice, sendAction, setters]);

  const handleEndMainButton = useCallback(() => {
    if (phase === 'placement') {
      const action = { action: 'end_placement' };
      if (!canAct(action)) return;
      sendAction(action);
      addLog('배치 완료');
      return;
    }
    if (phase === 'action') {
      const action = { action: 'end_turn' };
      if (!canAct(action)) return;
      sendAction(action);
      addLog('턴 종료');
    }
  }, [addLog, canAct, phase, sendAction]);

  return {
    duplicateTargetUid,
    duplicateTargetRole,
    duplicateTargetName,
    clearDuplicateTarget,
    handleHandClick,
    canSelectEmptySlot,
    handleEmptySlotSelect,
    handleFieldClick,
    handlePlace,
    prepareSkill,
    runMulligan,
    skipMulligan,
    selectColumn,
    cancelColumnChoice,
    cancelPendingSpell,
    useSelectedSpell,
    cancelSelectedHand,
    resolveMercy,
    skipMercy,
    skipJetpackCat,
    resolveSpellChoice,
    handleEndMainButton,
  };
}
