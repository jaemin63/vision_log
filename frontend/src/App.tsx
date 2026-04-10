import { useState, useCallback, useEffect, useRef, useReducer } from 'react';
import './App.css';
import logoDN from './assets/DN_Solutions_logo.svg.png';
import logoFanuc from './assets/Fanuc_logo.svg.png';
import { ImageList } from './components/ImageList';
import { ImagePreview } from './components/ImagePreview';
import { ModeSelector } from './components/ModeSelector';
import { PollingConfigEditor } from './components/PollingConfigEditor';
import { ExhibitionViewer } from './components/ExhibitionViewer';
import { AnalysisStatsPanel } from './components/AnalysisStatsPanel';
import type { AnalysisStats } from './components/AnalysisStatsPanel';
import { useImageEvents } from './hooks/useImageEvents';
import type { ImageEvent } from './hooks/useImageEvents';
import type { ImageMetadata } from './types/image';
import { api, getApiBaseUrl } from './services/api';

type Mode = 'manual' | 'auto';
type Screen = 'viewer' | 'exhibition';

type ImageState = { previous: ImageMetadata | null; current: ImageMetadata | null };
type ImageAction =
  | { type: 'shift'; newImage: ImageMetadata }   // current → previous, newImage → current
  | { type: 'setCurrent'; image: ImageMetadata | null }; // manual select (previous 유지)

function imageReducer(state: ImageState, action: ImageAction): ImageState {
  switch (action.type) {
    case 'shift':
      // 동일 파일명이 중복으로 오면 무시 (같은 이벤트 두 번 수신 방지)
      if (state.current?.filename === action.newImage.filename) return state;
      return { previous: state.current, current: action.newImage };
    case 'setCurrent':
      return { ...state, current: action.image };
    default:
      return state;
  }
}

function getRobotStatusTone(statusValue: number | undefined): 'idle' | 'active' | 'done' | 'error' {
  if (statusValue === 9) return 'error';
  if (statusValue === 4) return 'done';
  if (statusValue === 0 || statusValue === undefined) return 'idle';
  return 'active';
}

function renderRobotStatusMessage(message: string) {
  const highlightTargets = [
    '빈 피킹 프로그램 자동 생성',
    'Bin Picking with Auto Path Generation',
  ];

  for (const target of highlightTargets) {
    if (!message.includes(target)) continue;

    const [before, ...rest] = message.split(target);
    return (
      <>
        {before}
        <span className="robot-status-highlight">{target}</span>
        {rest.join(target)}
      </>
    );
  }

  return message;
}

