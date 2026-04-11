import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import LobbyPage from './pages/LobbyPage';
import GamePage from './pages/GamePage';
import DeckBuilderPage from './pages/DeckBuilderPage';
import GameRulesPage from './pages/GameRulesPage';
import SoloGamePage from './pages/SoloGamePage';
import StatusEffectsPage from './pages/StatusEffectsPage';
import AdminPage from './pages/AdminPage';

const App: React.FC = () => {
    React.useEffect(() => {
        const isEditableTarget = (target: EventTarget | null) => {
            if (!(target instanceof HTMLElement)) return false;
            return !!target.closest('input, textarea, select, option, [contenteditable="true"], [contenteditable="plaintext-only"]');
        };

        const handleContextMenu = (event: MouseEvent) => {
            if (isEditableTarget(event.target)) return;
            event.preventDefault();
        };

        const handleDragStart = (event: DragEvent) => {
            if (isEditableTarget(event.target)) return;
            event.preventDefault();
        };

        document.addEventListener('contextmenu', handleContextMenu);
        document.addEventListener('dragstart', handleDragStart);
        return () => {
            document.removeEventListener('contextmenu', handleContextMenu);
            document.removeEventListener('dragstart', handleDragStart);
        };
    }, []);
    
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<LobbyPage />} />
                <Route path="/deck-builder" element={<DeckBuilderPage />} />
                <Route path="/status-effects" element={<StatusEffectsPage />} />
                <Route path="/rules" element={<GameRulesPage />} />
                <Route path="/game/:gameId" element={<GamePage />} />
                <Route path="/solo-game" element={<SoloGamePage />} />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
};

export default App;