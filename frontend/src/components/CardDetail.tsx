import React, { useState } from 'react';
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

const CardDetail: React.FC<Props> = ({ card, onClose }) => {
    const [imgError, setImgError] = useState(false);

    if (!card) return null;

    const isSpell = 'is_spell' in card && !!card.is_spell;
    const role = 'role' in card ? card.role : 'dealer';
    const color = isSpell ? '#ffaa22' : ROLE_COLOR[role] || '#888';

    const fc = isFieldCard(card) ? card : null;

    const hp = fc ? fc.current_hp : ('hp' in card ? card.hp : 0);
    const maxHp = fc ? fc.max_hp : ('hp' in card ? card.hp : 0);
    const atk = fc ? fc.attack : ('base_attack' in card ? card.base_attack : 0);
    const def = fc ? fc.defense : ('base_defense' in card ? card.base_defense : 0);
    const rng = fc ? fc.attack_range : ('base_attack_range' in card ? card.base_attack_range : 0);

    const skills: Record<string, { name?: string; cooldown?: number }> =
        ('skill_meta' in card ? card.skill_meta : {}) || {};

    const damages: Record<string, any> =
        ('skill_damages' in card ? card.skill_damages : {}) || {};

    const cooldowns: Record<string, number> = fc?.skill_cooldowns ?? {};
    const statuses = fc?.statuses ?? [];

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
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: 280,
                    background: '#1a2342',
                    border: `2px solid ${color}`,
                    borderRadius: 12,
                    padding: 20,
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 8,
                        gap: 10,
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {!isSpell && (
                            <div
                                style={{
                                    width: 44,
                                    height: 44,
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
                                    <span style={{ fontSize: 20 }}>{ROLE_ICON[role]}</span>
                                )}
                            </div>
                        )}

                        <span style={{ fontSize: 20, fontWeight: 900, color: '#e8ecf8' }}>
              {card.name}
            </span>
                    </div>

                    <span
                        style={{
                            padding: '2px 10px',
                            borderRadius: 20,
                            fontSize: 11,
                            fontWeight: 700,
                            background: `${color}20`,
                            color,
                            border: `1px solid ${color}44`,
                        }}
                    >
            {isSpell ? '✦ 스킬' : `${ROLE_ICON[role]} ${ROLE_LABEL[role]}`}
          </span>
                </div>

                {'description' in card && card.description && (
                    <p style={{ fontSize: 12, color: '#8a94b8', marginBottom: 12 }}>
                        {card.description}
                    </p>
                )}

                {!isSpell && (
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(4,1fr)',
                            gap: 6,
                            marginBottom: 12,
                        }}
                    >
                        {(
                            [
                                ['HP', fc ? `${hp}/${maxHp}` : hp, '#22dd77'],
                                ['공격', atk, '#ff4466'],
                                ['방어', def, '#44aaff'],
                                ['사거리', rng === 99 ? '∞' : rng, '#ffaa22'],
                            ] as [string, string | number, string][]
                        ).map(([label, value, statColor]) => (
                            <div
                                key={label}
                                style={{
                                    textAlign: 'center',
                                    padding: 6,
                                    background: '#111832',
                                    borderRadius: 6,
                                }}
                            >
                                <div style={{ fontSize: 9, color: '#5a6488' }}>{label}</div>
                                <div style={{ fontSize: 16, fontWeight: 900, color: statColor }}>
                                    {value}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {Object.keys(skills).length > 0 && (
                    <>
                        <div
                            style={{
                                fontSize: 10,
                                color: '#5a6488',
                                fontWeight: 700,
                                marginBottom: 4,
                            }}
                        >
                            스킬
                        </div>

                        {Object.entries(skills).map(([key, meta]) => {
                            const cooldown = cooldowns[key] ?? 0;
                            const damageValue = damages[key];

                            return (
                                <div
                                    key={key}
                                    style={{
                                        padding: 8,
                                        background: '#111832',
                                        borderRadius: 6,
                                        marginBottom: 4,
                                        border: '1px solid #2a3560',
                                    }}
                                >
                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#ff9b30' }}>
                                        {meta?.name ?? key}
                                    </div>

                                    {damageValue !== undefined && (
                                        <div style={{ fontSize: 10, color: '#8a94b8', marginTop: 2 }}>
                                            수치: {JSON.stringify(damageValue)}
                                        </div>
                                    )}

                                    {cooldown > 0 && (
                                        <span style={{ fontSize: 9, color: '#ff3355' }}>
                      쿨다운 {cooldown}턴
                    </span>
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

                                return (
                                    <span
                                        key={i}
                                        style={{
                                            padding: '2px 8px',
                                            borderRadius: 12,
                                            fontSize: 10,
                                            fontWeight: 700,
                                            background: isDebuff ? '#ff335520' : '#22dd7720',
                                            color: isDebuff ? '#ff3355' : '#22dd77',
                                            border: `1px solid ${isDebuff ? '#ff335544' : '#22dd7744'}`,
                                        }}
                                    >
                    {s.name}{' '}
                                        {s.duration > 0
                                            ? `(${s.duration}턴)`
                                            : s.duration === -1
                                                ? '(영구)'
                                                : ''}
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
                        marginTop: 14,
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