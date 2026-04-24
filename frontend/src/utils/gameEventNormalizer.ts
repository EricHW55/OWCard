import type { UnifiedGameEvent } from '../controllers/gameModeAdapter';

function debugUnknownMessage(source: 'online' | 'solo', payload: any) {
    if (process.env.NODE_ENV !== 'development') return;
    // eslint-disable-next-line no-console
    console.debug(`[gameEventNormalizer] unknown ${source} message`, payload);
}

function readDamageEntries(result: any): Array<{ uid: string; amount: number }> {
    const byMap = result?.damage_map;
    if (byMap && typeof byMap === 'object') {
        return Object.entries(byMap)
            .map(([uid, value]) => ({ uid, amount: Number(value) }))
            .filter((item) => Number.isFinite(item.amount) && item.amount !== 0);
    }
    return [];
}

export function normalizeOnlineWsMessage(msg: any): UnifiedGameEvent[] {
    const events: UnifiedGameEvent[] = [];
    const result = msg?.result || {};

    if (msg?.type === 'game_state' || msg?.event === 'game_state') {
        const state = msg?.state || result?.state;
        if (state?.phase) {
            events.push({ type: 'phase_changed', phase: state.phase, turn: state.turn, isMyTurn: state.is_my_turn });
        }
    }

    const skillName = msg?.skill_name || result?.skill_name || result?.skill || result?.card?.name;
    if (skillName) {
        events.push({
            type: 'skill_used',
            actorName: msg?.caster_name || result?.caster_name || result?.caster?.name,
            skillName,
            heroKey: result?.hero_key || result?.card?.hero_key,
            isSpell: Boolean(result?.card?.is_spell) || String(result?.hero_key || '').startsWith('spell_'),
        });
    }

    if (typeof result?.coin_result === 'string' || typeof result?.headshot === 'boolean') {
        if (typeof result?.headshot === 'boolean') {
            events.push({
                type: 'headshot_toss',
                actorName: msg?.caster_name || result?.caster_name,
                skillName,
                heroKey: result?.caster_hero_key || result?.hero_key,
                headshot: Boolean(result?.headshot),
            });
        }
        events.push({
            type: 'coin_toss',
            actorName: msg?.caster_name || result?.caster_name,
            result: result?.coin_result,
            success: typeof result?.headshot === 'boolean' ? Boolean(result?.headshot) : undefined,
        });
    }

    readDamageEntries(result).forEach((entry) => {
        if (entry.amount > 0) events.push({ type: 'damage', targetUid: entry.uid, amount: Math.round(entry.amount) });
        if (entry.amount < 0) events.push({ type: 'heal', targetUid: entry.uid, amount: Math.abs(Math.round(entry.amount)) });
    });

    const destroyed = Array.isArray(result?.destroyed_uids) ? result.destroyed_uids : [];
    destroyed.forEach((victimUid: string) => {
        events.push({ type: 'kill_feed', killerUid: result?.caster_uid || msg?.caster_uid, victimUid });
    });

    if (events.length === 0) debugUnknownMessage('online', msg);
    return events;
}

export function normalizeSoloActionResponse(payload: any): UnifiedGameEvent[] {
    const events: UnifiedGameEvent[] = [];
    const state = payload?.state;

    if (state?.phase) {
        events.push({ type: 'phase_changed', phase: state.phase, turn: state.turn, isMyTurn: state.is_my_turn });
    }

    const actionResult = payload?.result || payload?.action_result || {};
    const actionType = payload?.payload?.action || payload?.action || actionResult?.action;
    if (actionType === 'use_skill' || actionResult?.skill_name) {
        events.push({
            type: 'skill_used',
            actorName: actionResult?.caster_name,
            skillName: actionResult?.skill_name || '스킬',
            heroKey: actionResult?.hero_key,
            isSpell: false,
        });
    }

    readDamageEntries(actionResult).forEach((entry) => {
        if (entry.amount > 0) events.push({ type: 'damage', targetUid: entry.uid, amount: Math.round(entry.amount) });
        if (entry.amount < 0) events.push({ type: 'heal', targetUid: entry.uid, amount: Math.abs(Math.round(entry.amount)) });
    });

    if (events.length === 0) debugUnknownMessage('solo', payload);
    return events;
}