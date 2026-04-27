import type { FieldCard, FieldState } from '../../types/game';
import {
  getChargeLevel,
  getHeroKey,
  getHeroSkillBlockReason,
  getSkillNameFromCard,
  isTargetlessSkill,
  needsColumnSelector,
} from './gamePresentation';

export type SkillPreparationResult =
  | { kind: 'blocked'; skillName: string; reason: string }
  | { kind: 'targetless'; skillName: string }
  | { kind: 'column'; skillName: string; heroKey: string; reason?: string }
  | { kind: 'hazard_wall'; skillName: string }
  | { kind: 'targeted'; skillName: string };

export function resolveSkillPreparation(caster: FieldCard, skillKey: string): SkillPreparationResult {
  const skillName = getSkillNameFromCard(caster, skillKey);
  const blockReason = getHeroSkillBlockReason(caster, skillKey);
  if (blockReason) return { kind: 'blocked', skillName, reason: blockReason };
  if (isTargetlessSkill(caster, skillKey)) return { kind: 'targetless', skillName };
  if (needsColumnSelector(caster, skillKey)) {
    if (getChargeLevel(caster) <= 0) return { kind: 'column', skillName, heroKey: getHeroKey(caster), reason: '차징샷은 차징 1단계 이상 필요' };
    return { kind: 'column', skillName, heroKey: getHeroKey(caster) };
  }
  if (getHeroKey(caster) === 'hazard' && skillKey === 'skill_1') return { kind: 'hazard_wall', skillName };
  return { kind: 'targeted', skillName };
}

export function canSelectHazardWallEmptySlot(params: {
  caster: FieldCard | null;
  actionMode: string | null;
  myField?: FieldState | null;
  opponentField?: FieldState | null;
  zone: 'main' | 'side';
  role: 'tank' | 'dealer' | 'healer';
  slotIndex: 0 | 1;
  isOpponent: boolean;
}) {
  if (params.actionMode !== 'skill_1') return false;
  if (!params.caster || getHeroKey(params.caster) !== 'hazard') return false;
  const field = params.isOpponent ? params.opponentField : params.myField;
  const cards = params.zone === 'main' ? (field?.main || []) : (field?.side || []);
  return !cards.some((card: any) => card.role === params.role && Number(card?.extra?.slot_index ?? 0) === params.slotIndex);
}
