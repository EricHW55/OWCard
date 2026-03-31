import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CardDetail from '../components/CardDetail';
import { getApiBase } from '../api/ws';
import { getCardImageSrc } from '../utils/heroImage';
import './DeckBuilderPage.css';

interface CardTemplate {
    id: number;
    name: string;
    role: string;
    hp?: number;
    cost?: number;
    is_spell?: boolean;
    hero_key?: string;
    description?: string;
    base_attack?: number;
    base_attack_range?: number;
    skill_meta?: Record<string, { name?: string; cooldown?: number; description?: string }>;
    skill_damages?: Record<string, any>;
    quantity?: number;
}
interface DeckEntry { card_template_id: number; quantity: number; }
interface DeckInfo { id: number; player_id: number; name: string; cards: DeckEntry[]; }

const ROLE_COLOR: Record<string, string> = {
    tank: '#22cc88',
    dealer: '#ff4466',
    healer: '#44aaff',
    spell: '#ffaa22',
};

const LONG_PRESS_MS = 450;

function fallbackImage(card: CardTemplate) {
    return card.is_spell ? '/skills/_unknown.png' : '/heroes/_unknown.png';
}

const DeckBuilderPage: React.FC = () => {
    const navigate = useNavigate();
    const apiBase = getApiBase();
    const [playerId, setPlayerId] = useState(0);
    const [deckSize, setDeckSize] = useState(20);
    const [cards, setCards] = useState<CardTemplate[]>([]);
    const [myDecks, setMyDecks] = useState<DeckInfo[]>([]);
    const [selectedDeckId, setSelectedDeckId] = useState<number | null>(null);
    const [deckName, setDeckName] = useState('내 덱');
    const [search, setSearch] = useState('');
    const [entries, setEntries] = useState<Record<number, number>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [detailCard, setDetailCard] = useState<CardTemplate | null>(null);

    const longPressTimerRef = useRef<number | null>(null);
    const longPressTriggeredRef = useRef(false);

    const totalCount = useMemo(() => Object.values(entries).reduce((s, q) => s + q, 0), [entries]);

    const filteredCards = useMemo(() => {
        const q = search.trim().toLowerCase();
        return q ? cards.filter(c => `${c.name} ${c.role}`.toLowerCase().includes(q)) : cards;
    }, [cards, search]);

    const selectedCards = useMemo(
        () =>
            cards
                .filter(c => (entries[c.id] ?? 0) > 0)
                .map(c => ({ ...c, quantity: entries[c.id] }))
                .sort((a, b) => a.name.localeCompare(b.name)),
        [cards, entries]
    );

    useEffect(() => {
        return () => {
            if (longPressTimerRef.current !== null) {
                window.clearTimeout(longPressTimerRef.current);
            }
        };
    }, []);

    const clearLongPressTimer = () => {
        if (longPressTimerRef.current !== null) {
            window.clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    };

    const startLongPress = (card: CardTemplate) => {
        clearLongPressTimer();
        longPressTriggeredRef.current = false;
        longPressTimerRef.current = window.setTimeout(() => {
            longPressTriggeredRef.current = true;
            setDetailCard(card);
        }, LONG_PRESS_MS);
    };

    const endLongPress = () => {
        clearLongPressTimer();
    };

    const runTapAction = (action: () => void) => {
        if (longPressTriggeredRef.current) {
            longPressTriggeredRef.current = false;
            return;
        }
        action();
    };

    const getLongPressHandlers = (card: CardTemplate, onTap: () => void) => ({
        onMouseDown: () => startLongPress(card),
        onMouseUp: endLongPress,
        onMouseLeave: endLongPress,
        onTouchStart: () => startLongPress(card),
        onTouchEnd: endLongPress,
        onTouchCancel: endLongPress,
        onContextMenu: (e: any) => e.preventDefault(),
        onClick: () => runTapAction(onTap),
    });

    const selectDeck = (deck: DeckInfo) => {
        setSelectedDeckId(deck.id);
        setDeckName(deck.name);
        const next: Record<number, number> = {};
        for (const c of deck.cards) next[c.card_template_id] = c.quantity;
        setEntries(next);
    };

    const loadAll = async (pid: number) => {
        const [cfgRes, cardsRes, decksRes] = await Promise.all([
            fetch(`${apiBase}/public/game-config`),
            fetch(`${apiBase}/cards/`),
            fetch(`${apiBase}/decks/player/${pid}`),
        ]);
        if (!cfgRes.ok || !cardsRes.ok || !decksRes.ok) throw new Error('데이터 로드 실패');
        const cfg = await cfgRes.json();
        const cardList = await cardsRes.json();
        const deckList = await decksRes.json();
        setDeckSize(cfg.deck_size ?? 20);
        setCards(Array.isArray(cardList) ? cardList : []);
        setMyDecks(Array.isArray(deckList) ? deckList : []);
        if (Array.isArray(deckList) && deckList.length > 0) selectDeck(deckList[0]);
        else {
            setSelectedDeckId(null);
            setDeckName('내 덱');
            setEntries({});
        }
    };

    useEffect(() => {
        const raw = sessionStorage.getItem('player_id');
        if (!raw) {
            alert('로그인 필요');
            navigate('/');
            return;
        }
        const pid = Number(raw);
        setPlayerId(pid);
        setLoading(true);
        loadAll(pid).catch(e => alert(e.message)).finally(() => setLoading(false));
    }, [navigate]);

    const addCard = (id: number) => {
        if (totalCount >= deckSize) return;
        setEntries(p => ({ ...p, [id]: (p[id] ?? 0) + 1 }));
    };

    const removeCard = (id: number) => {
        setEntries(p => {
            const n = { ...p };
            const c = n[id] ?? 0;
            if (c <= 1) delete n[id];
            else n[id] = c - 1;
            return n;
        });
    };

    const clearDeck = () => setEntries({});

    const saveDeck = async () => {
        if (!playerId) return;
        if (totalCount !== deckSize) {
            alert(`${deckSize}장 필요 (현재 ${totalCount}장)`);
            return;
        }
        setSaving(true);
        try {
            const payloadCards = Object.entries(entries).map(([id, qty]) => ({
                card_template_id: Number(id),
                quantity: qty,
            }));

            let deckId = selectedDeckId;
            if (deckId) {
                const res = await fetch(`${apiBase}/decks/${deckId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: deckName, cards: payloadCards }),
                });
                if (!res.ok) throw new Error('덱 수정 실패');
            } else {
                const res = await fetch(`${apiBase}/decks/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ player_id: playerId, name: deckName, cards: payloadCards }),
                });
                if (!res.ok) throw new Error('덱 생성 실패');
                const created = await res.json();
                deckId = created.id;
                setSelectedDeckId(deckId);
            }

            const selRes = await fetch(`${apiBase}/decks/${deckId}/select`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ player_id: playerId }),
            });
            if (!selRes.ok) throw new Error('덱 선택 실패');

            await loadAll(playerId);
            alert('덱 저장 완료!');
        } catch (e: any) {
            alert(e.message);
        } finally {
            setSaving(false);
        }
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
        <>
            <div className="deck-builder-page">
                <div className="deck-builder-shell">
                    <div className="deck-builder-header">
                        <div>
                            <div className="deck-builder-title-row">
                                <h1>덱 구성</h1>
                                <div className="deck-builder-tip">탭하면 카드 추가 · 꾹 누르면 세부 정보</div>
                            </div>
                            <p>덱 크기: {deckSize}장</p>
                        </div>
                        <div className="deck-builder-actions">
                            <button className="ghost-btn" onClick={() => navigate('/')}>로비로</button>
                            <button
                                className="ghost-btn"
                                onClick={() => {
                                    setSelectedDeckId(null);
                                    setDeckName(`새 덱 ${myDecks.length + 1}`);
                                    setEntries({});
                                }}
                            >
                                새 덱
                            </button>
                            <button className="ghost-btn" onClick={clearDeck}>초기화</button>
                            <button className="primary-btn" onClick={saveDeck} disabled={saving}>
                                {saving ? '저장 중...' : '저장'}
                            </button>
                        </div>
                    </div>

                    <div className="deck-builder-topbar">
                        <input className="deck-input" value={deckName} onChange={e => setDeckName(e.target.value)} placeholder="덱 이름" />
                        <input className="deck-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="카드 검색" />
                    </div>
                    <div className="deck-builder-topbar">
                        <select
                            className="deck-input"
                            value={selectedDeckId ?? ''}
                            onChange={e => {
                                const f = myDecks.find(d => d.id === Number(e.target.value));
                                if (f) selectDeck(f);
                            }}
                        >
                            <option value="">새 덱 만들기</option>
                            {myDecks.map(d => (
                                <option key={d.id} value={d.id}>
                                    {d.name} (ID:{d.id})
                                </option>
                            ))}
                        </select>
                        <div className="deck-input" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span>현재 장수</span>
                            <b style={{ color: totalCount === deckSize ? '#22dd77' : totalCount > deckSize ? '#ff3355' : '#ff9b30' }}>
                                {totalCount} / {deckSize}
                            </b>
                        </div>
                    </div>

                    <div className="deck-builder-grid">
                        <section className="deck-panel">
                            <div className="panel-title">
                                <span>카드 목록</span>
                                <span style={{ fontSize: 11, color: '#8a94b8', fontWeight: 700 }}>길게 눌러 상세</span>
                            </div>
                            <div className="scroll-area card-list-scroll">
                                <div className="hero-grid">
                                    {filteredCards.map(card => {
                                        const qty = entries[card.id] ?? 0;
                                        const roleColor = card.is_spell ? '#ffaa22' : ROLE_COLOR[card.role] || '#888';
                                        return (
                                            <div key={card.id} className="hero-tile" style={{ borderColor: qty > 0 ? roleColor : undefined }}>
                                                <button
                                                    type="button"
                                                    className="hero-tile-preview"
                                                    aria-label={`${card.name} 카드 상세 보기 또는 추가`}
                                                    {...getLongPressHandlers(card, () => addCard(card.id))}
                                                >
                                                    <div className="hero-tile-image">
                                                        <img
                                                            src={getCardImageSrc(card as any)}
                                                            alt={card.name}
                                                            onError={e => {
                                                                (e.target as HTMLImageElement).src = fallbackImage(card);
                                                            }}
                                                        />
                                                    </div>
                                                    <div className="hero-tile-name">{card.name}</div>
                                                    <div className="hero-tile-role" style={{ color: roleColor }}>
                                                        {card.is_spell ? '스킬' : card.role}
                                                    </div>
                                                </button>
                                                <div className="hero-tile-controls">
                                                    <button className="ghost-btn" onClick={() => removeCard(card.id)} disabled={qty === 0}>-</button>
                                                    <span className="qty">{qty}</span>
                                                    <button className="ghost-btn" onClick={() => addCard(card.id)} disabled={totalCount >= deckSize}>+</button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </section>

                        <section className="deck-panel">
                            <div className="panel-title">
                                내 덱 <span>{totalCount}/{deckSize}</span>
                            </div>
                            <div className="scroll-area deck-list-scroll">
                                {selectedCards.length === 0 ? (
                                    <div style={{ textAlign: 'center', color: '#5a6488', padding: 20 }}>카드를 추가하세요</div>
                                ) : (
                                    <div className="deck-icon-grid">
                                        {selectedCards.map(card => {
                                            const roleColor = card.is_spell ? '#ffaa22' : ROLE_COLOR[card.role] || '#888';
                                            return (
                                                <div key={card.id} className="deck-icon-item" style={{ borderColor: roleColor + '66' }}>
                                                    {card.quantity && card.quantity > 1 && <div className="deck-icon-qty">{card.quantity}</div>}
                                                    <button
                                                        type="button"
                                                        className="deck-icon-preview"
                                                        aria-label={`${card.name} 카드 상세 보기`}
                                                        {...getLongPressHandlers(card, () => {})}
                                                    >
                                                        <div className="deck-icon-img">
                                                            <img
                                                                src={getCardImageSrc(card as any)}
                                                                alt={card.name}
                                                                onError={e => {
                                                                    (e.target as HTMLImageElement).src = fallbackImage(card as CardTemplate);
                                                                }}
                                                            />
                                                        </div>
                                                        <div className="deck-icon-name">{card.name}</div>
                                                    </button>
                                                    <div className="deck-icon-controls">
                                                        <button className="ghost-btn" onClick={() => removeCard(card.id)}>-</button>
                                                        <button className="ghost-btn" onClick={() => addCard(card.id)} disabled={totalCount >= deckSize}>+</button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>
                </div>
            </div>

            <CardDetail card={detailCard as any} onClose={() => setDetailCard(null)} />
        </>
    );
};

export default DeckBuilderPage;
