import React, { useEffect, useMemo, useState } from 'react';
import { getCardImageSrc } from '../utils/heroImage';
import './GameAnnouncer.css';

export interface AnnouncerData {
    type: 'phase' | 'skill';
    title: string;
    subtitle?: string;
    description?: string;
    heroKey?: string;
    imageName?: string;
    isSpell?: boolean;
    duration?: number;
    nonBlocking?: boolean;
    onDone?: () => void;
}

interface Props {
    data: AnnouncerData | null;
    onClose: () => void;
}

const GameAnnouncer: React.FC<Props> = ({ data, onClose }) => {
    const handleSkip = () => onClose();
    const [imgError, setImgError] = useState(false);

    useEffect(() => {
        setImgError(false);
    }, [data?.title, data?.heroKey, data?.imageName, data?.isSpell]);

    useEffect(() => {
        if (!data) return;
        const displayTime = data.duration || (data.type === 'skill' ? 2600 : 1500);
        const timer = window.setTimeout(() => onClose(), displayTime);
        return () => window.clearTimeout(timer);
    }, [data, onClose]);

    const displayTime = data?.duration || (data?.type === 'skill' ? 2600 : 1500);

    const imageSrc = useMemo(() => {
        if (!data || data.type !== 'skill') return '';
        const primary = getCardImageSrc({
            hero_key: data.heroKey,
            name: data.imageName || data.title,
            is_spell: data.isSpell,
        });
        if (primary !== '/heroes/_unknown.png') return primary;

        const actorName = String(data.subtitle || '').replace(/\s*사용$/, '').trim();
        const secondary = getCardImageSrc({
            hero_key: data.heroKey,
            name: actorName || data.imageName || data.title,
            is_spell: data.isSpell,
        });
        return secondary;
    }, [data]);

    if (!data) return null;

    const animationStyle = { animationDuration: `${displayTime}ms` };

    return (
        // <div className="game-announcer-overlay">
        <div
            className="game-announcer-overlay"
            style={data.nonBlocking ? { pointerEvents: 'none' } : undefined}
            onClick={data.nonBlocking ? undefined : handleSkip}
            role={data.nonBlocking ? undefined : 'button'}
            tabIndex={data.nonBlocking ? -1 : 0}
            onKeyDown={data.nonBlocking ? undefined : (e) => e.key === 'Enter' && handleSkip()}
        >
            {data.type === 'phase' && (
                // <div className="announcer-phase" style={animationStyle} onClick={handleSkip}
                //      role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && handleSkip()}>
                <div className="announcer-phase" style={animationStyle}>
                    <div className="announcer-phase-line" />
                    <div className="announcer-phase-body">
                        <div className="announcer-phase-title">{data.title}</div>
                        {data.subtitle && <div className="announcer-phase-subtitle">{data.subtitle}</div>}
                        {!data.nonBlocking && <div className="announcer-skip-hint">클릭하여 건너뛰기</div>}
                    </div>
                    <div className="announcer-phase-line" />
                </div>
            )}

            {data.type === 'skill' && (
                // <div className={`announcer-skill-card ${data.isSpell ? 'spell' : 'hero'}`} style={animationStyle}>
                // <div className={`announcer-skill-card ${data.isSpell ? 'spell' : 'hero'}`} style={animationStyle}
                //      onClick={handleSkip} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && handleSkip()}>
                <div
                    className={`announcer-skill-card ${data.isSpell ? 'spell' : 'hero'}`}
                    style={{ ...animationStyle, ['--announcer-duration' as string]: `${displayTime}ms` }}
                >
                    <div className="skill-card-stage">
                    <div className="skill-card-frame">
                        <div className="skill-card-top-trim" />
                        <div className="skill-card-side-trim left" />
                        <div className="skill-card-side-trim right" />
                        <div className="skill-card-inner-outline" />
                        <div className="skill-card-gloss" />

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

                        {!data.nonBlocking && <div className="announcer-skip-hint skill">클릭하여 건너뛰기</div>}
                        <div className="skill-card-bottom-trim" />
                    </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GameAnnouncer;