function App() {
  const [screen, setScreen] = useState<Screen>('viewer');
  const [mode, setMode] = useState<Mode>('manual');
  const [{ previous: previousImage, current: currentImage }, dispatchImage] = useReducer(
    imageReducer,
    { previous: null, current: null }
  );
  const [isPollingActive, setIsPollingActive] = useState(false);
  const [showConfigEditor, setShowConfigEditor] = useState(false);
  const [isTestLoading, setIsTestLoading] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isShiftAnimating, setIsShiftAnimating] = useState(false);
  const shiftAnimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevBeforeShiftRef = useRef<ImageMetadata | null>(null);
  const currBeforeShiftRef = useRef<ImageMetadata | null>(null);
  const [initialZoomPercent, setInitialZoomPercent] = useState(100);
  const refreshImagesRef = useRef<(() => Promise<void>) | null>(null);
  const [robotStatus, setRobotStatus] = useState<{ value: number; message: string } | null>(null);
  const [showControlPanel, setShowControlPanel] = useState(false);
  const [showAnalysisPanel, setShowAnalysisPanel] = useState(true);
  const [viewerAnalysisStats, setViewerAnalysisStats] = useState<AnalysisStats | null>(null);
  const [previousAnalysisStats, setPreviousAnalysisStats] = useState<AnalysisStats | null>(null);
  const prevStatsRef = useRef<AnalysisStats | null>(null);       // 애니메이션 중 current stats
  const prevPrevStatsRef = useRef<AnalysisStats | null>(null);   // 애니메이션 중 previous stats

  // Load viewer config on mount
  useEffect(() => {
    const loadViewerConfig = async () => {
      try {
        const config = await api.getViewerConfig();
        setInitialZoomPercent(config.initialZoomPercent);
      } catch (error) {
        console.error('Failed to load viewer config:', error);
      }
    };
    loadViewerConfig();
  }, []);

  const triggerShift = useCallback((newImage: ImageMetadata) => {
    prevBeforeShiftRef.current = previousImage;
    currBeforeShiftRef.current = currentImage;
    dispatchImage({ type: 'shift', newImage });
    setIsShiftAnimating(true);
    if (shiftAnimTimerRef.current) clearTimeout(shiftAnimTimerRef.current);
    shiftAnimTimerRef.current = setTimeout(() => setIsShiftAnimating(false), 1300);
  }, [dispatchImage, previousImage, currentImage]);

  // Handle image events from event system (Auto mode or triggered by Test button)
  const handleImageEvent = useCallback(
    (event: ImageEvent) => {
      // In manual mode, only process events marked as forced (e.g. from test button)
      if (mode !== 'auto' && !event.forced) {
        return;
      }

      if (event.type === '3d') {
        if (event.stats) {
          prevPrevStatsRef.current = previousAnalysisStats;
          prevStatsRef.current = viewerAnalysisStats;
          setPreviousAnalysisStats(viewerAnalysisStats);
          setViewerAnalysisStats(event.stats);
        }

        const newImage: ImageMetadata = {
          filename: event.filename,
          timestamp: event.timestamp,
        };
        triggerShift(newImage);
        console.log('3D image updated:', event.filename);
      }

      // Refresh image list
      if (refreshImagesRef.current) {
        refreshImagesRef.current();
      }
    },
    [mode, triggerShift, previousAnalysisStats, viewerAnalysisStats]
  );

  // Initialize event system
  useImageEvents(handleImageEvent);

  // Handle mode change
  const handleModeChange = useCallback(
    async (newMode: Mode) => {
      if (newMode === mode) return;

      if (newMode === 'auto') {
        // Switch to Auto mode: Start polling
        try {
          await api.startPolling();
          setIsPollingActive(true);
          console.log('Polling started');
        } catch (error) {
          console.error('Failed to start polling:', error);
          alert('Failed to start polling service');
          return;
        }
      } else {
        // Switch to Manual mode: Stop polling
        try {
          await api.stopPolling();
          setIsPollingActive(false);
          console.log('Polling stopped');
        } catch (error) {
          console.error('Failed to stop polling:', error);
        }
      }

      setMode(newMode);
    },
    [mode]
  );

  // Check polling status on mount and when mode changes
  useEffect(() => {
    const checkPollingStatus = async () => {
      try {
        const status = await fetch(
          `${getApiBaseUrl()}/api/events/status`
        ).then((res) => res.json());
        setIsPollingActive(status.running || false);
      } catch (error) {
        console.error('Failed to check polling status:', error);
      }
    };

    checkPollingStatus();
    const interval = setInterval(checkPollingStatus, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [mode]);

  useEffect(() => {
    let isMounted = true;

    const loadRobotStatus = async () => {
      try {
        const status = await api.getRobotStatus();
        if (!isMounted) return;
        setRobotStatus(status.message ? status : null);
      } catch (error) {
        if (!isMounted) return;
        console.error('Failed to load robot status:', error);
      }
    };

    loadRobotStatus();
    const interval = setInterval(loadRobotStatus, 1000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [mode, isPollingActive]);

  // 단축키 처리
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showControlPanel) { setShowControlPanel(false); return; }
        if (isDrawerOpen) setIsDrawerOpen(false);
      }
      if (e.ctrlKey && e.key === 'F1') {
        e.preventDefault();
        setShowControlPanel((v) => !v);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawerOpen, showControlPanel]);

  // Handle image selection in Manual mode (only updates current/right panel)
  const handleImageSelect3d = useCallback((image: ImageMetadata | null) => {
    dispatchImage({ type: 'setCurrent', image });
  }, [dispatchImage]);

  // Handle Test button click - 폴링 에지와 동일한 흐름으로 처리
  const handleTestClick = useCallback(async () => {
    if (isTestLoading) return;

    setIsTestLoading(true);
    try {
      const result = await api.mergeTestImages();

      if (result.success) {
        console.log('3D 이미지 합치기 성공:', result.filename);
      } else {
        console.warn('3D 이미지 합치기 실패:', result.message);
        alert(result.message);
      }

      // Refresh image list
      if (refreshImagesRef.current) {
        await refreshImagesRef.current();
      }
    } catch (error) {
      console.error('이미지 처리 실패:', error);
      alert(
        error instanceof Error ? error.message : '이미지 처리에 실패했습니다.'
      );
    } finally {
      setIsTestLoading(false);
    }
  }, [isTestLoading]);

  // Exhibition 버튼: 공유폴더 이미지 합치기 → ExhibitionViewer 표시
  const [isExhibitionLoading, setIsExhibitionLoading] = useState(false);
  const [analysisStats, setAnalysisStats] = useState<{ coveragePercent: number; depthScore: number; orientationStats: { hubUp: number; flangeUp: number; tilted: number } } | null>(null);

  const handleExhibitionClick = useCallback(async () => {
    if (isExhibitionLoading) return;
    setIsExhibitionLoading(true);
    try {
      const result = await api.demoMerge();
      if (result.success) {
        const newImage: ImageMetadata = {
          filename: result.filename,
          timestamp: new Date(),
        };
        triggerShift(newImage);
        setAnalysisStats(result.stats ?? null);
        setScreen('exhibition');
      } else {
        alert(result.message);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : '이미지 처리에 실패했습니다.');
    } finally {
      setIsExhibitionLoading(false);
    }
  }, [isExhibitionLoading, triggerShift]);

  const toggleDrawer = () => setIsDrawerOpen((v) => !v);

  const handleHome = () => {
    window.location.reload();
  };

  const handleRefreshImages = useCallback(async () => {
    if (refreshImagesRef.current) {
      await refreshImagesRef.current();
    }
  }, []);

  const robotStatusTone = getRobotStatusTone(robotStatus?.value);
  const robotStatusTitle = robotStatus?.message || '상태 미수신';
  return (
    <div className="app">
      {/* Top Menu Bar */}
      <div className="menu-bar">
        <div className="menu-left">
          <button className="icon-btn" onClick={toggleDrawer} title="Menu">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <button className="icon-btn" onClick={handleHome} title="Home">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </button>
          <button
            className="icon-btn"
            onClick={handleRefreshImages}
            title="Refresh"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
        </div>
        <div className="menu-title">3D Bin Picking Image Viewer</div>
        <div className="menu-right">
          <div className="partner-logos">
            <img src={logoDN} alt="DN Solutions" className="partner-logo" />
            <span className="partner-logo-x">×</span>
            <img src={logoFanuc} alt="FANUC" className="partner-logo" />
          </div>
        </div>
      </div>

      {/* Drawer Menu */}
      <div className={`drawer-menu ${isDrawerOpen ? 'open' : ''}`}>
        <button className="close-button" onClick={toggleDrawer}>
          ×
        </button>
        <div className="drawer-header">Image List</div>
        <div className="drawer-content">
          <ImageList
            onImageSelect3d={(image) => {
              handleImageSelect3d(image);
              if (image) {
                setIsDrawerOpen(false);
              }
            }}
            onRefreshRef={(fn) => {
              refreshImagesRef.current = fn;
            }}
          />
        </div>
        <div className="drawer-footer">
          <ModeSelector
            mode={mode}
            onModeChange={handleModeChange}
            isPollingActive={isPollingActive}
            onConfigClick={() => setShowConfigEditor(true)}
          />
        </div>
      </div>

      {/* Drawer Overlay */}
      <div
        className={`drawer-overlay ${isDrawerOpen ? 'visible' : ''}`}
        onClick={toggleDrawer}
      />

      {/* Main Content - Unified Viewer */}
      <div className="main-content">
        <div className={`robot-status-banner ${robotStatusTone}`}>
          <div className="robot-status-banner-label">Robot Operation</div>
          <div className="robot-status-banner-main">
            <span className="robot-status-dot" />
            <span className="robot-status-banner-title">
              {renderRobotStatusMessage(robotStatusTitle)}
            </span>
          </div>
        </div>
        <div className="image-viewer-unified">
          {/* Left half - Current (hidden during animation) */}
          <div className={`viewer-half viewer-left${isShiftAnimating ? ' viewer-hidden' : ''}`}>
            <ImagePreview
              image={currentImage}
              imageType="3d"
              initialZoomPercent={initialZoomPercent}
              footerLabel="Current Vision Image"
            />
            {showAnalysisPanel && viewerAnalysisStats && (
              <div className="viewer-analysis-overlay">
                <AnalysisStatsPanel stats={viewerAnalysisStats} />
              </div>
            )}
          </div>
          {/* Right half - Previous (hidden during animation) */}
          <div className={`viewer-half viewer-right${isShiftAnimating ? ' viewer-hidden' : ''}`}>
            <ImagePreview
              image={previousImage}
              imageType="3d"
              initialZoomPercent={initialZoomPercent}
              footerLabel="Previous Vision Image"
            />
            {showAnalysisPanel && previousAnalysisStats && (
              <div className="viewer-analysis-overlay">
                <AnalysisStatsPanel stats={previousAnalysisStats} />
              </div>
            )}
          </div>

          {/* Animation overlay */}
          {isShiftAnimating && (
            <>
              {prevBeforeShiftRef.current && (
                <div className="anim-zone anim-prev-out">
                  <img className="anim-img" src={api.getImageUrl(prevBeforeShiftRef.current.filename, '3d')} alt="" />
                  {showAnalysisPanel && prevPrevStatsRef.current && (
                    <div className="viewer-analysis-overlay">
                      <AnalysisStatsPanel stats={prevPrevStatsRef.current} />
                    </div>
                  )}
                </div>
              )}
              {currBeforeShiftRef.current && (
                <div className="anim-zone anim-curr-slide">
                  <img className="anim-img" src={api.getImageUrl(currBeforeShiftRef.current.filename, '3d')} alt="" />
                  {showAnalysisPanel && prevStatsRef.current && (
                    <div className="viewer-analysis-overlay">
                      <AnalysisStatsPanel stats={prevStatsRef.current} />
                    </div>
                  )}
                </div>
              )}
              {currentImage && (
                <div className="anim-zone anim-new-fadein">
                  <img className="anim-img" src={api.getImageUrl(currentImage.filename, '3d')} alt="" />
                </div>
              )}
            </>
          )}

        </div>
      </div>

      {/* Control Panel (Ctrl+F1) */}
      {showControlPanel && (
        <div className="control-panel-overlay" onClick={() => setShowControlPanel(false)}>
          <div className="control-panel" onClick={(e) => e.stopPropagation()}>
            <div className="control-panel-header">
              <span className="control-panel-title">Control Panel</span>
              <span className="control-panel-shortcut">Ctrl+F1</span>
              <button className="control-panel-close" onClick={() => setShowControlPanel(false)}>×</button>
            </div>
            <div className="control-panel-body">
              <button
                className={`cp-btn cp-btn-test${isTestLoading ? ' loading' : ''}`}
                onClick={handleTestClick}
                disabled={isTestLoading}
              >
                {isTestLoading ? <><span className="spinner" />처리중...</> : 'Test (이미지 처리)'}
              </button>
              <button
                className={`cp-btn cp-btn-merge${isExhibitionLoading ? ' loading' : ''}`}
                onClick={handleExhibitionClick}
                disabled={isExhibitionLoading}
              >
                {isExhibitionLoading ? <><span className="spinner" />처리중...</> : 'Image Merge'}
              </button>
              <div className="cp-divider" />
              <label className="cp-toggle">
                <input
                  type="checkbox"
                  checked={showAnalysisPanel}
                  onChange={(e) => setShowAnalysisPanel(e.target.checked)}
                />
                <span className="cp-toggle-label">분석 패널 표시</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Config Editor Modal */}
      {showConfigEditor && (
        <PollingConfigEditor
          onClose={() => setShowConfigEditor(false)}
          onSave={() => {
            // Reload polling status after config save
            if (mode === 'auto') {
              // Restart polling if in auto mode
              api.stopPolling().then(() => api.startPolling());
            }
          }}
        />
      )}

      {/* Exhibition Viewer (fullscreen overlay) */}
      {screen === 'exhibition' && (
        <ExhibitionViewer
          onExit={() => setScreen('viewer')}
          latestMergedFilename={currentImage?.filename ?? null}
          analysisStats={analysisStats}
        />
      )}
    </div>
  );
}

export default App;
