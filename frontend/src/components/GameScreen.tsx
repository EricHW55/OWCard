import React from 'react';
import GameBoardLayout from '../components/GameBoardLayout';
import FieldSection from '../components/FieldSection';
import HandCardComp from '../components/HandCardComp';
import CardDetail from '../components/CardDetail';
import { CardFaceContent } from './CardFaceContent';
import type { GameScreenProps } from '../types/screen';
import type { BattleLogActor, BattleLogEntry } from '../types/game';
import { getCardBackImageSrc, getCardImageSrc } from '../utils/heroImage';
import { useCardImage } from '../hooks/useCardImage';

const BattleLogAvatar: React.FC<{ actor?: BattleLogActor; className?: string }> = ({ actor, className = 'game-log-avatar' }) => {
  const cardLike = React.useMemo(() => ({
    name: actor?.name,
    hero_key: actor?.heroKey,
    is_spell: actor?.isSpell,
  }), [actor?.heroKey, actor?.isSpell, actor?.name]);
  const { currentImageSrc, onError } = useCardImage(cardLike, 'field', [actor?.heroKey, actor?.isSpell, actor?.name]);
  return <img src={currentImageSrc} onError={onError} alt={actor?.name || 'actor'} className={className} />;
};

const KillFeedAvatar: React.FC<{ unit: { name: string; hero_key?: string; is_spell?: boolean }; className: string }> = ({ unit, className }) => {
  const cardLike = React.useMemo(() => ({
    name: unit.name,
    hero_key: unit.hero_key,
    is_spell: unit.is_spell,
  }), [unit.hero_key, unit.is_spell, unit.name]);
  const { currentImageSrc, onError } = useCardImage(cardLike, 'field', [unit.hero_key, unit.is_spell, unit.name]);
  return <img src={currentImageSrc} onError={onError} alt={unit.name} className={className} />;
};

