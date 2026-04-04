import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CardVisualEffect, FieldCard } from '../types/game';
import { ROLE_COLOR, ROLE_ICON } from '../types/constants';
import { getHeroImageSrc } from '../utils/heroImage';

interface Props {
    card: FieldCard;
    selected?: boolean;
    glowing?: boolean;
    effect?: CardVisualEffect;
    onClick?: () => void;
}

interface AuraSpike {
    x: number;
    y: number;
    w: number;
    h: number;
    rotate: number;
    delay: number;
    duration: number;
    peak: number;
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
    const spread = 1 + level * 0.25;
    const count = 16 + level * 6;
    return Array.from({ length: count }, (_, i) => {
        const theta = Math.random() * Math.PI * 2;
        const radius = 52 + Math.random() * 28;
        const x = 50 + Math.cos(theta) * radius;
        const y = 50 + Math.sin(theta) * radius;
        const long = (14 + Math.random() * 16) * spread;
        const short = (5 + Math.random() * 5) * spread;
        return {
            x,
            y,
            w: Math.max(5, short),
            h: Math.max(12, long),
            rotate: (theta * 180) / Math.PI + 90 + (Math.random() * 24 - 12),
            delay: i * 0.11 + Math.random() * 0.5,
            duration: 2.2 + Math.random() * 1.8,
            peak: 0.7 + Math.random() * 0.5,
        };
    });
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

const FieldCardComp: React.FC<Props> = ({ card, selected, glowing, effect, onClick }) => {
    const [imgError, setImgError] = useState(false);
    const [showParticleBarrierBurst, setShowParticleBarrierBurst] = useState(false);
    const prevParticleBarrierRef = useRef<{ breakSeq: number }>({ breakSeq: 0 });

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

    const particleBarrierBreakSeq = Number((card.extra as any)?.particle_barrier_break_seq ?? 0) || 0;

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
    const zaryaCharge = (() => {
        const fromExtra = Number((card.extra as any)?.particle_barrier_charge ?? (card.extra as any)?.zarya_charge ?? 0);
        return fromExtra > 0 ? 1 : 0;
    })();

    useEffect(() => {
        const prev = prevParticleBarrierRef.current;
        const barrierJustBroken = particleBarrierBreakSeq > prev.breakSeq;
        if (barrierJustBroken) {
            setShowParticleBarrierBurst(true);
            const timer = window.setTimeout(() => setShowParticleBarrierBurst(false), 720);
            prevParticleBarrierRef.current = { breakSeq: particleBarrierBreakSeq };
            return () => window.clearTimeout(timer);
        }

        prevParticleBarrierRef.current = { breakSeq: particleBarrierBreakSeq };
    }, [particleBarrierBreakSeq, card.uid]);

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
    const auraSpikes = useMemo(() => getAuraSpikes(chargeLevel), [card.uid, chargeLevel]);

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
    else if (isExposed) moveBadge = { text: '무시', cls: 'exposed' };

    const finalShadow = [chargeAuraGlow, chargeAuraRing, isAirborne ? '0 0 10px rgba(120,207,255,0.45), 0 6px 16px rgba(120,207,255,0.18)' : shadow]
        .filter(Boolean)
        .join(', ');
    const isDestroying = !!effect?.destroying;

    return (
        <div
            onClick={isDestroying ? undefined : onClick}
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
                animation: isDestroying ? 'destroyFadeOut 0.5s ease forwards' : undefined,
                pointerEvents: isDestroying ? 'none' : undefined,
            }}
        >
            {effect?.floatingDamage !== undefined && effect?.floatingDamage !== null && effect.floatingDamage !== 0 && (
                <div
                    style={{
                        position: 'absolute',
                        top: '78%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        color: effect.floatingDamage > 0 ? '#ff5f7a' : '#37d67a',
                        fontWeight: 1000,
                        fontSize: 24,
                        lineHeight: 1,
                        fontFamily: '"Montserrat", "Inter", "Noto Sans KR", "Pretendard", sans-serif',
                        letterSpacing: '-0.2px',
                        textShadow: '0 1px 0 rgba(0,0,0,0.52), 0 0 10px rgba(0,0,0,0.7)',
                        pointerEvents: 'none',
                        zIndex: 8,
                        animation: 'damageFloatTrajectory 0.78s linear forwards',
                    }}
                >
                    {effect.floatingDamage > 0 ? '-' : '+'}{Math.abs(effect.floatingDamage)}
                </div>
            )}
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
                        position: 'absolute',
                        top: `${spike.y}%`,
                        left: `${spike.x}%`,
                        width: spike.w,
                        height: spike.h,
                        borderRadius: 0,
                        clipPath: 'polygon(50% 0%, 100% 100%, 50% 78%, 0% 100%)',
                        transform: `translate(-50%, -50%) rotate(${spike.rotate}deg)`,
                        transformOrigin: '50% 100%',
                        background: `linear-gradient(180deg, ${hexToRgba(chargeAuraColor, 0.95)} 0%, ${hexToRgba(chargeAuraColor, 0.58)} 45%, ${hexToRgba(chargeAuraColor, 0.18)} 80%, transparent 100%)`,
                        filter: `blur(${0.3 + chargeIntensity * 0.8}px)`,
                        opacity: 0,
                        zIndex: -1,
                        pointerEvents: 'none',
                        animation: `auraSpikePop ${spike.duration}s ease-in-out ${spike.delay}s infinite`,
                        ['--aura-peak' as string]: String(Math.min(1, spike.peak + chargeIntensity * 0.2)),
                        ['--aura-rot' as string]: `${spike.rotate}deg`,
                    }}
                />
            ))}
            {chargeLevel > 0 && (
                <>
                    <div
                        style={{
                            position: 'absolute',
                            inset: '-24%',
                            borderRadius: '30%',
                            pointerEvents: 'none',
                            zIndex: -2,
                            background: `radial-gradient(circle, ${hexToRgba(chargeAuraColor, 0.05)} 0%, ${hexToRgba(chargeAuraColor, 0.1)} 42%, ${hexToRgba(chargeAuraColor, 0.35)} 72%, transparent 100%)`,
                            filter: `blur(${4 + chargeIntensity * 10}px)`,
                            animation: `auraFlow ${3 - chargeIntensity * 0.55}s linear infinite`,
                        }}
                    />
                    <div
                        style={{
                            position: 'absolute',
                            inset: '-30%',
                            borderRadius: '42%',
                            pointerEvents: 'none',
                            zIndex: -3,
                            background: `conic-gradient(from 0deg, transparent 0deg, ${hexToRgba(chargeAuraColor, 0.4)} 70deg, transparent 150deg, ${hexToRgba(chargeAuraColor, 0.3)} 240deg, transparent 320deg)`,
                            filter: `blur(${2 + chargeIntensity * 4}px)`,
                            animation: `auraSweep ${4.8 - chargeIntensity * 0.8}s linear infinite`,
                        }}
                    />
                </>
            )}

            {showParticleBarrierBurst && (
                <>
                    <div
                        style={{
                            position: 'absolute',
                            inset: '-16%',
                            borderRadius: '50%',
                            pointerEvents: 'none',
                            zIndex: 3,
                            background: 'radial-gradient(circle, rgba(233,190,255,0.18) 0%, rgba(187,100,255,0.52) 52%, rgba(150,72,255,0.25) 74%, transparent 100%)',
                            filter: 'blur(0.2px) saturate(1.16)',
                            animation: 'zaryaBarrierBurst 0.72s ease-out forwards',
                        }}
                    />
                    <div
                        style={{
                            position: 'absolute',
                            inset: '-20%',
                            borderRadius: '50%',
                            border: '2px solid rgba(213,133,255,0.68)',
                            boxShadow: '0 0 12px rgba(193,98,255,0.6), inset 0 0 10px rgba(249,214,255,0.34)',
                            pointerEvents: 'none',
                            zIndex: 4,
                            animation: 'zaryaBarrierRing 0.72s ease-out forwards',
                        }}
                    />
                </>
            )}

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
                        transition: `width ${effect?.hpTransitionMs ?? 300}ms`,
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
                @keyframes auraSpikePop {
                    0%, 14%, 100% { opacity: 0; transform: translate(-50%, -50%) scaleY(.1) rotate(var(--aura-rot, 0deg)); }
                    28% { opacity: calc(var(--aura-peak, .8) * .95); transform: translate(-50%, -50%) scaleY(1.1) rotate(var(--aura-rot, 0deg)); }
                    44% { opacity: calc(var(--aura-peak, .8) * .75); transform: translate(-50%, -50%) scaleY(.88) rotate(var(--aura-rot, 0deg)); }
                    62% { opacity: 0; transform: translate(-50%, -50%) scaleY(.2) rotate(var(--aura-rot, 0deg)); }
                }
                @keyframes auraFlow {
                    0% { transform: scale(.9); opacity: .45; }
                    50% { transform: scale(1.08); opacity: .85; }
                    100% { transform: scale(1.22); opacity: .15; }
                }
                @keyframes auraSweep {
                    0% { transform: rotate(0deg) scale(0.95); opacity: .45; }
                    50% { opacity: .9; }
                    100% { transform: rotate(360deg) scale(1.08); opacity: .42; }
                }
                @keyframes zaryaBarrierBurst {
                    0% { opacity: .16; transform: scale(.72); }
                    35% { opacity: .88; transform: scale(1.04); }
                    100% { opacity: 0; transform: scale(1.35); }
                }
                @keyframes zaryaBarrierRing {
                    0% { opacity: .2; transform: scale(.78); }
                    34% { opacity: .95; transform: scale(1.03); }
                    100% { opacity: 0; transform: scale(1.28); }
                }
                @keyframes damageFloatTrajectory {
                    0% {
                        opacity: .24;
                        filter: blur(1.9px);
                        transform: translate(-50%, 0%) scale(.94);
                    }
                    6% {
                        opacity: 1;
                        filter: blur(0);
                        transform: translate(-50%, -26%) scale(1.05);
                    }
                    12% {
                        opacity: .98;
                        filter: blur(.25px);
                        transform: translate(-50%, -38%) scale(1);
                    }
                    18% {
                        opacity: 1;
                        filter: blur(0);
                        transform: translate(-50%, -46%) scale(1);
                    }
                    76% {
                        opacity: .95;
                        filter: blur(0);
                        transform: translate(-50%, -46%) scale(1);
                    }
                    88% {
                        opacity: .86;
                        filter: blur(.2px);
                        transform: translate(-50%, -94%) scale(.98);
                    }
                    100% {
                        opacity: 0;
                        filter: blur(1.4px);
                        transform: translate(-50%, -138%) scale(.9);
                    }
                }
                @keyframes destroyFadeOut {
                    0% { opacity: 1; transform: scale(1); filter: saturate(1); }
                    100% { opacity: 0; transform: scale(0.94); filter: saturate(.4) blur(1px); }
                }
            `}</style>
        </div>
    );
};

export default FieldCardComp;