import React from 'react';
import type { FieldCard } from '../types/game';
import { ROLE_COLOR, ROLE_ICON } from '../types/constants';

interface Props {
    card: FieldCard;
    selected?: boolean;
    glowing?: boolean;
    onClick?: () => void;
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
    const color = ROLE_COLOR[card.role] || '#888';
    const hpPct = card.max_hp > 0 ? (card.current_hp / card.max_hp) * 100 : 0;
    const hpColor = hpPct > 60 ? '#22dd77' : hpPct > 30 ? '#ffaa22' : '#ff3355';
    const mainDmg = getMainDamage(card);

    // 배리어 HP (status에서 직접 읽기)
    const barrierStatus = card.statuses?.find(s => s.name === 'barrier');
    const barrierHp = barrierStatus?.barrier_hp ?? 0;
    const hasBarrier = barrierHp > 0;

    // 추가체력
    const extraHpStatus = card.statuses?.find(s => s.name === 'extra_hp');
    const extraHp = extraHpStatus?.extra_hp ?? 0;

    const isHidden = card.statuses?.some(s => ['stealth', 'burrowed', 'frozen_state'].includes(s.name));
    const hasBurn = card.statuses?.some(s => s.name === 'burn');
    const hasSilence = card.statuses?.some(s => s.name === 'skill_silence' || s.name === 'sleep');
    const hasShield = card.statuses?.some(s => s.name === 'damage_reduction');
    const buffs = card.statuses?.filter(s => s.tags?.includes('buff')) || [];
    const debuffs = card.statuses?.filter(s => s.tags?.includes('debuff')) || [];

    let borderColor = color;
    let shadow = 'none';
    if (selected) { borderColor = '#ff9b30'; shadow = '0 0 12px rgba(255,155,48,0.6)'; }
    else if (glowing) { borderColor = '#66ddff'; shadow = '0 0 10px #66ddff88, 0 0 20px #66ddff44'; }
    else if (hasBarrier) { shadow = '0 0 8px #22cc8866'; }

    return (
        <div onClick={onClick} style={{
            width: 62, height: 92, borderRadius: 6, position: 'relative',
            border: `2px solid ${borderColor}`,
            background: selected ? 'rgba(255,155,48,0.15)' : glowing ? 'rgba(102,221,255,0.08)' : `${color}12`,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'space-between', padding: '3px 2px',
            cursor: 'pointer', flexShrink: 0,
            opacity: isHidden ? 0.45 : 1,
            boxShadow: shadow, transition: 'all 0.25s',
        }}>
            {hasBarrier && <div style={{ position: 'absolute', inset: -3, border: '2px solid #22cc8888', borderRadius: 8, pointerEvents: 'none' }} />}
            {glowing && !selected && <div style={{ position: 'absolute', inset: -2, borderRadius: 8, pointerEvents: 'none', border: '1px solid #66ddff66', animation: 'pulse 1.5s ease-in-out infinite' }} />}

            {/* 이름 */}
            <div style={{ fontSize: 8, fontWeight: 700, color, textAlign: 'center', lineHeight: 1.1 }}>{card.name}</div>

            {/* 아이콘 */}
            <div style={{ fontSize: 16 }}>{ROLE_ICON[card.role]}</div>

            {/* 스탯 */}
            <div style={{ display: 'flex', gap: 2, fontSize: 7, fontWeight: 700, flexWrap: 'wrap', justifyContent: 'center' }}>
                <span style={{ color: '#ff9b30' }}>✦{mainDmg}</span>
                <span style={{ color: '#22dd77' }}>♥{card.current_hp}</span>
                {hasBarrier && <span style={{ color: '#22cc88' }}>🛡{barrierHp}</span>}
                {extraHp > 0 && <span style={{ color: '#ffdd44' }}>+{extraHp}</span>}
            </div>

            {/* HP 바 */}
            <div style={{ width: '90%', height: 3, background: '#0a0e1a', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${hpPct}%`, background: hpColor, borderRadius: 2, transition: 'width 0.3s' }} />
            </div>

            {/* 상태 아이콘 (우측 상단) */}
            <div style={{ position: 'absolute', top: 1, right: 1, display: 'flex', gap: 1, flexWrap: 'wrap', maxWidth: 20 }}>
                {hasBurn && <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#ff6622' }} />}
                {hasSilence && <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#ff3355' }} />}
                {hasShield && <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#44aaff' }} />}
            </div>

            {/* 버프/디버프 (좌측 상단) */}
            <div style={{ position: 'absolute', top: 1, left: 1, display: 'flex', gap: 1 }}>
                {buffs.length > 0 && <span style={{ fontSize: 6, color: '#22dd77', fontWeight: 900 }}>+{buffs.length}</span>}
                {debuffs.length > 0 && <span style={{ fontSize: 6, color: '#ff3355', fontWeight: 900 }}>-{debuffs.length}</span>}
            </div>

            {card.placed_this_turn && <div style={{ position: 'absolute', bottom: 1, right: 2, fontSize: 7, color: '#ffaa22' }}>NEW</div>}
            {card.acted_this_turn && <div style={{ position: 'absolute', bottom: 1, left: 2, fontSize: 7, color: '#5a6488' }}>✓</div>}

            <style>{`@keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:1} }`}</style>
        </div>
    );
};

export default FieldCardComp;