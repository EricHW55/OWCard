import React from 'react';
import { BTN_SM } from '../utils/ui';

type FieldSkill = {
  key: string;
  name: string;
};

interface Props {
  show: boolean;
  phase: 'mulligan' | 'placement' | 'action' | 'game_over';
  selectedMulligan: number[];
  onConfirmMulligan: () => void;
  selectedFieldName?: string;
  fieldSkills: FieldSkill[];
  actionMode: string | null;
  onPrepareSkill: (skillKey: string) => void;
  onCancelSkillSelection: () => void;
  onEndPlacement: () => void;
}

const SoloContextPanel: React.FC<Props> = ({
  show,
  phase,
  selectedMulligan,
  onConfirmMulligan,
  selectedFieldName,
  fieldSkills,
  actionMode,
  onPrepareSkill,
  onCancelSkillSelection,
  onEndPlacement,
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
            <button style={BTN_SM} onClick={onConfirmMulligan}>멀리건 실행</button>
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
                    style={{
                      ...BTN_SM,
                      background: actionMode === skill.key ? '#ff9b3040' : BTN_SM.background,
                      border: actionMode === skill.key ? '1px solid #ff9b30' : BTN_SM.border,
                    }}
                    onClick={() => onPrepareSkill(skill.key)}
                >
                ✦ {skill.name}
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
    </div>
  );
};

export default SoloContextPanel;
