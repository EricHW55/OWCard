import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { BattleLogActor, BattleLogEntry } from '../../types/game';

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