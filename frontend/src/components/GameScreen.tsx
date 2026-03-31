import React from 'react';
import GameBoardLayout from '../components/GameBoardLayout';
import FieldSection from '../components/FieldSection';
import HandCardComp from '../components/HandCardComp';
import CardDetail from '../components/CardDetail';
import type { GameScreenProps } from '../types/screen';
import { getCardImageSrc } from '../utils/heroImage';

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
  bottomMeta,
  bottomActions,
  logs = [],
  killFeed = [],
  onDismissKillFeedItem,
  detailCard = null,
  onCloseDetail,
}) => {
  const [showLogModal, setShowLogModal] = React.useState(false);
  const killTimerRef = React.useRef<Record<string, number>>({});

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

  return (
    <GameBoardLayout announcerData={announcerData} onCloseAnnouncer={onCloseAnnouncer}>
      <div className="game-topbar">
        <div className="game-topbar-left">{topbarLeft}</div>
        <div className="game-topbar-center">{topbarCenter}</div>
        <div className="game-topbar-right">{topbarRight}</div>
      </div>

      {banners.map((banner, index) => (
        <React.Fragment key={index}>{banner}</React.Fragment>
      ))}

      <div className="game-battle">
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
            <div className="game-midline-bar" />
            <div className="game-midline-dots">
              <div className={`game-midline-dot ${midlineDotActive ? 'active' : ''}`} />
              <div className="game-midline-dot red" />
              <div className="game-midline-dot blue" />
            </div>
            <div className="game-midline-bar" />
          </div>

          <FieldSection {...bottomField} />
        </div>
      </div>

      <div className="game-bottom-panel">
        {contextPanel}

        <div className="game-hand-row">
          {handCards.map((card, index) => (
            <HandCardComp
              key={`${card.id}-${index}`}
              card={card}
              selected={isHandSelected(index)}
              onClick={() => onHandClick(card, index)}
            />
          ))}
        </div>

        <div className="game-bottombar">
          <span className="game-bottombar-meta">{bottomMeta}</span>
          <div className="game-bottombar-actions">
            <button
                type="button"
                className="game-log-button"
                onClick={() => setShowLogModal(true)}
                disabled={logs.length === 0}
            >
              전투 로그
            </button>
            {bottomActions}
          </div>
        </div>
      </div>

      {onCloseDetail && <CardDetail card={detailCard || null} onClose={onCloseDetail} />}
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