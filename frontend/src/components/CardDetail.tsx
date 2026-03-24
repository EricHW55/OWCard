import React, { useEffect, useState } from 'react';
import type { FieldCard, HandCard } from '../types/game';
import { ROLE_COLOR, ROLE_ICON, ROLE_LABEL } from '../types/constants';
import { getHeroImageSrc } from '../utils/heroImage';

interface Props {
    card: FieldCard | HandCard | null;
    onClose: () => void;
}

function isFieldCard(c: FieldCard | HandCard | null): c is FieldCard {
    return !!c && 'uid' in c;
}

function formatDamage(val: any): string {
    if (val === undefined || val === null) return '';
    if (typeof val === 'number') return String(val);
    if (Array.isArray(val)) return val.join(' / ');
    if (typeof val === 'object') {
        const parts: string[] = [];
        if (val.damage !== undefined) parts.push(`딜 ${val.damage}`);
        if (val.heal !== undefined) parts.push(`힐 ${val.heal}`);
        return parts.join(' · ') || JSON.stringify(val);
    }
    return String(val);
}

function skillOrder(key: string) {
    if (key === 'passive') return -1;
    const match = key.match(/(\d+)/);
    return match ? Number(match[1]) : 999;
}

function skillSectionLabel(key: string) {
    if (key === 'passive') return '패시브';
    const match = key.match(/(\d+)/);
    return match ? `스킬 ${match[1]}` : key;
}

