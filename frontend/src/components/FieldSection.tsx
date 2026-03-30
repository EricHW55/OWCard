import React from 'react';
import type { FieldState, FieldCard, HandCard as HandCardType } from '../types/game';
import { ROLE_COLOR } from '../types/constants';
import FieldCardComp from './FieldCardComp';

interface Props {
    field: FieldState;
    isOpponent: boolean;
    isMyTurn: boolean;
    phase: string;
    selectedUid: string | null;
    canActUids: string[];
    onCardClick: (card: FieldCard) => void;
    placingCard: HandCardType | null;
    onPlaceClick: (zone: 'main' | 'side') => void;
    allowOpponentPlacement?: boolean;
}

const EmptySlot: React.FC<{ highlight?: boolean; onClick?: () => void }> = ({ highlight, onClick }) => (
    // <div onClick={onClick} style={{
    //     width: 62, height: 86, borderRadius: 6,
    //     border: `2px dashed ${highlight ? '#ff9b30' : '#1a2340'}`,
    //     background: highlight ? 'rgba(255,155,48,0.08)' : 'transparent',
    //     display: 'flex', alignItems: 'center', justifyContent: 'center',
    //     fontSize: 9, color: '#3a4a78',
    //     cursor: highlight ? 'pointer' : 'default', flexShrink: 0,
    // }}>
    <div onClick={onClick} className={`field-empty-slot ${highlight ? 'highlight' : ''}`}>
        {highlight ? '배치' : ''}
    </div>
);

const FieldSection: React.FC<Props> = ({
                                           field, isOpponent, isMyTurn, phase,
                                           selectedUid, canActUids, onCardClick,
                                           placingCard, onPlaceClick, allowOpponentPlacement = false,
                                       }) => {
    const tanks = (field?.main || []).filter(c => c.role === 'tank');
    const dealers = (field?.main || []).filter(c => c.role === 'dealer');
    const healers = (field?.main || []).filter(c => c.role === 'healer');
    const sideCards = field?.side || [];

    // 배치 조건: 내 턴 + 배치 페이즈 + 카드 선택됨
    const canPlace = !!placingCard && isMyTurn && phase === 'placement' && (!isOpponent || allowOpponentPlacement);
    const placingRole = placingCard?.role;

    const renderCard = (card: FieldCard) => (
        <FieldCardComp
            key={card.uid} card={card}
            selected={selectedUid === card.uid}
            glowing={canActUids.includes(card.uid)}
            onClick={() => onCardClick(card)}
        />
    );

    const renderRow = (cards: FieldCard[], role: string, max: number) => {
        const slots = [];
        for (let i = 0; i < max; i++) {
            if (i < cards.length) {
                slots.push(renderCard(cards[i]));
            } else if (canPlace && placingRole === role) {
                slots.push(<EmptySlot key={`e-${role}-${i}`} highlight onClick={() => onPlaceClick('main')} />);
            } else {
                slots.push(<EmptySlot key={`e-${role}-${i}`} />);
            }
        }
        return slots;
    };

    /*
     * 상대: 힐러(먼) → 딜러 → 탱커(가까움=보드 중앙)
     * 나:   탱커(가까움=보드 중앙) → 딜러 → 힐러(먼)
     */
    const mainRows = isOpponent
        ? [
            { role: 'healer', label: '힐러', cards: healers, max: 2 },
            { role: 'dealer', label: '딜러', cards: dealers, max: 2 },
            { role: 'tank',   label: '탱커', cards: tanks,   max: 1 },
        ]
        : [
            { role: 'tank',   label: '탱커', cards: tanks,   max: 1 },
            { role: 'dealer', label: '딜러', cards: dealers, max: 2 },
            { role: 'healer', label: '힐러', cards: healers, max: 2 },
        ];

    const sideTank = sideCards.find(c => c.role === 'tank');
    const sideDealer = sideCards.find(c => c.role === 'dealer');
    const sideHealer = sideCards.find(c => c.role === 'healer');

    const sideRowDefs = isOpponent
        ? [
            { role: 'healer' as const, card: sideHealer },
            { role: 'dealer' as const, card: sideDealer },
            { role: 'tank'   as const, card: sideTank },
        ]
        : [
            { role: 'tank'   as const, card: sideTank },
            { role: 'dealer' as const, card: sideDealer },
            { role: 'healer' as const, card: sideHealer },
        ];

    return (
        <div className="field-section">
            <div className="field-section-title">{isOpponent ? '상대 본대' : '나의 본대'}</div>

            {mainRows.map(({ role, label, cards, max }, idx) => {
                const sideDef = sideRowDefs[idx];
                const canPlaceSide = canPlace && placingRole === sideDef.role;
                return (
                    <div key={role} className="field-lane-row">
                        <span className="field-role-label" style={{ color: ROLE_COLOR[role] }}>{label}</span>
                        <div className="field-lane-track">
                            <div className={`field-main-slot-wrap ${max === 1 ? 'single' : ''}`}>
                                {renderRow(cards, role, max)}
                            </div>
                            <div className="field-main-side-divider" aria-hidden />
                            <div className="field-side-slot-wrap">
                                {sideDef.card ? renderCard(sideDef.card) : (
                                    <EmptySlot
                                        key={`side-${role}`}
                                        highlight={canPlaceSide}
                                        onClick={canPlaceSide ? () => onPlaceClick('side') : undefined}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default FieldSection;