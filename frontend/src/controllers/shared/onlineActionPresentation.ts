import type { BattleLogActor, BattleLogEntry } from '../../types/game';
import { getColumnTargetSideForSpell, getHeroKey, getSkillDescriptionFromCard, isColumnTargetSpell } from './gamePresentation';
import type { GameUiPreset } from './gameUiPreset';
import { ONLINE_GAME_UI_PRESET } from './gameUiPreset';

type Team = 'my' | 'opponent';

type PushBattleLog = (entry: Omit<BattleLogEntry, 'id'>) => void;

type ToActor = (card: any, fallbackName?: string) => BattleLogActor;

export function pushPlacementActionLogs(params: {
    action: string;
    result: any;
    team: Team;
    turn?: number;
    myHand?: any[];
    spellName?: string;
    toActor: ToActor;
    pushBattleLog: PushBattleLog;
}) {
    const { action, result, team, turn, myHand = [], spellName, toActor, pushBattleLog } = params;
    if (action !== 'place_card') return;
    const placedCard = result?.card || null;

    if (placedCard && !placedCard?.is_spell) {
        pushBattleLog({
            type: 'placement',
            team,
            turn,
            actor: toActor(placedCard, placedCard?.name || '영웅'),
            text: `${placedCard?.name || '영웅'} 배치`,
        });
    }

    if ((placedCard && placedCard?.is_spell) || result?.type === 'spell_played') {
        const fallbackSpellCard = myHand.find((c: any) => c.hero_key === result?.hero_key);
        const spellCard = placedCard || result?.card || fallbackSpellCard || null;
        if (!spellCard) return;
        pushBattleLog({
            type: 'skill',
            team,
            turn,
            actor: toActor(spellCard, spellCard?.name || '스킬 카드'),
            skillName: spellName || result?.skill_name || result?.skill || spellCard?.name || '스킬 카드',
        });
    }
}

export function handleSpellPlayedPlacementUi(params: {
    action: string;
    result: any;
    spellName: string;
    addLog: (message: string) => void;
    showSystemNotice: (title: string, subtitle?: string, duration?: number) => void;
    setPendingSpellCard: (card: any) => void;
    setPendingSpell: (heroKey: string | null) => void;
    setPendingSpellName: (name: string | null) => void;
    setActionMode: (mode: string | null) => void;
    setColumnChoice: (choice: {
        source: 'spell';
        heroKey?: string;
        skillName: string;
        targetSide: 'my' | 'opponent';
    } | null) => void;
    setLocalPendingSpellChoice: (choice: any | null) => void;
    resetDuplicateTarget: () => void;
    showSkillUse: (payload: {
        skillName: string;
        description?: string;
        heroKey?: string;
        imageName?: string;
        isSpell?: boolean;
        duration?: number;
    }) => void;
    myHand: any[];
    uiPreset?: GameUiPreset;
}) {
    const {
        action,
        result,
        spellName,
        addLog,
        showSystemNotice,
        setPendingSpellCard,
        setPendingSpell,
        setPendingSpellName,
        setActionMode,
        setColumnChoice,
        setLocalPendingSpellChoice,
        resetDuplicateTarget,
        showSkillUse,
        myHand,
        uiPreset = ONLINE_GAME_UI_PRESET,
    } = params;

    if (action !== 'place_card' || result?.type !== 'spell_played') return;

    if (result?.needs_target) {
        setPendingSpellCard(result?.card || null);
        if (result?.hero_key === 'spell_duplicate') resetDuplicateTarget();
        setPendingSpell(result.hero_key);
        setPendingSpellName(spellName);
        setLocalPendingSpellChoice(null);
        addLog('스킬 카드 대상 선택');

        if (isColumnTargetSpell(result?.hero_key)) {
            setActionMode(null);
            setColumnChoice({
                source: 'spell',
                heroKey: result.hero_key,
                skillName: spellName,
                targetSide: getColumnTargetSideForSpell(result?.hero_key),
            });
            showSystemNotice(spellName, '열을 선택하세요', uiPreset.timings.spellTargetNoticeMs);
        } else {
            setActionMode('spell');
            setColumnChoice(null);
            showSystemNotice(spellName, '대상을 선택하세요', uiPreset.timings.spellTargetNoticeMs);
        }
        return;
    }

    if (result?.needs_choice) {
        setPendingSpellCard(result?.card || null);
        setPendingSpell(null);
        setPendingSpellName(spellName);
        setActionMode(null);
        setLocalPendingSpellChoice(result?.choice || null);
        addLog('스킬 카드 추가 선택 필요');
        showSystemNotice(spellName, '카드를 선택하세요', uiPreset.timings.spellChoiceNoticeMs);
        return;
    }

    if (!result?.needs_target && !result?.needs_choice) {
        const spellCard = myHand.find((c: any) => c.hero_key === result?.hero_key) || result?.card;
        showSkillUse({
            skillName: result?.skill_name || result?.skill || spellName,
            description: getSkillDescriptionFromCard(spellCard),
            heroKey: result?.hero_key || spellCard?.hero_key || '',
            imageName: spellCard?.name || spellName,
            isSpell: true,
            duration: uiPreset.timings.skillUseMs,
        });
        setLocalPendingSpellChoice(null);
    }
}

export function handlePassiveTriggeredUi(params: {
    result: any;
    actorName: string;
    myCasterCard: any;
    msgHeroKey?: string;
    addLog: (message: string) => void;
    showSystemNotice: (title: string, subtitle?: string, duration?: number) => void;
    showSkillUseAfterPlacement: (payload: {
        skillName: string;
        subtitle?: string;
        description?: string;
        heroKey?: string;
        imageName?: string;
        isSpell?: boolean;
        duration?: number;
    }) => void;
    setLocalPendingPassive: (value: any | null) => void;
    uiPreset?: GameUiPreset;
}) {
    const {
        result,
        actorName,
        myCasterCard,
        msgHeroKey,
        addLog,
        showSystemNotice,
        showSkillUseAfterPlacement,
        setLocalPendingPassive,
        uiPreset = ONLINE_GAME_UI_PRESET,
    } = params;

    if (result?.passive_triggered?.summoned) {
        addLog(`설치물 소환: ${result.passive_triggered.summoned.name}`);
        showSystemNotice(result.passive_triggered.summoned.name, '설치물 소환', uiPreset.timings.passiveNoticeMs);
    }
    if (result?.passive_triggered?.passive) {
        showSkillUseAfterPlacement({
            skillName: result.passive_triggered.passive,
            subtitle: `${actorName} 패시브`,
            description: result?.passive_triggered?.message || '',
            heroKey: getHeroKey(myCasterCard) || String(result?.caster?.hero_key || msgHeroKey || ''),
            imageName: myCasterCard?.name || actorName,
            isSpell: false,
            duration: 3000,
        });
    }
    if (result?.passive_triggered?.needs_choice) {
        setLocalPendingPassive(result.passive_triggered.needs_choice);
        addLog('패시브 추가 선택 필요');
        if (result.passive_triggered.passive) showSystemNotice(result.passive_triggered.passive, '선택이 필요합니다', uiPreset.timings.passiveNoticeMs);
    }
}