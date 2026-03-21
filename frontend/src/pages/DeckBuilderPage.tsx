import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './DeckBuilderPage.css';

const TEMP_HERO_IDS = [
    'ana', 'ashe', 'baptiste', 'bastion', 'brigitte', 'cassidy', 'domina',
    'doomfist', 'dva', 'echo', 'emre', 'freja', 'genji', 'hanzo', 'hazard',
    'illari', 'jetpack_cat', 'junker_queen', 'junkrat', 'juno', 'kiriko',
    'lifeweaver', 'lucio', 'mauga', 'mei', 'mercy', 'mizuki', 'moira',
    'orisa', 'pharah', 'ramattra', 'reaper', 'reinhardt', 'roadhog',
    'sigma', 'sojourn', 'soldier_76', 'sombra', 'symmetra', 'torbjorn',
    'tracer', 'vendetta', 'venture', 'widowmaker', 'winston',
    'wrecking_ball', 'wuyang', 'zarya', 'zenyatta',
];

const MAX_DECK_SIZE = 12;

const DeckBuilderPage: React.FC = () => {
    const navigate = useNavigate();

    const [deckName, setDeckName] = useState('임시 덱');
    const [search, setSearch] = useState('');
    const [deck, setDeck] = useState<string[]>(() => {
        const saved = localStorage.getItem('temp_deck_cards');
        return saved ? JSON.parse(saved) : [];
    });

    const filteredHeroes = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return TEMP_HERO_IDS;
        return TEMP_HERO_IDS.filter((id) => id.toLowerCase().includes(q));
    }, [search]);

    const addHero = (heroId: string) => {
        if (deck.length >= MAX_DECK_SIZE) return;
        setDeck((prev) => [...prev, heroId]);
    };

    const removeHero = (index: number) => {
        setDeck((prev) => prev.filter((_, i) => i !== index));
    };

    const saveDeck = () => {
        localStorage.setItem('temp_deck_name', deckName);
        localStorage.setItem('temp_deck_cards', JSON.stringify(deck));
        alert('임시 덱 저장 완료');
    };

    const clearDeck = () => {
        setDeck([]);
    };

    return (
        <div className="deck-builder-page">
            <div className="deck-builder-shell">
                <div className="deck-builder-header">
                    <div>
                        <h1>덱 구성</h1>
                        <p>임시 영웅 아이콘 기반 덱 빌더</p>
                    </div>

                    <div className="deck-builder-actions">
                        <button className="ghost-btn" onClick={() => navigate('/')}>로비로</button>
                        <button className="ghost-btn" onClick={clearDeck}>초기화</button>
                        <button className="primary-btn" onClick={saveDeck}>저장</button>
                    </div>
                </div>

                <div className="deck-builder-topbar">
                    <input
                        className="deck-input"
                        value={deckName}
                        onChange={(e) => setDeckName(e.target.value)}
                        placeholder="덱 이름"
                    />

                    <input
                        className="deck-input"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="영웅 검색 (예: moira, rein)"
                    />
                </div>

                <div className="deck-builder-grid">
                    <section className="deck-panel">
                        <div className="panel-title">영웅 목록</div>

                        <div className="hero-grid">
                            {filteredHeroes.map((heroId) => (
                                <button
                                    key={heroId}
                                    className="hero-tile"
                                    onClick={() => addHero(heroId)}
                                    disabled={deck.length >= MAX_DECK_SIZE}
                                >
                                    <div className="hero-tile-image">
                                        <img src={`/heroes/${heroId}.png`} alt={heroId} />
                                    </div>
                                    <div className="hero-tile-name">{heroId}</div>
                                </button>
                            ))}
                        </div>
                    </section>

                    <section className="deck-panel">
                        <div className="panel-title">
                            내 덱 <span>{deck.length}/{MAX_DECK_SIZE}</span>
                        </div>

                        <div className="deck-slots">
                            {Array.from({ length: MAX_DECK_SIZE }).map((_, index) => {
                                const heroId = deck[index];

                                if (!heroId) {
                                    return (
                                        <div key={index} className="deck-slot empty">
                                            빈 슬롯
                                        </div>
                                    );
                                }

                                return (
                                    <button key={index} className="deck-slot" onClick={() => removeHero(index)}>
                                        <div className="deck-slot-image">
                                            <img src={`/heroes/${heroId}.png`} alt={heroId} />
                                        </div>
                                        <div className="deck-slot-name">{heroId}</div>
                                        <div className="deck-slot-remove">제거</div>
                                    </button>
                                );
                            })}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default DeckBuilderPage;