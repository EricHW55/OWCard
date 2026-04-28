import type { HandCard } from '../../types/game';
import type { TutorialTooltipData } from '../../components/TutorialTooltip';

export type TutorialZone = 'main' | 'side';
export type TutorialScriptAction =
  | { type: 'tooltip'; tooltip: TutorialTooltipData }
  | { type: 'player_place'; cardKey: string; zone: TutorialZone; slotIndex?: 0 | 1; hint: string }
  | { type: 'player_spell'; cardKey: string; hint: string }
  | { type: 'player_end_placement'; hint: string }
  | { type: 'player_end_turn'; hint: string }
  | { type: 'player_skill'; casterUid: string; targetUid: string; hint: string }
  | { type: 'player_free_skill'; targetUid: string; hint: string }
  | { type: 'auto_place'; owner: 'opponent'; cardKey: string; zone: TutorialZone; slotIndex?: 0 | 1; delayMs: number }
  | { type: 'auto_skill'; owner: 'opponent'; casterUid: string; targetUid: string; delayMs: number }
  | { type: 'auto_end_placement'; owner: 'opponent'; delayMs: number }
  | { type: 'auto_end_turn'; owner: 'opponent'; delayMs: number }
  | { type: 'victory'; tooltip: TutorialTooltipData };

export type TutorialCardDefinition = HandCard & {
  uid: string;
  fieldName?: string;
  spellDescription?: string;
  tutorialDamage?: number;
  tutorialHeal?: number;
};

const skill = (name: string, description: string, cooldown = 0) => ({ name, description, cooldown });

export const TUTORIAL_CARDS: Record<string, TutorialCardDefinition> = {
  winston: {
    uid: 'tut-winston',
    id: 9001,
    hero_key: 'winston',
    name: '윈스턴',
    role: 'tank',
    hp: 20,
    cost: 2,
    base_attack: 0,
    base_defense: 0,
    base_attack_range: 1,
    skill_damages: { skill_1: 5 },
    skill_meta: { skill_1: skill('테슬라 캐논', '가로줄 대상에게 5 피해를 줍니다.') },
    description: '전방을 지키는 탱커입니다.',
    tutorialDamage: 5,
  },
  soldierA: {
    uid: 'tut-soldier-a',
    id: 9002,
    hero_key: 'soldier_76',
    name: '솔저',
    fieldName: '솔저',
    role: 'dealer',
    hp: 12,
    cost: 1,
    base_attack: 0,
    base_defense: 0,
    base_attack_range: 1,
    skill_damages: { skill_1: 6 },
    skill_meta: { skill_1: skill('펄스 소총', '대상에게 6 피해를 줍니다.') },
    description: '기본 공격을 담당하는 딜러입니다.',
    tutorialDamage: 6,
  },
  soldierB: {
    uid: 'tut-soldier-b',
    id: 9003,
    hero_key: 'soldier_76',
    name: '솔저',
    fieldName: '솔저',
    role: 'dealer',
    hp: 12,
    cost: 1,
    base_attack: 0,
    base_defense: 0,
    base_attack_range: 1,
    skill_damages: { skill_1: 6 },
    skill_meta: { skill_1: skill('펄스 소총', '대상에게 6 피해를 줍니다.') },
    description: '사이드 공격을 배우기 위한 딜러입니다.',
    tutorialDamage: 6,
  },
  ana: {
    uid: 'tut-ana',
    id: 9004,
    hero_key: 'ana',
    name: '아나',
    role: 'healer',
    hp: 8,
    cost: 1,
    base_attack: 0,
    base_defense: 0,
    base_attack_range: 3,
    skill_damages: { skill_1: 5 },
    skill_meta: { skill_1: skill('생체 소총', '아군을 회복하거나 적에게 피해를 줍니다.') },
    description: '후방에서 지원하는 힐러입니다.',
    tutorialDamage: 5,
    tutorialHeal: 5,
  },
  soundBarrier: {
    uid: 'tut-sound-barrier',
    id: 9005,
    hero_key: 'sound_barrier',
    name: '소리 방벽',
    role: 'healer',
    hp: 0,
    cost: 1,
    base_attack: 0,
    base_defense: 0,
    base_attack_range: 0,
    skill_damages: {},
    skill_meta: {},
    description: '모든 아군에게 추가 생명력 15를 부여합니다.',
    spellDescription: '모든 아군에게 추가 생명력 15를 부여합니다.',
    is_spell: true,
  },
  hazard: {
    uid: 'tut-hazard',
    id: 9011,
    hero_key: 'hazard',
    name: '해저드',
    role: 'tank',
    hp: 20,
    cost: 2,
    base_attack: 0,
    base_defense: 0,
    base_attack_range: 1,
    skill_damages: { skill_2: 5 },
    skill_meta: { skill_2: skill('덤벼들기', '대상에게 5 피해를 줍니다.') },
    description: '공격받으면 반격 피해를 주는 탱커입니다.',
    tutorialDamage: 5,
  },
  reaper1: {
    uid: 'tut-reaper-1',
    id: 9012,
    hero_key: 'reaper',
    name: '리퍼',
    fieldName: '리퍼',
    role: 'dealer',
    hp: 12,
    cost: 1,
    base_attack: 0,
    base_defense: 0,
    base_attack_range: 1,
    skill_damages: { skill_1: 8 },
    skill_meta: { skill_1: skill('헬파이어 샷건', '근거리 대상에게 8 피해를 줍니다.') },
    description: '근거리 딜러입니다.',
    tutorialDamage: 8,
  },
  reaper2: {
    uid: 'tut-reaper-2',
    id: 9013,
    hero_key: 'reaper',
    name: '리퍼',
    fieldName: '리퍼',
    role: 'dealer',
    hp: 12,
    cost: 1,
    base_attack: 0,
    base_defense: 0,
    base_attack_range: 1,
    skill_damages: { skill_1: 8 },
    skill_meta: { skill_1: skill('헬파이어 샷건', '근거리 대상에게 8 피해를 줍니다.') },
    description: '사이드 대상을 노리는 딜러입니다.',
    tutorialDamage: 8,
  },
};

