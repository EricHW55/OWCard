import React from 'react';
import { useNavigate } from 'react-router-dom';
import GameScreen from '../components/GameScreen';
import OnlineContextPanel from '../components/OnlineContextPanel';
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
        placingCard: vm.phase === 'placement' && vm.activeSide === 'top' && vm.selectedHandCard && !vm.selectedHandCard.is_spell ? vm.selectedHandCard : null,
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
        placingCard: vm.phase === 'placement' && vm.selectedHandCard && !vm.selectedHandCard.is_spell ? vm.selectedHandCard : null,
        onPlaceClick: vm.placeCard,
      }}
      midlineDotActive={false}
      contextPanel={
          <OnlineContextPanel
              show={vm.showContextPanel}
              phase={vm.phase}
              mulliganDone={!!vm.activePlayer?.mulliganDone}
              selectedMulligan={vm.selectedMulligan}
              onRunMulligan={vm.runMulligan}
              onSkipMulligan={vm.skipMulligan}
              selectedFieldName={vm.selectedMyFieldCard?.name}
              selectedHeroKey={vm.selectedHeroKey}
              selectedChargeLevel={vm.selectedChargeLevel}
              fieldSkills={vm.fieldSkills}
              actionMode={vm.actionMode}
              onPrepareSkill={vm.prepareSkill}
              onCancelSkillSelection={() => vm.setActionMode(null)}
              columnChoice={null}
              enemyColumns={[]}
              onSelectColumn={() => {}}
              onCancelColumnChoice={() => {}}
              pendingSpell={vm.pendingSpellCard?.hero_key || null}
              pendingSpellName={vm.pendingSpellCard?.name || null}
              duplicateTargetName={null}
              onCancelPendingSpell={vm.cancelPendingSpell}
              selectedHandSpellName={vm.selectedHandCard?.is_spell ? vm.selectedHandCard.name : null}
              onUseSelectedSpell={vm.useSelectedSpell}
              onCancelSelectedHand={vm.cancelSelectedHand}
              pendingPassive={null}
              onResolveMercy={() => {}}
              onSkipMercy={() => {}}
              onSkipJetpackCat={() => {}}
              pendingSpellChoice={null}
              onResolveSpellChoice={() => {}}
          />
      }
      handCards={vm.activePlayer.hand}
      isHandSelected={(index) => vm.phase === 'mulligan' ? vm.selectedMulligan.includes(index) : vm.selectedHandIdx === index}
      onHandClick={vm.handleHandClick}
      bottomMeta={<>패: {vm.activePlayer.hand.length}장 · 덱: {vm.activePlayer.drawPile.length}장 · 배치 {vm.activePlayer.placementUsed}/2</>}
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
