import React from 'react';
import GameAnnouncer, { AnnouncerData } from './GameAnnouncer';

interface GameBoardLayoutProps {
    announcerData: AnnouncerData | null;
    onCloseAnnouncer: () => void;
    rootStyle?: React.CSSProperties;
    children: React.ReactNode;
}

const defaultRootStyle: React.CSSProperties = {
    background: 'linear-gradient(180deg, #0a0e1a 0%, #111832 100%)',
    color: '#e8ecf8',
};

const GameBoardLayout: React.FC<GameBoardLayoutProps> = ({ announcerData, onCloseAnnouncer, rootStyle, children }) => {
    return (
        <div className="game-page" style={rootStyle || defaultRootStyle}>
            <GameAnnouncer data={announcerData} onClose={onCloseAnnouncer} />
            {children}
        </div>
    );
};

export default GameBoardLayout;