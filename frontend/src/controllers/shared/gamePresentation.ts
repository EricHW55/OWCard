import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { BattleLogActor, BattleLogEntry, GameState } from '../../types/game';

type EnqueueAnnouncer = (payload: {
    type: 'phase' | 'skill';
    title: string;
    subtitle?: string;
    description?: string;
    heroKey?: string;
    imageName?: string;
    isSpell?: boolean;
    duration?: number;
    nonBlocking?: boolean;
    onDone?: () => void;
}) => void;

type SkillUsePayload = {
    skillName: string;
    description?: string;
    heroKey?: string;
    imageName?: string;
    subtitle?: string;
    isSpell?: boolean;
    duration?: number;
    nonBlocking?: boolean;
    onDone?: () => void;
};

export type PushSkillActionLogParams = {
    team: 'my' | 'opponent';
    actorCard?: any;
    actorName?: string;
    skillName?: string;
    result: any;
    targetPool: any[];
};

export function useAnnouncerHelpers(params: {
    enqueueAnnouncer: EnqueueAnnouncer;
    uiTimersRef: MutableRefObject<number[]>;
    announcerDataRef?: MutableRefObject<any>;
    placementDelayMs: number;
}) {
    const showPhaseChange = useCallback((phaseName: string, phaseSub: string, duration = 1800) => {
        params.enqueueAnnouncer({ type: 'phase', title: phaseName, subtitle: phaseSub, duration });
    }, [params]);

    const showSystemNotice = useCallback((title: string, subtitle?: string, duration = 1300) => {
        if (!title) return;
        params.enqueueAnnouncer({ type: 'phase', title, subtitle, duration });
    }, [params]);

    const showSkillUse = useCallback((props: SkillUsePayload) => {
        if (!props.skillName) return;
        const rawHeroKey = String(props.heroKey || '').toLowerCase();
        const inferredSpell = rawHeroKey.startsWith('spell_');
        if (!props.nonBlocking && params.announcerDataRef) {
            params.announcerDataRef.current = {
                type: 'skill',
                title: props.skillName,
                nonBlocking: false,
            };
        }
        params.enqueueAnnouncer({
            type: 'skill',
            title: props.skillName,
            description: props.description || '',
            heroKey: props.heroKey || '',
            imageName: props.imageName,
            subtitle: props.subtitle,
            isSpell: props.isSpell ?? inferredSpell,
            duration: props.duration || 3200,
            nonBlocking: !!props.nonBlocking,
            onDone: props.onDone,
        });
    }, [params]);

    const showSkillUseAfterPlacement = useCallback((props: SkillUsePayload, delay = params.placementDelayMs) => {
        const timerId = window.setTimeout(() => {
            showSkillUse(props);
        }, delay);
        params.uiTimersRef.current.push(timerId);
    }, [params, showSkillUse]);

    return { showPhaseChange, showSystemNotice, showSkillUse, showSkillUseAfterPlacement };
}

export function buildHeadshotCoinFaces(headshot: boolean): ['front' | 'back', 'front' | 'back'] {
    if (headshot) return ['front', 'front'];
    const misses: Array<['front' | 'back', 'front' | 'back']> = [
        ['back', 'back'],
        ['back', 'front'],
        ['front', 'back'],
    ];
    return misses[Math.floor(Math.random() * misses.length)] || ['back', 'back'];
}

export type OpponentSkillCue = {
    title: string;
    subtitle: string;
    heroKey?: string;
    imageName: string;
    isSpell: boolean;
    description: string;
};

export type ColumnPreview = {
    key: string;
    label: string;
    repUid: string;
    names: string[];
};

export function resolveHeadshotOutcome(result: any): boolean | null {
    if (typeof result?.headshot === 'boolean') return result.headshot;
    const coinResult = String(result?.coin_result || '').toLowerCase().trim();
    if (!coinResult) return null;
    if (coinResult === 'heads' || coinResult === 'head') return true;
    if (coinResult === 'tails' || coinResult === 'tail') return false;
    return null;
}

export function findFieldCardByUid(state: any, uid?: string | null) {
    if (!state || !uid) return null;
    const cards = [...(state?.field?.main || []), ...(state?.field?.side || [])];
    return cards.find((c: any) => c?.uid === uid) || null;
}

export function getHeroKey(card: any): string {
    return String(card?.hero_key || card?.extra?._hero_key || card?.id || '').toLowerCase().trim();
}

export function getChargeLevel(card: any): number {
    const raw = card?.extra?.charge_level;
    return typeof raw === 'number' ? raw : Number(raw || 0);
}

