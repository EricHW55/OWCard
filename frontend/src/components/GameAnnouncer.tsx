// components/GameAnnouncer.tsx
import React, { useEffect } from 'react';
import { getCardImageSrc } from '../utils/heroImage'; // 경로를 프로젝트에 맞게 확인해주세요!
import './GameAnnouncer.css';

export interface AnnouncerData {
    type: 'phase' | 'skill';
    title: string;           // 예: "공격 턴", "화염강타"
    subtitle?: string;       // 예: "ACTION PHASE" (페이즈용)
    description?: string;    // 스킬 설명
    heroKey?: string;        // 이미지 조회를 위한 영웅/스킬 키
    isSpell?: boolean;       // 스킬 카드 여부
    duration?: number;       // 화면에 떠있는 시간 (기본값 2000ms 또는 2500ms)
}

interface Props {
    data: AnnouncerData | null;
    onClose: () => void;
}

const GameAnnouncer: React.FC<Props> = ({ data, onClose }) => {
    useEffect(() => {
        if (data) {
            // type에 따라 지속 시간을 다르게 줄 수 있습니다.
            const displayTime = data.duration || (data.type === 'skill' ? 2500 : 2000);
            const timer = setTimeout(() => {
                onClose();
            }, displayTime);
            return () => clearTimeout(timer);
        }
    }, [data, onClose]);

    if (!data) return null;

    return (
        <div className="game-announcer-overlay">
            {data.type === 'phase' && (
                <div className="announcer-phase">
                    <div className="game-announcer-title">{data.title}</div>
                    {data.subtitle && <div className="game-announcer-subtitle">{data.subtitle}</div>}
                </div>
            )}

            {data.type === 'skill' && (
                <div className="announcer-skill-card">
                    <div className="skill-card-image-wrapper">
                        <img
                            src={getCardImageSrc({ hero_key: data.heroKey, is_spell: data.isSpell })}
                            alt={data.title}
                            className="skill-card-image"
                        />
                    </div>
                    <div className="skill-card-content">
                        <div className="skill-card-title">{data.title}</div>
                        {data.description && (
                            <div className="skill-card-desc">{data.description}</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default GameAnnouncer;