import React, { useEffect, useMemo, useState } from 'react';
import { getCardImageSrc } from '../utils/heroImage';
import './GameAnnouncer.css';

export interface AnnouncerData {
    type: 'phase' | 'skill';
    title: string;
    subtitle?: string;
    description?: string;
    heroKey?: string;
    isSpell?: boolean;
    duration?: number;
}

interface Props {
    data: AnnouncerData | null;
    onClose: () => void;
}

const GameAnnouncer: React.FC<Props> = ({ data, onClose }) => {
    const [imgError, setImgError] = useState(false);

    useEffect(() => {
        setImgError(false);
    }, [data?.title, data?.heroKey, data?.isSpell]);

    useEffect(() => {
        if (!data) return;
        const displayTime = data.duration || (data.type === 'skill' ? 2100 : 1400);
        const timer = window.setTimeout(() => onClose(), displayTime);
        return () => window.clearTimeout(timer);
    }, [data, onClose]);

    const imageSrc = useMemo(() => {
        if (!data || data.type !== 'skill') return '';
        return getCardImageSrc({
            hero_key: data.heroKey,
            name: data.title,
            is_spell: data.isSpell,
        });
    }, [data]);

    if (!data) return null;

    return (
        <div className="game-announcer-overlay">
            {data.type === 'phase' && (
                <div className="announcer-phase">
                    <div className="announcer-phase-line" />
                    <div className="announcer-phase-body">
                        <div className="game-announcer-title">{data.title}</div>
                        {data.subtitle && <div className="game-announcer-subtitle">{data.subtitle}</div>}
                    </div>
                    <div className="announcer-phase-line" />
                </div>
            )}

            {data.type === 'skill' && (
                <div className={`announcer-skill-card ${data.isSpell ? 'spell' : 'hero'}`}>
                    <div className="skill-card-frame">
                        <div className="skill-card-top-emblem">{data.isSpell ? '✦ 스킬 카드' : '영웅 스킬'}</div>

                        <div className="skill-card-image-wrapper">
                            {!imgError ? (
                                <img
                                    src={imageSrc}
                                    alt={data.title}
                                    className="skill-card-image"
                                    onError={() => setImgError(true)}
                                />
                            ) : (
                                <div className="skill-card-fallback">{data.isSpell ? '✦' : '★'}</div>
                            )}
                        </div>

                        <div className="skill-card-content">
                            <div className="skill-card-title">{data.title}</div>
                            {data.subtitle && <div className="skill-card-subtitle">{data.subtitle}</div>}

                            {!!data.description && (
                                <div className="skill-card-desc-block">
                                    <div className="skill-card-desc-label">스킬 설명</div>
                                    <div className="skill-card-desc">{data.description}</div>
                                </div>
                            )}
                        </div>

                        <div className="skill-card-bottom-trim" />
                    </div>
                </div>
            )}
        </div>
    );
};

export default GameAnnouncer;
