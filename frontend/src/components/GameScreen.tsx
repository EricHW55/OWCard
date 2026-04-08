import React from 'react';
import GameBoardLayout from '../components/GameBoardLayout';
import FieldSection from '../components/FieldSection';
import HandCardComp from '../components/HandCardComp';
import CardDetail from '../components/CardDetail';
import { CardFaceContent } from './CardFaceContent';
import type { GameScreenProps } from '../types/screen';
import { getCardBackImageSrc, getCardImageSrc } from '../utils/heroImage';
import { useCardImage } from '../hooks/useCardImage';

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
  logs = [],
  killFeed = [],
  onDismissKillFeedItem,
  detailCard = null,
  onCloseDetail,
}) => {
  const [showLogModal, setShowLogModal] = React.useState(false);
  const [mulliganStage, setMulliganStage] = React.useState<'idle' | 'return' | 'draw' | 'reveal'>('idle');
  const killTimerRef = React.useRef<Record<string, number>>({});
  const mulliganTimerRef = React.useRef<number[]>([]);
  const focusedHandIndex = handCards.findIndex((_, index) => isHandSelected(index));
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
        {killFeed.length > 0 && (
            <div className="game-killfeed" aria-live="polite">
              {killFeed.map((entry) => {
                const killerSrc = getCardImageSrc({ hero_key: entry.killer.hero_key, name: entry.killer.name, is_spell: entry.killer.is_spell });
                const victimSrc = getCardImageSrc({ hero_key: entry.victim.hero_key, name: entry.victim.name, is_spell: entry.victim.is_spell });
                return (
                    <button key={entry.id} type="button" className="game-killfeed-item" onClick={() => onDismissKillFeedItem?.(entry.id)}>
                      <img src={killerSrc} alt={entry.killer.name} className={`game-killfeed-icon ${entry.killer.team === 'my' ? 'ally' : 'enemy'}`} />
                      <span className="game-killfeed-arrow">➜</span>
                      <img src={victimSrc} alt={entry.victim.name} className={`game-killfeed-icon ${entry.victim.team === 'my' ? 'ally' : 'enemy'}`} />
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

      <div className="game-bottom-panel">
        {contextPanel}

        <div className="game-floating-actions">
          <div className="game-floating-actions-inner">
            <button
                type="button"
                className="game-log-button game-chip-button"
                onClick={() => setShowLogModal(true)}
                disabled={logs.length === 0}
            >
              전투 로그
            </button>
            {bottomActions}
          </div>
        </div>

        <div className="game-hand-row">
          {handCards.map((card, index) => (
            <HandCardComp
              key={`${card.id}-${index}`}
              card={card}
              selected={isHandSelected(index)}
              hidden={mulliganAnimatingIndex === index}
              index={index}
              total={handCards.length}
              focusedIndex={focusedHandIndex}
              onClick={() => onHandClick(card, index)}
            />
          ))}
        </div>

        <div className="game-bottombar">
          <span className="game-bottombar-meta">{bottomMeta}</span>
        </div>
      </div>

      {onCloseDetail && <CardDetail card={detailCard || null} onClose={onCloseDetail} />}
      {isMulliganCinematicActive && mulliganCinematicCard && (
          <div
              className="mulligan-cinematic-layer"
              aria-hidden
              onClick={() => {
                if (canCloseMulliganCinematic) onMulliganCinematicComplete?.();
              }}
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
              <div className="game-log-modal-body">
                {logs.length === 0 ? (
                    <div className="game-log-line">표시할 로그가 없습니다.</div>
                ) : logs.map((log, index) => (
                    <div key={`${index}-${log}`} className="game-log-line">{log}</div>
                ))}
              </div>
            </div>
          </div>
      )}
    </GameBoardLayout>
  );
};

export default GameScreen;