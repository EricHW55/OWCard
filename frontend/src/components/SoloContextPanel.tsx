import React from 'react';
import { BTN_SM } from '../utils/ui';
import type { OnlineContextPanelProps } from './OnlineContextPanel';

type Props = Pick<
    OnlineContextPanelProps,
    | 'show'
    | 'phase'
    | 'selectedMulligan'
    | 'isMulliganAnimating'
    | 'onRunMulligan'
    | 'onSkipMulligan'
    | 'selectedFieldName'
    | 'fieldSkills'
    | 'actionMode'
    | 'onPrepareSkill'
    | 'onCancelSkillSelection'
    | 'selectedHandSpellName'
    | 'onUseSelectedSpell'
    | 'onCancelSelectedHand'
    | 'onCancelPendingSpell'
> & {
    show: boolean;
    phase: 'mulligan' | 'placement' | 'action' | 'game_over';
    onEndPlacement: () => void;
}

const SoloContextPanel: React.FC<Props> = ({
  show,
  phase,
  selectedMulligan,
  isMulliganAnimating = false,
  onRunMulligan,
  onSkipMulligan,
  selectedFieldName,
  fieldSkills,
  actionMode,
  onPrepareSkill,
  onCancelSkillSelection,
  onEndPlacement,
  selectedHandSpellName,
  onUseSelectedSpell,
  onCancelSelectedHand,
  onCancelPendingSpell,
  }) => {
    if (!show) return null;

  return (
    <div className="game-context-stack">
      {phase === 'mulligan' && (
        <div className="game-context-panel">
          <div className="game-context-head">
            <span className="game-toolbar-title">멀리건 선택</span>
            <span className="game-context-subtext">선택 {selectedMulligan.length}/2</span>
          </div>
          <div className="game-context-actions">
            <button style={BTN_SM} onClick={onRunMulligan} disabled={isMulliganAnimating}>멀리건 실행</button>
            <button style={{ ...BTN_SM, background: '#1a2342' }} onClick={onSkipMulligan}>스킵</button>
          </div>
        </div>
      )}

      {fieldSkills.length > 0 && (
        <div className="game-context-panel">
          <div className="game-context-head game-context-head-wrap">
            <span className="game-toolbar-title">{selectedFieldName}</span>
            <span className="game-context-subtext">사용할 스킬 선택</span>
          </div>
          <div className="game-context-actions game-context-actions-wrap">
            {fieldSkills.map((skill) => (
                <button
                    key={skill.key}
                    className={`skill-choice-chip ${actionMode === skill.key ? 'selected' : ''}`}
                    style={{ ...BTN_SM }}
                    onClick={() => onPrepareSkill(skill.key)}
                >
                  <span className="skill-choice-chip-name">✦ {skill.name}</span>
                  <span className="skill-choice-chip-meta">탭해서 사용 준비</span>
              </button>
            ))}
            <button style={{ ...BTN_SM, background: '#1a2342' }} onClick={onCancelSkillSelection}>취소</button>
          </div>
          {actionMode && <div className="game-context-subtext">→ 대상 카드를 클릭하세요</div>}
        </div>
      )}

      {phase === 'placement' && (
        <div className="game-context-panel">
          <div className="game-context-head">
            <span className="game-toolbar-title">배치 단계</span>
            <span className="game-context-subtext">카드를 모두 놓았으면 배치 종료</span>
          </div>
          <div className="game-context-actions">
            <button style={BTN_SM} onClick={onEndPlacement}>배치 종료</button>
          </div>
        </div>
      )}

      {phase === 'placement' && selectedHandSpellName && actionMode !== 'spell' && (
          <div className="game-context-panel">
            <div className="game-context-head">
              <span className="game-toolbar-title">{selectedHandSpellName}</span>
              <span className="game-context-subtext">스킬 카드를 바로 사용합니다</span>
            </div>
            <div className="game-context-actions">
              <button onClick={onUseSelectedSpell} style={BTN_SM}>✦ 스킬 카드 사용</button>
              <button onClick={onCancelSelectedHand} style={{ ...BTN_SM, background: '#1a2342' }}>취소</button>
            </div>
          </div>
      )}

      {phase === 'placement' && actionMode === 'spell' && (
          <div className="game-context-panel">
            <div className="game-context-head">
              <span className="game-toolbar-title">스킬 카드 대상 선택</span>
              <span className="game-context-subtext">→ 아군 또는 상대 카드를 클릭</span>
            </div>
            <div className="game-context-actions">
              <button onClick={onCancelPendingSpell} style={{ ...BTN_SM, background: '#1a2342' }}>취소</button>
            </div>
          </div>
      )}
    </div>
  );
};

export default SoloContextPanel;
