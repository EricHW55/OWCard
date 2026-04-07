import React from 'react';
import type { HandCard } from '../types/game';
import { ROLE_COLOR } from '../types/constants';
import { useCardImage } from '../hooks/useCardImage';
import { CardFaceContent } from './CardFaceContent';

interface Props {
    card: HandCard;
    selected?: boolean;
    onClick?: () => void;
    index: number;
    total: number;
    focusedIndex: number;
}

const HandCardComp: React.FC<Props> = ({ card, selected, onClick, index, total, focusedIndex }) => {
    const color = card.is_spell ? '#ffaa22' : ROLE_COLOR[card.role] || '#888';
    const { currentImageSrc, imgError, onError, usingFullCardArt } = useCardImage(
        card as any,
        'hand',
        [card.id, card.hero_key, card.name, card.is_spell, card.role]
    );
    const hasFocused = focusedIndex >= 0;
    const relative = index - Math.max(0, focusedIndex);
    const fanProgress = total <= 1 ? 0 : index / (total - 1) - 0.5;
    const baseRotate = fanProgress * 22;
    const spreadOffset = hasFocused ? Math.sign(relative) * Math.min(Math.abs(relative) * 7, 28) : 0;
    const fanArcOffset = Math.pow(Math.abs(fanProgress) * 2, 1.25) * 16;
    const cardLift = selected ? -16 : 0;
    const cardScale = selected ? 1.14 : 1;
    const centerPriority = total <= 1 ? 1 : 1 - Math.abs(fanProgress * 2);
    const baseZIndex = 100 + Math.round(centerPriority * 100);

    return (
        <div
            onClick={onClick}
            className={`hand-card-3d ${usingFullCardArt ? 'hand-card-3d--fullart' : ''}`}
            style={{
                width: 70,
                height: 98,
                borderRadius: 6,
                border: usingFullCardArt ? 'none' : `2px solid ${selected ? '#ff9b30' : color}`,
                background: usingFullCardArt ? 'transparent' : (selected ? 'rgba(255,155,48,0.18)' : `${color}10`),
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: usingFullCardArt ? 0 : '4px 3px',
                cursor: 'pointer',
                flexShrink: 0,
                position: 'relative',
                boxShadow: selected
                    ? '0 0 14px rgba(255,155,48,0.5)'
                    : (usingFullCardArt ? '0 6px 12px rgba(0,0,0,0.3)' : 'none'),
                marginInline: '-14px',
                zIndex: selected ? 320 : baseZIndex,
                transform: `translateX(${spreadOffset}px) translateY(${cardLift + fanArcOffset}px) rotate(${baseRotate}deg) scale(${cardScale})`,
                transformOrigin: 'center 130%',
                transition: 'transform 0.22s ease, box-shadow 0.22s ease',
            }}
        >
            <CardFaceContent
                variant="hand"
                name={card.name}
                role={card.role}
                isSpell={card.is_spell}
                cost={card.cost}
                baseAttack={card.base_attack}
                hp={card.hp}
                currentImageSrc={currentImageSrc}
                usingFullCardArt={usingFullCardArt}
                imgError={imgError}
                onError={onError}
            />
        </div>
    );
};

export default HandCardComp;