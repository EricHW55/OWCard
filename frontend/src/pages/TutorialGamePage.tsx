import React from 'react';
import { useNavigate } from 'react-router-dom';
import GameScreen from '../components/GameScreen';
import OnlineContextPanel from '../components/OnlineContextPanel';
import TutorialTooltip from '../components/TutorialTooltip';
import useTutorialGameController from '../controllers/tutorialGameController/useTutorialGameController';
import { BTN_SM, phaseLabel } from '../utils/ui';
import './GamePage.css';
import './SoloGamePage.css';
import './TutorialGamePage.css';

const noop = () => {};

const TutorialGamePage: React.FC = () => {
  const navigate = useNavigate();
  const vm = useTutorialGameController();

  return (
    <GameScreen
      announcerData={null}
      onCloseAnnouncer={noop}
      topbarLeft={<><span className="game-round-pill">Tutorial</span><span className="game-phase-pill">{phaseLabel(vm.phase)}</span></>}
      topbarCenter={<>튜토리얼 {vm.round}턴</>}
      topbarRight={<button onClick={() => navigate('/')} style={{ ...BTN_SM, background: '#1a2342' }}>나가기</button>}
      banners={[
        <TutorialTooltip key="tutorial-tooltip" tooltip={vm.tooltip} onRead={vm.readTooltip} />,
      ]}
      topField={{
        field: vm.players.top.field,
        isOpponent: true,
        actionIsOpponent: true,
        allowOpponentPlacement: false,
        isMyTurn: false,
        phase: vm.phase,
        selectedUid: null,
        canActUids: vm.canActTop,
        onCardClick: (card) => vm.handleFieldClick(card, true),
        onCardLongPress: (card) => vm.setDetailCard(card),
        cardEffects: vm.cardEffects,
        placingCard: null,
        onPlaceClick: noop,
      }}
      bottomField={{
        field: vm.players.bottom.field,
        isOpponent: false,
        actionIsOpponent: false,
        isMyTurn: vm.activeSide === 'player',
        phase: vm.phase,
        selectedUid: vm.selectedFieldUid,
        canActUids: vm.canActBottom,
        onCardClick: (card) => vm.handleFieldClick(card, false),
        onCardLongPress: (card) => vm.setDetailCard(card),
        cardEffects: vm.cardEffects,
        placingCard: vm.phase === 'placement' && vm.selectedHandCard && !vm.selectedHandCard.is_spell ? vm.selectedHandCard : null,
        onPlaceClick: vm.handlePlace,
      }}
      contextPanel={
        <div className="tutorial-context-stack">
          {vm.expectedHint && (
            <div className="game-context-panel tutorial-hint-panel">
              <div className="game-context-head">
                <span className="game-toolbar-title">튜토리얼 목표</span>
                <span className="game-context-subtext">{vm.expectedHint}</span>
              </div>
            </div>
          )}
          <OnlineContextPanel
            show={vm.showContextPanel}
            phase={vm.phase}
            mulliganDone
            selectedMulligan={[]}
            onRunMulligan={noop}
            onSkipMulligan={noop}
            selectedFieldName={vm.selectedMyFieldCard?.name}
            selectedHeroKey={vm.selectedHeroKey}
            selectedFieldImageCandidates={vm.selectedFieldImageCandidates}
            fieldSkills={vm.fieldSkills}
            actionMode={vm.actionMode}
            actionModeLabel={vm.actionModeLabel}
            onPrepareSkill={vm.prepareSkill}
            onCancelSkillSelection={vm.cancelSkillSelection}
            columnChoice={null}
            enemyColumns={[]}
            onSelectColumn={noop}
            onCancelColumnChoice={noop}
            pendingSpell={null}
            pendingSpellName={null}
            onCancelPendingSpell={noop}
            selectedHandSpellName={vm.selectedHandCard?.is_spell ? vm.selectedHandCard.name : null}
            onUseSelectedSpell={vm.useSelectedSpell}
            onCancelSelectedHand={vm.cancelSelectedHand}
            pendingPassive={null}
            onResolveMercy={noop}
            onSkipMercy={noop}
            onSkipJetpackCat={noop}
            pendingSpellChoice={null}
            onResolveSpellChoice={noop}
          />
        </div>
      }
      handCards={vm.players.bottom.hand}
      handOwnerKey="tutorial-player"
      isHandSelected={(index) => vm.selectedHandIdx === index}
      onHandClick={vm.handleHandClick}
      bottomMeta={<>손패 {vm.players.bottom.hand.length}장</>}
      bottomActions={
        <>
          {vm.phase === 'placement' && (
            <span className="game-placement-meta">
              배치 {vm.players.bottom.placementUsed}/{vm.players.bottom.placementLimit}
            </span>
          )}
          {vm.phase !== 'game_over' && (
            <button className="game-endturn tutorial-endturn" onClick={vm.handleEndMainButton}>
              {vm.phase === 'placement' ? '배치 종료' : '턴 종료'}
            </button>
          )}
        </>
      }
      logs={vm.logs}
      detailCard={vm.detailCard}
      onCloseDetail={() => vm.setDetailCard(null)}
    />
  );
};

export default TutorialGamePage;
