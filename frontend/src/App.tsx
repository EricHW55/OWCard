import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import LobbyPage from './pages/LobbyPage';
import GamePage from './pages/GamePage';
import DeckBuilderPage from './pages/DeckBuilderPage';
import GameRulesPage from './pages/GameRulesPage';
import SoloGamePage from './pages/SoloGamePage';

const App: React.FC = () => {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<LobbyPage />} />
                <Route path="/deck-builder" element={<DeckBuilderPage />} />
                <Route path="/rules" element={<GameRulesPage />} />
                <Route path="/game/:gameId" element={<GamePage />} />
                <Route path="/solo-game" element={<SoloGamePage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
};

export default App;