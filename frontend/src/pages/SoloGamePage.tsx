import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FieldCard, FieldState, HandCard, Role } from '../types/game';
import { getApiBase } from '../api/ws';
import FieldSection from '../components/FieldSection';
import HandCardComp from '../components/HandCardComp';
import './SoloGamePage.css';

type Side = 'top' | 'bottom';
type SoloPhase = 'mulligan' | 'placement' | 'action' | 'game_over';

type CardTemplate = {
    id: number;
    hero_key: string;
    name: string;
    role: Role;
    hp?: number;
    cost?: number;
    base_attack?: number;
    base_defense?: number;
    base_attack_range?: number;
    skill_damages?: Record<string, any>;
    skill_meta?: Record<string, { name: string; cooldown?: number }>;
    description?: string;
    is_spell?: boolean;
};

type SoloPlayerState = {
    side: Side;
    drawPile: HandCard[];
    hand: HandCard[];
    field: FieldState;
    trash: HandCard[];
    placementUsed: number;
    mulliganDone: boolean;
};

const INITIAL_DRAW = 10;

function shuffle<T>(list: T[]): T[] {
    const arr = [...list];
    for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function drawCards(state: SoloPlayerState, amount: number): SoloPlayerState {
    if (amount <= 0 || state.drawPile.length === 0) return state;
    const drawAmount = Math.min(amount, state.drawPile.length);
    const drawn = state.drawPile.slice(0, drawAmount);
    return {
        ...state,
        drawPile: state.drawPile.slice(drawAmount),
        hand: [...state.hand, ...drawn],
    };
}

function toFieldCard(card: HandCard, side: Side): FieldCard {
    return {
        uid: `${side}-${card.hero_key}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        template_id: card.id,
        hero_key: card.hero_key,
        name: card.name,
        role: card.role,
        description: card.description,
        max_hp: card.hp,
        current_hp: card.hp,
        attack: card.base_attack,
        defense: card.base_defense,
        attack_range: card.base_attack_range,
        zone: 'main',
        statuses: [],
        skill_cooldowns: {},
        skill_damages: card.skill_damages || {},
        skill_meta: card.skill_meta || {},
        placed_this_turn: true,
        acted_this_turn: false,
        extra: {},
    };
}

function canPlaceToZone(field: FieldState, role: Role, zone: 'main' | 'side') {
    if (zone === 'main') {
        if (role === 'tank') return field.main.filter((c) => c.role === 'tank').length < 1;
        if (role === 'dealer') return field.main.filter((c) => c.role === 'dealer').length < 2;
        if (role === 'healer') return field.main.filter((c) => c.role === 'healer').length < 2;
        return false;
    }

    return !field.side.some((c) => c.role === role);
}

const SoloGamePage: React.FC = () => {
    const navigate = useNavigate();
    const apiBase = getApiBase();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [players, setPlayers] = useState<Record<Side, SoloPlayerState> | null>(null);
    const [activeSide, setActiveSide] = useState<Side>('bottom');
    const [phase, setPhase] = useState<SoloPhase>('mulligan');
    const [selectedHandIdx, setSelectedHandIdx] = useState<number | null>(null);
    const [selectedFieldUid, setSelectedFieldUid] = useState<string | null>(null);
    const [selectedMulligan, setSelectedMulligan] = useState<number[]>([]);

    const enemySide: Side = activeSide === 'bottom' ? 'top' : 'bottom';
    const activePlayer = players?.[activeSide] || null;
    const enemyPlayer = players?.[enemySide] || null;

    const selectedHandCard = useMemo(() => {
        if (!activePlayer || selectedHandIdx === null) return null;
        return activePlayer.hand[selectedHandIdx] || null;
    }, [activePlayer, selectedHandIdx]);

    useEffect(() => {
        const run = async () => {
            try {
                const playerIdRaw = sessionStorage.getItem('player_id');
                if (!playerIdRaw) {
                    setError('로그인이 필요합니다.');
                    setLoading(false);
                    return;
                }

                const [cardsRes, decksRes] = await Promise.all([
                    fetch(`${apiBase}/cards/`),
                    fetch(`${apiBase}/decks/player/${Number(playerIdRaw)}`),
                ]);

                if (!cardsRes.ok || !decksRes.ok) {
                    throw new Error('카드/덱 정보를 불러오지 못했습니다.');
                }

                const templates = (await cardsRes.json()) as CardTemplate[];
                const decks = (await decksRes.json()) as Array<{ id: number; cards: Array<{ card_template_id: number; quantity: number }> }>;
                if (!decks.length) throw new Error('덱이 없습니다. 덱 빌더에서 덱을 구성해 주세요.');

                const byId = new Map<number, CardTemplate>(templates.map((c) => [c.id, c]));
                const deck = decks[0];

                const baseDeck: HandCard[] = [];
                deck.cards.forEach((entry) => {
                    const t = byId.get(entry.card_template_id);
                    if (!t) return;
                    for (let i = 0; i < entry.quantity; i += 1) {
                        baseDeck.push({
                            id: t.id,
                            hero_key: t.hero_key,
                            name: t.name,
                            role: t.role,
                            hp: t.hp || 1,
                            cost: t.cost || 1,
                            base_attack: t.base_attack || 0,
                            base_defense: t.base_defense || 0,
                            base_attack_range: t.base_attack_range || 1,
                            skill_damages: t.skill_damages || {},
                            skill_meta: t.skill_meta || {},
                            description: t.description || '',
                            is_spell: t.is_spell,
                        });
                    }
                });

                const make = (side: Side): SoloPlayerState => ({
                    side,
                    drawPile: shuffle(baseDeck),
                    hand: [],
                    field: { main: [], side: [] },
                    trash: [],
                    placementUsed: 0,
                    mulliganDone: false,
                });

                const top = drawCards(make('top'), INITIAL_DRAW);
                const bottom = drawCards(make('bottom'), INITIAL_DRAW);

                setPlayers({ top, bottom });
                setPhase('mulligan');
                setActiveSide('bottom');
            } catch (e: any) {
                setError(e.message || '초기화 실패');
            } finally {
                setLoading(false);
            }
        };

        run();
    }, [apiBase]);

    const confirmMulligan = useCallback(() => {
        if (!players || !activePlayer || phase !== 'mulligan') return;

        setPlayers((prev) => {
            if (!prev) return prev;
            const cur = prev[activeSide];
            const selectedSet = new Set(selectedMulligan);
            const keep = cur.hand.filter((_, idx) => !selectedSet.has(idx));
            const back = cur.hand.filter((_, idx) => selectedSet.has(idx));
            const shuffled = shuffle([...cur.drawPile, ...back]);
            const redrawn = shuffled.slice(0, back.length);
            const next: SoloPlayerState = {
                ...cur,
                hand: [...keep, ...redrawn],
                drawPile: shuffled.slice(back.length),
                mulliganDone: true,
            };

            return { ...prev, [activeSide]: next };
        });

        setSelectedMulligan([]);
        setSelectedHandIdx(null);
        setSelectedFieldUid(null);

        const nextSide: Side = activeSide === 'bottom' ? 'top' : 'bottom';
        if (!players[nextSide].mulliganDone) {
            setActiveSide(nextSide);
            return;
        }

        setPhase('placement');
        setActiveSide('bottom');
    }, [players, activePlayer, activeSide, selectedMulligan, phase]);

    useEffect(() => {
        if (!players || phase !== 'mulligan') return;
        if (players.top.mulliganDone && players.bottom.mulliganDone) {
            setPhase('placement');
            setActiveSide('bottom');
        }
    }, [players, phase]);

    const placeCard = useCallback((zone: 'main' | 'side') => {
        if (!players || !activePlayer || phase !== 'placement' || selectedHandIdx === null) return;
        const card = activePlayer.hand[selectedHandIdx];
        if (!card || card.is_spell) return;

        if (!canPlaceToZone(activePlayer.field, card.role, zone)) {
            alert('해당 위치에는 배치할 수 없습니다.');
            return;
        }

        if (activePlayer.placementUsed >= 2) {
            alert('턴당 배치는 2장까지 가능합니다.');
            return;
        }

        const nextFieldCard = { ...toFieldCard(card, activeSide), zone };

        setPlayers((prev) => {
            if (!prev) return prev;
            const cur = prev[activeSide];
            const nextField: FieldState = {
                main: zone === 'main' ? [...cur.field.main, nextFieldCard] : cur.field.main,
                side: zone === 'side' ? [...cur.field.side, nextFieldCard] : cur.field.side,
            };
            return {
                ...prev,
                [activeSide]: {
                    ...cur,
                    hand: cur.hand.filter((_, idx) => idx !== selectedHandIdx),
                    field: nextField,
                    placementUsed: cur.placementUsed + 1,
                },
            };
        });

        setSelectedHandIdx(null);
    }, [players, activePlayer, phase, selectedHandIdx, activeSide]);

    const endPlacement = useCallback(() => {
        if (phase !== 'placement') return;
        setPhase('action');
        setSelectedHandIdx(null);
    }, [phase]);

    const useSimpleSkill = useCallback(() => {
        if (!players || !activePlayer || !enemyPlayer || phase !== 'action' || !selectedFieldUid) return;

        const source = [...activePlayer.field.main, ...activePlayer.field.side].find((c) => c.uid === selectedFieldUid);
        if (!source || source.acted_this_turn) return;

        const targets = [...enemyPlayer.field.main, ...enemyPlayer.field.side];
        if (!targets.length) {
            alert('대상이 없습니다.');
            return;
        }

        const target = targets[0];
        const damage = Math.max(1, source.attack || 1);

        setPlayers((prev) => {
            if (!prev) return prev;

            const markActed = (field: FieldState): FieldState => ({
                main: field.main.map((c) => (c.uid === source.uid ? { ...c, acted_this_turn: true } : c)),
                side: field.side.map((c) => (c.uid === source.uid ? { ...c, acted_this_turn: true } : c)),
            });

            const hit = (field: FieldState): FieldState => {
                const apply = (c: FieldCard) => (c.uid === target.uid ? { ...c, current_hp: c.current_hp - damage } : c);
                return {
                    main: field.main.map(apply).filter((c) => c.current_hp > 0),
                    side: field.side.map(apply).filter((c) => c.current_hp > 0),
                };
            };

            return {
                ...prev,
                [activeSide]: { ...prev[activeSide], field: markActed(prev[activeSide].field) },
                [enemySide]: { ...prev[enemySide], field: hit(prev[enemySide].field) },
            };
        });
    }, [players, activePlayer, enemyPlayer, phase, selectedFieldUid, activeSide, enemySide]);

    const endTurn = useCallback(() => {
        if (!players || phase === 'mulligan' || phase === 'game_over') return;
        const nextSide: Side = activeSide === 'bottom' ? 'top' : 'bottom';

        setPlayers((prev) => {
            if (!prev) return prev;
            const resetField = (field: FieldState): FieldState => ({
                main: field.main.map((c) => ({ ...c, acted_this_turn: false, placed_this_turn: false })),
                side: field.side.map((c) => ({ ...c, acted_this_turn: false, placed_this_turn: false })),
            });

            const next = { ...prev };
            next[nextSide] = drawCards({
                ...next[nextSide],
                placementUsed: 0,
                field: resetField(next[nextSide].field),
            }, 1);
            return next;
        });

        setActiveSide(nextSide);
        setPhase('placement');
        setSelectedFieldUid(null);
        setSelectedHandIdx(null);
    }, [players, phase, activeSide]);

    if (loading) return <div className="solo-page solo-center">솔로 모드 준비 중...</div>;
    if (error || !players || !activePlayer) {
        return (
            <div className="solo-page solo-center">
                <div>{error || '초기화 실패'}</div>
                <button type="button" className="solo-btn" onClick={() => navigate('/')}>로비로</button>
            </div>
        );
    }

    const canActTop = phase === 'action' && activeSide === 'top'
        ? [...players.top.field.main, ...players.top.field.side].filter((c) => !c.acted_this_turn).map((c) => c.uid)
        : [];

    const canActBottom = phase === 'action' && activeSide === 'bottom'
        ? [...players.bottom.field.main, ...players.bottom.field.side].filter((c) => !c.acted_this_turn).map((c) => c.uid)
        : [];

    const phaseText = phase === 'mulligan'
        ? '멀리건'
        : phase === 'placement'
            ? '배치'
            : phase === 'action'
                ? '행동'
                : '종료';

    return (
        <div className="solo-page">
            <header className="solo-topbar">
                <button type="button" className="solo-btn" onClick={() => navigate('/')}>로비</button>
                <div className="solo-status">
                    <b>솔로 모드</b>
                    <span>현재 턴: {activeSide === 'top' ? '위쪽 플레이어' : '아래쪽 플레이어'}</span>
                    <span>페이즈: {phaseText}</span>
                </div>
                <button type="button" className="solo-btn" onClick={endTurn} disabled={phase === 'mulligan' || phase === 'game_over'}>턴 종료</button>
            </header>

            <section className="solo-board">
                <div className={`solo-player-panel ${activeSide === 'top' ? 'active' : ''}`}>
                    <div className="solo-player-head">
                        <strong>위쪽 플레이어</strong>
                        <span>덱 {players.top.drawPile.length} / 패 {players.top.hand.length}</span>
                    </div>
                    <FieldSection
                        field={players.top.field}
                        isOpponent={true}
                        allowOpponentPlacement={activeSide === 'top'}
                        isMyTurn={activeSide === 'top'}
                        phase={phase}
                        selectedUid={selectedFieldUid}
                        canActUids={canActTop}
                        onCardClick={(card) => setSelectedFieldUid(card.uid)}
                        placingCard={phase === 'placement' ? selectedHandCard : null}
                        onPlaceClick={placeCard}
                    />
                </div>

                <div className="solo-divider">VS</div>

                <div className={`solo-player-panel ${activeSide === 'bottom' ? 'active' : ''}`}>
                    <div className="solo-player-head">
                        <strong>아래쪽 플레이어</strong>
                        <span>덱 {players.bottom.drawPile.length} / 패 {players.bottom.hand.length}</span>
                    </div>
                    <FieldSection
                        field={players.bottom.field}
                        isOpponent={false}
                        isMyTurn={activeSide === 'bottom'}
                        phase={phase}
                        selectedUid={selectedFieldUid}
                        canActUids={canActBottom}
                        onCardClick={(card) => setSelectedFieldUid(card.uid)}
                        placingCard={phase === 'placement' ? selectedHandCard : null}
                        onPlaceClick={placeCard}
                    />
                </div>
            </section>

            <section className="solo-hand-wrap">
                <div className="solo-hand-header">
                    <span>{activeSide === 'top' ? '위쪽 플레이어 패' : '아래쪽 플레이어 패'}</span>
                    <div className="solo-hand-actions">
                        {phase === 'mulligan' ? (
                            <button type="button" className="solo-btn" onClick={confirmMulligan}>멀리건 확정</button>
                        ) : (
                            <>
                                <button type="button" className="solo-btn" onClick={endPlacement} disabled={phase !== 'placement'}>배치 종료</button>
                                <button type="button" className="solo-btn" onClick={useSimpleSkill} disabled={phase !== 'action' || !selectedFieldUid}>선택 카드 스킬 사용</button>
                            </>
                        )}
                    </div>
                </div>

                <div className="solo-hand-row">
                    {activePlayer.hand.map((card, idx) => {
                        const selected = phase === 'mulligan'
                            ? selectedMulligan.includes(idx)
                            : selectedHandIdx === idx;

                        return (
                            <HandCardComp
                                key={`${card.id}-${idx}`}
                                card={card}
                                selected={selected}
                                onClick={() => {
                                    if (phase === 'mulligan') {
                                        setSelectedMulligan((prev) => (prev.includes(idx) ? prev.filter((v) => v !== idx) : [...prev, idx]));
                                        return;
                                    }
                                    setSelectedHandIdx((prev) => (prev === idx ? null : idx));
                                }}
                            />
                        );
                    })}
                </div>
            </section>
        </div>
    );
};

export default SoloGamePage;