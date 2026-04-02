import React from 'react';
import { BTN_SM, roleClass, roleLabel } from '../utils/ui';

export type FieldSkill = {
  key: string;
  name: string;
  onCooldown: boolean;
  cdLeft: number;
};

export type PendingPassive = any;
export type PendingSpellChoice = any;
export type PendingColumnChoice = {
  source: 'skill' | 'spell';
  heroKey?: string;
  skillKey?: string;
  skillName: string;
} | null;

export type ColumnPreview = {
  key: string;
  label: string;
  repUid: string;
  names: string[];
};

export interface OnlineContextPanelProps {
  show: boolean;
  phase: string;
  mulliganDone: boolean;
  selectedMulligan: number[];
  onRunMulligan: () => void;
  onSkipMulligan: () => void;

  selectedFieldName?: string;
  selectedHeroKey?: string;
  selectedChargeLevel?: number;
  fieldSkills: FieldSkill[];
  actionMode: string | null;
  onPrepareSkill: (skillKey: string) => void;
  onCancelSkillSelection: () => void;

  columnChoice: PendingColumnChoice;
  enemyColumns: ColumnPreview[];
  onSelectColumn: (repUid: string, label: string) => void;
  onCancelColumnChoice: () => void;

  pendingSpell: string | null;
  pendingSpellName: string | null;
  duplicateTargetZone: 'main' | 'side';
  onSelectDuplicateTargetZone: (zone: 'main' | 'side') => void;
  onCancelPendingSpell: () => void;

  selectedHandSpellName?: string | null;
  onUseSelectedSpell: () => void;
  onCancelSelectedHand: () => void;

  pendingPassive: PendingPassive;
  onResolveMercy: (trashIndex: number) => void;
  onSkipMercy: () => void;
  onSkipJetpackCat: () => void;

  pendingSpellChoice: PendingSpellChoice;
  onResolveSpellChoice: (index: number, mode: 'trash' | 'draw') => void;
}

