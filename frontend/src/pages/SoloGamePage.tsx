import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import GameScreen from '../components/GameScreen';
import OnlineContextPanel from '../components/OnlineContextPanel';
import useSoloGameController from '../controllers/useSoloGameController';
import { BTN_SM, phaseLabel } from '../utils/ui';
import { getCardArtCandidates, getCardImageSrc } from '../utils/heroImage';
import './GamePage.css';
import './SoloGamePage.css';

const SoloGamePage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const soloDeckParams = React.useMemo(() => {
    const query = new URLSearchParams(location.search);
    const bottomDeckId = Number(query.get('bottomDeckId') || 0) || null;
    const topDeckId = Number(query.get('topDeckId') || 0) || null;
    return { bottomDeckId, topDeckId };
  }, [location.search]);
  const vm = useSoloGameController(soloDeckParams);

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
      topbarCenter={<>현재 턴 {vm.activeSide === 'top' ? '위쪽 플레이어' : '아래쪽 플레이어'}</>}
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
        onCardLongPress: (card) => vm.setDetailCard(card),
        cardEffects: vm.cardEffects,
        placingCard: vm.phase === 'placement' && vm.activeSide === 'top' && vm.selectedHandCard && !vm.selectedHandCard.is_spell ? vm.selectedHandCard : null,
        onPlaceClick: vm.placeCard,
        canSelectEmptySlot: vm.canSelectEmptySlot,
        onEmptySlotSelect: vm.handleEmptySlotSelect,
      }}
      bottomField={{
        field: vm.players.bottom.field,
        isOpponent: false,
        isMyTurn: vm.activeSide === 'bottom',
        phase: vm.phase,
        selectedUid: vm.activeSide === 'bottom' ? vm.selectedFieldUid : null,
        canActUids: vm.canActBottom,
        onCardClick: (card) => vm.handleFieldClick(card, vm.activeSide === 'top'),
        onCardLongPress: (card) => vm.setDetailCard(card),
        cardEffects: vm.cardEffects,
        placingCard: vm.phase === 'placement' && vm.selectedHandCard && !vm.selectedHandCard.is_spell ? vm.selectedHandCard : null,
        onPlaceClick: vm.placeCard,
        canSelectEmptySlot: vm.canSelectEmptySlot,
        onEmptySlotSelect: vm.handleEmptySlotSelect,
      }}
      midlineDotActive={false}
      contextPanel={
        <OnlineContextPanel
          show={vm.showContextPanel}
          phase={vm.phase}
          mulliganDone={!!vm.activePlayer?.mulliganDone}
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
          onCancelSkillSelection={() => vm.setActionMode(null)}
          columnChoice={vm.columnChoice}
          enemyColumns={vm.enemyColumns}
          onSelectColumn={vm.selectColumn}
          onCancelColumnChoice={vm.cancelColumnChoice}
          pendingSpell={vm.pendingSpell || vm.pendingSpellCard?.hero_key || null}
          pendingSpellName={vm.pendingSpellName || vm.pendingSpellCard?.name || null}
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
      }
      handCards={vm.activePlayer.hand}
      handOwnerKey={`solo-${vm.activeSide}`}
      mulliganAnimatingIndex={vm.mulliganAnimatingIndex}
      mulliganCinematicCard={vm.mulliganCinematicCard}
      mulliganReplacementCard={vm.mulliganReplacementCard}
      isMulliganCinematicActive={vm.isMulliganCinematicActive}
      onMulliganCinematicComplete={vm.completeMulliganCinematic}
      isHandSelected={(index) => vm.phase === 'mulligan' ? vm.selectedMulligan.includes(index) : vm.selectedHandIdx === index}
      onHandClick={vm.handleHandClick}
      bottomMeta={<>손패 {vm.activePlayer.hand.length}장 · 덱 {vm.activePlayer.drawPile.length}장</>}
      bottomActions={
        <>
          {vm.phase === 'placement' && (
            <span className="game-placement-meta">
              배치 {vm.activePlayer.placementUsed}/{vm.activePlayer.placementLimit}
            </span>
          )}
          {vm.phase !== 'mulligan' && (
            <button className="game-endturn" onClick={vm.handleEndMainButton}>
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
  );
};

export default SoloGamePage;