const GameScreen: React.FC<GameScreenProps> = ({
  announcerData,
  onCloseAnnouncer,
  topbarLeft,
  topbarCenter,
  topbarRight,
  banners = [],
  topField,
  bottomField,
  midlineDotActive = false,
  leftBattleOverlay,
  contextPanel,
  handCards,
  isHandSelected,
  onHandClick,
  mulliganAnimatingIndex = null,
  mulliganCinematicCard = null,
  mulliganReplacementCard = null,
  isMulliganCinematicActive = false,
  onMulliganCinematicComplete,
  bottomMeta,
  bottomActions,
  compactBottomPanel = false,
  handOwnerKey,
  logs = [],
  killFeed = [],
  onDismissKillFeedItem,
  detailCard = null,
  onCloseDetail,
}) => {
  const [showLogModal, setShowLogModal] = React.useState(false);
  const logBodyRef = React.useRef<HTMLDivElement | null>(null);
  const [mulliganStage, setMulliganStage] = React.useState<'idle' | 'return' | 'draw' | 'reveal'>('idle');
  const [leavingHandCards, setLeavingHandCards] = React.useState<typeof handCards | null>(null);
  const [handEntering, setHandEntering] = React.useState(false);
  const killTimerRef = React.useRef<Record<string, number>>({});
  const mulliganTimerRef = React.useRef<number[]>([]);
  const mulliganAutoCloseTimerRef = React.useRef<number | null>(null);
  const previousHandOwnerRef = React.useRef<string | undefined>(handOwnerKey);
  const previousHandCardsRef = React.useRef(handCards);
  const {
    currentImageSrc: mulliganFrontImageSrc,
    imgError: mulliganFrontImageError,
    onError: onMulliganFrontImageError,
    usingFullCardArt: mulliganUsingFullCardArt,
  } = useCardImage(
      mulliganCinematicCard as any,
      'hand',
      [
        mulliganCinematicCard?.id,
        mulliganCinematicCard?.hero_key,
        mulliganCinematicCard?.name,
        mulliganCinematicCard?.is_spell,
        mulliganCinematicCard?.role,
      ]
  );

  React.useEffect(() => {
    if (!onDismissKillFeedItem) return;
    const activeIds = new Set(killFeed.map((entry) => entry.id));
    killFeed.forEach((entry) => {
      if (killTimerRef.current[entry.id]) return;
      const duration = entry.duration ?? 3000;
      killTimerRef.current[entry.id] = window.setTimeout(() => {
        onDismissKillFeedItem(entry.id);
        delete killTimerRef.current[entry.id];
      }, duration);
    });
    Object.keys(killTimerRef.current).forEach((id) => {
      if (!activeIds.has(id)) {
        window.clearTimeout(killTimerRef.current[id]);
        delete killTimerRef.current[id];
      }
    });
  }, [killFeed, onDismissKillFeedItem]);

  React.useEffect(() => () => {
    Object.values(killTimerRef.current).forEach((timerId) => window.clearTimeout(timerId));
    killTimerRef.current = {};
  }, []);

  React.useEffect(() => {
    mulliganTimerRef.current.forEach((timerId) => window.clearTimeout(timerId));
    mulliganTimerRef.current = [];
    if (!isMulliganCinematicActive || !mulliganCinematicCard) {
      setMulliganStage('idle');
      return;
    }
    setMulliganStage('return');
    const toDraw = window.setTimeout(() => setMulliganStage('draw'), 760);
    const toReveal = window.setTimeout(() => setMulliganStage('reveal'), 1520);
    mulliganTimerRef.current = [toDraw, toReveal];
    return () => {
      mulliganTimerRef.current.forEach((timerId) => window.clearTimeout(timerId));
      mulliganTimerRef.current = [];
    };
  }, [isMulliganCinematicActive, mulliganCinematicCard?.id, mulliganCinematicCard?.hero_key, mulliganCinematicCard?.name]);

  const canCloseMulliganCinematic = isMulliganCinematicActive && mulliganStage === 'reveal' && !!mulliganReplacementCard;

  React.useEffect(() => {
    if (mulliganAutoCloseTimerRef.current) {
      window.clearTimeout(mulliganAutoCloseTimerRef.current);
      mulliganAutoCloseTimerRef.current = null;
    }
    if (!canCloseMulliganCinematic) return;
    mulliganAutoCloseTimerRef.current = window.setTimeout(() => {
      onMulliganCinematicComplete?.();
      mulliganAutoCloseTimerRef.current = null;
    }, 380);
    return () => {
      if (mulliganAutoCloseTimerRef.current) {
        window.clearTimeout(mulliganAutoCloseTimerRef.current);
        mulliganAutoCloseTimerRef.current = null;
      }
    };
  }, [canCloseMulliganCinematic, onMulliganCinematicComplete]);

  React.useEffect(() => {
    if (!showLogModal) return;
    const body = logBodyRef.current;
    if (!body) return;
    requestAnimationFrame(() => {
      body.scrollTop = body.scrollHeight;
    });
  }, [showLogModal, logs.length]);

  React.useEffect(() => {
    const previousOwner = previousHandOwnerRef.current;
    if (!handOwnerKey || !previousOwner || previousOwner === handOwnerKey) {
      previousHandOwnerRef.current = handOwnerKey;
      previousHandCardsRef.current = handCards;
      return;
    }
    setLeavingHandCards(previousHandCardsRef.current);
    setHandEntering(true);
    previousHandOwnerRef.current = handOwnerKey;
    previousHandCardsRef.current = handCards;
    const timerId = window.setTimeout(() => {
      setLeavingHandCards(null);
      setHandEntering(false);
    }, 760);
    return () => window.clearTimeout(timerId);
  }, [handCards, handOwnerKey]);

  const importantLogs = React.useMemo(
      () => logs.filter((entry) => ['placement', 'skill', 'damage', 'heal', 'destroy', 'turn_end'].includes(entry.type)),
      [logs],
  );

  const renderHandCards = React.useCallback((
      cards: typeof handCards,
      transition?: 'enter' | 'exit',
      clickEnabled = true,
  ) => {
    const focused = cards.findIndex((_, index) => isHandSelected(index));
    return cards.map((card, index) => (
        <HandCardComp
            key={`${transition || 'hand'}-${card.id}-${index}`}
            card={card}
            selected={transition ? false : isHandSelected(index)}
            hidden={!transition && mulliganAnimatingIndex === index}
            index={index}
            total={cards.length}
            focusedIndex={focused}
            handTransition={transition}
            onClick={clickEnabled ? () => onHandClick(card, index) : undefined}
        />
    ));
  }, [isHandSelected, mulliganAnimatingIndex, onHandClick]);

  const renderBattleLog = React.useCallback((entry: BattleLogEntry) => {
    if (entry.type === 'turn_end') return <div className="game-log-neutral">{entry.text || '턴 종료'}</div>;
    const isMine = entry.team === 'my';
    const title = (() => {
      if (entry.type === 'placement') return entry.text || `${entry.actor?.name || '영웅'} 배치`;
      if (entry.type === 'destroy') return entry.text || `${entry.actor?.name || '영웅'} 파괴`;
      const actorName = entry.actor?.name || '';
      const skillName = entry.skillName || '';
      if (actorName && skillName) return `${actorName} · ${skillName}`;
      return `${actorName}${skillName}`.trim();
    })();
    const isArrowLog = (entry.type === 'damage' || entry.type === 'heal') && !!entry.target;
    return (
        <div className={`game-log-entry-box ${isMine ? 'my' : 'opponent'}`}>
          <div className="game-log-entry-title">{title}</div>
          <div className="game-log-entry-content">
            <BattleLogAvatar actor={entry.actor} />
            {isArrowLog ? (
                <>
                  <div className="game-log-arrow-wrap">
                    <span className={`game-log-damage-value ${entry.type === 'heal' ? 'heal' : ''}`}>{entry.damage ?? 0}</span>
                    <span className="game-log-arrow">➜</span>
                  </div>
                  <BattleLogAvatar actor={entry.target} />
                </>
            ) : null}
          </div>
        </div>
    );
  }, []);

  return (
    <GameBoardLayout announcerData={announcerData} onCloseAnnouncer={onCloseAnnouncer}>
      <div className="game-topbar" aria-label="게임 상태">
        <div className="game-topbar-left game-topbar-chip">{topbarLeft}</div>
        {topbarCenter ? <div className="game-topbar-center game-topbar-chip">{topbarCenter}</div> : null}
        <div className="game-topbar-right game-topbar-chip">{topbarRight}</div>
      </div>

      {banners.map((banner, index) => (
        <React.Fragment key={index}>{banner}</React.Fragment>
      ))}

      <div className="game-battle game-battle--three-d">
        {leftBattleOverlay ? (
            <div className="game-battle-left-overlay">
              {leftBattleOverlay}
            </div>
        ) : null}
        {killFeed.length > 0 && (
            <div className="game-killfeed" aria-live="polite">
              {killFeed.map((entry) => {
                return (
                    <button key={entry.id} type="button" className="game-killfeed-item" onClick={() => onDismissKillFeedItem?.(entry.id)}>
                      <KillFeedAvatar unit={entry.killer} className={`game-killfeed-icon ${entry.killer.team === 'my' ? 'ally' : 'enemy'}`} />
                      <span className="game-killfeed-arrow">➜</span>
                      <KillFeedAvatar unit={entry.victim} className={`game-killfeed-icon ${entry.victim.team === 'my' ? 'ally' : 'enemy'}`} />
                    </button>
                );
              })}
            </div>
        )}
        <div className="game-board-scale">
          <FieldSection {...topField} />

          <div className="game-midline">
            <div className={`game-midline-bar ${midlineDotActive ? 'active' : ''}`} />
          </div>

          <FieldSection {...bottomField} />
        </div>
      </div>

      <div className={`game-bottom-panel ${compactBottomPanel ? 'game-bottom-panel--compact' : ''}`}>
        {contextPanel}

        <div className="game-floating-actions">
          <div className="game-floating-actions-inner">
            <button
                type="button"
                className="game-log-button game-chip-button"
                onClick={() => setShowLogModal(true)}
                disabled={importantLogs.length === 0}
            >
              전투 로그
            </button>
            {bottomActions}
          </div>
        </div>

        {!compactBottomPanel && (
            <div className={`game-hand-row ${handOwnerKey ? 'game-hand-row--switching' : ''}`}>
              {leavingHandCards && (
                  <div className="game-hand-transition-layer exit" aria-hidden>
                    {renderHandCards(leavingHandCards, 'exit', false)}
                  </div>
              )}
              <div className={`game-hand-transition-layer current ${handEntering ? 'enter' : ''}`}>
                {renderHandCards(handCards, handEntering ? 'enter' : undefined, !handEntering)}
              </div>
            </div>
        )}

        <div className="game-bottombar">
          <span className="game-bottombar-meta">{bottomMeta}</span>
        </div>
      </div>

      {onCloseDetail && <CardDetail card={detailCard || null} onClose={onCloseDetail} />}
      {isMulliganCinematicActive && mulliganCinematicCard && (
          <div
              className="mulligan-cinematic-layer"
              aria-hidden
          >
            <div className={`mulligan-cinematic-card mulligan-cinematic-card--return mulligan-stage-${mulliganStage}`}>
              <div className="mulligan-cinematic-surface mulligan-cinematic-surface--front">
                {mulliganUsingFullCardArt ? (
                    <img src={mulliganFrontImageSrc} alt="" onError={onMulliganFrontImageError} />
                ) : (
                    <CardFaceContent
                        variant="hand"
                        name={mulliganCinematicCard.name}
                        role={mulliganCinematicCard.role}
                        isSpell={mulliganCinematicCard.is_spell}
                        cost={mulliganCinematicCard.cost}
                        hp={mulliganCinematicCard.hp}
                        currentImageSrc={mulliganFrontImageSrc || getCardImageSrc(mulliganCinematicCard)}
                        usingFullCardArt={false}
                        imgError={mulliganFrontImageError}
                        onError={onMulliganFrontImageError}
                    />
                )}
              </div>
              <div className="mulligan-cinematic-surface mulligan-cinematic-surface--back">
                <img src={getCardBackImageSrc()} alt="" />
              </div>
            </div>
            <div className={`mulligan-cinematic-card mulligan-cinematic-card--draw mulligan-stage-${mulliganStage}`}>
              <div className="mulligan-cinematic-surface mulligan-cinematic-surface--back">
                <img src={getCardBackImageSrc()} alt="" />
              </div>
            </div>
          </div>
      )}
      {showLogModal && (
          <div className="game-log-modal-backdrop" onClick={() => setShowLogModal(false)}>
            <div className="game-log-modal" onClick={(e) => e.stopPropagation()}>
              <div className="game-log-modal-head">
                <strong>전투 로그</strong>
                <button type="button" className="game-log-close" onClick={() => setShowLogModal(false)}>닫기</button>
              </div>
              <div className="game-log-modal-body" ref={logBodyRef}>
                {importantLogs.length === 0 ? (
                    <div className="game-log-line">표시할 로그가 없습니다.</div>
                ) : importantLogs.map((log) => (
                    <div key={log.id} className="game-log-line">{renderBattleLog(log)}</div>
                ))}
              </div>
            </div>
          </div>
      )}
    </GameBoardLayout>
  );
};

export default GameScreen;
