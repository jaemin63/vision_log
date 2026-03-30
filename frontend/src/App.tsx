import { useState, useCallback, useEffect, useRef, useReducer } from 'react';
import './App.css';
import { ImageList } from './components/ImageList';
import { ImagePreview } from './components/ImagePreview';
import { ModeSelector } from './components/ModeSelector';
import { PollingConfigEditor } from './components/PollingConfigEditor';
import { ExhibitionViewer } from './components/ExhibitionViewer';
import { useImageEvents } from './hooks/useImageEvents';
import type { ImageEvent } from './hooks/useImageEvents';
import type { ImageMetadata } from './types/image';
import { api } from './services/api';
import logoRms from './assets/logo-rms.png';

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
    [mode, triggerShift]
  );

  // Initialize event system
  const { forceTrigger } = useImageEvents(handleImageEvent);

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
          `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/events/status`
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

  // ESC key to close drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDrawerOpen) {
        setIsDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawerOpen]);

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
        // 폴링 에지와 동일하게 forceTrigger로 current→previous 시프트
        forceTrigger(result.filename);
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
  }, [isTestLoading, forceTrigger]);

  // Exhibition 버튼: 공유폴더 이미지 합치기 → ExhibitionViewer 표시
  const [isExhibitionLoading, setIsExhibitionLoading] = useState(false);

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
          <img src={logoRms} alt="idooRMS+" className="rms-logo" />
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
          {/* Test Button in Sidebar */}
          <div className="test-button-wrapper">
            <button
              className={`test-button-sidebar ${isTestLoading ? 'loading' : ''}`}
              onClick={handleTestClick}
              disabled={isTestLoading}
              title="공유 폴더에서 3D 이미지 가져와 합치기"
            >
              {isTestLoading ? (
                <>
                  <span className="spinner"></span>
                  처리중...
                </>
              ) : (
                'Test (이미지 처리)'
              )}
            </button>
            <button
              className={`test-button-sidebar ${isExhibitionLoading ? 'loading' : ''}`}
              onClick={handleExhibitionClick}
              disabled={isExhibitionLoading}
              title="데모 이미지 합성 후 전시 모드 실행"
            >
              {isExhibitionLoading ? (
                <>
                  <span className="spinner"></span>
                  처리중...
                </>
              ) : (
                'Image Merge'
              )}
            </button>
          </div>
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
        <div className="image-viewer-unified">
          {/* Left half - Previous (hidden during animation) */}
          <div className={`viewer-half viewer-left${isShiftAnimating ? ' viewer-hidden' : ''}`}>
            <ImagePreview image={previousImage} imageType="3d" initialZoomPercent={initialZoomPercent} />
          </div>
          {/* Right half - Current (hidden during animation) */}
          <div className={`viewer-half viewer-right${isShiftAnimating ? ' viewer-hidden' : ''}`}>
            <ImagePreview image={currentImage} imageType="3d" initialZoomPercent={initialZoomPercent} />
          </div>

          {/* Animation overlay */}
          {isShiftAnimating && (
            <>
              {prevBeforeShiftRef.current && (
                <div className="anim-zone anim-prev-out">
                  <img className="anim-img" src={api.getImageUrl(prevBeforeShiftRef.current.filename, '3d')} alt="" />
                </div>
              )}
              {currBeforeShiftRef.current && (
                <div className="anim-zone anim-curr-slide">
                  <img className="anim-img" src={api.getImageUrl(currBeforeShiftRef.current.filename, '3d')} alt="" />
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
        />
      )}
    </div>
  );
}

export default App;
