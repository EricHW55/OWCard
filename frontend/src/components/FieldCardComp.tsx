import React from 'react';
import type { FieldCard } from '../types/game';
import { ROLE_COLOR, ROLE_ICON } from '../types/constants';

interface Props {
    card: FieldCard;
    selected?: boolean;
    glowing?: boolean;
    onClick?: () => void;
}

/** 첫 번째 스킬 데미지를 대표 수치로 추출 */
function getMainDamage(card: FieldCard): string {
    const dmg = card.skill_damages;
    if (!dmg) return '0';
    const keys = Object.keys(dmg);
    if (keys.length === 0) return '0';
    const val = dmg[keys[0]];
    if (typeof val === 'number') return String(val);
    if (Array.isArray(val)) return String(val[0] ?? 0);
    if (typeof val === 'object' && val !== null) {
        // {"heal": 5, "damage": 3} → "3"
        return String(val.damage ?? val.heal ?? 0);
    }
    return '0';
}

const FieldCardComp: React.FC<Props> = ({ card, selected, glowing, onClick }) => {
    const color = ROLE_COLOR[card.role] || '#888';
    const hpPct = card.max_hp > 0 ? (card.current_hp / card.max_hp) * 100 : 0;
    const hpColor = hpPct > 60 ? '#22dd77' : hpPct > 30 ? '#ffaa22' : '#ff3355';
    const hasBarrier = card.statuses?.some(s => s.name === 'barrier');
    const isHidden = card.statuses?.some(s => ['stealth', 'burrowed', 'frozen_state'].includes(s.name));
    const hasBurn = card.statuses?.some(s => s.name === 'burn');
    const mainDmg = getMainDamage(card);

    let borderColor = color;
    let shadow = 'none';
    if (selected) { borderColor = '#ff9b30'; shadow = '0 0 12px rgba(255,155,48,0.6)'; }
    else if (glowing) { borderColor = '#66ddff'; shadow = '0 0 10px #66ddff88, 0 0 20px #66ddff44'; }
    else if (hasBarrier) { shadow = `0 0 6px ${color}44`; }

    return (
        <div onClick={onClick} style={{
            width: 62, height: 86, borderRadius: 6, position: 'relative',
            border: `2px solid ${borderColor}`,
            background: selected ? 'rgba(255,155,48,0.15)' : glowing ? 'rgba(102,221,255,0.08)' : `${color}12`,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'space-between', padding: '3px 2px',
            cursor: 'pointer', flexShrink: 0,
            opacity: isHidden ? 0.45 : 1,
            boxShadow: shadow, transition: 'all 0.25s',
        }}>
            {hasBarrier && <div style={{ position: 'absolute', inset: -3, border: '2px solid #22cc8866', borderRadius: 8, pointerEvents: 'none' }} />}
            {glowing && !selected && <div style={{ position: 'absolute', inset: -2, borderRadius: 8, pointerEvents: 'none', border: '1px solid #66ddff66', animation: 'pulse 1.5s ease-in-out infinite' }} />}

            <div style={{ fontSize: 8, fontWeight: 700, color, textAlign: 'center', lineHeight: 1.1 }}>{card.name}</div>
            <div style={{ fontSize: 18 }}>{ROLE_ICON[card.role]}</div>
            <div style={{ display: 'flex', gap: 3, fontSize: 8, fontWeight: 700 }}>
                <span style={{ color: '#ff9b30' }}>✦{mainDmg}</span>
                <span style={{ color: '#22dd77' }}>♥{card.current_hp}</span>
            </div>
            <div style={{ width: '90%', height: 3, background: '#0a0e1a', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${hpPct}%`, background: hpColor, borderRadius: 2, transition: 'width 0.3s' }} />
            </div>

            <div style={{ position: 'absolute', top: 2, right: 2, display: 'flex', gap: 2 }}>
                {hasBurn && <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#ff6622' }} />}
                {card.statuses?.some(s => s.name === 'skill_silence') && <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#ff3355' }} />}
            </div>
            {card.placed_this_turn && <div style={{ position: 'absolute', bottom: 1, right: 2, fontSize: 7, color: '#ffaa22' }}>NEW</div>}

            <style>{`@keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:1} }`}</style>
        </div>
    );
};

export default FieldCardComp;