export function getSkillNameFromCard(card: any, skillKey?: string | null) {
    const heroKey = getHeroKey(card);
    if (heroKey === 'kiriko' && skillKey === 'skill_1') {
        return card?.zone === 'side' ? '쿠나이' : '힐부적';
    }
    const meta = card?.skill_meta || {};
    if (skillKey && meta?.[skillKey]?.name) return meta[skillKey].name as string;
    if (meta?.skill_1?.name) return meta.skill_1.name as string;
    const first = Object.values(meta).find((item: any) => item?.name) as any;
    return first?.name || card?.name || '스킬';
}

export function getSkillDescriptionFromCard(card: any, skillRef?: string | null) {
    const meta = card?.skill_meta || {};
    const entries = Object.entries(meta) as [string, any][];

    if (skillRef) {
        if (meta?.[skillRef]?.description) return String(meta[skillRef].description);
        const ref = String(skillRef).trim();
        const byName = entries.find(([, item]) => String(item?.name || '').trim() === ref);
        if (byName?.[1]?.description) return String(byName[1].description);
    }

    const ordered = [...entries].sort((a, b) => {
        const getOrder = (key: string) => {
            if (key === 'passive') return -1;
            const match = key.match(/(\d+)/);
            return match ? Number(match[1]) : 999;
        };
        return getOrder(a[0]) - getOrder(b[0]);
    });

    const firstSkill = ordered.find(([key, item]) => key.startsWith('skill_') && item?.description)
        || ordered.find(([, item]) => item?.description);

    return firstSkill?.[1]?.description || card?.description || '';
}

export function buildOpponentSkillCue(msg: any, opponentState?: any, fallbackHeroKey?: string): OpponentSkillCue | null {
    const result = msg?.result || {};
    const action = msg?.action;
    const hiddenInstallSpellKeys = new Set(['spell_immortality_field', 'spell_deflect', 'spell_phoenix_rebirth']);
    const resultHeroKey = String(result?.hero_key || msg?.hero_key || result?.card?.hero_key || '').toLowerCase();
    const isHiddenInstallSpell = hiddenInstallSpellKeys.has(resultHeroKey);

    if (isHiddenInstallSpell && (result?.type === 'spell_played' || action === 'execute_spell' || action === 'place_card')) return null;
    if (action === 'place_card' && result?.type === 'spell_played' && (result?.needs_target || result?.needs_choice)) return null;
    if (result?.hidden) return null;

    const hasSkillSignal = action === 'use_skill' || action === 'execute_spell' || !!msg?.skill_name || !!result?.skill_name || !!result?.skill || result?.type === 'spell_played';
    if (!hasSkillSignal) return null;

    const actorName = msg?.caster_name || result?.caster_name || msg?.actor_name || msg?.card_name || result?.caster?.name || result?.card?.name || '상대';
    const skillName = msg?.skill_name || result?.skill_name || result?.skill || result?.display_name || result?.card?.skill_name || result?.card?.name;
    if (!skillName) return null;

    const isSpell = action === 'execute_spell' || result?.type === 'spell_played' || !!result?.card?.is_spell || String(result?.hero_key || msg?.hero_key || result?.card?.hero_key || '').startsWith('spell_');
    const oppField = opponentState ? [...(opponentState?.field?.main || []), ...(opponentState?.field?.side || [])] : [];
    const actorCard = oppField.find((c: any) => c.uid === (msg?.caster_uid || result?.caster_uid)) || oppField.find((c: any) => c.name === actorName) || result?.caster || null;
    const spellCard = result?.card || { hero_key: result?.hero_key || msg?.hero_key, name: skillName, is_spell: true, description: result?.description };
    const heroKey = isSpell
        ? (result?.hero_key || msg?.hero_key || spellCard?.hero_key || undefined)
        : (getHeroKey(actorCard) || result?.caster_hero_key || fallbackHeroKey || getHeroKey(result?.caster) || undefined);
    const description = isSpell
        ? getSkillDescriptionFromCard(spellCard, result?.skill_key || result?.skill || skillName)
        : getSkillDescriptionFromCard(actorCard, msg?.skill_key || result?.skill_key || result?.skill_name || result?.skill || skillName);

    return { title: skillName, subtitle: `${actorName} 사용`, heroKey, imageName: isSpell ? (spellCard?.name || skillName) : (actorCard?.name || actorName), isSpell, description };
}

