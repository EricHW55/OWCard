import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getApiBase } from '../api/ws';
import './DeckBuilderPage.css';

interface CardTemplate {
    id: number;
    name: string;
    role: string;
    hp?: number;
    cost?: number;
    is_spell?: boolean;
}

interface DeckEntry {
    card_template_id: number;
    quantity: number;
}

interface DeckInfo {
    id: number;
    player_id: number;
    name: string;
    cards: DeckEntry[];
}

function getImageName(card: CardTemplate): string {
    const map: Record<string, string> = {
        프레야: 'freja',
        라인하르트: 'reinhardt',
        레킹볼: 'wrecking_ball',
        정커퀸: 'junker_queen',
        위도우메이커: 'widowmaker',
        솔저: 'soldier_76',
        솔져: 'soldier_76',
        라이프위버: 'lifeweaver',
        라위: 'lifeweaver',
        제트팩캣: 'jetpack_cat',
        벤처: 'venture',
        벤데타: 'vendetta',
        도미나: 'domina',
        엠레: 'emre',
        우양: 'wuyang',
    };

    return map[card.name] || '_unknown';
}

const DeckBuilderPage: React.FC = () => {
    const navigate = useNavigate();

    const [playerId, setPlayerId] = useState<number>(0);
    const [deckSize, setDeckSize] = useState<number>(20);

    const [cards, setCards] = useState<CardTemplate[]>([]);
    const [myDecks, setMyDecks] = useState<DeckInfo[]>([]);
    const [selectedDeckId, setSelectedDeckId] = useState<number | null>(null);

    const [deckName, setDeckName] = useState('내 덱');
    const [search, setSearch] = useState('');
    const [entries, setEntries] = useState<Record<number, number>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const totalCount = useMemo(
        () => Object.values(entries).reduce((sum, qty) => sum + qty, 0),
        [entries]
    );

    const filteredCards = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return cards;
        return cards.filter((c) => {
            const hay = `${c.name} ${c.role}`.toLowerCase();
            return hay.includes(q);
        });
    }, [cards, search]);

    const selectedCards = useMemo(() => {
        return cards
            .filter((c) => (entries[c.id] ?? 0) > 0)
            .map((c) => ({ ...c, quantity: entries[c.id] }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [cards, entries]);

    const loadAll = async (pid: number) => {
        const [cfgRes, cardsRes, decksRes] = await Promise.all([
            fetch(`${getApiBase()}/public/game-config`),
            fetch(`${getApiBase()}/cards`),
            fetch(`${getApiBase()}/decks/player/${pid}`),
        ]);

        if (!cfgRes.ok) throw new Error('게임 설정을 불러오지 못했습니다.');
        if (!cardsRes.ok) throw new Error('카드 목록을 불러오지 못했습니다.');
        if (!decksRes.ok) throw new Error('내 덱 목록을 불러오지 못했습니다.');

        const cfg = await cfgRes.json();
        const cardList = await cardsRes.json();
        const deckList = await decksRes.json();

        setDeckSize(cfg.deck_size ?? 20);
        setCards(Array.isArray(cardList) ? cardList : []);
        setMyDecks(Array.isArray(deckList) ? deckList : []);

        if (Array.isArray(deckList) && deckList.length > 0) {
            const first = deckList[0];
            selectDeck(first);
        } else {
            setSelectedDeckId(null);
            setDeckName('내 덱');
            setEntries({});
        }
    };

    useEffect(() => {
        const rawPlayerId = sessionStorage.getItem('player_id');
        if (!rawPlayerId) {
            alert('먼저 로비에서 로그인해줘.');
            navigate('/');
            return;
        }

        const pid = Number(rawPlayerId);
        setPlayerId(pid);

        setLoading(true);
        loadAll(pid)
            .catch((e) => alert(e.message))
            .finally(() => setLoading(false));
    }, [navigate]);

    const selectDeck = (deck: DeckInfo) => {
        setSelectedDeckId(deck.id);
        setDeckName(deck.name);
        const next: Record<number, number> = {};
        for (const c of deck.cards) {
            next[c.card_template_id] = c.quantity;
        }
        setEntries(next);
    };

    const addCard = (cardId: number) => {
        if (totalCount >= deckSize) return;
        setEntries((prev) => ({
            ...prev,
            [cardId]: (prev[cardId] ?? 0) + 1,
        }));
    };

    const removeCard = (cardId: number) => {
        setEntries((prev) => {
            const next = { ...prev };
            const current = next[cardId] ?? 0;
            if (current <= 1) {
                delete next[cardId];
            } else {
                next[cardId] = current - 1;
            }
            return next;
        });
    };

    const clearDeck = () => {
        setEntries({});
    };

    const saveDeck = async () => {
        if (!playerId) return;

        if (totalCount !== deckSize) {
            alert(`덱은 정확히 ${deckSize}장이어야 해. 현재 ${totalCount}장`);
            return;
        }

        const payloadCards = Object.entries(entries).map(([cardId, quantity]) => ({
            card_template_id: Number(cardId),
            quantity,
        }));

        try {
            setSaving(true);

            let deckId = selectedDeckId;

            if (deckId) {
                const res = await fetch(`${getApiBase()}/decks/${deckId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: deckName,
                        cards: payloadCards,
                    }),
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.detail || '덱 수정 실패');
                }
            } else {
                const res = await fetch(`${getApiBase()}/decks`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        player_id: playerId,
                        name: deckName,
                        cards: payloadCards,
                    }),
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.detail || '덱 생성 실패');
                }
                const created = await res.json();
                deckId = created.id;
                setSelectedDeckId(deckId);
            }

            const selectRes = await fetch(`${getApiBase()}/decks/${deckId}/select`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ player_id: playerId }),
            });

            if (!selectRes.ok) {
                const err = await selectRes.json().catch(() => ({}));
                throw new Error(err.detail || '현재 덱 선택 실패');
            }

            await loadAll(playerId);
            alert('덱 저장 완료. 이제 이 덱이 기본 덱으로 사용돼.');
        } catch (e: any) {
            alert(e.message);
        } finally {
            setSaving(false);
        }
    };

    const createNewDeck = () => {
        setSelectedDeckId(null);
        setDeckName(`새 덱 ${myDecks.length + 1}`);
        setEntries({});
    };

    if (loading) {
        return (
            <div className="deck-builder-page">
                <div className="deck-builder-shell">
                    <div className="deck-panel">불러오는 중...</div>
                </div>
            </div>
        );
    }

    return (
        <div className="deck-builder-page">
            <div className="deck-builder-shell">
                <div className="deck-builder-header">
                    <div>
                        <h1>덱 구성</h1>
                        <p>백엔드 설정 기준 덱 크기: {deckSize}장</p>
                    </div>

                    <div className="deck-builder-actions">
                        <button className="ghost-btn" onClick={() => navigate('/')}>로비로</button>
                        <button className="ghost-btn" onClick={createNewDeck}>새 덱</button>
                        <button className="ghost-btn" onClick={clearDeck}>초기화</button>
                        <button className="primary-btn" onClick={saveDeck} disabled={saving}>
                            {saving ? '저장 중...' : '저장'}
                        </button>
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
                        placeholder="카드 검색"
                    />
                </div>

                <div className="deck-builder-topbar">
                    <select
                        className="deck-input"
                        value={selectedDeckId ?? ''}
                        onChange={(e) => {
                            const id = Number(e.target.value);
                            const found = myDecks.find((d) => d.id === id);
                            if (found) selectDeck(found);
                        }}
                    >
                        <option value="">새 덱 만들기</option>
                        {myDecks.map((d) => (
                            <option key={d.id} value={d.id}>
                                {d.name} (ID: {d.id})
                            </option>
                        ))}
                    </select>

                    <div
                        className="deck-input"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                        }}
                    >
                        <span>현재 장수</span>
                        <b>{totalCount} / {deckSize}</b>
                    </div>
                </div>

                <div className="deck-builder-grid">
                    <section className="deck-panel">
                        <div className="panel-title">카드 목록</div>

                        <div className="hero-grid">
                            {filteredCards.map((card) => {
                                const qty = entries[card.id] ?? 0;
                                const imgName = getImageName(card);

                                return (
                                    <div key={card.id} className="hero-tile">
                                        <button
                                            className="hero-tile-image"
                                            onClick={() => addCard(card.id)}
                                            disabled={totalCount >= deckSize}
                                            style={{ width: '100%', border: 'none', padding: 0, cursor: 'pointer' }}
                                        >
                                            <img
                                                src={`/heroes/${imgName}.png`}
                                                alt={card.name}
                                                onError={(e) => {
                                                    (e.currentTarget as HTMLImageElement).src = '/heroes/_unknown.png';
                                                }}
                                            />
                                        </button>

                                        <div className="hero-tile-name">{card.name}</div>
                                        <div style={{ fontSize: 11, color: '#8a94b8', marginTop: 4 }}>
                                            {card.is_spell ? '스펠' : card.role}
                                        </div>

                                        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                                            <button className="ghost-btn" onClick={() => removeCard(card.id)} disabled={qty === 0}>
                                                -
                                            </button>
                                            <div style={{ minWidth: 28, textAlign: 'center', alignSelf: 'center', fontWeight: 800 }}>
                                                {qty}
                                            </div>
                                            <button className="ghost-btn" onClick={() => addCard(card.id)} disabled={totalCount >= deckSize}>
                                                +
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    <section className="deck-panel">
                        <div className="panel-title">
                            내 덱 <span>{totalCount}/{deckSize}</span>
                        </div>

                        <div className="deck-slots">
                            {selectedCards.length === 0 && (
                                <div className="deck-slot empty">아직 카드가 없어</div>
                            )}

                            {selectedCards.map((card) => (
                                <div key={card.id} className="deck-slot">
                                    <div className="deck-slot-image">
                                        <img
                                            src={`/heroes/${getImageName(card)}.png`}
                                            alt={card.name}
                                            onError={(e) => {
                                                (e.currentTarget as HTMLImageElement).src = '/heroes/_unknown.png';
                                            }}
                                        />
                                    </div>

                                    <div className="deck-slot-name">
                                        {card.name}
                                        <div style={{ fontSize: 12, color: '#8a94b8', marginTop: 4 }}>
                                            수량 {card.quantity}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button className="ghost-btn" onClick={() => removeCard(card.id)}>-</button>
                                        <button className="ghost-btn" onClick={() => addCard(card.id)} disabled={totalCount >= deckSize}>+</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default DeckBuilderPage;