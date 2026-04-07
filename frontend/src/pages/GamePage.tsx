import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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

const GamePage: React.FC = () => {
  const { gameId = '' } = useParams();
  const navigate = useNavigate();
  const vm = useOnlineGameController(gameId);
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

  const isFirstPlayer = React.useMemo(() => {
    if (!vm.gs || !session || vm.gs.first_player == null) return null;
    return Number(vm.gs.first_player) === Number(session.player_id);
  }, [vm.gs, session]);

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

    const allCards = [
      ...(vm.gs.my_state?.hand || []),
      ...(vm.gs.my_state?.field?.main || []),
      ...(vm.gs.my_state?.field?.side || []),
      ...(vm.gs.opponent_state?.field?.main || []),
      ...(vm.gs.opponent_state?.field?.side || []),
    ];
    const stage2Sources = Array.from(new Set(allCards.flatMap((card) => getCardArtCandidates(card as any))));
    void preloadImageAssets(stage2Sources, 3200);

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
    };
  }, []);

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

  if (!session) {
    return (
        <div className="game-loading-screen">
          <div>로그인이 필요합니다.</div>
        </div>
    );
  }

  const isGameOver = vm.phase === 'game_over' && !!vm.gs;
  const isWinner = isGameOver && vm.gs?.winner === session.player_id;
  const resultTitle = !isGameOver ? '' : isWinner ? '승리!' : '패배';
  const resultSubtitle = !isGameOver
      ? ''
      : isWinner
          ? '상대가 항복했습니다.'
          : '당신이 항복하여 패배했습니다.';

  const handleSurrender = () => {
    if (isGameOver) return;
    const confirmed = window.confirm('정말로 항복하시겠습니까?');
    if (!confirmed) return;
    vm.surrenderGame();
    // navigate('/');
  };

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
  const visibleHandCards = openingActive
      ? vm.my.hand.slice(0, revealedCount)
      : vm.my.hand;
  const revealCardInHand = vm.my.hand[revealIndex];
  const revealRoleColor = revealCardInHand?.is_spell
      ? '#ffaa22'
      : (ROLE_COLOR[revealCardInHand?.role || ''] || 'rgba(188, 202, 246, 0.64)');

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
      {openingStage !== 'done' && openingStage !== 'idle' && (
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
                      className={`game-opening-front-card ${revealExiting ? 'exiting' : ''}`}
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
          <div className={`game-turn-indicator ${vm.isMyTurn ? 'mine' : 'theirs'}`}>{vm.isMyTurn ? '● 내 턴' : '○ 상대 턴'}</div>
          <div className="game-opponent-meta-inline">
            상대: {vm.opp.username || '상대'} · 패:{vm.opp.hand_count} · 덱:{vm.opp.draw_pile_count}
          </div>
          <div className={`game-conn-badge ${vm.connected ? 'ok' : vm.reconnecting ? 'retry' : 'off'}`}>{vm.connected ? '연결됨' : vm.reconnecting ? '재연결 중…' : '오프라인'}</div>
          <button onClick={handleSurrender} disabled={isGameOver} style={{ ...BTN_SM, background: '#4b1f2d', opacity: isGameOver ? 0.5 : 1 }}>항복</button>
          <button onClick={() => { vm.leaveGame(); navigate('/'); }} style={{ ...BTN_SM, background: '#1a2342' }}>나가기</button>
        </>
      }
      banners={banners}
      midlineDotActive={vm.isMyTurn}
      topField={{
        field: vm.opp.field,
        isOpponent: true,
        isMyTurn: vm.isMyTurn,
        phase: vm.phase,
        selectedUid: null,
        canActUids: [],
        onCardClick: (card) => vm.handleFieldClick(card, true),
        cardEffects: vm.cardEffects,
        placingCard: null,
        onPlaceClick: () => {},
        canSelectEmptySlot: vm.canSelectEmptySlot,
        onEmptySlotSelect: vm.handleEmptySlotSelect,
      }}
      bottomField={{
        field: vm.my.field,
        isOpponent: false,
        isMyTurn: vm.isMyTurn,
        phase: vm.phase,
        selectedUid: vm.selectedFieldUid,
        canActUids: vm.canActUids,
        onCardClick: (card) => vm.handleFieldClick(card, false),
        cardEffects: vm.cardEffects,
        placingCard: vm.phase === 'placement' && vm.isMyTurn
            ? (vm.selectedHandCard && !vm.selectedHandCard.is_spell
                ? vm.selectedHandCard
                : (vm.pendingSpell === 'spell_duplicate' && vm.actionMode === 'duplicate_place' && vm.duplicateTargetRole
                    ? ({ role: vm.duplicateTargetRole } as any)
                    : null))
            : null,
        onPlaceClick: vm.handlePlace,
        canSelectEmptySlot: vm.canSelectEmptySlot,
        onEmptySlotSelect: vm.handleEmptySlotSelect,
      }}
      contextPanel={openingActive ? null : (
        <OnlineContextPanel
          show={vm.showContextPanel}
          phase={vm.phase}
          mulliganDone={vm.my.mulligan_done}
          selectedMulligan={vm.selectedMulligan}
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
      handCards={visibleHandCards}
      isHandSelected={(index) => vm.phase === 'mulligan' ? vm.selectedMulligan.includes(index) : vm.selectedHandIdx === index}
      onHandClick={openingActive ? (() => {}) : vm.handleHandClick}
      bottomMeta={<>패:{vm.my.hand_count} · 덱:{vm.my.draw_pile_count} · 트래시:{vm.my.trash_count}</>}
      bottomActions={
        <>
          {vm.phase === 'placement' && <span className="game-placement-meta">배치 {vm.my.placement_cost_used}/2</span>}
          {vm.phase !== 'mulligan' && (
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
      {isGameOver && (
          <div className="game-result-modal-backdrop" role="dialog" aria-modal="true">
            <div className={`game-result-modal ${isWinner ? 'win' : 'lose'}`}>
              <h2>{resultTitle}</h2>
              <p>{resultSubtitle}</p>
              <button onClick={() => navigate('/')} style={{ ...BTN_SM, background: isWinner ? '#136b34' : '#6b1f2a' }}>
                로비로 이동
              </button>
            </div>
          </div>
      )}
    </>
  );
};

export default GamePage;