const OnlineContextPanel: React.FC<OnlineContextPanelProps> = ({
  show,
  phase,
  mulliganDone,
  selectedMulligan,
  onRunMulligan,
  onSkipMulligan,
  selectedFieldName,
  selectedHeroKey,
  selectedChargeLevel,
  fieldSkills,
  actionMode,
  onPrepareSkill,
  onCancelSkillSelection,
  columnChoice,
  enemyColumns,
  onSelectColumn,
  onCancelColumnChoice,
  pendingSpell,
  pendingSpellName,
  duplicateTargetZone,
  onSelectDuplicateTargetZone,
  onCancelPendingSpell,
  selectedHandSpellName,
  onUseSelectedSpell,
  onCancelSelectedHand,
  pendingPassive,
  onResolveMercy,
  onSkipMercy,
  onSkipJetpackCat,
  pendingSpellChoice,
  onResolveSpellChoice,
}) => {
  if (!show) return null;

  return (
    <div className="game-context-stack">
      {phase === 'mulligan' && !mulliganDone && (
        <div className="game-context-panel">
          <div className="game-context-head">
            <span className="game-toolbar-title">멀리건 선택</span>
            <span className="game-context-subtext">
              {selectedMulligan.length > 0 ? '선택 카드 1장 멀리건' : '카드를 눌러 1장씩 멀리건'}
            </span>
          </div>
          <div className="game-context-actions">
            <button style={BTN_SM} onClick={onRunMulligan} disabled={selectedMulligan.length === 0}>멀리건 실행</button>
            <button style={{ ...BTN_SM, background: '#1a2342' }} onClick={onSkipMulligan}>스킵</button>
          </div>
        </div>
      )}

      {fieldSkills.length > 0 && (
        <div className="game-context-panel">
          <div className="game-context-head game-context-head-wrap">
            <span className="game-toolbar-title">{selectedFieldName}</span>
            <span className="game-context-subtext">
              사용할 스킬을 고르세요
              {selectedHeroKey === 'sojourn' ? ` · 현재 차징 ${selectedChargeLevel ?? 0}/3` : ''}
            </span>
          </div>
          <div className="game-context-actions game-context-actions-wrap">
            {fieldSkills.map((skill) => (
              <button
                key={skill.key}
                disabled={skill.onCooldown}
                onClick={() => onPrepareSkill(skill.key)}
                style={{
                  ...BTN_SM,
                  opacity: skill.onCooldown ? 0.4 : 1,
                  background: actionMode === skill.key ? '#ff9b3040' : '#243055',
                  border: actionMode === skill.key ? '1px solid #ff9b30' : '1px solid #3a4a78',
                }}
              >
                ✦ {skill.name}{skill.onCooldown ? ` (${skill.cdLeft}턴)` : ''}
              </button>
            ))}
            <button onClick={onCancelSkillSelection} style={{ ...BTN_SM, background: '#1a2342' }}>취소</button>
          </div>
          {actionMode && actionMode !== 'spell' && <div className="game-context-subtext">→ 아군 또는 상대 카드를 클릭</div>}
        </div>
      )}

      {columnChoice && (
        <div className="game-context-panel mercy-panel">
          <div className="game-context-head game-context-head-wrap">
            <span className="game-toolbar-title">{columnChoice.skillName} 열 선택</span>
            <span className="game-context-subtext">세로줄 단위로 적용됩니다. 원하는 열을 선택하세요.</span>
          </div>

          {enemyColumns.length > 0 ? (
            <div className="mercy-choice-grid">
              {enemyColumns.map((col) => (
                <button key={col.key} className="mercy-choice-card spell" onClick={() => onSelectColumn(col.repUid, col.label)}>
                  <span className="mercy-choice-name">{col.label}</span>
                  <span className="mercy-choice-role spell">{col.names.join(' · ')}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="game-context-subtext">선택할 수 있는 적 열이 없습니다.</div>
          )}

          <div className="game-context-actions">
            <button onClick={onCancelColumnChoice} style={{ ...BTN_SM, background: '#1a2342' }}>취소</button>
          </div>
        </div>
      )}

      {actionMode === 'spell' && pendingSpell && (
        <div className="game-context-panel">
          <div className="game-context-head">
            <span className="game-toolbar-title">{pendingSpellName || '스킬 카드'} 대상 선택</span>
            <span className="game-context-subtext">
              {pendingSpell === 'spell_duplicate' ? '→ 대상 카드 클릭 + 복제 배치 위치 선택' : '→ 적용할 카드를 클릭'}
            </span>
          </div>
          {pendingSpell === 'spell_duplicate' && (
              <div className="game-context-actions game-context-actions-wrap">
                <button
                    onClick={() => onSelectDuplicateTargetZone('main')}
                    style={{
                      ...BTN_SM,
                      background: duplicateTargetZone === 'main' ? '#ff9b3040' : '#243055',
                      border: duplicateTargetZone === 'main' ? '1px solid #ff9b30' : '1px solid #3a4a78',
                    }}
                >
                  본대에 배치
                </button>
                <button
                    onClick={() => onSelectDuplicateTargetZone('side')}
                    style={{
                      ...BTN_SM,
                      background: duplicateTargetZone === 'side' ? '#ff9b3040' : '#243055',
                      border: duplicateTargetZone === 'side' ? '1px solid #ff9b30' : '1px solid #3a4a78',
                    }}
                >
                  사이드에 배치
                </button>
              </div>
          )}
          <div className="game-context-actions">
            <button onClick={onCancelPendingSpell} style={{ ...BTN_SM, background: '#1a2342' }}>취소</button>
          </div>
        </div>
      )}

      {pendingSpellChoice?.type === 'spell_rescue_select' && (
        <div className="game-context-panel mercy-panel">
          <div className="game-context-head game-context-head-wrap">
            <span className="game-toolbar-title">구원의 손길</span>
            <span className="game-context-subtext">TRASH에서 가져올 카드를 하나 선택하세요.</span>
          </div>
          {(pendingSpellChoice.options || []).length > 0 ? (
            <div className="mercy-choice-grid">
              {(pendingSpellChoice.options || []).map((opt: any) => (
                <button key={`trash-${opt.index}`} className={`mercy-choice-card ${roleClass(opt.is_spell ? 'spell' : opt.role)}`} onClick={() => onResolveSpellChoice(opt.index, 'trash')}>
                  <span className="mercy-choice-name">{opt.name}</span>
                  <span className={`mercy-choice-role ${roleClass(opt.is_spell ? 'spell' : opt.role)}`}>{roleLabel(opt.is_spell ? 'spell' : opt.role)}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="game-context-subtext">TRASH에 가져올 카드가 없습니다.</div>
          )}
        </div>
      )}

      {pendingSpellChoice?.type === 'spell_maximilian_select' && (
        <div className="game-context-panel mercy-panel">
          <div className="game-context-head game-context-head-wrap">
            <span className="game-toolbar-title">막시밀리앙</span>
            <span className="game-context-subtext">덱에서 가져올 카드를 하나 선택하세요.</span>
          </div>
          {(pendingSpellChoice.options || []).length > 0 ? (
            <div className="mercy-choice-grid">
              {(pendingSpellChoice.options || []).map((opt: any) => (
                <button key={`draw-${opt.index}`} className={`mercy-choice-card ${roleClass(opt.is_spell ? 'spell' : opt.role)}`} onClick={() => onResolveSpellChoice(opt.index, 'draw')}>
                  <span className="mercy-choice-name">{opt.name}</span>
                  <span className={`mercy-choice-role ${roleClass(opt.is_spell ? 'spell' : opt.role)}`}>{roleLabel(opt.is_spell ? 'spell' : opt.role)}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="game-context-subtext">덱에 가져올 카드가 없습니다.</div>
          )}
        </div>
      )}

      {phase === 'placement' && selectedHandSpellName && !pendingSpell && (
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

      {pendingPassive?.type === 'mercy_resurrect' && (
        <div className="game-context-panel mercy-panel">
          <div className="game-context-head game-context-head-wrap">
            <span className="game-toolbar-title">메르시 부활 대상 선택</span>
            <span className="game-context-subtext">트래시에서 한 장을 선택하면 자동으로 배치 가능한 줄에 소생합니다.</span>
          </div>
          {(pendingPassive.options || []).length > 0 ? (
            <div className="mercy-choice-grid">
              {(pendingPassive.options || []).map((opt: any) => (
                <button key={opt.index} className={`mercy-choice-card ${roleClass(opt.role)}`} onClick={() => onResolveMercy(opt.index)}>
                  <span className="mercy-choice-name">{opt.name}</span>
                  <span className={`mercy-choice-role ${roleClass(opt.role)}`}>{roleLabel(opt.role)}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="game-context-subtext">부활 가능한 트래시 카드가 없습니다.</div>
          )}
          <div className="game-context-actions">
            <button onClick={onSkipMercy} style={{ ...BTN_SM, background: '#1a2342' }}>건너뛰기</button>
          </div>
        </div>
      )}

      {pendingPassive?.type === 'jetpack_cat_extra_place' && (
        <div className="game-context-panel">
          <div className="game-context-head game-context-head-wrap">
            <span className="game-toolbar-title">제트팩 캣 추가 배치</span>
            <span className="game-context-subtext">손패 영웅 카드를 고른 뒤 빈 자리를 눌러 추가 배치하세요.</span>
          </div>
          <div className="game-context-actions">
            <button onClick={onSkipJetpackCat} style={{ ...BTN_SM, background: '#1a2342' }}>건너뛰기</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default OnlineContextPanel;
