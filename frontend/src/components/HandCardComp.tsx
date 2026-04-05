import React, { useEffect, useState } from 'react';
import type { HandCard } from '../types/game';
import { ROLE_COLOR, ROLE_ICON } from '../types/constants';
import { getCardArtCandidates, getHeroImageSrc } from '../utils/heroImage';

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
    const fallbackChain = [...getCardArtCandidates(card as any), getHeroImageSrc(card as any)];
    const [imageStep, setImageStep] = useState(0);
    const [imgError, setImgError] = useState(false);
    const currentImageSrc = fallbackChain[imageStep];
    const hasFocused = focusedIndex >= 0;
    const relative = index - Math.max(0, focusedIndex);
    const fanProgress = total <= 1 ? 0 : index / (total - 1) - 0.5;
    const baseRotate = fanProgress * 22;
    const spreadOffset = hasFocused ? Math.sign(relative) * Math.min(Math.abs(relative) * 7, 28) : 0;
    const fanArcOffset = Math.pow(Math.abs(fanProgress) * 2, 1.25) * 16;
    const cardLift = selected ? -16 : 0;
    const cardScale = selected ? 1.14 : 1;
    const usingFullCardArt = !!currentImageSrc && currentImageSrc.startsWith('/cards/');
    const centerPriority = total <= 1 ? 1 : 1 - Math.abs(fanProgress * 2);
    const baseZIndex = 100 + Math.round(centerPriority * 100);

    useEffect(() => {
        setImageStep(0);
        setImgError(false);
    }, [card.id, card.hero_key, card.name, card.is_spell, card.role]);

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
            {usingFullCardArt ? (
                <img
                    src={currentImageSrc}
                    alt={card.name}
                    onError={() => {
                        if (imageStep + 1 < fallbackChain.length) {
                            setImageStep((prev) => prev + 1);
                        } else {
                            setImgError(true);
                        }
                    }}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        borderRadius: 6,
                    }}
                />
            ) : (
                <>
                <div
                    style={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        background: '#44aaff',
                        color: '#fff',
                        fontSize: 10,
                        fontWeight: 900,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '2px solid #0a0e1a',
                    }}
                >
                    {card.cost || 1}
                </div>

                <div
                    style={{
                        width: 34,
                        height: 34,
                        borderRadius: 8,
                        overflow: 'hidden',
                        display: 'grid',
                        placeItems: 'center',
                        background: '#0d1225',
                        border: '1px solid #2a3560',
                    }}
                >
                    <div
                            style={{
                                width: 34,
                                height: 34,
                                borderRadius: 8,
                                overflow: 'hidden',
                                display: 'grid',
                                placeItems: 'center',
                                background: '#0d1225',
                                border: '1px solid #2a3560',
                            }}
                    >
                        {!imgError && currentImageSrc ? (
                            <img
                                src={currentImageSrc}
                                alt={card.name}
                                onError={() => {
                                    if (imageStep + 1 < fallbackChain.length) {
                                        setImageStep((prev) => prev + 1);
                                    } else {
                                        setImgError(true);
                                    }
                                }}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover'
                                }}
                            />
                        ) : (
                            <span style={{ fontSize: 18 }}>
                                    {card.is_spell ? '✦' : ROLE_ICON[card.role]}
                                </span>
                        )}
                    </div>
                </div>

                <div
                    style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: '#e8ecf8',
                        textAlign: 'center',
                        lineHeight: 1.1,
                    }}
                >
                    {card.name}
                </div>

                    {card.is_spell ? (
                        <div style={{ fontSize: 8, color: '#ffaa22', fontWeight: 700 }}>스킬</div>
                    ) : (
                        <div style={{ display: 'flex', gap: 3, fontSize: 8, fontWeight: 700 }}>
                            <span style={{ color: '#ff4466' }}>⚔{card.base_attack || 0}</span>
                            <span style={{ color: '#22dd77' }}>♥{card.hp}</span>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default HandCardComp;