import type { BattleLogActor, BattleLogEntry, GameState } from '../../types/game';
import {
  collectAllFieldCards,
  getHeroKey,
} from './gamePresentation';

type ShowSkillUse = (payload: {
  skillName: string;
  subtitle?: string;
  description?: string;
  heroKey?: string;
  imageName?: string;
  isSpell?: boolean;
  duration?: number;
  nonBlocking?: boolean;
}) => void;

type ShowSystemNotice = (title: string, subtitle?: string, duration?: number) => void;

export function showPassiveNoticeFromLog(params: {
  entry: any;
  owner: 'my' | 'opponent';
  gameState: GameState | null;
  showSkillUseAfterPlacement: ShowSkillUse;
  showSystemNotice: ShowSystemNotice;
}) {
  const { entry, owner, gameState, showSkillUseAfterPlacement, showSystemNotice } = params;
  if (!entry) return;
  const ownerState = owner === 'my' ? gameState?.my_state : gameState?.opponent_state;
  const allCards = [...(ownerState?.field?.main || []), ...(ownerState?.field?.side || [])];
  const sourceCard = allCards.find((card: any) => card.uid === entry?.source_uid);
  const sourceName = sourceCard?.name || entry?.source_name || (owner === 'my' ? '아군' : '상대');
  const sourceHeroKey = getHeroKey(sourceCard);

  if (entry?.type === 'turn_start_passive' && entry?.result?.passive) {
    showSkillUseAfterPlacement({
      skillName: entry.result.passive,
      subtitle: `${sourceName} 패시브`,
      description: entry?.result?.message || '',
      heroKey: sourceHeroKey,
      imageName: sourceName,
      isSpell: false,
      duration: 3000,
    });
    return;
  }

  if (entry?.type === 'auto_turret') {
    showSystemNotice('포탑 자동 공격', sourceName, 1400);
    return;
  }
  if (entry?.type === 'auto_heal') showSystemNotice('자동 치유', sourceName, 1400);
}

export function showDeathPassiveNotice(params: {
  result: any;
  gameState: GameState | null;
  showSkillUse: ShowSkillUse;
  showSystemNotice: ShowSystemNotice;
  pushBattleLog?: (entry: Omit<BattleLogEntry, 'id'>) => void;
  toActor?: (card: any, fallbackName?: string) => BattleLogActor;
}) {
  const { result, gameState, showSkillUse, showSystemNotice, pushBattleLog, toActor } = params;
  if (!gameState || !result) return;

  const allCards = collectAllFieldCards(gameState);
  const myUids = new Set([
    ...(gameState?.my_state?.field?.main || []),
    ...(gameState?.my_state?.field?.side || []),
  ].map((card: any) => card.uid));
  const seen = new Set<string>();
  const queue: any[] = [result];

  while (queue.length > 0) {
    const node = queue.shift();
    if (!node || typeof node !== 'object') continue;
    const isDeathPassive = !!(node?.death_prevented || node?.prevent_death || node?.transform || node?.summon || node?.enter_frozen || node?.reflect_by === 'reflect');
    if (isDeathPassive) {
      const key = `${node?.by || ''}:${node?.reflect_by || ''}:${node?.target || node?.uid || ''}:${node?.transform || ''}:${node?.enter_frozen ? 1 : 0}`;
      if (!seen.has(key)) {
        seen.add(key);
        const sourceUid = node?.target || node?.uid || node?.source_uid;
        const sourceCard = allCards.find((card: any) => card.uid === sourceUid);
        const sourceName = sourceCard?.name || '영웅';

        const team = sourceCard && myUids.has(sourceCard.uid) ? 'my' : 'opponent';
        const pushActivationLog = (skillName: string, heroKey: string) => {
          pushBattleLog?.({
            type: 'skill',
            team,
            turn: gameState?.turn,
            actor: toActor ? toActor({ hero_key: heroKey, name: skillName, is_spell: true }, skillName) : { name: skillName, heroKey, isSpell: true },
            skillName,
            target: toActor ? toActor(sourceCard, sourceName) : { name: sourceName, heroKey: getHeroKey(sourceCard) },
          });
        };

        if (node?.by === 'mech_destruction' || node?.transform === 'hana_song' || node?.summon === 'hana_song') {
          showSkillUse({ skillName: '긴급 탈출', subtitle: `${sourceName} 패시브`, description: '메카 파괴 시 송하나 카드를 소환합니다.', heroKey: getHeroKey(sourceCard) || 'dva', imageName: sourceCard?.name || sourceName, isSpell: false, duration: 2600 });
        } else if (node?.by === 'frozen_revive' || node?.enter_frozen) {
          showSkillUse({ skillName: '급속 빙결', subtitle: `${sourceName} 패시브`, description: '치명 피해 시 빙결 상태가 되고 다음 턴 시작에 회복합니다.', heroKey: getHeroKey(sourceCard) || 'mei', imageName: sourceCard?.name || sourceName, isSpell: false, duration: 2600 });
        } else if (node?.by === 'immortality') {
          pushActivationLog('불사장치', 'spell_immortality_field');
          showSkillUse({ skillName: '불사장치', subtitle: `${sourceName} 발동`, description: '치명 피해를 무효화하고 체력을 1 남깁니다.', heroKey: 'spell_immortality_field', imageName: '불사장치', isSpell: true, duration: 2600 });
        } else if (node?.by === 'phoenix_rebirth_seed') {
          pushActivationLog('불사조 부활', 'spell_phoenix_rebirth');
          showSkillUse({ skillName: '불사조 부활', subtitle: `${sourceName} 발동`, description: '치명 피해 시 부활 대기 상태가 되고, 턴 경과 후 최대 체력으로 부활합니다.', heroKey: 'spell_phoenix_rebirth', imageName: '불사조 부활', isSpell: true, duration: 2600 });
        } else if (node?.reflect_by === 'reflect') {
          pushActivationLog('튕겨내기', 'spell_deflect');
          showSkillUse({ skillName: '튕겨내기', subtitle: `${sourceName} 발동`, description: '치명 피해를 반사하여 공격자를 저지합니다.', heroKey: 'spell_deflect', imageName: '튕겨내기', isSpell: true, duration: 2600 });
        } else {
          showSystemNotice(sourceName, '사망 패시브 발동', 1200);
        }
      }
    }
    Object.values(node).forEach((value) => {
      if (value && typeof value === 'object') queue.push(value);
    });
  }
}

