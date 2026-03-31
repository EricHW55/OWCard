import React, { useEffect, useState } from 'react';
import type { FieldCard } from '../types/game';
import { ROLE_COLOR, ROLE_ICON } from '../types/constants';
import { getHeroImageSrc } from '../utils/heroImage';

interface Props {
    card: FieldCard;
    selected?: boolean;
    glowing?: boolean;
    onClick?: () => void;
}

interface AuraSpike {
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
    w: number;
    h: number;
    rotate: number;
    delay: number;
}

function hexToRgba(hex: string, alpha: number): string {
    const clean = hex.replace('#', '');
    const full = clean.length === 3
        ? clean.split('').map((c) => `${c}${c}`).join('')
        : clean;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getAuraSpikes(level: number): AuraSpike[] {
    if (level <= 0) return [];
    const protrusion = 1 + level * 0.35;
    return [
        { top: '-20%', left: '12%', w: 9 * protrusion, h: 24 * protrusion, rotate: -14, delay: 0.0 },
        { top: '-22%', right: '10%', w: 8 * protrusion, h: 21 * protrusion, rotate: 16, delay: 0.2 },
        { right: '-19%', top: '18%', w: 23 * protrusion, h: 9 * protrusion, rotate: 4, delay: 0.35 },
        { right: '-20%', bottom: '18%', w: 21 * protrusion, h: 8 * protrusion, rotate: -7, delay: 0.55 },
        { bottom: '-21%', right: '18%', w: 9 * protrusion, h: 22 * protrusion, rotate: 12, delay: 0.7 },
        { bottom: '-20%', left: '13%', w: 8 * protrusion, h: 23 * protrusion, rotate: -15, delay: 0.9 },
        { left: '-19%', bottom: '17%', w: 22 * protrusion, h: 9 * protrusion, rotate: -5, delay: 1.05 },
        { left: '-20%', top: '16%', w: 21 * protrusion, h: 8 * protrusion, rotate: 8, delay: 1.25 },
    ];
}

function getMainDamage(card: FieldCard): string {
    const d = card.skill_damages;
    if (!d) return '0';
    const keys = Object.keys(d);
    if (!keys.length) return '0';
    const v = d[keys[0]];
    if (typeof v === 'number') return String(v);
    if (Array.isArray(v)) return String(v[0] ?? 0);
    if (typeof v === 'object' && v !== null) return String((v as any).damage ?? (v as any).heal ?? 0);
    return '0';
}

const FieldCardComp: React.FC<Props> = ({ card, selected, glowing, onClick }) => {
    const [imgError, setImgError] = useState(false);

    useEffect(() => {
        setImgError(false);
    }, [card.uid, card.name]);

    const color = ROLE_COLOR[card.role] || '#888';
    const hpPct = card.max_hp > 0 ? (card.current_hp / card.max_hp) * 100 : 0;
    const hpColor = hpPct > 60 ? '#22dd77' : hpPct > 30 ? '#ffaa22' : '#ff3355';
    const mainDmg = getMainDamage(card);

    const barrierStatus = card.statuses?.find((s) => s.name === 'barrier');
    const barrierHp = (barrierStatus as any)?.barrier_hp ?? 0;
    const hasBarrier = barrierHp > 0;

    const extraHpStatus = card.statuses?.find((s) => s.name === 'extra_hp');
    const extraHp = (extraHpStatus as any)?.extra_hp ?? 0;

    const isStealthed = card.statuses?.some((s) => s.name === 'stealth');
    const isBurrowed = card.statuses?.some((s) => s.name === 'burrowed');
    const isFrozen = card.statuses?.some((s) => s.name === 'frozen_state');
    const isAirborne = card.statuses?.some(
        (s) => s.name === 'airborne' || s.name === 'gravity_flux_airborne'
    );
    const isExposed = card.statuses?.some((s) => s.name === 'exposed');
    const isPulled = card.statuses?.some((s) => s.name === 'pulled');
    const isHooked = card.statuses?.some((s) => s.name === 'hooked');

    const isHidden = isStealthed || isBurrowed || isFrozen;
    const hasBurn = card.statuses?.some((s) => s.name === 'burn');
    const hasSilence = card.statuses?.some(
        (s) => s.name === 'skill_silence' || s.name === 'sleep'
    );
    const hasShield = card.statuses?.some(
        (s) => s.name === 'damage_reduction' || s.name === 'next_turn_start_damage_reduction'
    );
    const buffs = card.statuses?.filter((s) => s.tags?.includes('buff')) || [];
    const debuffs = card.statuses?.filter((s) => s.tags?.includes('debuff')) || [];

    const heroKey = String(card.hero_key || card.extra?._hero_key || '').toLowerCase();
    const sojournCharge = Math.max(0, Math.min(3, Number(card.extra?.charge_level ?? 0) || 0));
    const symmetraCharge = Math.max(0, Math.min(3, Number(card.extra?.photon_charge ?? 0) || 0));
    const zaryaCharge = card.statuses?.some(
        (s) => s.name === 'particle_barrier' && Boolean((s as any).was_hit)
    ) ? 1 : 0;

    let chargeLevel = 0;
    let chargeMax = 1;
    let chargeAuraColor = '';
    if (heroKey === 'sojourn') {
        chargeLevel = sojournCharge;
        chargeMax = 3;
        chargeAuraColor = '#2f8fff';
    } else if (heroKey === 'symmetra') {
        chargeLevel = symmetraCharge;
        chargeMax = 3;
        chargeAuraColor = '#356dff';
    } else if (heroKey === 'zarya') {
        chargeLevel = zaryaCharge;
        chargeMax = 1;
        chargeAuraColor = '#ff2f4f';
    }
    const chargeIntensity = chargeMax > 0 ? chargeLevel / chargeMax : 0;
    const chargeAuraGlow = chargeIntensity > 0
        ? `0 0 ${10 + chargeIntensity * 16}px ${hexToRgba(chargeAuraColor, 0.45 + chargeIntensity * 0.25)}`
        : '';
    const chargeAuraRing = chargeIntensity > 0
        ? `inset 0 0 ${4 + chargeIntensity * 5}px ${hexToRgba(chargeAuraColor, 0.55 + chargeIntensity * 0.25)}`
        : '';
    const auraSpikes = getAuraSpikes(chargeLevel);

    let borderColor = color;
    let shadow = 'none';
    if (selected) {
        borderColor = '#ff9b30';
        shadow = '0 0 12px rgba(255,155,48,0.6)';
    } else if (glowing) {
        borderColor = '#66ddff';
        shadow = '0 0 10px #66ddff88, 0 0 20px #66ddff44';
    } else if (hasBarrier) {
        shadow = '0 0 8px #22cc8866';
    }

    let moveBadge: { text: string; cls: string } | null = null;
    if (isFrozen) moveBadge = { text: 'FROZEN', cls: 'frozen' };
    else if (isAirborne) moveBadge = { text: 'AIR', cls: 'airborne' };
    else if (isBurrowed) moveBadge = { text: '잠복', cls: 'burrowed' };
    else if (isStealthed) moveBadge = { text: '은신', cls: 'stealth' };
    else if (isHooked) moveBadge = { text: 'HOOK', cls: 'hooked' };
    else if (isPulled) moveBadge = { text: 'PULL', cls: 'pulled' };
    else if (isExposed) moveBadge = { text: '노출', cls: 'exposed' };

    const finalShadow = [chargeAuraGlow, chargeAuraRing, isAirborne ? '0 0 10px rgba(120,207,255,0.45), 0 6px 16px rgba(120,207,255,0.18)' : shadow]
        .filter(Boolean)
        .join(', ');

    return (
        <div
            onClick={onClick}
            style={{
                width: 'var(--field-card-width)',
                height: 'var(--field-card-height)',
                borderRadius: 'var(--field-card-radius)',
                position: 'relative',
                overflow: 'visible',
                isolation: 'isolate',
                border: `2px solid ${borderColor}`,
                background: selected
                    ? 'rgba(255,155,48,0.15)'
                    : glowing
                        ? 'rgba(102,221,255,0.08)'
                        : `${color}12`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 'calc(var(--field-card-width) * 0.05) calc(var(--field-card-width) * 0.03)',
                cursor: 'pointer',
                flexShrink: 0,
                opacity: isHidden ? 0.45 : 1,
                boxShadow: finalShadow || 'none',
                transform: isAirborne ? 'translateY(-4px)' : undefined,
                filter: isBurrowed ? 'saturate(0.75) blur(0.2px)' : undefined,
                transition: 'all 0.25s',
            }}
        >
            {hasBarrier && (
                <div
                    style={{
                        position: 'absolute',
                        inset: -3,
                        border: '2px solid #22cc8888',
                        borderRadius: 'calc(var(--field-card-radius) + 2px)',
                        pointerEvents: 'none',
                    }}
                />
            )}

            {glowing && !selected && (
                <div
                    style={{
                        position: 'absolute',
                        inset: -2,
                        borderRadius: 'calc(var(--field-card-radius) + 2px)',
                        pointerEvents: 'none',
                        border: '1px solid #66ddff66',
                        animation: 'pulse 1.5s ease-in-out infinite',
                    }}
                />
            )}

            {moveBadge && (
                <div className={`field-move-badge ${moveBadge.cls}`}>
                    {moveBadge.text}
                </div>
            )}

            {chargeLevel > 0 && auraSpikes.map((spike, idx) => (
                <div
                    key={`aura-spike-${idx}`}
                    style={{
                        top: spike.top,
                        right: spike.right,
                        bottom: spike.bottom,
                        left: spike.left,
                        position: 'absolute',
                        width: spike.w,
                        height: spike.h,
                        borderRadius: 0,
                        clipPath: 'polygon(50% 0%, 100% 100%, 50% 78%, 0% 100%)',
                        transform: `rotate(${spike.rotate}deg)`,
                        transformOrigin: '50% 100%',
                        background: `linear-gradient(180deg, ${hexToRgba(chargeAuraColor, 0.95)} 0%, ${hexToRgba(chargeAuraColor, 0.58)} 45%, ${hexToRgba(chargeAuraColor, 0.18)} 80%, transparent 100%)`,
                        filter: `blur(${0.3 + chargeIntensity * 0.8}px)`,
                        opacity: 0.7 + chargeIntensity * 0.25,
                        zIndex: -1,
                        pointerEvents: 'none',
                        animation: `auraJitter ${1.4 + spike.delay * 0.35}s ease-in-out ${spike.delay}s infinite`,
                    }}
                />
            ))}

            <div
                style={{
                    fontSize: 'clamp(8px, calc(var(--field-card-width) * 0.125), 11px)',
                    fontWeight: 700,
                    color,
                    textAlign: 'center',
                    lineHeight: 1.1,
                    paddingTop: moveBadge ? 10 : 0,
                }}
            >
                {card.name}
            </div>

            <div
                style={{
                    width: 'calc(var(--field-card-width) * 0.45)',
                    height: 'calc(var(--field-card-width) * 0.45)',
                    borderRadius: 'calc(var(--field-card-radius) + 1px)',
                    overflow: 'hidden',
                    display: 'grid',
                    placeItems: 'center',
                    background: '#0d1225',
                    border: '1px solid #2a3560',
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
                    <span style={{ fontSize: 16 }}>{ROLE_ICON[card.role]}</span>
                )}
            </div>

            <div
                style={{
                    display: 'flex',
                    gap: 2,
                    fontSize: 'clamp(7px, calc(var(--field-card-width) * 0.11), 10px)',
                    fontWeight: 700,
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                }}
            >
                <span style={{ color: '#ff9b30' }}>✦{mainDmg}</span>
                <span style={{ color: '#22dd77' }}>♥{card.current_hp}</span>
                {hasBarrier && <span style={{ color: '#22cc88' }}>🛡{barrierHp}</span>}
                {extraHp > 0 && <span style={{ color: '#ffdd44' }}>+{extraHp}</span>}
            </div>

            <div
                style={{
                    width: '90%',
                    height: 'clamp(3px, calc(var(--field-card-width) * 0.05), 5px)',
                    background: '#0a0e1a',
                    borderRadius: 2,
                    overflow: 'hidden',
                }}
            >
                <div
                    style={{
                        height: '100%',
                        width: `${hpPct}%`,
                        background: hpColor,
                        borderRadius: 2,
                        transition: 'width 0.3s',
                    }}
                />
            </div>

            <div
                style={{
                    position: 'absolute',
                    top: 1,
                    right: 1,
                    display: 'flex',
                    gap: 1,
                    flexWrap: 'wrap',
                    maxWidth: 20,
                }}
            >
                {hasBurn && (
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#ff6622' }} />
                )}
                {hasSilence && (
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#ff3355' }} />
                )}
                {hasShield && (
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#44aaff' }} />
                )}
            </div>

            <div style={{ position: 'absolute', top: 1, left: 1, display: 'flex', gap: 1 }}>
                {buffs.length > 0 && (
                    <span style={{ fontSize: 6, color: '#22dd77', fontWeight: 900 }}>+{buffs.length}</span>
                )}
                {debuffs.length > 0 && (
                    <span style={{ fontSize: 6, color: '#ff3355', fontWeight: 900 }}>-{debuffs.length}</span>
                )}
            </div>

            {card.placed_this_turn && (
                <div style={{ position: 'absolute', bottom: 1, right: 2, fontSize: 7, color: '#ffaa22' }}>
                    NEW
                </div>
            )}
            {card.acted_this_turn && (
                <div style={{ position: 'absolute', bottom: 1, left: 2, fontSize: 7, color: '#5a6488' }}>
                    ✓
                </div>
            )}

            <style>{`
                @keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:1} }
                @keyframes auraJitter {
                    0%, 100% { opacity: .48; }
                    50% { opacity: 1; }
                }
            `}</style>
        </div>
    );
};

export default FieldCardComp;