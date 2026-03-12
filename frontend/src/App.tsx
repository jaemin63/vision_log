import { useState, useCallback, useEffect, useRef } from 'react';
import './App.css';
import { ImageList } from './components/ImageList';
import { ImagePreview } from './components/ImagePreview';
import { ModeSelector } from './components/ModeSelector';
import { PollingConfigEditor } from './components/PollingConfigEditor';
import { useImageEvents } from './hooks/useImageEvents';
import type { ImageEvent } from './hooks/useImageEvents';
import type { ImageMetadata } from './types/image';
import { api } from './services/api';
import logoRms from './assets/logo-rms.png';

type Mode = 'manual' | 'auto';

function App() {
  const [mode, setMode] = useState<Mode>('manual');
  const [selectedImage2d, setSelectedImage2d] = useState<ImageMetadata | null>(
    null
  );
  const [selectedImage3d, setSelectedImage3d] = useState<ImageMetadata | null>(
    null
  );
  const [isPollingActive, setIsPollingActive] = useState(false);
  const [showConfigEditor, setShowConfigEditor] = useState(false);
  const [isTestLoading, setIsTestLoading] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
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

  // Handle image events from event system (only in Auto mode)
  const handleImageEvent = useCallback(
    (event: ImageEvent) => {
      // Only process events in Auto mode
      if (mode !== 'auto') {
        return;
      }

      // Update the appropriate image based on event type
      const newImage: ImageMetadata = {
        filename: event.filename,
        timestamp: event.timestamp,
      };

      if (event.type === '2d') {
        setSelectedImage2d(newImage);
        console.log('2D image updated:', event.filename);
      } else if (event.type === '3d') {
        setSelectedImage3d(newImage);
        console.log('3D image updated:', event.filename);
      }

      // Refresh image list
      if (refreshImagesRef.current) {
        refreshImagesRef.current();
      }
    },
    [mode]
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

  // Handle image selection in Manual mode
  const handleImageSelect2d = useCallback((image: ImageMetadata | null) => {
    setSelectedImage2d(image);
  }, []);

  const handleImageSelect3d = useCallback((image: ImageMetadata | null) => {
    setSelectedImage3d(image);
  }, []);

  // Handle Test button click - merge 3D images and copy 2D image
  const handleTestClick = useCallback(async () => {
    if (isTestLoading) return;

    setIsTestLoading(true);
    try {
      // Run both operations in parallel
      const [result3d, result2d] = await Promise.allSettled([
        api.mergeTestImages(),
        fetch(
          `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/test/copy-2d-image`,
          { method: 'POST' }
        ).then((res) => res.json()),
      ]);

      // Handle 3D result
      if (result3d.status === 'fulfilled' && result3d.value.success) {
        console.log('3D 이미지 합치기 성공:', result3d.value.filename);
        if (mode === 'manual') {
          setSelectedImage3d({
            filename: result3d.value.filename,
            timestamp: new Date(),
          });
        }
      } else {
        console.warn(
          '3D 이미지 합치기 실패:',
          result3d.status === 'fulfilled'
            ? result3d.value.message
            : result3d.reason
        );
      }

      // Handle 2D result
      if (result2d.status === 'fulfilled' && result2d.value.success) {
        console.log('2D 이미지 복사 성공:', result2d.value.filename);
        if (mode === 'manual') {
          setSelectedImage2d({
            filename: result2d.value.filename,
            timestamp: new Date(),
          });
        }
      } else {
        console.warn(
          '2D 이미지 복사 실패:',
          result2d.status === 'fulfilled'
            ? result2d.value.message
            : result2d.reason
        );
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
  }, [isTestLoading, mode]);

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
            onImageSelect2d={(image) => {
              handleImageSelect2d(image);
              if (image) {
                setIsDrawerOpen(false);
              }
            }}
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
              title="이미지 처리 테스트 (2D 복사 + 3D 합치기)"
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

      {/* Main Content - Split Screen */}
      <div className="main-content">
        {/* Left Column - 2D Vision */}
        <div className="image-column column-2d">
          <div className="column-header">2D Vision</div>
          <ImagePreview
            image={selectedImage2d}
            imageType="2d"
            initialZoomPercent={initialZoomPercent}
          />
        </div>

        {/* Divider */}
        <div className="column-divider" />

        {/* Right Column - 3D Vision */}
        <div className="image-column column-3d">
          <div className="column-header">3D Vision</div>
          <ImagePreview
            image={selectedImage3d}
            imageType="3d"
            initialZoomPercent={initialZoomPercent}
          />
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
    </div>
  );
}

export default App;
