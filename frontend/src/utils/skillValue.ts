export function isMeaningfulSkillValue(value: unknown): boolean {
    if (value === undefined || value === null) return false;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return false;
        const asNumber = Number(trimmed);
        return Number.isNaN(asNumber) || asNumber !== 0;
    }
    if (Array.isArray(value)) return value.some((item) => isMeaningfulSkillValue(item));
    if (typeof value === 'object') return Object.values(value as Record<string, unknown>).some((item) => isMeaningfulSkillValue(item));
    return true;
}

export function formatSkillValue(value: unknown): string {
    if (!isMeaningfulSkillValue(value)) return '';

    if (typeof value === 'number') return String(value);
    if (typeof value === 'string') return value.trim();

    if (Array.isArray(value)) {
        const parts = value
            .map((entry) => formatSkillValue(entry))
            .filter(Boolean);
        return parts.join(' / ');
    }

    if (typeof value === 'object' && value) {
        const val = value as Record<string, unknown>;
        const parts: string[] = [];

        if (isMeaningfulSkillValue(val.damage)) parts.push(`딜 ${val.damage}`);
        if (isMeaningfulSkillValue(val.heal)) parts.push(`힐 ${val.heal}`);
        if (isMeaningfulSkillValue(val.duration)) parts.push(`지속 ${val.duration}턴`);
        if (isMeaningfulSkillValue(val.silence_duration)) parts.push(`침묵 ${val.silence_duration}턴`);
        if (isMeaningfulSkillValue(val.extra_hp)) parts.push(`추가HP ${val.extra_hp}`);
        if (isMeaningfulSkillValue(val.damage_multiplier)) parts.push(`피해x${val.damage_multiplier}`);
        if (isMeaningfulSkillValue(val.heal_multiplier)) parts.push(`치유x${val.heal_multiplier}`);
        if (isMeaningfulSkillValue(val.damage_reduction)) parts.push(`피해감소 ${val.damage_reduction}%`);
        if (isMeaningfulSkillValue(val.vendetta_mark_bonus_damage)) parts.push(`표적 추가피해 +${val.vendetta_mark_bonus_damage}`);
        if (isMeaningfulSkillValue(val.vendetta_mark_duration)) {
            const duration = Number(val.vendetta_mark_duration);
            const durationLabel = duration === -1 ? '영구' : `${val.vendetta_mark_duration}턴`;
            parts.push(`표적 지속 ${durationLabel}`);
        }

        return parts.join(' · ');
    }

    return String(value);
}