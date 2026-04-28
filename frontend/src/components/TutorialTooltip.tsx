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
  const [visibleLength, setVisibleLength] = React.useState(0);
  const text = tooltip?.text || '';
  const isTyping = !!tooltip && visibleLength < text.length;

  React.useEffect(() => {
    setVisibleLength(0);
  }, [text]);

  React.useEffect(() => {
    if (!tooltip || !isTyping) return;
    const timerId = window.setTimeout(() => {
      setVisibleLength((prev) => Math.min(text.length, prev + 1));
    }, 18);
    return () => window.clearTimeout(timerId);
  }, [isTyping, text, tooltip, visibleLength]);

  if (!tooltip) return null;

  const handleClick = () => {
    if (isTyping) {
      setVisibleLength(text.length);
      return;
    }
    onRead();
  };

  return (
    <div className="tutorial-tooltip-layer" role="dialog" aria-modal="true" onClick={handleClick}>
      <section className="tutorial-tooltip-panel" aria-label="튜토리얼 설명">
        {tooltip.portraitSrc ? (
          <img className="tutorial-tooltip-portrait" src={tooltip.portraitSrc} alt="" />
        ) : (
          <div className="tutorial-tooltip-portrait fallback" aria-hidden="true">?</div>
        )}
        <div className="tutorial-tooltip-copy">
          {tooltip.speaker && <div className="tutorial-tooltip-speaker">{tooltip.speaker}</div>}
          <div className="tutorial-tooltip-text">
            {text.slice(0, visibleLength)}
            {isTyping && <span className="tutorial-tooltip-caret" aria-hidden="true" />}
          </div>
          <div className="tutorial-tooltip-hint">{isTyping ? '클릭해 문장 표시' : '화면을 클릭해 계속'}</div>
        </div>
      </section>
    </div>
  );
};

export default TutorialTooltip;