export function buildSpectatorSkillCue(msg: any, currentState?: GameState | null): OpponentSkillCue | null {
    const result = msg?.result || {};
    const action = msg?.action;
    const hiddenInstallSpellKeys = new Set(['spell_immortality_field', 'spell_deflect', 'spell_phoenix_rebirth']);
    const resultHeroKey = String(result?.hero_key || msg?.hero_key || result?.card?.hero_key || '').toLowerCase();
    const isHiddenInstallSpell = hiddenInstallSpellKeys.has(resultHeroKey);

    if (isHiddenInstallSpell && (result?.type === 'spell_played' || action === 'execute_spell' || action === 'place_card')) return null;
    if (action === 'place_card' && result?.type === 'spell_played' && (result?.needs_target || result?.needs_choice)) return null;
    if (result?.hidden) return null;

    const hasSkillSignal = action === 'use_skill' || action === 'execute_spell' || !!msg?.skill_name || !!result?.skill_name || !!result?.skill || result?.type === 'spell_played';
    if (!hasSkillSignal) return null;

    const skillName = msg?.skill_name || result?.skill_name || result?.skill || result?.display_name || result?.card?.skill_name || result?.card?.name;
    if (!skillName) return null;

    const allFieldCards = [
        ...(currentState?.my_state?.field?.main || []),
        ...(currentState?.my_state?.field?.side || []),
        ...(currentState?.opponent_state?.field?.main || []),
        ...(currentState?.opponent_state?.field?.side || []),
    ];
    const actorName = msg?.caster_name || result?.caster_name || msg?.actor_name || msg?.card_name || result?.caster?.name || result?.card?.name || '플레이어';
    const actorCard = allFieldCards.find((c: any) => c.uid === (msg?.caster_uid || result?.caster_uid))
        || allFieldCards.find((c: any) => c.name === actorName)
        || result?.caster
        || null;

    const isSpell = action === 'execute_spell' || result?.type === 'spell_played' || !!result?.card?.is_spell || String(result?.hero_key || msg?.hero_key || result?.card?.hero_key || '').startsWith('spell_');
    const spellCard = result?.card || { hero_key: result?.hero_key || msg?.hero_key, name: skillName, is_spell: true, description: result?.description };
    const heroKey = isSpell
        ? (result?.hero_key || msg?.hero_key || spellCard?.hero_key || undefined)
        : (getHeroKey(actorCard) || result?.caster_hero_key || getHeroKey(result?.caster) || undefined);
    const description = isSpell
        ? getSkillDescriptionFromCard(spellCard, result?.skill_key || result?.skill || skillName)
        : getSkillDescriptionFromCard(actorCard, msg?.skill_key || result?.skill_key || result?.skill_name || result?.skill || skillName);

    return {
        title: skillName,
        subtitle: `${actorName} 사용`,
        heroKey,
        imageName: isSpell ? (spellCard?.name || skillName) : (actorCard?.name || actorName),
        isSpell,
        description,
    };
}

export function getSymmetraTeleportBlockReason(caster: any, target: any, myField: any): string | null {
    if (getHeroKey(caster) !== 'symmetra') return null;
    if (!target || !myField) return '행동 불가';
    const role = String(target?.role || '');
    const nextZone = target?.zone === 'main' ? 'side' : 'main';
    const sideCards = Array.isArray(myField?.side) ? myField.side : [];
    if (nextZone === 'side') {
        const hasSameRoleInSide = sideCards.some((c: any) => c?.uid !== target?.uid && c?.alive !== false && c?.role === role);
        if (!hasSameRoleInSide) return null;
        if (role === 'tank') return '행동 불가: 사이드 자리가 꽉 찼습니다';
        return `행동 불가: 사이드 ${role} 자리가 꽉 찼습니다`;
    }
    const mainCards = Array.isArray(myField?.main) ? myField.main : [];
    const occupiedSlots = new Set(
        mainCards
            .filter((c: any) => c?.uid !== target?.uid && c?.role === role && c?.alive !== false)
            .map((c: any) => Number(c?.extra?.slot_index ?? 0)),
    );
    const isMainBlocked = role === 'tank'
        ? occupiedSlots.has(0)
        : occupiedSlots.has(0) && occupiedSlots.has(1);
    if (!isMainBlocked) return null;
    if (role === 'tank') return '행동 불가: 본대 탱커 자리가 꽉 찼습니다';
    return `행동 불가: 본대 ${role} 자리가 꽉 찼습니다`;
}

export function collectFatalUids(node: any, found = new Set<string>()): Set<string> {
    if (!node || typeof node !== 'object') return found;
    const uid = node?.target || node?.uid;
    const remainingHp = node?.remaining_hp;
    if (uid && typeof remainingHp === 'number' && remainingHp <= 0) found.add(String(uid));
    Object.values(node).forEach((value) => {
        if (value && typeof value === 'object') collectFatalUids(value, found);
    });
    return found;
}

