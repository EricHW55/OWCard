import React from 'react';
import GameBoardLayout from '../components/GameBoardLayout';
import FieldSection from '../components/FieldSection';
import HandCardComp from '../components/HandCardComp';
import CardDetail from '../components/CardDetail';
import type { GameScreenProps } from '../types/screen';

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
  detailCard = null,
  onCloseDetail,
}) => {
  const [showLogModal, setShowLogModal] = React.useState(false);

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