const CardDetail: React.FC<Props> = ({ card, onClose }) => {
    const [imgError, setImgError] = useState(false);

    useEffect(() => {
        setImgError(false);
    }, [card]);

    if (!card) return null;

    const isSpell = 'is_spell' in card && !!card.is_spell;
    const role = 'role' in card ? card.role : 'dealer';
    const color = isSpell ? '#ffaa22' : ROLE_COLOR[role] || '#888';
    const fc = isFieldCard(card) ? card : null;

    const hp = fc ? fc.current_hp : ('hp' in card ? card.hp : 0);
    const maxHp = fc ? fc.max_hp : ('hp' in card ? card.hp : 0);
    const rng = fc ? fc.attack_range : ('base_attack_range' in card ? card.base_attack_range : 0);
    const fallbackDescription = ('description' in card ? card.description : '') || '';

    const skills: Record<string, { name?: string; cooldown?: number; description?: string }> =
        ('skill_meta' in card ? card.skill_meta : {}) || {};
    const damages: Record<string, any> =
        ('skill_damages' in card ? card.skill_damages : {}) || {};
    const cooldowns: Record<string, number> = fc?.skill_cooldowns ?? {};
    const statuses = fc?.statuses ?? [];

    const skillEntries = Object.entries(skills).sort(
        ([a], [b]) => skillOrder(a) - skillOrder(b)
    );

    const barrierStatus = statuses.find(s => s.name === 'barrier');
    const barrierHp = (barrierStatus as any)?.barrier_hp ?? 0;
    const barrierMax = (barrierStatus as any)?.barrier_max_hp ?? 0;

    const extraHpStatus = statuses.find(s => s.name === 'extra_hp');
    const extraHp = (extraHpStatus as any)?.extra_hp ?? 0;

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                padding: 16,
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    width: 312,
                    maxHeight: '85vh',
                    overflowY: 'auto',
                    background: '#1a2342',
                    border: `2px solid ${color}`,
                    borderRadius: 12,
                    padding: 16,
                    boxShadow: '0 16px 40px rgba(0,0,0,0.35)',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 10,
                        marginBottom: 10,
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <div
                            style={{
                                width: 46,
                                height: 46,
                                borderRadius: 10,
                                overflow: 'hidden',
                                background: '#111832',
                                border: '1px solid #2a3560',
                                display: 'grid',
                                placeItems: 'center',
                                flexShrink: 0,
                            }}
                        >
                            {!imgError ? (
                                <img
                                    src={getHeroImageSrc(card as any)}
                                    alt={card.name}
                                    onError={() => setImgError(true)}
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover',
                                    }}
                                />
                            ) : (
                                <span style={{ fontSize: 20 }}>
                                    {isSpell ? '✦' : ROLE_ICON[role]}
                                </span>
                            )}
                        </div>

                        <span
                            style={{
                                fontSize: 18,
                                fontWeight: 900,
                                color: '#e8ecf8',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {card.name}
                        </span>
                    </div>

                    <span
                        style={{
                            padding: '2px 10px',
                            borderRadius: 20,
                            fontSize: 10,
                            fontWeight: 700,
                            background: `${color}20`,
                            color,
                            border: `1px solid ${color}44`,
                            flexShrink: 0,
                        }}
                    >
                        {isSpell ? '✦ 스킬카드' : `${ROLE_ICON[role]} ${ROLE_LABEL[role]}`}
                    </span>
                </div>

                {!isSpell && (
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns:
                                barrierHp > 0 || extraHp > 0 ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)',
                            gap: 4,
                            marginBottom: 12,
                        }}
                    >
                        {([
                            ['HP', fc ? `${hp}/${maxHp}` : hp, '#22dd77'],
                            ['사거리', rng === 99 ? '∞' : rng, '#ffaa22'],
                            ...(barrierHp > 0 ? [['방벽', `${barrierHp}/${barrierMax}`, '#22cc88']] : []),
                            ...(extraHp > 0 ? [['추가HP', `+${extraHp}`, '#ffdd44']] : []),
                        ] as [string, string | number, string][]).map(([label, value, c]) => (
                            <div
                                key={label}
                                style={{
                                    textAlign: 'center',
                                    padding: 6,
                                    background: '#111832',
                                    borderRadius: 6,
                                }}
                            >
                                <div style={{ fontSize: 8, color: '#5a6488' }}>{label}</div>
                                <div style={{ fontSize: 14, fontWeight: 900, color: c }}>{value}</div>
                            </div>
                        ))}
                    </div>
                )}

                {skillEntries.length > 0 && (
                    <>
                        <div style={{ fontSize: 10, color: '#5a6488', fontWeight: 700, marginBottom: 6 }}>
                            스킬 설명
                        </div>
                        {skillEntries.map(([key, meta]) => {
                            const cd = cooldowns[key] ?? 0;
                            const dmgVal = damages[key];
                            const dmgStr = formatDamage(dmgVal);
                            const skillDescription = (meta as any)?.description
                                || (skillEntries.length === 1 ? fallbackDescription : '');

                            return (
                                <div
                                    key={key}
                                    style={{
                                        padding: 10,
                                        background: '#111832',
                                        borderRadius: 8,
                                        marginBottom: 6,
                                        border: '1px solid #2a3560',
                                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
                                    }}
                                >
                                    <div
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            gap: 8,
                                        }}
                                    >
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                                            <span
                                                style={{
                                                    width: 'fit-content',
                                                    padding: '2px 7px',
                                                    borderRadius: 999,
                                                    fontSize: 9,
                                                    fontWeight: 800,
                                                    color: key === 'passive' ? '#78cfff' : '#ffcf7a',
                                                    background: key === 'passive' ? 'rgba(120,207,255,0.12)' : 'rgba(255,155,48,0.12)',
                                                    border: key === 'passive' ? '1px solid rgba(120,207,255,0.3)' : '1px solid rgba(255,155,48,0.28)',
                                                }}
                                            >
                                                {skillSectionLabel(key)}
                                            </span>
                                            <span style={{ fontSize: 13, fontWeight: 800, color: '#e8ecf8' }}>
                                                {meta?.name ?? key}
                                            </span>
                                        </div>
                                        {cd > 0 && (
                                            <span style={{ fontSize: 9, color: '#ff3355', fontWeight: 700, flexShrink: 0 }}>
                                                쿨 {cd}턴
                                            </span>
                                        )}
                                    </div>

                                    {(dmgStr || skillDescription) && (
                                        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
                                            {dmgStr && (
                                                <div
                                                    style={{
                                                        fontSize: 10,
                                                        color: '#ffcf7a',
                                                        fontWeight: 700,
                                                    }}
                                                >
                                                    수치: {dmgStr}
                                                </div>
                                            )}
                                            {skillDescription && (
                                                <div style={{ fontSize: 10, color: '#9aa6ce', lineHeight: 1.5 }}>
                                                    {skillDescription}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </>
                )}

                {statuses.length > 0 && (
                    <>
                        <div
                            style={{
                                fontSize: 10,
                                color: '#5a6488',
                                fontWeight: 700,
                                marginTop: 8,
                                marginBottom: 4,
                            }}
                        >
                            상태 효과
                        </div>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {statuses.map((s, i) => {
                                const isDebuff = s.tags?.includes('debuff');
                                let extra = '';
                                if (s.name === 'barrier' && (s as any).barrier_hp !== undefined) {
                                    extra = ` [${(s as any).barrier_hp}hp]`;
                                }
                                if (s.name === 'extra_hp' && (s as any).extra_hp !== undefined) {
                                    extra = ` [+${(s as any).extra_hp}]`;
                                }

                                return (
                                    <span
                                        key={i}
                                        style={{
                                            padding: '2px 8px',
                                            borderRadius: 12,
                                            fontSize: 9,
                                            fontWeight: 700,
                                            background: isDebuff ? '#ff335520' : '#22dd7720',
                                            color: isDebuff ? '#ff3355' : '#22dd77',
                                            border: `1px solid ${isDebuff ? '#ff335544' : '#22dd7744'}`,
                                        }}
                                    >
                                        {s.name}
                                        {extra}{' '}
                                        {s.duration > 0 ? `(${s.duration}턴)` : s.duration === -1 ? '(영구)' : ''}
                                    </span>
                                );
                            })}
                        </div>
                    </>
                )}

                <button
                    onClick={onClose}
                    style={{
                        width: '100%',
                        marginTop: 12,
                        padding: '8px 0',
                        borderRadius: 6,
                        background: '#243055',
                        border: '1px solid #3a4a78',
                        color: '#e8ecf8',
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: 'pointer',
                    }}
                >
                    닫기
                </button>
            </div>
        </div>
    );
};

export default CardDetail;