export function collectAllFieldCards(state: any) {
    return [
        ...(state?.my_state?.field?.main || []),
        ...(state?.my_state?.field?.side || []),
        ...(state?.opponent_state?.field?.main || []),
        ...(state?.opponent_state?.field?.side || []),
    ];
}

export function isTargetlessSkill(card: any, skillKey: string): boolean {
    const hero = getHeroKey(card);
    const statuses = card?.statuses || [];
    const hasStatus = (name: string) => statuses.some((s: any) => s?.name === name);

    if (hero === 'tracer' && skillKey === 'skill_2') return true;
    if (hero === 'freja' && skillKey === 'skill_1') return true;
    if (hero === 'venture' && skillKey === 'skill_1') return !hasStatus('burrowed');
    if (hero === 'soldier76' && skillKey === 'skill_1') return true;
    if (hero === 'lucio' && skillKey === 'skill_1') return true;
    if (hero === 'moira' && skillKey === 'skill_1') return true;
    if (hero === 'mizuki' && skillKey === 'skill_2') return true;
    if (hero === 'junkerqueen' && skillKey === 'skill_2') return true;
    if (hero === 'doomfist' && skillKey === 'skill_2') return true;
    if (hero === 'ramattra' && (skillKey === 'skill_2' || skillKey === 'skill_3')) return true;
    if (hero === 'sigma' && (skillKey === 'skill_1' || skillKey === 'skill_2')) return true;
    if (hero === 'domina' && skillKey === 'skill_2') return true;
    if (hero === 'roadhog' && skillKey === 'skill_2') return true;
    if (hero === 'torbjorn' && skillKey === 'skill_2') return true;
    return false;
}

export function needsColumnSelector(card: any, skillKey?: string | null): boolean {
    const hero = getHeroKey(card);
    return hero === 'sojourn' && skillKey === 'skill_2';
}

export function isColumnTargetSpell(heroKey?: string | null): boolean {
    const key = String(heroKey || '').toLowerCase().trim();
    return key === 'spell_thorn_volley'
        || key === 'spell_dragonblade'
        || key === 'spell_fox_path'
        || key === 'spell_slaughter';
}

export function getColumnTargetSideForSpell(heroKey?: string | null): 'my' | 'opponent' {
    const key = String(heroKey || '').toLowerCase().trim();
    if (key === 'spell_fox_path') return 'my';
    return 'opponent';
}

export function getHeroSkillBlockReason(card: any, skillKey: string): string | null {
    const hero = getHeroKey(card);
    const statuses = card?.statuses || [];
    const hasStatus = (name: string) => statuses.some((s: any) => s?.name === name);
    const extra = card?.extra || {};

    if (hero === 'bastion' && skillKey === 'skill_1' && extra?.last_mode === 'assault') return '설정: 강습은 연속 사용 불가 (수색 먼저)';
    if (hero === 'sombra' && skillKey === 'skill_2' && extra?.used_hack_last) return '해킹은 연속 사용 불가';
    if (hero === 'venture' && skillKey === 'skill_2' && hasStatus('burrowed')) return '잠복 상태에서는 스마트 굴착기 사용 불가';
    if (hero === 'freja' && skillKey === 'skill_2' && !hasStatus('airborne')) return '정조준은 에어본 상태에서만 사용 가능';
    if (hero === 'ramattra' && skillKey === 'skill_3' && extra?.form !== 'nemesis') return '막기는 네메시스 폼에서만 사용 가능';
    if (hero === 'roadhog' && skillKey === 'skill_2' && Number(card?.current_hp || 0) > Number(extra?.heal_threshold ?? 15)) {
        return `숨돌리기는 체력 ${extra?.heal_threshold ?? 15} 이하에서만 사용 가능`;
    }
    return null;
}

