import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import GameScreen from '../components/GameScreen';
import OnlineContextPanel from '../components/OnlineContextPanel';
import useOnlineGameController from '../controllers/useOnlineGameController';
import { BTN_SM, phaseLabel } from '../utils/ui';
import './GamePage.css';

const GamePage: React.FC = () => {
  const { gameId = '' } = useParams();
  const navigate = useNavigate();
  const vm = useOnlineGameController(gameId);

  if (!vm.session) {
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
      <div key="reconnect" className="game-reconnect-banner">네트워크가 잠깐 끊겼어요. 자동 재연결 중입니다.</div>
    ) : null,
    vm.pendingPassive ? (
      <div key="passive" className="game-passive-banner">패시브 선택 대기 중: {vm.pendingPassive.type === 'mercy_resurrect' ? '메르시 부활' : vm.pendingPassive.type}</div>
    ) : null,
    vm.pendingSpellChoice ? (
      <div key="spell-choice" className="game-passive-banner">스킬 카드 선택 대기 중: {vm.pendingSpellChoice.title || vm.pendingSpellChoice.hero_key || vm.pendingSpellChoice.type}</div>
    ) : null,
  ].filter(Boolean) as React.ReactNode[];

  return (
    <GameScreen
      announcerData={vm.announcerData}
      onCloseAnnouncer={vm.closeAnnouncer}
      topbarLeft={
        <>
          <span className="game-round-pill">R{vm.gs.round} · T{vm.gs.turn}</span>
          <span className="game-phase-pill">{phaseLabel(vm.phase)}</span>
        </>
      }
      topbarCenter={<>상대 패:{vm.opp.hand_count} · 덱:{vm.opp.draw_pile_count}</>}
      topbarRight={
        <>
          <div className={`game-turn-indicator ${vm.isMyTurn ? 'mine' : 'theirs'}`}>{vm.isMyTurn ? '● 내 턴' : '○ 상대 턴'}</div>
          <div className={`game-conn-badge ${vm.connected ? 'ok' : vm.reconnecting ? 'retry' : 'off'}`}>{vm.connected ? '연결됨' : vm.reconnecting ? '재연결 중…' : '오프라인'}</div>
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
        placingCard: null,
        onPlaceClick: () => {},
      }}
      bottomField={{
        field: vm.my.field,
        isOpponent: false,
        isMyTurn: vm.isMyTurn,
        phase: vm.phase,
        selectedUid: vm.selectedFieldUid,
        canActUids: vm.canActUids,
        onCardClick: (card) => vm.handleFieldClick(card, false),
        placingCard: vm.phase === 'placement' && vm.isMyTurn && vm.selectedHandCard && !vm.selectedHandCard.is_spell ? vm.selectedHandCard : null,
        onPlaceClick: vm.handlePlace,
      }}
      contextPanel={
        <OnlineContextPanel
          show={vm.showContextPanel}
          phase={vm.phase}
          mulliganDone={vm.my.mulligan_done}
          selectedMulligan={vm.selectedMulligan}
          onRunMulligan={vm.runMulligan}
          onSkipMulligan={vm.skipMulligan}
          selectedFieldName={vm.selectedMyFieldCard?.name}
          selectedHeroKey={vm.selectedHeroKey}
          selectedChargeLevel={vm.selectedChargeLevel}
          fieldSkills={vm.fieldSkills}
          actionMode={vm.actionMode}
          onPrepareSkill={vm.prepareSkill}
          onCancelSkillSelection={() => { vm.setSelectedFieldUid(null); vm.setActionMode(null); vm.setColumnChoice(null); }}
          columnChoice={vm.columnChoice}
          enemyColumns={vm.enemyColumns}
          onSelectColumn={vm.selectColumn}
          onCancelColumnChoice={vm.cancelColumnChoice}
          pendingSpell={vm.pendingSpell}
          pendingSpellName={vm.pendingSpellName}
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
      handCards={vm.my.hand}
      isHandSelected={(index) => vm.phase === 'mulligan' ? vm.selectedMulligan.includes(index) : vm.selectedHandIdx === index}
      onHandClick={vm.handleHandClick}
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
      detailCard={vm.detailCard}
      onCloseDetail={() => vm.setDetailCard(null)}
    />
  );
};

export default GamePage;
