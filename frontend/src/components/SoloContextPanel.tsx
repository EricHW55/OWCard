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
  onUseSkill: (skillKey: string) => void;
  onEndPlacement: () => void;
}

const SoloContextPanel: React.FC<Props> = ({
  show,
  phase,
  selectedMulligan,
  onConfirmMulligan,
  selectedFieldName,
  fieldSkills,
  onUseSkill,
  onEndPlacement,
}) => {
  if (!show) return null;

  return (
    <div className="game-context-stack">
      {phase === 'mulligan' && (
        <div className="game-context-panel">
          <div className="game-context-head">
            <span className="game-toolbar-title">멀리건 선택</span>
            <span className="game-context-subtext">선택 {selectedMulligan.length}</span>
          </div>
          <div className="game-context-actions">
            <button style={BTN_SM} onClick={onConfirmMulligan}>멀리건 확정</button>
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
              <button key={skill.key} style={BTN_SM} onClick={() => onUseSkill(skill.key)}>
                ✦ {skill.name}
              </button>
            ))}
          </div>
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
