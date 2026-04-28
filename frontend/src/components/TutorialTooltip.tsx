import React from 'react';
import './TutorialTooltip.css';

export type TutorialTooltipData = {
  speaker?: string;
  portraitSrc?: string;
  text: string;
};

type TutorialTooltipProps = {
  tooltip: TutorialTooltipData | null;
  onRead: () => void;
};

const TutorialTooltip: React.FC<TutorialTooltipProps> = ({ tooltip, onRead }) => {
  if (!tooltip) return null;

  return (
    <div className="tutorial-tooltip-layer" role="dialog" aria-modal="true" onClick={onRead}>
      <section className="tutorial-tooltip-panel" aria-label="튜토리얼 설명">
        {tooltip.portraitSrc ? (
          <img className="tutorial-tooltip-portrait" src={tooltip.portraitSrc} alt="" />
        ) : (
          <div className="tutorial-tooltip-portrait fallback" aria-hidden="true">?</div>
        )}
        <div className="tutorial-tooltip-copy">
          {tooltip.speaker && <div className="tutorial-tooltip-speaker">{tooltip.speaker}</div>}
          <div className="tutorial-tooltip-text">{tooltip.text}</div>
          <div className="tutorial-tooltip-hint">화면을 클릭해 계속</div>
        </div>
      </section>
    </div>
  );
};

export default TutorialTooltip;
