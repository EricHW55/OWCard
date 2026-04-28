import React from 'react';
import { soundManager } from '../utils/soundManager';
import './SettingsModal.css';

type SettingsModalProps = {
  open: boolean;
  onClose: () => void;
};

const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

const SettingsModal: React.FC<SettingsModalProps> = ({ open, onClose }) => {
  const [bgmVolume, setBgmVolume] = React.useState(() => soundManager.getVolumeSettings().bgmVolume);
  const [placementVolume, setPlacementVolume] = React.useState(() => soundManager.getVolumeSettings().placementVolume);

  React.useEffect(() => {
    if (!open) return;
    const settings = soundManager.getVolumeSettings();
    setBgmVolume(settings.bgmVolume);
    setPlacementVolume(settings.placementVolume);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const updateBgmVolume = (value: number) => {
    setBgmVolume(value);
    soundManager.setBgmVolume(value);
  };

  const updatePlacementVolume = (value: number) => {
    setPlacementVolume(value);
    soundManager.setPlacementVolume(value);
  };

  return (
    <div className="settings-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="settings-modal-title" onMouseDown={onClose}>
      <section className="settings-modal" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="settings-modal-close" onClick={onClose} aria-label="설정 닫기">
          x
        </button>
        <header className="settings-modal-header">
          <h2 id="settings-modal-title">설정</h2>
        </header>

        <div className="settings-control-list">
          <label className="settings-volume-control">
            <span className="settings-volume-label">
              <span>배경음악</span>
              <span>{formatPercent(bgmVolume)}</span>
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={bgmVolume}
              onChange={(event) => updateBgmVolume(Number(event.target.value))}
              aria-label="배경음악 볼륨"
            />
          </label>

          <label className="settings-volume-control">
            <span className="settings-volume-label">
              <span>배치음</span>
              <span>{formatPercent(placementVolume)}</span>
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={placementVolume}
              onChange={(event) => updatePlacementVolume(Number(event.target.value))}
              aria-label="배치음 볼륨"
            />
          </label>
        </div>
      </section>
    </div>
  );
};

export default SettingsModal;
