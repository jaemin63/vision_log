import { useState, useCallback, useEffect } from 'react';
import './App.css';
import { ImageList } from './components/ImageList';
import { ImagePreview } from './components/ImagePreview';
import { FullscreenOverlay } from './components/FullscreenOverlay';
import { ModeSelector } from './components/ModeSelector';
import { PollingConfigEditor } from './components/PollingConfigEditor';
import { useImageEvents } from './hooks/useImageEvents';
import type { ImageEvent } from './hooks/useImageEvents';
import type { ImageMetadata } from './types/image';
import { api } from './services/api';

type Mode = 'manual' | 'auto';

function App() {
  const [mode, setMode] = useState<Mode>('manual');
  const [selectedImage, setSelectedImage] = useState<ImageMetadata | null>(null);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [eventQueue, setEventQueue] = useState<string[]>([]);
  const [isPollingActive, setIsPollingActive] = useState(false);
  const [showConfigEditor, setShowConfigEditor] = useState(false);
  const [allImages, setAllImages] = useState<ImageMetadata[]>([]);

  // Handle image events from event system (only in Auto mode)
  const handleImageEvent = useCallback(
    (event: ImageEvent) => {
      // Only process events in Auto mode
      if (mode !== 'auto') {
        return;
      }

      // If overlay is closed, open it with the new image
      // If overlay is open, replace the current image (no close/reopen animation)
      setFullscreenImage(event.filename);

      // Add to event queue for potential future use (e.g., showing event history)
      setEventQueue((prev) => [...prev, event.filename].slice(-10)); // Keep last 10 events
    },
    [mode],
  );

  // Initialize event system
  const { emitMockEvent } = useImageEvents(handleImageEvent);

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
        // Switch to Manual mode: Stop polling and close fullscreen
        try {
          await api.stopPolling();
          setIsPollingActive(false);
          setFullscreenImage(null); // Close fullscreen overlay
          console.log('Polling stopped');
        } catch (error) {
          console.error('Failed to stop polling:', error);
        }
      }

      setMode(newMode);
    },
    [mode],
  );

  // Check polling status on mount and when mode changes
  useEffect(() => {
    const checkPollingStatus = async () => {
      try {
        const status = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/events/status`).then(
          (res) => res.json(),
        );
        setIsPollingActive(status.running || false);
      } catch (error) {
        console.error('Failed to check polling status:', error);
      }
    };

    checkPollingStatus();
    const interval = setInterval(checkPollingStatus, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [mode]);

  const handleCloseFullscreen = () => {
    setFullscreenImage(null);
  };

  // Handle image selection in Manual mode
  const handleImageSelect = useCallback(
    (image: ImageMetadata | null) => {
      setSelectedImage(image);
      // In Manual mode, clicking image shows preview only (not fullscreen)
      // User can click Fullscreen button if needed
    },
    [],
  );

  // Handle fullscreen in Manual mode
  const handleManualFullscreen = useCallback(() => {
    if (selectedImage && mode === 'manual') {
      setFullscreenImage(selectedImage.filename);
    }
  }, [selectedImage, mode]);

  return (
    <div className="app">
      {/* Left Panel - Image List */}
      <div className="panel-left">
        <div className="panel-header">3D Bin Picking Image List</div>
        <div className="panel-content">
          <ImageList
            onImageSelect={handleImageSelect}
            onImagesLoaded={setAllImages}
          />
        </div>
        {/* Mode Selector at bottom */}
        <ModeSelector
          mode={mode}
          onModeChange={handleModeChange}
          isPollingActive={isPollingActive}
          onConfigClick={() => setShowConfigEditor(true)}
        />
      </div>

      {/* Right Panel - Image Preview */}
      <div className="panel-right">
        <div className="panel-content">
          <ImagePreview
            image={selectedImage}
            onFullscreenClick={
              mode === 'manual' && selectedImage ? handleManualFullscreen : undefined
            }
          />
        </div>
      </div>

      {/* Fullscreen Overlay */}
      <FullscreenOverlay
        imageFilename={fullscreenImage}
        onClose={handleCloseFullscreen}
        allowClose={true} // Allow closing in both Manual and Auto mode
        allImages={allImages}
        onImageChange={(filename) => setFullscreenImage(filename)}
      />


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
