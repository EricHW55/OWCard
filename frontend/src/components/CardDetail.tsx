import React, { useState } from 'react';
import type { FieldCard, HandCard } from '../types/game';
import { ROLE_COLOR, ROLE_ICON, ROLE_LABEL } from '../types/constants';

interface Props {
    card: FieldCard | HandCard | null;
    onClose: () => void;
}

function isFieldCard(c: FieldCard | HandCard | null): c is FieldCard {
    return !!c && 'uid' in c;
}

/** 데미지 값을 읽기 좋게 포맷 */
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

const CardDetail: React.FC<Props> = ({ card, onClose }) => {
    if (!card) return null;

    const isSpell = 'is_spell' in card && !!card.is_spell;
    const role = 'role' in card ? card.role : 'dealer';
    const color = isSpell ? '#ffaa22' : ROLE_COLOR[role] || '#888';
    const fc = isFieldCard(card) ? card : null;

    const hp = fc ? fc.current_hp : ('hp' in card ? card.hp : 0);
    const maxHp = fc ? fc.max_hp : ('hp' in card ? card.hp : 0);
    const rng = fc ? fc.attack_range : ('base_attack_range' in card ? card.base_attack_range : 0);

    const description = ('description' in card ? card.description : '') || '';

    const skills: Record<string, { name?: string; cooldown?: number; description?: string }> =
        ('skill_meta' in card ? card.skill_meta : {}) || {};
    const damages: Record<string, any> =
        ('skill_damages' in card ? card.skill_damages : {}) || {};
    const cooldowns: Record<string, number> = fc?.skill_cooldowns ?? {};
    const statuses = fc?.statuses ?? [];

    // 배리어 HP
    const barrierStatus = statuses.find(s => s.name === 'barrier');
    const barrierHp = (barrierStatus as any)?.barrier_hp ?? 0;
    const barrierMax = (barrierStatus as any)?.barrier_max_hp ?? 0;

    // 추가체력
    const extraHpStatus = statuses.find(s => s.name === 'extra_hp');
    const extraHp = (extraHpStatus as any)?.extra_hp ?? 0;

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div onClick={e => e.stopPropagation()} style={{ width: 290, maxHeight: '85vh', overflowY: 'auto', background: '#1a2342', border: `2px solid ${color}`, borderRadius: 12, padding: 16 }}>

                {/* 헤더 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 18, fontWeight: 900, color: '#e8ecf8' }}>{card.name}</span>
                    <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: `${color}20`, color, border: `1px solid ${color}44` }}>
            {isSpell ? '✦ 스킬카드' : `${ROLE_ICON[role]} ${ROLE_LABEL[role]}`}
          </span>
                </div>

                {/* 설명 */}
                {description && (
                    <p style={{ fontSize: 11, color: '#8a94b8', margin: '0 0 10px', lineHeight: 1.5, background: '#111832', padding: 8, borderRadius: 6 }}>
                        {description}
                    </p>
                )}

                {/* 스탯 (배리어 포함) */}
                {!isSpell && (
                    <div style={{ display: 'grid', gridTemplateColumns: barrierHp > 0 || extraHp > 0 ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: 4, marginBottom: 10 }}>
                        {([
                            ['HP', fc ? `${hp}/${maxHp}` : hp, '#22dd77'],
                            ['사거리', rng === 99 ? '∞' : rng, '#ffaa22'],
                            ...(barrierHp > 0 ? [['방벽', `${barrierHp}/${barrierMax}`, '#22cc88']] : []),
                            ...(extraHp > 0 ? [['추가HP', `+${extraHp}`, '#ffdd44']] : []),
                        ] as [string, string | number, string][]).map(([label, value, c]) => (
                            <div key={label} style={{ textAlign: 'center', padding: 5, background: '#111832', borderRadius: 6 }}>
                                <div style={{ fontSize: 8, color: '#5a6488' }}>{label}</div>
                                <div style={{ fontSize: 14, fontWeight: 900, color: c }}>{value}</div>
                            </div>
                        ))}
                    </div>
                )}

                {/* 스킬 목록 */}
                {Object.keys(skills).length > 0 && (
                    <>
                        <div style={{ fontSize: 10, color: '#5a6488', fontWeight: 700, marginBottom: 4 }}>스킬</div>
                        {Object.entries(skills).map(([key, meta]) => {
                            const cd = cooldowns[key] ?? 0;
                            const dmgVal = damages[key];
                            const dmgStr = formatDamage(dmgVal);
                            return (
                                <div key={key} style={{ padding: 8, background: '#111832', borderRadius: 6, marginBottom: 4, border: '1px solid #2a3560' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: '#ff9b30' }}>{meta?.name ?? key}</span>
                                        {cd > 0 && <span style={{ fontSize: 9, color: '#ff3355', fontWeight: 700 }}>쿨 {cd}턴</span>}
                                    </div>
                                    {dmgStr && <div style={{ fontSize: 10, color: '#e8ecf8', marginTop: 3 }}>수치: {dmgStr}</div>}
                                    {(meta as any)?.description && <div style={{ fontSize: 9, color: '#8a94b8', marginTop: 2 }}>{(meta as any).description}</div>}
                                </div>
                            );
                        })}
                    </>
                )}

                {/* 상태 효과 */}
                {statuses.length > 0 && (
                    <>
                        <div style={{ fontSize: 10, color: '#5a6488', fontWeight: 700, marginTop: 8, marginBottom: 4 }}>상태 효과</div>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {statuses.map((s, i) => {
                                const isDebuff = s.tags?.includes('debuff');
                                let extra = '';
                                if (s.name === 'barrier' && s.barrier_hp !== undefined) extra = ` [${s.barrier_hp}hp]`;
                                if (s.name === 'extra_hp' && s.extra_hp !== undefined) extra = ` [+${s.extra_hp}]`;
                                return (
                                    <span key={i} style={{
                                        padding: '2px 8px', borderRadius: 12, fontSize: 9, fontWeight: 700,
                                        background: isDebuff ? '#ff335520' : '#22dd7720',
                                        color: isDebuff ? '#ff3355' : '#22dd77',
                                        border: `1px solid ${isDebuff ? '#ff335544' : '#22dd7744'}`,
                                    }}>
                    {s.name}{extra} {s.duration > 0 ? `(${s.duration}턴)` : s.duration === -1 ? '(영구)' : ''}
                  </span>
                                );
                            })}
                        </div>
                    </>
                )}

                <button onClick={onClose} style={{ width: '100%', marginTop: 12, padding: '8px 0', borderRadius: 6, background: '#243055', border: '1px solid #3a4a78', color: '#e8ecf8', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                    닫기
                </button>
            </div>
        </div>
    );
};

export default CardDetail;