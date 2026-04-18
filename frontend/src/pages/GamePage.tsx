import React from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import GameScreen from '../components/GameScreen';
import OnlineContextPanel from '../components/OnlineContextPanel';
import { CardFaceContent } from '../components/CardFaceContent';
import useOnlineGameController from '../controllers/useOnlineGameController';
import { useCardImage } from '../hooks/useCardImage';
import { ROLE_COLOR } from '../types/constants';
import { BTN_SM, phaseLabel } from '../utils/ui';
import { getApiBase } from '../api/ws';
import { getCardArtCandidates, getCardBackImageSrc, getCardImageSrc, preloadImageAssets } from '../utils/heroImage';
import './GamePage.css';
import '../styles/animations/index.css';

type CoinFace = 'front' | 'back';
type CoinTossStage = 'hidden' | 'spinning' | 'result' | 'clearing' | 'done';
type OpeningStage = 'idle' | 'draw_back' | 'reveal_front' | 'done';
type Bo3EditorCard = {
  id: number;
  name: string;
  role: string;
  is_spell?: boolean;
  hero_key?: string;
};

function formatTimerClock(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

const GamePage: React.FC = () => {
  const { gameId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isSpectator = searchParams.get('spectate') === '1';
  const vm = useOnlineGameController(gameId, { spectate: isSpectator });
  const apiBase = getApiBase();
  const session = vm.session;
  const [coinTossStage, setCoinTossStage] = React.useState<CoinTossStage>('hidden');
  const [coinRotationDeg, setCoinRotationDeg] = React.useState(0);
  const hasShownCoinTossRef = React.useRef(false);
  const spinTimerRef = React.useRef<number | null>(null);
  const doneTimerRef = React.useRef<number | null>(null);
  const clearTimerRef = React.useRef<number | null>(null);
  const openingStartedRef = React.useRef(false);
  const revealExitTimerRef = React.useRef<number | null>(null);
  const [handSize, setHandSize] = React.useState(7);
  const [openingStage, setOpeningStage] = React.useState<OpeningStage>('idle');
  const [revealedCount, setRevealedCount] = React.useState(0);
  const [revealIndex, setRevealIndex] = React.useState(0);
  const [revealExiting, setRevealExiting] = React.useState(false);
  const [revealTilt, setRevealTilt] = React.useState({ x: 0, y: 0 });
  const [openingCardCount, setOpeningCardCount] = React.useState(handSize);
  const [timerAnchorMs, setTimerAnchorMs] = React.useState(() => Date.now());
  const [timerTickMs, setTimerTickMs] = React.useState(() => Date.now());
  const [headshotStage, setHeadshotStage] = React.useState<CoinTossStage>('hidden');
  const [headshotRotationDeg, setHeadshotRotationDeg] = React.useState<[number, number]>([0, 0]);
  const [activeHeadshotEventId, setActiveHeadshotEventId] = React.useState<number | null>(null);
  const headshotSpinTimerRef = React.useRef<number | null>(null);
  const headshotClearTimerRef = React.useRef<number | null>(null);
  const headshotDoneTimerRef = React.useRef<number | null>(null);
  const [showBo3DeckEditor, setShowBo3DeckEditor] = React.useState(false);
  const [bo3EditorLoading, setBo3EditorLoading] = React.useState(false);
  const [bo3EditorCards, setBo3EditorCards] = React.useState<Bo3EditorCard[]>([]);
  const [bo3EditorEntries, setBo3EditorEntries] = React.useState<Record<number, number>>({});
  const [bo3EditorBaseDeck, setBo3EditorBaseDeck] = React.useState<number[]>([]);
  const [bo3EditorDeckSize, setBo3EditorDeckSize] = React.useState(20);
  const [bo3EditorSearch, setBo3EditorSearch] = React.useState('');

  const isFirstPlayer = React.useMemo(() => {
    if (isSpectator) return null;
    if (!vm.gs || !session || vm.gs.first_player == null) return null;
    return Number(vm.gs.first_player) === Number(session.player_id);
  }, [vm.gs, session, isSpectator]);

  const coinFace: CoinFace = React.useMemo(() => {
    if (isFirstPlayer == null) return 'front';
    return isFirstPlayer ? 'front' : 'back';
  }, [isFirstPlayer]);

  React.useEffect(() => {
    if (!vm.gs || !session || hasShownCoinTossRef.current) return;
    if (vm.gs.first_player == null) return;
    hasShownCoinTossRef.current = true;
    setCoinTossStage('spinning');
    setCoinRotationDeg(0);

    void preloadImageAssets([getCardBackImageSrc(), '/illustration/card_back.png'], 1200);

    const allCards = [
      ...(vm.gs.my_state?.hand || []),
      ...(vm.gs.my_state?.field?.main || []),
      ...(vm.gs.my_state?.field?.side || []),
      ...(vm.gs.opponent_state?.field?.main || []),
      ...(vm.gs.opponent_state?.field?.side || []),
    ];
    const stage2Sources = Array.from(new Set([
      ...allCards.flatMap((card) => getCardArtCandidates(card as any)),
      ...allCards.flatMap((card) => getCardImageSrc(card as any)),
    ]));
    window.setTimeout(() => {
      void preloadImageAssets(stage2Sources, 3200);
    }, 120);

    const spinCount = 10;
    const finalRotation = spinCount * 360 + (coinFace === 'front' ? 0 : 180);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setCoinRotationDeg(finalRotation);
      });
    });

    spinTimerRef.current = window.setTimeout(() => {
      setCoinTossStage('result');
    }, 2000);
    clearTimerRef.current = window.setTimeout(() => {
      setCoinTossStage('clearing');
    }, 4000);
    doneTimerRef.current = window.setTimeout(() => {
      setCoinTossStage('done');
    }, 4500);
  }, [vm.gs, session, coinFace]);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`${apiBase}/public/game-config`);
        if (!res.ok) return;
        const cfg = await res.json();
        const size = Number(cfg?.hand_size);
        if (mounted && Number.isFinite(size) && size > 0) setHandSize(size);
      } catch (_) {}
    })();
    return () => {
      mounted = false;
    };
  }, [apiBase]);

  React.useEffect(() => {
    if (!vm.gs || !vm.my) return;
    if (openingStartedRef.current) return;
    if (coinTossStage !== 'done') return;
    if (vm.phase !== 'mulligan') return;
    if (vm.my.hand.length === 0) return;
    const startCardCount = Math.max(handSize, vm.my.hand.length);
    openingStartedRef.current = true;
    setOpeningCardCount(startCardCount);
    setOpeningStage('draw_back');
    const timer = window.setTimeout(() => {
      setOpeningStage('reveal_front');
      setRevealedCount(0);
      setRevealIndex(0);
    }, startCardCount * 230 + 500);
    return () => window.clearTimeout(timer);
  }, [vm.gs, vm.my, vm.phase, handSize, coinTossStage]);

  React.useEffect(() => {
    setRevealTilt({ x: 0, y: 0 });
  }, [revealIndex, vm.my?.hand?.[revealIndex]?.id, vm.my?.hand?.[revealIndex]?.hero_key]);

  React.useEffect(() => {
    return () => {
      if (spinTimerRef.current !== null) window.clearTimeout(spinTimerRef.current);
      if (clearTimerRef.current !== null) window.clearTimeout(clearTimerRef.current);
      if (doneTimerRef.current !== null) window.clearTimeout(doneTimerRef.current);
      if (revealExitTimerRef.current !== null) window.clearTimeout(revealExitTimerRef.current);
      if (headshotSpinTimerRef.current !== null) window.clearTimeout(headshotSpinTimerRef.current);
      if (headshotClearTimerRef.current !== null) window.clearTimeout(headshotClearTimerRef.current);
      if (headshotDoneTimerRef.current !== null) window.clearTimeout(headshotDoneTimerRef.current);
    };
  }, []);

  React.useEffect(() => {
    const evt = vm.headshotCoinTossEvent;
    if (!evt || activeHeadshotEventId === evt.id) return;
    setActiveHeadshotEventId(evt.id);
    setHeadshotStage('spinning');
    setHeadshotRotationDeg([0, 0]);

    const toDeg = (face: CoinFace) => (face === 'front' ? 0 : 180);
    const spinA = (8 + Math.floor(Math.random() * 4)) * 360 + toDeg(evt.faces[0]);
    const spinB = (8 + Math.floor(Math.random() * 4)) * 360 + toDeg(evt.faces[1]);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setHeadshotRotationDeg([spinA, spinB]);
      });
    });

    headshotSpinTimerRef.current = window.setTimeout(() => setHeadshotStage('result'), 2000);
    headshotClearTimerRef.current = window.setTimeout(() => setHeadshotStage('clearing'), 3300);
    headshotDoneTimerRef.current = window.setTimeout(() => setHeadshotStage('done'), 3700);
  }, [vm.headshotCoinTossEvent, activeHeadshotEventId]);

  React.useEffect(() => {
    if (headshotStage !== 'done') return;
    vm.completeHeadshotCoinToss();
    setHeadshotStage('hidden');
  }, [headshotStage, vm]);

  React.useEffect(() => {
    const id = window.setInterval(() => setTimerTickMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  React.useEffect(() => {
    setTimerAnchorMs(Date.now());
    setTimerTickMs(Date.now());
  }, [
    vm.gs?.turn,
    vm.isMyTurn,
    vm.gs?.timer?.my_remaining_seconds,
    vm.gs?.timer?.opponent_remaining_seconds,
  ]);

  const handleRevealNext = () => {
    if (openingStage !== 'reveal_front') return;
    if (!vm.my || revealIndex >= openingCardCount || revealExiting) return;
    setRevealExiting(true);
    revealExitTimerRef.current = window.setTimeout(() => {
      setRevealedCount((prev) => Math.min(openingCardCount, prev + 1));
      const nextIndex = revealIndex + 1;
      setRevealExiting(false);
      if (nextIndex >= openingCardCount) {
        setOpeningStage('done');
      } else {
        setRevealIndex(nextIndex);
      }
    }, 260);
  };

  const handleRevealPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const rotateY = (px - 0.5) * 20;
    const rotateX = (0.5 - py) * 20;
    setRevealTilt({ x: rotateX, y: rotateY });
  };

  const resetRevealTilt = () => {
    setRevealTilt({ x: 0, y: 0 });
  };

  const currentRevealCard = vm.my?.hand?.[revealIndex];
  const {
    currentImageSrc: revealImageSrc,
    imgError: revealImgError,
    onError: handleRevealImageError,
    usingFullCardArt: revealUsingFullCardArt,
  } = useCardImage(
      currentRevealCard || {},
      'hand',
      [revealIndex, currentRevealCard?.id, currentRevealCard?.hero_key, currentRevealCard?.name]
  );

  const isGameOver = vm.phase === 'game_over' && !!vm.gs;
  const bo3 = vm.gs?.bo3;
  const isBetweenBo3Rounds = isGameOver && !!bo3?.pending_round_result;
  const isFinalGameOver = isGameOver && !isBetweenBo3Rounds;
  const isWinner = !isSpectator && isGameOver && vm.gs?.winner === session?.player_id;
  const resultTitle = !isGameOver ? '' : isSpectator ? '게임 종료' : isWinner ? '승리!' : '패배';
  const resultSubtitle = !isGameOver
      ? ''
      : isSpectator
          ? '관전 중이던 경기가 종료되었습니다.'
      : isWinner
          ? '상대가 항복했습니다.'
          : '당신이 항복하여 패배했습니다.';

  const handleSurrender = () => {
    if (isSpectator) return;
    if (isFinalGameOver) return;
    const confirmed = window.confirm('정말로 항복하시겠습니까? (BO3에서는 현재 세트만 패배 처리됩니다)');
    if (!confirmed) return;
    vm.surrenderGame();
    // navigate('/');
  };

  const addBo3EditorCard = React.useCallback((cardId: number) => {
    setBo3EditorEntries((prev) => ({ ...prev, [cardId]: (prev[cardId] ?? 0) + 1 }));
  }, []);

  const removeBo3EditorCard = React.useCallback((cardId: number) => {
    setBo3EditorEntries((prev) => {
      const next = { ...prev };
      const current = next[cardId] ?? 0;
      if (current <= 1) delete next[cardId];
      else next[cardId] = current - 1;
      return next;
    });
  }, []);

  const openBo3DeckEditor = React.useCallback(async () => {
    const bo3State = vm.gs?.bo3 as any;
    const currentDeckIdsRaw = bo3State?.current_deck_template_ids
        || bo3State?.current_deck_card_ids
        || bo3State?.deck_template_ids
        || bo3State?.deck_card_ids
        || [];
    const currentDeckIds = Array.isArray(currentDeckIdsRaw)
        ? currentDeckIdsRaw.map((v: any) => Number(v)).filter((v: number) => Number.isFinite(v))
        : [];
    setBo3EditorBaseDeck(currentDeckIds);
    const nextEntries: Record<number, number> = {};
    currentDeckIds.forEach((id) => {
      nextEntries[id] = (nextEntries[id] ?? 0) + 1;
    });
    setBo3EditorEntries(nextEntries);
    setBo3EditorSearch('');
    setBo3EditorLoading(true);
    setShowBo3DeckEditor(true);
    try {
      const [cfgRes, cardsRes] = await Promise.all([
        fetch(`${apiBase}/public/game-config`),
        fetch(`${apiBase}/cards/`),
      ]);
      if (!cfgRes.ok || !cardsRes.ok) throw new Error();
      const cfg = await cfgRes.json();
      const cardList = await cardsRes.json();
      setBo3EditorDeckSize(Number(cfg?.deck_size) > 0 ? Number(cfg.deck_size) : 20);
      setBo3EditorCards(Array.isArray(cardList) ? [...cardList].sort((a, b) => Number(a.id) - Number(b.id)) : []);
    } catch {
      window.alert('BO3 덱 편집 데이터를 불러오지 못했습니다.');
      setShowBo3DeckEditor(false);
    } finally {
      setBo3EditorLoading(false);
    }
  }, [vm.gs, apiBase]);

  const bo3EditorTotalCount = React.useMemo(
      () => Object.values(bo3EditorEntries).reduce((sum, qty) => sum + qty, 0),
      [bo3EditorEntries]
  );
  const bo3EditorSelectedCards = React.useMemo(
      () => bo3EditorCards
          .filter((card) => (bo3EditorEntries[card.id] ?? 0) > 0)
          .map((card) => ({ ...card, quantity: bo3EditorEntries[card.id] ?? 0 }))
          .sort((a, b) => a.id - b.id),
      [bo3EditorCards, bo3EditorEntries]
  );
  const bo3EditorFilteredCards = React.useMemo(() => {
    const q = bo3EditorSearch.trim().toLowerCase();
    if (!q) return bo3EditorCards;
    return bo3EditorCards.filter((card) => `${card.name} ${card.role}`.toLowerCase().includes(q));
  }, [bo3EditorCards, bo3EditorSearch]);
  const bo3EditorChanges = React.useMemo(() => {
    const toCountMap = (ids: number[]) => {
      const countMap: Record<number, number> = {};
      ids.forEach((id) => { countMap[id] = (countMap[id] ?? 0) + 1; });
      return countMap;
    };
    const baseMap = toCountMap(bo3EditorBaseDeck);
    const removed: number[] = [];
    const added: number[] = [];
    const allIds = new Set<number>([
      ...Object.keys(baseMap).map(Number),
      ...Object.keys(bo3EditorEntries).map(Number),
    ]);
    allIds.forEach((id) => {
      const before = baseMap[id] ?? 0;
      const after = bo3EditorEntries[id] ?? 0;
      if (after > before) {
        for (let i = 0; i < after - before; i += 1) added.push(id);
      } else if (before > after) {
        for (let i = 0; i < before - after; i += 1) removed.push(id);
      }
    });
    return { removed, added };
  }, [bo3EditorBaseDeck, bo3EditorEntries]);

  const handleSubmitBo3Deck = () => {
    const ids = Object.entries(bo3EditorEntries).flatMap(([id, qty]) =>
        Array.from({ length: qty }, () => Number(id))
    );
    if (ids.length !== bo3EditorDeckSize) {
      window.alert(`카드 수는 정확히 ${bo3EditorDeckSize}장이어야 합니다.`);
      return;
    }
    const editLimit = Number(bo3?.deck_edit_limit_per_break ?? 5);
    if (bo3EditorChanges.removed.length > editLimit || bo3EditorChanges.added.length > editLimit) {
      window.alert(`이번 휴식 구간에서는 최대 ${editLimit}장까지 수정할 수 있습니다.`);
      return;
    }
    vm.submitBo3Deck(ids);
    setShowBo3DeckEditor(false);
  };

  if (!session && !isSpectator) {
    return (
        <div className="game-loading-screen">
          <div>로그인이 필요합니다.</div>
        </div>
    );
  }
  
  if (!vm.gs || !vm.my || !vm.opp) {
    return (
      <div className="game-loading-screen">
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 900 }}>게임 로딩 중...</div>
          <div style={{ marginTop: 8, color: '#8a94b8' }}>
            game_id: {gameId} / {vm.connected ? '연결됨' : vm.reconnecting ? '재연결 중' : '연결 중'}
          </div>
        </div>
      </div>
    );
  }

  const banners = [
    vm.reconnecting ? (
      <div key="reconnect" className="game-reconnect-banner">네트워크가 잠깐 끊겼습니다. 자동 재연결 중입니다.</div>
    ) : null,
    vm.pendingPassive ? (
      <div key="passive" className="game-passive-banner">패시브 선택 대기 중: {vm.pendingPassive.type === 'mercy_resurrect' ? '메르시 부활' : vm.pendingPassive.type}</div>
    ) : null,
    vm.pendingSpellChoice ? (
      <div key="spell-choice" className="game-passive-banner">스킬 카드 선택 대기 중: {vm.pendingSpellChoice.title || vm.pendingSpellChoice.hero_key || vm.pendingSpellChoice.type}</div>
    ) : null,
  ].filter(Boolean) as React.ReactNode[];

  const openingActive = openingStage !== 'done' && openingStage !== 'idle';
  const showOpeningCinematic = !isSpectator && openingStage !== 'done' && openingStage !== 'idle';
  const visibleHandCards = openingActive
      ? vm.my.hand.slice(0, revealedCount)
      : vm.my.hand;
  const revealCardInHand = vm.my.hand[revealIndex];
  const revealRoleColor = revealCardInHand?.is_spell
      ? '#ffaa22'
      : (ROLE_COLOR[revealCardInHand?.role || ''] || 'rgba(188, 202, 246, 0.64)');
  const timerInfo = vm.gs?.timer;
  const isTurnTimerRunning = vm.phase !== 'mulligan' && vm.phase !== 'waiting' && vm.phase !== 'game_over';
  const timerElapsedSec = isTurnTimerRunning
      ? Math.max(0, Math.floor((timerTickMs - timerAnchorMs) / 1000))
      : 0;
  const baseMySeconds = Number(timerInfo?.my_remaining_seconds ?? 0);
  const baseOppSeconds = Number(timerInfo?.opponent_remaining_seconds ?? 0);
  const myRemainingSeconds = timerInfo ? Math.max(0, baseMySeconds - (isTurnTimerRunning && vm.isMyTurn ? timerElapsedSec : 0)) : null;
  const oppRemainingSeconds = timerInfo ? Math.max(0, baseOppSeconds - (isTurnTimerRunning && !vm.isMyTurn ? timerElapsedSec : 0)) : null;
  const activeTimerSide = isTurnTimerRunning ? (vm.isMyTurn ? 'my' : 'opponent') : null;

  return (
    <>
      {coinTossStage !== 'done' && coinTossStage !== 'hidden' && (
          <div className="game-coin-toss-overlay" aria-live="polite" aria-label="선후공 코인 토스">
            <div className="game-coin-toss-stage">
              {coinTossStage === 'result' && (
                  <div className="game-coin-toss-result-text">{isFirstPlayer ? '선공' : '후공'}</div>
              )}
              <div className={`game-coin-toss-coin-wrap ${coinTossStage === 'spinning' ? 'spinning' : 'settled'} ${coinTossStage === 'clearing' ? 'hidden' : ''}`}>
                <div className="game-coin-toss-shadow" />
                <div
                    className="game-coin-toss-coin"
                    style={{ transform: `rotateX(${coinRotationDeg}deg)` }}
                >
                  <div className="game-coin-toss-face front">
                    <img src="/coin/front.png" alt="코인 앞면" />
                  </div>
                  <div className="game-coin-toss-face back">
                    <img src="/coin/back.png" alt="코인 뒷면" />
                  </div>
                </div>
              </div>
            </div>
          </div>
      )}
      {vm.headshotCoinTossEvent && headshotStage !== 'done' && headshotStage !== 'hidden' && (
          <div className="game-coin-toss-overlay headshot" aria-live="polite" aria-label="헤드샷 코인 토스">
            <div className="game-coin-toss-stage">
              {headshotStage === 'result' && (
                  <div className="game-coin-toss-result-text">
                    {vm.headshotCoinTossEvent.headshot ? '헤드샷!' : '일반 적중'}
                  </div>
              )}
              <div className="game-headshot-subtitle">
                {vm.headshotCoinTossEvent.actorName} · {vm.headshotCoinTossEvent.skillName}
              </div>
              <div className="game-headshot-coin-row">
                {[0, 1].map((idx) => (
                    <div
                        key={`headshot-coin-${idx}`}
                        className={`game-coin-toss-coin-wrap ${headshotStage === 'spinning' ? 'spinning' : 'settled'} ${headshotStage === 'clearing' ? 'hidden' : ''}`}
                    >
                      <div className="game-coin-toss-shadow" />
                      <div
                          className="game-coin-toss-coin"
                          style={{ transform: `rotateX(${headshotRotationDeg[idx]}deg)` }}
                      >
                        <div className="game-coin-toss-face front">
                          <img src="/coin/front.png" alt="코인 앞면" />
                        </div>
                        <div className="game-coin-toss-face back">
                          <img src="/coin/back.png" alt="코인 뒷면" />
                        </div>
                      </div>
                    </div>
                ))}
              </div>
            </div>
          </div>
      )}
      {showOpeningCinematic && (
          <div className="game-opening-overlay" aria-live="polite" aria-label="시작 패 드로우 연출">
            {openingStage === 'draw_back' && (
                <div className="game-opening-backdraw-stack">
                  {Array.from({ length: openingCardCount }).map((_, idx) => (
                      <div
                          key={`back-${idx}`}
                          className="game-opening-backdraw-card"
                          style={{
                            animationDelay: `${idx * 0.22}s`,
                            backgroundImage: `url(${getCardBackImageSrc()}), url(/illustration/card_back.png)`,
                          }}
                      />
                  ))}
                </div>
            )}
            {openingStage === 'reveal_front' && revealCardInHand && (
                <button type="button" className="game-opening-reveal-area" onClick={handleRevealNext}>
                  <div
                      className={`game-opening-front-card ${revealUsingFullCardArt ? 'fullart' : ''} ${revealExiting ? 'exiting' : ''}`}
                      onPointerMove={handleRevealPointerMove}
                      onPointerLeave={resetRevealTilt}
                      onPointerUp={resetRevealTilt}
                      style={{
                        transform: `rotateX(${revealTilt.x}deg) rotateY(${revealTilt.y}deg) translateZ(0)`,
                        borderColor: revealRoleColor,
                      }}
                  >
                    <CardFaceContent
                        variant="hand"
                        sizePreset="opening"
                        name={revealCardInHand.name}
                        role={revealCardInHand.role}
                        isSpell={revealCardInHand.is_spell}
                        cost={revealCardInHand.cost}
                        hp={revealCardInHand.hp}
                        currentImageSrc={revealImageSrc}
                        usingFullCardArt={revealUsingFullCardArt}
                        imgError={revealImgError}
                        onError={handleRevealImageError}
                    />
                  </div>
                  <div className="game-opening-reveal-guide">클릭해서 다음 카드 보기 ({Math.min(openingCardCount, revealIndex + 1)}/{openingCardCount})</div>
                </button>
            )}
          </div>
      )}
    <GameScreen
      announcerData={coinTossStage === 'done' ? vm.announcerData : null}
      onCloseAnnouncer={vm.closeAnnouncer}
      topbarLeft={
        <>
          <span className="game-round-pill">R{vm.gs.round} · T{vm.gs.turn}</span>
          <span className="game-phase-pill">{phaseLabel(vm.phase)}</span>
        </>
      }
      topbarRight={
        <>
          <div className={`game-turn-indicator ${vm.isMyTurn ? 'mine' : 'theirs'}`}>{isSpectator ? '관전 중' : (vm.isMyTurn ? '● 내 턴' : '○ 상대 턴')}</div>
          <div className="game-opponent-meta-inline">
            {isSpectator ? '양쪽 손패 비공개 관전' : `상대: ${vm.opp.username || '상대'} · 패:${vm.opp.hand_count} · 덱:${vm.opp.draw_pile_count}`}
          </div>
          <div className={`game-conn-badge ${vm.connected ? 'ok' : vm.reconnecting ? 'retry' : 'off'}`}>{vm.connected ? '연결됨' : vm.reconnecting ? '재연결 중…' : '오프라인'}</div>
          {!isSpectator && <button onClick={handleSurrender} disabled={isFinalGameOver} style={{ ...BTN_SM, background: '#4b1f2d', opacity: isFinalGameOver ? 0.5 : 1 }}>항복</button>}
          <button onClick={() => { vm.leaveGame(); navigate('/'); }} style={{ ...BTN_SM, background: '#1a2342' }}>나가기</button>
        </>
      }
      banners={banners}
      midlineDotActive={vm.isMyTurn}
      leftBattleOverlay={timerInfo ? (
          <aside className="game-timer-panel" aria-label="턴 타이머">
            <div className="game-timer-panel-title">타이머</div>
            <div className={`game-timer-row ${activeTimerSide === 'my' ? 'active' : ''}`}>
              <span className="game-timer-label">내 시간</span>
              <strong className="game-timer-value">{formatTimerClock(myRemainingSeconds ?? 0)}</strong>
            </div>
            <div className={`game-timer-row ${activeTimerSide === 'opponent' ? 'active' : ''}`}>
              <span className="game-timer-label">상대 시간</span>
              <strong className="game-timer-value">{formatTimerClock(oppRemainingSeconds ?? 0)}</strong>
            </div>
            <div className="game-timer-bonus">턴 종료 시 +{timerInfo.increment_seconds ?? 0}s</div>
          </aside>
      ) : null}
      topField={{
        field: vm.opp.field,
        isOpponent: true,
        isMyTurn: isSpectator ? false : vm.isMyTurn,
        phase: vm.phase,
        selectedUid: null,
        canActUids: [],
        onCardClick: (card) => vm.handleFieldClick(card, true),
        onCardLongPress: (card) => vm.setDetailCard(card),
        cardEffects: vm.cardEffects,
        placingCard: null,
        onPlaceClick: () => {},
        canSelectEmptySlot: vm.canSelectEmptySlot,
        onEmptySlotSelect: vm.handleEmptySlotSelect,
      }}
      bottomField={{
        field: vm.my.field,
        isOpponent: false,
        isMyTurn: isSpectator ? false : vm.isMyTurn,
        phase: vm.phase,
        selectedUid: isSpectator ? null : vm.selectedFieldUid,
        canActUids: isSpectator ? [] : vm.canActUids,
        onCardClick: (card) => vm.handleFieldClick(card, false),
        onCardLongPress: (card) => vm.setDetailCard(card),
        cardEffects: vm.cardEffects,
        placingCard: isSpectator ? null : (vm.phase === 'placement' && vm.isMyTurn
            ? (vm.selectedHandCard && !vm.selectedHandCard.is_spell
                ? vm.selectedHandCard
                : (vm.pendingSpell === 'spell_duplicate' && vm.actionMode === 'duplicate_place' && vm.duplicateTargetRole
                    ? ({ role: vm.duplicateTargetRole } as any)
                    : null))
            : null),
        onPlaceClick: isSpectator ? (() => {}) : vm.handlePlace,
        canSelectEmptySlot: vm.canSelectEmptySlot,
        onEmptySlotSelect: vm.handleEmptySlotSelect,
      }}
      contextPanel={openingActive || isSpectator ? null : (
        <OnlineContextPanel
          show={vm.showContextPanel}
          phase={vm.phase}
          mulliganDone={vm.my.mulligan_done}
          selectedMulligan={vm.selectedMulligan}
          isMulliganAnimating={vm.isMulliganCinematicActive}
          onRunMulligan={vm.runMulligan}
          onSkipMulligan={vm.skipMulligan}
          selectedFieldName={vm.selectedMyFieldCard?.name}
          selectedHeroKey={vm.selectedHeroKey}
          selectedFieldImageCandidates={vm.selectedMyFieldCard ? [...getCardArtCandidates(vm.selectedMyFieldCard), getCardImageSrc(vm.selectedMyFieldCard)] : []}
          selectedChargeLevel={vm.selectedChargeLevel}
          fieldSkills={vm.fieldSkills}
          actionMode={vm.actionMode}
          actionModeLabel={vm.actionModeLabel}
          onPrepareSkill={vm.prepareSkill}
          onCancelSkillSelection={() => { vm.setSelectedFieldUid(null); vm.setActionMode(null); vm.setColumnChoice(null); }}
          columnChoice={vm.columnChoice}
          enemyColumns={vm.enemyColumns}
          onSelectColumn={vm.selectColumn}
          onCancelColumnChoice={vm.cancelColumnChoice}
          pendingSpell={vm.pendingSpell}
          pendingSpellName={vm.pendingSpellName}
          duplicateTargetName={vm.duplicateTargetName}
          onCancelPendingSpell={vm.cancelPendingSpell}
          selectedHandSpellName={vm.selectedHandCard?.is_spell ? vm.selectedHandCard.name : null}
          onUseSelectedSpell={vm.useSelectedSpell}
          onCancelSelectedHand={vm.cancelSelectedHand}
          pendingPassive={vm.pendingPassive}
          onResolveMercy={vm.resolveMercy}
          onSkipMercy={vm.skipMercy}
          onSkipJetpackCat={vm.skipJetpackCat}
          pendingSpellChoice={vm.pendingSpellChoice}
          onResolveSpellChoice={vm.resolveSpellChoice}
        />
      )}
      handCards={isSpectator ? [] : visibleHandCards}
      mulliganAnimatingIndex={vm.mulliganAnimatingIndex}
      mulliganCinematicCard={vm.mulliganCinematicCard}
      mulliganReplacementCard={vm.mulliganReplacementCard}
      isMulliganCinematicActive={vm.isMulliganCinematicActive}
      onMulliganCinematicComplete={vm.completeMulliganCinematic}
      isHandSelected={(index) => isSpectator ? false : (vm.phase === 'mulligan' ? vm.selectedMulligan.includes(index) : vm.selectedHandIdx === index)}
      onHandClick={openingActive ? (() => {}) : vm.handleHandClick}
      compactBottomPanel={isSpectator}
      bottomMeta={<>{isSpectator ? '관전 모드 · 손패 비공개' : `패:${vm.my.hand_count} · 덱:${vm.my.draw_pile_count} · 트래시:${vm.my.trash_count}`}</>}
      bottomActions={
        <>
          {!isSpectator && vm.phase === 'placement' && (
              <span className="game-placement-meta">
              배치 {vm.my.placement_cost_used}/{Number(vm.my?.placement_limit ?? 2)}
            </span>
          )}
          {!isSpectator && vm.phase !== 'mulligan' && (
            <button className="game-endturn" disabled={!vm.isMyTurn || !!vm.pendingPassive || !!vm.pendingSpellChoice || !!vm.columnChoice} onClick={vm.handleEndMainButton} style={{ opacity: (vm.isMyTurn && !vm.pendingPassive && !vm.pendingSpellChoice && !vm.columnChoice) ? 1 : 0.5 }}>
              {vm.phase === 'placement' ? '배치 완료' : vm.phase === 'action' ? '턴 종료' : '대기'}
            </button>
          )}
        </>
      }
      logs={vm.logs}
      killFeed={vm.killFeed}
      onDismissKillFeedItem={vm.dismissKillFeedItem}
      detailCard={vm.detailCard}
      onCloseDetail={() => vm.setDetailCard(null)}
    />
      {isBetweenBo3Rounds && bo3 && !isSpectator && (
          <div className="game-result-modal-backdrop" role="dialog" aria-modal="true">
            <div className="game-result-modal">
              <h2>{bo3.pending_round_result?.round}세트 종료</h2>
              <p>
                스코어 {Object.values(bo3.wins)[0] ?? 0}:{Object.values(bo3.wins)[1] ?? 0} ·
                다음 세트 전 덱 수정 단계입니다.
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                {bo3.awaiting_first_player_choice && (
                    <>
                      <button onClick={() => vm.chooseBo3FirstPlayer('first')} style={{ ...BTN_SM, background: '#123e63' }}>선공 선택</button>
                      <button onClick={() => vm.chooseBo3FirstPlayer('second')} style={{ ...BTN_SM, background: '#123e63' }}>후공 선택</button>
                    </>
                )}
                {bo3.awaiting_deck_submit && (
                    <button
                        onClick={openBo3DeckEditor}
                        style={{ ...BTN_SM, background: '#1a4f2a' }}
                    >
                      덱 제출/수정
                    </button>
                )}
              </div>
            </div>
          </div>
      )}
      {showBo3DeckEditor && bo3 && !isSpectator && (
          <div className="game-result-modal-backdrop" role="dialog" aria-modal="true">
            <div className="game-result-modal game-bo3-editor-modal">
              <h2>BO3 덱 수정</h2>
              <p className="game-bo3-editor-desc">
                이번 휴식 구간 변경 가능 수: 최대 {bo3.deck_edit_limit_per_break ?? 5}장
              </p>
              {bo3EditorLoading ? (
                  <div className="game-bo3-editor-loading">카드 데이터를 불러오는 중...</div>
              ) : (
                  <>
                    <div className="game-bo3-editor-changes">
                      <div className="game-bo3-editor-change-block removed">
                        <div className="game-bo3-editor-change-title">뺀 카드 ({bo3EditorChanges.removed.length})</div>
                        <div className="game-bo3-editor-change-items">
                          {bo3EditorChanges.removed.length === 0 ? <span>-</span> : bo3EditorChanges.removed.map((id, idx) => (
                              <span key={`removed-${id}-${idx}`}>#{id}</span>
                          ))}
                        </div>
                      </div>
                      <div className="game-bo3-editor-change-block added">
                        <div className="game-bo3-editor-change-title">추가한 카드 ({bo3EditorChanges.added.length})</div>
                        <div className="game-bo3-editor-change-items">
                          {bo3EditorChanges.added.length === 0 ? <span>-</span> : bo3EditorChanges.added.map((id, idx) => (
                              <span key={`added-${id}-${idx}`}>#{id}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="game-bo3-editor-search-row">
                      <input
                          className="game-bo3-editor-search"
                          value={bo3EditorSearch}
                          onChange={(e) => setBo3EditorSearch(e.target.value)}
                          placeholder="카드 검색"
                      />
                      <div className="game-bo3-editor-total">{bo3EditorTotalCount}/{bo3EditorDeckSize}</div>
                    </div>
                    <div className="game-bo3-editor-grid">
                      <section className="game-bo3-editor-panel">
                        <div className="game-bo3-editor-panel-title">카드 목록</div>
                        <div className="game-bo3-editor-card-grid">
                          {bo3EditorFilteredCards.map((card) => {
                            const qty = bo3EditorEntries[card.id] ?? 0;
                            const roleColor = card.is_spell ? '#ffaa22' : (ROLE_COLOR[card.role] || '#9aa6cc');
                            return (
                                <div key={`bo3-card-${card.id}`} className="game-bo3-editor-card-tile" style={{ borderColor: qty > 0 ? roleColor : undefined }}>
                                  <div className="game-bo3-editor-card-img">
                                    <img src={getCardImageSrc(card as any)} alt={card.name} />
                                  </div>
                                  <div className="game-bo3-editor-card-name">{card.name}</div>
                                  <div className="game-bo3-editor-card-role" style={{ color: roleColor }}>{card.is_spell ? '스킬' : card.role}</div>
                                  <div className="game-bo3-editor-controls">
                                    <button className="game-bo3-editor-btn" onClick={() => removeBo3EditorCard(card.id)} disabled={qty <= 0}>-</button>
                                    <span>{qty}</span>
                                    <button className="game-bo3-editor-btn" onClick={() => addBo3EditorCard(card.id)}>+</button>
                                  </div>
                                </div>
                            );
                          })}
                        </div>
                      </section>
                      <section className="game-bo3-editor-panel">
                        <div className="game-bo3-editor-panel-title">내 덱 <span>{bo3EditorTotalCount}/{bo3EditorDeckSize}</span></div>
                        <div className="game-bo3-editor-deck-grid">
                          {bo3EditorSelectedCards.length === 0 ? (
                              <div className="game-bo3-editor-empty">카드를 추가하세요</div>
                          ) : bo3EditorSelectedCards.map((card) => (
                              <div key={`bo3-selected-${card.id}`} className="game-bo3-editor-selected-card">
                                <div className="game-bo3-editor-selected-qty">{card.quantity}</div>
                                <div className="game-bo3-editor-card-img">
                                  <img src={getCardImageSrc(card as any)} alt={card.name} />
                                </div>
                                <div className="game-bo3-editor-card-name">{card.name}</div>
                                <div className="game-bo3-editor-controls">
                                  <button className="game-bo3-editor-btn" onClick={() => removeBo3EditorCard(card.id)}>-</button>
                                  <button className="game-bo3-editor-btn" onClick={() => addBo3EditorCard(card.id)}>+</button>
                                </div>
                              </div>
                          ))}
                        </div>
                      </section>
                    </div>
                  </>
              )}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12 }}>
                <button onClick={handleSubmitBo3Deck} style={{ ...BTN_SM, background: '#1a4f2a' }}>제출</button>
                <button onClick={() => setShowBo3DeckEditor(false)} style={{ ...BTN_SM, background: '#4a5268' }}>취소</button>
              </div>
            </div>
          </div>
      )}
      {isFinalGameOver && (
          <div className="game-result-modal-backdrop" role="dialog" aria-modal="true">
            <div className={`game-result-modal ${isWinner ? 'win' : 'lose'}`}>
              <h2>{resultTitle}</h2>
              <p>{resultSubtitle}</p>
              <button onClick={() => { vm.leaveGame(); navigate('/'); }} style={{ ...BTN_SM, background: isWinner ? '#136b34' : '#6b1f2a' }}>
                로비로 이동
              </button>
            </div>
          </div>
      )}
    </>
  );
};

export default GamePage;
