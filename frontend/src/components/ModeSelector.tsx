import './ModeSelector.css';

type Mode = 'manual' | 'auto';

interface ModeSelectorProps {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  isPollingActive: boolean;
  onConfigClick?: () => void;
}

export function ModeSelector({
  mode,
  onModeChange,
  isPollingActive,
  onConfigClick,
}: ModeSelectorProps) {
  return (
    <div className="mode-selector">
      <div className="mode-selector-label">Mode:</div>
      <div className="mode-selector-buttons">
        <button
          className={`mode-button ${mode === 'manual' ? 'active' : ''}`}
          onClick={() => onModeChange('manual')}
          disabled={mode === 'manual'}
        >
          Manual
        </button>
        <button
          className={`mode-button ${mode === 'auto' ? 'active' : ''}`}
          onClick={() => onModeChange('auto')}
          disabled={mode === 'auto'}
        >
          Auto
        </button>
      </div>
      {mode === 'auto' && (
        <div className="mode-status">
          <span className={`status-indicator ${isPollingActive ? 'active' : 'inactive'}`}></span>
          <span className="status-text">
            {isPollingActive ? 'Polling Active' : 'Polling Inactive'}
          </span>
        </div>
      )}
      {/* Config button hidden for now */}
      {false && (
        <button
          className="config-button"
          onClick={onConfigClick}
          title="Edit polling configuration"
        >
          Config
        </button>
      )}
    </div>
  );
}
