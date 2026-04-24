import { useMemo } from 'react';
import type { FieldCard, FieldState, HandCard } from '../../types/game';
import { formatSkillValue } from '../../utils/skillValue';
import {
  buildColumnChoices,
  getChargeLevel,
  getHeroKey,
  getSkillNameFromCard,
} from './gamePresentation';
import { shouldShowSharedContextPanel } from './gameUiPreset';

export type FieldSkill = {
  key: string;
  name: string;
  description: string;
  onCooldown: boolean;
  cdLeft: number;
  valueText?: string;
};

export type SharedColumnChoice = {
  source: 'skill' | 'spell';
  heroKey?: string;
  skillKey?: string;
  skillName: string;
  targetSide: 'my' | 'opponent';
};

export type GameFlowPlayerState = {
  hand?: HandCard[];
  field?: FieldState;
  mulligan_done?: boolean;
  mulliganDone?: boolean;
};

export function getAllFieldCards(field?: FieldState | null): FieldCard[] {
  return [...(field?.main || []), ...(field?.side || [])];
}

export function buildFieldSkills(params: {
  selectedCard: FieldCard | null;
  phase: string;
  isMyTurn: boolean;
}): FieldSkill[] {
  const { selectedCard, phase, isMyTurn } = params;
  if (!selectedCard || selectedCard.placed_this_turn || selectedCard.acted_this_turn || phase !== 'action' || !isMyTurn) {
    return [];
  }

  const meta = selectedCard.skill_meta || {};
  const cds = selectedCard.skill_cooldowns || {};
  const skillDamages = selectedCard.skill_damages || {};
  const heroKey = getHeroKey(selectedCard);
  const chargeLevel = getChargeLevel(selectedCard);

  return Object.entries(meta)
      .filter(([key]) => key.startsWith('skill_'))
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
      .map(([key, m]) => {
        let displayName = (m as any)?.name || key;
        if (heroKey === 'sojourn' && key === 'skill_2') displayName = `${displayName} [${chargeLevel}단계]`;
        return {
          key,
          name: displayName,
          description: String((m as any)?.description || ''),
          onCooldown: (cds[key] ?? 0) > 0,
          cdLeft: cds[key] ?? 0,
          valueText: formatSkillValue((skillDamages as Record<string, unknown>)[key]),
        };
      });
}

export function computeActionableUids(params: {
  field?: FieldState | null;
  phase: string;
  isMyTurn: boolean;
}): string[] {
  if (params.phase !== 'action' || !params.isMyTurn) return [];
  return getAllFieldCards(params.field)
      .filter((card) => !card.placed_this_turn && !card.acted_this_turn)
      .map((card) => card.uid);
}

export function useGameFlowState(params: {
  my: GameFlowPlayerState | null;
  opponent: GameFlowPlayerState | null;
  phase: string;
  isMyTurn: boolean;
  selectedHandIdx: number | null;
  selectedFieldUid: string | null;
  actionMode: string | null;
  pendingSpell?: string | null;
  columnChoice?: SharedColumnChoice | null;
  pendingPassive?: any;
  pendingSpellChoice?: any;
}) {
  const {
    my,
    opponent,
    phase,
    isMyTurn,
    selectedHandIdx,
    selectedFieldUid,
    actionMode,
    pendingSpell = null,
    columnChoice = null,
    pendingPassive = null,
    pendingSpellChoice = null,
  } = params;

  const selectedHandCard = selectedHandIdx !== null && my?.hand ? my.hand[selectedHandIdx] || null : null;
  const allMyField = useMemo(() => getAllFieldCards(my?.field), [my?.field]);
  const selectedMyFieldCard = useMemo(
      () => allMyField.find((card) => card.uid === selectedFieldUid) || null,
      [allMyField, selectedFieldUid],
  );
  const enemyColumns = useMemo(() => buildColumnChoices(opponent?.field), [opponent?.field]);
  const myColumns = useMemo(() => buildColumnChoices(my?.field), [my?.field]);
  const availableColumns = columnChoice?.targetSide === 'my' ? myColumns : enemyColumns;
  const selectedHeroKey = getHeroKey(selectedMyFieldCard);
  const selectedChargeLevel = getChargeLevel(selectedMyFieldCard);
  const actionModeLabel = (actionMode && actionMode !== 'spell' && actionMode !== 'duplicate_place' && selectedMyFieldCard)
      ? getSkillNameFromCard(selectedMyFieldCard, actionMode)
      : null;
  const canActUids = useMemo(
      () => computeActionableUids({ field: my?.field, phase, isMyTurn }),
      [my?.field, phase, isMyTurn],
  );
  const fieldSkills = useMemo(
      () => buildFieldSkills({ selectedCard: selectedMyFieldCard, phase, isMyTurn }),
      [selectedMyFieldCard, phase, isMyTurn],
  );
  const mulliganDone = !!(my?.mulligan_done ?? my?.mulliganDone);
  const showContextPanel = shouldShowSharedContextPanel({
    phase,
    isMyTurn,
    mulliganVisible: !!my && phase === 'mulligan' && !mulliganDone,
    hasFieldSkills: fieldSkills.length > 0,
    actionMode,
    pendingSpell,
    selectedHandSpell: !!selectedHandCard?.is_spell,
    hasColumnChoice: !!columnChoice,
    pendingPassiveType: pendingPassive?.type,
    hasPendingSpellChoice: !!pendingSpellChoice,
  });

  return {
    selectedHandCard,
    allMyField,
    selectedMyFieldCard,
    enemyColumns,
    myColumns,
    availableColumns,
    selectedHeroKey,
    selectedChargeLevel,
    actionModeLabel,
    canActUids,
    fieldSkills,
    showContextPanel,
  };
}
