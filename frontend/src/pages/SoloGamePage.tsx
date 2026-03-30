import React from 'react';
import { useNavigate } from 'react-router-dom';
import GameScreen from '../components/GameScreen';
import SoloContextPanel from '../components/SoloContextPanel';
import useSoloGameController from '../controllers/useSoloGameController';
import { BTN_SM, phaseLabel } from '../utils/ui';
import './GamePage.css';
import './SoloGamePage.css';

const SoloGamePage: React.FC = () => {
  const navigate = useNavigate();
  const vm = useSoloGameController();

  if (vm.loading) return <div className="solo-page solo-center">솔로 모드 준비 중...</div>;
  if (vm.error || !vm.players || !vm.activePlayer) {
    return (
      <div className="solo-page solo-center">
        <div>{vm.error || '초기화 실패'}</div>
        <button type="button" className="solo-btn" onClick={() => navigate('/')}>로비로</button>
      </div>
    );
  }

  return (
    <GameScreen
      announcerData={vm.announcerData}
      onCloseAnnouncer={vm.closeAnnouncer}
      topbarLeft={<><span className="game-round-pill">Solo</span><span className="game-phase-pill">{phaseLabel(vm.phase)}</span></>}
      topbarCenter={<>현재 턴: {vm.activeSide === 'top' ? '위쪽 플레이어' : '아래쪽 플레이어'}</>}
      topbarRight={<><button onClick={() => navigate('/')} style={{ ...BTN_SM, background: '#1a2342' }}>나가기</button></>}
      topField={{
        field: vm.players.top.field,
        isOpponent: true,
        allowOpponentPlacement: vm.activeSide === 'top',
        isMyTurn: vm.activeSide === 'top',
        phase: vm.phase,
        selectedUid: vm.activeSide === 'top' ? vm.selectedFieldUid : null,
        canActUids: vm.canActTop,
        onCardClick: (card) => vm.handleFieldClick(card, vm.activeSide !== 'top'),
        placingCard: vm.phase === 'placement' && vm.activeSide === 'top' ? vm.selectedHandCard : null,
        onPlaceClick: vm.placeCard,
      }}
      bottomField={{
        field: vm.players.bottom.field,
        isOpponent: false,
        isMyTurn: vm.activeSide === 'bottom',
        phase: vm.phase,
        selectedUid: vm.activeSide === 'bottom' ? vm.selectedFieldUid : null,
        canActUids: vm.canActBottom,
        onCardClick: (card) => vm.handleFieldClick(card, vm.activeSide === 'top'),
        placingCard: vm.phase === 'placement' ? vm.selectedHandCard : null,
        onPlaceClick: vm.placeCard,
      }}
      midlineDotActive={false}
      contextPanel={<SoloContextPanel show={vm.showContextPanel} phase={vm.phase} selectedMulligan={vm.selectedMulligan} onConfirmMulligan={vm.confirmMulligan} selectedFieldName={vm.selectedMyFieldCard?.name} fieldSkills={vm.fieldSkills} actionMode={vm.actionMode} onPrepareSkill={vm.prepareSkill} onCancelSkillSelection={() => vm.setActionMode(null)} onEndPlacement={vm.endPlacement} />}
      handCards={vm.activePlayer.hand}
      isHandSelected={(index) => vm.phase === 'mulligan' ? vm.selectedMulligan.includes(index) : vm.selectedHandIdx === index}
      onHandClick={vm.handleHandClick}
      bottomMeta={<>패: {vm.activePlayer.hand.length}장 · 덱: {vm.activePlayer.drawPile.length}장</>}
      bottomActions={
          <>
              {vm.phase !== 'mulligan' && (
                  <button className="game-endturn" onClick={vm.handleEndMainButton}>
                      {vm.phase === 'placement' ? '배치 완료' : vm.phase === 'action' ? '턴 종료' : '대기'}
                  </button>
              )}
          </>
      }
      detailCard={vm.detailCard}
      onCloseDetail={() => vm.setDetailCard(null)}
    />
  );
};

export default SoloGamePage;