export function buildColumnChoices(field: any): ColumnPreview[] {
    const main = Array.isArray(field?.main) ? field.main : [];
    const side = Array.isArray(field?.side) ? field.side : [];
    const mainTanks = main.filter((c: any) => c?.role === 'tank');
    const getByRoleAndSlot = (role: 'dealer' | 'healer', slot: 0 | 1) =>
        main.find((c: any) => c?.role === role && Number(c?.extra?.slot_index ?? 0) === slot) || null;
    const previews: ColumnPreview[] = [];
    const pickRepresentativeUid = (preferred: Array<any>) => preferred.find((c) => c?.uid)?.uid;
    const leftDealer = getByRoleAndSlot('dealer', 0);
    const rightDealer = getByRoleAndSlot('dealer', 1);
    const leftHealer = getByRoleAndSlot('healer', 0);
    const rightHealer = getByRoleAndSlot('healer', 1);

    const leftMembers = [mainTanks[0], leftDealer, leftHealer].filter(Boolean);
    const leftRepUid = pickRepresentativeUid([leftDealer, leftHealer, mainTanks[0]]);
    if (leftMembers.length > 0 && leftRepUid) {
        previews.push({ key: 'main_left', label: '본대 왼쪽', repUid: leftRepUid, names: leftMembers.map((c: any) => c.name) });
    }

    const rightMembers = [mainTanks[0], rightDealer, rightHealer].filter(Boolean);
    const hasRightBackline = !!rightDealer || !!rightHealer;
    const rightRepUid = pickRepresentativeUid([rightDealer, rightHealer, mainTanks[0]]);
    if (hasRightBackline && rightMembers.length > 0 && rightRepUid) {
        previews.push({ key: 'main_right', label: '본대 오른쪽', repUid: rightRepUid, names: rightMembers.map((c: any) => c.name) });
    }

    if (side.length > 0) previews.push({ key: 'side', label: '사이드', repUid: side[0].uid, names: side.map((c: any) => c.name) });
    return previews;
}

export function collectDamageMap(
    node: any,
    out: Record<string, number> = {},
    priorityOut: Record<string, number> = {},
): Record<string, number> {
    if (!node || typeof node !== 'object') return out;

    const pushDelta = (uidValue: unknown, delta: number, priority: number) => {
        if (!uidValue || !Number.isFinite(delta) || delta === 0) return;
        const uid = String(uidValue);
        const rounded = Math.round(delta);
        const prevPriority = priorityOut[uid] ?? -1;
        if (prevPriority > priority) return;
        if (prevPriority === priority) {
            out[uid] = (out[uid] ?? 0) + rounded;
            return;
        }
        out[uid] = rounded;
        priorityOut[uid] = priority;
    };

    const uid = node?.target || node?.target_uid || node?.to_uid || node?.uid || node?.source_uid;
    const damageCandidates: Array<[number, number]> = [
        [Number(node?.final_damage), 4],
        [Number(node?.raw_damage), 3],
        [Number(node?.damage), 2],
        [Number(node?.amount), 1],
    ];
    damageCandidates.forEach(([damage, priority]) => {
        if (uid && Number.isFinite(damage) && damage > 0) pushDelta(uid, damage, priority);
    });

    const healed = Number(node?.healed ?? node?.heal ?? node?.final_heal ?? node?.amount_healed);
    if (uid && Number.isFinite(healed) && healed > 0) pushDelta(uid, -healed, 10);

    Object.values(node).forEach((value) => {
        if (value && typeof value === 'object') collectDamageMap(value, out, priorityOut);
    });
    return out;
}

export function pushSkillActionLogs(params: PushSkillActionLogParams & {
    getTurn: () => number | undefined;
    pushBattleLog: (entry: Omit<BattleLogEntry, 'id'>) => void;
    toActor: (card: any, fallbackName?: string) => BattleLogActor;
}) {
    const hiddenInstallSpellKeys = new Set(['spell_immortality_field', 'spell_deflect', 'spell_phoenix_rebirth']);
    const resultHeroKey = String(params?.result?.hero_key || params?.result?.card?.hero_key || '').toLowerCase();
    if (params?.result?.hidden || hiddenInstallSpellKeys.has(resultHeroKey)) return;

    const actor = params.toActor(params.actorCard, params.actorName || (params.team === 'my' ? '아군' : '상대'));
    const skillName = String(params.skillName || '스킬');
    const damageMap = collectDamageMap(params.result || {});
    const targets = new Map(params.targetPool.map((card: any) => [String(card?.uid), card]));
    const entries = Object.entries(damageMap).filter(([, dmg]) => Number.isFinite(dmg) && dmg !== 0);
    if (entries.length > 0) {
        entries.forEach(([uid, dmg]) => {
            const target = targets.get(String(uid));
            params.pushBattleLog({
                type: dmg > 0 ? 'damage' : 'heal',
                team: params.team,
                turn: params.getTurn(),
                actor,
                skillName,
                target: params.toActor(target, target?.name || '대상'),
                damage: Math.abs(Math.round(dmg)),
            });
        });
        return;
    }
    params.pushBattleLog({
        type: 'skill',
        team: params.team,
        turn: params.getTurn(),
        actor,
        skillName,
    });
}