export const TUTORIAL_PLAYER_HAND = ['winston', 'soldierA', 'soldierB', 'ana', 'soundBarrier'];
export const TUTORIAL_OPPONENT_HAND = ['hazard', 'reaper1', 'reaper2'];

export const TUTORIAL_SCRIPT: TutorialScriptAction[] = [
  { type: 'tooltip', tooltip: { speaker: '튜토리얼', text: '튜토리얼은 정해진 행동만 따라가며 한 판을 끝까지 직접 플레이합니다.' } },
  { type: 'player_place', cardKey: 'soldierA', zone: 'main', slotIndex: 0, hint: '솔저를 본대 딜러 칸에 배치하세요.' },
  { type: 'tooltip', tooltip: { speaker: '튜토리얼', text: '선공의 첫 배치 턴에는 코스트를 1만 사용할 수 있습니다.' } },
  { type: 'player_end_placement', hint: '배치 종료 버튼을 눌러 전투 단계로 넘어가세요.' },
  { type: 'tooltip', tooltip: { speaker: '튜토리얼', text: '방금 배치한 영웅은 이번 전투 단계에 바로 스킬을 사용할 수 없습니다.' } },
  { type: 'player_end_turn', hint: '턴 종료 버튼을 눌러 상대 턴으로 넘기세요.' },
  { type: 'auto_place', owner: 'opponent', cardKey: 'hazard', zone: 'main', delayMs: 1200 },
  { type: 'auto_end_placement', owner: 'opponent', delayMs: 1900 },
  { type: 'auto_end_turn', owner: 'opponent', delayMs: 1100 },
  { type: 'player_place', cardKey: 'winston', zone: 'main', hint: '윈스턴을 본대 탱커 칸에 배치하세요.' },
  { type: 'tooltip', tooltip: { speaker: '튜토리얼', text: '탱커는 앞줄에서 아군을 보호합니다. 상대는 먼저 탱커를 처리해야 하는 경우가 많습니다.' } },
  { type: 'player_end_placement', hint: '배치 종료 버튼을 누르세요.' },
  { type: 'player_skill', casterUid: 'tut-soldier-a', targetUid: 'tut-hazard', hint: '솔저를 선택한 뒤 해저드를 공격하세요.' },
  { type: 'tooltip', tooltip: { speaker: '튜토리얼', text: '해저드를 공격한 영웅은 반격 피해를 받습니다.' } },
  { type: 'auto_place', owner: 'opponent', cardKey: 'reaper1', zone: 'main', slotIndex: 0, delayMs: 1200 },
  { type: 'auto_end_placement', owner: 'opponent', delayMs: 1900 },
  { type: 'auto_skill', owner: 'opponent', casterUid: 'tut-hazard', targetUid: 'tut-winston', delayMs: 1500 },
  { type: 'auto_end_turn', owner: 'opponent', delayMs: 1100 },
  { type: 'player_place', cardKey: 'ana', zone: 'main', slotIndex: 1, hint: '아나를 본대 오른쪽 힐러 칸에 배치하세요.' },
  { type: 'tooltip', tooltip: { speaker: '튜토리얼', text: '배치된 영웅은 다음 전투 단계부터 스킬을 사용할 수 있습니다.' } },
  { type: 'player_end_placement', hint: '배치 종료 버튼을 누르세요.' },
  { type: 'player_skill', casterUid: 'tut-soldier-a', targetUid: 'tut-hazard', hint: '솔저로 해저드를 다시 공격하세요.' },
  { type: 'player_skill', casterUid: 'tut-winston', targetUid: 'tut-hazard', hint: '윈스턴으로 해저드를 공격해 3 HP로 남기세요.' },
  { type: 'auto_place', owner: 'opponent', cardKey: 'reaper2', zone: 'main', slotIndex: 1, delayMs: 1200 },
  { type: 'auto_end_placement', owner: 'opponent', delayMs: 1900 },
  { type: 'auto_skill', owner: 'opponent', casterUid: 'tut-reaper-1', targetUid: 'tut-winston', delayMs: 1500 },
  { type: 'auto_end_turn', owner: 'opponent', delayMs: 1100 },
  { type: 'player_place', cardKey: 'soldierB', zone: 'side', hint: '솔저를 사이드 딜러 칸에 배치하세요.' },
  { type: 'tooltip', tooltip: { speaker: '튜토리얼', text: '사이드에 배치한 영웅은 사거리가 1 증가하지만 탱커의 보호를 받지 못합니다.' } },
  { type: 'player_spell', cardKey: 'soundBarrier', hint: '소리 방벽을 사용하세요.' },
  { type: 'tooltip', tooltip: { speaker: '튜토리얼', text: '스킬 카드는 배치 단계에 사용하며 즉시 효과를 발동합니다.' } },
  { type: 'player_end_placement', hint: '배치 종료 버튼을 누르세요.' },
  { type: 'player_skill', casterUid: 'tut-ana', targetUid: 'tut-winston', hint: '아나로 윈스턴을 회복하세요.' },
  { type: 'player_skill', casterUid: 'tut-winston', targetUid: 'tut-hazard', hint: '윈스턴으로 해저드를 제거하세요.' },
  { type: 'player_skill', casterUid: 'tut-soldier-a', targetUid: 'tut-reaper-1', hint: '솔저로 리퍼를 공격하세요.' },
  { type: 'player_end_turn', hint: '턴 종료 버튼을 눌러 상대 턴으로 넘기세요.' },
  { type: 'auto_skill', owner: 'opponent', casterUid: 'tut-reaper-1', targetUid: 'tut-winston', delayMs: 1500 },
  { type: 'auto_skill', owner: 'opponent', casterUid: 'tut-reaper-2', targetUid: 'tut-winston', delayMs: 1500 },
  { type: 'auto_end_turn', owner: 'opponent', delayMs: 1100 },
  { type: 'tooltip', tooltip: { speaker: '튜토리얼', text: '추가 생명력은 피해를 먼저 흡수하고, 지속 시간이 끝나면 사라집니다.' } },
  { type: 'player_end_placement', hint: '배치 종료 버튼을 눌러 전투 단계로 넘어가세요.' },
  { type: 'player_skill', casterUid: 'tut-soldier-b', targetUid: 'tut-reaper-1', hint: '사이드의 솔저로 리퍼를 제거하세요.' },
  { type: 'player_skill', casterUid: 'tut-soldier-a', targetUid: 'tut-reaper-2', hint: '솔저로 리퍼를 공격하세요.' },
  { type: 'player_skill', casterUid: 'tut-winston', targetUid: 'tut-reaper-2', hint: '윈스턴으로 리퍼를 이어서 공격하세요.' },
  { type: 'player_end_turn', hint: '턴 종료 버튼을 눌러 상대 턴으로 넘기세요.' },
  { type: 'auto_skill', owner: 'opponent', casterUid: 'tut-reaper-2', targetUid: 'tut-soldier-b', delayMs: 1500 },
  { type: 'tooltip', tooltip: { speaker: '튜토리얼', text: '사이드 영웅은 탱커가 있어도 상대 공격 대상이 될 수 있습니다.' } },
  { type: 'auto_end_turn', owner: 'opponent', delayMs: 1100 },
  { type: 'player_end_placement', hint: '배치 종료 버튼을 눌러 마지막 전투 단계로 넘어가세요.' },
  { type: 'player_free_skill', targetUid: 'tut-reaper-2', hint: '남은 영웅으로 리퍼를 제거하세요.' },
  { type: 'victory', tooltip: { speaker: '튜토리얼', text: '승리했습니다. 이제 실제 게임에서도 같은 흐름으로 배치, 스킬, 턴 종료를 진행하면 됩니다.' } },
];