export function showReactivePassiveFromStateDiff(params: {
  prevState: GameState | null;
  nextState: GameState | null;
  showSkillUse: ShowSkillUse;
}) {
  const { prevState, nextState, showSkillUse } = params;
  if (!prevState || !nextState) return;

  const detectKirikoSwiftStep = (ownerLabel: string, prevCards: any[], nextCards: any[]) => {
    const prevByUid = new Map(prevCards.map((card: any) => [card.uid, card]));
    for (const nextCard of nextCards) {
      const prevCard = prevByUid.get(nextCard.uid);
      if (!prevCard) continue;
      if (getHeroKey(nextCard) !== 'kiriko') continue;
      if ((prevCard as any).zone !== 'side' || nextCard.zone !== 'main') continue;
      const threshold = Number(nextCard?.extra?.swift_step_threshold ?? 4);
      if (Number(nextCard?.current_hp ?? 0) > threshold) continue;
      showSkillUse({
        skillName: '순보',
        subtitle: `${ownerLabel} 패시브`,
        description: `체력이 ${threshold} 이하가 되어 본대로 이동합니다.`,
        heroKey: 'kiriko',
        imageName: nextCard?.name || '키리코',
        isSpell: false,
        duration: 2600,
      });
    }
  };

  const prevMy = [...(prevState?.my_state?.field?.main || []), ...(prevState?.my_state?.field?.side || [])];
  const prevOpp = [...(prevState?.opponent_state?.field?.main || []), ...(prevState?.opponent_state?.field?.side || [])];
  const nextMy = [...(nextState?.my_state?.field?.main || []), ...(nextState?.my_state?.field?.side || [])];
  const nextOpp = [...(nextState?.opponent_state?.field?.main || []), ...(nextState?.opponent_state?.field?.side || [])];
  detectKirikoSwiftStep('아군', prevMy, nextMy);
  detectKirikoSwiftStep('상대', prevOpp, nextOpp);
}

export function handleSwiftStrikeResetPresentation(params: {
  result: any;
  msg: any;
  casterCard: any;
  actorName: string;
  resolvedSkillName: string | null;
  showSkillUse: ShowSkillUse;
  setSelectedHandIdx: (value: number | null) => void;
  setColumnChoice: (value: any | null) => void;
  setSelectedFieldUid: (value: string | null) => void;
  setActionMode: (value: string | null) => void;
  addLog: (message: string) => void;
}) {
  const { result, msg, casterCard, actorName, resolvedSkillName, showSkillUse, setSelectedHandIdx, setColumnChoice, setSelectedFieldUid, setActionMode, addLog } = params;
  const usedSkillKey = String(result?.skill_key || msg?.skill_key || '');
  const isSwiftStrikeReset = !!(result?.swift_strike_reset && usedSkillKey === 'skill_1');
  if (!isSwiftStrikeReset) return false;

  const casterName = result?.caster_name || casterCard?.name || actorName || '겐지';
  showSkillUse({
    skillName: '질풍참 초기화',
    description: '처치 성공 시 질풍참이 즉시 초기화됩니다. 대상을 다시 선택하세요.',
    heroKey: getHeroKey(casterCard) || String(result?.caster?.hero_key || msg?.hero_key || ''),
    imageName: casterCard?.name || result?.caster_name || result?.caster?.name || actorName,
    subtitle: `${casterName} 처치 성공`,
    isSpell: false,
    duration: 1000,
    nonBlocking: true,
  });

  const casterUid = result?.caster_uid || msg?.caster_uid || casterCard?.uid || null;
  const forcedSkillName = resolvedSkillName || '질풍참';
  setSelectedHandIdx(null);
  setColumnChoice(null);
  if (casterUid) setSelectedFieldUid(casterUid);
  setActionMode('skill_1');
  addLog(`${forcedSkillName} 초기화: 대상을 다시 선택하세요`);
  return true;
}
